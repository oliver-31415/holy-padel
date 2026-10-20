import type { TeamId } from "@holy-padel/scoring";
import type { GameSeriesStep } from "@/lib/game-series.ts";

/**
 * Which side of the zero line a stretch of the lead sits on: team A ahead,
 * team B ahead, or level. Drives the colour of a stroke or fill.
 */
export type LeadTone = TeamId | "even";

/** One stroke of the stepped lead line, coloured by the side it sits on. */
export interface LeadPath {
  readonly key: string;
  readonly tone: LeadTone;
  /** The stepped line, as an SVG path (no fill). */
  readonly d: string;
  /** The same line closed down to the zero line, for the subtle area fill. */
  readonly area: string;
}

/** A small tick across the line where a hand-out was won, in the winner's colour. */
export interface HandOutMark {
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly team: TeamId;
}

/** One straight piece of the stepped line or a guide, in plot coordinates. */
export interface LeadSegment {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

/** How far the plot must reach either side of zero, in points of lead. */
export interface LeadRange {
  readonly ahead: number;
  readonly behind: number;
}

/** The y mapping for a fitted range: where zero sits and how a point of lead maps to y. */
export interface LeadScale {
  readonly zeroY: number;
  readonly yOf: (lead: number) => number;
}

/** Where the final score's label sits, as an SVG text baseline. */
export interface LabelSlot {
  readonly x: number;
  readonly y: number;
}

export interface EndLabelInput {
  readonly endX: number;
  readonly endY: number;
  readonly text: string;
  /** How far the label sits from the end dot when placed above or below it. */
  readonly clearance: number;
  /** Everything the label must not sit on: the line, its guides, the ticks. */
  readonly segments: readonly LeadSegment[];
  readonly topLimit: number;
  readonly bottomLimit: number;
}

interface Vertex {
  readonly x: number;
  readonly y: number;
}

interface Edge {
  readonly tone: LeadTone;
}

export interface LeadGeometryInput {
  readonly steps: readonly GameSeriesStep[];
  /** The start of the plotted window: the lead is level (0) from here. */
  readonly startedAt: number;
  /** Where the line ends (the right edge of the plot). */
  readonly endX: number;
  readonly xOf: (t: number) => number;
  readonly yOf: (lead: number) => number;
  /** The y of the zero line, the floor of each area fill. */
  readonly zeroY: number;
}

type SteppedInput = Omit<LeadGeometryInput, "zeroY">;

interface SteppedLine {
  readonly vertices: readonly Vertex[];
  readonly edges: readonly Edge[];
}

/** At least this much room beyond the furthest lead, so nothing sits on the edge. */
const MIN_HEADROOM = 0.75;
/** Or a tenth of the span the lead covers, whichever is larger. */
const HEADROOM_SHARE = 0.1;
const LABEL_ASCENT = 7.5;
const LABEL_DESCENT = 2.5;
/** Average advance of a bold 10px numeral or en dash, for a conservative label box. */
const LABEL_CHAR_WIDTH = 6.4;
const LABEL_PAD = 2;
/** Clear space kept between the label and any line it could touch. */
const LABEL_MARGIN = 3;

/** The side of the zero line a lead sits on. */
export function toneOf(lead: number): LeadTone {
  if (lead > 0) {
    return "A";
  }
  return lead < 0 ? "B" : "even";
}

/**
 * The stepped line's vertices and the tone of the edge leading to each one.
 * Each rally is a horizontal run at the lead held since the last rally, then a
 * vertical riser to the new lead. A rally that leaves the lead unchanged (a
 * hand-out) extends the run flat. A riser's tone is the side it lands on, or
 * the side it left when it lands on zero.
 */
function steppedLine(input: SteppedInput): SteppedLine {
  const { steps, startedAt, endX, xOf, yOf } = input;
  const vertices: Vertex[] = [{ x: xOf(startedAt), y: yOf(0) }];
  const edges: Edge[] = [];
  let lead = 0;

  const pushEdge = (x: number, nextLead: number, tone: LeadTone): void => {
    vertices.push({ x, y: yOf(nextLead) });
    edges.push({ tone });
  };

  for (const step of steps) {
    const x = xOf(step.t);
    pushEdge(x, lead, toneOf(lead));
    if (step.lead !== lead) {
      const riserTone = toneOf(step.lead) === "even" ? toneOf(lead) : toneOf(step.lead);
      pushEdge(x, step.lead, riserTone);
      lead = step.lead;
    }
  }
  pushEdge(endX, lead, toneOf(lead));
  return { vertices, edges };
}

/**
 * The stepped lead line, starting at the origin (level at the window start)
 * and grown rally by rally.
 *
 * Edges are grouped by tone, so each colour is one path with round joins.
 */
export function leadPaths(input: LeadGeometryInput): LeadPath[] {
  const { vertices, edges } = steppedLine(input);
  const { zeroY } = input;

  const paths: LeadPath[] = [];
  let groupStart = 0;
  for (let index = 0; index <= edges.length; index += 1) {
    const current = edges[index];
    const groupTone = edges[groupStart]?.tone;
    if (current !== undefined && current.tone === groupTone) {
      continue;
    }
    const first = vertices[groupStart];
    const last = vertices[index];
    if (groupTone !== undefined && first !== undefined && last !== undefined) {
      const run = vertices.slice(groupStart, index + 1);
      const d = run
        .map(
          (vertex, vertexIndex) =>
            `${vertexIndex === 0 ? "M" : "L"}${vertex.x.toFixed(1)},${vertex.y.toFixed(1)}`,
        )
        .join(" ");
      const area = `${d} L${last.x.toFixed(1)},${zeroY.toFixed(1)} L${first.x.toFixed(1)},${zeroY.toFixed(1)} Z`;
      paths.push({ key: `p${String(groupStart)}`, tone: groupTone, d, area });
    }
    groupStart = index;
  }
  return paths;
}

/** The stepped line as straight segments, for collision checks against labels. */
export function leadSegments(input: SteppedInput): LeadSegment[] {
  const { vertices } = steppedLine(input);
  return vertices.flatMap((start, index) => {
    const end = vertices[index + 1];
    return end === undefined ? [] : [{ x1: start.x, y1: start.y, x2: end.x, y2: end.y }];
  });
}

/**
 * How far the plot must reach either side of zero: the furthest lead actually
 * reached each way (zero is always included), plus headroom on both sides.
 * A game that never leaves zero gets the minimal symmetric range.
 */
export function leadRange(leads: readonly number[]): LeadRange {
  const reachAhead = Math.max(0, ...leads);
  const reachBehind = Math.max(0, ...leads.map((lead) => -lead));
  const headroom = Math.max(MIN_HEADROOM, HEADROOM_SHARE * (reachAhead + reachBehind));
  return { ahead: reachAhead + headroom, behind: reachBehind + headroom };
}

/** Fits a range into a plot band: zero sits wherever the range puts it. */
export function leadScale(range: LeadRange, plotTop: number, plotBottom: number): LeadScale {
  const perPoint = (plotBottom - plotTop) / (range.ahead + range.behind);
  const zeroY = plotTop + range.ahead * perPoint;
  return { zeroY, yOf: (lead) => zeroY - lead * perPoint };
}

/**
 * A tick on the line at each hand-out: where the receiver won the rally and
 * the serve passed, coloured by the team that won it (the team now serving).
 * Padel and PAR never set `handOut`, so they get no marks.
 *
 * With `minSpacing` (in the x units `xOf` returns), a mark closer than that to
 * the last kept mark is dropped, so a run of hand-outs reads as one tick rather
 * than a smear. The earliest mark in a run is the one kept.
 */
export function handOutMarks(
  steps: readonly GameSeriesStep[],
  xOf: (t: number) => number,
  yOf: (lead: number) => number,
  minSpacing = 0,
): HandOutMark[] {
  const marks: HandOutMark[] = [];
  for (const [index, step] of steps.entries()) {
    if (!step.handOut) {
      continue;
    }
    const x = xOf(step.t);
    const previous = marks.at(-1);
    if (previous !== undefined && x - previous.x < minSpacing) {
      continue;
    }
    marks.push({ key: `h${String(index)}`, x, y: yOf(step.lead), team: step.winner });
  }
  return marks;
}

/**
 * Where the final score's label goes. It prefers the left of the end dot, then
 * above it, then below it, taking the first spot whose text box clears every
 * segment and stays within the limits. If none is clear it falls back to above.
 */
export function endLabelSlot(input: EndLabelInput): LabelSlot {
  const { endX, endY, text, clearance, segments, topLimit, bottomLimit } = input;
  const width = text.length * LABEL_CHAR_WIDTH + LABEL_PAD;
  const left: LabelSlot = { x: endX - clearance, y: endY + LABEL_ASCENT / 2 };
  const above: LabelSlot = { x: endX, y: endY - clearance };
  const below: LabelSlot = { x: endX, y: endY + clearance + LABEL_ASCENT };

  const fits = (slot: LabelSlot): boolean => {
    const top = slot.y - LABEL_ASCENT;
    const bottom = slot.y + LABEL_DESCENT;
    if (top < topLimit || bottom > bottomLimit) {
      return false;
    }
    const box = { left: slot.x - width, right: slot.x, top, bottom };
    return segments.every((segment) => !clashes(box, segment));
  };
  return [left, above, below].find(fits) ?? above;
}

function clashes(
  box: {
    readonly left: number;
    readonly right: number;
    readonly top: number;
    readonly bottom: number;
  },
  segment: LeadSegment,
): boolean {
  const left = Math.min(segment.x1, segment.x2) - LABEL_MARGIN;
  const right = Math.max(segment.x1, segment.x2) + LABEL_MARGIN;
  const top = Math.min(segment.y1, segment.y2) - LABEL_MARGIN;
  const bottom = Math.max(segment.y1, segment.y2) + LABEL_MARGIN;
  return box.left < right && box.right > left && box.top < bottom && box.bottom > top;
}
