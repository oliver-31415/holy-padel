import type { MatchSummary } from "@holy-padel/db";
import {
  createMatch,
  deleteMatch,
  getLiveMatch,
  getMatch,
  getOwner,
  loadEvents,
  pauseMatch,
  removeLastEvent,
  resumeMatch,
  setPendingGameSet,
} from "@holy-padel/db";
import type { MatchSnapshot, PointEvent, TeamId } from "@holy-padel/scoring";
import { computeMatch, computeStats, statusLabel } from "@holy-padel/scoring";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { View, YStack } from "tamagui";
import { EndSheet } from "@/components/end-sheet.tsx";
import {
  LiveActionBar,
  LiveHeader,
  SetChips,
  SetChoiceSheet,
  TeamCard,
} from "@/components/live-parts.tsx";
import { MatchWon } from "@/components/match-won.tsx";
import { Display, Pill } from "@/components/ui.tsx";
import { SavedIndicator, WatchSyncLine } from "@/components/watch-status.tsx";
import { useDbMutation, useDbQuery } from "@/db/provider.tsx";
import { durationLabel, playedMs, pointDisplay, teamNames } from "@/lib/format.ts";
import { scoreHaptic, undoHaptic } from "@/lib/haptics.ts";
import {
  closeLiveMatch,
  recordPoint,
  rematchConfig,
  stopAndSaveMatch,
  undoMatchPoint,
} from "@/lib/match-actions.ts";
import { goHome, newMatchId } from "@/lib/navigation.ts";
import { useNow } from "@/lib/use-now.ts";
import { colors } from "@/theme/colors.ts";
import { acknowledgeWon } from "@/watch/gather-input.ts";
import { useWatchLink } from "@/watch/use-watch-connection.ts";

function squashTargetOf(snapshot: MatchSnapshot): number {
  return snapshot.config.sport === "squash" ? snapshot.config.squashTarget : 11;
}

/** The status-pill call while a long/short decision is staged for the next rally. */
function stagedChoiceLabel(staged: "one" | "two", target: number): string {
  return staged === "one" ? `SHORT · TO ${String(target)}` : `LONG · TO ${String(target + 1)}`;
}

/**
 * The result screen for a decided match. The deciding rally already saved it
 * (`recordPoint`); this only offers rematch and undo.
 */
function FinishedMatch({
  match,
  snapshot,
  events,
  now,
  ownerId,
}: {
  readonly match: MatchSummary;
  readonly snapshot: MatchSnapshot;
  readonly events: readonly PointEvent[];
  readonly now: number;
  readonly ownerId: string;
}): ReactNode {
  const { id } = match;
  const mutate = useDbMutation();
  // Undoing a finished match point is only offered while no other match is live.
  const liveId = useDbQuery((driver) => getLiveMatch(driver)?.id);
  const rematchStarted = useRef(false);
  return (
    <MatchWon
      match={match}
      snapshot={snapshot}
      stats={computeStats(match.config, events)}
      now={now}
      ownerId={ownerId}
      onDone={() => {
        mutate(acknowledgeWon);
        goHome();
      }}
      onRematch={() => {
        if (rematchStarted.current) {
          return;
        }
        rematchStarted.current = true;
        const rematchId = newMatchId();
        mutate((driver) => {
          // A match the watch started meanwhile is saved, not orphaned.
          closeLiveMatch(driver, Date.now());
          createMatch(driver, {
            id: rematchId,
            config: rematchConfig(match.config),
            players: match.players,
            ...(match.court === undefined ? {} : { court: match.court }),
            ...(match.location === undefined ? {} : { location: match.location }),
            startedAt: Date.now(),
          });
        });
        router.replace(`/live/${rematchId}`);
      }}
      {...(liveId === undefined || liveId === id
        ? {
            onUndo: () => {
              undoHaptic();
              mutate((driver) => {
                undoMatchPoint(driver, id);
              });
            },
          }
        : {})}
    />
  );
}

