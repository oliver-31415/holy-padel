import type { CourtSide } from "@holy-padel/db";
import type { ReactNode } from "react";
import { useState } from "react";
import { XStack, YStack } from "tamagui";
import { Button, TextField } from "@/components/controls.tsx";
import { Body, Label } from "@/components/ui.tsx";
import { colors } from "@/theme/colors.ts";

const SIDES: readonly CourtSide[] = ["left", "right"];

/**
 * The name/club/side form shared by the owner's edit-profile screen and the
 * per-player edit screen. Owns its text state; reports a trimmed save.
 */
export function EditPlayerForm({
  initialName,
  initialClub = "",
  initialSide,
  onSave,
}: {
  readonly initialName: string;
  readonly initialClub?: string;
  readonly initialSide: CourtSide;
  readonly onSave: (name: string, club: string, side: CourtSide) => void;
}): ReactNode {
  const [name, setName] = useState(initialName);
  const [club, setClub] = useState(initialClub);
  const [side, setSide] = useState<CourtSide>(initialSide);

  return (
    <>
      <YStack gap={16}>
        <TextField
          label="Name"
          value={name}
          onChangeText={setName}
          placeholder="Player name"
          autoCapitalize="words"
          testID="edit-name"
        />
        <TextField
          label="Club"
          value={club}
          onChangeText={setClub}
          placeholder="Club (optional)"
          testID="edit-club"
        />
        <YStack gap={8}>
          <Label>Preferred side</Label>
          <XStack gap={2}>
            {SIDES.map((option, index) => {
              const selected = side === option;
              const inner = selected ? 28 : 8;
              return (
                <XStack
                  key={option}
                  flex={1}
                  height={56}
                  borderTopLeftRadius={index === 0 ? 28 : inner}
                  borderBottomLeftRadius={index === 0 ? 28 : inner}
                  borderTopRightRadius={index === 0 ? inner : 28}
                  borderBottomRightRadius={index === 0 ? inner : 28}
                  alignItems="center"
                  justifyContent="center"
                  backgroundColor={selected ? colors.primary : colors.surfaceContainerHighest}
                  pressStyle={{ opacity: 0.85 }}
                  role="button"
                  aria-label={`Play ${option} side`}
                  aria-pressed={selected}
                  onPress={() => {
                    setSide(option);
                  }}
                  testID={`side-${option}`}
                >
                  <Body
                    fontSize={16}
                    fontWeight="500"
                    color={selected ? colors.onPrimary : colors.onSurfaceVariant}
                  >
                    {option === "left" ? "Left" : "Right"}
                  </Body>
                </XStack>
              );
            })}
          </XStack>
        </YStack>
      </YStack>

      <XStack flex={1} />

      {/* Not `disabled`: an empty name leaves the tap a no-op, as before. */}
      <Button
        label="Save"
        aria-label="Save profile"
        opacity={name.trim() === "" ? 0.5 : 1}
        onPress={() => {
          if (name.trim() !== "") {
            onSave(name.trim(), club.trim(), side);
          }
        }}
        testID="save-profile"
      />
    </>
  );
}
