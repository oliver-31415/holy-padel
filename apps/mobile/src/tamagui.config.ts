import { defaultConfig } from "@tamagui/config/v5";
import { animations } from "@tamagui/config/v5-rn";
import { createFont, createTamagui } from "tamagui";
import { colors } from "./theme/colors.ts";

const HEADING_SIZES = {
  1: 22,
  2: 24,
  3: 28,
  4: 32,
  5: 36,
  6: 45,
  7: 57,
  8: 72,
  9: 96,
  true: 28,
} as const;

const BODY_SIZES = {
  1: 11,
  2: 12,
  3: 14,
  4: 16,
  5: 22,
  true: 14,
} as const;

// biome-ignore-start lint/style/useNamingConvention: Google Fonts registry names
const FACE = {
  400: { normal: "GoogleSansFlex_400Regular" },
  500: { normal: "GoogleSansFlex_500Medium" },
  600: { normal: "GoogleSansFlex_600SemiBold" },
  700: { normal: "GoogleSansFlex_700Bold" },
  800: { normal: "GoogleSansFlex_800ExtraBold" },
} as const;
// biome-ignore-end lint/style/useNamingConvention: Google Fonts registry names

const WEIGHTS = { 4: "400", 5: "500", 6: "600", 7: "700", 8: "800" } as const;

/** Google Sans Flex, emphasized — score numerals, display and headline text. */
const headingFont = createFont({
  family: "GoogleSansFlex_700Bold",
  size: HEADING_SIZES,
  weight: { ...WEIGHTS, true: "700" },
  face: FACE,
});

/** Google Sans Flex — titles, body and labels at weights 400-700. */
const bodyFont = createFont({
  family: "GoogleSansFlex_400Regular",
  size: BODY_SIZES,
  weight: { ...WEIGHTS, true: "400" },
  face: FACE,
});

export const tamaguiConfig = createTamagui({
  ...defaultConfig,
  animations,
  settings: {
    ...defaultConfig.settings,
    // The screens are built from the design's exact pixel values and rgba
    // colors, so longhand style props and arbitrary values stay allowed.
    onlyAllowShorthands: false,
    allowedStyleValues: false,
  },
  fonts: {
    heading: headingFont,
    body: bodyFont,
  },
  tokens: {
    ...defaultConfig.tokens,
    color: colors,
  },
});

export type AppTamaguiConfig = typeof tamaguiConfig;

declare module "tamagui" {
  interface TamaguiCustomConfig extends AppTamaguiConfig {}
}
