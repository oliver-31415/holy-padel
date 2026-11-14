import { deleteMatch, getMatch, loadEvents, setMatchNote } from "@holy-padel/db";
import type { SetStats, TeamId } from "@holy-padel/scoring";
import { computeMatch, computeStats } from "@holy-padel/scoring";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import type { ReactNode } from "react";
import { useState } from "react";
import { Alert, Platform, ScrollView, Share } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { View, XStack, YStack } from "tamagui";
import { ConfirmSheet } from "@/components/confirm-sheet.tsx";
import { Button, IconButton, TextField } from "@/components/controls.tsx";
import { Icon } from "@/components/icons.tsx";
import { KeyMomentsCard } from "@/components/key-moments-card.tsx";
import { MatchWorkoutSection } from "@/components/match-workout-section.tsx";
import { MatchRalliesCard } from "@/components/rallies-card.tsx";
import {
  Body,
  Card,
  Display,
  groupCorners,
  Label,
  Pill,
  ProgressBar,
  SectionTitle,
} from "@/components/ui.tsx";
import { useDbMutation, useDbQuery } from "@/db/provider.tsx";
import { isHealthLogAvailable, logMatchWorkout } from "@/health/health-log.ts";
import {
  durationLabel,
  fullDayLabel,
  gameCaption,
  pairInitials,
  playedMs,
  resultLabel,
  setTitle,
  teamNames,
  timeLabel,
} from "@/lib/format.ts";
import { computeGameSeries } from "@/lib/game-series.ts";
import { goBack } from "@/lib/navigation.ts";
import { colors } from "@/theme/colors.ts";

