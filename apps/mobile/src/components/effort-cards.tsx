import type { ReactNode } from "react";
import { useState } from "react";
import { Pressable } from "react-native";
import { View, XStack, YStack } from "tamagui";
import { CardHeader, ShareRow, ZoneBar, ZoneLegend } from "@/components/insight-parts.tsx";
import { Body, Card, Display } from "@/components/ui.tsx";
import type { EffortBand } from "@/lib/effort.ts";
import { MIN_EFFORT_GAMES } from "@/lib/effort.ts";
import { distanceLabel } from "@/lib/game-activity.ts";
import type { MaxHr, TrendPoint } from "@/lib/insights.ts";
import { colors, textAlpha } from "@/theme/colors.ts";

/** Win-rate gap between the calmest and hardest games worth calling out. */
const EFFORT_GAP = 10;

function bandLabel(band: EffortBand): string {
  if (band.from === undefined) {
    return `Under ${String(band.to ?? 0)} bpm`;
  }
  return band.to === undefined
    ? `${String(band.from)} bpm and up`
    : `${String(band.from)}–${String(band.to - 1)} bpm`;
}

function share(band: EffortBand | undefined): number {
  return band === undefined || band.of === 0 ? 0 : (band.won / band.of) * 100;
}

type Verdict =
  | "You win more games when your heart rate stays lower"
  | "You win more games when you're working hardest"
  | "Your results hold up however hard you're working";

function effortVerdict(bands: readonly EffortBand[]): Verdict {
  const gap = share(bands[0]) - share(bands.at(-1));
  if (gap >= EFFORT_GAP) {
    return "You win more games when your heart rate stays lower";
  }
  if (gap <= -EFFORT_GAP) {
    return "You win more games when you're working hardest";
  }
  return "Your results hold up however hard you're working";
}

/** Games won at each effort level — your games split into thirds by average heart rate. */
export function EffortCard({
  bands,
  trackedGames,
}: {
  readonly bands: readonly EffortBand[] | undefined;
  readonly trackedGames: number;
}): ReactNode {
  if (trackedGames === 0) {
    return null;
  }
  return (
    <Card
      borderRadius={20}
      paddingVertical={15}
      paddingHorizontal={17}
      gap={14}
      testID="effort-card"
    >
      <CardHeader title="EFFORT VS RESULTS" aside={`${String(trackedGames)} GAMES`} />
      {bands === undefined ? (
        <Body fontSize={12.5} fontWeight="600" color={textAlpha(0.5)}>
          {`Track ${String(Math.max(1, MIN_EFFORT_GAMES - trackedGames))} more games on your watch to compare effort and results.`}
        </Body>
      ) : (
        <>
          <Body fontSize={14} fontWeight="800">
            {effortVerdict(bands)}
          </Body>
          <YStack gap={12}>
            {bands.map((band) => (
              <ShareRow
                key={bandLabel(band)}
                label={bandLabel(band)}
                detail={`${String(band.won)} of ${String(band.of)} games`}
                won={band.won}
                of={band.of}
              />
            ))}
          </YStack>
        </>
      )}
    </Card>
  );
}

type Metric = "bpm" | "steps" | "distance";

const METRICS: readonly { readonly value: Metric; readonly label: string }[] = [
  { value: "bpm", label: "AVG BPM" },
  { value: "steps", label: "STEPS" },
  { value: "distance", label: "DISTANCE" },
];

function metricOf(point: TrendPoint, metric: Metric): number | undefined {
  if (metric === "bpm") {
    return point.avgBpm;
  }
  return metric === "steps" ? point.steps : point.meters;
}

function metricLabel(value: number, metric: Metric): string {
  if (metric === "distance") {
    return distanceLabel(value);
  }
  return metric === "steps" ? Math.round(value).toLocaleString() : String(Math.round(value));
}

