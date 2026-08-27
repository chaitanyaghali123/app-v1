import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

type Subject = {
  id: string;
  name: string;
  icon: string;
  gs_paper?: string;
  gs_paper_name?: string;
};

type GsPaper = {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  subjects: Subject[];
};

type CorpusStats = {
  total_chunks: number;
  total_diagrams: number;
  subjects: Array<{ subject_id: string; chunks: number; files: number }>;
  gs_papers: Array<{ gs_paper: string; chunks: number; files: number; subjects: number }>;
};

type DashboardProps = {
  backendUrl: string;
  onSelectSubject: (subject: Subject) => void;
  apiKey: string;
  hasApiKey: boolean;
  showApiInput: boolean;
  onApiKeyChange: (text: string) => void;
  onSaveApiKey: () => void;
  onToggleApiInput: () => void;
};

const GS_PAPERS = [
  { id: "gs1", name: "GS 1", icon: "🏛️", color: "#f59e0b" },
  { id: "gs2", name: "GS 2", icon: "⚖️", color: "#3b82f6" },
  { id: "gs3", name: "GS 3", icon: "🔬", color: "#10b981" },
  { id: "gs4", name: "GS 4", icon: "⭐", color: "#8b5cf6" },
  { id: "essay", name: "Essay", icon: "📝", color: "#ec4899" },
  { id: "optional", name: "Optional Paper 1", icon: "📖", color: "#6366f1" },
  { id: "optional2", name: "Optional Paper 2", icon: "📖", color: "#6366f1" },
];

export default function Dashboard({
  backendUrl,
  onSelectSubject,
  apiKey,
  hasApiKey,
  showApiInput,
  onApiKeyChange,
  onSaveApiKey,
  onToggleApiInput,
}: DashboardProps) {
  const [stats, setStats] = useState<CorpusStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const cleanUrl = backendUrl.replace(/\/+$/, "");
    fetch(`${cleanUrl}/api/admin/dashboard`)
      .then((r) => r.json())
      .then((data) => {
        setStats(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [backendUrl]);

  const getGsChunks = (gsId: string) =>
    stats?.gs_papers.find((g) => g.gs_paper === gsId)?.chunks ?? 0;

  const getGsFiles = (gsId: string) =>
    stats?.gs_papers.find((g) => g.gs_paper === gsId)?.files ?? 0;

  const handlePressPaper = (paper: typeof GS_PAPERS[0]) => {
    onSelectSubject({
      id: paper.id,
      name: paper.name,
      icon: paper.icon,
    });
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#4f46e5" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Failed to load: {error}</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <View style={styles.container}>
        <View style={styles.headerSection}>
          <Text style={styles.badge}>UPSC MAINS</Text>
          <Text style={styles.title}>RAG Study Assistant</Text>
          <Text style={styles.subtitle}>Choose a paper to start</Text>
        </View>

        {showApiInput ? (
          <View style={styles.apiKeyCard}>
            <Text style={styles.apiKeyLabel}>Gemini API Key (BYOK)</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={onApiKeyChange}
              placeholder="AIza..."
              secureTextEntry
              style={styles.apiKeyInput}
              value={apiKey}
            />
            <Pressable
              accessibilityRole="button"
              disabled={!apiKey.trim()}
              onPress={onSaveApiKey}
              style={({ pressed }) => [
                styles.apiKeySaveBtn,
                !apiKey.trim() && styles.apiKeySaveBtnDisabled,
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text style={styles.apiKeySaveBtnText}>Save Key</Text>
            </Pressable>
          </View>
        ) : hasApiKey ? (
          <View style={styles.apiKeySavedBar}>
            <Text style={styles.apiKeyDot}>●</Text>
            <Text style={styles.apiKeySavedText}>Key stored</Text>
            <Pressable
              accessibilityRole="button"
              onPress={onToggleApiInput}
            >
              <Text style={styles.apiKeyChangeLink}>Change</Text>
            </Pressable>
          </View>
        ) : null}

        <Text style={styles.sectionLabel}>Select Paper</Text>

        <View style={styles.gsRow}>
          {GS_PAPERS.map((paper) => {
            const chunks = getGsChunks(paper.id);
            return (
              <Pressable
                key={paper.id}
                accessibilityRole="button"
                onPress={() => handlePressPaper(paper)}
                style={({ pressed }) => [
                  styles.gsCard,
                  { borderColor: paper.color + "30" },
                  pressed && { borderColor: paper.color, backgroundColor: paper.color + "08" },
                ]}
              >
                <View style={[styles.gsIconWrap, { backgroundColor: paper.color + "15" }]}>
                  <Text style={styles.gsIcon}>{paper.icon}</Text>
                </View>
                <Text style={[styles.gsName, { color: paper.color }]}>{paper.name}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
  },
  center: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  loadingText: {
    color: "#6b7280",
    fontSize: 14,
    marginTop: 12,
  },
  errorText: {
    color: "#ef4444",
    fontSize: 14,
    textAlign: "center",
  },
  headerSection: {
    marginBottom: 18,
  },
  badge: {
    color: "#4f46e5",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 2,
    marginBottom: 8,
  },
  title: {
    color: "#111827",
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  subtitle: {
    color: "#6b7280",
    fontSize: 15,
    lineHeight: 20,
  },
  apiKeyCard: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "#f3f4f6",
    gap: 10,
  },
  apiKeyLabel: {
    color: "#374151",
    fontSize: 13,
    fontWeight: "700",
  },
  apiKeyInput: {
    backgroundColor: "#f9fafb",
    borderColor: "#e5e7eb",
    borderRadius: 10,
    borderWidth: 1,
    color: "#111827",
    fontSize: 15,
    minHeight: 46,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  apiKeySaveBtn: {
    backgroundColor: "#4f46e5",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 46,
  },
  apiKeySaveBtnDisabled: {
    opacity: 0.5,
  },
  apiKeySaveBtnText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },
  apiKeySavedBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f0fdf4",
    borderColor: "#bbf7d0",
    borderRadius: 10,
    borderWidth: 1,
    minHeight: 46,
    paddingHorizontal: 14,
    marginBottom: 18,
    gap: 8,
  },
  apiKeyDot: {
    color: "#22c55e",
    fontSize: 10,
  },
  apiKeySavedText: {
    color: "#166534",
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },
  apiKeyChangeLink: {
    color: "#4f46e5",
    fontSize: 13,
    fontWeight: "600",
  },
  statsBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f9fafb",
    borderRadius: 14,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#f3f4f6",
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    color: "#111827",
    fontSize: 20,
    fontWeight: "800",
  },
  statLabel: {
    color: "#6b7280",
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: "#e5e7eb",
  },
  sectionLabel: {
    color: "#9ca3af",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 12,
  },
  gsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 28,
  },
  gsCard: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 6,
    gap: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  gsIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  gsIcon: {
    fontSize: 22,
  },
  gsName: {
    fontSize: 13,
    fontWeight: "800",
    textAlign: "center",
  },
  gsChunkCount: {
    color: "#6b7280",
    fontSize: 14,
    fontWeight: "700",
  },
});
