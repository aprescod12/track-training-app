import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { router } from "expo-router";
import { supabase } from "../lib/supabase";
import { getSignedInLandingRoute } from "../lib/onboarding";

export default function Index() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      const session = data.session;

      if (!mounted) return;

      if (!session) {
        router.replace("/auth/login");
        setLoading(false);
        return;
      }

      const landingRoute = await getSignedInLandingRoute(session.user.id);
      if (!mounted) return;

      router.replace(landingRoute);
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
