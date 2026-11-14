import type { ReactNode } from "react";
import { Pressable } from "react-native";
import { View, XStack, YStack } from "tamagui";
import { Body, Label } from "@/components/ui.tsx";
import { colors } from "@/theme/colors.ts";

export interface Segment<T extends string | number> {
  readonly value: T;
  readonly label: string;
}

/**
 * Material 3 Expressive's connected button group: segments share one row with
 * tight inner corners, and the selected segment turns fully round and filled.
 * Segments share the row's width equally.
 */
export function SegmentedGroup<T extends string | number>({
  options,
  value,
  onChange,
}: {
  readonly options: readonly Segment<T>[];
  readonly value: T;
  readonly onChange: (next: T) => void;
}): ReactNode {
  const last = options.length - 1;
  return (
    <XStack gap={2} alignSelf="stretch">
      {options.map((option, index) => {
        const active = option.value === value;
        const inner = active ? 20 : 8;
        return (
          <Pressable
            key={String(option.value)}
            role="button"
            aria-pressed={active}
            style={{ flex: 1 }}
            onPress={() => {
              onChange(option.value);
            }}
          >
            <View
              height={40}
              paddingHorizontal={8}
              alignItems="center"
              justifyContent="center"
              borderTopLeftRadius={index === 0 ? 20 : inner}
              borderBottomLeftRadius={index === 0 ? 20 : inner}
              borderTopRightRadius={index === last ? 20 : inner}
              borderBottomRightRadius={index === last ? 20 : inner}
              backgroundColor={active ? colors.primary : colors.cardInset}
            >
              <Body
                fontSize={14}
                fontWeight={active ? "600" : "500"}
                color={active ? colors.onPrimary : colors.onSurfaceVariant}
                numberOfLines={1}
              >
                {option.label}
              </Body>
            </View>
          </Pressable>
        );
      })}
    </XStack>
  );
}

/** A settings row: a label over a full-width connected button group. */
export function SegmentedRow<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  readonly label: string;
  readonly options: readonly Segment<T>[];
  readonly value: T;
  readonly onChange: (next: T) => void;
}): ReactNode {
  return (
    <YStack gap={8}>
      <Label>{label}</Label>
      <SegmentedGroup options={options} value={value} onChange={onChange} />
    </YStack>
  );
}
