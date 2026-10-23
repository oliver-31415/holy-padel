import type { MatchSnapshot } from "@holy-padel/scoring";
import type { ReactNode } from "react";
import { View, XStack, YStack } from "tamagui";
import { Pause, Play, Square, Undo } from "@/components/icons.tsx";
import { Body, Display, LiveDot, Pill } from "@/components/ui.tsx";
import { currentSetScore } from "@/lib/format.ts";
import { accentAlpha, colors, textAlpha, whiteAlpha } from "@/theme/colors.ts";

function SetChip({
  label,
  score,
  state,
}: {
  readonly label: string;
  readonly score: string;
  readonly state: "done" | "current" | "future";
}): ReactNode {
  const testId = `set-chip-${label.toLowerCase().replaceAll(" ", "-")}`;
  if (state === "done") {
    return (
      <YStack
        flex={1}
        backgroundColor={colors.ink}
        borderRadius={14}
        paddingVertical={9}
        alignItems="center"
      >
        <Body fontSize={9} fontWeight="800" letterSpacing={1.5} color={whiteAlpha(0.5)}>
          {label}
        </Body>
        <Display fontSize={20} color={colors.white} marginTop={2} testID={testId}>
          {score}
        </Display>
      </YStack>
    );
  }
  if (state === "current") {
    return (
      <YStack
        flex={1}
        backgroundColor={colors.card}
        borderWidth={2}
        borderColor={colors.accent}
        borderRadius={14}
        paddingVertical={7}
        alignItems="center"
        boxShadow="0 2px 10px rgba(14, 17, 22, 0.06)"
      >
        <Body fontSize={9} fontWeight="800" letterSpacing={1.5} color={colors.accentOnCard}>
          {label}
        </Body>
        <Display fontSize={20} marginTop={2} testID={testId}>
          {score}
        </Display>
      </YStack>
    );
  }
  return (
    <YStack
      flex={1}
      borderWidth={1}
      borderColor={textAlpha(0.14)}
      borderRadius={14}
      paddingVertical={8}
      alignItems="center"
    >
      <Body fontSize={9} fontWeight="800" letterSpacing={1.5} color={textAlpha(0.35)}>
        {label}
      </Body>
      <Display fontSize={20} color={textAlpha(0.25)} marginTop={2} testID={testId}>
        –
      </Display>
    </YStack>
  );
}

/** The SET/GAME chip row across the top of the live screen. */
export function SetChips({
  match,
  snapshot,
}: {
  readonly match: { readonly config: MatchSnapshot["config"] };
  readonly snapshot: MatchSnapshot;
}): ReactNode {
  const chips: ReactNode[] = [];
  const isGameBased = match.config.sport === "squash" || match.config.sport === "pickleball";
  for (let setIndex = 0; setIndex < match.config.bestOf; setIndex += 1) {
    const completed = snapshot.completedSets[setIndex];
    const setLabel = isGameBased ? `GAME ${String(setIndex + 1)}` : `SET ${String(setIndex + 1)}`;
    if (completed !== undefined) {
      chips.push(
        <SetChip
          key={setLabel}
          label={setLabel}
          score={`${String(completed.games.A)}–${String(completed.games.B)}`}
          state="done"
        />,
      );
    } else if (setIndex + 1 === snapshot.setNumber) {
      const game = snapshot.currentGame;
      const isSuperTieBreak = game?.kind === "tieBreak" && game.tieBreakKind === "superTieBreak";
      const score = isSuperTieBreak
        ? `${String(game.points.A)}–${String(game.points.B)}`
        : currentSetScore(snapshot).replaceAll("-", "–");
      chips.push(
        <SetChip
          key={setLabel}
          label={isSuperTieBreak ? "SUPER TB" : setLabel}
          score={score}
          state="current"
        />,
      );
    } else {
      chips.push(<SetChip key={setLabel} label={setLabel} score="–" state="future" />);
    }
  }
  return <XStack gap={8}>{chips}</XStack>;
}

/** The small R/L badge inside the serving dot; pickleball adds its server number. */
function serveBadge(
  serverNumber: number | null | undefined,
  servingSide: "right" | "left" | null | undefined,
): string {
  const side = servingSide === "right" ? "R" : "L";
  return serverNumber ? `${String(serverNumber)}${side}` : side;
}

