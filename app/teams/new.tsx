import { useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import FormScreen from "../../components/FormScreen";
import PrimaryButton from "../../components/PrimaryButton";
import { toAppError } from "../../lib/errors";
import {
  createTeam,
  slugifyTeamName,
  type TeamMemberType,
  type TeamVisibility,
} from "../../lib/teams";
import { useAppColors } from "../../lib/theme";

const memberTypes: { value: TeamMemberType; label: string }[] = [
  { value: "coach", label: "Coach" },
  { value: "athlete", label: "Athlete" },
  { value: "staff", label: "Staff" },
];

const visibilities: { value: TeamVisibility; label: string; detail: string }[] = [
  { value: "private", label: "Private", detail: "Only members can open the team." },
  { value: "unlisted", label: "Unlisted", detail: "Visible by direct link, not meant for discovery." },
  { value: "public", label: "Public", detail: "Visible to signed-in users." },
];

export default function NewTeamScreen() {
  const c = useAppColors();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [memberType, setMemberType] = useState<TeamMemberType>("coach");
  const [visibility, setVisibility] = useState<TeamVisibility>("private");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalizedSlug = useMemo(() => slugifyTeamName(slug), [slug]);

  function updateName(value: string) {
    setName(value);
    if (!slugTouched) setSlug(slugifyTeamName(value));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const teamId = await createTeam({
        name,
        slug: normalizedSlug,
        memberType,
        description,
        visibility,
      });
      router.replace(`/teams/${teamId}`);
    } catch (error: unknown) {
      setError(
        toAppError(error, {
          fallbackMessage: "Could not create the team. Check the details and try again.",
        }).message
      );
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = {
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.bg,
    color: c.text,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
  } as const;

  return (
    <FormScreen
      contentContainerStyle={{ width: "100%", maxWidth: 760, alignSelf: "center" }}
    >
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 22, fontWeight: "800", color: c.text }}>Create team</Text>
        <Text style={{ color: c.subtext }}>
          Start an independent team. You become its owner and your selected team role becomes active immediately.
        </Text>
      </View>

      {error && <Text style={{ color: "#ef4444", fontWeight: "600" }}>{error}</Text>}

      <View
        style={{
          borderWidth: 1,
          borderColor: c.border,
          backgroundColor: c.card,
          borderRadius: 14,
          padding: 14,
          gap: 10,
        }}
      >
        <Text style={{ color: c.text, fontWeight: "800" }}>Team name</Text>
        <TextInput
          value={name}
          onChangeText={updateName}
          placeholder="Villanova Sprints"
          placeholderTextColor={c.subtext}
          style={inputStyle}
          autoCapitalize="words"
        />

        <Text style={{ color: c.text, fontWeight: "800" }}>Team URL name</Text>
        <TextInput
          value={slug}
          onChangeText={(value) => {
            setSlugTouched(true);
            setSlug(value);
          }}
          onBlur={() => setSlug(normalizedSlug)}
          placeholder="villanova-sprints"
          placeholderTextColor={c.subtext}
          style={inputStyle}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Text style={{ color: c.subtext, fontSize: 12 }}>
          Used as a stable team identifier. You can edit it before creating the team.
        </Text>

        <Text style={{ color: c.text, fontWeight: "800" }}>Description</Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Optional team description"
          placeholderTextColor={c.subtext}
          style={[inputStyle, { minHeight: 86, textAlignVertical: "top" }]}
          multiline
        />
      </View>

      <View
        style={{
          borderWidth: 1,
          borderColor: c.border,
          backgroundColor: c.card,
          borderRadius: 14,
          padding: 14,
          gap: 10,
        }}
      >
        <Text style={{ color: c.text, fontWeight: "800" }}>Your role on this team</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {memberTypes.map((option) => {
            const selected = memberType === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => setMemberType(option.value)}
                style={{
                  borderWidth: 1,
                  borderColor: selected ? c.primary : c.border,
                  backgroundColor: selected ? c.primary : c.bg,
                  borderRadius: 999,
                  paddingHorizontal: 14,
                  paddingVertical: 9,
                }}
              >
                <Text
                  style={{ color: selected ? c.primaryText : c.text, fontWeight: "700" }}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={{ color: c.text, fontWeight: "800", marginTop: 4 }}>Visibility</Text>
        {visibilities.map((option) => {
          const selected = visibility === option.value;
          return (
            <Pressable
              key={option.value}
              onPress={() => setVisibility(option.value)}
              style={{
                borderWidth: 1,
                borderColor: selected ? c.primary : c.border,
                backgroundColor: selected ? c.primary : c.bg,
                borderRadius: 12,
                padding: 11,
                gap: 2,
              }}
            >
              <Text
                style={{ color: selected ? c.primaryText : c.text, fontWeight: "800" }}
              >
                {option.label}
              </Text>
              <Text style={{ color: selected ? c.primaryText : c.subtext, fontSize: 12 }}>
                {option.detail}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <PrimaryButton title={saving ? "Creating…" : "Create team"} onPress={saving ? () => {} : save} />
    </FormScreen>
  );
}