function average(values: readonly number[]): number | undefined {
  return values.length === 0
    ? undefined
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** "▲ 4 vs the 4 before", comparing the newer half of the trend with the older. */
function changeLabel(values: readonly number[], metric: Metric): string | undefined {
  const half = Math.floor(values.length / 2);
  const recent = average(values.slice(-half));
  const earlier = average(values.slice(0, values.length - half));
  if (half === 0 || recent === undefined || earlier === undefined) {
    return;
  }
  const delta = recent - earlier;
  const arrow = delta >= 0 ? "▲" : "▼";
  return `${arrow} ${metricLabel(Math.abs(delta), metric)} vs the ${String(values.length - half)} before`;
}

const CHART_HEIGHT = 74;

function TrendBars({
  points,
  metric,
}: {
  readonly points: readonly TrendPoint[];
  readonly metric: Metric;
}): ReactNode {
  const values = points.map((point) => metricOf(point, metric) ?? 0);
  const high = Math.max(...values, 1);
  const low = Math.min(...values.filter((value) => value > 0), high);
  // Leave a floor so small differences still read, without starting at zero.
  const floor = Math.max(0, low - (high - low) * 0.6);
  return (
    <XStack height={CHART_HEIGHT} alignItems="flex-end" gap={6}>
      {points.map((point, index) => {
        const value = values[index] ?? 0;
        const height =
          value === 0 ? 3 : 8 + ((value - floor) / (high - floor)) * (CHART_HEIGHT - 8);
        return (
          <XStack key={point.matchId} flex={1} justifyContent="center" alignItems="flex-end">
            <View
              width="70%"
              maxWidth={26}
              height={height}
              borderRadius={5}
              backgroundColor={point.won ? colors.accent : textAlpha(0.18)}
            />
          </XStack>
        );
      })}
    </XStack>
  );
}

/** The last few watch-tracked matches, one bar each — wins in the highlight colour. */
export function TrendCard({ points }: { readonly points: readonly TrendPoint[] }): ReactNode {
  const available = METRICS.filter((option) =>
    points.some((point) => metricOf(point, option.value) !== undefined),
  );
  const [chosen, setChosen] = useState<Metric>("bpm");
  const metric = available.some((option) => option.value === chosen) ? chosen : available[0]?.value;
  if (metric === undefined || points.length < 2) {
    return null;
  }
  const values = points
    .map((point) => metricOf(point, metric))
    .filter((value): value is number => value !== undefined);
  const latest = values.at(-1);
  const change = changeLabel(values, metric);
  return (
    <Card
      borderRadius={20}
      paddingVertical={15}
      paddingHorizontal={17}
      gap={13}
      testID="trend-card"
    >
      <CardHeader title="TRENDS" aside={`LAST ${String(points.length)} TRACKED`} />
      <XStack gap={6}>
        {available.map((option) => {
          const active = option.value === metric;
          return (
            <Pressable
              key={option.value}
              role="button"
              aria-selected={active}
              testID={`trend-${option.value}`}
              onPress={() => {
                setChosen(option.value);
              }}
            >
              <View
                paddingVertical={6}
                paddingHorizontal={11}
                borderRadius={999}
                backgroundColor={active ? colors.text : "transparent"}
                borderWidth={active ? 0 : 1}
                borderColor={textAlpha(0.16)}
              >
                <Body
                  fontSize={10.5}
                  fontWeight="800"
                  letterSpacing={0.8}
                  color={active ? colors.screen : textAlpha(0.5)}
                >
                  {option.label}
                </Body>
              </View>
            </Pressable>
          );
        })}
      </XStack>
      {latest === undefined ? null : (
        <XStack alignItems="baseline" gap={9}>
          <Display fontSize={26}>{metricLabel(latest, metric)}</Display>
          <Body fontSize={11} fontWeight="700" color={textAlpha(0.45)}>
            {change === undefined ? "last match" : `last match · ${change}`}
          </Body>
        </XStack>
      )}
      <TrendBars points={points} metric={metric} />
      <XStack gap={14}>
        <XStack alignItems="center" gap={5}>
          <View width={8} height={8} borderRadius={2} backgroundColor={colors.accent} />
          <Body fontSize={9.5} fontWeight="800" letterSpacing={1.1} color={textAlpha(0.45)}>
            WON
          </Body>
        </XStack>
        <XStack alignItems="center" gap={5}>
          <View width={8} height={8} borderRadius={2} backgroundColor={textAlpha(0.18)} />
          <Body fontSize={9.5} fontWeight="800" letterSpacing={1.1} color={textAlpha(0.45)}>
            LOST
          </Body>
        </XStack>
      </XStack>
    </Card>
  );
}

function StepButton({
  label,
  onPress,
}: {
  readonly label: string;
  readonly onPress: () => void;
}): ReactNode {
  return (
    <Pressable
      role="button"
      aria-label={label === "+" ? "Raise max heart rate" : "Lower max heart rate"}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
    >
      <View
        width={30}
        height={30}
        borderRadius={15}
        backgroundColor={colors.row}
        alignItems="center"
        justifyContent="center"
      >
        <Body fontSize={16} fontWeight="800">
          {label}
        </Body>
      </View>
    </Pressable>
  );
}

/** Time in each heart-rate zone across tracked matches, with the max heart rate behind it. */
export function ZonesCard({
  zones,
  maxHr,
  onChangeMaxHr,
}: {
  readonly zones: readonly number[] | undefined;
  readonly maxHr: MaxHr;
  readonly onChangeMaxHr: (bpm: number) => void;
}): ReactNode {
  if (zones === undefined) {
    return null;
  }
  return (
    <Card
      borderRadius={20}
      paddingVertical={15}
      paddingHorizontal={17}
      gap={14}
      testID="zones-card"
    >
      <CardHeader title="HEART RATE ZONES" />
      <ZoneBar zones={zones} />
      <ZoneLegend zones={zones} maxHr={maxHr.bpm} />
      <XStack alignItems="center" gap={10} paddingTop={2}>
        <YStack flex={1}>
          <Body fontSize={12.5} fontWeight="800">
            {`Max heart rate ${String(maxHr.bpm)}`}
          </Body>
          <Body fontSize={10.5} fontWeight="600" color={textAlpha(0.45)}>
            {maxHr.estimated ? "Estimated from your highest reading" : "Set by you"}
          </Body>
        </YStack>
        <StepButton
          label="−"
          onPress={() => {
            onChangeMaxHr(maxHr.bpm - 1);
          }}
        />
        <StepButton
          label="+"
          onPress={() => {
            onChangeMaxHr(maxHr.bpm + 1);
          }}
        />
      </XStack>
    </Card>
  );
}