/** One tappable team row — the big "+1" target. */
export function TeamCard({
  name,
  point,
  serving,
  servingSide,
  serverNumber,
  hint,
  onScore,
  testID,
}: {
  readonly name: string;
  readonly point: string;
  readonly serving: boolean;
  readonly servingSide?: "right" | "left" | null | undefined;
  readonly serverNumber?: number | null | undefined;
  /** Shown under the team name — "tap to score" or "tap to take serve". */
  readonly hint?: string | undefined;
  readonly onScore: () => void;
  readonly testID: string;
}): ReactNode {
  return (
    <XStack
      flex={1}
      backgroundColor={colors.card}
      borderRadius={22}
      borderWidth={2}
      borderColor={serving ? colors.accent : "transparent"}
      paddingVertical={18}
      paddingHorizontal={22}
      alignItems="center"
      justifyContent="space-between"
      boxShadow="0 2px 14px rgba(14, 17, 22, 0.07)"
      pressStyle={{ opacity: 0.9, scale: 0.99 }}
      role="button"
      aria-label={`Point ${name}`}
      onPress={onScore}
      position="relative"
      overflow="hidden"
    >
      {serving ? (
        <View
          position="absolute"
          top={0}
          left={0}
          right={0}
          bottom={0}
          backgroundColor={accentAlpha(0.06)}
          pointerEvents="none"
        />
      ) : null}
      <YStack gap={7}>
        <XStack alignItems="center" gap={8}>
          <XStack alignItems="center" gap={6} opacity={serving ? 1 : 0}>
            <View
              width={20}
              height={20}
              borderRadius={10}
              backgroundColor={colors.accent}
              alignItems="center"
              justifyContent="center"
              boxShadow={serving ? `0 0 0 4px ${accentAlpha(0.3)}` : "unset"}
              testID={`${testID}-serve${serving ? "-on" : "-off"}`}
            >
              {Boolean(serving && servingSide) && (
                <Body fontSize={11} fontWeight="900" color={colors.onAccent}>
                  {serveBadge(serverNumber, servingSide)}
                </Body>
              )}
            </View>
          </XStack>
          <Display fontSize={23}>{name.toUpperCase()}</Display>
        </XStack>
        <Body fontSize={10} fontWeight="800" letterSpacing={1.6} color={textAlpha(0.35)}>
          {hint ?? "TAP TO SCORE +1"}
        </Body>
      </YStack>
      <Display fontSize={112} testID={testID}>
        {point}
      </Display>
    </XStack>
  );
}

/**
 * Squash "choice" tie-break (traditional HIHO): at target-1 all the receiver
 * picks short — first to the target — or long — first to target + 1. The
 * decision is mandatory before the next rally can be scored.
 */
export function SetChoiceSheet({
  target,
  onChoose,
}: {
  readonly target: number;
  readonly onChoose: (choice: "one" | "two") => void;
}): ReactNode {
  return (
    <View
      position="absolute"
      top={0}
      left={0}
      right={0}
      bottom={0}
      backgroundColor={whiteAlpha(0.7)}
      alignItems="center"
      justifyContent="center"
      paddingHorizontal={24}
    >
      <YStack
        backgroundColor={colors.ink}
        borderRadius={24}
        padding={24}
        width="100%"
        gap={18}
        boxShadow="0 12px 40px rgba(14, 17, 22, 0.35)"
      >
        <YStack gap={6} alignItems="center">
          <Body fontSize={11} fontWeight="800" letterSpacing={1.8} color={colors.accent}>
            {`LEVEL AT ${String(target - 1)}-${String(target - 1)}`}
          </Body>
          <Display fontSize={22} color={colors.white} letterSpacing={1}>
            RECEIVER'S CHOICE
          </Display>
        </YStack>
        <XStack gap={10}>
          <SetChoiceButton
            label={`SHORT · TO ${String(target)}`}
            detail="Next point wins"
            onPress={() => {
              onChoose("one");
            }}
            testID="set-choice-one"
          />
          <SetChoiceButton
            label={`LONG · TO ${String(target + 1)}`}
            detail="Play two more points"
            onPress={() => {
              onChoose("two");
            }}
            testID="set-choice-two"
          />
        </XStack>
        <Body textAlign="center" fontSize={10.5} fontWeight="600" color={whiteAlpha(0.5)}>
          The receiving pair decides; the choice is played to the end of the game
        </Body>
      </YStack>
    </View>
  );
}

