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
import { Button } from "@/components/controls.tsx";
import { HistoryGrid } from "@/components/history-grid.tsx";
import { Icon } from "@/components/icons.tsx";
import { useLiveConflictGuard } from "@/components/live-conflict-sheet.tsx";
import {
  Avatar,
  Body,
  Card,
  Display,
  Label,
  LiveDot,
  ResultBadge,
  SectionTitle,
} from "@/components/ui.tsx";
import { WatchPill } from "@/components/watch-status.tsx";
import { useDbMutation, useDbQuery } from "@/db/provider.tsx";
import {
  durationLabel,
  liveScoreLine,
  opponentsOf,
  ownerTeamOf,
  pairInitials,
  pairLabel,
  setInPlayLabel,
} from "@/lib/format.ts";
import { computeHistory } from "@/lib/history.ts";
import { closeLiveMatch, rematchConfig } from "@/lib/match-actions.ts";
import { newMatchId } from "@/lib/navigation.ts";
import { useNow } from "@/lib/use-now.ts";
import { colors, sportColor } from "@/theme/colors.ts";
import { useWatchLink } from "@/watch/use-watch-connection.ts";

function pointCallOf(snapshot: MatchSnapshot, team: "A" | "B"): string {
  const game = snapshot.currentGame;
  if (game === undefined) {
    return "";
  }
  return game.kind === "standard" ? game.calls[team] : String(game.points[team]);
}

/** The sport marker tag on the live card — small fill, dark text. */
function SportTag({
  sport,
}: {
  readonly sport: "padel" | "squash" | "pickleball" | undefined;
}): ReactNode {
  const name = sport ?? "padel";
  return (
    <View
      backgroundColor={sportColor(sport)}
      borderRadius={8}
      height={24}
      justifyContent="center"
      paddingHorizontal={8}
    >
      <Label fontWeight="600" color={colors.onSport}>
        {name.charAt(0).toUpperCase() + name.slice(1)}
      </Label>
    </View>
  );
}

/** One team's line on the live card: initials, then the point call. */
function LivePointRow({
  initials,
  call,
  testID,
}: {
  readonly initials: string;
  readonly call: string;
  readonly testID: string;
}): ReactNode {
  return (
    <XStack alignItems="center" gap={12}>
      <Body fontSize={22} fontWeight="500" color={colors.onPrimaryContainer} width={64}>
        {initials}
      </Body>
      <Display fontSize={36} color={colors.onPrimaryContainer} testID={testID}>
        {call}
      </Display>
    </XStack>
  );
}

/** The hero card for the match in play: the highlight colour, edge to edge. */
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
  const meta = [setInPlayLabel(snapshot), clock].filter((part) => part !== "").join(" · ");
  return (
    <View backgroundColor={colors.primaryContainer} borderRadius={36} padding={20} gap={16}>
      <XStack alignItems="center" justifyContent="space-between">
        <XStack alignItems="center" gap={8}>
          <XStack
            alignItems="center"
            gap={6}
            height={24}
            paddingHorizontal={8}
            borderRadius={8}
            backgroundColor={colors.onPrimaryContainer}
          >
            <LiveDot size={6} color={colors.primaryContainer} />
            <Label fontWeight="600" color={colors.primaryContainer}>
              Live now
            </Label>
          </XStack>
          <SportTag sport={match.config.sport} />
        </XStack>
        <Label color={colors.onPrimaryContainer}>{meta}</Label>
      </XStack>
      <XStack alignItems="center" justifyContent="space-between">
        <YStack gap={4}>
          <LivePointRow
            initials={pairInitials(match.names.A)}
            call={pointCallOf(snapshot, "A")}
            testID="home-point-A"
          />
          <LivePointRow
            initials={pairInitials(match.names.B)}
            call={pointCallOf(snapshot, "B")}
            testID="home-point-B"
          />
        </YStack>
        <YStack alignItems="flex-end">
          <Label color={colors.onPrimaryContainer}>Set scores</Label>
          <Display
            fontSize={24}
            color={colors.onPrimaryContainer}
            marginTop={2}
            testID="home-score-line"
          >
            {liveScoreLine(snapshot)}
          </Display>
        </YStack>
      </XStack>
      <Button
        label="Resume scoring"
        trailingIcon="arrowForward"
        backgroundColor={colors.onPrimaryContainer}
        contentColor={colors.primaryContainer}
        onPress={() => {
          router.push(`/live/${match.id}`);
        }}
      />
    </View>
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
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{
        paddingTop: insets.top + 8,
        paddingHorizontal: 16,
        paddingBottom: insets.bottom + 96,
        gap: 12,
      }}
    >
      <XStack alignItems="center" gap={16} paddingTop={8}>
        <Avatar letter={owner?.name.charAt(0) ?? "?"} size={56} shape="cookie" />
        <YStack flex={1}>
          <Label>{owner?.club ?? "Holy Padel"}</Label>
          <Display fontSize={28}>{owner === undefined ? "Welcome" : `Hola, ${owner.name}`}</Display>
        </YStack>
        <WatchPill link={watch} />
      </XStack>

      {live !== undefined && liveSnapshot !== undefined ? (
        <LiveCard match={live} snapshot={liveSnapshot} now={now} />
      ) : null}

      {owner === undefined ? (
        // A fresh install: nothing can be scored until there is a profile to score it for.
        <Card padding={20} gap={12}>
          <YStack gap={4}>
            <SectionTitle>Set up your profile</SectionTitle>
            <Body fontSize={14} lineHeight={20} color={colors.onSurfaceVariant}>
              Add your name so matches and stats are recorded as yours. It stays on this phone.
            </Body>
          </YStack>
          <Button
            label="Set up profile"
            icon="person"
            onPress={() => {
              router.push("/edit-profile");
            }}
          />
        </Card>
      ) : (
        <XStack gap={8}>
          {/* The primary (filled) CTA only when no match is live. */}
          <Button
            flex={1.4}
            size="lg"
            label="New match"
            icon="add"
            variant={live === undefined ? "filled" : "tonal"}
            paddingHorizontal={8}
            onPress={() => {
              router.push("/new-match");
            }}
          />
          <YStack
            flex={1}
            height={72}
            borderRadius={24}
            backgroundColor={colors.card}
            alignItems="center"
            justifyContent="center"
            paddingHorizontal={12}
            pressStyle={{ opacity: 0.8, borderRadius: 16 }}
            role="button"
            onPress={() => {
              if (lastFinished !== undefined) {
                rematchGuard.request();
              }
            }}
          >
            <XStack alignItems="center" gap={4}>
              <Icon name="replay" size={18} color={colors.primary} />
              <Body fontSize={14} fontWeight="600" color={colors.primary}>
                Rematch
              </Body>
            </XStack>
            <Label numberOfLines={1}>
              {lastFinished === undefined
                ? "no matches yet"
                : `vs ${pairLabel(opponentsOf(lastFinished, ownerTeamOf(lastFinished, ownerId)))}`}
            </Label>
          </YStack>
        </XStack>
      )}

      <Card
        paddingVertical={16}
        paddingHorizontal={20}
        flexDirection="row"
        alignItems="center"
        justifyContent="space-between"
      >
        <SectionTitle>Form</SectionTitle>
        <XStack gap={6}>
          {stats.form.map((outcome, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: the strip is positional by design
            <ResultBadge key={index} won={outcome === "won"} drew={outcome === "drew"} size={28} />
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
