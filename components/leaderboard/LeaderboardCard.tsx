import { View, Text, ScrollView } from "react-native";
import { useAppColors } from "../../lib/theme";
import { LeaderboardRow } from "./types";

type Props = {
  title: string;
  rows: LeaderboardRow[];
  formatValue: (value: number) => string;
  compact?: boolean;
  maxRows?: number;
  scrollHeight?: number;
};

export default function LeaderboardCard({
  title,
  rows,
  formatValue,
  compact = false,
  maxRows,
  scrollHeight,
}: Props) {
  const c = useAppColors();

  const shownRows = typeof maxRows === "number" ? rows.slice(0, maxRows) : rows;

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: c.border,
        backgroundColor: c.card,
        borderRadius: 16,
        padding: 14,
        gap: 12,
      }}
    >
      <View>
        <Text
          style={{
            color: c.subtext,
            fontSize: 12,
            fontWeight: "700",
            textTransform: "uppercase",
          }}
        >
          Leaderboard
        </Text>
        <Text
          style={{
            color: c.text,
            fontSize: compact ? 18 : 22,
            fontWeight: "900",
            marginTop: 2,
          }}
        >
          {title}
        </Text>
      </View>

      <ScrollView
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
        style={scrollHeight ? { maxHeight: scrollHeight } : undefined}
      >
        <View style={{ gap: 8 }}>
          {shownRows.length > 0 ? (
            shownRows.map((row, index) => (
              <View
                key={`${title}-${row.user_id}`}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  borderWidth: 1,
                  borderColor: c.border,
                  backgroundColor: c.bg,
                  borderRadius: 12,
                  paddingVertical: compact ? 9 : 11,
                  paddingHorizontal: 12,
                  gap: 10,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                    flex: 1,
                  }}
                >
                  <View
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: c.border,
                      backgroundColor: c.card,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text
                      style={{
                        color: c.text,
                        fontWeight: "900",
                        fontSize: 12,
                      }}
                    >
                      {index + 1}
                    </Text>
                  </View>

                  <Text
                    numberOfLines={1}
                    style={{
                      color: c.text,
                      fontWeight: row.display_name === "You" ? "900" : "700",
                      flex: 1,
                    }}
                  >
                    {row.display_name}
                  </Text>
                </View>

                <Text
                  style={{
                    color: c.text,
                    fontWeight: "900",
                    fontSize: compact ? 14 : 15,
                  }}
                >
                  {formatValue(row.value)}
                </Text>
              </View>
            ))
          ) : (
            <View
              style={{
                borderWidth: 1,
                borderColor: c.border,
                backgroundColor: c.bg,
                borderRadius: 12,
                padding: 12,
              }}
            >
              <Text style={{ color: c.text, fontWeight: "800" }}>
                No leaderboard data yet
              </Text>
              <Text style={{ color: c.subtext, marginTop: 6 }}>
                Add friends and log workouts to start comparing stats.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}