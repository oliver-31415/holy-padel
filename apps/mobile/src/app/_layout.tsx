import {
  GoogleSansFlex_400Regular,
  GoogleSansFlex_500Medium,
  GoogleSansFlex_600SemiBold,
  GoogleSansFlex_700Bold,
  GoogleSansFlex_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/google-sans-flex";
import { Stack } from "expo-router";
import { hideAsync, preventAutoHideAsync } from "expo-splash-screen";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { Text, View } from "react-native";
import { TamaguiProvider } from "tamagui";
import { DbProvider } from "@/db/provider.tsx";
import { LiveNotificationSync } from "@/live/use-live-notification.ts";
import { tamaguiConfig } from "@/tamagui.config.ts";
import { colors } from "@/theme/colors.ts";
import { ThemeController, useThemeMode } from "@/theme/theme.tsx";
import { WatchSync } from "@/watch/use-watch-sync.ts";

void preventAutoHideAsync();

/** Deep links land with the tab navigator beneath them, so back/dismiss always work. */
// biome-ignore lint/style/useNamingConvention: expo-router requires this exact export name
export const unstable_settings = {
  initialRouteName: "(tabs)",
};

export default function RootLayout(): ReactNode {
  // Re-renders on theme flips so the navigator background follows the palette
  // (the ThemeController below the provider applies the palette itself).
  useThemeMode();

  // biome-ignore-start lint/style/useNamingConvention: Google Fonts registry names
  const [fontsLoaded, fontError] = useFonts({
    GoogleSansFlex_400Regular,
    GoogleSansFlex_500Medium,
    GoogleSansFlex_600SemiBold,
    GoogleSansFlex_700Bold,
    GoogleSansFlex_800ExtraBold,
  });
  // biome-ignore-end lint/style/useNamingConvention: Google Fonts registry names

  useEffect(() => {
    if (fontsLoaded || fontError) {
      void hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!(fontsLoaded || fontError)) {
    return null;
  }

  if (fontError) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.inverseSurface,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Text style={{ color: colors.inverseOnSurface }}>Font Error: {fontError.message}</Text>
      </View>
    );
  }

  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme="light">
      <DbProvider>
        <ThemeController />
        <WatchSync />
        <LiveNotificationSync />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="new-match" options={{ presentation: "modal" }} />
          <Stack.Screen name="edit-profile" options={{ presentation: "modal" }} />
          <Stack.Screen name="edit-player/[id]" options={{ presentation: "modal" }} />
          <Stack.Screen name="edit-defaults" options={{ presentation: "modal" }} />
          <Stack.Screen name="player/[id]" />
          <Stack.Screen name="data" options={{ presentation: "modal" }} />
          <Stack.Screen name="live/[id]" options={{ gestureEnabled: false }} />
          <Stack.Screen name="match/[id]" />
          <Stack.Screen name="edit-match/[id]" options={{ presentation: "modal" }} />
        </Stack>
      </DbProvider>
    </TamaguiProvider>
  );
}
