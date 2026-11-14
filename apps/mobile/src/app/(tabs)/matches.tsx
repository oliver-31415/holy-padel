import type { MatchSummary, SqlDriver } from "@holy-padel/db";
import { countMatches, getOwner, listMatches, loadEvents } from "@holy-padel/db";
import { computeMatch } from "@holy-padel/scoring";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { useState } from "react";
import { ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { XStack, YStack } from "tamagui";
import { Button, Chip } from "@/components/controls.tsx";
import { SportDot } from "@/components/court-art.tsx";
import { Icon } from "@/components/icons.tsx";
import { Body, Display, groupCorners, Label, ResultBadge } from "@/components/ui.tsx";
import { useDbQuery } from "@/db/provider.tsx";
import {
  liveScoreLine,
  matchMetaLabel,
  opponentsOf,
  ownerTeamOf,
  pairInitials,
  pairLabel,
} from "@/lib/format.ts";
import { useNow } from "@/lib/use-now.ts";
import { colors } from "@/theme/colors.ts";

type Filter = "all" | "won" | "lost" | "rivals";
type SportFilter = "all" | "padel" | "squash" | "pickleball";

/** A pair's stable identity: the two player ids, order-independent. */
function opponentKey(match: MatchSummary, ownerTeam: "A" | "B"): string {
  const ids = ownerTeam === "A" ? match.players.B : match.players.A;
  return [...ids].sort().join("+");
}

const FILTER_PREDICATES: Record<
  Filter,
  (match: MatchSummary, ownerTeam: "A" | "B", rivals: string | undefined) => boolean
> = {
  all: () => true,
  won: (match, ownerTeam) => match.status === "finished" && match.winner === ownerTeam,
  lost: (match, ownerTeam) =>
    match.status === "finished" && match.winner !== undefined && match.winner !== ownerTeam,
  rivals: (match, ownerTeam, rivals) => opponentKey(match, ownerTeam) === rivals,
};

function liveLine(driver: SqlDriver, match: MatchSummary): string {
  return liveScoreLine(computeMatch(match.config, loadEvents(driver, match.id)));
}

function MatchRow({
  match,
  scoreLine,
  now,
  ownerId,
  index,
  count,
}: {
  readonly match: MatchSummary;
  readonly scoreLine: string;
  readonly now: number;
  readonly ownerId: string;
  readonly index: number;
  readonly count: number;
}): ReactNode {
  const ownerTeam = ownerTeamOf(match, ownerId);
  const live = match.status === "live";
  return (
    <XStack
      backgroundColor={live ? colors.secondaryContainer : colors.card}
      {...groupCorners(index, count)}
      minHeight={72}
      paddingVertical={12}
      paddingHorizontal={16}
      alignItems="center"
      gap={16}
      pressStyle={{ opacity: 0.85 }}
      role="button"
      onPress={() => {
        router.push(live ? `/live/${match.id}` : `/match/${match.id}`);
      }}
    >
      {live ? (
        <XStack
          width={40}
          height={40}
          borderRadius={20}
          backgroundColor={colors.primary}
          alignItems="center"
          justifyContent="center"
        >
          <Icon name="play" color={colors.onPrimary} />
        </XStack>
      ) : (
        <ResultBadge won={match.winner === ownerTeam} drew={match.winner === undefined} size={40} />
      )}
      <YStack gap={2} flex={1}>
        <Body fontSize={16} fontWeight="500" numberOfLines={1}>
          {`vs ${pairLabel(opponentsOf(match, ownerTeam))}`}
        </Body>
        <XStack alignItems="center" gap={6}>
          <SportDot sport={match.config.sport} />
          {live ? (
            <Label fontWeight="700" color={colors.primary}>
              Live
            </Label>
          ) : null}
          <Label numberOfLines={1} flexShrink={1}>
            {matchMetaLabel(match, now)}
          </Label>
        </XStack>
      </YStack>
      <Display fontSize={16} color={live ? colors.onSecondaryContainer : colors.onSurface}>
        {scoreLine}
      </Display>
    </XStack>
  );
}

export default function MatchesScreen(): ReactNode {
  const insets = useSafeAreaInsets();
  const now = useNow();
  const [filter, setFilter] = useState<Filter>("all");
  const [sport, setSport] = useState<SportFilter>("all");
  const owner = useDbQuery(getOwner);
  const ownerId = owner?.id ?? "nico";

  const total = useDbQuery(countMatches);
  const rows = useDbQuery((driver) =>
    listMatches(driver).map((match) => ({
      match,
      scoreLine: match.status === "live" ? liveLine(driver, match) : (match.scoreLine ?? ""),
    })),
  );

  const rivals = useDbQuery((driver) => {
    const finished = listMatches(driver).filter((match) => match.status === "finished");
    const counts = new Map<string, { label: string; count: number }>();
    for (const match of finished) {
      const ownerTeam = ownerTeamOf(match, ownerId);
      const key = opponentKey(match, ownerTeam);
      const entry = counts.get(key) ?? {
        label: pairInitials(opponentsOf(match, ownerTeam)),
        count: 0,
      };
      entry.count += 1;
      counts.set(key, entry);
    }
    const [top] = [...counts.entries()].sort((left, right) => right[1].count - left[1].count);
    return top === undefined ? undefined : { key: top[0], label: top[1].label };
  });

  const visible = rows
    .filter(({ match }) =>
      FILTER_PREDICATES[filter](match, ownerTeamOf(match, ownerId), rivals?.key),
    )
    .filter(({ match }) => sport === "all" || match.config.sport === sport);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{
        paddingTop: insets.top + 12,
        paddingHorizontal: 16,
        paddingBottom: insets.bottom + 96,
        gap: 16,
      }}
    >
      <XStack alignItems="center" justifyContent="space-between" paddingTop={8}>
        <YStack>
          <Display fontSize={32}>Matches</Display>
          <Label marginTop={2}>{`${String(total)} stored locally`}</Label>
        </YStack>
        <Button
          label="New"
          aria-label="New match"
          icon="add"
          variant="tonal"
          size="sm"
          onPress={() => {
            router.push("/new-match");
          }}
        />
      </XStack>

      <ScrollView horizontal={true} showsHorizontalScrollIndicator={false}>
        <XStack gap={8}>
          <Chip
            label="All"
            selected={filter === "all"}
            onPress={() => {
              setFilter("all");
            }}
          />
          <Chip
            label="Won"
            selected={filter === "won"}
            onPress={() => {
              setFilter("won");
            }}
          />
          <Chip
            label="Lost"
            selected={filter === "lost"}
            onPress={() => {
              setFilter("lost");
            }}
          />
          {rivals === undefined ? null : (
            <Chip
              label={`vs ${rivals.label}`}
              selected={filter === "rivals"}
              onPress={() => {
                setFilter("rivals");
              }}
            />
          )}
          <Chip
            label="Padel"
            selected={sport === "padel"}
            onPress={() => {
              setSport(sport === "padel" ? "all" : "padel");
            }}
          />
          <Chip
            label="Squash"
            selected={sport === "squash"}
            onPress={() => {
              setSport(sport === "squash" ? "all" : "squash");
            }}
          />
          <Chip
            label="Pickle"
            selected={sport === "pickleball"}
            onPress={() => {
              setSport(sport === "pickleball" ? "all" : "pickleball");
            }}
          />
        </XStack>
      </ScrollView>

      <YStack gap={2}>
        {visible.length === 0 ? (
          <YStack alignItems="center" gap={8} paddingVertical={48} testID="matches-empty">
            <Display fontSize={22} fontWeight="600">
              {total === 0 ? "No matches yet" : "Nothing here"}
            </Display>
            <Body fontSize={14} color={colors.onSurfaceVariant} textAlign="center">
              {total === 0
                ? "Play your first match and it will show up here."
                : "No matches match these filters."}
            </Body>
            {total === 0 ? (
              <Button
                label="Start your first match"
                icon="add"
                marginTop={8}
                onPress={() => {
                  router.push("/new-match");
                }}
              />
            ) : null}
          </YStack>
        ) : (
          visible.map(({ match, scoreLine }, index) => (
            <MatchRow
              key={match.id}
              match={match}
              scoreLine={scoreLine}
              now={now}
              ownerId={ownerId}
              index={index}
              count={visible.length}
            />
          ))
        )}
      </YStack>
    </ScrollView>
  );
}
