import type { HeartRateSample } from "@holy-padel/db";
import type { TeamValues } from "@holy-padel/scoring";
import type { ReactNode } from "react";
import { useId, useRef, useState } from "react";
import { View as NativeView } from "react-native";
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient,
  Path,
  Stop,
  // Imported as `Text` (not aliased) so the raw-text lint recognises label children.
  Text,
} from "react-native-svg";
import { View, XStack } from "tamagui";
import { ScrubReadoutRow } from "@/components/scrub-readout.tsx";
import { Body } from "@/components/ui.tsx";
import { useScrubGesture } from "@/components/use-scrub-gesture.ts";
import type { BpmScale, HeartRateSpan } from "@/lib/game-activity.ts";
import { bpmScale, heartRateRuns } from "@/lib/game-activity.ts";
import type { GameSeriesStep } from "@/lib/game-series.ts";
import { scoreHaptic } from "@/lib/haptics.ts";
import { clockLabel, nearestStep, openingSetGames, scrubReadout } from "@/lib/score-scrub.ts";
import type { LeadTone } from "@/lib/snake-geometry.ts";
import {
  endLabelSlot,
  handOutMarks,
  leadPaths,
  leadRange,
  leadScale,
  leadSegments,
  toneOf,
} from "@/lib/snake-geometry.ts";
import { colors, textAlpha } from "@/theme/colors.ts";

const CHART_HEIGHT = 176;
const PAD_X = 12;
/** Right gutter for the bpm axis labels, kept on every game once the match has any heart rate. */
const HR_AXIS = 34;
const PAD_TOP = 16;
/** Room under the plot for the time axis. */
const PAD_BOTTOM = 22;
const PLOT_BOTTOM = CHART_HEIGHT - PAD_BOTTOM;
/** One stroke width for the whole lead line; its ends and joins are round. */
const LINE_WIDTH = 2.5;
/** A hand-out tick reaches this far either side of the line. */
const TICK_HALF = 6;
const TICK_WIDTH = 2.5;
/** Hand-outs closer than this many pixels to the last tick drawn are left unmarked. */
const TICK_SPACING = 12;
const END_DOT = 4.5;
const END_HALO = 9;
/** The scrub cursor's ring around the rally it sits on. */
const CURSOR_DOT = 5;

interface Point {
  readonly x: number;
  readonly y: number;
}

interface Geometry {
  readonly xOf: (t: number) => number;
  readonly yOf: (lead: number) => number;
  /** The zero line's y, which moves with the fitted range. */
  readonly zeroY: number;
}

/** Team A is the accent, team B its runtime colour, and level is a neutral ink. */
function toneColor(tone: LeadTone): string {
  if (tone === "A") {
    return colors.accent;
  }
  return tone === "B" ? colors.teamB : textAlpha(0.35);
}

