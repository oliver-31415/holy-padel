import type { ReactNode } from "react";
import type { TextInputProps } from "react-native";
import { TextInput } from "react-native";
import type { ViewProps } from "tamagui";
import { View, XStack, YStack } from "tamagui";
import { Icon, type IconName } from "@/components/icons.tsx";
import { Body, groupCorners, Label } from "@/components/ui.tsx";
import { colors, onSurfaceAlpha } from "@/theme/colors.ts";

/**
 * Material 3 Expressive controls: buttons, icon buttons, chips, text fields
 * and list rows. Like the primitives in `ui.tsx`, they read `colors` at render
 * time so they follow the live theme.
 */

export type ButtonVariant = "filled" | "tonal" | "outlined" | "text" | "danger" | "dangerText";
export type ButtonSize = "sm" | "md" | "lg";

const BUTTON_SIZES = {
  sm: { height: 40, padding: 16, font: 14, icon: 20, gap: 8, pressed: 10 },
  md: { height: 56, padding: 24, font: 16, icon: 24, gap: 8, pressed: 14 },
  lg: { height: 72, padding: 32, font: 20, icon: 28, gap: 12, pressed: 20 },
} as const;

function buttonColors(variant: ButtonVariant): {
  readonly background: string;
  readonly content: string;
  readonly border: string | undefined;
} {
  switch (variant) {
    case "tonal": {
      return {
        background: colors.secondaryContainer,
        content: colors.onSecondaryContainer,
        border: undefined,
      };
    }
    case "outlined": {
      return {
        background: "transparent",
        content: colors.onSurfaceVariant,
        border: colors.outlineVariant,
      };
    }
    case "text": {
      return { background: "transparent", content: colors.primary, border: undefined };
    }
    case "danger": {
      return { background: colors.error, content: colors.onError, border: undefined };
    }
    case "dangerText": {
      return { background: "transparent", content: colors.error, border: undefined };
    }
    default: {
      return { background: colors.primary, content: colors.onPrimary, border: undefined };
    }
  }
}

/**
 * The Material 3 Expressive button: fully round at rest, and the corners
 * tighten while pressed (the shape morph), with a small scale-down.
 * `label` doubles as the accessible name unless `aria-label` is passed.
 */
export function Button({
  label,
  onPress,
  variant = "filled",
  size = "md",
  icon,
  trailingIcon,
  disabled = false,
  contentColor,
  ...rest
}: Omit<ViewProps, "children" | "onPress"> & {
  readonly label: string;
  readonly onPress: () => void;
  /** Overrides the label and icon colour, for a button on a coloured surface. */
  readonly contentColor?: string;
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly icon?: IconName;
  readonly trailingIcon?: IconName;
  readonly disabled?: boolean;
}): ReactNode {
  const metrics = BUTTON_SIZES[size];
  const tone = buttonColors(variant);
  const flat = variant === "text" || variant === "dangerText" || variant === "outlined";
  const background = disabled && !flat ? onSurfaceAlpha(0.1) : tone.background;
  const content = disabled ? onSurfaceAlpha(0.38) : (contentColor ?? tone.content);
  return (
    <XStack
      height={metrics.height}
      paddingHorizontal={metrics.padding}
      gap={metrics.gap}
      borderRadius={metrics.height / 2}
      backgroundColor={background}
      alignItems="center"
      justifyContent="center"
      role="button"
      aria-label={label}
      aria-disabled={disabled}
      {...(tone.border === undefined
        ? {}
        : { borderWidth: 1, borderColor: disabled ? onSurfaceAlpha(0.12) : tone.border })}
      {...(disabled
        ? {}
        : {
            onPress,
            pressStyle: {
              borderRadius: metrics.pressed,
              scale: 0.98,
              ...(flat ? { backgroundColor: onSurfaceAlpha(0.08) } : { opacity: 0.92 }),
            },
          })}
      {...rest}
    >
      {icon === undefined ? null : <Icon name={icon} size={metrics.icon} color={content} />}
      <Body fontSize={metrics.font} fontWeight="600" letterSpacing={0.1} color={content}>
        {label}
      </Body>
      {trailingIcon === undefined ? null : (
        <Icon name={trailingIcon} size={metrics.icon} color={content} />
      )}
    </XStack>
  );
}

export type IconButtonVariant = "standard" | "tonal" | "filled" | "outlined";

