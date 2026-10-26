import { computePlayerStats, getOwner, getPlayer } from "@holy-padel/db";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import type { ReactNode } from "react";
import { ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { View, XStack, YStack } from "tamagui";
import { ChevronLeft, ChevronRight } from "@/components/icons.tsx";
import { RecordBar } from "@/components/record-bar.tsx";
import { StatTile } from "@/components/stat-tile.tsx";
import { Avatar, Body, Card, Display, Overline, Pill, ResultBadge } from "@/components/ui.tsx";
import { useDbQuery } from "@/db/provider.tsx";
import { fullDayLabel, recordLabel } from "@/lib/format.ts";
import { goBack } from "@/lib/navigation.ts";
import { colors, textAlpha } from "@/theme/colors.ts";

/** A player's profile — their record, preferred side, and matches with you. */
export default function PlayerScreen(): ReactNode {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const player = useDbQuery((driver) => getPlayer(driver, id));
  const owner = useDbQuery(getOwner);
  const ownerId = owner?.id ?? "nico";
  const stats = useDbQuery((driver) => computePlayerStats(driver, id, ownerId));

  if (player === undefined) {
    // Deleted or unknown player (stale link, back after delete): recover home.
    return <Redirect href="/" />;
  }

  const sideLabel = player.side === undefined ? "" : ` · plays ${player.side} side`;
  const subtitle = `${player.club ?? ""}${sideLabel}`;
  const togetherTotal = stats.withOwner.won + stats.withOwner.lost + stats.withOwner.drew;
  const againstTotal = stats.againstOwner.won + stats.againstOwner.lost + stats.againstOwner.drew;

  return (
    <ScrollView
      style={{ backgroundColor: colors.screen }}
      contentContainerStyle={{
        paddingTop: insets.top + 12,
        paddingHorizontal: 16,
        paddingBottom: insets.bottom + 24,
        gap: 12,
      }}
    >
      <XStack alignItems="center" justifyContent="space-between">
        <View
          width={38}
          height={38}
          borderRadius={19}
          backgroundColor={colors.card}
          alignItems="center"
          justifyContent="center"
          boxShadow="0 2px 8px rgba(14, 17, 22, 0.08)"
          pressStyle={{ opacity: 0.8 }}
          role="button"
          aria-label="Back"
          onPress={goBack}
        >
          <ChevronLeft size={15} color={colors.text} />
        </View>
        <Pill
          borderWidth={1}
          borderColor={textAlpha(0.16)}
          paddingVertical={8}
          paddingHorizontal={13}
          pressStyle={{ opacity: 0.6 }}
          role="button"
          aria-label="Edit player"
          onPress={() => {
            router.navigate(`/edit-player/${player.id}`);
          }}
          testID="edit-player"
        >
          <Body fontSize={11} fontWeight="800" letterSpacing={1.2} color={textAlpha(0.55)}>
            EDIT
          </Body>
        </Pill>
      </XStack>

      <XStack alignItems="center" gap={14}>
        <Avatar letter={player.name.charAt(0)} size={54} />
        <YStack flex={1}>
          <Display fontSize={30}>{player.name.toUpperCase()}</Display>
          <Body fontSize={12} fontWeight="600" color={textAlpha(0.45)}>
            {subtitle}
          </Body>
        </YStack>
      </XStack>

      <XStack gap={8}>
        <StatTile value={String(stats.played)} label="PLAYED" variant="ink" />
        <StatTile value={recordLabel(stats.record)} label="RECORD" variant="accent" />
        <StatTile value={`${String(stats.winRatePercent)}%`} label="WIN RATE" variant="white" />
      </XStack>

      {stats.form.length > 0 && (
        <Card
          paddingVertical={13}
          paddingHorizontal={17}
          flexDirection="row"
          alignItems="center"
          justifyContent="space-between"
        >
          <Overline>FORM · LAST 5</Overline>
          <XStack gap={6}>
            {stats.form.map((outcome, index) => (
              <ResultBadge
                // biome-ignore lint/suspicious/noArrayIndexKey: the strip is positional by design
                key={index}
                won={outcome === "won"}
                drew={outcome === "drew"}
                size={25}
              />
            ))}
          </XStack>
        </Card>
      )}

      <Card borderRadius={20} paddingVertical={15} paddingHorizontal={17} gap={11}>
        <Overline>WITH YOU</Overline>
        {togetherTotal === 0 ? (
          <Body fontSize={13} fontWeight="600" color={textAlpha(0.45)}>
            No matches partnering you yet
          </Body>
        ) : (
          <XStack alignItems="center" gap={12}>
            <Body flex={1} fontSize={14} fontWeight="700" color={textAlpha(0.6)}>
              {`${String(togetherTotal)} played together`}
            </Body>
            <RecordBar
              won={stats.withOwner.won}
              lost={stats.withOwner.lost}
              drew={stats.withOwner.drew}
            />
            <Display fontSize={15} width={52} textAlign="right">
              {recordLabel(stats.withOwner)}
            </Display>
          </XStack>
        )}
        {againstTotal > 0 && (
          <XStack alignItems="center" justifyContent="space-between">
            <Body fontSize={14.5} fontWeight="700">
              vs you
            </Body>
            <Display fontSize={15}>{recordLabel(stats.againstOwner)}</Display>
          </XStack>
        )}
      </Card>

      {stats.matchesTogether.length > 0 && (
        <Card borderRadius={20} paddingVertical={15} paddingHorizontal={17} gap={13}>
          <Overline>MATCHES WITH YOU</Overline>
          {stats.matchesTogether.map((match) => (
            <XStack
              key={match.id}
              alignItems="center"
              justifyContent="space-between"
              pressStyle={{ opacity: 0.7 }}
              role="button"
              onPress={() => {
                router.push(`/match/${match.id}`);
              }}
            >
              <YStack gap={1}>
                <Body fontSize={14} fontWeight="700">
                  {fullDayLabel(match.startedAt)}
                </Body>
                <Body fontSize={11.5} fontWeight="600" color={textAlpha(0.45)}>
                  {match.scoreLine ?? ""}
                </Body>
              </YStack>
              <XStack alignItems="center" gap={10}>
                <ResultBadge
                  won={match.outcome === "won"}
                  drew={match.outcome === "drew"}
                  size={25}
                />
                <ChevronRight size={13} color={textAlpha(0.3)} />
              </XStack>
            </XStack>
          ))}
        </Card>
      )}
    </ScrollView>
  );
}
