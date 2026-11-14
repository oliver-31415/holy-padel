import { computePlayerStats, getOwner, getPlayer } from "@holy-padel/db";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import type { ReactNode } from "react";
import { ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { XStack, YStack } from "tamagui";
import { IconButton } from "@/components/controls.tsx";
import { Icon } from "@/components/icons.tsx";
import { RecordBar } from "@/components/record-bar.tsx";
import { StatTile } from "@/components/stat-tile.tsx";
import {
  Avatar,
  Body,
  Card,
  Display,
  groupCorners,
  Label,
  ResultBadge,
  SectionTitle,
} from "@/components/ui.tsx";
import { useDbQuery } from "@/db/provider.tsx";
import { fullDayLabel, recordLabel } from "@/lib/format.ts";
import { goBack } from "@/lib/navigation.ts";
import { colors } from "@/theme/colors.ts";

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
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{
        paddingTop: insets.top + 8,
        paddingHorizontal: 16,
        paddingBottom: insets.bottom + 24,
        gap: 12,
      }}
    >
      <XStack alignItems="center" justifyContent="space-between" marginLeft={-8}>
        <IconButton icon="arrowBack" label="Back" size={48} onPress={goBack} />
        <IconButton
          icon="edit"
          label="Edit player"
          variant="tonal"
          size={48}
          onPress={() => {
            router.navigate(`/edit-player/${player.id}`);
          }}
          testID="edit-player"
        />
      </XStack>

      <XStack alignItems="center" gap={16}>
        <Avatar letter={player.name.charAt(0)} size={72} shape="cookie" />
        <YStack flex={1}>
          <Display fontSize={32}>{player.name}</Display>
          <Label>{subtitle}</Label>
        </YStack>
      </XStack>

      <XStack gap={8}>
        <StatTile value={String(stats.played)} label="Played" variant="surface" />
        <StatTile value={recordLabel(stats.record)} label="Record" variant="primary" />
        <StatTile value={`${String(stats.winRatePercent)}%`} label="Win rate" variant="tonal" />
      </XStack>

      {stats.form.length > 0 && (
        <Card
          paddingVertical={16}
          paddingHorizontal={20}
          flexDirection="row"
          alignItems="center"
          justifyContent="space-between"
        >
          <SectionTitle>Form · last 5</SectionTitle>
          <XStack gap={6}>
            {stats.form.map((outcome, index) => (
              <ResultBadge
                // biome-ignore lint/suspicious/noArrayIndexKey: the strip is positional by design
                key={index}
                won={outcome === "won"}
                drew={outcome === "drew"}
                size={28}
              />
            ))}
          </XStack>
        </Card>
      )}

      <Card padding={20} gap={12}>
        <SectionTitle>With you</SectionTitle>
        {togetherTotal === 0 ? (
          <Body fontSize={14} color={colors.onSurfaceVariant}>
            No matches partnering you yet
          </Body>
        ) : (
          <XStack alignItems="center" gap={12}>
            <Body flex={1} fontSize={14} color={colors.onSurfaceVariant}>
              {`${String(togetherTotal)} played together`}
            </Body>
            <RecordBar
              won={stats.withOwner.won}
              lost={stats.withOwner.lost}
              drew={stats.withOwner.drew}
            />
            <Display fontSize={16} width={52} textAlign="right">
              {recordLabel(stats.withOwner)}
            </Display>
          </XStack>
        )}
        {againstTotal > 0 && (
          <XStack alignItems="center" justifyContent="space-between">
            <Body fontSize={16}>vs you</Body>
            <Display fontSize={16}>{recordLabel(stats.againstOwner)}</Display>
          </XStack>
        )}
      </Card>

      {stats.matchesTogether.length > 0 && (
        <>
          <SectionTitle color={colors.primary} paddingHorizontal={8} paddingTop={12}>
            Matches with you
          </SectionTitle>
          <YStack gap={2}>
            {stats.matchesTogether.map((match, index) => (
              <XStack
                key={match.id}
                alignItems="center"
                gap={16}
                minHeight={72}
                paddingVertical={12}
                paddingHorizontal={16}
                backgroundColor={colors.card}
                {...groupCorners(index, stats.matchesTogether.length)}
                pressStyle={{ opacity: 0.8 }}
                role="button"
                onPress={() => {
                  router.push(`/match/${match.id}`);
                }}
              >
                <ResultBadge
                  won={match.outcome === "won"}
                  drew={match.outcome === "drew"}
                  size={40}
                />
                <YStack flex={1} gap={2}>
                  <Body fontSize={16}>{fullDayLabel(match.startedAt)}</Body>
                  <Label>{match.scoreLine ?? ""}</Label>
                </YStack>
                <Icon name="chevronRight" color={colors.onSurfaceVariant} />
              </XStack>
            ))}
          </YStack>
        </>
      )}
    </ScrollView>
  );
}
