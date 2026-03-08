import * as ImagePicker from "expo-image-picker";
import { decode } from "base64-arraybuffer";
import { supabase } from "./supabase";

export async function pickAndUploadAvatar(userId: string) {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (!permission.granted) {
    throw new Error("Media library permission is required.");
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.8,
    base64: true,
  });

  if (result.canceled || !result.assets?.length) {
    return null;
  }

  const asset = result.assets[0];

  if (!asset.base64) {
    throw new Error("Could not read image data.");
  }

  const ext = asset.mimeType?.includes("png") ? "png" : "jpg";
  const path = `${userId}/avatar-${Date.now()}.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from("avatars")
    .upload(path, decode(asset.base64), {
      contentType: asset.mimeType ?? `image/${ext}`,
      upsert: false,
    });

  if (uploadErr) {
    throw uploadErr;
  }

  const { data } = supabase.storage.from("avatars").getPublicUrl(path);

  return data.publicUrl;
}