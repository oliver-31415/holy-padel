import {
  computePointsTotals,
  computeProfileStats,
  countMatches,
  createPlayer,
  databaseSizeBytes,
  getOwner,
  listMatches,
  listRoster,
  loadMatchDefaults,
  resolveNewMatchDefaults,
} from "@holy-padel/db";
import { router, useFocusEffect } from "expo-router";
import type { ReactNode } from "react";
import { useCallback, useState } from "react";
import { Platform, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { View, XStack, YStack } from "tamagui";
import { ColorSettings } from "@/components/color-settings.tsx";
import { Button, IconButton, ListItem } from "@/components/controls.tsx";
import { Icon } from "@/components/icons.tsx";
import { NewPlayerRow } from "@/components/new-player-row.tsx";
import { SegmentedRow } from "@/components/segmented-row.tsx";
import { StatTile } from "@/components/stat-tile.tsx";
import {
  Avatar,
  Body,
  Card,
  Display,
  Divider,
  groupCorners,
  Label,
  ResultBadge,
  SectionTitle,
} from "@/components/ui.tsx";
import { useDbMutation, useDbQuery } from "@/db/provider.tsx";
import {
  getHealthStatus,
  type HealthStatus,
  requestHealthAuthorization,
} from "@/health/health-log.ts";
import { durationLabel, megabytesLabel, recordLabel } from "@/lib/format.ts";
import { colors } from "@/theme/colors.ts";
import { loadThemeSetting, useSetThemeSetting } from "@/theme/theme.tsx";

const HEALTH_PLATFORM = Platform.OS === "android" ? "Health Connect" : "Apple Health";

/** Fixed right-aligned columns in the by-sport table. */
const COLUMN_RECORD = 48;
const COLUMN_POINTS = 96;

/**
 * Opt-in prompt to connect the platform health store. Rendered only when the
 * status is actionable ("undetermined", or "denied" with a softer Settings
 * hint); "granted" and "unavailable" render nothing. Connecting never gates
 * anything else on the screen — it's purely additive.
 */
function HealthBanner(): ReactNode {
  const [status, setStatus] = useState<HealthStatus>("unavailable");
  const [busy, setBusy] = useState(false);
  const [stalled, setStalled] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void getHealthStatus().then((next) => {
        if (active) {
          setStatus(next);
        }
      });
      return () => {
        active = false;
      };
    }, []),
  );

  if (status === "granted" || status === "unavailable") {
    return null;
  }

  const denied = status === "denied";

  const connect = (): void => {
    if (busy) {
      return;
    }
    setBusy(true);
    void requestHealthAuthorization()
      .then(() => getHealthStatus())
      .then((next) => {
        setStatus(next);
        setStalled(next !== "granted");
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <Card flexDirection="row" alignItems="center" gap={16} padding={16}>
      <View
        width={40}
        height={40}
        borderRadius={20}
        backgroundColor={colors.secondaryContainer}
        alignItems="center"
        justifyContent="center"
      >
        <Icon name="heart" color={colors.onSecondaryContainer} />
      </View>
      <YStack flex={1} gap={2}>
        <Body fontSize={16} fontWeight="500">
          {`Connect ${HEALTH_PLATFORM}`}
        </Body>
        <Label lineHeight={16}>
          {denied
            ? "Re-enable workout access in Settings — optional"
            : "Save your matches as workouts — optional"}
        </Label>
        {stalled && !denied ? (
          <Label lineHeight={16}>
            No prompt appeared? Open Health Connect, allow Holy Padel to write workouts, then try
            again.
          </Label>
        ) : null}
      </YStack>
      {denied ? null : (
        <Button
          label="Connect"
          variant="tonal"
          size="sm"
          opacity={busy ? 0.6 : 1}
          onPress={connect}
        />
      )}
    </Card>
  );
}

/** A compact unboxed secondary stat (streak, best run, time). */
function MiniStat({ value, label }: { readonly value: string; readonly label: string }): ReactNode {
  return (
    <YStack flex={1} alignItems="center" gap={2}>
      <Display fontSize={22}>{value}</Display>
      <Label>{label}</Label>
    </YStack>
  );
}

/** The primary-coloured heading above a group of rows, as in system settings. */
function GroupTitle({ title }: { readonly title: string }): ReactNode {
  return (
    <SectionTitle color={colors.primary} paddingHorizontal={8} paddingTop={12}>
      {title}
    </SectionTitle>
  );
}

export default function ProfileScreen(): ReactNode {
  const insets = useSafeAreaInsets();
  const mutate = useDbMutation();
  const owner = useDbQuery(getOwner);
  const ownerId = owner?.id ?? "nico";
  const stats = useDbQuery((driver) => computeProfileStats(driver, ownerId));
  const matchCount = useDbQuery(countMatches);
  const sizeBytes = useDbQuery(databaseSizeBytes);
  const themeSetting = useDbQuery(loadThemeSetting);
  const setThemeSetting = useSetThemeSetting();
  const roster = useDbQuery(listRoster);
  const points = useDbQuery((driver) => computePointsTotals(driver, ownerId));
  const savedDefaults = useDbQuery(loadMatchDefaults);
  const lastConfig = useDbQuery(listMatches)?.[0]?.config;
  const players = roster.filter((entry) => !entry.isOwner);

  const winRate = `${String(stats.winRatePercent)}%`;
  const sideLabel = owner?.side === undefined ? "" : ` · plays ${owner.side} side`;

  // The summary under the Match defaults row mirrors what the new-match
  // screen will prefill: saved defaults if set, else the last match's setup.
  const effective = resolveNewMatchDefaults({
    ...(savedDefaults === undefined ? {} : { saved: savedDefaults }),
    ...(lastConfig === undefined ? {} : { lastConfig }),
  });
  const sportLabel = effective.sport.charAt(0).toUpperCase() + effective.sport.slice(1);
  const defaultsSummary = `${sportLabel} · ${
    effective.format === "singles" ? "Singles" : "Doubles"
  } · best of ${String(effective.bestOf)}`;

  // Per-sport record and lifetime points, as one table (only sports played).
  const sportRows = (
    [
      ["Padel", stats.recordsBySport.padel, points.bySport.padel],
      ["Squash", stats.recordsBySport.squash, points.bySport.squash],
      ["Pickleball", stats.recordsBySport.pickleball, points.bySport.pickleball],
    ] as const
  ).filter(
    ([, record, totals]) =>
      record.won + record.lost + record.drew > 0 || totals.for + totals.against > 0,
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{
        paddingTop: insets.top + 8,
        paddingHorizontal: 16,
        paddingBottom: insets.bottom + 96,
        gap: 12,
      }}
    >
      <XStack alignItems="center" gap={16} paddingTop={8}>
        <Avatar letter={owner?.name.charAt(0) ?? "?"} size={72} shape="cookie" />
        <YStack flex={1}>
          <Display fontSize={32}>{owner?.name ?? "Your profile"}</Display>
          <Label>{`${owner?.club ?? ""}${sideLabel}`}</Label>
        </YStack>
        <IconButton
          icon="edit"
          label="Edit profile"
          variant="tonal"
          size={48}
          onPress={() => {
            router.navigate("/edit-profile");
          }}
        />
      </XStack>

      <HealthBanner />

      <XStack gap={8}>
        <StatTile value={String(stats.played)} label="Played" variant="surface" />
        <StatTile value={recordLabel(stats.record)} label="Record" variant="primary" />
        <StatTile value={winRate} label="Win rate" variant="tonal" />
      </XStack>

      <Card padding={20} gap={16}>
        <XStack alignItems="center" justifyContent="space-between">
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
        </XStack>
        <Divider />
        <XStack alignItems="center">
          <MiniStat
            value={
              stats.streak === undefined
                ? "—"
                : `${stats.streak.kind === "won" ? "W" : "L"}${String(stats.streak.count)}`
            }
            label="Streak"
          />
          <MiniStat value={String(stats.bestWinStreak)} label="Best run" />
          <MiniStat value={durationLabel(stats.totalDurationMs)} label="Time played" />
        </XStack>
      </Card>

      <Card padding={20} gap={12}>
        <XStack alignItems="center" justifyContent="space-between">
          <SectionTitle>By sport</SectionTitle>
          <Label>{`${String(points.for + points.against)} rallies`}</Label>
        </XStack>
        {sportRows.length === 0 ? (
          <Body fontSize={14} color={colors.onSurfaceVariant}>
            No finished matches yet.
          </Body>
        ) : (
          <>
            <XStack alignItems="flex-end">
              <View flex={1} />
              <Label width={COLUMN_RECORD} textAlign="right">
                W–L
              </Label>
              <Label width={COLUMN_POINTS} textAlign="right">
                Points
              </Label>
            </XStack>
            {sportRows.map(([label, record, totals]) => (
              <XStack key={label} alignItems="center">
                <Body flex={1} fontSize={16}>
                  {label}
                </Body>
                <Display fontSize={16} width={COLUMN_RECORD} textAlign="right">
                  {recordLabel(record)}
                </Display>
                <Display
                  fontSize={16}
                  fontWeight="500"
                  width={COLUMN_POINTS}
                  textAlign="right"
                  color={colors.onSurfaceVariant}
                >
                  {`${String(totals.for)}–${String(totals.against)}`}
                </Display>
              </XStack>
            ))}
          </>
        )}
      </Card>

      <GroupTitle title="Players" />
      <YStack gap={2}>
        {players.map((entry, index) => (
          <XStack
            key={entry.id}
            alignItems="center"
            gap={16}
            minHeight={72}
            paddingVertical={12}
            paddingHorizontal={16}
            backgroundColor={colors.card}
            {...groupCorners(index, players.length + 1)}
            pressStyle={{ opacity: 0.8 }}
            role="button"
            onPress={() => {
              router.push(`/player/${entry.id}`);
            }}
            testID={`player-${entry.id}`}
          >
            <Avatar letter={entry.name.charAt(0)} size={40} />
            <YStack flex={1} gap={2}>
              <Body fontSize={16}>{entry.name}</Body>
              <Label>
                {`${String(entry.matchesWithOwner)} ${
                  entry.matchesWithOwner === 1 ? "match" : "matches"
                } with you`}
              </Label>
            </YStack>
            <Icon name="chevronRight" color={colors.onSurfaceVariant} />
          </XStack>
        ))}
        <YStack
          backgroundColor={colors.card}
          minHeight={72}
          justifyContent="center"
          {...groupCorners(players.length, players.length + 1)}
        >
          <NewPlayerRow
            onCreate={(name) => {
              const id = `player-${String(Date.now())}`;
              mutate((driver) => {
                createPlayer(driver, { id, name, createdAt: Date.now() });
              });
              router.push(`/player/${id}`);
            }}
          />
        </YStack>
      </YStack>

      <GroupTitle title="Appearance" />
      <YStack gap={2}>
        <YStack backgroundColor={colors.card} padding={20} {...groupCorners(0, 2)}>
          <SegmentedRow
            label="Theme"
            options={[
              { value: "system", label: "System" },
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
            value={themeSetting ?? "system"}
            onChange={setThemeSetting}
          />
        </YStack>
        <YStack backgroundColor={colors.card} padding={20} {...groupCorners(1, 2)}>
          <ColorSettings />
        </YStack>
      </YStack>

      <GroupTitle title="Settings" />
      <YStack gap={2}>
        <ListItem
          icon="tune"
          headline="Match defaults"
          supporting={defaultsSummary}
          onPress={() => {
            router.navigate("/edit-defaults");
          }}
          testID="defaults-row"
          index={0}
          count={2}
        />
        <ListItem
          icon="storage"
          headline="On this phone"
          supporting={`SQLite · ${String(matchCount)} matches · ${megabytesLabel(sizeBytes)}`}
          aria-label="Manage your data"
          onPress={() => {
            router.navigate("/data");
          }}
          index={1}
          count={2}
        />
      </YStack>
    </ScrollView>
  );
}