/** The final score's label: the leader's colour, readable on the card. */
function scoreFill(tone: LeadTone): string {
  if (tone === "A") {
    return colors.accentOnCard;
  }
  return tone === "B" ? colors.teamB : textAlpha(0.6);
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

/**
 * The lead itself: a faint fill between the line and the zero line, one
 * stepped line from the origin, hand-out ticks in the winner's colour, and an
 * end dot with the final score.
 */
function LeadLayer({
  steps,
  geometry,
  startedAt,
  endX,
  pointsA,
  pointsB,
}: {
  readonly steps: readonly GameSeriesStep[];
  readonly geometry: Geometry;
  readonly startedAt: number;
  readonly endX: number;
  readonly pointsA: number;
  readonly pointsB: number;
}): ReactNode {
  const { xOf, yOf, zeroY } = geometry;
  const paths = leadPaths({ steps, startedAt, endX, xOf, yOf, zeroY });
  const marks = handOutMarks(steps, xOf, yOf, TICK_SPACING);
  const last = steps.at(-1);
  const endTone: LeadTone = last === undefined ? "even" : toneOf(last.lead);
  const endY = yOf(last?.lead ?? 0);
  const endText = `${String(pointsA)}–${String(pointsB)}`;
  // The label keeps off the line, its ticks, and the zero line, and stays above the time axis.
  const slot = endLabelSlot({
    endX,
    endY,
    text: endText,
    clearance: END_HALO + 3,
    segments: [
      ...leadSegments({ steps, startedAt, endX, xOf, yOf }),
      { x1: PAD_X, y1: zeroY, x2: endX, y2: zeroY },
      ...marks.map((mark) => ({
        x1: mark.x,
        y1: mark.y - TICK_HALF,
        x2: mark.x,
        y2: mark.y + TICK_HALF,
      })),
    ],
    topLimit: 0,
    bottomLimit: PLOT_BOTTOM + 4,
  });
  return (
    <>
      {paths.map((path) =>
        path.tone === "even" ? null : (
          <Path key={`${path.key}f`} d={path.area} fill={toneColor(path.tone)} fillOpacity={0.1} />
        ),
      )}
      <Line x1={PAD_X} y1={zeroY} x2={endX} y2={zeroY} stroke={textAlpha(0.18)} strokeWidth={1} />
      {paths.map((path) => (
        <Path
          key={path.key}
          d={path.d}
          fill="none"
          stroke={toneColor(path.tone)}
          strokeWidth={LINE_WIDTH}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {marks.map((mark) => (
        <G key={mark.key}>
          {/* A card-coloured halo keeps the tick legible where it crosses the line. */}
          <Line
            x1={mark.x}
            y1={mark.y - TICK_HALF}
            x2={mark.x}
            y2={mark.y + TICK_HALF}
            stroke={colors.card}
            strokeWidth={TICK_WIDTH + 2}
            strokeLinecap="round"
          />
          <Line
            x1={mark.x}
            y1={mark.y - TICK_HALF}
            x2={mark.x}
            y2={mark.y + TICK_HALF}
            stroke={toneColor(mark.team)}
            strokeWidth={TICK_WIDTH}
            strokeLinecap="round"
          />
        </G>
      ))}
      {last === undefined ? null : (
        <>
          <Circle cx={endX} cy={endY} r={END_HALO} fill={toneColor(endTone)} fillOpacity={0.2} />
          <Circle cx={endX} cy={endY} r={END_DOT} fill={toneColor(endTone)} />
          <Text
            x={slot.x}
            y={slot.y}
            fontSize={10}
            fontWeight="800"
            fill={scoreFill(endTone)}
            textAnchor="end"
          >
            {endText}
          </Text>
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
 * game, over the game's real time — starting from level at the origin and
 * ending on the final score, with the watch-tracked heart rate as a smooth
 * curve on its own scale behind it.
 *
 * Press and hold the chart, then drag along it, to scrub it: a cursor marks the
 * rally under the finger, the readout names its server, score, heart rate and
 * time, and each rally stepped onto ticks.
 */
export function SnakeChart({
  steps,
  startedAt,
  endedAt,
  pointsA,
  pointsB,
  names,
  heartRate,
  squash,
  pickleball,
  width: fixedWidth,
}: {
  readonly steps: readonly GameSeriesStep[];
  /** Start of the plotted window (the end of the previous game). */
  readonly startedAt: number;
  readonly endedAt: number;
  /** The game's final points, labelled at the end of the line. */
  readonly pointsA: number;
  readonly pointsB: number;
  /** Team names for the scrub readout's server. */
  readonly names: TeamValues<string>;
  readonly heartRate?: readonly HeartRateSample[];
  /** Squash has no sets, so the scrub readout labels its cells POINTS and GAMES. */
  readonly squash?: boolean;
  /** Pickleball's scrub readout shows the server call (1–0–2) in its points cell. */
  readonly pickleball?: boolean;
  readonly width?: number;
}): ReactNode {
  const [measured, setMeasured] = useState(0);
  const [scrubbed, setScrubbed] = useState<number | undefined>(undefined);
  // The rally the drag last landed on, so a tick fires once per step rather than per move event.
  const lastScrubbed = useRef<number | undefined>(undefined);
  const width = fixedWidth ?? measured;
  const span = Math.max(1, endedAt - startedAt);
  const spans = heartRateRuns(heartRate ?? [], { from: startedAt, to: endedAt });
  const scale = bpmScale(spans.flatMap((run) => run.points.map((sample) => sample.bpm)));
  // Once the match has any heart rate, every game keeps the bpm gutter so the plots line up.
  const hasHeartRate = (heartRate?.length ?? 0) > 0;
  const plotRight = width - (hasHeartRate ? HR_AXIS : PAD_X);
  const plotWidth = Math.max(0, plotRight - PAD_X);
  // The y range fits the data: zero always shown, the furthest lead each way, plus headroom.
  const { zeroY, yOf } = leadScale(leadRange(steps.map((step) => step.lead)), PAD_TOP, PLOT_BOTTOM);
  const geometry: Geometry = {
    xOf: (t) => PAD_X + Math.min(1, Math.max(0, (t - startedAt) / span)) * plotWidth,
    yOf,
    zeroY,
  };
  const endX = plotRight;
  const hasHandOuts = steps.some((step) => step.handOut);

  const cursorStep = scrubbed === undefined ? undefined : steps[scrubbed];
  const cursor =
    cursorStep === undefined
      ? undefined
      : { x: geometry.xOf(cursorStep.t), y: geometry.yOf(cursorStep.lead) };
  const readout =
    cursorStep === undefined
      ? undefined
      : scrubReadout(cursorStep, {
          names,
          startedAt,
          openingSetGames: openingSetGames(steps),
          squash: squash === true,
          pickleball: pickleball === true,
          // The smoothed readings the drawn line uses, so the BPM cell matches the curve.
          ...(hasHeartRate ? { heartRate: spans.flatMap((run) => run.points) } : {}),
        });

  const scrubTo = (x: number): void => {
    const index = nearestStep(steps, geometry.xOf, x);
    if (index === undefined || index === lastScrubbed.current) {
      return;
    }
    lastScrubbed.current = index;
    setScrubbed(index);
    scoreHaptic();
  };
  const endScrub = (): void => {
    lastScrubbed.current = undefined;
    setScrubbed(undefined);
  };
  const scrubber = useScrubGesture({ scrubTo, endScrub });

  return (
    <View
      position="relative"
      width={fixedWidth ?? "100%"}
      onLayout={(event) => {
        if (fixedWidth === undefined) {
          setMeasured(event.nativeEvent.layout.width);
        }
      }}
    >
      {width > 0 && (
        <Svg width={width} height={CHART_HEIGHT}>
          {heartRate === undefined || scale === undefined ? null : (
            <HeartRateLayer
              spans={spans}
              xOf={geometry.xOf}
              scale={scale}
              plotRight={plotRight}
              width={width}
            />
          )}
          <LeadLayer
            steps={steps}
            geometry={geometry}
            startedAt={startedAt}
            endX={endX}
            pointsA={pointsA}
            pointsB={pointsB}
          />
          {cursor === undefined ? null : (
            <G>
              <Line
                x1={cursor.x}
                y1={PAD_TOP}
                x2={cursor.x}
                y2={PLOT_BOTTOM}
                stroke={textAlpha(0.45)}
                strokeWidth={1}
              />
              <Circle
                cx={cursor.x}
                cy={cursor.y}
                r={CURSOR_DOT}
                fill={colors.card}
                stroke={colors.text}
                strokeWidth={2}
              />
            </G>
          )}
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
      {width > 0 && steps.length > 0 ? (
        // A native View: Tamagui's View does not pass the responder handlers through on web.
        <NativeView
          accessible={true}
          aria-label="Score race for this game"
          accessibilityHint="Press and hold the line to see any moment"
          style={{ position: "absolute", top: 0, left: 0, width, height: CHART_HEIGHT }}
          {...scrubber.panHandlers}
        />
      ) : null}
      <ScrubReadoutRow readout={readout} />
      <XStack alignItems="center" justifyContent="center" flexWrap="wrap" gap={14} marginTop={4}>
        <LegendDot color={colors.accent} label="TEAM A AHEAD" />
        <LegendDot color={colors.teamB} label="TEAM B AHEAD" />
        {hasHandOuts ? (
          <LegendDot
            color={colors.text}
            label={pickleball === true ? "SIDE-OUT · NO POINT" : "HAND-OUT · NO POINT"}
            square={true}
          />
        ) : null}
        {scale === undefined ? null : <LegendDot color={colors.danger} label="HEART RATE" />}
      </XStack>
    </View>
  );
}
