import type { CourtSide } from "@holy-padel/db";
import { createPlayer, getOwner, updatePlayer } from "@holy-padel/db";
import type { ReactNode } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { YStack } from "tamagui";
import { EditPlayerForm } from "@/components/edit-player-form.tsx";
import { ModalHeader } from "@/components/modal-header.tsx";
import { useDbMutation, useDbQuery } from "@/db/provider.tsx";
import { goBack } from "@/lib/navigation.ts";
import { colors } from "@/theme/colors.ts";

/** Edit the owner's profile — name, club, and preferred court side. */
export default function EditProfileScreen(): ReactNode {
  const insets = useSafeAreaInsets();
  const mutate = useDbMutation();
  const owner = useDbQuery((driver) => getOwner(driver));

  const save = (name: string, club: string, side: CourtSide): void => {
    mutate((driver) => {
      if (owner === undefined) {
        // Create a new owner if one doesn't exist.
        createPlayer(driver, {
          id: `owner-${String(Date.now())}`,
          name,
          club,
          side,
          isOwner: true,
          createdAt: Date.now(),
        });
      } else {
        updatePlayer(driver, owner.id, { name, club, side });
      }
    });
    goBack();
  };

  return (
    <YStack
      flex={1}
      backgroundColor={colors.background}
      paddingTop={insets.top + 8}
      paddingBottom={insets.bottom + 16}
      paddingHorizontal={16}
      gap={16}
    >
      <ModalHeader
        title={owner === undefined ? "Set up your profile" : "Edit profile"}
        onClose={goBack}
        label="Cancel"
      />

      <EditPlayerForm
        initialName={owner?.name ?? ""}
        initialClub={owner?.club ?? ""}
        initialSide={owner?.side ?? "left"}
        onSave={save}
      />
    </YStack>
  );
}
