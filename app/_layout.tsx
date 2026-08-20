import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";
import { View } from "react-native";
import { useAppColors } from "../lib/theme";
import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: 'https://5ec0d339a9abe5154477af55b2e502b5@o4511943336329216.ingest.us.sentry.io/4511943336591360',

  // Adds more context data to events (IP address, cookies, user, etc.)
  // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: false,

  environment: process.env.EXPO_PUBLIC_APP_ENV ?? "local",

  // Enable Logs
  enableLogs: false,

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});

export default Sentry.wrap(function RootLayout() {
  const c = useAppColors();

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: c.bg }, // ✅ important for dark mode behind screens
        }}
      >
        <Stack.Screen name="back" />

        <Stack.Screen
          name="modal"
          options={{
            presentation: "modal",
            title: "Log Workout",
            headerShown: true,
            headerStyle: { backgroundColor: c.bg },
            headerTintColor: c.text,
            contentStyle: { backgroundColor: c.bg },
          }}
        />

        <Stack.Screen
          name="auth/login"
          options={{
            headerShown: true,
            title: "Login",
            headerStyle: { backgroundColor: c.bg },
            headerTintColor: c.text,
            headerShadowVisible: false,
            contentStyle: { backgroundColor: c.bg },
          }}
        />

        <Stack.Screen
          name="auth/signup"
          options={{
            headerShown: true,
            title: "Sign Up",
            headerStyle: { backgroundColor: c.bg },
            headerTintColor: c.text,
            headerShadowVisible: false,
            contentStyle: { backgroundColor: c.bg },
          }}
        />

        {/* ✅ Non-tab History screen */}
        <Stack.Screen
          name="history/[exerciseId]"
          options={{
            presentation: "modal",
            title: "History",
            headerShown: true,
            headerStyle: { backgroundColor: c.bg },
            headerTintColor: c.text,
            contentStyle: { backgroundColor: c.bg },
          }}
        />

        <Stack.Screen
          name="calendar/add-event"
          options={{
            presentation: "modal",
            title: "Add Event",
            headerShown: true,
            headerStyle: { backgroundColor: c.bg },
            headerTintColor: c.text,
            contentStyle: { backgroundColor: c.bg },
          }}
        />

        <Stack.Screen
          name="profile/lift-stats"
          options={{
            presentation: "modal",
            title: "Lift Stats",
            headerShown: true,
            headerStyle: { backgroundColor: c.bg },
            headerTintColor: c.text,
            contentStyle: { backgroundColor: c.bg },
          }}
        />

        <Stack.Screen
          name="profile/track-stats"
          options={{
            presentation: "modal",
            title: "Track Stats",
            headerShown: true,
            headerStyle: { backgroundColor: c.bg },
            headerTintColor: c.text,
            contentStyle: { backgroundColor: c.bg },
          }}
        />

        <Stack.Screen
          name="profile/overview"
          options={{
            presentation: "modal",
            title: "Overview",
            headerShown: true,
            headerStyle: { backgroundColor: c.bg },
            headerTintColor: c.text,
            contentStyle: { backgroundColor: c.bg },
          }}
        />

        <Stack.Screen
          name="profile/training-hub"
          options={{
            presentation: "modal",
            title: "Training Hub",
            headerShown: true,
            headerStyle: { backgroundColor: c.bg },
            headerTintColor: c.text,
            contentStyle: { backgroundColor: c.bg },
          }}
        />

        <Stack.Screen
          name="profile-edit"
          options={{
            presentation: "modal",
            title: "Edit Profile",
            headerShown: true,
            headerStyle: { backgroundColor: c.bg },
            headerTintColor: c.text,
            contentStyle: { backgroundColor: c.bg },
          }}
        />
      </Stack>

      <StatusBar style={c.dark ? "light" : "dark"} />
    </View>
  );
});