import type { MatchSummary } from "@holy-padel/db";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { View, XStack, YStack } from "tamagui";
import { Button } from "@/components/controls.tsx";
import { Icon } from "@/components/icons.tsx";
import {
  Body,
  Card,
  Display,
  Divider,
  Label,
  ResultBadge,
  SectionTitle,
} from "@/components/ui.tsx";
import { fullDayLabel, opponentsOf, ownerTeamOf, pairLabel } from "@/lib/format.ts";
import type { DayCell } from "@/lib/history.ts";
import { colors, lossRgb, winRgb } from "@/theme/colors.ts";

/**
 * The home screen's season calendar — one row per week, seven day columns
 * stretched across the full card width, so it reads like a normal calendar:
 * a weekday header along the top, the last six weeks (oldest at the top), and
 * a month label in the left gutter wherever the month changes.
 *
 * The day colour is a scale, not a category: 0% wins sits at the Team B
 * colour, 100% at the highlight (both chosen in Settings), so a glance separates
 * "lost everything" from "won everything" and every shade between is a real
 * win share. Tapping a day with matches expands that day's results beneath
 * the grid.
 */

const GAP = 6;
/** Left column holding the month label, so the 7 day columns stay aligned. */
const GUTTER = 32;
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
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** Lost-everything is the Team B colour, won-everything the highlight — both user-chosen. */
function winShareColor(won: number, lost: number): string {
  const share = won + lost === 0 ? 0 : won / (won + lost);
  const [lr, lg, lb] = lossRgb();
  const [wr, wg, wb] = winRgb();
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
    ? colors.outline
    : played
      ? winShareColor(cell.won, cell.lost)
      : colors.cardInset;
  const inner = <View width="100%" height="100%" borderRadius={999} backgroundColor={fill} />;

  if (!played) {
    return (
      <View
        flex={1}
        aspectRatio={1}
        borderRadius={999}
        padding={ringed ? 2 : 0}
        borderWidth={ringed ? 2 : 0}
        borderColor={colors.onSurface}
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
      borderRadius={999}
      padding={ringed ? 2 : 0}
      borderWidth={ringed ? 2 : 0}
      borderColor={colors.onSurface}
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
    <YStack gap={12}>
      <Divider />
      <XStack alignItems="center" justifyContent="space-between">
        <SectionTitle>{`${fullDayLabel(day)} · ${record}`}</SectionTitle>
        <Button label="Close" variant="text" size="sm" marginRight={-12} onPress={onDismiss} />
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
            <Body flex={1} fontSize={16}>
              {`vs ${pairLabel(opponentsOf(match, ownerTeam))}`}
            </Body>
            <XStack alignItems="center" gap={12}>
              <Display fontSize={14} color={colors.onSurfaceVariant}>
                {match.scoreLine ?? ""}
              </Display>
              <ResultBadge
                won={match.winner === ownerTeam}
                drew={match.winner === undefined}
                size={28}
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
    <Card padding={16} gap={16}>
      <XStack alignItems="center" justifyContent="space-between">
        <YStack>
          <SectionTitle>Last 6 weeks</SectionTitle>
          <Label marginTop={2}>
            {drew === 0
              ? `${String(won)} won · ${String(lost)} lost`
              : `${String(won)} won · ${String(lost)} lost · ${String(drew)} drew`}
          </Label>
        </YStack>
        {streak === undefined ? null : (
          <XStack
            backgroundColor={
              streak.kind === "won" ? colors.secondaryContainer : colors.surfaceContainerHighest
            }
            borderRadius={16}
            height={32}
            paddingLeft={streak.kind === "won" ? 8 : 12}
            paddingRight={12}
            alignItems="center"
            gap={4}
          >
            {streak.kind === "won" ? (
              <Icon name="fire" size={18} color={colors.onSecondaryContainer} />
            ) : null}
            <Body
              fontSize={14}
              fontWeight="500"
              color={streak.kind === "won" ? colors.onSecondaryContainer : colors.onSurfaceVariant}
            >
              {streak.kind === "won"
                ? `Won last ${String(streak.count)}`
                : `Lost last ${String(streak.count)}`}
            </Body>
          </XStack>
        )}
      </XStack>

      <YStack gap={GAP} testID="history-grid">
        <XStack gap={GAP}>
          <View width={GUTTER} />
          {DAY_LABELS.map((day) => (
            <View key={day.key} flex={1} alignItems="center">
              <Label>{day.label}</Label>
            </View>
          ))}
        </XStack>
        {weeks.map((week, index) => {
          const monthLabel = monthLabelFor(weeks, index);
          return (
            <XStack key={String(week[0]?.day)} gap={GAP}>
              <View width={GUTTER} justifyContent="center">
                {monthLabel === "" ? null : <Label>{monthLabel}</Label>}
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

      <XStack alignItems="center" justifyContent="center" gap={8}>
        <Label>0%</Label>
        {[0, 0.25, 0.5, 0.75, 1].map((share) => (
          <View
            key={share}
            width={12}
            height={12}
            borderRadius={6}
            backgroundColor={winShareColor(share, 1 - share)}
          />
        ))}
        <Label>{`100% won · ${String(played)} played`}</Label>
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
