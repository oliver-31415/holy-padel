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
import { ChevronRight, Heart } from "@/components/icons.tsx";
import { NewPlayerRow } from "@/components/new-player-row.tsx";
import { SegmentedRow } from "@/components/segmented-row.tsx";
import { StatTile } from "@/components/stat-tile.tsx";
import { Avatar, Body, Card, Display, Overline, Pill, ResultBadge } from "@/components/ui.tsx";
import { useDbMutation, useDbQuery } from "@/db/provider.tsx";
import {
  getHealthStatus,
  type HealthStatus,
  requestHealthAuthorization,
} from "@/health/health-log.ts";
import { durationLabel, megabytesLabel, recordLabel } from "@/lib/format.ts";
import { accentAlpha, colors, textAlpha } from "@/theme/colors.ts";
import { loadThemeSetting, useSetThemeSetting } from "@/theme/theme.tsx";

const HEALTH_PLATFORM = Platform.OS === "android" ? "Health Connect" : "Apple Health";

/** Fixed right-aligned columns in the by-sport table. */
const COLUMN_RECORD = 42;
const COLUMN_POINTS = 82;

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
    <Card
      flexDirection="row"
      alignItems="center"
      gap={13}
      borderRadius={18}
      paddingVertical={14}
      paddingHorizontal={16}
    >
      <View
        width={40}
        height={40}
        borderRadius={20}
        backgroundColor={accentAlpha(0.22)}
        alignItems="center"
        justifyContent="center"
      >
        <Heart size={19} color={colors.accentOnCard} strokeWidth={2.4} />
      </View>
      <YStack flex={1} gap={2}>
        <Body fontSize={14.5} fontWeight="800">
          {`Connect ${HEALTH_PLATFORM}`}
        </Body>
        <Body fontSize={11.5} fontWeight="600" color={textAlpha(0.45)}>
          {denied
            ? "Re-enable workout access in Settings — optional"
            : "Save your matches as workouts — optional"}
        </Body>
        {stalled && !denied ? (
          <Body fontSize={10.5} fontWeight="600" color={textAlpha(0.4)}>
            No prompt appeared? Open Health Connect, allow Holy Padel to write workouts, then try
            again.
          </Body>
        ) : null}
      </YStack>
      {denied ? null : (
        <Pill
          backgroundColor={colors.tileInk}
          paddingVertical={9}
          paddingHorizontal={15}
          pressStyle={{ opacity: 0.7 }}
          opacity={busy ? 0.6 : 1}
          role="button"
          onPress={connect}
        >
          <Body fontSize={11} fontWeight="800" letterSpacing={1.2} color={colors.accent}>
            CONNECT
          </Body>
        </Pill>
      )}
    </Card>
  );
}

/** Hairline between grouped rows inside a card. */
function Rule(): ReactNode {
  return <View height={1} backgroundColor={textAlpha(0.08)} />;
}

/** A compact unboxed secondary stat (streak, best run, time). */
function MiniStat({ value, label }: { readonly value: string; readonly label: string }): ReactNode {
  return (
    <YStack flex={1} alignItems="center" gap={3}>
      <Display fontSize={18}>{value}</Display>
      <Body fontSize={9} fontWeight="800" letterSpacing={1.4} color={textAlpha(0.4)}>
        {label}
      </Body>
    </YStack>
  );
}

