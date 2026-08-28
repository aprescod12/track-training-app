export type TrainingDomain = "running" | "jumps" | "throws" | "lift";
export type FieldTrainingDomain = "jumps" | "throws";

export type JumpEventCode = "long_jump" | "triple_jump" | "high_jump" | "pole_vault";
export type ThrowEventCode = "shot_put" | "discus" | "hammer" | "javelin";
export type FieldEventCode = JumpEventCode | ThrowEventCode;

export type FieldAttemptOutcome =
  | "valid"
  | "foul"
  | "unmeasured"
  | "clear"
  | "miss"
  | "pass";

export const TRAINING_DOMAINS: { value: TrainingDomain; label: string }[] = [
  { value: "running", label: "Running" },
  { value: "jumps", label: "Jumps" },
  { value: "throws", label: "Throws" },
  { value: "lift", label: "Lift" },
];

export const JUMP_EVENTS: { value: JumpEventCode; label: string; vertical: boolean }[] = [
  { value: "long_jump", label: "Long Jump", vertical: false },
  { value: "triple_jump", label: "Triple Jump", vertical: false },
  { value: "high_jump", label: "High Jump", vertical: true },
  { value: "pole_vault", label: "Pole Vault", vertical: true },
];

export const THROW_EVENTS: { value: ThrowEventCode; label: string }[] = [
  { value: "shot_put", label: "Shot Put" },
  { value: "discus", label: "Discus" },
  { value: "hammer", label: "Hammer" },
  { value: "javelin", label: "Javelin" },
];

export function trainingDomainLabel(domain: string | null | undefined) {
  if (domain === "track") return "Running";
  return TRAINING_DOMAINS.find((item) => item.value === domain)?.label ?? "Training";
}

export function normalizeTrainingDomain(domain: string | null | undefined): TrainingDomain {
  if (domain === "lift") return "lift";
  if (domain === "jumps") return "jumps";
  if (domain === "throws") return "throws";
  return "running";
}

export function fieldEventLabel(eventCode: string | null | undefined) {
  return (
    JUMP_EVENTS.find((item) => item.value === eventCode)?.label ??
    THROW_EVENTS.find((item) => item.value === eventCode)?.label ??
    "Field Event"
  );
}

export function isVerticalJump(eventCode: string | null | undefined) {
  return JUMP_EVENTS.some((item) => item.value === eventCode && item.vertical);
}

export function fieldAttemptOutcomes(eventCode: FieldEventCode): {
  value: FieldAttemptOutcome;
  label: string;
}[] {
  if (isVerticalJump(eventCode)) {
    return [
      { value: "clear", label: "Clear" },
      { value: "miss", label: "Miss" },
      { value: "pass", label: "Pass" },
    ];
  }

  return [
    { value: "valid", label: "Valid" },
    { value: "foul", label: "Foul" },
    { value: "unmeasured", label: "Unmeasured" },
  ];
}
