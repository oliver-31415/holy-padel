import type { ReactNode } from "react";
import { View } from "tamagui";
import { colors } from "@/theme/colors.ts";

/** The W/L share bar from the partner and player screens. Draws count toward the total, not the win share. */
export function RecordBar({
  won,
  lost,
  drew = 0,
}: {
  readonly won: number;
  readonly lost: number;
  readonly drew?: number;
}): ReactNode {
  const total = won + lost + drew;
  const share = total === 0 ? 0 : won / total;
  return (
    <View
      width={104}
      height={7}
      borderRadius={999}
      backgroundColor={colors.greige}
      overflow="hidden"
    >
      <View width={`${String(share * 100)}%`} height="100%" backgroundColor={colors.accent} />
    </View>
  );
}
