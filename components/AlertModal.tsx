import { Modal, Pressable, Text, View } from "react-native";
import { useAppColors } from "../lib/theme";

type AlertModalProps = {
  visible: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel?: () => void;
  destructive?: boolean;
  closeOnBackdrop?: boolean;
};

export default function AlertModal({
  visible,
  title,
  message,
  confirmText = "OK",
  cancelText = "Cancel",
  onConfirm,
  onCancel,
  destructive = false,
  closeOnBackdrop = true,
}: AlertModalProps) {
  const c = useAppColors();

  const confirmBg = destructive ? "#DC2626" : c.primary;
  const confirmTextColor = destructive ? "white" : c.primaryText;

  function handleBackdropPress() {
    if (closeOnBackdrop && onCancel) onCancel();
  }

  return (
    <Modal visible={visible} transparent animationType="fade">
      <Pressable
        onPress={handleBackdropPress}
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.35)",
          justifyContent: "center",
          alignItems: "center",
          padding: 20,
        }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            width: "100%",
            maxWidth: 420,
            backgroundColor: c.card,
            borderWidth: 1,
            borderColor: c.border,
            borderRadius: 16,
            padding: 18,
            gap: 14,
          }}
        >
          <Text style={{ fontSize: 18, fontWeight: "800", color: c.text }}>
            {title}
          </Text>

          <Text style={{ color: c.subtext }}>{message}</Text>

          <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 10 }}>
            {!!onCancel && (
              <Pressable
                onPress={onCancel}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: c.border,
                  backgroundColor: c.bg,
                }}
              >
                <Text style={{ color: c.text, fontWeight: "700" }}>{cancelText}</Text>
              </Pressable>
            )}

            <Pressable
              onPress={onConfirm}
              style={{
                paddingVertical: 10,
                paddingHorizontal: 14,
                borderRadius: 10,
                backgroundColor: confirmBg,
              }}
            >
              <Text style={{ color: confirmTextColor, fontWeight: "700" }}>
                {confirmText}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}