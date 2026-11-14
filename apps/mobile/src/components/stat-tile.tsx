import type { ReactNode } from "react";
import { View } from "tamagui";
import { Display, Label } from "@/components/ui.tsx";
import { colors } from "@/theme/colors.ts";

/** A profile stat tile: a tonal container with an emphasized value. */
export function StatTile({
  value,
  label,
  variant,
}: {
  readonly value: string;
  readonly label: string;
  readonly variant: "surface" | "primary" | "tonal";
}): ReactNode {
  const palette = {
    surface: { background: colors.card, content: colors.onSurface },
    primary: { background: colors.primaryContainer, content: colors.onPrimaryContainer },
    tonal: { background: colors.secondaryContainer, content: colors.onSecondaryContainer },
  }[variant];
  return (
    <View
      flex={1}
      backgroundColor={palette.background}
      borderRadius={28}
      paddingVertical={20}
      alignItems="center"
      gap={2}
    >
      <Display fontSize={28} color={palette.content}>
        {value}
      </Display>
      <Label color={palette.content}>{label}</Label>
    </View>
  );
}
