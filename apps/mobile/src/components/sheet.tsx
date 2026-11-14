import type { ReactNode } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ViewProps } from "tamagui";
import { View, YStack } from "tamagui";
import { colors } from "@/theme/colors.ts";

/**
 * The Material bottom sheet scaffold: a scrim that dismisses on tap, and a
 * `surfaceContainerLow` sheet with extra-large top corners and a drag handle.
 * Fills its parent, so render it last inside a full-screen container (or a
 * transparent `Modal`). `bottomInset` replaces the safe-area inset — the
 * picker passes the keyboard height.
 */
export function Sheet({
  onDismiss,
  dismissLabel = "Cancel",
  bottomInset,
  scrimTestID,
  children,
  ...rest
}: ViewProps & {
  readonly onDismiss: () => void;
  readonly dismissLabel?: string;
  readonly bottomInset?: number;
  readonly scrimTestID?: string;
}): ReactNode {
  const insets = useSafeAreaInsets();
  return (
    <YStack position="absolute" top={0} left={0} right={0} bottom={0}>
      <View
        flex={1}
        backgroundColor={colors.scrim}
        role="button"
        aria-label={dismissLabel}
        onPress={onDismiss}
        {...(scrimTestID === undefined ? {} : { testID: scrimTestID })}
      />
      <YStack
        backgroundColor={colors.surfaceContainerLow}
        borderTopLeftRadius={28}
        borderTopRightRadius={28}
        marginTop={-28}
        paddingTop={12}
        paddingHorizontal={24}
        paddingBottom={(bottomInset ?? insets.bottom) + 16}
        gap={12}
        {...rest}
      >
        <View
          alignSelf="center"
          width={32}
          height={4}
          borderRadius={2}
          marginBottom={8}
          backgroundColor={colors.outline}
          opacity={0.4}
        />
        {children}
      </YStack>
    </YStack>
  );
}
