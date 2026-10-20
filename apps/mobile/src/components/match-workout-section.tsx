import type { MatchSummary } from "@holy-padel/db";
import { getOwner, loadMatchHeartRate, loadMatchMotion } from "@holy-padel/db";
import type { ReactNode } from "react";
import { MatchActivityCard } from "@/components/match-activity-card.tsx";
import { ScoreRaceCard } from "@/components/score-race-card.tsx";
import { useDbQuery } from "@/db/provider.tsx";
import { ownerTeamOf, teamNames } from "@/lib/format.ts";
import type { GameSeries } from "@/lib/game-series.ts";
import { resolveMaxHr } from "@/lib/insights.ts";

/**
 * The score race plus what the watch measured (heart rate, steps, distance,
 * effort by game, zones) for one match. Loads its own watch data so the
 * overview screen stays lean.
 */
export function MatchWorkoutSection({
  match,
  series,
}: {
  readonly match: MatchSummary;
  readonly series: readonly GameSeries[];
}): ReactNode {
  const heartRate = useDbQuery((driver) => loadMatchHeartRate(driver, match.id));
  const motion = useDbQuery((driver) => loadMatchMotion(driver, match.id));
  const owner = useDbQuery(getOwner);
  const maxHr = useDbQuery(resolveMaxHr);
  const { sport } = match.config;
  return (
    <>
      <ScoreRaceCard
        series={series}
        sport={sport}
        matchStartedAt={match.startedAt}
        names={teamNames(match)}
        {...(heartRate === undefined ? {} : { heartRate })}
        {...(motion === undefined ? {} : { motion })}
      />
      <MatchActivityCard
        series={series}
        matchStartedAt={match.startedAt}
        heartRate={heartRate}
        motion={motion}
        team={ownerTeamOf(match, owner?.id ?? "nico")}
        maxHr={maxHr.bpm}
        squash={sport === "squash"}
      />
    </>
  );
}
