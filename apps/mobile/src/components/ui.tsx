import type { ReactNode } from "react";
import type { TextProps, ViewProps } from "tamagui";
import { Text, View } from "tamagui";
import { colors, textAlpha } from "@/theme/colors.ts";

/**
 * Text and surface primitives. These are function components (not Tamagui
 * `styled` exports) on purpose: `styled` snapshots color values at module
 * load, which would freeze the app in whichever theme loaded first — reading
 * `colors` at render time keeps every screen in step with the live theme.
 */

type TextStyleProps = TextProps & {
  readonly color?: string;
};

/**
 * Anton display text — numerals, headings, team names.
 *
 * Do NOT set a tight `lineHeight` on this (anything near or below `fontSize`):
 * Anton's round glyphs (0, O, Q) overshoot below the baseline, so without the
 * font's natural descent room the bottom gets clipped — "0" reads as "U". Leave
 * `lineHeight` unset (natural metrics) unless it's clearly ≥ ~1.3× `fontSize`.
 */
export function Display({ color, ...rest }: TextStyleProps): ReactNode {
  return (
    <Text
      fontFamily="$heading"
      fontWeight="400"
      letterSpacing={0.5}
      color={color ?? colors.text}
      {...rest}
    />
  );
}

/** Archivo body text. */
export function Body({ color, ...rest }: TextStyleProps): ReactNode {
  return <Text fontFamily="$body" color={color ?? colors.text} {...rest} />;
}

/** Tiny 800-weight uppercase label with wide tracking. */
export function Overline({ color, ...rest }: TextStyleProps): ReactNode {
  return (
    <Text
      fontFamily="$body"
      fontWeight="800"
      fontSize={10}
      letterSpacing={1.5}
      textTransform="uppercase"
      color={color ?? textAlpha(0.4)}
      {...rest}
    />
  );
}

/** Card surface with the design's soft shadow. */
export function Card({ children, ...rest }: ViewProps): ReactNode {
  return (
    <View
      backgroundColor={colors.card}
      borderRadius={18}
      boxShadow="0 2px 10px rgba(14, 17, 22, 0.05)"
      {...rest}
    >
      {children}
    </View>
  );
}

/** Fully rounded container (chips, tab bar, status pills). */
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

/** Round monogram avatar: ink disc, accent letter (slate for team B). */
export function Avatar({
  letter,
  size = 36,
  background = colors.ink,
  color = colors.accent,
}: {
  readonly letter: string;
  readonly size?: number;
  readonly background?: string;
  readonly color?: string;
}): ReactNode {
  return (
    <View
      width={size}
      height={size}
      borderRadius={size / 2}
      backgroundColor={background}
      alignItems="center"
      justifyContent="center"
    >
      <Display fontSize={size * 0.4} color={color}>
        {letter.toUpperCase()}
      </Display>
    </View>
  );
}

/** W/L/D chip from the form strips and match rows. A draw is neither a win nor a loss. */
export function ResultBadge({
  won,
  drew = false,
  size = 24,
}: {
  readonly won: boolean;
  readonly drew?: boolean;
  readonly size?: number;
}): ReactNode {
  const letter = drew ? "D" : won ? "W" : "L";
  return (
    <View
      width={size}
      height={size}
      borderRadius={size * 0.3}
      backgroundColor={won && !drew ? colors.accent : colors.greige}
      alignItems="center"
      justifyContent="center"
    >
      <Display
        fontSize={size * 0.46}
        color={won && !drew ? colors.onAccent : textAlpha(0.55)}
        letterSpacing={0}
      >
        {letter}
      </Display>
    </View>
  );
}

/** The accent pulse dot marking live state and the serving pair. */
export function LiveDot({ size = 7 }: { readonly size?: number }): ReactNode {
  return (
    <View width={size} height={size} borderRadius={size / 2} backgroundColor={colors.accent} />
  );
}
