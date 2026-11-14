import type { Outcome } from "@holy-padel/db";
import type { ReactNode } from "react";
import { useState } from "react";
import { View, XStack, YStack } from "tamagui";
import { Chip, IconButton } from "@/components/controls.tsx";
import { CardHeader, ShareRow, ZoneBar, ZoneLegend } from "@/components/insight-parts.tsx";
import { Body, Card, Display, Label, LegendKey } from "@/components/ui.tsx";
import type { EffortBand } from "@/lib/effort.ts";
import { MIN_EFFORT_GAMES } from "@/lib/effort.ts";
import { distanceLabel } from "@/lib/game-activity.ts";
import type { MaxHr, TrendPoint } from "@/lib/insights.ts";
import { colors } from "@/theme/colors.ts";

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
    <Card padding={20} gap={16} testID="effort-card">
      <CardHeader title="Effort vs results" aside={`${String(trackedGames)} games`} />
      {bands === undefined ? (
        <Body fontSize={14} lineHeight={20} color={colors.onSurfaceVariant}>
          {`Track ${String(Math.max(1, MIN_EFFORT_GAMES - trackedGames))} more games on your watch to compare effort and results.`}
        </Body>
      ) : (
        <>
          <Body fontSize={16} fontWeight="500">
            {effortVerdict(bands)}
          </Body>
          <YStack gap={16}>
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
  { value: "bpm", label: "Avg bpm" },
  { value: "steps", label: "Steps" },
  { value: "distance", label: "Distance" },
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

const CHART_HEIGHT = 96;

/** Won is the highlight, a level early stop a neutral mid-tone, a loss the faintest. */
function barColor(outcome: Outcome): string {
  if (outcome === "won") {
    return colors.primary;
  }
  return outcome === "drew" ? colors.outline : colors.outlineVariant;
}

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
    <XStack height={CHART_HEIGHT} alignItems="flex-end" gap={8}>
      {points.map((point, index) => {
        const value = values[index] ?? 0;
        const height =
          value === 0 ? 8 : 24 + ((value - floor) / (high - floor)) * (CHART_HEIGHT - 24);
        return (
          <XStack key={point.matchId} flex={1} justifyContent="center" alignItems="flex-end">
            <View
              width="70%"
              maxWidth={40}
              height={height}
              borderRadius={12}
              backgroundColor={barColor(point.outcome)}
            />
          </XStack>
        );
      })}
    </XStack>
  );
}

/** The last few watch-tracked matches, one bar each — wins in the highlight colour, draws neutral. */
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
    <Card padding={20} gap={16} testID="trend-card">
      <CardHeader title="Trends" aside={`Last ${String(points.length)} tracked`} />
      <XStack gap={8}>
        {available.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            selected={option.value === metric}
            aria-selected={option.value === metric}
            testID={`trend-${option.value}`}
            onPress={() => {
              setChosen(option.value);
            }}
          />
        ))}
      </XStack>
      {latest === undefined ? null : (
        <XStack alignItems="baseline" gap={8}>
          <Display fontSize={32}>{metricLabel(latest, metric)}</Display>
          <Label>{change === undefined ? "last match" : `last match · ${change}`}</Label>
        </XStack>
      )}
      <TrendBars points={points} metric={metric} />
      <XStack gap={16}>
        <LegendKey label="Won" color={colors.primary} />
        <LegendKey label="Lost" color={colors.outlineVariant} />
        <LegendKey label="Drew" color={colors.outline} />
      </XStack>
    </Card>
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
    <Card padding={20} gap={16} testID="zones-card">
      <CardHeader title="Heart rate zones" />
      <ZoneBar zones={zones} />
      <ZoneLegend zones={zones} maxHr={maxHr.bpm} />
      <XStack alignItems="center" gap={8}>
        <YStack flex={1}>
          <Body fontSize={16}>{`Max heart rate ${String(maxHr.bpm)}`}</Body>
          <Label>{maxHr.estimated ? "Estimated from your highest reading" : "Set by you"}</Label>
        </YStack>
        <IconButton
          icon="remove"
          label="Lower max heart rate"
          variant="tonal"
          onPress={() => {
            onChangeMaxHr(maxHr.bpm - 1);
          }}
        />
        <IconButton
          icon="add"
          label="Raise max heart rate"
          variant="tonal"
          onPress={() => {
            onChangeMaxHr(maxHr.bpm + 1);
          }}
        />
      </XStack>
    </Card>
  );
}