function SetChoiceButton({
  label,
  detail,
  onPress,
  testID,
}: {
  readonly label: string;
  readonly detail: string;
  readonly onPress: () => void;
  readonly testID: string;
}): ReactNode {
  return (
    <YStack
      flex={1}
      backgroundColor={colors.card}
      borderRadius={16}
      paddingVertical={14}
      paddingHorizontal={10}
      alignItems="center"
      gap={4}
      pressStyle={{ opacity: 0.85, scale: 0.99 }}
      role="button"
      aria-label={label}
      onPress={onPress}
      testID={testID}
    >
      <Display fontSize={14} color={colors.text}>
        {label}
      </Display>
      <Body fontSize={9.5} fontWeight="700" color={textAlpha(0.45)}>
        {detail}
      </Body>
    </YStack>
  );
}

/** The LIVE/PAUSED pill, court + set label, and match clock. */
export function LiveHeader({
  paused,
  court,
  sport,
  setNumber,
  clock,
}: {
  readonly paused: boolean;
  readonly court: string | undefined;
  readonly sport: string | undefined;
  readonly setNumber: number;
  readonly clock: string;
}): ReactNode {
  return (
    <XStack alignItems="center" justifyContent="space-between">
      <Pill
        backgroundColor={paused ? textAlpha(0.4) : colors.ink}
        paddingVertical={6}
        paddingLeft={9}
        paddingRight={12}
        gap={6}
        testID="live-pill"
      >
        {paused ? <Pause size={9} color={colors.white} /> : <LiveDot size={7} />}
        <Body fontSize={11} fontWeight="800" letterSpacing={1.5} color={colors.white}>
          {paused ? "PAUSED" : "LIVE"}
        </Body>
      </Pill>
      <Body fontSize={11} fontWeight="700" letterSpacing={1.8} color={textAlpha(0.55)}>
        {[
          court?.toUpperCase(),
          sport === "squash" ? `GAME ${String(setNumber)}` : `SET ${String(setNumber)}`,
        ]
          .filter((part): part is string => part !== undefined)
          .join(" · ")}
      </Body>
      <Display fontSize={16} testID="match-clock">
        {clock}
      </Display>
    </XStack>
  );
}

/** The UNDO / PAUSE / END row. */
export function LiveActionBar({
  paused,
  onUndo,
  onTogglePause,
  onEnd,
}: {
  readonly paused: boolean;
  readonly onUndo: () => void;
  readonly onTogglePause: () => void;
  readonly onEnd: () => void;
}): ReactNode {
  return (
    <XStack gap={10}>
      <XStack
        flex={1}
        height={58}
        backgroundColor={colors.card}
        borderWidth={1}
        borderColor={textAlpha(0.08)}
        borderRadius={16}
        alignItems="center"
        justifyContent="center"
        gap={9}
        boxShadow="0 2px 8px rgba(14, 17, 22, 0.05)"
        pressStyle={{ opacity: 0.85 }}
        role="button"
        onPress={onUndo}
      >
        <Undo size={17} color={colors.text} />
        <Body fontSize={14} fontWeight="800" letterSpacing={1.4}>
          UNDO
        </Body>
      </XStack>
      <XStack
        flex={1.3}
        height={58}
        backgroundColor={paused ? colors.accent : colors.card}
        borderWidth={1}
        borderColor={paused ? colors.accent : textAlpha(0.08)}
        borderRadius={16}
        alignItems="center"
        justifyContent="center"
        gap={9}
        boxShadow="0 2px 8px rgba(14, 17, 22, 0.05)"
        pressStyle={{ opacity: 0.85 }}
        role="button"
        onPress={onTogglePause}
        testID="pause-toggle"
      >
        {paused ? (
          <Play size={17} color={colors.onAccent} />
        ) : (
          <Pause size={17} color={colors.text} />
        )}
        <Body
          fontSize={14}
          fontWeight="800"
          letterSpacing={1.4}
          color={paused ? colors.onAccent : colors.text}
        >
          {paused ? "RESUME" : "PAUSE"}
        </Body>
      </XStack>
      <XStack
        flex={1}
        height={58}
        borderWidth={1}
        borderColor={textAlpha(0.16)}
        borderRadius={16}
        alignItems="center"
        justifyContent="center"
        gap={8}
        pressStyle={{ opacity: 0.7 }}
        role="button"
        aria-label="End match"
        onPress={onEnd}
        testID="end-match"
      >
        <Square size={13} color={textAlpha(0.55)} />
        <Body fontSize={13} fontWeight="700" letterSpacing={1.4} color={textAlpha(0.5)}>
          END
        </Body>
      </XStack>
    </XStack>
  );
}
