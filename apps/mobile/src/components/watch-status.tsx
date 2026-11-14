import type { ReactNode } from "react";
import { XStack } from "tamagui";
import { Icon } from "@/components/icons.tsx";
import { Label, LiveDot } from "@/components/ui.tsx";
import { colors } from "@/theme/colors.ts";
import type { WatchLink } from "@/watch/use-watch-connection.ts";

/**
 * Watch-connection indicators shared by the home pill and the live screen's
 * sync line — both driven by the polled connection count, never hardcoded.
 */

function syncText(link: WatchLink, paused: boolean): string {
  if (paused) {
    return "Paused — workout paused on your watch too";
  }
  if (link.count === null || link.count === 0) {
    return "Watch not connected — score here, it syncs when they reconnect";
  }
  if (link.count === 1) {
    return "Synced — your watch mirrors the score";
  }
  return `Synced — ${String(link.count)} watches connected`;
}

/** The status line under the live screen's action bar. */
export function WatchSyncLine({
  link,
  paused,
}: {
  readonly link: WatchLink;
  readonly paused: boolean;
}): ReactNode {
  if (!link.available) {
    return null;
  }
  const showDot = !paused && link.count !== null && link.count > 0;
  return (
    <XStack alignItems="center" justifyContent="center" gap={6}>
      {showDot ? <LiveDot size={6} /> : null}
      <Label textAlign="center">{syncText(link, paused)}</Label>
    </XStack>
  );
}

/** A muted "✓ Saved" line, shown once the match has at least one point. */
export function SavedIndicator(): ReactNode {
  return (
    <XStack alignItems="center" justifyContent="center" gap={5} testID="saved-indicator">
      <Icon name="check" size={16} color={colors.primary} />
      <Label>Saved</Label>
    </XStack>
  );
}

/** The home screen's header indicator: a tonal watch icon, muted when offline. */
export function WatchPill({ link }: { readonly link: WatchLink }): ReactNode {
  if (!link.available || link.count === null) {
    return null;
  }
  const online = link.count > 0;
  const label = online
    ? link.count === 1
      ? "Watch connected"
      : `${String(link.count)} watches connected`
    : "Watch offline";
  return (
    <XStack
      height={40}
      paddingHorizontal={12}
      gap={6}
      borderRadius={20}
      alignItems="center"
      backgroundColor={online ? colors.secondaryContainer : colors.surfaceContainerHighest}
      aria-label={label}
    >
      <Icon
        name={online ? "watch" : "watchOff"}
        size={20}
        color={online ? colors.onSecondaryContainer : colors.onSurfaceVariant}
      />
      <Label color={online ? colors.onSecondaryContainer : colors.onSurfaceVariant}>
        {online ? (link.count === 1 ? "Connected" : `${String(link.count)} connected`) : "Offline"}
      </Label>
    </XStack>
  );
}
