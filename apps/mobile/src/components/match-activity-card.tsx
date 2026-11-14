import type { HeartRateSample, MotionSample } from "@holy-padel/db";
import type { MatchConfig, TeamId } from "@holy-padel/scoring";
import type { ReactNode } from "react";
import { View, XStack, YStack } from "tamagui";
import { Figure, ZoneBar, zoneColor } from "@/components/insight-parts.tsx";
import { Card, Label, SectionTitle } from "@/components/ui.tsx";
import { effortFloor, timeInZones, ZONES, zoneIndex } from "@/lib/effort.ts";
import { gameCaption } from "@/lib/format.ts";
import { activityIn, distanceLabel, gameWindows, matchWindow } from "@/lib/game-activity.ts";
import type { GameSeries } from "@/lib/game-series.ts";
import { colors } from "@/theme/colors.ts";

const STRIP_HEIGHT = 56;

interface GameEffortBar {
  readonly key: string;
  readonly label: string;
  readonly avgBpm: number | undefined;
  readonly won: boolean;
}

function gameEfforts(
  series: readonly GameSeries[],
  matchStartedAt: number,
  heartRate: readonly HeartRateSample[],
  side: { readonly team: TeamId; readonly config: MatchConfig },
): GameEffortBar[] {
  const { team, config } = side;
  const windows = gameWindows(series, matchStartedAt);
  return series.map((game, index) => {
    const window = windows[index];
    const avgBpm = window === undefined ? undefined : activityIn(window, heartRate, []).avgBpm;
    const won = team === "A" ? game.pointsA > game.pointsB : game.pointsB > game.pointsA;
    return {
      key: `${String(game.setNumber)}-${String(game.gameNumber)}`,
      label: gameCaption(config, game.setNumber, game.gameNumber).toLowerCase(),
      avgBpm,
      won,
    };
  });
}

/**
 * One bar per game, as tall as its average heart rate and shaded by zone, with
 * a dot underneath for the games you won — the hardest game called out above.
 */
function EffortStrip({
  bars,
  maxHr,
}: {
  readonly bars: readonly GameEffortBar[];
  readonly maxHr: number;
}): ReactNode {
  const measured = bars.flatMap((bar) => (bar.avgBpm === undefined ? [] : [bar.avgBpm]));
  if (measured.length < 2) {
    return null;
  }
  const high = Math.max(...measured);
  const floor = effortFloor(measured, maxHr);
  const hardest = bars.find((bar) => bar.avgBpm === high);
  return (
    <YStack gap={8} testID="effort-strip">
      <XStack alignItems="center" justifyContent="space-between">
        <Label fontWeight="600" color={colors.onSurface}>
          Effort by game
        </Label>
        {hardest === undefined ? null : (
          <Label>
            {hardest.label === ""
              ? `Hardest · ${String(high)} bpm`
              : `Hardest ${hardest.label} · ${String(high)} bpm`}
          </Label>
        )}
      </XStack>
      <XStack height={STRIP_HEIGHT} alignItems="flex-end" gap={3}>
        {bars.map((bar) => (
          <View
            key={bar.key}
            flex={1}
            height={
              bar.avgBpm === undefined
                ? 2
                : 6 + ((bar.avgBpm - floor) / Math.max(1, high - floor)) * (STRIP_HEIGHT - 6)
            }
            borderRadius={4}
            backgroundColor={
              bar.avgBpm === undefined
                ? colors.surfaceContainerHighest
                : zoneColor(zoneIndex(bar.avgBpm, maxHr))
            }
          />
        ))}
      </XStack>
      <XStack gap={3}>
        {bars.map((bar) => (
          <XStack key={bar.key} flex={1} justifyContent="center">
            <View
              width={4}
              height={4}
              borderRadius={999}
              backgroundColor={bar.won ? colors.primary : colors.outlineVariant}
            />
          </XStack>
        ))}
      </XStack>
    </YStack>
  );
}

/** The match's time in zones as one bar, with the zone it spent most time in. */
function MatchZones({
  heartRate,
  window,
  maxHr,
}: {
  readonly heartRate: readonly HeartRateSample[];
  readonly window: { readonly from: number; readonly to: number };
  readonly maxHr: number;
}): ReactNode {
  const zones = timeInZones(heartRate, window, maxHr);
  const total = zones.reduce((sum, ms) => sum + ms, 0);
  if (total === 0) {
    return null;
  }
  const top = zones.indexOf(Math.max(...zones));
  return (
    <YStack gap={8} testID="match-zones">
      <XStack alignItems="center" justifyContent="space-between">
        <Label fontWeight="600" color={colors.onSurface}>
          Heart rate zones
        </Label>
        <Label>
          {`Mostly ${(ZONES[top]?.label ?? "").toLowerCase()} · ${String(Math.round(((zones[top] ?? 0) / total) * 100))}%`}
        </Label>
      </XStack>
      <ZoneBar zones={zones} height={12} />
    </YStack>
  );
}

/**
 * The whole match as the watch measured it: heart rate, steps and distance,
 * then effort game by game and the time spent in each heart-rate zone. Hidden
 * when the match wasn't tracked on a watch.
 */
export function MatchActivityCard({
  series,
  matchStartedAt,
  heartRate,
  motion,
  team,
  maxHr,
  config,
}: {
  readonly series: readonly GameSeries[];
  readonly matchStartedAt: number;
  readonly heartRate: readonly HeartRateSample[] | undefined;
  readonly motion: readonly MotionSample[] | undefined;
  readonly team: TeamId;
  readonly maxHr: number;
  readonly config: MatchConfig;
}): ReactNode {
  const window = matchWindow(series, matchStartedAt);
  if (window === undefined) {
    return null;
  }
  const total = activityIn(window, heartRate, motion);
  const figures = [
    ...(total.avgBpm === undefined ? [] : [{ value: String(total.avgBpm), label: "Avg bpm" }]),
    ...(total.maxBpm === undefined ? [] : [{ value: String(total.maxBpm), label: "Peak bpm" }]),
    ...(total.steps === undefined ? [] : [{ value: total.steps.toLocaleString(), label: "Steps" }]),
    ...(total.meters === undefined
      ? []
      : [{ value: distanceLabel(total.meters), label: "Distance" }]),
  ];
  if (figures.length === 0) {
    return null;
  }
  const perGame =
    total.steps === undefined || series.length === 0
      ? undefined
      : Math.round(total.steps / series.length);
  return (
    <Card padding={20} gap={16} testID="match-activity">
      <XStack alignItems="center" justifyContent="space-between">
        <SectionTitle>On your watch</SectionTitle>
        {perGame === undefined ? null : <Label>{`${perGame.toLocaleString()} steps / game`}</Label>}
      </XStack>
      <XStack>
        {figures.map((figure) => (
          <Figure key={figure.label} value={figure.value} label={figure.label} />
        ))}
      </XStack>
      {heartRate === undefined ? null : (
        <>
          <EffortStrip
            bars={gameEfforts(series, matchStartedAt, heartRate, { team, config })}
            maxHr={maxHr}
          />
          <MatchZones heartRate={heartRate} window={window} maxHr={maxHr} />
        </>
      )}
    </Card>
  );
}
