import type { HeartRateSample } from "@holy-padel/db";
import type { ReactNode } from "react";
import { useId, useState } from "react";
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient,
  Path,
  Rect,
  Stop,
  // Imported as `Text` (not aliased) so the raw-text lint recognises label children.
  Text,
} from "react-native-svg";
import { View, XStack } from "tamagui";
import { Body } from "@/components/ui.tsx";
import type { BpmScale, HeartRateSpan } from "@/lib/game-activity.ts";
import { bpmScale, heartRateRuns } from "@/lib/game-activity.ts";
import type { GameSeriesStep } from "@/lib/game-series.ts";
import { colors, textAlpha } from "@/theme/colors.ts";

const CHART_HEIGHT = 176;
const PAD_X = 12;
/** Right gutter for the bpm axis labels, kept on every game once the match has any heart rate. */
const HR_AXIS = 34;
const PAD_TOP = 16;
/** Room under the plot for the time axis. */
const PAD_BOTTOM = 22;
const PLOT_BOTTOM = CHART_HEIGHT - PAD_BOTTOM;
const ZERO_Y = (PAD_TOP + PLOT_BOTTOM) / 2;
const HALF = (PLOT_BOTTOM - PAD_TOP) / 2;
const LINE_WIDTH = 2.75;

interface Point {
  readonly x: number;
  readonly y: number;
}

interface Run {
  readonly key: string;
  readonly x1: number;
  readonly x2: number;
  readonly lead: number;
}

interface Riser {
  readonly key: string;
  readonly x: number;
  readonly from: number;
  readonly to: number;
}

interface Geometry {
  readonly xOf: (t: number) => number;
  readonly yOf: (lead: number) => number;
  readonly maxLead: number;
}

const leadColor = (lead: number): string => (lead >= 0 ? colors.accent : colors.teamB);

/** "3:07" — minutes and seconds into the game. */
function clockLabel(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(total / 60))}:${String(total % 60).padStart(2, "0")}`;
}

/** Horizontal runs (the lead held between rallies) and the risers between them. */
function runsOf(
  steps: readonly GameSeriesStep[],
  xOf: (t: number) => number,
  endX: number,
): { readonly runs: Run[]; readonly risers: Riser[] } {
  const runs: Run[] = [];
  const risers: Riser[] = [];
  steps.forEach((step, index) => {
    const next = steps[index + 1];
    const x1 = xOf(step.t);
    runs.push({
      key: `r${String(index)}`,
      x1,
      x2: next === undefined ? endX : xOf(next.t),
      lead: step.lead,
    });
    if (next !== undefined && next.lead !== step.lead) {
      risers.push({ key: `v${String(index)}`, x: xOf(next.t), from: step.lead, to: next.lead });
    }
  });
  return { runs, risers };
}

/**
 * A smooth curve through the points (Catmull-Rom as cubic Béziers), so the
 * heart rate reads as a pulse rather than a jagged polyline.
 */
function smoothPath(points: readonly Point[]): string {
  const [start] = points;
  if (start === undefined) {
    return "";
  }
  let d = `M${start.x.toFixed(1)},${start.y.toFixed(1)}`;
  for (let index = 0; index + 1 < points.length; index += 1) {
    const p1 = points[index];
    const p2 = points[index + 1];
    if (p1 !== undefined && p2 !== undefined) {
      const p0 = points[index - 1] ?? p1;
      const p3 = points[index + 2] ?? p2;
      const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
      const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
      d += ` C${c1.x.toFixed(1)},${c1.y.toFixed(1)} ${c2.x.toFixed(1)},${c2.y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
    }
  }
  return d;
}

/** Dashed guides at the deepest lead each way, labelled with the margin. */
function LeadGuides({
  geometry,
  plotRight,
}: {
  readonly geometry: Geometry;
  readonly plotRight: number;
}): ReactNode {
  const { yOf, maxLead } = geometry;
  return (
    <>
      {[maxLead, -maxLead].map((lead) => (
        <Line
          key={`g${String(lead)}`}
          x1={PAD_X}
          y1={yOf(lead)}
          x2={plotRight}
          y2={yOf(lead)}
          stroke={textAlpha(0.1)}
          strokeWidth={1}
          strokeDasharray="3 5"
        />
      ))}
      <Text x={PAD_X} y={yOf(maxLead) - 4} fontSize={9} fontWeight="700" fill={colors.accentOnCard}>
        {`A +${String(maxLead)}`}
      </Text>
      <Text x={PAD_X} y={yOf(-maxLead) - 4} fontSize={9} fontWeight="700" fill={textAlpha(0.45)}>
        {`B +${String(maxLead)}`}
      </Text>
    </>
  );
}

