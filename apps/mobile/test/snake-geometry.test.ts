import { describe, expect, it } from "vitest";
import type { GameSeriesStep } from "../src/lib/game-series.ts";
import {
  endLabelSlot,
  handOutMarks,
  leadPaths,
  leadRange,
  leadScale,
  leadSegments,
  toneOf,
} from "../src/lib/snake-geometry.ts";

/** One unit of time is one pixel; one unit of lead is one pixel above zero. */
const xOf = (t: number): number => t / 1000;
const yOf = (lead: number): number => -lead;

function step(t: number, lead: number, winner: "A" | "B", handOut = false): GameSeriesStep {
  return { t, lead, winner, handOut };
}

function pathsFor(steps: readonly GameSeriesStep[], startedAt = 0, endX = 10) {
  return leadPaths({ steps, startedAt, endX, xOf, yOf, zeroY: 0 });
}

describe("toneOf", () => {
  it("maps the sign of the lead to a side of the zero line", () => {
    expect(toneOf(2)).toBe("A");
    expect(toneOf(-1)).toBe("B");
    expect(toneOf(0)).toBe("even");
  });
});

describe("leadPaths", () => {
  it("draws a level line from the origin when nobody has scored", () => {
    const paths = pathsFor([]);
    expect(paths).toHaveLength(1);
    expect(paths[0]?.tone).toBe("even");
    expect(paths[0]?.d).toBe("M0.0,0.0 L10.0,0.0");
  });

  it("starts the first stretch at the origin, not at the first point", () => {
    const paths = pathsFor([step(5000, 1, "A")]);
    // The level stretch from the window start to the first point is its own
    // even-toned path, so the line grows out of zero rather than appearing.
    expect(paths[0]).toMatchObject({ tone: "even", d: "M0.0,0.0 L5.0,0.0" });
  });

  it("groups edges by tone, with the riser taking the tone it lands on", () => {
    const paths = pathsFor([step(5000, 1, "A")]);
    expect(paths.map((path) => path.tone)).toEqual(["even", "A"]);
    expect(paths[1]?.d).toBe("M5.0,0.0 L5.0,-1.0 L10.0,-1.0");
  });

  it("takes the riser back to zero in the tone it left, not in even", () => {
    const paths = pathsFor([step(1000, 1, "A"), step(2000, 0, "B")]);
    expect(paths.map((path) => path.tone)).toEqual(["even", "A", "even"]);
    expect(paths[1]?.d).toBe("M1.0,0.0 L1.0,-1.0 L2.0,-1.0 L2.0,0.0");
  });

  it("colours a stretch behind zero as team B", () => {
    const paths = pathsFor([step(1000, -2, "B")]);
    expect(paths.map((path) => path.tone)).toEqual(["even", "B"]);
    expect(paths[1]?.d).toBe("M1.0,0.0 L1.0,2.0 L10.0,2.0");
  });

  it("extends a hand-out flat, with no extra riser", () => {
    const paths = pathsFor([step(1000, 1, "A"), step(2000, 1, "B", true)]);
    const ahead = paths.find((path) => path.tone === "A");
    expect(ahead?.d).toBe("M1.0,0.0 L1.0,-1.0 L2.0,-1.0 L10.0,-1.0");
  });

  it("closes each area down to the zero line", () => {
    const paths = pathsFor([step(1000, 1, "A")]);
    const ahead = paths.find((path) => path.tone === "A");
    expect(ahead?.area).toBe("M1.0,0.0 L1.0,-1.0 L10.0,-1.0 L10.0,0.0 L1.0,0.0 Z");
  });

  it("starts from the given window start when it is not the first point", () => {
    const paths = pathsFor([step(5000, 1, "A")], 2000);
    expect(paths[0]?.d).toBe("M2.0,0.0 L5.0,0.0");
  });
});

