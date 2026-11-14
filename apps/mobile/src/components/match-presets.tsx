import type { MatchPreset } from "@holy-padel/db";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { Pressable, ScrollView } from "react-native";
import { View, XStack } from "tamagui";
import { Button, Chip, TextField } from "@/components/controls.tsx";
import { Icon } from "@/components/icons.tsx";
import { MatchSetupOptions } from "@/components/new-match-parts.tsx";
import { Sheet } from "@/components/sheet.tsx";
import { Body, Display } from "@/components/ui.tsx";
import { useKeyboardInset } from "@/lib/use-keyboard-inset.ts";
import type { MatchSetupState } from "@/lib/use-match-setup.ts";
import { colors, sportColor } from "@/theme/colors.ts";

/** The sheet chrome shared by the edit and save sheets. */
function SheetShell({
  onClose,
  children,
}: {
  readonly onClose: () => void;
  readonly children: ReactNode;
}): ReactNode {
  // Edge-to-edge Android doesn't shrink the window for the keyboard: lift the
  // sheet by its height or the preset name field and Save sit hidden under it.
  const keyboard = useKeyboardInset();
  return (
    <Sheet
      onDismiss={onClose}
      dismissLabel="Close"
      scrimTestID="sheet-backdrop"
      paddingHorizontal={16}
      maxHeight="90%"
      {...(keyboard > 0 ? { bottomInset: keyboard } : {})}
    >
      {children}
    </Sheet>
  );
}

/** Press feedback for a Pressable that wraps plain (non-pressable) content. */
function pressedOpacity(opacity: number) {
  return ({ pressed }: { readonly pressed: boolean }) => ({ opacity: pressed ? opacity : 1 });
}

/** A recent opponent's name chip; tapping it fills Team B. */
export function RecentOpponentChip({
  label,
  onPress,
}: {
  readonly label: string;
  readonly onPress: () => void;
}): ReactNode {
  return <Chip label={label} aria-label={`Play ${label}`} onPress={onPress} />;
}

/** One saved-preset chip; tonal fill when it matches the setup on screen. */
function PresetChip({
  preset,
  active,
  onPress,
  onLongPress,
}: {
  readonly preset: MatchPreset;
  readonly active: boolean;
  readonly onPress: () => void;
  readonly onLongPress: () => void;
}): ReactNode {
  return (
    <Pressable
      onPress={onPress}
      // delayLongPress matches the app's other long-press affordances so the
      // Playwright `click({ delay })` and a real thumb agree.
      delayLongPress={600}
      onLongPress={onLongPress}
      role="button"
      aria-label={preset.name}
      aria-pressed={active}
      // The Pressable owns the touch and the press feedback. A pressStyle on
      // the inner XStack would make it a second responder that swallows the
      // tap on native (web bubbles it, so the bug only shows on device).
      style={pressedOpacity(0.85)}
    >
      <XStack
        alignItems="center"
        gap={8}
        height={32}
        backgroundColor={active ? colors.secondaryContainer : "transparent"}
        borderWidth={1}
        borderColor={active ? "transparent" : colors.outlineVariant}
        borderRadius={8}
        paddingHorizontal={12}
      >
        <View
          width={8}
          height={8}
          borderRadius={4}
          backgroundColor={sportColor(preset.setup.sport)}
        />
        <Body
          fontSize={14}
          fontWeight="500"
          color={active ? colors.onSecondaryContainer : colors.onSurfaceVariant}
        >
          {preset.name}
        </Body>
      </XStack>
    </Pressable>
  );
}

/**
 * The horizontal preset row: one chip per saved preset, then the
 * "Save setup" affordance. Tapping a chip fills every rule at once.
 */
export function PresetChips({
  presets,
  isActive,
  onApply,
  onDelete,
  onSave,
}: {
  readonly presets: readonly MatchPreset[];
  readonly isActive: (preset: MatchPreset) => boolean;
  readonly onApply: (preset: MatchPreset) => void;
  readonly onDelete: (preset: MatchPreset) => void;
  readonly onSave: () => void;
}): ReactNode {
  return (
    <ScrollView
      horizontal={true}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, paddingRight: 4, alignItems: "center" }}
      testID="preset-chips"
    >
      {presets.map((preset) => (
        <PresetChip
          key={preset.id}
          preset={preset}
          active={isActive(preset)}
          onPress={() => {
            onApply(preset);
          }}
          onLongPress={() => {
            onDelete(preset);
          }}
        />
      ))}
      <Pressable
        onPress={onSave}
        role="button"
        aria-label="Save setup as preset"
        style={pressedOpacity(0.7)}
      >
        <XStack alignItems="center" gap={4} height={32} borderRadius={8} paddingHorizontal={8}>
          <Icon name="bookmarkAdd" size={18} color={colors.primary} />
          <Body fontSize={14} fontWeight="500" color={colors.primary}>
            Save setup
          </Body>
        </XStack>
      </Pressable>
    </ScrollView>
  );
}

