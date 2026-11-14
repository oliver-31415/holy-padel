import type { RosterEntry } from "@holy-padel/db";
import type { TeamId } from "@holy-padel/scoring";
import type { ReactNode } from "react";
import { useState } from "react";
import { ScrollView, TextInput } from "react-native";
import { View, XStack, YStack } from "tamagui";
import { Button } from "@/components/controls.tsx";
import { Icon } from "@/components/icons.tsx";
import { NewPlayerRow } from "@/components/new-player-row.tsx";
import { Sheet } from "@/components/sheet.tsx";
import { Avatar, Body, Display, Label } from "@/components/ui.tsx";
import { useKeyboardInset } from "@/lib/use-keyboard-inset.ts";
import { colors } from "@/theme/colors.ts";

function RosterRow({
  entry,
  picked,
  team,
  onToggle,
}: {
  readonly entry: RosterEntry;
  readonly picked: boolean;
  readonly team: TeamId;
  readonly onToggle: (id: string) => void;
}): ReactNode {
  const opponent = team === "B";
  return (
    <XStack
      alignItems="center"
      gap={16}
      backgroundColor={picked ? colors.secondaryContainer : colors.card}
      borderRadius={picked ? 28 : 16}
      paddingVertical={10}
      paddingHorizontal={16}
      pressStyle={{ opacity: 0.85 }}
      role="button"
      onPress={() => {
        onToggle(entry.id);
      }}
    >
      <Avatar
        letter={entry.name.charAt(0)}
        size={40}
        background={opponent ? colors.tertiaryContainer : colors.primaryContainer}
        color={opponent ? colors.onTertiaryContainer : colors.onPrimaryContainer}
      />
      <YStack flex={1}>
        <Body fontSize={16} fontWeight="500">
          {entry.name}
        </Body>
        <Label>
          {`${String(entry.matchesWithOwner)} ${entry.matchesWithOwner === 1 ? "match" : "matches"} with you`}
        </Label>
      </YStack>
      {picked ? (
        <View
          width={24}
          height={24}
          borderRadius={12}
          backgroundColor={colors.primary}
          alignItems="center"
          justifyContent="center"
        >
          <Icon name="check" size={18} color={colors.onPrimary} />
        </View>
      ) : (
        <View
          width={24}
          height={24}
          borderRadius={12}
          borderWidth={2}
          borderColor={colors.outline}
        />
      )}
    </XStack>
  );
}

/** The "pick players" bottom sheet, laid over the match setup screen. */
export function PickerSheet({
  team,
  stepLabel,
  roster,
  selected,
  taken,
  onToggle,
  onCreate,
  onDone,
}: {
  readonly team: TeamId;
  readonly stepLabel: string;
  readonly roster: readonly RosterEntry[];
  readonly selected: readonly string[];
  readonly taken: readonly string[];
  readonly onToggle: (id: string) => void;
  readonly onCreate: (name: string) => void;
  readonly onDone: () => void;
}): ReactNode {
  const [query, setQuery] = useState("");
  // Lift the sheet above the keyboard so search / "New player" stay visible.
  const keyboard = useKeyboardInset();
  const visible = roster.filter(
    (entry) =>
      !taken.includes(entry.id) &&
      (query === "" || entry.name.toLowerCase().includes(query.toLowerCase())),
  );

  return (
    <Sheet
      onDismiss={onDone}
      dismissLabel="Close"
      scrimTestID="picker-backdrop"
      paddingHorizontal={16}
      maxHeight="88%"
      {...(keyboard > 0 ? { bottomInset: keyboard } : {})}
    >
      <XStack alignItems="center" justifyContent="space-between" paddingHorizontal={8}>
        <Display fontSize={22} fontWeight="600">{`Pick team ${team}`}</Display>
        <Label>{stepLabel}</Label>
      </XStack>
      <XStack
        alignItems="center"
        gap={12}
        height={56}
        backgroundColor={colors.surfaceContainerHighest}
        borderRadius={28}
        paddingHorizontal={16}
      >
        <Icon name="search" color={colors.onSurfaceVariant} />
        <TextInput
          style={{
            flex: 1,
            fontSize: 16,
            fontFamily: "GoogleSansFlex_400Regular",
            color: colors.onSurface,
            padding: 0,
          }}
          placeholder="Search players…"
          placeholderTextColor={colors.onSurfaceVariant}
          value={query}
          onChangeText={setQuery}
        />
      </XStack>
      <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 4 }}>
        {visible.map((entry) => (
          <RosterRow
            key={entry.id}
            entry={entry}
            picked={selected.includes(entry.id)}
            team={team}
            onToggle={onToggle}
          />
        ))}
        <NewPlayerRow
          onCreate={onCreate}
          onCreated={() => {
            setQuery("");
          }}
        />
      </ScrollView>
      <Button label="Done" onPress={onDone} />
    </Sheet>
  );
}
