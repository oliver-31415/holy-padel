import type { ReactNode } from "react";
import { Button } from "@/components/controls.tsx";
import { Sheet } from "@/components/sheet.tsx";
import { Body, Display } from "@/components/ui.tsx";
import { colors } from "@/theme/colors.ts";

/**
 * The in-app destructive confirmation, used instead of the platform alert so
 * it follows the selected theme and the app's Material shapes (a bottom sheet
 * with round buttons). The native alert on Android ignores the in-app theme.
 *
 * The whole sheet is dismissable (scrim tap and Cancel), and the confirm
 * action is the error fill so "this deletes something" reads instantly. The
 * `primary` tone (the filled primary button) is for confirmations that keep data.
 */
export function ConfirmSheet({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  tone = "danger",
}: {
  readonly title: string;
  readonly message: string;
  readonly confirmLabel: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly tone?: "danger" | "primary";
}): ReactNode {
  return (
    <Sheet onDismiss={onCancel} testID="confirm-sheet">
      <Display fontSize={24}>{title}</Display>
      <Body fontSize={14} lineHeight={20} color={colors.onSurfaceVariant}>
        {message}
      </Body>
      <Button
        label={confirmLabel}
        variant={tone === "danger" ? "danger" : "filled"}
        marginTop={8}
        onPress={onConfirm}
        testID="confirm-action"
      />
      <Button label="Cancel" variant="text" onPress={onCancel} testID="confirm-cancel" />
    </Sheet>
  );
}
