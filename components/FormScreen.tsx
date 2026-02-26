import type { ReactNode } from "react";
import type { RefreshControlProps } from "react-native";
import { KeyboardAvoidingView, ScrollView, Platform, RefreshControl } from "react-native";

type Props = {
  children: ReactNode;
  refreshControlProps?: RefreshControlProps; // optional
};

export default function FormScreen({ children, refreshControlProps }: Props) {
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={80}
    >
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 12 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          refreshControlProps ? <RefreshControl {...refreshControlProps} /> : undefined
        }
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}