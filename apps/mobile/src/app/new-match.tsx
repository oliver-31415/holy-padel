import type { MatchPreset, TeamPlayers } from "@holy-padel/db";
import {
  clearMatchDraft,
  createMatch,
  deleteMatchPreset,
  getOwner,
  listMatches,
  listRoster,
  loadMatchPresets,
  saveLastSetup,
  saveMatchPreset,
} from "@holy-padel/db";
import { Redirect, router } from "expo-router";
import type { ReactNode } from "react";
import { useMemo, useRef, useState } from "react";
import { ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { View, YStack } from "tamagui";
import { ConfirmSheet } from "@/components/confirm-sheet.tsx";
import { useLiveConflictGuard } from "@/components/live-conflict-sheet.tsx";
import { MatchNoteInput } from "@/components/match-note-input.tsx";
import { PresetChips, RulesEditSheet, SavePresetSheet } from "@/components/match-presets.tsx";
import { ModalHeader } from "@/components/modal-header.tsx";
import {
  MatchPickerSheet,
  matchSubtitle,
  StartMatchButton,
} from "@/components/new-match-parts.tsx";
import { RecentOpponents } from "@/components/recent-opponents.tsx";
import { RulesSummaryCard } from "@/components/rules-summary.tsx";
import { TeamFaceoff } from "@/components/team-faceoff.tsx";
import { Label } from "@/components/ui.tsx";
import { useDbMutation, useDbQuery } from "@/db/provider.tsx";
import { sameSetup, setupTitle } from "@/lib/format.ts";
import { closeLiveMatch } from "@/lib/match-actions.ts";
import { buildConfig } from "@/lib/match-config-builder.ts";
import { goBack, newMatchId } from "@/lib/navigation.ts";
import { newPresetId } from "@/lib/preset-id.ts";
import { useMatchDraftPersistence } from "@/lib/use-match-draft.ts";
import { useMatchLineup } from "@/lib/use-match-lineup.ts";
import { useMatchSetup } from "@/lib/use-match-setup.ts";
import { colors } from "@/theme/colors.ts";

export default function NewMatchScreen(): ReactNode {
  const insets = useSafeAreaInsets();
  const mutate = useDbMutation();
  const owner = useDbQuery(getOwner);
  const roster = useDbQuery(listRoster);
  const ownerId = owner?.id ?? "nico";
  const matches = useDbQuery(listMatches);
  const state = useMatchSetup();
  const { setup } = state;
  const presets = useDbQuery(loadMatchPresets);
  const lineup = useMatchLineup(state.draft, ownerId);

  const [editingRules, setEditingRules] = useState(false);
  const [savingPreset, setSavingPreset] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [deleting, setDeleting] = useState<MatchPreset | undefined>(undefined);

  const nameOf = (id: string | undefined): string =>
    id === undefined ? "" : (roster.find((entry) => entry.id === id)?.name ?? owner?.name ?? "");
  // The sheet's "First serve" labels use the picked singles players' names,
  // exactly like the old inline card.
  const teamLabels =
    setup.format === "singles" && nameOf(lineup.teamA1) !== "" && nameOf(lineup.teamB[0]) !== ""
      ? { A: nameOf(lineup.teamA1), B: nameOf(lineup.teamB[0]) }
      : undefined;

  // The full setup (rules AND picked players) persists on every change so
  // leaving the screen and coming back restores the work in progress.
  const setupDraft = useMemo(
    () => ({
      ...setup,
      teamA1: lineup.teamA1,
      ...(lineup.partner === undefined ? {} : { partner: lineup.partner }),
      teamB: lineup.teamB,
      ...(lineup.note.trim() === "" ? {} : { note: lineup.note.trim() }),
    }),
    [setup, lineup.teamA1, lineup.partner, lineup.teamB, lineup.note],
  );
  useMatchDraftPersistence(setupDraft);

  const started = useRef(false);
  const startMatch = (): void => {
    // Snapshot into consts: narrowing state inside the mutate closure won't
    // survive, and element access resets after intervening calls.
    const [opponent1, opponent2] = lineup.teamB;
    const partnerId = lineup.partner;
    let players: TeamPlayers;
    if (setup.format === "singles") {
      if (opponent1 === undefined) {
        return;
      }
      // One player per team — the second slot stays empty.
      players = { A: [lineup.teamA1, undefined], B: [opponent1, undefined] };
    } else {
      if (partnerId === undefined || opponent1 === undefined || opponent2 === undefined) {
        return;
      }
      players = { A: [ownerId, partnerId], B: [opponent1, opponent2] };
    }
    if (started.current) {
      return;
    }
    started.current = true;
    const id = newMatchId();
    /** A team's preferred box, from the saved player preference (default right). */
    const boxFor = (playerId: string): "right" | "left" =>
      roster.find((entry) => entry.id === playerId)?.side ?? "right";
    const trimmedNote = lineup.note.trim();
    mutate((driver) => {
      // Only one match is ever live: a still-live one is saved as it stands.
      closeLiveMatch(driver, Date.now());
      const isFirstServePending = setup.firstServe === "undecided";
      const firstServeId = isFirstServePending ? "A" : setup.firstServe;
      const config = buildConfig({
        sport: setup.sport,
        bestOf: setup.bestOf,
        thirdSet: setup.thirdSet,
        deuceMode: setup.deuceMode,
        squashMode: setup.squashMode,
        squashTarget: setup.squashTarget,
        squashTiebreak: setup.squashTiebreak,
        squashServeBoxes: setup.squashServeBoxes,
        pbType: setup.format,
        pbTarget: setup.pbTarget,
        pbTiebreak: setup.pbTiebreak,
        firstServe: firstServeId,
        firstServePending: isFirstServePending,
        resolveServeBox: boxFor,
        teamA1: lineup.teamA1,
        opponent1,
      });
      createMatch(driver, {
        id,
        config,
        players,
        ...(owner?.club === undefined ? {} : { location: owner.club }),
        ...(trimmedNote === "" ? {} : { note: trimmedNote }),
        startedAt: Date.now(),
      });
      clearMatchDraft(driver);
      // Remember this sport's rules so switching back to it restores them.
      saveLastSetup(driver, setup);
    });
    router.replace(`/live/${id}`);
  };

  const liveGuard = useLiveConflictGuard(ownerId, startMatch);

  const savePreset = (): void => {
    const name = presetName.trim();
    if (name === "") {
      return;
    }
    mutate((driver) => {
      saveMatchPreset(driver, { id: newPresetId(), name, setup });
    });
    setSavingPreset(false);
    setPresetName("");
  };

  const openSaveSheet = (): void => {
    setEditingRules(false);
    setPresetName(setupTitle(setup));
    setSavingPreset(true);
  };

  if (owner === undefined) {
    // A fresh install has no profile yet, and a match needs its owner as a
    // player row — set the profile up first, then come back.
    return <Redirect href="/edit-profile" />;
  }

  return (
    <View flex={1} backgroundColor={colors.background}>
      {/* Fixed top bar — the icon back button always offers a way out. */}
      <YStack paddingTop={insets.top + 8} paddingHorizontal={16} paddingBottom={8}>
        <ModalHeader title="New match" onClose={goBack} label="Cancel" />
        <Label marginLeft={48}>{matchSubtitle(setup.format, setup.sport)}</Label>
      </YStack>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, gap: 12 }}>
        <PresetChips
          presets={presets}
          isActive={(preset) => sameSetup(preset.setup, setup)}
          onApply={(preset) => {
            state.applyPreset(preset.setup);
          }}
          onDelete={setDeleting}
          onSave={openSaveSheet}
        />

        <TeamFaceoff
          format={setup.format}
          teamANames={[
            setup.format === "singles" ? nameOf(lineup.teamA1) : (owner?.name ?? "Nico"),
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

        <RecentOpponents
          matches={matches}
          ownerId={ownerId}
          format={setup.format}
          onPick={lineup.setTeamB}
        />

        <RulesSummaryCard
          setup={setup}
          onEdit={() => {
            setEditingRules(true);
          }}
        />

        <MatchNoteInput value={lineup.note} onChange={lineup.setNote} />
      </ScrollView>

      <StartMatchButton
        ready={lineup.readyFor(setup.format)}
        onStart={liveGuard.request}
        bottomInset={insets.bottom}
      />

      {liveGuard.sheet}

      {lineup.picking === undefined ? null : (
        <MatchPickerSheet
          picking={lineup.picking}
          format={setup.format}
          roster={roster}
          teamA1={lineup.teamA1}
          teamB={lineup.teamB}
          ownerId={ownerId}
          partnerSelection={lineup.partnerSelection()}
          togglePick={(id) => {
            lineup.togglePick(id, setup.format);
          }}
          mutate={mutate}
          setPicking={lineup.setPicking}
        />
      )}

      {editingRules ? (
        <RulesEditSheet
          state={state}
          teamLabels={teamLabels}
          onClose={() => {
            setEditingRules(false);
          }}
          onSaveAsPreset={openSaveSheet}
        />
      ) : null}

      {savingPreset ? (
        <SavePresetSheet
          value={presetName}
          onChange={setPresetName}
          onSave={savePreset}
          onCancel={() => {
            setSavingPreset(false);
          }}
        />
      ) : null}

      {deleting === undefined ? null : (
        <ConfirmSheet
          title="Delete preset?"
          message={`“${deleting.name}” will be removed from your presets.`}
          confirmLabel="Delete"
          onConfirm={() => {
            const { id } = deleting;
            setDeleting(undefined);
            mutate((driver) => {
              deleteMatchPreset(driver, id);
            });
          }}
          onCancel={() => {
            setDeleting(undefined);
          }}
        />
      )}
    </View>
  );
}
