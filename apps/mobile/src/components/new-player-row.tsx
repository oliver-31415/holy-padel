import type { ReactNode } from "react";
import { useState } from "react";
import { TextInput } from "react-native";
import { View, XStack } from "tamagui";
import { Icon } from "@/components/icons.tsx";
import { colors } from "@/theme/colors.ts";

/** The "New player" input row — shared by the picker sheet and the players card. */
export function NewPlayerRow({
  onCreate,
  onCreated,
  placeholder = "New player",
}: {
  readonly onCreate: (name: string) => void;
  readonly onCreated?: () => void;
  readonly placeholder?: string;
}): ReactNode {
  const [newName, setNewName] = useState("");
  return (
    <XStack alignItems="center" gap={16} paddingVertical={10} paddingHorizontal={16}>
      <View
        width={40}
        height={40}
        borderRadius={20}
        backgroundColor={colors.secondaryContainer}
        alignItems="center"
        justifyContent="center"
      >
        <Icon name="add" color={colors.onSecondaryContainer} />
      </View>
      <TextInput
        style={{
          flex: 1,
          fontSize: 16,
          fontFamily: "GoogleSansFlex_500Medium",
          color: colors.onSurface,
          padding: 0,
        }}
        placeholder={placeholder}
        placeholderTextColor={colors.onSurfaceVariant}
        value={newName}
        onChangeText={setNewName}
        onSubmitEditing={() => {
          if (newName.trim() !== "") {
            onCreate(newName.trim());
            setNewName("");
            onCreated?.();
          }
        }}
        returnKeyType="done"
      />
    </XStack>
  );
}
