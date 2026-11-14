import type { TabTriggerSlotProps } from "expo-router/ui";
import { TabList, TabSlot, Tabs, TabTrigger } from "expo-router/ui";
import type { ReactNode } from "react";
import { Pressable, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { View } from "tamagui";
import { Icon, type IconName } from "@/components/icons.tsx";
import { Body } from "@/components/ui.tsx";
import { colors } from "@/theme/colors.ts";

function TabButton({
  label,
  icon,
  activeIcon,
  isFocused = false,
  ref: _ref,
  ...props
}: TabTriggerSlotProps & {
  readonly label: string;
  readonly icon: IconName;
  readonly activeIcon: IconName;
}): ReactNode {
  return (
    // testID keeps the tab tap unambiguous — "Home" as text collides with the
    // Android system navigation bar's Home button.
    <Pressable
      {...props}
      testID={`tab-${label.toLowerCase()}`}
      aria-label={label}
      style={styles.tab}
      unstable_pressDelay={0}
    >
      <View
        width={64}
        height={32}
        borderRadius={16}
        alignItems="center"
        justifyContent="center"
        backgroundColor={isFocused ? colors.secondaryContainer : "transparent"}
      >
        <Icon
          name={isFocused ? activeIcon : icon}
          color={isFocused ? colors.onSecondaryContainer : colors.onSurfaceVariant}
        />
      </View>
      <Body
        fontSize={12}
        fontWeight={isFocused ? "700" : "500"}
        letterSpacing={0.2}
        color={isFocused ? colors.onSurface : colors.onSurfaceVariant}
      >
        {label}
      </Body>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // The pressable stretches to the full height of the bar so the whole
  // quarter of it is tappable, not just the indicator.
  tab: {
    flex: 1,
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
});

/** The bar's height above the safe area; tab screens pad their scroll content past it. */
const NAV_BAR_HEIGHT = 80;

/** Material's navigation bar: four destinations, a tonal pill behind the active icon. */
export default function TabsLayout(): ReactNode {
  const insets = useSafeAreaInsets();
  return (
    <Tabs style={{ flex: 1, backgroundColor: colors.background }}>
      <TabSlot />
      <TabList asChild={true}>
        <View
          position="absolute"
          left={0}
          right={0}
          bottom={0}
          height={NAV_BAR_HEIGHT + insets.bottom}
          paddingBottom={insets.bottom}
          backgroundColor={colors.surfaceContainerHigh}
          flexDirection="row"
          alignItems="center"
        >
          <TabTrigger name="index" href="/" asChild={true}>
            <TabButton label="Home" icon="home" activeIcon="homeFilled" />
          </TabTrigger>
          <TabTrigger name="matches" href="/matches" asChild={true}>
            <TabButton label="Matches" icon="matches" activeIcon="matchesFilled" />
          </TabTrigger>
          <TabTrigger name="stats" href="/stats" asChild={true}>
            <TabButton label="Stats" icon="stats" activeIcon="statsFilled" />
          </TabTrigger>
          <TabTrigger name="profile" href="/profile" asChild={true}>
            <TabButton label="Profile" icon="person" activeIcon="personFilled" />
          </TabTrigger>
        </View>
      </TabList>
    </Tabs>
  );
}
