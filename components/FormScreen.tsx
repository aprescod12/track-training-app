import type { ReactNode } from "react";
import type { RefreshControlProps, StyleProp, ViewStyle } from "react-native";
import { KeyboardAvoidingView, ScrollView, Platform, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppColors } from "../lib/theme";

type Props = {
  children: ReactNode;
  refreshControlProps?: RefreshControlProps;
  contentContainerStyle?: StyleProp<ViewStyle>;
  edges?: ("top" | "bottom" | "left" | "right")[]; // optional per-screen override
};

export default function FormScreen({
  children,
  refreshControlProps,
  contentContainerStyle,
  edges = ["top", "left", "right"], // default: don't pad bottom (tab bar handles it)
}: Props) {
  const c = useAppColors();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={edges}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={80}
      >
        <ScrollView
          contentContainerStyle={[{ padding: 16, gap: 12, paddingBottom: 28 }, contentContainerStyle]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControlProps ? <RefreshControl {...refreshControlProps} /> : undefined}
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false}
        >
          {children}
        </ScrollView>
        
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}