/** The bpm axis down the right gutter: round-number ticks, dotted guides, unit. */
function BpmAxis({
  scale,
  yOf,
  plotRight,
  width,
}: {
  readonly scale: BpmScale;
  readonly yOf: (bpm: number) => number;
  readonly plotRight: number;
  readonly width: number;
}): ReactNode {
  return (
    <>
      {scale.ticks.map((tick) => (
        <G key={`b${String(tick)}`}>
          <Line
            x1={PAD_X}
            y1={yOf(tick)}
            x2={plotRight}
            y2={yOf(tick)}
            stroke={colors.danger}
            strokeOpacity={0.12}
            strokeWidth={1}
            strokeDasharray="1 4"
          />
          <Text
            x={width - 4}
            y={yOf(tick) + 3}
            fontSize={9}
            fontWeight="700"
            fill={colors.danger}
            fillOpacity={0.8}
            textAnchor="end"
          >
            {String(tick)}
          </Text>
        </G>
      ))}
      <Text
        x={width - 4}
        y={PAD_TOP - 6}
        fontSize={8}
        fontWeight="800"
        fill={colors.danger}
        fillOpacity={0.8}
        textAnchor="end"
      >
        BPM
      </Text>
    </>
  );
}

/**
 * The heart-rate curve on its own bpm axis. Measured stretches are solid with a
 * soft fill; a bridged gap is a faint dashed line with no fill; a lone reading
 * is a dot.
 */
function HeartRateLayer({
  spans,
  xOf,
  scale,
  plotRight,
  width,
}: {
  readonly spans: readonly HeartRateSpan[];
  readonly xOf: (t: number) => number;
  readonly scale: BpmScale;
  readonly plotRight: number;
  readonly width: number;
}): ReactNode {
  const gradientId = `hr-${useId().replaceAll(/[^a-zA-Z0-9]/gu, "")}`;
  const yOf = (bpm: number): number =>
    PAD_TOP +
    (1 - (bpm - scale.min) / Math.max(1, scale.max - scale.min)) * (PLOT_BOTTOM - PAD_TOP);
  return (
    <>
      <BpmAxis scale={scale} yOf={yOf} plotRight={plotRight} width={width} />
      <Defs>
        <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors.danger} stopOpacity={0.16} />
          <Stop offset="1" stopColor={colors.danger} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      {spans.map((span) => {
        const points = span.points.map((sample) => ({ x: xOf(sample.t), y: yOf(sample.bpm) }));
        const [first] = points;
        const last = points.at(-1);
        const key = `hr${String(span.points[0]?.t ?? 0)}`;
        if (first === undefined || last === undefined) {
          return null;
        }
        if (points.length === 1) {
          return (
            <Circle
              key={key}
              cx={first.x}
              cy={first.y}
              r={2.5}
              fill={colors.danger}
              fillOpacity={0.85}
            />
          );
        }
        const curve = smoothPath(points);
        if (span.bridged) {
          return (
            <Path
              key={key}
              d={curve}
              fill="none"
              stroke={colors.danger}
              strokeWidth={1.5}
              strokeOpacity={0.35}
              strokeDasharray="3 3"
              strokeLinecap="round"
            />
          );
        }
        return (
          <G key={key}>
            <Path
              d={`${curve} L${last.x.toFixed(1)},${PLOT_BOTTOM} L${first.x.toFixed(1)},${PLOT_BOTTOM} Z`}
              fill={`url(#${gradientId})`}
            />
            <Path
              d={curve}
              fill="none"
              stroke={colors.danger}
              strokeWidth={1.75}
              strokeOpacity={0.85}
              strokeLinecap="round"
            />
          </G>
        );
      })}
    </>
  );
}

/** The lead itself: shaded area to the zero line, step line, serve ticks, end dot. */
function LeadLayer({
  steps,
  geometry,
  endX,
}: {
  readonly steps: readonly GameSeriesStep[];
  readonly geometry: Geometry;
  readonly endX: number;
}): ReactNode {
  const { xOf, yOf } = geometry;
  const { runs, risers } = runsOf(steps, xOf, endX);
  const last = steps.at(-1);
  const lastX = last === undefined ? undefined : xOf(last.t);
  return (
    <>
      {runs.map((run) =>
        run.lead === 0 ? null : (
          <Rect
            key={`${run.key}f`}
            x={run.x1}
            y={Math.min(yOf(run.lead), ZERO_Y)}
            width={Math.max(0, run.x2 - run.x1)}
            height={Math.abs(yOf(run.lead) - ZERO_Y)}
            fill={leadColor(run.lead)}
            fillOpacity={0.14}
          />
        ),
      )}
      <Line x1={PAD_X} y1={ZERO_Y} x2={endX} y2={ZERO_Y} stroke={textAlpha(0.18)} strokeWidth={1} />
      {runs.map((run) => (
        <Line
          key={run.key}
          x1={run.x1}
          y1={yOf(run.lead)}
          x2={run.x2}
          y2={yOf(run.lead)}
          stroke={run.lead === 0 ? textAlpha(0.35) : leadColor(run.lead)}
          strokeWidth={LINE_WIDTH}
          strokeLinecap="round"
        />
      ))}
      {risers.map((riser) => (
        <Line
          key={riser.key}
          x1={riser.x}
          y1={yOf(riser.from)}
          x2={riser.x}
          y2={yOf(riser.to)}
          stroke={leadColor(riser.from === 0 ? riser.to : riser.from)}
          strokeWidth={LINE_WIDTH}
          strokeLinecap="round"
        />
      ))}
      {steps.map((step, index) =>
        step.handOut && index > 0 ? (
          <Line
            key={`h${String(index)}`}
            x1={xOf(step.t)}
            y1={ZERO_Y - 4}
            x2={xOf(step.t)}
            y2={ZERO_Y + 4}
            stroke={colors.text}
            strokeOpacity={0.55}
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        ) : null,
      )}
      {last === undefined || lastX === undefined ? null : (
        <>
          <Circle
            cx={lastX}
            cy={yOf(last.lead)}
            r={9}
            fill={leadColor(last.lead)}
            fillOpacity={0.2}
          />
          <Circle cx={lastX} cy={yOf(last.lead)} r={4.5} fill={leadColor(last.lead)} />
        </>
      )}
    </>
  );
}

