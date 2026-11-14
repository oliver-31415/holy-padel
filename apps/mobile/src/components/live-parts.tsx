import type { MatchSnapshot } from "@holy-padel/scoring";
import type { ReactNode } from "react";
import { View, XStack, YStack } from "tamagui";
import { Button } from "@/components/controls.tsx";
import { Icon } from "@/components/icons.tsx";
import { Body, Display, Label, LiveDot, Pill } from "@/components/ui.tsx";
import { currentSetScore, setTitle } from "@/lib/format.ts";
import { colors } from "@/theme/colors.ts";

function SetChip({
  label,
  score,
  state,
  testId,
}: {
  readonly label: string;
  readonly score: string;
  readonly state: "done" | "current" | "future";
  readonly testId: string;
}): ReactNode {
  // Finished sets recede, the set in play is the tonal fill, the rest outlines.
  const tone = {
    done: { background: colors.surfaceContainerHighest, content: colors.onSurface },
    current: { background: colors.secondaryContainer, content: colors.onSecondaryContainer },
    future: { background: "transparent", content: colors.onSurfaceVariant },
  }[state];
  const shown = state === "future" ? "–" : score;
  return (
    <YStack
      flex={1}
      backgroundColor={tone.background}
      borderWidth={1}
      borderColor={state === "future" ? colors.outlineVariant : "transparent"}
      borderRadius={state === "current" ? 28 : 16}
      paddingVertical={8}
      alignItems="center"
    >
      <Label color={tone.content}>{label}</Label>
      <Display
        fontSize={20}
        color={tone.content}
        opacity={state === "future" ? 0.5 : 1}
        testID={testId}
      >
        {shown}
      </Display>
    </YStack>
  );
}

