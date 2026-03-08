export function formatWorkoutType(type: string | null | undefined) {
    if (!type) return "";
    return type.charAt(0).toUpperCase() + type.slice(1);
  }