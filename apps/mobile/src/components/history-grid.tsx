import type { MatchSummary } from "@holy-padel/db";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { View, XStack, YStack } from "tamagui";
import { Body, Card, Display, Overline, ResultBadge } from "@/components/ui.tsx";
import { fullDayLabel, opponentsOf, ownerTeamOf, pairLabel } from "@/lib/format.ts";
import type { DayCell } from "@/lib/history.ts";
import { accentRgb, colors, teamBRgb, textAlpha } from "@/theme/colors.ts";

/**
 * The home screen's season calendar — one row per week, seven day columns
 * stretched across the full card width, so it reads like a normal calendar:
 * a weekday header along the top, the last six weeks (oldest at the top), and
 * a month label in the left gutter wherever the month changes.
 *
 * The day colour is a scale, not a category: 0% wins sits at the Team B
 * colour, 100% at the accent (both chosen in Settings), so a glance separates
 * "lost everything" from "won everything" and every shade between is a real
 * win share. Tapping a day with matches expands that day's results beneath
 * the grid.
 */

const GAP = 5;
/** Left column holding the month label, so the 7 day columns stay aligned. */
const GUTTER = 34;
const DAY_LABELS = [
  { key: "sun", label: "S" },
  { key: "mon", label: "M" },
  { key: "tue", label: "T" },
  { key: "wed", label: "W" },
  { key: "thu", label: "T" },
  { key: "fri", label: "F" },
  { key: "sat", label: "S" },
] as const;
const MONTHS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
] as const;

const RADIUS = 8;

/** Lost-everything is the Team B colour, won-everything the accent — both user-chosen. */
function winShareColor(won: number, lost: number): string {
  const share = won + lost === 0 ? 0 : won / (won + lost);
  const [lr, lg, lb] = teamBRgb();
  const [wr, wg, wb] = accentRgb();
  const channel = (l: number, w: number): number => Math.round(l + (w - l) * share);
  return `rgb(${String(channel(lr, wr))}, ${String(channel(lg, wg))}, ${String(channel(lb, wb))})`;
}

/** The month label for a week row, or "" when the month hasn't changed. */
function monthLabelFor(weeks: readonly (readonly DayCell[])[], index: number): string {
  const first = weeks[index]?.[0];
  if (first === undefined || first.future) {
    return "";
  }
  const previous = index > 0 ? weeks[index - 1]?.[0] : undefined;
  if (
    previous !== undefined &&
    new Date(previous.day).getMonth() === new Date(first.day).getMonth()
  ) {
    return "";
  }
  return MONTHS[new Date(first.day).getMonth()] ?? "";
}

function DaySquare({
  cell,
  selected,
  onPress,
}: {
  readonly cell: DayCell;
  readonly selected: boolean;
  readonly onPress: (day: number) => void;
}): ReactNode {
  if (cell.future) {
    return <View flex={1} aspectRatio={1} />;
  }

  // Today and the tapped day carry a ring; everything else speaks through its
  // fill alone.
  const ringed = selected || cell.today;
  const played = cell.played > 0;
  // A day of only level early stops has no win share, so it stays neutral.
  const onlyDraws = cell.won + cell.lost === 0 && cell.drew > 0;
  const fill = onlyDraws
    ? textAlpha(0.3)
    : played
      ? winShareColor(cell.won, cell.lost)
      : textAlpha(0.05);
  const inner = <View width="100%" height="100%" borderRadius={RADIUS} backgroundColor={fill} />;

  if (!played) {
    return (
      <View
        flex={1}
        aspectRatio={1}
        borderRadius={RADIUS + 2}
        borderWidth={ringed ? 2 : 0}
        borderColor={colors.white}
        alignItems="center"
        justifyContent="center"
      >
        {inner}
      </View>
    );
  }
  return (
    <View
      flex={1}
      aspectRatio={1}
      borderRadius={RADIUS + 2}
      borderWidth={ringed ? 2 : 0}
      borderColor={colors.white}
      alignItems="center"
      justifyContent="center"
      pressStyle={{ opacity: 0.65 }}
      role="button"
      aria-label={`${cell.played} ${cell.played === 1 ? "match" : "matches"} played, ${cell.won} won${cell.drew > 0 ? `, ${String(cell.drew)} drew` : ""}`}
      onPress={() => {
        onPress(cell.day);
      }}
    >
      {inner}
    </View>
  );
}

