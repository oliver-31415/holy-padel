import type { ReactNode } from "react";
import { View } from "tamagui";
import { sportColor } from "@/theme/colors.ts";

/** The small sport marker dot beside a match row's metadata. */
export function SportDot({
  sport,
}: {
  readonly sport: "padel" | "squash" | "pickleball" | undefined;
}): ReactNode {
  return <View width={8} height={8} borderRadius={4} backgroundColor={sportColor(sport)} />;
}
