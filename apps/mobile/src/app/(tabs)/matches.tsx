import type { MatchSummary, SqlDriver } from "@holy-padel/db";
import { countMatches, getOwner, listMatches, loadEvents } from "@holy-padel/db";
import { computeMatch } from "@holy-padel/scoring";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { useState } from "react";
import { ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { XStack, YStack } from "tamagui";
import { SportStripe } from "@/components/court-art.tsx";
import { Plus } from "@/components/icons.tsx";
import { Body, Card, Display, Overline, Pill, ResultBadge } from "@/components/ui.tsx";
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
import { colors, textAlpha } from "@/theme/colors.ts";

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
}: {
  readonly match: MatchSummary;
  readonly scoreLine: string;
  readonly now: number;
  readonly ownerId: string;
}): ReactNode {
  const ownerTeam = ownerTeamOf(match, ownerId);
  const live = match.status === "live";
  return (
    <Card
      paddingVertical={15}
      paddingHorizontal={17}
      flexDirection="row"
      alignItems="center"
      justifyContent="space-between"
      gap={12}
      pressStyle={{ opacity: 0.9 }}
      role="button"
      onPress={() => {
        router.push(live ? `/live/${match.id}` : `/match/${match.id}`);
      }}
    >
      <SportStripe sport={match.config.sport} />
      <YStack gap={4} flex={1}>
        <Overline letterSpacing={1.4}>{matchMetaLabel(match, now)}</Overline>
        <Body fontSize={16} fontWeight="800">
          {`vs ${pairLabel(opponentsOf(match, ownerTeam))}`}
        </Body>
      </YStack>
      <XStack alignItems="center" gap={12}>
        <Display fontSize={17} letterSpacing={1}>
          {scoreLine}
        </Display>
        {live ? (
          <Pill
            backgroundColor={colors.ink}
            paddingVertical={5}
            paddingHorizontal={9}
            borderRadius={8}
          >
            <Display fontSize={12} letterSpacing={1} color={colors.accent}>
              LIVE
            </Display>
          </Pill>
        ) : (
          <ResultBadge
            won={match.winner === ownerTeam}
            drew={match.winner === undefined}
            size={30}
          />
        )}
      </XStack>
    </Card>
  );
}

function FilterChip({
  label,
  active,
  onPress,
}: {
  readonly label: string;
  readonly active: boolean;
  readonly onPress: () => void;
}): ReactNode {
  return (
    <Pill
      paddingVertical={8}
      paddingHorizontal={15}
      backgroundColor={active ? colors.ink : "transparent"}
      borderWidth={active ? 0 : 1}
      borderColor={textAlpha(0.16)}
      pressStyle={{ opacity: 0.8 }}
      role="button"
      onPress={onPress}
    >
      <Body
        fontSize={11}
        fontWeight="800"
        letterSpacing={1}
        color={active ? colors.white : textAlpha(0.5)}
      >
        {label}
      </Body>
    </Pill>
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
      style={{ flex: 1, backgroundColor: colors.screen }}
      contentContainerStyle={{
        paddingTop: insets.top + 12,
        paddingHorizontal: 16,
        paddingBottom: insets.bottom + 90,
        gap: 13,
      }}
    >
      <XStack alignItems="flex-end" justifyContent="space-between">
        <YStack>
          <Display fontSize={34}>MATCHES</Display>
          <Body fontSize={12.5} fontWeight="600" color={textAlpha(0.45)} marginTop={2}>
            {`${String(total)} stored locally`}
          </Body>
        </YStack>
        <Pill
          backgroundColor={colors.ink}
          paddingVertical={9}
          paddingHorizontal={14}
          gap={6}
          pressStyle={{ opacity: 0.85 }}
          role="button"
          onPress={() => {
            router.push("/new-match");
          }}
        >
          <Plus size={12} color={colors.accent} />
          <Body fontSize={11} fontWeight="800" letterSpacing={1.2} color={colors.accent}>
            NEW
          </Body>
        </Pill>
      </XStack>

      <ScrollView horizontal={true} showsHorizontalScrollIndicator={false}>
        <XStack gap={7}>
          <FilterChip
            label="ALL"
            active={filter === "all"}
            onPress={() => {
              setFilter("all");
            }}
          />
          <FilterChip
            label="WON"
            active={filter === "won"}
            onPress={() => {
              setFilter("won");
            }}
          />
          <FilterChip
            label="LOST"
            active={filter === "lost"}
            onPress={() => {
              setFilter("lost");
            }}
          />
          {rivals === undefined ? null : (
            <FilterChip
              label={`VS ${rivals.label}`}
              active={filter === "rivals"}
              onPress={() => {
                setFilter("rivals");
              }}
            />
          )}
          <FilterChip
            label="PADEL"
            active={sport === "padel"}
            onPress={() => {
              setSport(sport === "padel" ? "all" : "padel");
            }}
          />
          <FilterChip
            label="SQUASH"
            active={sport === "squash"}
            onPress={() => {
              setSport(sport === "squash" ? "all" : "squash");
            }}
          />
          <FilterChip
            label="PICKLE"
            active={sport === "pickleball"}
            onPress={() => {
              setSport(sport === "pickleball" ? "all" : "pickleball");
            }}
          />
        </XStack>
      </ScrollView>

      <YStack gap={9}>
        {visible.length === 0 ? (
          <YStack alignItems="center" gap={10} paddingVertical={46} testID="matches-empty">
            <Display fontSize={19} color={textAlpha(0.6)}>
              {total === 0 ? "NO MATCHES YET" : "NOTHING HERE"}
            </Display>
            <Body fontSize={12.5} fontWeight="600" color={textAlpha(0.4)} textAlign="center">
              {total === 0
                ? "Play your first match and it will show up here."
                : "No matches match these filters."}
            </Body>
            {total === 0 ? (
              <XStack
                marginTop={6}
                height={48}
                backgroundColor={colors.ink}
                borderRadius={14}
                alignItems="center"
                justifyContent="center"
                gap={8}
                paddingHorizontal={22}
                pressStyle={{ opacity: 0.85 }}
                role="button"
                onPress={() => {
                  router.push("/new-match");
                }}
              >
                <Plus size={13} color={colors.accent} />
                <Display fontSize={14} letterSpacing={1.2} color={colors.accent}>
                  START YOUR FIRST MATCH
                </Display>
              </XStack>
            ) : null}
          </YStack>
        ) : (
          visible.map(({ match, scoreLine }) => (
            <MatchRow
              key={match.id}
              match={match}
              scoreLine={scoreLine}
              now={now}
              ownerId={ownerId}
            />
          ))
        )}
      </YStack>
    </ScrollView>
  );
}
