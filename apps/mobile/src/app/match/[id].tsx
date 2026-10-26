import { deleteMatch, getMatch, loadEvents, setMatchNote } from "@holy-padel/db";
import type { SetStats, TeamId } from "@holy-padel/scoring";
import { computeMatch, computeStats } from "@holy-padel/scoring";
import { Redirect, useLocalSearchParams } from "expo-router";
import type { ReactNode } from "react";
import { useState } from "react";
import { Alert, Platform, ScrollView, Share, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { View, XStack, YStack } from "tamagui";
import { ConfirmSheet } from "@/components/confirm-sheet.tsx";
import { ChevronLeft } from "@/components/icons.tsx";
import { KeyMomentsCard } from "@/components/key-moments-card.tsx";
import { MatchWorkoutSection } from "@/components/match-workout-section.tsx";
import { MatchRalliesCard } from "@/components/rallies-card.tsx";
import { Body, Card, Display, Overline, Pill } from "@/components/ui.tsx";
import { useDbMutation, useDbQuery } from "@/db/provider.tsx";
import { isHealthLogAvailable, logMatchWorkout } from "@/health/health-log.ts";
import {
  durationLabel,
  fullDayLabel,
  pairInitials,
  playedMs,
  resultLabel,
  teamNames,
  timeLabel,
} from "@/lib/format.ts";
import { computeGameSeries } from "@/lib/game-series.ts";
import { goBack } from "@/lib/navigation.ts";
import { colors, textAlpha, whiteAlpha } from "@/theme/colors.ts";

const DEUCE_LABELS: Record<string, string> = {
  advantage: "ADVANTAGE",
  goldenPoint: "GOLDEN POINT",
  starPoint: "STAR POINT",
};

function setNote(set: SetStats, isSquash: boolean): string | undefined {
  // Squash games have no breaks or tie-breaks to narrate — each game is its
  // own "set" in the data model, so the padel note reads as nonsense there.
  if (isSquash) {
    return;
  }
  if (set.summary.kind === "superTieBreak") {
    return "Super tie-break";
  }
  if (set.summary.tieBreak !== undefined) {
    const { A, B } = set.summary.tieBreak;
    return `Tie-break ${String(Math.max(A, B))}–${String(Math.min(A, B))}`;
  }
  const lastBreak = set.breakGames.at(-1);
  return lastBreak === undefined ? undefined : `Break in game ${String(lastBreak.gameNumber)}`;
}

/** The editable free-text note — add context before or after the fact. */
function MatchNoteCard({
  matchId,
  initialNote,
}: {
  readonly matchId: string;
  readonly initialNote: string | undefined;
}): ReactNode {
  const mutate = useDbMutation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialNote ?? "");

  const save = (): void => {
    mutate((driver) => {
      setMatchNote(driver, matchId, draft.trim());
    });
    setEditing(false);
  };

  if (editing) {
    return (
      <YStack gap={9}>
        <TextInput
          style={{
            fontSize: 14,
            fontFamily: "Archivo_600SemiBold",
            color: colors.text,
            paddingVertical: 11,
            paddingHorizontal: 14,
            backgroundColor: colors.card,
            borderRadius: 13,
            borderWidth: 1,
            borderColor: textAlpha(0.1),
            minHeight: 66,
            textAlignVertical: "top",
          }}
          value={draft}
          onChangeText={setDraft}
          placeholder="e.g. league night, new racket…"
          placeholderTextColor={textAlpha(0.4)}
          multiline={true}
          autoFocus={true}
          testID="edit-note-input"
        />
        <XStack gap={9} justifyContent="flex-end">
          <Body
            fontSize={11.5}
            fontWeight="800"
            letterSpacing={1.2}
            color={textAlpha(0.45)}
            pressStyle={{ opacity: 0.6 }}
            role="button"
            onPress={() => {
              setDraft(initialNote ?? "");
              setEditing(false);
            }}
          >
            CANCEL
          </Body>
          <Body
            fontSize={11.5}
            fontWeight="800"
            letterSpacing={1.2}
            color={colors.accentOnCard}
            pressStyle={{ opacity: 0.6 }}
            role="button"
            onPress={save}
            testID="save-note"
          >
            SAVE NOTE
          </Body>
        </XStack>
      </YStack>
    );
  }

  return (
    <XStack
      alignItems="center"
      gap={10}
      pressStyle={{ opacity: 0.8 }}
      role="button"
      aria-label={initialNote === undefined ? "Add a note" : "Edit note"}
      onPress={() => {
        setDraft(initialNote ?? "");
        setEditing(true);
      }}
      testID="match-note-row"
    >
      <Body
        flex={1}
        fontSize={13}
        fontWeight="600"
        color={textAlpha(initialNote === undefined ? 0.4 : 0.75)}
      >
        {initialNote ?? "Add a note — league night, how it felt…"}
      </Body>
    </XStack>
  );
}