/** The scrollable `MatchSetupOptions` body plus the sheet's two footer buttons. */
function RulesEditBody({
  state,
  teamLabels,
  onClose,
  onSaveAsPreset,
}: {
  readonly state: MatchSetupState;
  readonly teamLabels: { readonly A: string; readonly B: string } | undefined;
  readonly onClose: () => void;
  readonly onSaveAsPreset: () => void;
}): ReactNode {
  const { setup } = state;
  // `MatchSetupOptions` still clamps a squash best-of-5 down to 3 when the
  // sport changes away from squash. That guard reads the *old* sport and
  // could fight the remembered setup this sheet just restored — swallow it
  // exactly when it rides a sport switch (cleared once the commit lands).
  const switchingSport = useRef(false);
  useEffect(() => {
    switchingSport.current = false;
  });
  return (
    <>
      <ScrollView
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ gap: 12, paddingBottom: 4 }}
        keyboardShouldPersistTaps="handled"
      >
        <MatchSetupOptions
          format={setup.format}
          setFormat={(format) => {
            state.update({ format });
          }}
          sport={setup.sport}
          setSport={(sport) => {
            switchingSport.current = true;
            state.setSport(sport);
          }}
          bestOf={setup.bestOf}
          setBestOf={(bestOf) => {
            if (switchingSport.current) {
              return;
            }
            state.update({ bestOf });
          }}
          thirdSet={setup.thirdSet}
          setThirdSet={(thirdSet) => {
            state.update({ thirdSet });
          }}
          deuceMode={setup.deuceMode}
          setDeuceMode={(deuceMode) => {
            state.update({ deuceMode });
          }}
          firstServe={setup.firstServe}
          setFirstServe={(firstServe) => {
            state.update({ firstServe });
          }}
          squashMode={setup.squashMode}
          setSquashMode={(squashMode) => {
            state.update({ squashMode });
          }}
          squashTarget={setup.squashTarget}
          setSquashTarget={(squashTarget) => {
            state.update({ squashTarget });
          }}
          squashTiebreak={setup.squashTiebreak}
          setSquashTiebreak={(squashTiebreak) => {
            state.update({ squashTiebreak });
          }}
          squashServeBoxes={setup.squashServeBoxes}
          setSquashServeBoxes={(squashServeBoxes) => {
            state.update({ squashServeBoxes });
          }}
          pbTarget={setup.pbTarget}
          setPbTarget={(pbTarget) => {
            state.update({ pbTarget });
          }}
          pbTiebreak={setup.pbTiebreak}
          setPbTiebreak={(pbTiebreak) => {
            state.update({ pbTiebreak });
          }}
          teamLabels={teamLabels}
        />
      </ScrollView>
      <XStack gap={8}>
        <Button
          flex={1}
          label="Save as preset"
          variant="tonal"
          paddingHorizontal={8}
          onPress={onSaveAsPreset}
        />
        <Button flex={1} label="Use these rules" paddingHorizontal={8} onPress={onClose} />
      </XStack>
    </>
  );
}

/**
 * The rules editor sheet — the full `MatchSetupOptions` in a scrollable body,
 * with a secondary "save as preset" and the primary "use these rules".
 */
export function RulesEditSheet({
  state,
  teamLabels,
  onClose,
  onSaveAsPreset,
}: {
  readonly state: MatchSetupState;
  readonly teamLabels: { readonly A: string; readonly B: string } | undefined;
  readonly onClose: () => void;
  readonly onSaveAsPreset: () => void;
}): ReactNode {
  return (
    <SheetShell onClose={onClose}>
      <RulesEditBody
        state={state}
        teamLabels={teamLabels}
        onClose={onClose}
        onSaveAsPreset={onSaveAsPreset}
      />
    </SheetShell>
  );
}

/** The save-preset sheet: name the current setup. */
export function SavePresetSheet({
  value,
  onChange,
  onSave,
  onCancel,
}: {
  readonly value: string;
  readonly onChange: (next: string) => void;
  readonly onSave: () => void;
  readonly onCancel: () => void;
}): ReactNode {
  return (
    <SheetShell onClose={onCancel}>
      <Display fontSize={24} paddingHorizontal={8}>
        Save preset
      </Display>
      <TextField
        value={value}
        onChangeText={onChange}
        placeholder="Preset name"
        autoFocus={true}
        testID="preset-name"
      />
      <Button label="Save preset" onPress={onSave} testID="save-preset" />
    </SheetShell>
  );
}
