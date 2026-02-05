import { View, Text } from "react-native";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function ProfileScreen() {
  const [status, setStatus] = useState("Loading...");

  useEffect(() => {
    (async () => {
      const urlOk = !!process.env.EXPO_PUBLIC_SUPABASE_URL;
      const keyOk = !!process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

      setStatus(`Profile loaded ✅\nENV URL: ${urlOk ? "OK" : "MISSING"}\nENV KEY: ${keyOk ? "OK" : "MISSING"}\nChecking session...`);

      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          setStatus(`Profile loaded ✅\nSupabase error:\n${error.message}`);
          return;
        }
        setStatus(`Profile loaded ✅\nSupabase OK ✅\nSession: ${data.session ? "YES" : "NO"}`);
      } catch (e: any) {
        setStatus(`Profile loaded ✅\nCrash:\n${e?.message ?? String(e)}`);
      }
    })();
  }, []);

  return (
    <View style={{ flex: 1, padding: 20, justifyContent: "center" }}>
      <Text style={{ fontSize: 16, fontWeight: "600" }}>{status}</Text>
    </View>
  );
}
