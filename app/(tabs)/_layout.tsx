import { Tabs } from "expo-router";
import { useAppColors } from "../../lib/theme";

export default function TabLayout() {
  const c = useAppColors();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: c.card,
          borderTopColor: c.border,
        },
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.subtext,
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="calendar" options={{ title: "Calendar" }} />
      <Tabs.Screen name="log" options={{ title: "Workouts" }} />
      <Tabs.Screen name="history" options={{ title: "History" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
      <Tabs.Screen
        name="profile-edit"
        options={{ href: null }}
      />
    </Tabs>
  );
}