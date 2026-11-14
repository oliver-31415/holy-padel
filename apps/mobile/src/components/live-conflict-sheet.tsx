import type { MatchSummary } from "@holy-padel/db";
import { getLiveMatch, loadEvents } from "@holy-padel/db";
import { computeMatch } from "@holy-padel/scoring";
import type { ReactNode } from "react";
import { useState } from "react";
import { Modal } from "react-native";
import { ConfirmSheet } from "@/components/confirm-sheet.tsx";
import { useDbQuery } from "@/db/provider.tsx";
import { liveScoreLine, opponentsOf, ownerTeamOf, pairLabel } from "@/lib/format.ts";

/**
 * Asked before a new match starts while another is still live. Only one match
 * is ever live — home, the watch and scoring all follow the newest — so the
 * old one is saved as it stands (like END → stop) rather than left orphaned.
 */
function LiveConflictSheet({
  live,
  ownerId,
  onConfirm,
  onCancel,
}: {
  readonly live: MatchSummary;
  readonly ownerId: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}): ReactNode {
  const score = useDbQuery((driver) =>
    liveScoreLine(computeMatch(live.config, loadEvents(driver, live.id))),
  );
  const rivals = pairLabel(opponentsOf(live, ownerTeamOf(live, ownerId)));
  const standing = score === "" ? "" : ` (${score})`;
  return (
    <ConfirmSheet
      title="Match still live"
      message={`Your match vs ${rivals}${standing} hasn't ended. Starting a new one saves it as it stands.`}
      confirmLabel="Save & start new"
      tone="primary"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

/**
 * Gate a "start a match" action on there being no live match. `request` starts
 * straight away when nothing is live, otherwise opens the confirm sheet; the
 * caller renders `sheet` (null while closed) and must save the live match in
 * its start write (`closeLiveMatch`). `inModal` lifts the sheet above the
 * floating tab bar on tab screens.
 */
export function useLiveConflictGuard(
  ownerId: string,
  start: () => void,
  inModal = false,
): { readonly request: () => void; readonly sheet: ReactNode } {
  const live = useDbQuery(getLiveMatch);
  const [confirming, setConfirming] = useState(false);
  const close = (): void => {
    setConfirming(false);
  };
  const request = (): void => {
    if (live === undefined) {
      start();
    } else {
      setConfirming(true);
    }
  };
  if (!confirming || live === undefined) {
    return { request, sheet: null };
  }
  const content = (
    <LiveConflictSheet
      live={live}
      ownerId={ownerId}
      onConfirm={() => {
        close();
        start();
      }}
      onCancel={close}
    />
  );
  return {
    request,
    sheet: inModal ? (
      <Modal transparent={true} animationType="fade" onRequestClose={close}>
        {content}
      </Modal>
    ) : (
      content
    ),
  };
}
