import type { ReactNode } from "react";
import { Button } from "@/components/controls.tsx";
import { Sheet } from "@/components/sheet.tsx";
import { Body, Display } from "@/components/ui.tsx";
import { colors } from "@/theme/colors.ts";

/**
 * The End sheet — the crux of "don't lose the score". Court time runs out
 * mid-match all the time, so stopping must SAVE by default (whoever's ahead is
 * credited). Fully discarding stays available, one step down, and the whole
 * sheet is dismissable so End never traps you. In-app (not a native alert) so it
 * looks the same everywhere and is directly tappable in tests.
 */
export function EndSheet({
  onStopSave,
  onDiscard,
  onCancel,
}: {
  readonly onStopSave: () => void;
  readonly onDiscard: () => void;
  readonly onCancel: () => void;
}): ReactNode {
  return (
    <Sheet onDismiss={onCancel} dismissLabel="Dismiss">
      <Display fontSize={24}>End the match?</Display>
      <Body fontSize={14} lineHeight={20} color={colors.onSurfaceVariant}>
        Court time up? Stop and keep the score as it stands. Or discard the match entirely.
      </Body>
      <Button
        label="Stop & save"
        aria-label="Stop and save"
        icon="stop"
        marginTop={8}
        onPress={onStopSave}
        testID="end-stop-save"
      />
      <Button
        label="Discard match"
        variant="outlined"
        borderColor={colors.error}
        onPress={onDiscard}
        testID="end-discard"
      />
      <Button label="Keep playing" variant="text" onPress={onCancel} testID="end-keep-playing" />
    </Sheet>
  );
}
