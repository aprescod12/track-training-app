import { useEffect } from "react";
import { Stack, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";
import "react-native-reanimated";
import { Platform, Pressable, Text, View } from "react-native";
import { useAppColors } from "../lib/theme";
import { initNotificationHandler } from "../lib/notifications";
import * as Sentry from '@sentry/react-native';

initNotificationHandler();

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

function useNotificationObserver() {
  useEffect(() => {
    if (Platform.OS === "web") return;

    function redirect(notification: Notifications.Notification) {
      const url = notification.request.content.data?.url;
      if (typeof url === "string" && url.startsWith("/")) {
        router.push(url as any);
      }
    }

    const lastResponse = Notifications.getLastNotificationResponse();
    if (lastResponse?.notification) {
      redirect(lastResponse.notification);
    }

    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => redirect(response.notification)
    );

    return () => subscription.remove();
  }, []);
}

export default Sentry.wrap(function RootLayout() {
  const c = useAppColors();
  useNotificationObserver();

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
          name="team-training/index"
          options={{
            presentation: "modal",
            title: "Team Training",
            headerShown: true,
            headerBackVisible: false,
            headerRight: () => (
              <Pressable onPress={() => router.back()} hitSlop={8}>
                <Text style={{ color: c.text, fontWeight: "700" }}>Done</Text>
              </Pressable>
            ),
            headerStyle: { backgroundColor: c.bg },
            headerTintColor: c.text,
            contentStyle: { backgroundColor: c.bg },
          }}
        />

        <Stack.Screen
          name="team-training/template-new"
          options={{
            presentation: "modal",
            title: "Workout Template",
            headerShown: true,
            headerStyle: { backgroundColor: c.bg },
            headerTintColor: c.text,
            contentStyle: { backgroundColor: c.bg },
          }}
        />

        <Stack.Screen
          name="team-training/assign"
          options={{
            presentation: "modal",
            title: "Assign Workout",
            headerShown: true,
            headerStyle: { backgroundColor: c.bg },
            headerTintColor: c.text,
            contentStyle: { backgroundColor: c.bg },
          }}
        />

        <Stack.Screen
          name="team-training/assignment/[recipientId]"
          options={{
            title: "Team Assignment",
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