/** A round icon-only button. `label` is the accessible name. */
export function IconButton({
  icon,
  label,
  onPress,
  variant = "standard",
  size = 40,
  disabled = false,
  ...rest
}: Omit<ViewProps, "children" | "onPress"> & {
  readonly icon: IconName;
  readonly label: string;
  readonly onPress: () => void;
  readonly variant?: IconButtonVariant;
  readonly size?: number;
  readonly disabled?: boolean;
}): ReactNode {
  const background =
    variant === "filled"
      ? colors.primary
      : variant === "tonal"
        ? colors.secondaryContainer
        : "transparent";
  const tint =
    variant === "filled"
      ? colors.onPrimary
      : variant === "tonal"
        ? colors.onSecondaryContainer
        : colors.onSurfaceVariant;
  return (
    <XStack
      width={size}
      height={size}
      borderRadius={size / 2}
      backgroundColor={background}
      alignItems="center"
      justifyContent="center"
      role="button"
      aria-label={label}
      aria-disabled={disabled}
      {...(variant === "outlined" ? { borderWidth: 1, borderColor: colors.outlineVariant } : {})}
      {...(disabled
        ? {}
        : {
            onPress,
            pressStyle: {
              borderRadius: size * 0.3,
              ...(background === "transparent"
                ? { backgroundColor: onSurfaceAlpha(0.08) }
                : { opacity: 0.92 }),
            },
          })}
      {...rest}
    >
      <Icon
        name={icon}
        size={Math.min(24, size * 0.6)}
        color={disabled ? onSurfaceAlpha(0.38) : tint}
      />
    </XStack>
  );
}

/**
 * A filter chip: outlined at rest, a tonal fill with a leading check when
 * selected. `aria-pressed` carries the state for assistive tech and tests.
 */
export function Chip({
  label,
  selected = false,
  onPress,
  ...rest
}: Omit<ViewProps, "children" | "onPress"> & {
  readonly label: string;
  readonly selected?: boolean;
  readonly onPress?: () => void;
}): ReactNode {
  return (
    <XStack
      height={32}
      paddingLeft={selected ? 8 : 16}
      paddingRight={16}
      gap={8}
      borderRadius={8}
      borderWidth={1}
      borderColor={selected ? "transparent" : colors.outlineVariant}
      backgroundColor={selected ? colors.secondaryContainer : "transparent"}
      alignItems="center"
      justifyContent="center"
      {...(onPress === undefined
        ? {}
        : {
            role: "button",
            "aria-pressed": selected,
            onPress,
            pressStyle: { opacity: 0.8 },
          })}
      {...rest}
    >
      {selected ? <Icon name="check" size={18} color={colors.onSecondaryContainer} /> : null}
      <Body
        fontSize={14}
        fontWeight="500"
        letterSpacing={0.1}
        color={selected ? colors.onSecondaryContainer : colors.onSurfaceVariant}
      >
        {label}
      </Body>
    </XStack>
  );
}

/**
 * A filled text field with its label above. The style object is built per
 * render: a module-level one would freeze the palette it was created under.
 */
export function TextField({
  label,
  style,
  ...rest
}: TextInputProps & { readonly label?: string }): ReactNode {
  return (
    <YStack gap={8}>
      {label === undefined ? null : <Label>{label}</Label>}
      <TextInput
        placeholderTextColor={colors.onSurfaceVariant}
        style={[
          {
            fontSize: 16,
            fontFamily: "GoogleSansFlex_400Regular",
            color: colors.onSurface,
            minHeight: 56,
            paddingVertical: 14,
            paddingHorizontal: 16,
            backgroundColor: colors.surfaceContainerHighest,
            borderRadius: 16,
          },
          style,
        ]}
        {...rest}
      />
    </YStack>
  );
}

/**
 * A two-line list row for grouped lists: a leading tonal icon, a headline over
 * supporting text, and an optional trailing chevron. Pass `index`/`count` so
 * the group's outer corners round and its seams stay tight.
 */
export function ListItem({
  icon,
  headline,
  supporting,
  index,
  count,
  chevron = true,
  danger = false,
  onPress,
  ...rest
}: Omit<ViewProps, "children" | "onPress"> & {
  readonly icon: IconName;
  readonly headline: string;
  readonly supporting: string;
  readonly index: number;
  readonly count: number;
  readonly chevron?: boolean;
  readonly danger?: boolean;
  readonly onPress: () => void;
}): ReactNode {
  return (
    <XStack
      alignItems="center"
      gap={16}
      minHeight={72}
      paddingVertical={12}
      paddingHorizontal={16}
      backgroundColor={colors.card}
      {...groupCorners(index, count)}
      pressStyle={{ opacity: 0.8 }}
      role="button"
      aria-label={headline}
      onPress={onPress}
      {...rest}
    >
      <View
        width={40}
        height={40}
        borderRadius={20}
        backgroundColor={danger ? colors.errorContainer : colors.secondaryContainer}
        alignItems="center"
        justifyContent="center"
      >
        <Icon name={icon} color={danger ? colors.onErrorContainer : colors.onSecondaryContainer} />
      </View>
      <YStack flex={1} gap={2}>
        <Body fontSize={16} color={danger ? colors.error : colors.onSurface}>
          {headline}
        </Body>
        <Label lineHeight={16}>{supporting}</Label>
      </YStack>
      {chevron ? <Icon name="chevronRight" color={colors.onSurfaceVariant} /> : null}
    </XStack>
  );
}