describe("handOutMarks", () => {
  it("marks only hand-outs, in the colour of the team that won the rally", () => {
    const steps = [
      step(1000, 1, "A"),
      step(2000, 1, "B", true),
      step(3000, 0, "B"),
      step(4000, -1, "B"),
    ];
    expect(handOutMarks(steps, xOf, yOf)).toEqual([{ key: "h1", x: 2, y: -1, team: "B" }]);
  });

  it("is empty when nothing was a hand-out (padel, PAR)", () => {
    const steps = [step(1000, 1, "A"), step(2000, 2, "A")];
    expect(handOutMarks(steps, xOf, yOf)).toEqual([]);
  });
});

describe("leadSegments", () => {
  it("breaks the stepped line into its straight pieces, from the origin", () => {
    // Zero sits at y=50 here, so no level point comes out as -0.
    const segments = leadSegments({
      steps: [step(1000, 1, "A")],
      startedAt: 0,
      endX: 10,
      xOf,
      yOf: (lead) => 50 - lead * 10,
    });
    expect(segments).toEqual([
      { x1: 0, y1: 50, x2: 1, y2: 50 },
      { x1: 1, y1: 50, x2: 1, y2: 40 },
      { x1: 1, y1: 40, x2: 10, y2: 40 },
    ]);
  });
});

describe("leadRange", () => {
  it("is minimal and symmetric when a game never leaves zero", () => {
    expect(leadRange([])).toEqual({ ahead: 0.75, behind: 0.75 });
    expect(leadRange([0, 0])).toEqual({ ahead: 0.75, behind: 0.75 });
  });

  it("reaches only as far as the lead actually went, plus headroom", () => {
    const range = leadRange([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(range.ahead).toBeCloseTo(12.1);
    expect(range.behind).toBeCloseTo(1.1);
  });

  it("always includes zero, and keeps the side the lead never reached small", () => {
    const range = leadRange([3, -2, 0]);
    expect(range.ahead).toBeCloseTo(3.75);
    expect(range.behind).toBeCloseTo(2.75);
  });
});

describe("leadScale", () => {
  it("places zero where the range puts it and maps each point of lead to y", () => {
    const scale = leadScale({ ahead: 4, behind: 1 }, 0, 50);
    expect(scale.zeroY).toBe(40);
    expect(scale.yOf(4)).toBe(0);
    expect(scale.yOf(-1)).toBe(50);
  });
});

describe("endLabelSlot", () => {
  // A plot 100 tall with zero at y=50 and one point of lead per 10 pixels.
  const scaledY = (lead: number): number => 50 - lead * 10;
  const zeroLine = { x1: 0, y1: 50, x2: 100, y2: 50 };

  function labelFor(steps: readonly GameSeriesStep[], bottomLimit = 100) {
    const endLead = steps.at(-1)?.lead ?? 0;
    return endLabelSlot({
      endX: 100,
      endY: scaledY(endLead),
      text: "1–0",
      clearance: 12,
      segments: [...leadSegments({ steps, startedAt: 0, endX: 100, xOf, yOf: scaledY }), zeroLine],
      topLimit: 0,
      bottomLimit,
    });
  }

  it("sits above the dot for an A-lead ending, clear of the line", () => {
    expect(labelFor([step(1000, 1, "A")])).toEqual({ x: 100, y: 28 });
  });

  it("sits below the dot for a B-lead ending, clear of the zero line", () => {
    expect(labelFor([step(1000, -1, "B")])).toEqual({ x: 100, y: 79.5 });
  });

  it("sits above a game that ends level on zero", () => {
    expect(labelFor([])).toEqual({ x: 100, y: 38 });
  });

  it("falls back to above when neither side has room", () => {
    expect(labelFor([step(1000, -1, "B")], 70)).toEqual({ x: 100, y: 48 });
  });

  it("moves to the left of the dot when the last rally is close to the end", () => {
    const slot = labelFor([step(10_000, 1, "A"), step(95_000, 2, "A")]);
    expect(slot).toEqual({ x: 88, y: 33.75 });
  });
});
