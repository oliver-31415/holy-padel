import { router } from "expo-router";
import type { ReactNode } from "react";
import { useState } from "react";
import { Pressable } from "react-native";
import { XStack, YStack } from "tamagui";
import { ChevronRight } from "@/components/icons.tsx";
import { CardHeader } from "@/components/insight-parts.tsx";
import { RecordBar } from "@/components/record-bar.tsx";
import { Avatar, Body, Card, Display } from "@/components/ui.tsx";
import type { PersonRecord } from "@/lib/insights.ts";
import { colors, textAlpha } from "@/theme/colors.ts";

/** Rows shown per list before "Show all". */
const COLLAPSED = 3;
/** Fewer matches than this and a win rate says nothing. */
const MIN_FOR_STANDOUT = 3;

/** Every match with this person, draws included. */
function playedWith(record: PersonRecord): number {
  return record.won + record.lost + record.drew;
}

function winShare(record: PersonRecord): number {
  return record.won / Math.max(1, playedWith(record));
}

/** The record with the best (or worst) win rate among people played often enough. */
function standout(
  records: readonly PersonRecord[],
  pick: "best" | "worst",
): PersonRecord | undefined {
  const eligible = records.filter((record) => playedWith(record) >= MIN_FOR_STANDOUT);
  const sorted = [...eligible].sort((left, right) =>
    pick === "best" ? winShare(right) - winShare(left) : winShare(left) - winShare(right),
  );
  return sorted[0];
}

function PersonRow({
  record,
  testPrefix,
}: {
  readonly record: PersonRecord;
  readonly testPrefix: string;
}): ReactNode {
  return (
    <Pressable
      role="button"
      aria-label={record.name}
      testID={`${testPrefix}-${record.playerId}`}
      style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
      onPress={() => {
        router.push(`/player/${record.playerId}`);
      }}
    >
      <XStack alignItems="center" gap={12}>
        <Avatar letter={record.name.charAt(0)} size={30} />
        <Body flex={1} fontSize={14.5} fontWeight="700" textAlign="left" numberOfLines={1}>
          {record.name}
        </Body>
        <RecordBar won={record.won} lost={record.lost} drew={record.drew} />
        <Display fontSize={15} width={40} textAlign="right">
          {`${String(record.won)}–${String(record.lost)}`}
        </Display>
        <ChevronRight size={13} color={textAlpha(0.3)} />
      </XStack>
    </Pressable>
  );
}

function Highlight({
  label,
  record,
}: {
  readonly label: string;
  readonly record: PersonRecord;
}): ReactNode {
  return (
    <YStack flex={1} backgroundColor={colors.row} borderRadius={14} padding={11} gap={2}>
      <Body fontSize={8.5} fontWeight="800" letterSpacing={1.2} color={textAlpha(0.4)}>
        {label}
      </Body>
      <Body fontSize={14} fontWeight="800" numberOfLines={1}>
        {record.name}
      </Body>
      <Body fontSize={11} fontWeight="700" color={textAlpha(0.5)}>
        {`${String(Math.round(winShare(record) * 100))}% won · ${String(playedWith(record))} played`}
      </Body>
    </YStack>
  );
}

function PeopleList({
  title,
  records,
  expanded,
  testPrefix,
}: {
  readonly title: string;
  readonly records: readonly PersonRecord[];
  readonly expanded: boolean;
  readonly testPrefix: string;
}): ReactNode {
  if (records.length === 0) {
    return null;
  }
  return (
    <YStack gap={11}>
      <Body fontSize={9.5} fontWeight="800" letterSpacing={1.4} color={textAlpha(0.4)}>
        {title}
      </Body>
      {(expanded ? records : records.slice(0, COLLAPSED)).map((record) => (
        <PersonRow key={record.playerId} record={record} testPrefix={testPrefix} />
      ))}
    </YStack>
  );
}

/**
 * Who you play best with and who gives you the most trouble: a best-partner /
 * toughest-rival pair up top, then the most-played of each, three at a time.
 */
export function PeopleCard({
  partners,
  rivals,
}: {
  readonly partners: readonly PersonRecord[];
  readonly rivals: readonly PersonRecord[];
}): ReactNode {
  const [expanded, setExpanded] = useState(false);
  if (partners.length + rivals.length === 0) {
    return null;
  }
  const best = standout(partners, "best");
  const toughest = standout(rivals, "worst");
  const hidden = Math.max(0, partners.length - COLLAPSED) + Math.max(0, rivals.length - COLLAPSED);
  return (
    <Card borderRadius={20} paddingVertical={15} paddingHorizontal={17} gap={14}>
      <CardHeader title="PARTNERS & RIVALS" />
      {best === undefined && toughest === undefined ? null : (
        <XStack gap={8}>
          {best === undefined ? null : <Highlight label="BEST WITH" record={best} />}
          {toughest === undefined ? null : <Highlight label="TOUGHEST" record={toughest} />}
        </XStack>
      )}
      <PeopleList title="PARTNERS" records={partners} expanded={expanded} testPrefix="partner" />
      <PeopleList title="RIVALS" records={rivals} expanded={expanded} testPrefix="rival" />
      {hidden === 0 ? null : (
        <Pressable
          role="button"
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, alignSelf: "center" })}
          onPress={() => {
            setExpanded((open) => !open);
          }}
        >
          <Body fontSize={11} fontWeight="800" letterSpacing={1.2} color={colors.accentOnCard}>
            {expanded ? "SHOW LESS" : `SHOW ALL · ${String(hidden)} MORE`}
          </Body>
        </Pressable>
      )}
    </Card>
  );
}