/**
 * The delete confirmation, split out so the overview's cognitive complexity
 * stays inside the linter budget (the branch lives in this tiny component).
 */
function DeleteConfirm({
  visible,
  onConfirm,
  onCancel,
}: {
  readonly visible: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}): ReactNode {
  if (!visible) {
    return null;
  }
  return (
    <ConfirmSheet
      title="Delete match?"
      message="This removes the match and its points from this phone."
      confirmLabel="DELETE"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

/** A level stop reads in neutral tones rather than the winner's accent. */
function resultTones(drew: boolean): {
  readonly score: string;
  readonly name: string;
  readonly bar: string;
} {
  return drew
    ? { score: whiteAlpha(0.7), name: textAlpha(0.6), bar: textAlpha(0.3) }
    : { score: colors.accent, name: colors.accentOnCard, bar: colors.accent };
}

/** A level stop credits the service games to the anchor side, so name that side. */
function serviceHeading(drew: boolean, name: string): string {
  return drew ? `${name} service games held` : "Service games held";
}

export default function MatchOverviewScreen(): ReactNode {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const mutate = useDbMutation();
  const [workoutLogged, setWorkoutLogged] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const match = useDbQuery((driver) => getMatch(driver, id));
  const events = useDbQuery((driver) => loadEvents(driver, id));

  if (match === undefined) {
    // Deleted or unknown match (stale link, back after delete): recover home.
    return <Redirect href="/" />;
  }
  if (match.status === "live") {
    // The overview is for finished matches — a live one belongs on the scoreboard.
    return <Redirect href={`/live/${match.id}`} />;
  }

  const snapshot = computeMatch(match.config, events);
  const stats = computeStats(match.config, events);
  const series = computeGameSeries(match.config, events);
  const names = teamNames(match);
  // A level early stop has no winner: "A" only anchors the team-keyed stats below.
  const drew = match.winner === undefined;
  const winner: TeamId = match.winner ?? "A";
  const loser: TeamId = winner === "A" ? "B" : "A";
  const initials = { A: pairInitials(match.names.A), B: pairInitials(match.names.B) };
  const tones = resultTones(drew);

  const pointsWinner = snapshot.totalPoints[winner];
  const pointsLoser = snapshot.totalPoints[loser];
  const pointsTotal = pointsWinner + pointsLoser;
  const winnerShare = pointsTotal === 0 ? 50 : (pointsWinner / pointsTotal) * 100;

  const service = stats.service[winner];
  const longest = stats.longestGame;

  const deleteConfirmed = (): void => {
    mutate((driver) => {
      deleteMatch(driver, id);
    });
    goBack();
  };

  const exportMatch = (): void => {
    void Share.share({
      message: `${names[winner]} ${drew ? "drew with" : "def."} ${names[loser]} ${match.scoreLine ?? ""} · ${durationLabel(stats.durationMs)}`,
    });
  };

  const healthAppName = Platform.OS === "ios" ? "Apple Health" : "Health Connect";
  const logWorkout = (): void => {
    const endedAt = match.endedAt ?? match.startedAt + stats.durationMs;
    // Exclude paused breaks so the logged duration is real play time.
    const activeEnd = match.startedAt + playedMs(match, endedAt);
    void logMatchWorkout(match.startedAt, activeEnd).then((ok) => {
      if (ok) {
        setWorkoutLogged(true);
      } else {
        Alert.alert(
          "Could not log workout",
          `Allow Holy Padel to write workouts in ${healthAppName}, then try again.`,
        );
      }
    });
  };

  return (
    <View flex={1} backgroundColor={colors.screen}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 12,
          paddingHorizontal: 16,
          paddingBottom: insets.bottom + 24,
          gap: 13,
        }}
        style={{ backgroundColor: colors.screen }}
      >
        <XStack alignItems="center" justifyContent="space-between">
          <View
            width={38}
            height={38}
            borderRadius={19}
            backgroundColor={colors.card}
            alignItems="center"
            justifyContent="center"
            boxShadow="0 2px 8px rgba(14, 17, 22, 0.08)"
            pressStyle={{ opacity: 0.8 }}
            role="button"
            aria-label="Back"
            onPress={() => {
              goBack();
            }}
          >
            <ChevronLeft size={15} color={colors.text} />
          </View>
          <Body fontSize={11} fontWeight="800" letterSpacing={1.6} color={textAlpha(0.45)}>
            {[fullDayLabel(match.startedAt), timeLabel(match.startedAt), match.court?.toUpperCase()]
              .filter((part): part is string => part !== undefined)
              .join(" · ")}
          </Body>
          <View width={38} />
        </XStack>

        <YStack
          backgroundColor={colors.ink}
          borderRadius={22}
          paddingVertical={22}
          paddingHorizontal={20}
          alignItems="center"
        >
          <Display fontSize={26} color={colors.white}>
            {names[winner].toUpperCase()}
          </Display>
          <Body
            fontSize={10}
            fontWeight="800"
            letterSpacing={1.6}
            color={whiteAlpha(0.4)}
            marginTop={4}
          >
            {resultLabel(names[loser], drew)}
          </Body>
          <Display fontSize={58} color={tones.score} marginTop={12} testID="overview-score">
            {match.scoreLine ?? ""}
          </Display>
          <Body
            fontSize={11}
            fontWeight="700"
            letterSpacing={1.4}
            color={whiteAlpha(0.45)}
            marginTop={10}
          >
            {`${durationLabel(stats.durationMs)} · BEST OF ${String(match.config.bestOf)} · ${DEUCE_LABELS[match.config.deuceMode] ?? ""}`}
          </Body>
        </YStack>

        <Card borderRadius={18} paddingVertical={13} paddingHorizontal={17}>
          <MatchNoteCard matchId={match.id} initialNote={match.note} />
        </Card>

        <YStack gap={8}>
          {stats.sets.map((set) => {
            const note = setNote(set, match.config.sport === "squash");
            return (
              <Card
                key={set.setNumber}
                borderRadius={17}
                paddingVertical={14}
                paddingHorizontal={17}
                flexDirection="row"
                alignItems="center"
                justifyContent="space-between"
              >
                <YStack gap={3}>
                  <Overline letterSpacing={1.4}>
                    {`${match.config.sport === "squash" ? "GAME" : "SET"} ${String(set.setNumber)} · ${String(Math.round(set.durationMs / 60_000))} MIN`}
                  </Overline>
                  {note === undefined ? null : (
                    <Body fontSize={13} fontWeight="700" color={textAlpha(0.55)}>
                      {note}
                    </Body>
                  )}
                </YStack>
                <XStack alignItems="center" gap={11}>
                  <Display fontSize={26}>
                    {`${String(set.summary.games.A)}–${String(set.summary.games.B)}`}
                  </Display>
                  <Pill
                    backgroundColor={colors.accent}
                    borderRadius={7}
                    paddingVertical={4}
                    paddingHorizontal={8}
                  >
                    <Display fontSize={11} letterSpacing={0.5} color={colors.onAccent}>
                      {initials[set.summary.winner]}
                    </Display>
                  </Pill>
                </XStack>
              </Card>
            );
          })}
        </YStack>

        <KeyMomentsCard match={match} events={events} />

        <MatchRalliesCard match={match} events={events} />

        <MatchWorkoutSection match={match} series={series} />

        <Card borderRadius={20} paddingVertical={16} paddingHorizontal={17} gap={13}>
          <Overline>MATCH TOTALS</Overline>
          <YStack gap={6}>
            <XStack alignItems="center" justifyContent="space-between">
              <YStack alignItems="center" gap={1} maxWidth="32%">
                <Display fontSize={16}>{String(pointsWinner)}</Display>
                <Body fontSize={9} fontWeight="800" color={tones.name} textAlign="center">
                  {names[winner].toUpperCase()}
                </Body>
              </YStack>
              <Body fontSize={10} fontWeight="800" letterSpacing={1.3} color={textAlpha(0.4)}>
                POINTS WON
              </Body>
              <YStack alignItems="center" gap={1} maxWidth="32%">
                <Display fontSize={16} color={textAlpha(0.45)}>
                  {String(pointsLoser)}
                </Display>
                <Body fontSize={9} fontWeight="800" color={textAlpha(0.4)} textAlign="center">
                  {names[loser].toUpperCase()}
                </Body>
              </YStack>
            </XStack>
            <XStack height={8} borderRadius={999} overflow="hidden" gap={2}>
              <View flex={winnerShare} backgroundColor={tones.bar} />
              <View flex={100 - winnerShare} backgroundColor={colors.greige} />
            </XStack>
          </YStack>
          {longest === undefined ? null : (
            <XStack alignItems="center" justifyContent="space-between">
              <Body fontSize={13} fontWeight="700">
                Longest game
              </Body>
              <Display fontSize={15}>
                {/* biome-ignore lint/nursery/noUselessTypeConversion: the operands are numbers; the rule misreads the sum as a string */}
                {`${String(longest.points.A + longest.points.B)} POINTS · GAME ${String(
                  longest.gameNumber,
                )}`}
              </Display>
            </XStack>
          )}
          {match.config.sport === "squash" ? (
            stats.longestRun === undefined ? null : (
              <XStack alignItems="center" justifyContent="space-between">
                <Body fontSize={13} fontWeight="700">
                  Longest point run
                </Body>
                <Display fontSize={15}>
                  {`${names[stats.longestRun.team]} · ${String(stats.longestRun.count)} in a row`}
                </Display>
              </XStack>
            )
          ) : (
            <XStack alignItems="center" justifyContent="space-between">
              <Body fontSize={13} fontWeight="700">
                {serviceHeading(drew, names[winner])}
              </Body>
              <Display
                fontSize={15}
              >{`${String(service.held)} / ${String(service.served)}`}</Display>
            </XStack>
          )}
        </Card>

        <XStack alignItems="center" justifyContent="center" gap={18} marginTop={8}>
          {isHealthLogAvailable() ? (
            <>
              <Body
                fontSize={11}
                fontWeight="800"
                letterSpacing={1.3}
                color={workoutLogged ? colors.accentOnCard : textAlpha(0.45)}
                pressStyle={{ opacity: 0.6 }}
                role="button"
                onPress={workoutLogged ? undefined : logWorkout}
              >
                {workoutLogged ? "WORKOUT LOGGED ✓" : "LOG WORKOUT"}
              </Body>
              <View width={3} height={3} borderRadius={2} backgroundColor={textAlpha(0.25)} />
            </>
          ) : null}
          <Body
            fontSize={11}
            fontWeight="800"
            letterSpacing={1.3}
            color={textAlpha(0.45)}
            pressStyle={{ opacity: 0.6 }}
            role="button"
            onPress={exportMatch}
          >
            EXPORT
          </Body>
          <View width={3} height={3} borderRadius={2} backgroundColor={textAlpha(0.25)} />
          <Body
            fontSize={11}
            fontWeight="800"
            letterSpacing={1.3}
            color={colors.danger}
            pressStyle={{ opacity: 0.6 }}
            role="button"
            onPress={() => {
              setConfirmingDelete(true);
            }}
            testID="delete-match"
          >
            DELETE MATCH
          </Body>
        </XStack>
      </ScrollView>
      <DeleteConfirm
        visible={confirmingDelete}
        onConfirm={deleteConfirmed}
        onCancel={() => {
          setConfirmingDelete(false);
        }}
      />
    </View>
  );
}
