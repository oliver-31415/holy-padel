import type { ReactNode } from "react";
import { XStack } from "tamagui";
import { IconButton } from "@/components/controls.tsx";
import { Display } from "@/components/ui.tsx";

/**
 * The shared top app bar for pushed and modal screens: a back/close icon
 * button on the left, then the headline. Every modal uses this so the way out
 * is always an icon in the same spot.
 *
 * `variant` picks the glyph: "close" (✕, dismiss to where you came from) or
 * "back" (←, step back a level). `label` is the accessible name — keep it stable
 * ("Cancel", "Close") so it reads well to VoiceOver and anchors E2E selectors.
 */
export function ModalHeader({
  title,
  onClose,
  variant = "close",
  label = variant === "back" ? "Back" : "Close",
  right,
  titleSize = 24,
}: {
  readonly title: string;
  readonly onClose: () => void;
  readonly variant?: "close" | "back";
  readonly label?: string;
  readonly right?: ReactNode;
  readonly titleSize?: number;
}): ReactNode {
  return (
    <XStack alignItems="center" gap={8} minHeight={48} marginLeft={-8}>
      <IconButton
        icon={variant === "back" ? "arrowBack" : "close"}
        label={label}
        size={48}
        onPress={onClose}
      />
      <Display fontSize={titleSize} fontWeight="600" flex={1} numberOfLines={1}>
        {title}
      </Display>
      {right}
    </XStack>
  );
}
