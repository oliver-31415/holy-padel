import type { ReactNode } from "react";
import { XStack, YStack } from "tamagui";
import { Display, Label } from "@/components/ui.tsx";
import type { ScrubReadout } from "@/lib/score-scrub.ts";
import { colors } from "@/theme/colors.ts";

/** One figure in the scrub readout. */
function ReadoutStat({
  label,
  value,
  color,
}: {
  readonly label: string;
  readonly value: string;
  readonly color?: string;
}): ReactNode {
  return (
    <YStack flex={1} alignItems="center" gap={2}>
      <Display fontSize={16} {...(color === undefined ? {} : { color })}>
        {value}
      </Display>
      <Label {...(color === undefined ? {} : { color })}>{label}</Label>
    </YStack>
  );
}

/** The serving cell's label: a hand-out is named by its sport's word, else the cell reads Serving. */
function handOutLabel(readout: ScrubReadout): string {
  if (readout.sideOut === true) {
    return "Side-out";
  }
  return readout.handOut === true ? "Hand-out" : "Serving";
}

/**
 * Under the chart: the readout for the rally the cursor is on (server, points,
 * games in the set, heart rate, time into the game), or a hint on how to scrub.
 * Its height is fixed so the chart does not jump when the drag starts and stops.
 */
export function ScrubReadoutRow({
  readout,
}: {
  readonly readout: ScrubReadout | undefined;
}): ReactNode {
  if (readout === undefined) {
    return (
      <XStack alignItems="center" justifyContent="center" height={48}>
        <Label>Press and hold the line to see any moment</Label>
      </XStack>
    );
  }
  return (
    <XStack alignItems="center" height={48} testID="scrub-readout">
      {readout.serving === undefined ? null : (
        // A hand-out is named in the serving cell: the team that served lost the rally.
        <ReadoutStat label={handOutLabel(readout)} value={readout.serving} />
      )}
      <ReadoutStat label={readout.pointsLabel} value={readout.points} />
      {readout.games === undefined ? null : (
        <ReadoutStat label={readout.gamesLabel} value={readout.games} />
      )}
      {readout.bpm === undefined ? null : (
        <ReadoutStat label="bpm" value={readout.bpm} color={colors.error} />
      )}
      {readout.elapsed === undefined ? null : (
        <ReadoutStat label="In game" value={readout.elapsed} />
      )}
    </XStack>
  );
}