/** A settings row: label, muted value, chevron. */
function SettingsRow({
  label,
  value,
  ariaLabel,
  onPress,
  testID,
}: {
  readonly label: string;
  readonly value: string;
  readonly ariaLabel?: string;
  readonly onPress: () => void;
  readonly testID?: string;
}): ReactNode {
  return (
    <XStack
      alignItems="center"
      gap={10}
      pressStyle={{ opacity: 0.7 }}
      role="button"
      aria-label={ariaLabel ?? label}
      onPress={onPress}
      {...(testID === undefined ? {} : { testID })}
    >
      <Body fontSize={14.5} fontWeight="700">
        {label}
      </Body>
      <Body flex={1} fontSize={11.5} fontWeight="600" color={textAlpha(0.45)} textAlign="right">
        {value}
      </Body>
      <ChevronRight size={13} color={textAlpha(0.3)} />
    </XStack>
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

  // The summary under the MATCH DEFAULTS row mirrors what the new-match
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
      style={{ flex: 1, backgroundColor: colors.screen }}
      contentContainerStyle={{
        paddingTop: insets.top + 12,
        paddingHorizontal: 16,
        paddingBottom: insets.bottom + 90,
        gap: 12,
      }}
    >
      <XStack alignItems="center" gap={14}>
        <Avatar letter={owner?.name.charAt(0) ?? "N"} size={54} />
        <YStack flex={1}>
          <Display fontSize={30}>{(owner?.name ?? "").toUpperCase()}</Display>
          <Body fontSize={12} fontWeight="600" color={textAlpha(0.45)}>
            {`${owner?.club ?? ""}${sideLabel}`}
          </Body>
        </YStack>
        <Pill
          borderWidth={1}
          borderColor={textAlpha(0.16)}
          paddingVertical={8}
          paddingHorizontal={13}
          pressStyle={{ opacity: 0.6 }}
          role="button"
          aria-label="Edit profile"
          onPress={() => {
            router.navigate("/edit-profile");
          }}
        >
          <Body fontSize={11} fontWeight="800" letterSpacing={1.2} color={textAlpha(0.55)}>
            EDIT
          </Body>
        </Pill>
      </XStack>

      <HealthBanner />

      <XStack gap={8}>
        <StatTile value={String(stats.played)} label="PLAYED" variant="ink" />
        <StatTile value={recordLabel(stats.record)} label="RECORD" variant="accent" />
        <StatTile value={winRate} label="WIN RATE" variant="white" />
      </XStack>

      <Card borderRadius={20} paddingVertical={14} paddingHorizontal={17} gap={13}>
        <XStack alignItems="center" justifyContent="space-between">
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
        </XStack>
        <Rule />
        <XStack alignItems="center">
          <MiniStat
            value={
              stats.streak === undefined
                ? "—"
                : `${stats.streak.kind === "won" ? "W" : "L"}${String(stats.streak.count)}`
            }
            label="STREAK"
          />
          <MiniStat value={String(stats.bestWinStreak)} label="BEST RUN" />
          <MiniStat value={durationLabel(stats.totalDurationMs)} label="TIME PLAYED" />
        </XStack>
      </Card>

      <Card borderRadius={20} paddingVertical={15} paddingHorizontal={17} gap={12}>
        <XStack alignItems="center" justifyContent="space-between">
          <Overline>BY SPORT</Overline>
          <Body fontSize={10} fontWeight="800" letterSpacing={1.2} color={textAlpha(0.4)}>
            {`${String(points.for + points.against)} RALLIES`}
          </Body>
        </XStack>
        {sportRows.length === 0 ? (
          <Body fontSize={12.5} fontWeight="600" color={textAlpha(0.4)}>
            No finished matches yet.
          </Body>
        ) : (
          <>
            <XStack alignItems="flex-end">
              <View flex={1} />
              <Body
                fontSize={9}
                fontWeight="800"
                letterSpacing={1.2}
                color={textAlpha(0.35)}
                width={COLUMN_RECORD}
                textAlign="right"
              >
                W–L
              </Body>
              <Body
                fontSize={9}
                fontWeight="800"
                letterSpacing={1.2}
                color={textAlpha(0.35)}
                width={COLUMN_POINTS}
                textAlign="right"
              >
                POINTS
              </Body>
            </XStack>
            {sportRows.map(([label, record, totals]) => (
              <XStack key={label} alignItems="center">
                <Body flex={1} fontSize={14.5} fontWeight="700">
                  {label}
                </Body>
                <Display fontSize={15} width={COLUMN_RECORD} textAlign="right">
                  {recordLabel(record)}
                </Display>
                <Display
                  fontSize={15}
                  width={COLUMN_POINTS}
                  textAlign="right"
                  color={textAlpha(0.55)}
                >
                  {`${String(totals.for)}–${String(totals.against)}`}
                </Display>
              </XStack>
            ))}
          </>
        )}
      </Card>

      <Card borderRadius={20} paddingVertical={15} paddingHorizontal={17} gap={11}>
        <Overline>PLAYERS</Overline>
        {players.map((entry) => (
          <XStack
            key={entry.id}
            alignItems="center"
            gap={12}
            pressStyle={{ opacity: 0.75 }}
            role="button"
            onPress={() => {
              router.push(`/player/${entry.id}`);
            }}
            testID={`player-${entry.id}`}
          >
            <Avatar letter={entry.name.charAt(0)} size={30} />
            <YStack flex={1}>
              <Body fontSize={14.5} fontWeight="700">
                {entry.name}
              </Body>
              <Body fontSize={10.5} fontWeight="600" color={textAlpha(0.4)}>
                {`${String(entry.matchesWithOwner)} ${
                  entry.matchesWithOwner === 1 ? "match" : "matches"
                } with you`}
              </Body>
            </YStack>
            <ChevronRight size={13} color={textAlpha(0.3)} />
          </XStack>
        ))}
        <NewPlayerRow
          onCreate={(name) => {
            const id = `player-${String(Date.now())}`;
            mutate((driver) => {
              createPlayer(driver, { id, name, createdAt: Date.now() });
            });
            router.push(`/player/${id}`);
          }}
        />
      </Card>

      <Card borderRadius={20} paddingVertical={15} paddingHorizontal={17} gap={14}>
        <Overline color={textAlpha(0.45)}>SETTINGS</Overline>
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
        <Rule />
        <ColorSettings />
        <Rule />
        <SettingsRow
          label="Match defaults"
          value={defaultsSummary}
          onPress={() => {
            router.navigate("/edit-defaults");
          }}
          testID="defaults-row"
        />
        <Rule />
        <SettingsRow
          label="On this phone"
          value={`SQLite · ${String(matchCount)} matches · ${megabytesLabel(sizeBytes)}`}
          ariaLabel="Manage your data"
          onPress={() => {
            router.navigate("/data");
          }}
        />
      </Card>
    </ScrollView>
  );
}
