import { describe, expect, it } from "vitest";
import type { SqlDriver } from "../src/index.ts";
import { loadMatchHeartRate, migrate, saveMatchHeartRate, setSetting } from "../src/index.ts";
import { memoryDriver } from "./memory-driver.ts";

function freshDriver(): SqlDriver {
  const driver = memoryDriver();
  migrate(driver);
  return driver;
}

describe("heart-rate merge on save", () => {
  it("keeps readings from an earlier save that the new one does not cover", () => {
    const driver = freshDriver();
    saveMatchHeartRate(driver, "m1", [
      { t: 1000, bpm: 140 },
      { t: 2000, bpm: 150 },
    ]);
    saveMatchHeartRate(driver, "m1", [
      { t: 3000, bpm: 160 },
      { t: 4000, bpm: 162 },
    ]);
    expect(loadMatchHeartRate(driver, "m1")).toEqual([
      { t: 1000, bpm: 140 },
      { t: 2000, bpm: 150 },
      { t: 3000, bpm: 160 },
      { t: 4000, bpm: 162 },
    ]);
  });

  it("lets the incoming reading win when timestamps collide", () => {
    const driver = freshDriver();
    saveMatchHeartRate(driver, "m1", [
      { t: 1000, bpm: 140 },
      { t: 2000, bpm: 150 },
    ]);
    saveMatchHeartRate(driver, "m1", [
      { t: 2000, bpm: 151 },
      { t: 3000, bpm: 160 },
    ]);
    expect(loadMatchHeartRate(driver, "m1")).toEqual([
      { t: 1000, bpm: 140 },
      { t: 2000, bpm: 151 },
      { t: 3000, bpm: 160 },
    ]);
  });

  it("keeps the union in time order whatever order the samples arrive in", () => {
    const driver = freshDriver();
    saveMatchHeartRate(driver, "m1", [
      { t: 5000, bpm: 170 },
      { t: 1000, bpm: 130 },
    ]);
    saveMatchHeartRate(driver, "m1", [
      { t: 3000, bpm: 150 },
      { t: 2000, bpm: 140 },
    ]);
    const stored = loadMatchHeartRate(driver, "m1");
    expect(stored?.map((s) => s.t)).toEqual([1000, 2000, 3000, 5000]);
  });

  it("caps the merged series at 3000 readings, keeping the earliest", () => {
    const driver = freshDriver();
    const first = Array.from({ length: 2000 }, (_, i) => ({
      t: i * 1000,
      bpm: 120,
    }));
    const second = Array.from({ length: 2000 }, (_, i) => ({
      t: (2000 + i) * 1000,
      bpm: 130,
    }));
    saveMatchHeartRate(driver, "m1", first);
    saveMatchHeartRate(driver, "m1", second);
    const stored = loadMatchHeartRate(driver, "m1");
    expect(stored).toHaveLength(3000);
    expect(stored?.[0]).toEqual({ t: 0, bpm: 120 });
    expect(stored?.at(-1)).toEqual({ t: 2999 * 1000, bpm: 130 });
  });

  it("drops implausible incoming readings without touching what is stored", () => {
    const driver = freshDriver();
    saveMatchHeartRate(driver, "m1", [{ t: 1000, bpm: 140 }]);
    saveMatchHeartRate(driver, "m1", [
      { t: 2000, bpm: 900 },
      { t: Number.NaN, bpm: 120 },
      { t: 3000, bpm: 10 },
    ]);
    expect(loadMatchHeartRate(driver, "m1")).toEqual([{ t: 1000, bpm: 140 }]);
  });

  it("treats an unreadable stored blob as empty when merging", () => {
    const driver = freshDriver();
    setSetting(driver, "hr:m1", "not json");
    saveMatchHeartRate(driver, "m1", [{ t: 1000, bpm: 140 }]);
    expect(loadMatchHeartRate(driver, "m1")).toEqual([{ t: 1000, bpm: 140 }]);
  });
});
