import type { ReactNode } from "react";
import { useMemo } from "react";
import Svg, { Path } from "react-native-svg";
import type { TextProps, ViewProps } from "tamagui";
import { Text, View, XStack } from "tamagui";
import { colors } from "@/theme/colors.ts";

/**
 * Material 3 Expressive primitives: type, surfaces and small display atoms
 * (the interactive ones live in `controls.tsx`). These are function components (not Tamagui
 * `styled` exports) on purpose: `styled` snapshots color values at module
 * load, which would freeze the app in whichever theme loaded first — reading
 * `colors` at render time keeps every screen in step with the live theme.
 */

type TextStyleProps = TextProps & {
  readonly color?: string;
};

/**
 * Emphasized Google Sans Flex — score numerals, display and headline text.
 * Bold by default; large sizes read best with slightly negative tracking,
 * which callers set per size.
 */
export function Display({ color, ...rest }: TextStyleProps): ReactNode {
  return (
    <Text fontFamily="$heading" fontWeight="700" color={color ?? colors.onSurface} {...rest} />
  );
}

/** Body and title text. Regular by default; titles pass `fontWeight="500"`. */
export function Body({ color, ...rest }: TextStyleProps): ReactNode {
  return <Text fontFamily="$body" fontWeight="400" color={color ?? colors.onSurface} {...rest} />;
}

/** Label-medium supporting text: captions under numerals, metadata, hints. */
export function Label({ color, ...rest }: TextStyleProps): ReactNode {
  return (
    <Text
      fontFamily="$body"
      fontWeight="500"
      fontSize={12}
      letterSpacing={0.2}
      color={color ?? colors.onSurfaceVariant}
      {...rest}
    />
  );
}

/** Title-small heading at the top of a card. */
export function SectionTitle({ color, ...rest }: TextStyleProps): ReactNode {
  return (
    <Text
      fontFamily="$body"
      fontWeight="600"
      fontSize={14}
      letterSpacing={0.1}
      color={color ?? colors.onSurface}
      {...rest}
    />
  );
}

/** Filled card — a tonal surface, no shadow, extra-large corners. */
export function Card({ children, ...rest }: ViewProps): ReactNode {
  return (
    <View backgroundColor={colors.card} borderRadius={28} {...rest}>
      {children}
    </View>
  );
}

/** Fully rounded container (status pills, tags). */
export function Pill({ children, ...rest }: ViewProps): ReactNode {
  return (
    <View
      borderRadius={999}
      flexDirection="row"
      alignItems="center"
      justifyContent="center"
      {...rest}
    >
      {children}
    </View>
  );
}

/**
 * Corner radii for row `index` of a grouped list: the group's outer corners
 * are large, the seams between rows tight — Material's segmented list.
 */
export function groupCorners(
  index: number,
  count: number,
  outer = 24,
): {
  readonly borderTopLeftRadius: number;
  readonly borderTopRightRadius: number;
  readonly borderBottomLeftRadius: number;
  readonly borderBottomRightRadius: number;
} {
  const top = index === 0 ? outer : 6;
  const bottom = index === count - 1 ? outer : 6;
  return {
    borderTopLeftRadius: top,
    borderTopRightRadius: top,
    borderBottomLeftRadius: bottom,
    borderBottomRightRadius: bottom,
  };
}

/** A chart legend entry: a small round swatch and its label. */
export function LegendKey({
  label,
  color,
}: {
  readonly label: string;
  readonly color: string;
}): ReactNode {
  return (
    <XStack alignItems="center" gap={6}>
      <View width={8} height={8} borderRadius={4} backgroundColor={color} />
      <Label>{label}</Label>
    </XStack>
  );
}

/**
 * Material 3 Expressive's linear progress: a thick rounded active segment, a
 * gap, then the rounded track. `share` is 0–1.
 */
