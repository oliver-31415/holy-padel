import type { MatchSummary, TeamPlayers } from "@holy-padel/db";
import { getMatch, listRoster, setMatchLocation, updateMatchPlayers } from "@holy-padel/db";
import { Redirect, useLocalSearchParams } from "expo-router";
import type { ReactNode } from "react";
import { useState } from "react";
import { ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { View, YStack } from "tamagui";
import { Button, TextField } from "@/components/controls.tsx";
import { ModalHeader } from "@/components/modal-header.tsx";
import { MatchPickerSheet } from "@/components/new-match-parts.tsx";
import { TeamFaceoff } from "@/components/team-faceoff.tsx";
import { Label } from "@/components/ui.tsx";
import { useDbMutation, useDbQuery } from "@/db/provider.tsx";
import { goBack } from "@/lib/navigation.ts";
import { useMatchLineup } from "@/lib/use-match-lineup.ts";
import { colors } from "@/theme/colors.ts";

/** The names the match already carries, by player id — for anyone no longer on the roster. */
function slotNames(match: MatchSummary): Map<string, string> {
  const names = new Map<string, string>();
  for (const team of ["A", "B"] as const) {
    match.players[team].forEach((id, index) => {
      const name = match.names[team][index];
      if (id !== undefined && name !== undefined) {
        names.set(id, name);
      }
    });
  }
  return names;
}

/**
 * The editable half of the screen. Split from the route so its state can be
 * seeded from the match, which is only known once the query has answered.
 */
function EditMatchForm({ match }: { readonly match: MatchSummary }): ReactNode {
  const insets = useSafeAreaInsets();
  const mutate = useDbMutation();
  const roster = useDbQuery(listRoster);
  // One player a side is a singles match; the format itself is not editable.
  const format = match.players.A[1] === undefined ? "singles" : "doubles";
  // In doubles the first Team A slot stays put (it is you), as on the setup screen.
  const [first] = match.players.A;
  const lineup = useMatchLineup(
    {
      teamA1: first,
      ...(match.players.A[1] === undefined ? {} : { partner: match.players.A[1] }),
      teamB: match.players.B.filter((id): id is string => id !== undefined),
    },
    first,
  );
  const [location, setLocation] = useState(match.location ?? "");

  const original = slotNames(match);
  const nameOf = (id: string | undefined): string =>
    id === undefined
      ? ""
      : (roster.find((entry) => entry.id === id)?.name ?? original.get(id) ?? "");
  const ready = lineup.readyFor(format);

  const save = (): void => {
    const [opponent1, opponent2] = lineup.teamB;
    if (!ready || opponent1 === undefined) {
      return;
    }
    const players: TeamPlayers =
      format === "singles"
        ? { A: [lineup.teamA1, undefined], B: [opponent1, undefined] }
        : { A: [first, lineup.partner], B: [opponent1, opponent2] };
    mutate((driver) => {
      updateMatchPlayers(driver, match.id, players);
      setMatchLocation(driver, match.id, location.trim());
    });
    goBack();
  };

  return (
    <View flex={1} backgroundColor={colors.background}>
      <YStack paddingTop={insets.top + 8} paddingHorizontal={16} paddingBottom={8}>
        <ModalHeader title="Edit match" onClose={goBack} label="Cancel" />
        <Label marginLeft={48}>The score and the rallies stay as they were played</Label>
      </YStack>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, gap: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        <TeamFaceoff
          format={format}
          teamANames={[
            format === "singles" ? nameOf(lineup.teamA1) : nameOf(first),
            nameOf(lineup.partner),
          ]}
          teamBNames={[nameOf(lineup.teamB[0]), nameOf(lineup.teamB[1])]}
          onPickTeamA={() => {
            lineup.setPicking("A");
          }}
          onPickTeamB={() => {
            lineup.setPicking("B");
          }}
        />
        <TextField
          label="Where"
          value={location}
          onChangeText={setLocation}
          placeholder="Club or venue (optional)"
          testID="edit-match-location"
        />
      </ScrollView>

      <YStack
        paddingHorizontal={16}
        paddingTop={12}
        paddingBottom={insets.bottom + 12}
        backgroundColor={colors.background}
      >
        {/* Not `disabled`: with a slot still empty the tap is simply a no-op. */}
        <Button label="Save changes" opacity={ready ? 1 : 0.5} onPress={save} testID="save-match" />
      </YStack>

      {lineup.picking === undefined ? null : (
        <MatchPickerSheet
          picking={lineup.picking}
          format={format}
          roster={roster}
          teamA1={lineup.teamA1}
          teamB={lineup.teamB}
          ownerId={first}
          partnerSelection={lineup.partnerSelection()}
          togglePick={(id) => {
            lineup.togglePick(id, format);
          }}
          mutate={mutate}
          setPicking={lineup.setPicking}
        />
      )}
    </View>
  );
}

/**
 * Correct a finished match after the fact: who played, and where. The rallies —
 * and so the score and every stat computed from them — are never edited here.
 */
export default function EditMatchScreen(): ReactNode {
  const { id } = useLocalSearchParams<{ id: string }>();
  const match = useDbQuery((driver) => getMatch(driver, id));
  if (match === undefined) {
    // Deleted or unknown match (stale link): recover home.
    return <Redirect href="/" />;
  }
  return <EditMatchForm match={match} />;
}
