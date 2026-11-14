import type { ReactNode } from "react";
import { Pressable } from "react-native";
import { View, XStack, YStack } from "tamagui";
import { Icon } from "@/components/icons.tsx";
import { Body, Label } from "@/components/ui.tsx";
import { useDbQuery } from "@/db/provider.tsx";
import { loadColorSetting } from "@/theme/color-setting.ts";
import { ACCENT_CHOICES, colors, TEAM_B_CHOICES } from "@/theme/colors.ts";
import { useSetColorSetting } from "@/theme/theme.tsx";

/** One swatch: round at rest, a soft square with a check when picked. */
function Swatch({
  color,
  label,
  selected,
  onPress,
  testID,
}: {
  readonly color: string;
  readonly label: string;
  readonly selected: boolean;
  readonly onPress: () => void;
  readonly testID: string;
}): ReactNode {
  // A plain Pressable around non-pressable content: an inner pressStyle would
  // become a second responder and swallow the tap on native.
  return (
    <Pressable
      onPress={onPress}
      role="button"
      aria-label={label}
      aria-selected={selected}
      testID={testID}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      <View
        width={48}
        height={48}
        borderRadius={selected ? 16 : 24}
        backgroundColor={color}
        alignItems="center"
        justifyContent="center"
      >
        {selected ? <Icon name="check" color={colors.onSport} /> : null}
      </View>
    </Pressable>
  );
}

function SwatchRow({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <YStack gap={8}>
      <Body fontSize={16}>{label}</Body>
      <XStack gap={8} flexWrap="wrap">
        {children}
      </XStack>
    </YStack>
  );
}

/**
 * Settings: pick the highlight colour (buttons, live/serve, wins, Team A) and
 * the Team B colour. Applies instantly, like the theme. The phone only — the
 * watches keep their own palette.
 */
export function ColorSettings(): ReactNode {
  const setting = useDbQuery(loadColorSetting);
  const setColor = useSetColorSetting();
  const accent = setting.accent ?? "orange";
  const teamB = setting.teamB ?? "violet";
  return (
    <YStack gap={16}>
      <SwatchRow label="Highlight colour">
        {ACCENT_CHOICES.map((choice) => (
          <Swatch
            key={choice.id}
            color={choice.accent}
            label={`${choice.label} highlight`}
            selected={choice.id === accent}
            onPress={() => {
              setColor("accent", choice.id);
            }}
            testID={`accent-${choice.id}`}
          />
        ))}
      </SwatchRow>
      <SwatchRow label="Team B colour">
        {TEAM_B_CHOICES.map((choice) => (
          <Swatch
            key={choice.id}
            color={choice.color}
            label={`${choice.label} Team B`}
            selected={choice.id === teamB}
            onPress={() => {
              setColor("teamB", choice.id);
            }}
            testID={`teamb-${choice.id}`}
          />
        ))}
      </SwatchRow>
      <Label lineHeight={16}>
        The whole app is tinted from the highlight colour — buttons, the serve and your wins. Team B
        colours the other side.
      </Label>
    </YStack>
  );
}
