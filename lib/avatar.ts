import * as ImagePicker from "expo-image-picker";
import { decode } from "base64-arraybuffer";
import { AppError, toAppError } from "./errors";
import { supabase } from "./supabase";

export async function pickAndUploadAvatar(userId: string) {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (!permission.granted) {
    throw new AppError({
      kind: "permission",
      code: "media_library_permission_denied",
      message: "Allow photo library access to choose an avatar.",
    });
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
    throw new AppError({
      kind: "unexpected",
      code: "avatar_image_unreadable",
      message: "Could not read the selected image. Please try another image.",
    });
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
    throw toAppError(uploadErr, {
      fallbackMessage: "Could not upload your avatar. Please try again.",
    });
  }

  const { data } = supabase.storage.from("avatars").getPublicUrl(path);

  return data.publicUrl;
}
