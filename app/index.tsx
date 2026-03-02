import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { router } from "expo-router";
import { supabase } from "../lib/supabase";

export default function Index() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      const hasSession = !!data.session;

      if (!mounted) return;

      router.replace(hasSession ? "/(tabs)" : "/auth/login");
      setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      <ActivityIndicator />
    </View>
  );
}