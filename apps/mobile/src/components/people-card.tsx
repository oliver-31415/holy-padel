import { router } from "expo-router";
import type { ReactNode } from "react";
import { useState } from "react";
import { Pressable } from "react-native";
import { XStack, YStack } from "tamagui";
import { Button } from "@/components/controls.tsx";
import { Icon } from "@/components/icons.tsx";
import { CardHeader } from "@/components/insight-parts.tsx";
import { RecordBar } from "@/components/record-bar.tsx";
import { Avatar, Body, Card, Display, Label } from "@/components/ui.tsx";
import type { PersonRecord } from "@/lib/insights.ts";
import { colors } from "@/theme/colors.ts";

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
        <Avatar letter={record.name.charAt(0)} size={40} />
        <Body flex={1} fontSize={16} textAlign="left" numberOfLines={1}>
          {record.name}
        </Body>
        <RecordBar won={record.won} lost={record.lost} drew={record.drew} />
        <Display fontSize={16} width={40} textAlign="right">
          {`${String(record.won)}–${String(record.lost)}`}
        </Display>
        <Icon name="chevronRight" size={20} color={colors.onSurfaceVariant} />
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
    <YStack flex={1} backgroundColor={colors.cardInset} borderRadius={20} padding={16} gap={2}>
      <Label>{label}</Label>
      <Body fontSize={16} fontWeight="600" numberOfLines={1}>
        {record.name}
      </Body>
      <Label>
        {`${String(Math.round(winShare(record) * 100))}% won · ${String(playedWith(record))} played`}
      </Label>
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
    <YStack gap={12}>
      <Label color={colors.primary} fontWeight="600">
        {title}
      </Label>
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
    <Card padding={20} gap={16}>
      <CardHeader title="Partners & rivals" />
      {best === undefined && toughest === undefined ? null : (
        <XStack gap={8}>
          {best === undefined ? null : <Highlight label="Best with" record={best} />}
          {toughest === undefined ? null : <Highlight label="Toughest" record={toughest} />}
        </XStack>
      )}
      <PeopleList title="Partners" records={partners} expanded={expanded} testPrefix="partner" />
      <PeopleList title="Rivals" records={rivals} expanded={expanded} testPrefix="rival" />
      {hidden === 0 ? null : (
        <Button
          label={expanded ? "Show less" : `Show all · ${String(hidden)} more`}
          variant="text"
          size="sm"
          alignSelf="center"
          onPress={() => {
            setExpanded((open) => !open);
          }}
        />
      )}
    </Card>
  );
}
