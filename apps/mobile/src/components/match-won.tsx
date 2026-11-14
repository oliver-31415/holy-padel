import type { MatchSummary } from "@holy-padel/db";
import type { MatchSnapshot, MatchStats, TeamId } from "@holy-padel/scoring";
import type { ReactNode } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { XStack, YStack } from "tamagui";
import { Button } from "@/components/controls.tsx";
import { Body, Display, Label } from "@/components/ui.tsx";
import { dayLabel, durationLabel, finalScoreLine, teamNames } from "@/lib/format.ts";
import { colors } from "@/theme/colors.ts";

/**
 * The victory screen — final line, headline totals, done/rematch. The result
 * is already saved by the deciding rally, so Done only leaves (and dismisses
 * the watches' MATCH WON). Undo last point
 * reopens the match after a mis-tapped match point; it's omitted when another
 * match has gone live meanwhile.
 */
export function MatchWon({
  match,
  snapshot,
  stats,
  now,
  ownerId,
  onDone,
  onRematch,
  onUndo,
}: {
  readonly match: MatchSummary;
  readonly snapshot: MatchSnapshot;
  readonly stats: MatchStats;
  readonly now: number;
  readonly ownerId: string;
  readonly onDone: () => void;
  readonly onRematch: () => void;
  readonly onUndo?: () => void;
}): ReactNode {
  const insets = useSafeAreaInsets();
  const winner = snapshot.winner ?? "A";
  const loser: TeamId = winner === "A" ? "B" : "A";
  const names = teamNames(match);
  const ownerTeam: TeamId = match.players.B.includes(ownerId) ? "B" : "A";
  const ownerWon = winner === ownerTeam;
  const meta = [dayLabel(match.startedAt, now), durationLabel(stats.durationMs)].join(" · ");
  // A win floods the screen with the highlight colour; a loss stays neutral.
  const background = ownerWon ? colors.primaryContainer : colors.background;
  const content = ownerWon ? colors.onPrimaryContainer : colors.onSurface;
  const muted = ownerWon ? colors.onPrimaryContainer : colors.onSurfaceVariant;
  return (
    <YStack
      flex={1}
      backgroundColor={background}
      alignItems="center"
      paddingTop={insets.top + 48}
      paddingBottom={insets.bottom + 16}
      paddingHorizontal={16}
    >
      <Label color={muted}>{meta}</Label>
      <Display fontSize={48} letterSpacing={-1} color={content} marginTop={12}>
        {ownerWon ? "Match won" : "Match lost"}
      </Display>
      <Display fontSize={28} fontWeight="600" color={content} marginTop={16} textAlign="center">
        {names[winner]}
      </Display>
      <Body fontSize={16} color={muted} marginTop={4}>
        {`def. ${names[loser]}`}
      </Body>
      <Display
        fontSize={64}
        letterSpacing={-2}
        color={content}
        marginTop={24}
        textAlign="center"
        testID="won-score"
      >
        {finalScoreLine(snapshot)}
      </Display>
      <XStack gap={8} marginTop={24} width="100%">
        <StatTile
          value={`${String(snapshot.totalGames[winner])}–${String(snapshot.totalGames[loser])}`}
          label="Games"
        />
        <StatTile
          value={`${String(snapshot.totalPoints[winner])}–${String(snapshot.totalPoints[loser])}`}
          label="Points"
        />
        {match.config.sport === "squash" ? (
          <StatTile
            value={stats.longestRun === undefined ? "0" : String(stats.longestRun.count)}
            label="Longest run"
          />
        ) : (
          <StatTile value={String(stats.breaks[winner])} label="Breaks" />
        )}
      </XStack>
      <YStack marginTop="auto" width="100%" gap={8}>
        <Button
          label="Done"
          size="lg"
          {...(ownerWon
            ? { backgroundColor: colors.onPrimaryContainer, contentColor: colors.primaryContainer }
            : {})}
          onPress={onDone}
        />
        <Button
          label="Rematch"
          icon="replay"
          variant="outlined"
          {...(ownerWon
            ? { borderColor: colors.onPrimaryContainer, contentColor: colors.onPrimaryContainer }
            : {})}
          onPress={onRematch}
        />
        {onUndo === undefined ? null : (
          <Button
            label="Undo last point"
            variant="text"
            size="sm"
            contentColor={muted}
            onPress={onUndo}
            testID="won-undo"
          />
        )}
        <Label textAlign="center" color={muted}>
          Saved to this phone · watches updated
        </Label>
      </YStack>
    </YStack>
  );
}

function StatTile({ value, label }: { readonly value: string; readonly label: string }): ReactNode {
  return (
    <YStack
      flex={1}
      backgroundColor={colors.card}
      borderRadius={24}
      paddingVertical={16}
      alignItems="center"
      gap={2}
    >
      <Display fontSize={22}>{value}</Display>
      <Label>{label}</Label>
    </YStack>
  );
}