/** The set/game chip row across the top of the live screen. */
export function SetChips({
  match,
  snapshot,
}: {
  readonly match: { readonly config: MatchSnapshot["config"] };
  readonly snapshot: MatchSnapshot;
}): ReactNode {
  const chips: ReactNode[] = [];
  const unit =
    match.config.sport === "squash" || match.config.sport === "pickleball" ? "game" : "set";
  for (let setIndex = 0; setIndex < match.config.bestOf; setIndex += 1) {
    const completed = snapshot.completedSets[setIndex];
    // A one-set match shows "Set", not "Set 1"; the test id keeps its number either way.
    const setLabel = setTitle(match.config, setIndex + 1);
    const testId = `set-chip-${unit}-${String(setIndex + 1)}`;
    if (completed !== undefined) {
      chips.push(
        <SetChip
          key={testId}
          label={setLabel}
          score={`${String(completed.games.A)}–${String(completed.games.B)}`}
          state="done"
          testId={testId}
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
          key={testId}
          label={isSuperTieBreak ? "Super TB" : setLabel}
          score={score}
          state="current"
          testId={isSuperTieBreak ? "set-chip-super-tb" : testId}
        />,
      );
    } else {
      chips.push(
        <SetChip key={testId} label={setLabel} score="–" state="future" testId={testId} />,
      );
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
  // The serving pair's card takes the highlight colour — the serve is the
  // one thing on this screen that must read from across the court.
  const content = serving ? colors.onPrimaryContainer : colors.onSurface;
  return (
    <XStack
      flex={1}
      backgroundColor={serving ? colors.primaryContainer : colors.card}
      borderRadius={serving ? 48 : 28}
      paddingVertical={16}
      paddingHorizontal={24}
      alignItems="center"
      justifyContent="space-between"
      pressStyle={{ opacity: 0.9, scale: 0.98 }}
      role="button"
      aria-label={`Point ${name}`}
      onPress={onScore}
    >
      <YStack gap={8} flex={1}>
        <XStack alignItems="center" gap={8}>
          <View
            width={28}
            height={28}
            borderRadius={14}
            backgroundColor={colors.onPrimaryContainer}
            alignItems="center"
            justifyContent="center"
            opacity={serving ? 1 : 0}
            testID={`${testID}-serve${serving ? "-on" : "-off"}`}
          >
            {Boolean(serving && servingSide) && (
              <Body fontSize={12} fontWeight="700" color={colors.primaryContainer}>
                {serveBadge(serverNumber, servingSide)}
              </Body>
            )}
          </View>
          <Display fontSize={22} color={content} flexShrink={1} numberOfLines={2}>
            {name}
          </Display>
        </XStack>
        <Label color={content} opacity={0.8}>
          {hint ?? "Tap to score +1"}
        </Label>
      </YStack>
      <Display fontSize={104} letterSpacing={-3} color={content} testID={testID}>
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
      backgroundColor={colors.scrim}
      alignItems="center"
      justifyContent="center"
      paddingHorizontal={24}
    >
      <YStack
        backgroundColor={colors.surfaceContainerHigh}
        borderRadius={28}
        padding={24}
        width="100%"
        gap={16}
      >
        <YStack gap={4} alignItems="center">
          <Label color={colors.primary} fontWeight="600">
            {`Level at ${String(target - 1)}-${String(target - 1)}`}
          </Label>
          <Display fontSize={24}>Receiver's choice</Display>
        </YStack>
        <XStack gap={8}>
          <SetChoiceButton
            label={`Short · to ${String(target)}`}
            detail="Next point wins"
            onPress={() => {
              onChoose("one");
            }}
            testID="set-choice-one"
          />
          <SetChoiceButton
            label={`Long · to ${String(target + 1)}`}
            detail="Play two more points"
            onPress={() => {
              onChoose("two");
            }}
            testID="set-choice-two"
          />
        </XStack>
        <Label textAlign="center" lineHeight={16}>
          The receiving pair decides; the choice is played to the end of the game
        </Label>
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
      backgroundColor={colors.secondaryContainer}
      borderRadius={28}
      paddingVertical={16}
      paddingHorizontal={8}
      alignItems="center"
      gap={2}
      pressStyle={{ opacity: 0.85, borderRadius: 16 }}
      role="button"
      aria-label={label}
      onPress={onPress}
      testID={testID}
    >
      <Body fontSize={16} fontWeight="600" color={colors.onSecondaryContainer}>
        {label}
      </Body>
      <Label color={colors.onSecondaryContainer}>{detail}</Label>
    </YStack>
  );
}

/** The Live/Paused pill, the set in play (when the match has more than one), and match clock. */
export function LiveHeader({
  paused,
  setLabel,
  clock,
}: {
  readonly paused: boolean;
  /** "Set 2", "Game 2", "Super tie-break" — empty in a one-set match. */
  readonly setLabel: string;
  readonly clock: string;
}): ReactNode {
  const content = paused ? colors.onSurfaceVariant : colors.onPrimaryContainer;
  return (
    <XStack alignItems="center" justifyContent="space-between">
      <Pill
        backgroundColor={paused ? colors.surfaceContainerHighest : colors.primaryContainer}
        height={32}
        paddingLeft={10}
        paddingRight={12}
        gap={6}
        testID="live-pill"
      >
        {paused ? (
          <Icon name="pause" size={16} color={content} />
        ) : (
          <LiveDot size={8} color={content} />
        )}
        <Body fontSize={14} fontWeight="600" color={content}>
          {paused ? "Paused" : "Live"}
        </Body>
      </Pill>
      <Label>{setLabel}</Label>
      <Display fontSize={16} testID="match-clock">
        {clock}
      </Display>
    </XStack>
  );
}

/** The Undo / Pause / End row — a button group, the middle action the widest. */
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
    <XStack gap={8}>
      <Button
        flex={1}
        label="Undo"
        icon="undo"
        variant="tonal"
        paddingHorizontal={8}
        onPress={onUndo}
      />
      <Button
        flex={1.3}
        label={paused ? "Resume" : "Pause"}
        icon={paused ? "play" : "pause"}
        variant={paused ? "filled" : "tonal"}
        paddingHorizontal={8}
        onPress={onTogglePause}
        testID="pause-toggle"
      />
      <Button
        flex={1}
        label="End"
        aria-label="End match"
        icon="stop"
        variant="outlined"
        paddingHorizontal={8}
        onPress={onEnd}
        testID="end-match"
      />
    </XStack>
  );
}
