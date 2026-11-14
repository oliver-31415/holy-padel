import type { CourtSide, PlayerDeleteMode } from "@holy-padel/db";
import { countPlayerMatches, deletePlayer, getPlayer, updatePlayer } from "@holy-padel/db";
import { Redirect, useLocalSearchParams } from "expo-router";
import type { ReactNode } from "react";
import { useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { YStack } from "tamagui";
import { Button } from "@/components/controls.tsx";
import { EditPlayerForm } from "@/components/edit-player-form.tsx";
import { ModalHeader } from "@/components/modal-header.tsx";
import { Sheet } from "@/components/sheet.tsx";
import { Body, Display } from "@/components/ui.tsx";
import { useDbMutation, useDbQuery } from "@/db/provider.tsx";
import { goBack } from "@/lib/navigation.ts";
import { colors } from "@/theme/colors.ts";

/**
 * Edit another player's profile — or delete them, choosing whether their
 * matches go too ("delete profile, keep matches" re-points their match slots
 * at a hidden "Former player" placeholder so the history survives).
 */
export default function EditPlayerScreen(): ReactNode {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const mutate = useDbMutation();
  const player = useDbQuery((driver) => getPlayer(driver, id));
  const matchCount = useDbQuery((driver) => countPlayerMatches(driver, id));
  const [confirming, setConfirming] = useState(false);

  if (player === undefined) {
    return <Redirect href="/" />;
  }
  if (player.isOwner) {
    // The owner edits — and cannot be deleted — via /edit-profile.
    return <Redirect href="/edit-profile" />;
  }

  const save = (name: string, club: string, side: CourtSide): void => {
    mutate((driver) => {
      updatePlayer(driver, id, { name, club, side });
    });
    goBack();
  };

  const remove = (mode: PlayerDeleteMode): void => {
    mutate((driver) => {
      deletePlayer(driver, id, mode);
    });
    goBack();
  };

  const matchWord = matchCount === 1 ? "match" : "matches";

  return (
    <YStack
      flex={1}
      backgroundColor={colors.background}
      paddingTop={insets.top + 8}
      paddingBottom={insets.bottom + 16}
      paddingHorizontal={16}
      gap={16}
    >
      <ModalHeader title="Edit player" onClose={goBack} label="Cancel" />

      <EditPlayerForm
        initialName={player.name}
        initialClub={player.club ?? ""}
        initialSide={player.side ?? "left"}
        onSave={save}
      />

      <Button
        label="Delete player"
        variant="dangerText"
        icon="trash"
        onPress={() => {
          setConfirming(true);
        }}
        testID="delete-player"
      />

      {confirming ? (
        <Sheet
          onDismiss={() => {
            setConfirming(false);
          }}
          dismissLabel="Cancel delete"
        >
          <Display fontSize={24}>{`Delete ${player.name}?`}</Display>
          <Body fontSize={14} lineHeight={20} color={colors.onSurfaceVariant}>
            {matchCount === 0
              ? "This removes the profile from this phone."
              : `${player.name} is in ${String(matchCount)} ${matchWord} on this phone.`}
          </Body>
          {matchCount > 0 ? (
            <>
              <Button
                label="Delete profile, keep matches"
                variant="tonal"
                marginTop={8}
                onPress={() => {
                  remove("keepMatches");
                }}
                testID="delete-keep-matches"
              />
              <Button
                label={`Delete profile + ${String(matchCount)} ${matchWord}`}
                variant="danger"
                onPress={() => {
                  remove("withMatches");
                }}
                testID="delete-with-matches"
              />
            </>
          ) : (
            <Button
              label="Delete player"
              variant="danger"
              marginTop={8}
              onPress={() => {
                remove("withMatches");
              }}
              testID="delete-player-confirm"
            />
          )}
          <Button
            label="Cancel"
            variant="text"
            onPress={() => {
              setConfirming(false);
            }}
          />
        </Sheet>
      ) : null}
    </YStack>
  );
}
