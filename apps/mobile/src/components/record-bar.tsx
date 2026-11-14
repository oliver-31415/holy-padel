import type { ReactNode } from "react";
import { ProgressBar } from "@/components/ui.tsx";

/** The W/L share bar from the partner and player screens. Draws count toward the total, not the win share. */
export function RecordBar({
  won,
  lost,
  drew = 0,
}: {
  readonly won: number;
  readonly lost: number;
  readonly drew?: number;
}): ReactNode {
  const total = won + lost + drew;
  return <ProgressBar share={total === 0 ? 0 : won / total} width={96} />;
}
