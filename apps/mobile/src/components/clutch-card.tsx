import type { ReactNode } from "react";
import { XStack, YStack } from "tamagui";
import { CardHeader, ShareRow, ShareTile } from "@/components/insight-parts.tsx";
import { Body, Card, Display, Label } from "@/components/ui.tsx";
import type { Clutch, Tally } from "@/lib/clutch.ts";
import { percentOf } from "@/lib/clutch.ts";
import type { Sport } from "@/lib/insights.ts";
import { colors } from "@/theme/colors.ts";

function detail(tally: Tally): string {
  return `${String(tally.won)} of ${String(tally.of)}`;
}

/** What a comeback counts in each sport — sets in padel, games elsewhere. */
function turnaroundWords(sport: Sport | undefined): { won: string; lost: string } {
  if (sport === "padel") {
    return { won: "sets won from 2+ games down", lost: "sets lost from 2+ games up" };
  }
  if (sport === undefined) {
    return { won: "sets or games won from behind", lost: "sets or games lost from ahead" };
  }
  return { won: "games won from 4+ points down", lost: "games lost from 4+ points up" };
}

/** A count with a plain sentence of what it counts. */
function Turnarounds({
  count,
  words,
  muted,
}: {
  readonly count: number;
  readonly words: string;
  readonly muted: boolean;
}): ReactNode {
  return (
    <XStack alignItems="center" gap={12}>
      <Display
        fontSize={22}
        width={32}
        textAlign="center"
        {...(muted ? { color: colors.onSurfaceVariant } : {})}
      >
        {String(count)}
      </Display>
      <Body flex={1} fontSize={14}>
        {words}
      </Body>
    </XStack>
  );
}

/**
 * The "under pressure" card, in two plain numbers: how often you close out a
 * game when you're a point away, and how often you save one when they are —
 * anchored by your share of all points. Padel adds break points, golden points
 * and tie-breaks; every sport gets the sets (or games) turned around.
 */
export function ClutchCard({
  clutch,
  comebacks,
  slips,
  sport,
}: {
  readonly clutch: Clutch;
  readonly comebacks: number;
  readonly slips: number;
  /** The one sport the figures cover; undefined when they mix sports. */
  readonly sport: Sport | undefined;
}): ReactNode {
  const overall = percentOf(clutch.points);
  if (overall === undefined) {
    return null;
  }
  const rows = [
    { label: "Break points won", tally: clutch.breakPoints, id: "break-won" },
    { label: "Break points saved", tally: clutch.serveSaves, id: "break-saved" },
    { label: "Golden points", tally: clutch.deciding, id: "deciding" },
    { label: "Tie-breaks", tally: clutch.tieBreaks, id: "tie-breaks" },
  ].filter((row) => row.tally.of > 0);
  const words = turnaroundWords(sport);
  return (
    <Card padding={20} gap={16} testID="clutch-card">
      <CardHeader title="Under pressure" />
      <XStack gap={8}>
        <ShareTile
          tally={clutch.closing}
          label="Closing out"
          explain="When you're a point away"
          testID="clutch-closing"
        />
        <ShareTile
          tally={clutch.saving}
          label="Saving"
          explain="When they're a point away"
          testID="clutch-saving"
        />
      </XStack>
      <Label>{`For comparison, you win ${String(overall)}% of all points.`}</Label>
      {rows.length === 0 ? null : (
        <YStack gap={16}>
          {rows.map((row) => (
            <ShareRow
              key={row.id}
              label={row.label}
              detail={detail(row.tally)}
              won={row.tally.won}
              of={row.tally.of}
              testID={`clutch-${row.id}`}
            />
          ))}
        </YStack>
      )}
      {comebacks + slips === 0 ? null : (
        <YStack gap={8} paddingTop={2}>
          <Turnarounds count={comebacks} words={words.won} muted={false} />
          <Turnarounds count={slips} words={words.lost} muted={true} />
        </YStack>
      )}
    </Card>
  );
}
