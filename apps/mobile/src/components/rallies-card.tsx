import type { MatchSummary } from "@holy-padel/db";
import { getOwner } from "@holy-padel/db";
import type { PointEvent } from "@holy-padel/scoring";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { View, XStack, YStack } from "tamagui";
import { CardHeader, Figure, ShareRow, ShareTile } from "@/components/insight-parts.tsx";
import { Body, Card } from "@/components/ui.tsx";
import { useDbQuery } from "@/db/provider.tsx";
import { ownerTeamOf } from "@/lib/format.ts";
import type { RallyLengths, RallySummary } from "@/lib/rallies.ts";
import { leftOutLabel, rallyLengthLabel, rallyLengths, summarizeRallies } from "@/lib/rallies.ts";
import { colors, textAlpha } from "@/theme/colors.ts";

const STRIP_HEIGHT = 44;

/** What the times are, and what was left out of them. */
function Footnote({ lengths }: { readonly lengths: RallyLengths }): ReactNode {
  const leftOut = leftOutLabel(lengths);
  return (
    <Body fontSize={11.5} fontWeight="600" color={textAlpha(0.5)} testID="rallies-footnote">
      {leftOut === undefined
        ? "Timed from one point to the next."
        : `Timed from one point to the next. ${leftOut}`}
    </Body>
  );
}

/** Every rally in play order, as tall as it ran — the ones you won in the highlight colour. */
function RallyStrip({ lengths }: { readonly lengths: RallyLengths }): ReactNode {
  const longest = Math.max(...lengths.rallies.map((rally) => rally.ms));
  return (
    <YStack gap={8}>
      <XStack height={STRIP_HEIGHT} alignItems="flex-end" gap={1} testID="rally-strip">
        {lengths.rallies.map((rally, index) => (
          <View
            // biome-ignore lint/suspicious/noArrayIndexKey: rallies are a fixed, ordered ledger
            key={index}
            flex={1}
            height={Math.max(3, (rally.ms / longest) * STRIP_HEIGHT)}
            borderRadius={2}
            backgroundColor={rally.won ? colors.accent : textAlpha(0.18)}
          />
        ))}
      </XStack>
      <XStack gap={14}>
        {[
          { label: "YOU WON", color: colors.accent },
          { label: "THEY WON", color: textAlpha(0.18) },
        ].map((key) => (
          <XStack key={key.label} alignItems="center" gap={5}>
            <View width={8} height={8} borderRadius={2} backgroundColor={key.color} />
            <Body fontSize={9.5} fontWeight="800" letterSpacing={1.1} color={textAlpha(0.45)}>
              {key.label}
            </Body>
          </XStack>
        ))}
      </XStack>
    </YStack>
  );
}

function halves(summary: RallySummary): { long: string; short: string } {
  const median = rallyLengthLabel(summary.medianMs);
  return { long: `Over ${median}`, short: `${median} or less` };
}

/**
 * One match's rallies: how long they ran, each one in order, and whether you
 * did better in the long ones or the short ones. Hidden with too few to read.
 */
export function MatchRalliesCard({
  match,
  events,
}: {
  readonly match: MatchSummary;
  readonly events: readonly PointEvent[];
}): ReactNode {
  const owner = useDbQuery(getOwner);
  const team = ownerTeamOf(match, owner?.id ?? "nico");
  const lengths = useMemo(
    () => rallyLengths(match.config, events, team),
    [match.config, events, team],
  );
  const summary = summarizeRallies(lengths.rallies);
  if (summary === undefined) {
    return null;
  }
  const words = halves(summary);
  return (
    <Card
      borderRadius={20}
      paddingVertical={15}
      paddingHorizontal={17}
      gap={14}
      testID="match-rallies"
    >
      <CardHeader title="RALLIES" aside={`${String(summary.count)} TIMED`} />
      <XStack>
        <Figure value={rallyLengthLabel(summary.averageMs)} label="AVERAGE" />
        <Figure value={rallyLengthLabel(summary.medianMs)} label="TYPICAL" />
        <Figure value={rallyLengthLabel(summary.longestMs)} label="LONGEST" />
      </XStack>
      <RallyStrip lengths={lengths} />
      {summary.long.of === 0 ? null : (
        <YStack gap={12}>
          <ShareRow
            label={`Long rallies · ${words.long.toLowerCase()}`}
            detail={`${String(summary.long.won)} of ${String(summary.long.of)}`}
            won={summary.long.won}
            of={summary.long.of}
            testID="rallies-long"
          />
          <ShareRow
            label={`Short rallies · ${words.short}`}
            detail={`${String(summary.short.won)} of ${String(summary.short.of)}`}
            won={summary.short.won}
            of={summary.short.of}
            testID="rallies-short"
          />
        </YStack>
      )}
      <Footnote lengths={lengths} />
    </Card>
  );
}

/**
 * Rallies across your matches: do you win the long ones or the short ones?
 * The halves split at your typical rally, so each holds about as many.
 */
export function RalliesCard({ lengths }: { readonly lengths: RallyLengths }): ReactNode {
  const summary = summarizeRallies(lengths.rallies);
  if (summary === undefined || summary.long.of === 0) {
    return null;
  }
  const words = halves(summary);
  return (
    <Card
      borderRadius={20}
      paddingVertical={15}
      paddingHorizontal={17}
      gap={14}
      testID="rallies-card"
    >
      <CardHeader
        title="LONG OR SHORT RALLIES"
        aside={`AVG ${rallyLengthLabel(summary.averageMs)}`}
      />
      <XStack gap={8}>
        <ShareTile
          tally={summary.long}
          label="LONG RALLIES"
          explain={words.long}
          testID="rallies-long"
        />
        <ShareTile
          tally={summary.short}
          label="SHORT RALLIES"
          explain={words.short}
          testID="rallies-short"
        />
      </XStack>
      <Footnote lengths={lengths} />
    </Card>
  );
}