function LegendDot({
  color,
  label,
  square,
}: {
  readonly color: string;
  readonly label: string;
  readonly square?: boolean;
}): ReactNode {
  return (
    <XStack alignItems="center" gap={5}>
      <View
        width={square === true ? 3 : 8}
        height={8}
        borderRadius={square === true ? 1 : 4}
        backgroundColor={color}
      />
      <Body fontSize={9.5} fontWeight="700" color={textAlpha(0.5)}>
        {label}
      </Body>
    </XStack>
  );
}

/**
 * The score-race "snake": who led, by how much, rally by rally through one
 * game, over the game's real time — with the watch-tracked heart rate as a
 * smooth curve on its own scale behind it.
 */
export function SnakeChart({
  steps,
  startedAt,
  endedAt,
  heartRate,
  width: fixedWidth,
}: {
  readonly steps: readonly GameSeriesStep[];
  /** Start of the plotted window (the end of the previous game). */
  readonly startedAt: number;
  readonly endedAt: number;
  readonly heartRate?: readonly HeartRateSample[];
  readonly width?: number;
}): ReactNode {
  const [measured, setMeasured] = useState(0);
  const width = fixedWidth ?? measured;
  const span = Math.max(1, endedAt - startedAt);
  const spans = heartRateRuns(heartRate ?? [], { from: startedAt, to: endedAt });
  const scale = bpmScale(spans.flatMap((run) => run.points.map((sample) => sample.bpm)));
  // Once the match has any heart rate, every game keeps the bpm gutter so the plots line up.
  const hasHeartRate = (heartRate?.length ?? 0) > 0;
  const plotRight = width - (hasHeartRate ? HR_AXIS : PAD_X);
  const plotWidth = Math.max(0, plotRight - PAD_X);
  const maxLead = Math.max(3, ...steps.map((step) => Math.abs(step.lead)));
  const geometry: Geometry = {
    xOf: (t) => PAD_X + Math.min(1, Math.max(0, (t - startedAt) / span)) * plotWidth,
    yOf: (lead) => ZERO_Y - (lead / maxLead) * HALF,
    maxLead,
  };
  const endX = plotRight;

  return (
    <View
      width={fixedWidth ?? "100%"}
      onLayout={(event) => {
        if (fixedWidth === undefined) {
          setMeasured(event.nativeEvent.layout.width);
        }
      }}
    >
      {width > 0 && (
        <Svg width={width} height={CHART_HEIGHT}>
          <LeadGuides geometry={geometry} plotRight={plotRight} />
          {heartRate === undefined || scale === undefined ? null : (
            <HeartRateLayer
              spans={spans}
              xOf={geometry.xOf}
              scale={scale}
              plotRight={plotRight}
              width={width}
            />
          )}
          <LeadLayer steps={steps} geometry={geometry} endX={endX} />
          <Text x={PAD_X} y={CHART_HEIGHT - 6} fontSize={9} fontWeight="700" fill={textAlpha(0.35)}>
            0:00
          </Text>
          <Text
            x={endX}
            y={CHART_HEIGHT - 6}
            fontSize={9}
            fontWeight="700"
            fill={textAlpha(0.35)}
            textAnchor="end"
          >
            {clockLabel(endedAt - startedAt)}
          </Text>
        </Svg>
      )}
      <XStack alignItems="center" justifyContent="center" flexWrap="wrap" gap={14} marginTop={4}>
        <LegendDot color={colors.accent} label="TEAM A AHEAD" />
        <LegendDot color={colors.teamB} label="TEAM B AHEAD" />
        {steps.some((step, index) => step.handOut && index > 0) ? (
          <LegendDot color={colors.text} label="SERVE CHANGE" square={true} />
        ) : null}
        {scale === undefined ? null : <LegendDot color={colors.danger} label="HEART RATE" />}
      </XStack>
    </View>
  );
}
