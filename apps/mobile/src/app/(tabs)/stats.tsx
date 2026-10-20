import { getOwner, setSetting } from "@holy-padel/db";
import { useFocusEffect } from "expo-router";
import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { View, XStack, YStack } from "tamagui";
import { ClutchCard } from "@/components/clutch-card.tsx";
import { EffortCard, TrendCard, ZonesCard } from "@/components/effort-cards.tsx";
import { PeopleCard } from "@/components/people-card.tsx";
import { RalliesCard } from "@/components/rallies-card.tsx";
import { Body, Card, Display } from "@/components/ui.tsx";
import { useDbMutation, useDbQuery } from "@/db/provider.tsx";
import type { Sport } from "@/lib/insights.ts";
import {
  computeInsights,
  loadInsightData,
  MAX_HR_KEY,
  resolveMaxHr,
  sportsPlayed,
} from "@/lib/insights.ts";
import { colors, textAlpha } from "@/theme/colors.ts";

const SPORT_LABELS: Record<Sport | "all", string> = {
  all: "ALL",
  padel: "PADEL",
  squash: "SQUASH",
  pickleball: "PICKLEBALL",
};

function SportFilter({
  sports,
  value,
  onChange,
}: {
  readonly sports: readonly Sport[];
  readonly value: Sport | "all";
  readonly onChange: (next: Sport | "all") => void;
}): ReactNode {
  return (
    <XStack gap={7}>
      {(["all", ...sports] as const).map((sport) => {
        const active = sport === value;
        return (
          <Pressable
            key={sport}
            role="button"
            aria-selected={active}
            testID={`stats-sport-${sport}`}
            onPress={() => {
              onChange(sport);
            }}
          >
            <View
              paddingVertical={7}
              paddingHorizontal={13}
              borderRadius={999}
              backgroundColor={active ? colors.ink : "transparent"}
              borderWidth={active ? 0 : 1}
              borderColor={textAlpha(0.16)}
            >
              <Body
                fontSize={11}
                fontWeight="800"
                letterSpacing={1}
                color={active ? colors.white : textAlpha(0.5)}
              >
                {SPORT_LABELS[sport]}
              </Body>
            </View>
          </Pressable>
        );
      })}
    </XStack>
  );
}

/**
 * Everything the Stats tab reads and draws. Mounted only while the tab is in
 * focus: tabs stay mounted behind others, and re-deriving every match on each
 * point scored elsewhere would be wasted work.
 */
function StatsBody(): ReactNode {
  const mutate = useDbMutation();
  const owner = useDbQuery(getOwner);
  const ownerId = owner?.id ?? "nico";
  const data = useDbQuery(loadInsightData);
  const maxHr = useDbQuery(resolveMaxHr);
  const sports = sportsPlayed(data);
  const [chosen, setChosen] = useState<Sport | "all">("all");
  const sport = chosen === "all" || sports.includes(chosen) ? chosen : "all";
  const insights = useMemo(
    () => computeInsights(data, ownerId, sport, maxHr.bpm),
    [data, ownerId, sport, maxHr.bpm],
  );

  if (data.length === 0) {
    return (
      <Card borderRadius={20} paddingVertical={18} paddingHorizontal={17} gap={6}>
        <Body fontSize={15} fontWeight="800">
          Nothing to read yet
        </Body>
        <Body fontSize={12.5} fontWeight="600" color={textAlpha(0.5)}>
          Finish a match and your big points, partners and rivals show up here.
        </Body>
      </Card>
    );
  }

  const onlySport = sports.length === 1 ? sports[0] : undefined;
  return (
    <YStack gap={12}>
      {sports.length > 1 ? (
        <SportFilter sports={sports} value={sport} onChange={setChosen} />
      ) : null}
      <ClutchCard
        clutch={insights.clutch}
        comebacks={insights.comebacks}
        slips={insights.slips}
        sport={sport === "all" ? onlySport : sport}
      />
      <RalliesCard lengths={insights.rallies} />
      <PeopleCard partners={insights.partners} rivals={insights.rivals} />
      <EffortCard bands={insights.effort} trackedGames={insights.trackedGames} />
      <TrendCard points={insights.trend} />
      <ZonesCard
        zones={insights.zones}
        maxHr={maxHr}
        onChangeMaxHr={(bpm) => {
          mutate((driver) => {
            setSetting(driver, MAX_HR_KEY, String(Math.min(230, Math.max(120, bpm))));
          });
        }}
      />
    </YStack>
  );
}

/**
 * The Stats tab, ordered from what you can act on in a match to the long view:
 * big points and long rallies, then the people you play with and against, then effort — how it
 * relates to results, how it's trending, and where your heart rate sits.
 */
export default function StatsScreen(): ReactNode {
  const insets = useSafeAreaInsets();
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => {
        setFocused(false);
      };
    }, []),
  );
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.screen }}
      contentContainerStyle={{
        paddingTop: insets.top + 12,
        paddingHorizontal: 16,
        paddingBottom: insets.bottom + 90,
        gap: 12,
      }}
    >
      <Display fontSize={30}>STATS</Display>
      {focused ? <StatsBody /> : null}
    </ScrollView>
  );
}
