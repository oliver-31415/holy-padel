import type { HeartRateSample, MotionSample } from "@holy-padel/db";
import type { MatchConfig, TeamValues } from "@holy-padel/scoring";
import type { ReactNode } from "react";
import { useState } from "react";
import { ScrollView } from "react-native";
import { XStack, YStack } from "tamagui";
import { Chip } from "@/components/controls.tsx";
import { SnakeChart } from "@/components/snake-chart.tsx";
import { Card, Display, Label, SectionTitle } from "@/components/ui.tsx";
import { gameCaption } from "@/lib/format.ts";
import type { WindowActivity } from "@/lib/game-activity.ts";
import { activityIn, distanceLabel, gameWindows } from "@/lib/game-activity.ts";
import type { GameSeries } from "@/lib/game-series.ts";
import { colors } from "@/theme/colors.ts";

/** One figure in the per-game activity row. */
function ActivityStat({
  value,
  label,
}: {
  readonly value: string;
  readonly label: string;
}): ReactNode {
  return (
    <YStack flex={1} alignItems="center" gap={2}>
      <Display fontSize={18}>{value}</Display>
      <Label>{label}</Label>
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
      : [{ value: String(activity.avgBpm), label: "Avg bpm" }]),
    ...(activity.steps === undefined
      ? []
      : [{ value: activity.steps.toLocaleString(), label: "Steps" }]),
    ...(activity.meters === undefined
      ? []
      : [{ value: distanceLabel(activity.meters), label: "Distance" }]),
  ];
  if (stats.length === 0) {
    return null;
  }
  return (
    <XStack
      backgroundColor={colors.cardInset}
      borderRadius={20}
      paddingVertical={12}
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
  config,
  names,
}: {
  readonly series: readonly GameSeries[];
  readonly heartRate?: readonly HeartRateSample[];
  readonly motion?: readonly MotionSample[];
  readonly matchStartedAt: number;
  readonly config: MatchConfig;
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
    <Card padding={20} gap={12}>
      <XStack alignItems="center" justifyContent="space-between">
        <SectionTitle>Score race</SectionTitle>
        <Label>
          {[
            gameCaption(config, game.setNumber, game.gameNumber),
            `${String(game.pointsA)}–${String(game.pointsB)}`,
          ]
            .filter((part) => part !== "")
            .join(" · ")}
        </Label>
      </XStack>

      {series.length > 1 && (
        <ScrollView horizontal={true} showsHorizontalScrollIndicator={false}>
          <XStack gap={8}>
            {series.map((entry, entryIndex) => (
              <Chip
                key={`${String(entry.setNumber)}-${String(entry.gameNumber)}`}
                label={`${String(entry.pointsA)}–${String(entry.pointsB)}`}
                selected={entryIndex === index}
                onPress={() => {
                  setSelected(entryIndex);
                }}
              />
            ))}
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
        squash={config.sport === "squash"}
        pickleball={config.sport === "pickleball"}
        {...(heartRate === undefined ? {} : { heartRate })}
      />

      <ActivityRow activity={activity} />

      {heartRateLabel !== undefined && <Label>{heartRateLabel}</Label>}
    </Card>
  );
}
