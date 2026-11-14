import type { MatchDraft } from "@holy-padel/db";
import type { TeamId } from "@holy-padel/scoring";
import { useCallback, useState } from "react";

type Format = "singles" | "doubles";

export interface MatchLineup {
  readonly teamA1: string;
  readonly partner: string | undefined;
  readonly teamB: readonly string[];
  readonly note: string;
  /** Which team's picker sheet is open, if any. */
  readonly picking: TeamId | undefined;
  /** Whether both sides are staffed for the current format. */
  readonly readyFor: (format: Format) => boolean;
  readonly partnerSelection: () => readonly string[];
  readonly setPicking: (team: TeamId | undefined) => void;
  readonly setNote: (note: string) => void;
  /** Set Team B wholesale — used by the recent-opponent chips. */
  readonly setTeamB: (ids: readonly string[]) => void;
  readonly togglePick: (id: string, format: Format) => void;
}

/** The players (and note) a lineup starts from: a resumable draft, or a stored match. */
export type LineupSeed = Pick<MatchDraft, "teamA1" | "partner" | "teamB" | "note">;

/**
 * The picked-players half of the new-match screen (teams, note and the open
 * picker). Seeded from the resumable draft, exactly like the rules state — or
 * from a stored match, when its lineup is being corrected.
 */
export function useMatchLineup(draft: LineupSeed | undefined, ownerId: string): MatchLineup {
  const [teamA1, setTeamA1] = useState<string>(draft?.teamA1 ?? ownerId);
  const [partner, setPartner] = useState<string | undefined>(draft?.partner);
  const [teamB, setTeamB] = useState<readonly string[]>(draft?.teamB ?? []);
  const [note, setNote] = useState<string>(draft?.note ?? "");
  const [picking, setPicking] = useState<TeamId | undefined>(undefined);

  const readyFor = useCallback(
    (format: Format): boolean =>
      format === "singles" ? teamB.length > 0 : partner !== undefined && teamB.length === 2,
    [partner, teamB],
  );

  const partnerSelection = useCallback(
    (): readonly string[] => (partner === undefined ? [] : [partner]),
    [partner],
  );

  const togglePick = useCallback(
    (id: string, format: Format): void => {
      if (picking === "A") {
        if (format === "singles") {
          setTeamA1(id);
          setPicking(undefined);
        } else {
          setPartner((current) => (current === id ? undefined : id));
        }
        return;
      }
      setTeamB((current) =>
        current.includes(id)
          ? current.filter((memberId) => memberId !== id)
          : [...current, id].slice(format === "singles" ? -1 : -2),
      );
    },
    [picking],
  );

  const setTeamBIds = useCallback((ids: readonly string[]): void => {
    setTeamB(ids);
  }, []);

  return {
    teamA1,
    partner,
    teamB,
    note,
    picking,
    readyFor,
    partnerSelection,
    setPicking,
    setNote,
    setTeamB: setTeamBIds,
    togglePick,
  };
}
