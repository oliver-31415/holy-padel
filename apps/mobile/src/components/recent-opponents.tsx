import type { MatchSummary } from "@holy-padel/db";
import type { ReactNode } from "react";
import { ScrollView } from "react-native";
import { RecentOpponentChip } from "@/components/match-presets.tsx";
import { recentOpponents } from "@/lib/recent-opponents.ts";

/**
 * Up to four of the owner's most recent distinct opponents for the current
 * format, one tap to fill Team B. Hidden when the ledger has none for it.
 */
export function RecentOpponents({
  matches,
  ownerId,
  format,
  onPick,
}: {
  readonly matches: readonly MatchSummary[];
  readonly ownerId: string;
  readonly format: "singles" | "doubles";
  readonly onPick: (ids: readonly string[]) => void;
}): ReactNode {
  const recent = recentOpponents(matches, ownerId, format);
  if (recent.length === 0) {
    return null;
  }
  return (
    <ScrollView
      horizontal={true}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8 }}
      testID="recent-opponents"
    >
      {recent.map((entry) => (
        <RecentOpponentChip
          key={entry.key}
          label={entry.label}
          onPress={() => {
            onPick(entry.playerIds);
          }}
        />
      ))}
    </ScrollView>
  );
}