export default function LiveScreen(): ReactNode {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const now = useNow(10_000);
  const mutate = useDbMutation();
  const [ending, setEnding] = useState(false);
  // Transient "HAND OUT" flash for HI-HO: a receiver's rally changes the serve
  // without moving the score, and without feedback it looks like a dead tap.
  const [handOut, setHandOut] = useState(false);
  const handOutTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(
    () => () => {
      if (handOutTimer.current !== undefined) {
        clearTimeout(handOutTimer.current);
      }
    },
    [],
  );

  const match = useDbQuery((driver) => getMatch(driver, id));
  const owner = useDbQuery(getOwner);
  const ownerId = owner?.id ?? "nico";
  // Connection status is polled app-wide; called before any early return so
  // finishing the match (which renders MatchWon) doesn't change the hook count.
  const watch = useWatchLink();
  const events = useDbQuery((driver) => loadEvents(driver, id));
  const snapshot = match === undefined ? undefined : computeMatch(match.config, events);

  if (match === undefined || snapshot === undefined) {
    // Deleted or unknown match (stale link, back after discard): recover home.
    return <Redirect href="/" />;
  }

  const names = teamNames(match);

  if (snapshot.finished) {
    return (
      <FinishedMatch
        match={match}
        snapshot={snapshot}
        events={events}
        now={now}
        ownerId={ownerId}
      />
    );
  }

  const paused = match.pausedAt !== undefined;

  const scorePoint = (team: TeamId): void => {
    scoreHaptic();
    // HI-HO only: the receiver winning a rally is a hand-out — the serve
    // changes hands and no point is scored. (An unstaged choice point refuses
    // the tap entirely, so it must not flash.)
    const isHandOut =
      match.config.sport === "squash" &&
      match.config.squashMode === "hiho" &&
      match.pausedAt === undefined &&
      snapshot.servingTeam !== undefined &&
      snapshot.servingTeam !== team &&
      !(snapshot.moment.kind === "setChoice" && match.pendingGameSet === undefined);
    // recordPoint re-reads committed state and refuses once the match is
    // paused or decided. It also resolves undecided first serves (game 1 and
    // pickleball games 2+), attaches a staged squash long/short decision, and
    // saves the result on the deciding rally — so the phone, the watch, and
    // replays all share one code path.
    mutate((driver) => {
      recordPoint(driver, id, team, Date.now());
    });
    if (isHandOut) {
      setHandOut(true);
      if (handOutTimer.current !== undefined) {
        clearTimeout(handOutTimer.current);
      }
      handOutTimer.current = setTimeout(() => {
        setHandOut(false);
      }, 1400);
    }
  };

  const chooseGameSet = (choice: "one" | "two"): void => {
    mutate((driver) => {
      setPendingGameSet(driver, id, choice);
    });
  };

  const undoPoint = (): void => {
    if (events.length === 0) {
      return;
    }
    undoHaptic();
    mutate((driver) => {
      removeLastEvent(driver, id);
    });
  };

  const togglePause = (): void => {
    mutate((driver) => {
      if (match.pausedAt === undefined) {
        pauseMatch(driver, id, Date.now());
      } else {
        resumeMatch(driver, id, Date.now());
      }
    });
  };

  const stopAndSave = (): void => {
    mutate((driver) => {
      stopAndSaveMatch(driver, id, Date.now());
    });
    goHome();
  };

  const discardMatch = (): void => {
    mutate((driver) => {
      deleteMatch(driver, id);
    });
    goHome();
  };

  const squashTarget = squashTargetOf(snapshot);
  // The staged long/short decision lives in the ledger row, so a choice made
  // on the watch closes the phone's popup too (and vice versa).
  const choicePending = snapshot.moment.kind === "setChoice";
  const staged = match.pendingGameSet;
  const label =
    choicePending && staged !== undefined
      ? stagedChoiceLabel(staged, squashTarget)
      : statusLabel(snapshot.moment, names, snapshot.config.sport);
  return (
    <View flex={1} backgroundColor={colors.screen}>
      <YStack
        flex={1}
        paddingTop={insets.top + 10}
        paddingBottom={insets.bottom + 14}
        paddingHorizontal={16}
        gap={12}
      >
        <LiveHeader
          paused={paused}
          court={match.court}
          sport={match.config.sport}
          setNumber={snapshot.setNumber}
          clock={durationLabel(playedMs(match, now))}
        />

        <SetChips match={match} snapshot={snapshot} />

        <YStack flex={1} gap={10} opacity={paused ? 0.4 : 1}>
          <TeamCard
            name={names.A}
            point={pointDisplay(snapshot, "A")}
            testID="point-A"
            serving={snapshot.servingTeam === "A"}
            servingSide={snapshot.servingSide}
            serverNumber={
              snapshot.currentGame?.kind === "pickleball" ? snapshot.currentGame.serverNumber : null
            }
            hint={snapshot.servingTeam === undefined ? "TAP TO TAKE SERVE" : undefined}
            onScore={() => {
              scorePoint("A");
            }}
          />
          <TeamCard
            name={names.B}
            point={pointDisplay(snapshot, "B")}
            testID="point-B"
            serving={snapshot.servingTeam === "B"}
            servingSide={snapshot.servingSide}
            serverNumber={
              snapshot.currentGame?.kind === "pickleball" ? snapshot.currentGame.serverNumber : null
            }
            hint={snapshot.servingTeam === undefined ? "TAP TO TAKE SERVE" : undefined}
            onScore={() => {
              scorePoint("B");
            }}
          />
        </YStack>

        {handOut ? (
          <Pill
            alignSelf="center"
            backgroundColor={colors.accent}
            paddingVertical={10}
            paddingHorizontal={22}
            testID="hand-out-pill"
          >
            <Display fontSize={15} letterSpacing={1.5} color={colors.onAccent}>
              HAND OUT
            </Display>
          </Pill>
        ) : null}

        {!handOut && label !== undefined ? (
          <Pill
            alignSelf="center"
            backgroundColor={colors.ink}
            paddingVertical={10}
            paddingHorizontal={22}
            testID="status-pill"
          >
            <Display fontSize={15} letterSpacing={1.5} color={colors.accent}>
              {label}
            </Display>
          </Pill>
        ) : null}

        <LiveActionBar
          paused={paused}
          onUndo={undoPoint}
          onTogglePause={togglePause}
          onEnd={() => {
            setEnding(true);
          }}
        />

        {events.length > 0 ? <SavedIndicator /> : null}
        <WatchSyncLine link={watch} paused={paused} />
      </YStack>

      {ending ? (
        <EndSheet
          onStopSave={stopAndSave}
          onDiscard={discardMatch}
          onCancel={() => {
            setEnding(false);
          }}
        />
      ) : null}

      {!paused && choicePending && staged === undefined && (
        <SetChoiceSheet target={squashTarget} onChoose={chooseGameSet} />
      )}
    </View>
  );
}