/** The results of the selected day, listed under the grid. */
function DayMatches({
  day,
  matches,
  ownerId,
  onDismiss,
}: {
  readonly day: number;
  readonly matches: readonly MatchSummary[];
  readonly ownerId: string;
  readonly onDismiss: () => void;
}): ReactNode {
  const dayMatches = matches.filter(
    (match) => match.startedAt >= day && match.startedAt < day + 86_400_000,
  );
  const ownerWon = (match: MatchSummary): boolean => match.winner === ownerTeamOf(match, ownerId);
  const won = dayMatches.filter(ownerWon).length;
  const drew = dayMatches.filter((match) => match.winner === undefined).length;
  const lost = dayMatches.length - won - drew;
  const record =
    drew === 0
      ? `${String(won)}–${String(lost)}`
      : `${String(won)}–${String(lost)}–${String(drew)}`;
  return (
    <YStack gap={11}>
      <XStack alignItems="center" justifyContent="space-between">
        <Display fontSize={15}>{`${fullDayLabel(day)} · ${record}`}</Display>
        <Body
          fontSize={11}
          fontWeight="800"
          letterSpacing={1}
          color={textAlpha(0.45)}
          pressStyle={{ opacity: 0.6 }}
          role="button"
          onPress={onDismiss}
        >
          CLOSE
        </Body>
      </XStack>
      {dayMatches.map((match) => {
        const ownerTeam = ownerTeamOf(match, ownerId);
        return (
          <XStack
            key={match.id}
            alignItems="center"
            justifyContent="space-between"
            pressStyle={{ opacity: 0.85 }}
            role="button"
            onPress={() => {
              router.push(`/match/${match.id}`);
            }}
          >
            <Body flex={1} fontSize={14.5} fontWeight="700">
              {`vs ${pairLabel(opponentsOf(match, ownerTeam))}`}
            </Body>
            <XStack alignItems="center" gap={12}>
              <Display fontSize={15} color={textAlpha(0.6)}>
                {match.scoreLine ?? ""}
              </Display>
              <ResultBadge
                won={match.winner === ownerTeam}
                drew={match.winner === undefined}
                size={26}
              />
            </XStack>
          </XStack>
        );
      })}
    </YStack>
  );
}

export function HistoryGrid({
  weeks,
  played,
  won,
  lost,
  drew,
  matches,
  ownerId,
  streak,
  selectedDay,
  onSelectDay,
}: {
  readonly weeks: readonly (readonly DayCell[])[];
  readonly played: number;
  readonly won: number;
  readonly lost: number;
  readonly drew: number;
  readonly matches: readonly MatchSummary[];
  readonly ownerId: string;
  readonly streak: { readonly kind: "won" | "lost"; readonly count: number } | undefined;
  readonly selectedDay: number | undefined;
  readonly onSelectDay: (day: number | undefined) => void;
}): ReactNode {
  if (played === 0) {
    return null;
  }
  const handleSelect = (day: number): void => {
    onSelectDay(selectedDay === day ? undefined : day);
  };

  return (
    <Card borderRadius={22} paddingVertical={16} paddingHorizontal={16} gap={14}>
      <XStack alignItems="center" justifyContent="space-between">
        <YStack>
          <Overline>LAST 6 WEEKS</Overline>
          <Display fontSize={17}>
            {drew === 0
              ? `${String(won)}W · ${String(lost)}L`
              : `${String(won)}W · ${String(lost)}L · ${String(drew)}D`}
          </Display>
        </YStack>
        {streak === undefined ? null : (
          <XStack
            backgroundColor={colors.tileInk}
            borderRadius={14}
            paddingVertical={9}
            paddingHorizontal={14}
            alignItems="center"
            gap={8}
          >
            <Display fontSize={14} color={streak.kind === "won" ? colors.accent : colors.white}>
              {streak.kind === "won"
                ? `Won last ${String(streak.count)}`
                : `Lost last ${String(streak.count)}`}
            </Display>
          </XStack>
        )}
      </XStack>

      <YStack gap={GAP} testID="history-grid">
        <XStack gap={GAP}>
          <View width={GUTTER} />
          {DAY_LABELS.map((day) => (
            <View key={day.key} flex={1} alignItems="center">
              <Body fontSize={10} fontWeight="800" color={textAlpha(0.35)}>
                {day.label}
              </Body>
            </View>
          ))}
        </XStack>
        {weeks.map((week, index) => {
          const monthLabel = monthLabelFor(weeks, index);
          return (
            <XStack key={String(week[0]?.day)} gap={GAP}>
              <View width={GUTTER} justifyContent="center">
                {monthLabel === "" ? null : (
                  <Body fontSize={9} fontWeight="800" letterSpacing={0.8} color={textAlpha(0.4)}>
                    {monthLabel}
                  </Body>
                )}
              </View>
              {week.map((cell) => (
                <DaySquare
                  key={String(cell.day)}
                  cell={cell}
                  selected={cell.day === selectedDay}
                  onPress={handleSelect}
                />
              ))}
            </XStack>
          );
        })}
      </YStack>

      <XStack alignItems="center" justifyContent="center" gap={10}>
        <Body fontSize={11} fontWeight="700" color={textAlpha(0.5)}>
          0%
        </Body>
        {[0, 0.25, 0.5, 0.75, 1].map((share) => (
          <View
            key={share}
            width={15}
            height={13}
            borderRadius={4}
            backgroundColor={winShareColor(share, 1 - share)}
          />
        ))}
        <Body fontSize={11} fontWeight="700" color={textAlpha(0.5)}>
          100% won
        </Body>
        <Body fontSize={11} fontWeight="700" color={textAlpha(0.35)}>
          {`· ${String(played)} played`}
        </Body>
      </XStack>

      {selectedDay === undefined ? null : (
        <DayMatches
          day={selectedDay}
          matches={matches}
          ownerId={ownerId}
          onDismiss={() => {
            onSelectDay(undefined);
          }}
        />
      )}
    </Card>
  );
}