export function ProgressBar({
  share,
  height = 8,
  color = colors.primary,
  ...rest
}: ViewProps & {
  readonly share: number;
  readonly height?: number;
  readonly color?: string;
}): ReactNode {
  const clamped = Math.min(1, Math.max(0, share));
  return (
    <XStack height={height} gap={clamped > 0 && clamped < 1 ? 4 : 0} {...rest}>
      {clamped > 0 ? (
        <View flex={clamped} minWidth={height} borderRadius={height / 2} backgroundColor={color} />
      ) : null}
      {clamped < 1 ? (
        <View
          flex={1 - clamped}
          minWidth={height}
          borderRadius={height / 2}
          backgroundColor={colors.surfaceContainerHighest}
        />
      ) : null}
    </XStack>
  );
}

/** A hairline between rows in a list or card. */
export function Divider(props: ViewProps): ReactNode {
  return <View height={1} backgroundColor={colors.outlineVariant} {...props} />;
}

const COOKIE_LOBES = 9;
const COOKIE_DEPTH = 0.07;
const COOKIE_STEPS = 144;

/** The expressive "cookie" shape: a circle with soft scalloped lobes. */
function cookiePath(size: number): string {
  const center = size / 2;
  const points: string[] = [];
  for (let step = 0; step < COOKIE_STEPS; step += 1) {
    const angle = (step / COOKIE_STEPS) * Math.PI * 2;
    const radius = center * (1 - COOKIE_DEPTH + COOKIE_DEPTH * Math.cos(angle * COOKIE_LOBES));
    const x = center + radius * Math.sin(angle);
    const y = center - radius * Math.cos(angle);
    points.push(`${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  return `M${points.join("L")}Z`;
}

/**
 * Monogram avatar: the highlight colour with its on-colour letter (pass the
 * tertiary pair for Team B). `shape="cookie"` is the expressive scalloped
 * shape, for the one hero avatar on a screen.
 */
export function Avatar({
  letter,
  size = 40,
  background = colors.primaryContainer,
  color = colors.onPrimaryContainer,
  shape = "circle",
}: {
  readonly letter: string;
  readonly size?: number;
  readonly background?: string;
  readonly color?: string;
  readonly shape?: "circle" | "cookie";
}): ReactNode {
  const cookie = useMemo(() => (shape === "cookie" ? cookiePath(size) : ""), [shape, size]);
  return (
    <View
      width={size}
      height={size}
      borderRadius={size / 2}
      backgroundColor={shape === "cookie" ? "transparent" : background}
      alignItems="center"
      justifyContent="center"
      position="relative"
    >
      {shape === "cookie" ? (
        <View position="absolute" top={0} left={0}>
          <Svg width={size} height={size}>
            <Path d={cookie} fill={background} />
          </Svg>
        </View>
      ) : null}
      {/* Explicitly positioned: web lays views out static, which would paint the shape over it. */}
      <Display fontSize={size * 0.42} fontWeight="600" color={color} position="relative">
        {letter.toUpperCase()}
      </Display>
    </View>
  );
}

/** W/L/D chip from the form strips and match rows. A draw is neither a win nor a loss. */
export function ResultBadge({
  won,
  drew = false,
  size = 28,
}: {
  readonly won: boolean;
  readonly drew?: boolean;
  readonly size?: number;
}): ReactNode {
  const letter = drew ? "D" : won ? "W" : "L";
  const win = won && !drew;
  return (
    <View
      width={size}
      height={size}
      // Wins are round, everything else a soft square — shape carries the result too.
      borderRadius={win ? size / 2 : size * 0.3}
      backgroundColor={win ? colors.primaryContainer : colors.surfaceContainerHighest}
      alignItems="center"
      justifyContent="center"
    >
      <Display
        fontSize={size * 0.46}
        color={win ? colors.onPrimaryContainer : colors.onSurfaceVariant}
      >
        {letter}
      </Display>
    </View>
  );
}

/** The dot marking live state and the serving pair. */
export function LiveDot({
  size = 8,
  color = colors.primary,
}: {
  readonly size?: number;
  readonly color?: string;
}): ReactNode {
  return <View width={size} height={size} borderRadius={size / 2} backgroundColor={color} />;
}
