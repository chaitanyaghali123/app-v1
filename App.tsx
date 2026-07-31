import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as SecureStore from "expo-secure-store";

const isWeb = Platform.OS === "web";

function setStoredKeyMarker(): Promise<void> {
  if (isWeb) {
    localStorage.setItem(SECURE_STORE_KEY, STORED_KEY_MARKER);
    return Promise.resolve();
  }
  return SecureStore.setItemAsync(SECURE_STORE_KEY, STORED_KEY_MARKER);
}

async function hasStoredKeyMarker(): Promise<boolean> {
  let value: string | null = null;
  if (isWeb) {
    value = localStorage.getItem(SECURE_STORE_KEY);
  } else {
    value = await SecureStore.getItemAsync(SECURE_STORE_KEY);
  }

  if (!value) {
    return false;
  }
  if (value !== STORED_KEY_MARKER) {
    await setStoredKeyMarker();
  }
  return true;
}

import { answerUpscQuestionFromChunks } from "./mobile/upscRagAnswer";
import { storeApiKeyOnBackend } from "./mobile/gemini";
import Dashboard from "./mobile/Dashboard";
import MarkdownAnswer from "./mobile/MarkdownAnswer";
import QueryHistory from "./mobile/QueryHistory";
import { saveQuery, getQueries, clearQueries } from "./mobile/queryStorage";
import type { QueryRecord } from "./mobile/queryStorage";

const DEFAULT_BACKEND_URL = Platform.OS === "web" ? window.location.origin : "http://192.168.29.61:3000";
const SECURE_STORE_KEY = "upsc_gemini_api_key";
const STORED_KEY_MARKER = "stored";

type ChunkPreview = {
  text?: string;
  content?: string;
  score?: number;
  vector_score?: number;
  rerank_score?: number;
  relevanceScore?: number;
  metadata?: Record<string, unknown>;
};

type Subject = {
  id: string;
  name: string;
  icon: string;
};

