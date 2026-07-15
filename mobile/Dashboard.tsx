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
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const cleanUrl = backendUrl.replace(/\/+$/, "");
    fetch(`${cleanUrl}/api/subjects`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setSubjects(data.subjects || []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [backendUrl]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#4f46e5" />
        <Text style={styles.loadingText}>Loading subjects...</Text>
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
          <Text style={styles.title}>Practice by Subject</Text>
          <Text style={styles.subtitle}>
            Choose a subject to start answer writing
          </Text>
        </View>

        {showApiInput ? (
          <View style={styles.apiKeyCard}>
            <Text style={styles.apiKeyLabel}>Gemini API Key</Text>
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
            <Text style={styles.apiKeySavedText}>Key stored securely</Text>
            <Pressable
              accessibilityRole="button"
              onPress={onToggleApiInput}
            >
              <Text style={styles.apiKeyChangeLink}>Change</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.grid}>
          {subjects.map((subject) => (
            <Pressable
              key={subject.id}
              accessibilityRole="button"
              onPress={() => onSelectSubject(subject)}
              style={({ pressed }) => [
                styles.card,
                pressed && styles.cardPressed,
              ]}
            >
              <View style={styles.cardIconWrap}>
                <Text style={styles.cardIcon}>{subject.icon}</Text>
              </View>
              <Text style={styles.cardName}>{subject.name}</Text>
              <View style={styles.cardArrow}>
                <Text style={styles.cardArrowText}>→</Text>
              </View>
            </Pressable>
          ))}
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
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    flexBasis: "47%",
    flexGrow: 1,
    minHeight: 120,
    paddingHorizontal: 16,
    paddingVertical: 18,
    justifyContent: "center",
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: "#f3f4f6",
  },
  cardPressed: {
    backgroundColor: "#f5f3ff",
    borderColor: "#c7d2fe",
    shadowOpacity: 0.1,
    shadowRadius: 12,
  },
  cardIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#f5f3ff",
    alignItems: "center",
    justifyContent: "center",
  },
  cardIcon: {
    fontSize: 20,
  },
  cardName: {
    color: "#1f2937",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
  },
  cardArrow: {
    position: "absolute",
    right: 12,
    top: 12,
  },
  cardArrowText: {
    color: "#c7d2fe",
    fontSize: 16,
    fontWeight: "600",
  },
});
