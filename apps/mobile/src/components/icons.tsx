import type { ReactNode } from "react";
import Svg, { Path } from "react-native-svg";
import { ICON_PATHS, type IconName } from "@/components/icon-paths.ts";
import { colors } from "@/theme/colors.ts";

export type { IconName } from "@/components/icon-paths.ts";

/**
 * A Material Symbol (Rounded). Icons are drawn from path data rather than the
 * icon font, so they render identically on iOS, Android and web and only the
 * glyphs the app uses are shipped. Default size is Material's 24dp.
 */
export function Icon({
  name,
  size = 24,
  color = colors.onSurface,
}: {
  readonly name: IconName;
  readonly size?: number;
  readonly color?: string;
}): ReactNode {
  return (
    <Svg width={size} height={size} viewBox="0 -960 960 960">
      <Path d={ICON_PATHS[name]} fill={color} />
    </Svg>
  );
}
