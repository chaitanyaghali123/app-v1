import React from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { QueryRecord } from "./queryStorage";

type QueryHistoryProps = {
  subjectName: string;
  subjectIcon: string;
  queries: QueryRecord[];
  onSelectQuery: (record: QueryRecord) => void;
  onNewQuery: () => void;
  onBack: () => void;
  onClearHistory: () => void;
};

function formatDate(ts: number): string {
  const d = new Date(ts);
  const diffMs = Date.now() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMs / 3600000);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function answerPreview(answer: string, maxLen = 120): string {
  const cleaned = answer.replace(/\*\*/g, "").replace(/\n+/g, " ").trim();
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.slice(0, maxLen).replace(/\s+\S*$/, "") + "...";
}

export default function QueryHistory({
  subjectName,
  subjectIcon,
  queries,
  onSelectQuery,
  onNewQuery,
  onBack,
  onClearHistory,
}: QueryHistoryProps) {
  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <View style={styles.container}>
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            onPress={onBack}
            style={({ pressed }) => [
              styles.backBtn,
              pressed && styles.backBtnPressed,
            ]}
          >
            <Text style={styles.backText}>← Q&A</Text>
          </Pressable>
          <View style={styles.subjectTag}>
            <Text style={styles.subjectTagIcon}>{subjectIcon}</Text>
            <Text style={styles.subjectTagName}>{subjectName}</Text>
          </View>
        </View>

        <View style={styles.headerSection}>
          <Text style={styles.headerTitle}>Chat History</Text>
          <Text style={styles.headerSubtitle}>
            {queries.length > 0
              ? `${queries.length} past question${queries.length === 1 ? "" : "s"} — saved for 50 days`
              : "No past queries yet"}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={onNewQuery}
          style={({ pressed }) => [
            styles.newQueryBtn,
            pressed && styles.newQueryBtnPressed,
          ]}
        >
          <Text style={styles.newQueryIcon}>+</Text>
          <Text style={styles.newQueryText}>New Question</Text>
        </Pressable>

        {queries.length > 0 && (
          <View style={styles.listSection}>
            {queries.map((record) => (
              <Pressable
                key={record.id}
                accessibilityRole="button"
                onPress={() => onSelectQuery(record)}
                style={({ pressed }) => [
                  styles.queryCard,
                  pressed && styles.queryCardPressed,
                ]}
              >
                <View style={styles.queryCardTop}>
                  <Text style={styles.queryQuestion} numberOfLines={2}>
                    {record.question}
                  </Text>
                  <Text style={styles.queryDate}>{formatDate(record.timestamp)}</Text>
                </View>
                <Text style={styles.queryPreview} numberOfLines={2}>
                  {answerPreview(record.answer)}
                </Text>
                <View style={styles.queryMeta}>
                  <Text style={styles.queryMetaText}>
                    {record.tokenCount} tokens · {record.chunkCount} chunks
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}

        {queries.length > 0 && (
          <Pressable
            accessibilityRole="button"
            onPress={onClearHistory}
            style={({ pressed }) => [
              styles.clearBtn,
              pressed && styles.clearBtnPressed,
            ]}
          >
            <Text style={styles.clearBtnText}>Clear History</Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1 },
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 20,
    paddingTop: 8,
  },
  backBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  backBtnPressed: { backgroundColor: "#f3f4f6" },
  backText: { color: "#4f46e5", fontSize: 14, fontWeight: "700" },
  subjectTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#eef2ff",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  subjectTagIcon: { fontSize: 16 },
  subjectTagName: { color: "#4338ca", fontSize: 14, fontWeight: "700" },
  headerSection: { marginBottom: 18 },
  headerTitle: { color: "#111827", fontSize: 24, fontWeight: "800", marginBottom: 4 },
  headerSubtitle: { color: "#6b7280", fontSize: 14, lineHeight: 19 },
  newQueryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4f46e5",
    borderRadius: 12,
    minHeight: 50,
    gap: 8,
    marginBottom: 20,
  },
  newQueryBtnPressed: { opacity: 0.85 },
  newQueryIcon: { color: "#ffffff", fontSize: 22, fontWeight: "700", lineHeight: 26 },
  newQueryText: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
  listSection: { gap: 10 },
  queryCard: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#f3f4f6",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  queryCardPressed: {
    backgroundColor: "#f5f3ff",
    borderColor: "#c7d2fe",
  },
  queryCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 6,
  },
  queryQuestion: {
    color: "#111827",
    fontSize: 15,
    fontWeight: "700",
    flex: 1,
    lineHeight: 21,
  },
  queryDate: { color: "#9ca3af", fontSize: 12, fontWeight: "600", marginTop: 2, flexShrink: 0 },
  queryPreview: { color: "#6b7280", fontSize: 13, lineHeight: 18, marginBottom: 8 },
  queryMeta: { flexDirection: "row", alignItems: "center" },
  queryMetaText: { color: "#9ca3af", fontSize: 11, fontWeight: "600" },
  clearBtn: { alignItems: "center", paddingVertical: 14, marginTop: 12 },
  clearBtnPressed: { opacity: 0.7 },
  clearBtnText: { color: "#ef4444", fontSize: 14, fontWeight: "700" },
});