function ActionButton({
  label,
  onPress,
  disabled = false,
  variant = "primary",
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "ghost";
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        variant === "primary" && styles.btnPrimary,
        variant === "secondary" && styles.btnSecondary,
        variant === "ghost" && styles.btnGhost,
        disabled && styles.btnDisabled,
        pressed && !disabled && styles.btnPressed,
      ]}
    >
      <Text
        style={[
          styles.btnText,
          variant === "primary" && styles.btnTextPrimary,
          variant === "secondary" && styles.btnTextSecondary,
          variant === "ghost" && styles.btnTextGhost,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const MOJIBAKE_REPLACEMENTS: Array<[string, string]> = [
  ["â€”", "—"],
  ["â€“", "–"],
  ["â€˜", "‘"],
  ["â€™", "’"],
  ["â€œ", "“"],
  ["â€", "”"],
  ["â€¦", "…"],
  ["â†", "←"],
  ["â–¼", "▼"],
  ["â–¶", "▶"],
  ["â–ˆ", "█"],
  ["â–‘", "░"],
  ["â‚¹", "₹"],
  ["ðŸ“œ", "📜"],
  ["ðŸŒ", "🌍"],
];

function repairMojibake(text: string): string {
  let repaired = String(text || "");
  for (const [broken, fixed] of MOJIBAKE_REPLACEMENTS) {
    repaired = repaired.split(broken).join(fixed);
  }
  return repaired;
}

function formatAnswer(text: string): string {
  return repairMojibake(text)
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatChunkText(text: string): string {
  return repairMojibake(text)
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function numericValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeUiScore(value: unknown): number | null {
  const score = numericValue(value);
  if (score === null || score < 0) return null;
  if (score <= 1) return score;
  if (score <= 100) return score / 100;
  return null;
}

function resolveChunkScore(chunk: ChunkPreview, explicitScore: unknown): number | null {
  const candidates = [
    explicitScore,
    chunk.score,
    chunk.relevanceScore,
    chunk.vector_score,
    chunk.rerank_score,
    chunk.metadata?.relevance_score,
    chunk.metadata?.score,
    chunk.metadata?.vector_score,
    chunk.metadata?.search_score,
    chunk.metadata?.similarity,
  ];
  const scores: number[] = [];

  for (const candidate of candidates) {
    const score = normalizeUiScore(candidate);
    if (score !== null) scores.push(Math.max(0, Math.min(1, score)));
  }

  return scores.find((score) => score > 0) ?? null;
}

export default function App() {
  const [route, setRoute] = useState<"dashboard" | "qa" | "history">("dashboard");
  const [backendUrl, setBackendUrl] = useState(DEFAULT_BACKEND_URL);
  const [apiKey, setApiKey] = useState("");
  const [hasSavedApiKey, setHasSavedApiKey] = useState(false);
  const [activeSubject, setActiveSubject] = useState<Subject | null>(null);
  const [queries, setQueries] = useState<QueryRecord[]>([]);
  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState("");
  const [answer, setAnswer] = useState("");
  const [chunks, setChunks] = useState<ChunkPreview[]>([]);
  const [chunkScores, setChunkScores] = useState<number[]>([]);
  const [chunkCount, setChunkCount] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState<number | null>(null);
  const [tokenCount, setTokenCount] = useState(0);
  const [showChunks, setShowChunks] = useState(false);
  const [showApiInput, setShowApiInput] = useState(false);
  const [debugMode, setDebugMode] = useState(() => {
    if (isWeb) return localStorage.getItem("upsc_debug") === "true";
    return false;
  });
  const [hasAsked, setHasAsked] = useState(false);

  const toggleDebug = useCallback(() => {
    setDebugMode((prev) => {
      const next = !prev;
      if (isWeb) localStorage.setItem("upsc_debug", String(next));
      return next;
    });
  }, []);

  const cleanBackendUrl = backendUrl.trim().replace(/\/+$/, "");

  useEffect(() => {
    hasStoredKeyMarker().then((stored) => {
      setHasSavedApiKey(stored);
      setShowApiInput(!stored);
      setApiKey("");
    });
  }, []);

  const canAsk = useMemo(
    () =>
      question.trim().length > 0 &&
      backendUrl.trim().length > 0 &&
      hasSavedApiKey &&
      !generating,
    [backendUrl, generating, hasSavedApiKey, question]
  );

  const handleApiKeyChange = useCallback((text: string) => {
    setApiKey(text);
  }, []);

  const handleSaveApiKey = useCallback(async () => {
    if (!apiKey.trim()) return;
    try {
      setStatus("Storing API key on backend...");
      await storeApiKeyOnBackend(cleanBackendUrl, apiKey.trim());
      await setStoredKeyMarker();
      setApiKey("");
      setHasSavedApiKey(true);
      setShowApiInput(false);
      setStatus("API key saved securely.");
    } catch (err) {
      setHasSavedApiKey(false);
      setStatus(err instanceof Error ? err.message : "Failed to store API key.");
    }
  }, [apiKey, cleanBackendUrl]);

  const handleSelectSubject = useCallback((subject: Subject) => {
    setActiveSubject(subject);
    setQuestion("");
    setAnswer("");
    setChunks([]);
    setChunkScores([]);
    setHasAsked(false);
    setRoute("qa");
  }, []);

  const handleBackToDashboard = useCallback(() => {
    setRoute("dashboard");
    setActiveSubject(null);
    setHasAsked(false);
    setAnswer("");
    setChunks([]);
    setChunkScores([]);
  }, []);

  const handleHistoryPress = useCallback(() => {
    if (!activeSubject) return;
    setQueries(getQueries(activeSubject.id));
    setRoute("history");
  }, [activeSubject]);

  const handleSelectQuery = useCallback((record: QueryRecord) => {
    setQuestion(record.question);
    setAnswer(formatAnswer(record.answer));
    setChunks([]);
    setChunkScores([]);
    setTokenCount(record.tokenCount);
    setChunkCount(record.chunkCount);
    setHasAsked(true);
    setRoute("qa");
  }, []);

  const handleBackFromHistory = useCallback(() => {
    setRoute("qa");
  }, []);

  const handleNewQueryFromHistory = useCallback(() => {
    setQuestion("");
    setAnswer("");
    setChunks([]);
    setChunkScores([]);
    setTokenCount(0);
    setChunkCount(0);
    setHasAsked(false);
    setRoute("qa");
  }, []);

  const handleClearHistory = useCallback(() => {
    if (activeSubject) {
      clearQueries(activeSubject.id);
      setQueries([]);
    }
  }, [activeSubject]);

  const askQuestion = useCallback(async () => {
    if (!canAsk || !activeSubject) return;

    const cleanQuestion = question.trim();
    const startedAt = Date.now();

    setAnswer("");
    setChunks([]);
    setChunkScores([]);
    setChunkCount(0);
    setElapsedSeconds(null);
    setGenerating(true);
    setHasAsked(true);
    setStatus("Fetching source material...");

    try {
      const result = await answerUpscQuestionFromChunks({
        backendUrl: cleanBackendUrl,
        question: cleanQuestion,
        subject: activeSubject.id,
        maxChunks: 8,
        maxContextChars: 12000,
        targetTokens: 3000,
        onStatus: setStatus,
        onToken: (token) => {
          setAnswer(repairMojibake(token));
        },
      });

      const cleanAnswer = formatAnswer(result.answer);
      setAnswer(cleanAnswer);
      setChunks(result.chunks);
      setChunkScores(result.chunkScores ?? []);
      setChunkCount(result.chunkCount);
      setTokenCount(result.tokenCount ?? 0);
      setElapsedSeconds((Date.now() - startedAt) / 1000);
      setStatus("");
      if (activeSubject) {
        saveQuery({
          id: `${startedAt}-${Math.random().toString(36).slice(2, 8)}`,
          subjectId: activeSubject.id,
          subjectName: activeSubject.name,
          question: cleanQuestion,
          answer: cleanAnswer,
          tokenCount: result.tokenCount ?? 0,
          chunkCount: result.chunkCount,
          timestamp: startedAt,
        });
      }
    } catch (error) {
      setAnswer("");
      setChunks([]);
      setChunkScores([]);
      setChunkCount(0);
      setElapsedSeconds(null);
      setStatus(error instanceof Error ? error.message : "Generation failed.");
    } finally {
      setGenerating(false);
    }
  }, [cleanBackendUrl, canAsk, activeSubject, question]);

  if (route === "dashboard") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" backgroundColor="#f8f9ff" />
        <Dashboard
          backendUrl={cleanBackendUrl}
          onSelectSubject={handleSelectSubject}
          apiKey={apiKey}
          hasApiKey={hasSavedApiKey}
          showApiInput={showApiInput}
          onApiKeyChange={handleApiKeyChange}
          onSaveApiKey={handleSaveApiKey}
          onToggleApiInput={() => {
            setApiKey("");
            setShowApiInput((v) => !v);
          }}
        />
      </SafeAreaView>
    );
  }

  if (route === "history" && activeSubject) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" backgroundColor="#f8f9ff" />
        <QueryHistory
          subjectName={activeSubject.name}
          subjectIcon={activeSubject.icon}
          queries={queries}
          onSelectQuery={handleSelectQuery}
          onNewQuery={handleNewQueryFromHistory}
          onBack={handleBackFromHistory}
          onClearHistory={handleClearHistory}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8f9ff" />
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: "padding", android: undefined })}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.topBar}>
            <Pressable
              accessibilityRole="button"
              onPress={handleBackToDashboard}
              style={({ pressed }) => [
                styles.backBtn,
                pressed && styles.backBtnPressed,
              ]}
            >
              <Text style={styles.backText}>← Subjects</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={toggleDebug}
              style={({ pressed }) => [
                styles.subjectTag,
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text style={styles.subjectTagIcon}>{activeSubject?.icon}</Text>
              <Text style={styles.subjectTagName}>{activeSubject?.name}</Text>
            </Pressable>
            <View style={styles.topBarSpacer} />
            <Pressable
              accessibilityRole="button"
              onPress={handleHistoryPress}
              style={({ pressed }) => [
                styles.historyBtn,
                pressed && styles.historyBtnPressed,
              ]}
            >
              <Text style={styles.historyBtnIcon}>📜</Text>
              <Text style={styles.historyBtnLabel}>Chat History</Text>
            </Pressable>
          </View>

          {debugMode && (
          <View style={styles.debugRow}>
            <Text style={styles.debugItem}>Chunks: {chunkCount}</Text>
            <Text style={styles.debugItem}>Tokens: {tokenCount}</Text>
            <Text style={styles.debugItem}>Time: {elapsedSeconds === null ? "--" : `${elapsedSeconds.toFixed(1)}s`}</Text>
          </View>
          )}

          <View style={styles.card}>
            <Text style={styles.cardLabel}>Question</Text>
            <TextInput
              editable={!generating}
              multiline
              onChangeText={setQuestion}
              placeholder={`Ask a ${activeSubject?.name ?? ""} question...`}
              style={[styles.input, styles.questionInput]}
              textAlignVertical="top"
              value={question}
              placeholderTextColor="#9ca3af"
            />

            <View style={styles.askRow}>
              <ActionButton
                disabled={!canAsk}
                label={generating ? "Generating..." : "Ask Question"}
                onPress={askQuestion}
              />
            </View>
          </View>

          <View style={styles.statusRow}>
            {generating && <ActivityIndicator color="#4f46e5" />}
            <Text style={styles.statusText}>{status}</Text>
          </View>

          {hasAsked && !generating && !status && chunkCount === 0 && answer.length === 0 && activeSubject && (
            <View style={styles.suggestionCard}>
              <View style={styles.suggestionBody}>
                <Text style={styles.suggestionText}>
                  This question seems to be unrelated. No content found in {activeSubject.name}. Switch other subject.
                </Text>
              </View>
            </View>
          )}

          {answer.length > 0 && (
            <View style={styles.answerCard}>
              <MarkdownAnswer text={formatAnswer(answer)} />
            </View>
          )}

          {chunks.length > 0 && (
            <View style={styles.chunksCard}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setShowChunks((v) => !v)}
                style={({ pressed }) => [
                  styles.chunksToggle,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={styles.chunksToggleText}>
                  {showChunks ? "Hide" : "Show"} Evidence ({chunks.length})
                </Text>
                <Text style={styles.chunksToggleArrow}>
                  {showChunks ? "v" : ">"}
                </Text>
              </Pressable>
              {showChunks &&
                chunks.map((chunk, i) => {
                  const score = resolveChunkScore(chunk, chunkScores[i]);
                  const hasScore = score !== null;
                  const scoreColor = !hasScore ? "#9ca3af" : score >= 0.7 ? "#22c55e" : score >= 0.45 ? "#eab308" : "#ef4444";
                  return (
                    <View key={i} style={styles.chunkItem}>
                      <View style={styles.chunkHeader}>
                        <Text style={styles.chunkIndex}>Chunk {i + 1}</Text>
                        <Text style={[styles.chunkScoreBar, { color: scoreColor }]}>
                          {hasScore ? `Score ${Math.round(score * 100)}%` : "Score unavailable"}
                        </Text>
                      </View>
                      {typeof chunk.metadata?.source_file === "string" && (
                        <Text style={styles.chunkSource}>
                          {formatChunkText(chunk.metadata.source_file)}
                        </Text>
                      )}
                      <Text style={styles.chunkText}>
                        {formatChunkText(chunk.text ?? chunk.content ?? "")}
                      </Text>
                    </View>
                  );
                })}
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f8f9ff",
  },
  flex: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 36,
  },
  // Top Bar
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
  backBtnPressed: {
    backgroundColor: "#f3f4f6",
  },
  backText: {
    color: "#4f46e5",
    fontSize: 14,
    fontWeight: "700",
  },
  historyBtn: {
    flexDirection: "column",
    alignItems: "center",
    gap: 2,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "#fffbeb",
    borderWidth: 1,
    borderColor: "#fde68a",
  },
  historyBtnPressed: {
    backgroundColor: "#fef3c7",
  },
  historyBtnIcon: {
    fontSize: 14,
  },
  historyBtnLabel: {
    color: "#92400e",
    fontSize: 11,
    fontWeight: "700",
  },
  topBarSpacer: {
    flex: 1,
  },
  subjectTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#eef2ff",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  subjectTagIcon: {
    fontSize: 16,
  },
  subjectTagName: {
    color: "#4338ca",
    fontSize: 14,
    fontWeight: "700",
  },
  // Card
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
    borderWidth: 1,
    borderColor: "#f3f4f6",
  },
  cardLabel: {
    color: "#374151",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 8,
    marginTop: 4,
  },
  input: {
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
  questionInput: {
    minHeight: 100,
  },
  apiKeySection: {
    gap: 8,
  },
  apiKeySaved: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f0fdf4",
    borderColor: "#bbf7d0",
    borderRadius: 10,
    borderWidth: 1,
    minHeight: 46,
    paddingHorizontal: 14,
    gap: 8,
  },
  apiKeySavedPressed: {
    opacity: 0.8,
  },
  apiKeySavedDot: {
    color: "#22c55e",
    fontSize: 10,
  },
  apiKeySavedText: {
    color: "#166534",
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },
  apiKeyChangeText: {
    color: "#4f46e5",
    fontSize: 13,
    fontWeight: "600",
  },
  askRow: {
    marginTop: 16,
  },
  // Buttons
  btn: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    minHeight: 48,
    paddingHorizontal: 16,
  },
  btnPrimary: {
    backgroundColor: "#4f46e5",
  },
  btnSecondary: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  btnGhost: {
    backgroundColor: "transparent",
    minHeight: 36,
    alignSelf: "flex-start",
  },
  btnDisabled: {
    opacity: 0.5,
  },
  btnPressed: {
    opacity: 0.85,
  },
  btnText: {
    fontSize: 15,
    fontWeight: "700",
  },
  btnTextPrimary: {
    color: "#ffffff",
  },
  btnTextSecondary: {
    color: "#374151",
  },
  btnTextGhost: {
    color: "#4f46e5",
    fontSize: 13,
  },
  // Status
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 16,
    minHeight: 30,
  },
  statusText: {
    color: "#6b7280",
    flex: 1,
    fontSize: 14,
  },
  // Metrics
  metricsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  metric: {
    backgroundColor: "#ffffff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#f3f4f6",
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    gap: 2,
  },
  metricValue: {
    color: "#4f46e5",
    fontSize: 18,
    fontWeight: "800",
  },
  metricLabel: {
    color: "#9ca3af",
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  debugRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 14,
    marginBottom: 14,
  },
  debugItem: {
    color: "#9ca3af",
    fontSize: 11,
    fontWeight: "600",
    fontFamily: Platform.OS === "web" ? "monospace" : undefined,
  },
  // Answer
  answerCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 20,
    marginTop: 16,
    borderWidth: 1,
    borderColor: "#f3f4f6",
  },
  answerTitle: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 12,
  },
  answerText: {
    color: "#374151",
    fontSize: 15,
    lineHeight: 24,
    marginBottom: 8,
  },
  suggestionCard: {
    backgroundColor: "#fffbeb",
    borderColor: "#fde68a",
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 14,
    padding: 16,
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  suggestionBody: {
    flex: 1,
    gap: 8,
  },
  suggestionText: {
    color: "#92400e",
    fontSize: 13,
    lineHeight: 18,
  },
  // Chunks
  chunksCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#f3f4f6",
  },
  chunksToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  chunksToggleText: {
    color: "#4f46e5",
    fontSize: 14,
    fontWeight: "700",
  },
  chunksToggleArrow: {
    color: "#9ca3af",
    fontSize: 12,
  },
  chunkItem: {
    backgroundColor: "#f9fafb",
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
  },
  chunkHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  chunkScoreBar: {
    fontSize: 11,
    fontFamily: "monospace",
    fontWeight: "600",
  },
  chunkIndex: {
    color: "#4f46e5",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 4,
  },
  chunkSource: {
    color: "#9ca3af",
    fontSize: 11,
    marginBottom: 6,
  },
  chunkText: {
    color: "#4b5563",
    fontSize: 13,
    lineHeight: 18,
  },
});
