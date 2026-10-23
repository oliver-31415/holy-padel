import type { HeartRateSample, MotionSample } from "@holy-padel/db";
import type { TeamValues } from "@holy-padel/scoring";
import type { ReactNode } from "react";
import { useState } from "react";
import { ScrollView } from "react-native";
import { XStack, YStack } from "tamagui";
import { SnakeChart } from "@/components/snake-chart.tsx";
import { Body, Card, Display, Overline } from "@/components/ui.tsx";
import type { WindowActivity } from "@/lib/game-activity.ts";
import { activityIn, distanceLabel, gameWindows } from "@/lib/game-activity.ts";
import type { GameSeries } from "@/lib/game-series.ts";
import { colors, textAlpha } from "@/theme/colors.ts";

/** One figure in the per-game activity row. */
function ActivityStat({
  value,
  label,
}: {
  readonly value: string;
  readonly label: string;
}): ReactNode {
  return (
    <YStack flex={1} alignItems="center" gap={1}>
      <Display fontSize={17}>{value}</Display>
      <Body fontSize={8.5} fontWeight="800" letterSpacing={1.2} color={textAlpha(0.4)}>
        {label}
      </Body>
    </YStack>
  );
}

/**
 * Average heart rate, steps and distance for the selected game — whatever was
 * measured. No peak here: the chart's bpm axis already shows the game's range,
 * and the match card below carries the match peak.
 */
function ActivityRow({ activity }: { readonly activity: WindowActivity }): ReactNode {
  const stats: { readonly value: string; readonly label: string }[] = [
    ...(activity.avgBpm === undefined
      ? []
      : [{ value: String(activity.avgBpm), label: "AVG BPM" }]),
    ...(activity.steps === undefined
      ? []
      : [{ value: activity.steps.toLocaleString(), label: "STEPS" }]),
    ...(activity.meters === undefined
      ? []
      : [{ value: distanceLabel(activity.meters), label: "DISTANCE" }]),
  ];
  if (stats.length === 0) {
    return null;
  }
  return (
    <XStack
      backgroundColor={colors.row}
      borderRadius={14}
      paddingVertical={10}
      testID="game-activity"
    >
      {stats.map((stat) => (
        <ActivityStat key={stat.label} value={stat.value} label={stat.label} />
      ))}
    </XStack>
  );
}

/**
 * The score-race card: pick a game, see who was ahead point by point, with
 * the watch-tracked heart rate overlaid and the game's heart rate, steps and
 * distance underneath when the match was tracked.
 */
export function ScoreRaceCard({
  series,
  heartRate,
  motion,
  matchStartedAt,
  sport,
  names,
}: {
  readonly series: readonly GameSeries[];
  readonly heartRate?: readonly HeartRateSample[];
  readonly motion?: readonly MotionSample[];
  readonly matchStartedAt: number;
  readonly sport?: "padel" | "squash" | "pickleball" | undefined;
  /** Team names for the scrub readout's server. */
  readonly names: TeamValues<string>;
}): ReactNode {
  const [selected, setSelected] = useState<number | undefined>(undefined);
  if (series.length === 0) {
    return null;
  }
  const index = selected === undefined || selected >= series.length ? series.length - 1 : selected;
  const game = series[index];
  const window = gameWindows(series, matchStartedAt)[index];
  if (game === undefined || window === undefined) {
    return null;
  }
  const activity = activityIn(window, heartRate, motion);
  const heartRateLabel =
    heartRate === undefined || heartRate.length === 0
      ? "Heart rate appears for matches tracked on your watch"
      : undefined;

  return (
    <Card borderRadius={20} paddingVertical={15} paddingHorizontal={17} gap={11}>
      <XStack alignItems="center" justifyContent="space-between">
        <Overline>SCORE RACE</Overline>
        <Body fontSize={10} fontWeight="800" letterSpacing={1.2} color={textAlpha(0.4)}>
          {sport === "squash" || sport === "pickleball"
            ? `GAME ${String(game.setNumber)} · ${String(game.pointsA)}–${String(game.pointsB)}`
            : `SET ${String(game.setNumber)} · GAME ${String(game.gameNumber)} · ${String(game.pointsA)}–${String(game.pointsB)}`}
        </Body>
      </XStack>

      {series.length > 1 && (
        <ScrollView horizontal={true} showsHorizontalScrollIndicator={false}>
          <XStack gap={7}>
            {series.map((entry, entryIndex) => {
              const active = entryIndex === index;
              return (
                <XStack
                  key={`${String(entry.setNumber)}-${String(entry.gameNumber)}`}
                  paddingVertical={6}
                  paddingHorizontal={11}
                  borderRadius={999}
                  backgroundColor={active ? colors.text : "transparent"}
                  borderWidth={active ? 0 : 1}
                  borderColor={textAlpha(0.16)}
                  pressStyle={{ opacity: 0.8 }}
                  role="button"
                  onPress={() => {
                    setSelected(entryIndex);
                  }}
                >
                  <Body
                    fontSize={10.5}
                    fontWeight="800"
                    letterSpacing={0.8}
                    color={active ? colors.screen : textAlpha(0.5)}
                  >
                    {`${String(entry.pointsA)}–${String(entry.pointsB)}`}
                  </Body>
                </XStack>
              );
            })}
          </XStack>
        </ScrollView>
      )}

      <SnakeChart
        key={`${String(game.setNumber)}-${String(game.gameNumber)}`}
        steps={game.steps}
        startedAt={window.from}
        endedAt={window.to}
        pointsA={game.pointsA}
        pointsB={game.pointsB}
        names={names}
        squash={sport === "squash"}
        pickleball={sport === "pickleball"}
        {...(heartRate === undefined ? {} : { heartRate })}
      />

      <ActivityRow activity={activity} />

      {heartRateLabel !== undefined && (
        <Body fontSize={10.5} fontWeight="600" color={textAlpha(0.4)}>
          {heartRateLabel}
        </Body>
      )}
    </Card>
  );
}