const DEUCE_LABELS: Record<string, string> = {
  advantage: "advantage",
  goldenPoint: "golden point",
  starPoint: "star point",
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
      <YStack gap={8}>
        <TextField
          value={draft}
          onChangeText={setDraft}
          placeholder="e.g. league night, new racket…"
          multiline={true}
          autoFocus={true}
          style={{ minHeight: 72, textAlignVertical: "top" }}
          testID="edit-note-input"
        />
        <XStack gap={8} justifyContent="flex-end">
          <Button
            label="Cancel"
            variant="text"
            size="sm"
            onPress={() => {
              setDraft(initialNote ?? "");
              setEditing(false);
            }}
          />
          <Button label="Save note" variant="tonal" size="sm" onPress={save} testID="save-note" />
        </XStack>
      </YStack>
    );
  }

  return (
    <XStack
      alignItems="center"
      gap={12}
      pressStyle={{ opacity: 0.8 }}
      role="button"
      aria-label={initialNote === undefined ? "Add a note" : "Edit note"}
      onPress={() => {
        setDraft(initialNote ?? "");
        setEditing(true);
      }}
      testID="match-note-row"
    >
      <Icon name="edit" size={20} color={colors.onSurfaceVariant} />
      <Body
        flex={1}
        fontSize={14}
        lineHeight={20}
        color={initialNote === undefined ? colors.onSurfaceVariant : colors.onSurface}
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
      confirmLabel="Delete"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

/** A level stop reads in neutral tones rather than the winner's highlight. */
function resultTones(drew: boolean): {
  readonly hero: string;
  readonly onHero: string;
  readonly name: string;
  readonly bar: string;
} {
  return drew
    ? {
        hero: colors.surfaceContainerHighest,
        onHero: colors.onSurface,
        name: colors.onSurfaceVariant,
        bar: colors.outline,
      }
    : {
        hero: colors.primaryContainer,
        onHero: colors.onPrimaryContainer,
        name: colors.primary,
        bar: colors.primary,
      };
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
  const longestWhere =
    longest === undefined
      ? ""
      : gameCaption(match.config, longest.setNumber, longest.gameNumber).toLowerCase();

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
    <View flex={1} backgroundColor={colors.background}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 8,
          paddingHorizontal: 16,
          paddingBottom: insets.bottom + 24,
          gap: 12,
        }}
        style={{ backgroundColor: colors.background }}
      >
        <XStack alignItems="center" gap={8} marginLeft={-8}>
          <IconButton
            icon="arrowBack"
            label="Back"
            size={48}
            onPress={() => {
              goBack();
            }}
          />
          <Body fontSize={16} fontWeight="500">
            {`${fullDayLabel(match.startedAt)} · ${timeLabel(match.startedAt)}`}
          </Body>
        </XStack>

        <YStack
          backgroundColor={tones.hero}
          borderRadius={36}
          paddingVertical={24}
          paddingHorizontal={20}
          alignItems="center"
        >
          <Display fontSize={24} fontWeight="600" color={tones.onHero} textAlign="center">
            {names[winner]}
          </Display>
          <Body fontSize={14} color={tones.onHero} marginTop={2}>
            {resultLabel(names[loser], drew)}
          </Body>
          <Display
            fontSize={52}
            letterSpacing={-1.5}
            color={tones.onHero}
            marginTop={8}
            textAlign="center"
            testID="overview-score"
          >
            {match.scoreLine ?? ""}
          </Display>
          <Label color={tones.onHero} marginTop={8}>
            {`${durationLabel(stats.durationMs)} · best of ${String(match.config.bestOf)} · ${DEUCE_LABELS[match.config.deuceMode] ?? ""}`}
          </Label>
        </YStack>

        <Card paddingVertical={16} paddingHorizontal={20}>
          <MatchNoteCard matchId={match.id} initialNote={match.note} />
        </Card>

        <YStack gap={2}>
          {stats.sets.map((set, index) => {
            const note = setNote(set, match.config.sport === "squash");
            return (
              <XStack
                key={set.setNumber}
                backgroundColor={colors.card}
                {...groupCorners(index, stats.sets.length)}
                minHeight={72}
                paddingVertical={12}
                paddingHorizontal={20}
                alignItems="center"
                justifyContent="space-between"
              >
                <YStack gap={2}>
                  <Body fontSize={16} fontWeight="500">
                    {setTitle(match.config, set.setNumber)}
                  </Body>
                  <Label>
                    {[`${String(Math.round(set.durationMs / 60_000))} min`, note]
                      .filter((part): part is string => part !== undefined)
                      .join(" · ")}
                  </Label>
                </YStack>
                <XStack alignItems="center" gap={12}>
                  <Display fontSize={24}>
                    {`${String(set.summary.games.A)}–${String(set.summary.games.B)}`}
                  </Display>
                  <Pill
                    backgroundColor={colors.secondaryContainer}
                    height={28}
                    minWidth={48}
                    paddingHorizontal={8}
                  >
                    <Label fontWeight="700" color={colors.onSecondaryContainer}>
                      {initials[set.summary.winner]}
                    </Label>
                  </Pill>
                </XStack>
              </XStack>
            );
          })}
        </YStack>

        <KeyMomentsCard match={match} events={events} />

        <MatchRalliesCard match={match} events={events} />

        <MatchWorkoutSection match={match} series={series} />

        <Card padding={20} gap={16}>
          <SectionTitle>Match totals</SectionTitle>
          <YStack gap={8}>
            <XStack alignItems="center" justifyContent="space-between">
              <YStack gap={2} maxWidth="36%">
                <Display fontSize={22}>{String(pointsWinner)}</Display>
                <Label color={tones.name}>{names[winner]}</Label>
              </YStack>
              <Label>Points won</Label>
              <YStack alignItems="flex-end" gap={2} maxWidth="36%">
                <Display fontSize={22} color={colors.onSurfaceVariant}>
                  {String(pointsLoser)}
                </Display>
                <Label textAlign="right">{names[loser]}</Label>
              </YStack>
            </XStack>
            <ProgressBar share={winnerShare / 100} color={tones.bar} />
          </YStack>
          {/* A match of one game has no "longest" one to single out. */}
          {longest === undefined || longestWhere === "" ? null : (
            <XStack alignItems="center" justifyContent="space-between">
              <Body fontSize={14}>Longest game</Body>
              <Body fontSize={14} fontWeight="600">
                {/* biome-ignore lint/nursery/noUselessTypeConversion: the operands are numbers; the rule misreads the sum as a string */}
                {`${String(longest.points.A + longest.points.B)} points · ${longestWhere}`}
              </Body>
            </XStack>
          )}
          {match.config.sport === "squash" ? (
            stats.longestRun === undefined ? null : (
              <XStack alignItems="center" justifyContent="space-between">
                <Body fontSize={14}>Longest point run</Body>
                <Body fontSize={14} fontWeight="600">
                  {`${names[stats.longestRun.team]} · ${String(stats.longestRun.count)} in a row`}
                </Body>
              </XStack>
            )
          ) : (
            <XStack alignItems="center" justifyContent="space-between">
              <Body fontSize={14}>{serviceHeading(drew, names[winner])}</Body>
              <Body
                fontSize={14}
                fontWeight="600"
              >{`${String(service.held)} / ${String(service.served)}`}</Body>
            </XStack>
          )}
        </Card>

        <XStack alignItems="center" justifyContent="center" flexWrap="wrap" gap={8} marginTop={8}>
          {isHealthLogAvailable() ? (
            <Button
              label={workoutLogged ? "Workout logged" : "Log workout"}
              icon={workoutLogged ? "check" : "heart"}
              variant="tonal"
              size="sm"
              disabled={workoutLogged}
              onPress={logWorkout}
            />
          ) : null}
          <Button
            label="Edit"
            aria-label="Edit match"
            icon="edit"
            variant="tonal"
            size="sm"
            onPress={() => {
              router.push(`/edit-match/${match.id}`);
            }}
          />
          <Button label="Export" icon="share" variant="tonal" size="sm" onPress={exportMatch} />
          <Button
            label="Delete match"
            icon="trash"
            variant="dangerText"
            size="sm"
            onPress={() => {
              setConfirmingDelete(true);
            }}
            testID="delete-match"
          />
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
