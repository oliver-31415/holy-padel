import type { ReactNode } from "react";
import { XStack, YStack } from "tamagui";
import { Body, Display } from "@/components/ui.tsx";
import type { ScrubReadout } from "@/lib/score-scrub.ts";
import { colors, textAlpha } from "@/theme/colors.ts";

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
    <YStack flex={1} alignItems="center" gap={1}>
      <Display fontSize={17} {...(color === undefined ? {} : { color })}>
        {value}
      </Display>
      <Body fontSize={8.5} fontWeight="800" letterSpacing={1.2} color={color ?? textAlpha(0.4)}>
        {label}
      </Body>
    </YStack>
  );
}

/** The serving cell's label: a hand-out is named by its sport's word, else the cell reads SERVING. */
function handOutLabel(readout: ScrubReadout): string {
  if (readout.sideOut === true) {
    return "SIDE-OUT";
  }
  return readout.handOut === true ? "HAND-OUT" : "SERVING";
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
      <XStack alignItems="center" justifyContent="center" height={44}>
        <Body fontSize={9.5} fontWeight="700" letterSpacing={0.8} color={textAlpha(0.4)}>
          PRESS AND HOLD THE LINE TO SEE ANY MOMENT
        </Body>
      </XStack>
    );
  }
  return (
    <XStack alignItems="center" height={44} testID="scrub-readout">
      {readout.serving === undefined ? null : (
        // A hand-out is named in the serving cell: the team that served lost the rally.
        <ReadoutStat label={handOutLabel(readout)} value={readout.serving} />
      )}
      <ReadoutStat label={readout.pointsLabel} value={readout.points} />
      {readout.games === undefined ? null : (
        <ReadoutStat label={readout.gamesLabel} value={readout.games} />
      )}
      {readout.bpm === undefined ? null : (
        <ReadoutStat label="BPM" value={readout.bpm} color={colors.danger} />
      )}
      {readout.elapsed === undefined ? null : (
        <ReadoutStat label="IN GAME" value={readout.elapsed} />
      )}
    </XStack>
  );
}
