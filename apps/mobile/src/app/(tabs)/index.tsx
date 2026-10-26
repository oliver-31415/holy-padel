import type { MatchSummary } from "@holy-padel/db";
import {
  computeProfileStats,
  createMatch,
  getLiveMatch,
  getOwner,
  listMatches,
  loadEvents,
} from "@holy-padel/db";
import type { MatchSnapshot } from "@holy-padel/scoring";
import { computeMatch } from "@holy-padel/scoring";
import { router, useFocusEffect } from "expo-router";
import type { ReactNode } from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import { ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { View, XStack, YStack } from "tamagui";
import { FloodlightGlow } from "@/components/court-art.tsx";
import { HistoryGrid } from "@/components/history-grid.tsx";
import { ArrowRight, Plus } from "@/components/icons.tsx";
import { useLiveConflictGuard } from "@/components/live-conflict-sheet.tsx";
import { Avatar, Body, Card, Display, LiveDot, Overline, ResultBadge } from "@/components/ui.tsx";
import { WatchPill } from "@/components/watch-status.tsx";
import { useDbMutation, useDbQuery } from "@/db/provider.tsx";
import {
  durationLabel,
  liveScoreLine,
  opponentsOf,
  ownerTeamOf,
  pairInitials,
  pairLabel,
} from "@/lib/format.ts";
import { computeHistory } from "@/lib/history.ts";
import { closeLiveMatch, rematchConfig } from "@/lib/match-actions.ts";
import { newMatchId } from "@/lib/navigation.ts";
import { useNow } from "@/lib/use-now.ts";
import { accentAlpha, colors, sportColor, textAlpha, whiteAlpha } from "@/theme/colors.ts";
import { useWatchLink } from "@/watch/use-watch-connection.ts";

function pointCallOf(snapshot: MatchSnapshot, team: "A" | "B"): string {
  const game = snapshot.currentGame;
  if (game === undefined) {
    return "";
  }
  return game.kind === "standard" ? game.calls[team] : String(game.points[team]);
}

/** The sport marker tag on the live card — small fill, ink text. */
function SportTag({
  sport,
}: {
  readonly sport: "padel" | "squash" | "pickleball" | undefined;
}): ReactNode {
  return (
    <View
      backgroundColor={sportColor(sport)}
      borderRadius={6}
      paddingVertical={3}
      paddingHorizontal={7}
    >
      <Body fontSize={10} fontWeight="800" letterSpacing={1.4} color={colors.onAccent}>
        {(sport ?? "padel").toUpperCase()}
      </Body>
    </View>
  );
}

function LiveCard({
  match,
  snapshot,
  now,
}: {
  readonly match: MatchSummary;
  readonly snapshot: MatchSnapshot;
  readonly now: number;
}): ReactNode {
  const clock = durationLabel(now - match.startedAt);
  const meta = [`SET ${String(snapshot.setNumber)}`, clock, match.court?.toUpperCase()]
    .filter((part): part is string => part !== undefined)
    .join(" · ");
  return (
    <View
      backgroundColor={colors.ink}
      borderRadius={22}
      padding={18}
      gap={12}
      overflow="hidden"
      position="relative"
    >
      <FloodlightGlow color={colors.teamB} opacity={0.28} />
      <XStack alignItems="center" justifyContent="space-between">
        <XStack alignItems="center" gap={6}>
          <LiveDot size={7} />
          <Body fontSize={11} fontWeight="800" letterSpacing={1.5} color={colors.accent}>
            LIVE NOW
          </Body>
          <SportTag sport={match.config.sport} />
        </XStack>
        <Body fontSize={11} fontWeight="700" letterSpacing={1.4} color={whiteAlpha(0.5)}>
          {meta}
        </Body>
      </XStack>
      <XStack alignItems="center" justifyContent="space-between">
        <YStack gap={8}>
          <XStack alignItems="flex-end" gap={12}>
            <Display fontSize={22} color={colors.white} width={64}>
              {pairInitials(match.names.A)}
            </Display>
            <Display fontSize={40} color={colors.accent} testID="home-point-A">
              {pointCallOf(snapshot, "A")}
            </Display>
          </XStack>
          <XStack alignItems="flex-end" gap={12}>
            <Display fontSize={22} color={colors.white} width={64}>
              {pairInitials(match.names.B)}
            </Display>
            <Display fontSize={40} color={colors.white} testID="home-point-B">
              {pointCallOf(snapshot, "B")}
            </Display>
          </XStack>
        </YStack>
        <YStack alignItems="flex-end">
          <Overline color={whiteAlpha(0.4)}>SETS</Overline>
          <Display fontSize={26} color={colors.white} marginTop={3} testID="home-score-line">
            {liveScoreLine(snapshot)}
          </Display>
        </YStack>
      </XStack>
      <XStack
        height={48}
        backgroundColor={colors.accent}
        borderRadius={14}
        alignItems="center"
        justifyContent="center"
        gap={9}
        pressStyle={{ opacity: 0.85 }}
        role="button"
        onPress={() => {
          router.push(`/live/${match.id}`);
        }}
      >
        <Display fontSize={16} letterSpacing={1.4} color={colors.onAccent}>
          RESUME SCORING
        </Display>
        <ArrowRight size={15} color={colors.onAccent} />
      </XStack>
    </View>
  );
}

/** The NEW MATCH action — the primary (orange) CTA only when no match is live. */
function NewMatchButton({ live }: { readonly live: boolean }): ReactNode {
  return (
    <XStack
      flex={1.5}
      height={58}
      backgroundColor={live ? colors.card : colors.accent}
      borderWidth={live ? 2 : 0}
      borderColor={colors.ink}
      borderRadius={16}
      alignItems="center"
      justifyContent="center"
      gap={9}
      boxShadow={live ? "0 2px 10px rgba(14, 17, 22, 0.06)" : `0 6px 18px ${accentAlpha(0.45)}`}
      pressStyle={{ opacity: 0.85 }}
      role="button"
      onPress={() => {
        router.push("/new-match");
      }}
    >
      <Plus size={14} color={live ? colors.text : colors.onAccent} />
      <Display fontSize={16} letterSpacing={1.2} color={live ? colors.text : colors.onAccent}>
        NEW MATCH
      </Display>
    </XStack>
  );
}

export default function HomeScreen(): ReactNode {
  const insets = useSafeAreaInsets();
  const now = useNow();
  const mutate = useDbMutation();
  const watch = useWatchLink();

  const owner = useDbQuery(getOwner);
  const ownerId = owner?.id ?? "nico";
  const live = useDbQuery(getLiveMatch);
  const liveSnapshot = useDbQuery((driver) =>
    live === undefined ? undefined : computeMatch(live.config, loadEvents(driver, live.id)),
  );
  const stats = useDbQuery((driver) => computeProfileStats(driver, ownerId));
  const allMatches = useDbQuery(listMatches);
  const history = useMemo(
    () => computeHistory(allMatches, ownerId, now),
    [allMatches, ownerId, now],
  );
  const [selectedDay, setSelectedDay] = useState<number | undefined>(undefined);
  // The REMATCH target: the most recent finished match.
  const lastFinished = allMatches.find((match) => match.status === "finished");

  const rematchStarted = useRef(false);
  useFocusEffect(
    useCallback(() => {
      rematchStarted.current = false;
    }, []),
  );

  const startRematch = (): void => {
    if (lastFinished === undefined || rematchStarted.current) {
      return;
    }
    rematchStarted.current = true;
    const id = newMatchId();
    mutate((driver) => {
      // Only one match is ever live: a still-live one is saved as it stands.
      closeLiveMatch(driver, Date.now());
      createMatch(driver, {
        id,
        config: rematchConfig(lastFinished.config),
        players: lastFinished.players,
        ...(lastFinished.court === undefined ? {} : { court: lastFinished.court }),
        ...(lastFinished.location === undefined ? {} : { location: lastFinished.location }),
        startedAt: Date.now(),
      });
    });
    router.push(`/live/${id}`);
  };

  // Modal: the sheet must cover the floating tab bar.
  const rematchGuard = useLiveConflictGuard(ownerId, startRematch, true);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.screen }}
      contentContainerStyle={{
        paddingTop: insets.top + 12,
        paddingHorizontal: 16,
        paddingBottom: insets.bottom + 90,
        gap: 12,
      }}
    >
      <XStack alignItems="center" gap={12}>
        <Avatar letter={owner?.name.charAt(0) ?? "N"} size={44} />
        <YStack flex={1}>
          <Overline letterSpacing={1.6}>{owner?.club ?? "Holy Padel"}</Overline>
          <Display fontSize={24}>{`HOLA, ${(owner?.name ?? "").toUpperCase()}`}</Display>
        </YStack>
        <WatchPill link={watch} />
      </XStack>

      {live !== undefined && liveSnapshot !== undefined ? (
        <LiveCard match={live} snapshot={liveSnapshot} now={now} />
      ) : null}

      <XStack gap={8}>
        <NewMatchButton live={live !== undefined} />
        <YStack
          flex={1}
          height={58}
          borderWidth={1}
          borderColor={textAlpha(0.16)}
          borderRadius={16}
          alignItems="center"
          justifyContent="center"
          gap={2}
          pressStyle={{ opacity: 0.7 }}
          role="button"
          onPress={() => {
            if (lastFinished !== undefined) {
              rematchGuard.request();
            }
          }}
        >
          <Body fontSize={10} fontWeight="800" letterSpacing={1.2} color={textAlpha(0.5)}>
            REMATCH
          </Body>
          <Body fontSize={10.5} fontWeight="700" color={textAlpha(0.4)}>
            {lastFinished === undefined
              ? "no matches yet"
              : `vs ${pairLabel(opponentsOf(lastFinished, ownerTeamOf(lastFinished, ownerId)))}`}
          </Body>
        </YStack>
      </XStack>

      <Card
        borderRadius={18}
        paddingVertical={14}
        paddingHorizontal={17}
        flexDirection="row"
        alignItems="center"
        justifyContent="space-between"
      >
        <Overline>FORM</Overline>
        <XStack gap={6}>
          {stats.form.map((outcome, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: the strip is positional by design
            <ResultBadge key={index} won={outcome === "won"} drew={outcome === "drew"} size={24} />
          ))}
        </XStack>
        <Display
          fontSize={16}
        >{`${String(stats.record.won)}–${String(stats.record.lost)}${stats.record.drew === 0 ? "" : `–${String(stats.record.drew)}`}`}</Display>
      </Card>

      <HistoryGrid
        weeks={history.weeks}
        played={history.played}
        won={history.won}
        lost={history.lost}
        drew={history.drew}
        matches={allMatches}
        ownerId={ownerId}
        streak={stats.streak}
        selectedDay={selectedDay}
        onSelectDay={setSelectedDay}
      />

      {rematchGuard.sheet}
    </ScrollView>
  );
}
