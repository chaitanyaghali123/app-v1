import React, { useCallback, useMemo, useState } from "react";
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

import { answerUpscQuestionFromChunks } from "./mobile/upscRagAnswer";

const DEFAULT_BACKEND_URL = "http://127.0.0.1:3000";
const DEFAULT_QUESTION = "what is trade union";
const FAST_MODE_LABEL = "Chunk RAG + Full Qwen Polish";

type ChunkPreview = {
  text?: string;
  metadata?: Record<string, unknown>;
};

type ButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary";
};

function ActionButton({
  label,
  onPress,
  disabled = false,
  variant = "primary",
}: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === "secondary" && styles.secondaryButton,
        disabled && styles.disabledButton,
        pressed && !disabled && styles.pressedButton,
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          variant === "secondary" && styles.secondaryButtonText,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export default function App() {
  const [backendUrl, setBackendUrl] = useState(DEFAULT_BACKEND_URL);
  const [question, setQuestion] = useState(DEFAULT_QUESTION);
  const [status, setStatus] = useState(
    "Ready. Tap Ask to stream a fully Qwen-polished chunk answer."
  );
  const [answer, setAnswer] = useState("");
  const [chunks, setChunks] = useState<ChunkPreview[]>([]);
  const [chunkCount, setChunkCount] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState<number | null>(null);

  const canAsk = useMemo(
    () => question.trim().length > 0 && backendUrl.trim().length > 0 && !generating,
    [backendUrl, generating, question]
  );

  const askQuestion = useCallback(async () => {
    if (!canAsk) {
      return;
    }

    const cleanQuestion = question.trim();
    const cleanBackendUrl = backendUrl.trim().replace(/\/+$/, "");
    const startedAt = Date.now();

    setAnswer("");
    setChunks([]);
    setChunkCount(0);
    setElapsedSeconds(null);
    setGenerating(true);
    setStatus("Fetching chunks and composing the UPSC answer...");

    try {
      const result = await answerUpscQuestionFromChunks({
        backendUrl: cleanBackendUrl,
        question: cleanQuestion,
        maxChunks: 5,
        maxContextChars: 3600,
        targetTokens: 600,
        polishTimeoutMs: 600000,
        onStatus: setStatus,
        onToken: (token) => {
          setAnswer(token);
        },
      });

      setAnswer(result.answer.trim());
      setChunks(result.chunks);
      setChunkCount(result.chunkCount);
      setElapsedSeconds((Date.now() - startedAt) / 1000);
      setStatus(
        result.chunkCount > 0
          ? result.polishApplied
            ? "Fully Qwen-polished chunk answer streamed."
            : "Chunk answer streamed. Qwen polish was skipped."
          : "No chunks returned. Add clearer notes for this topic."
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Generation failed.");
    } finally {
      setGenerating(false);
    }
  }, [backendUrl, canAsk, question]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#f7f4ef" />
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: "padding", android: undefined })}
        style={styles.keyboardArea}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.kicker}>Aryabhata Mobile RAG</Text>
            <Text style={styles.title}>UPSC Mains Answer Test</Text>
            <Text style={styles.subtitle}>{FAST_MODE_LABEL}</Text>
          </View>

          <View style={styles.panel}>
            <Text style={styles.label}>Backend URL</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              editable={!generating}
              onChangeText={setBackendUrl}
              placeholder="http://127.0.0.1:3000"
              style={styles.input}
              value={backendUrl}
            />

            <Text style={styles.label}>Question</Text>
            <TextInput
              editable={!generating}
              multiline
              onChangeText={setQuestion}
              placeholder="Enter UPSC mains question"
              style={[styles.input, styles.questionInput]}
              textAlignVertical="top"
              value={question}
            />

            <View style={styles.actions}>
              <ActionButton
                disabled
                label="Qwen Polish"
                onPress={() => {}}
                variant="secondary"
              />
              <ActionButton
                disabled={!canAsk}
                label={generating ? "Composing..." : "Ask"}
                onPress={askQuestion}
              />
            </View>
          </View>

          <View style={styles.statusRow}>
            {generating && <ActivityIndicator color="#25615b" />}
            <Text style={styles.statusText}>{status}</Text>
          </View>

          <View style={styles.metrics}>
            <Text style={styles.metric}>Chunks: {chunkCount}</Text>
            <Text style={styles.metric}>
              Time: {elapsedSeconds === null ? "--" : `${elapsedSeconds.toFixed(1)}s`}
            </Text>
          </View>

          {answer.length > 0 && (
            <View style={styles.answerBox}>
              <Text style={styles.answerTitle}>Answer</Text>
              <Text style={styles.answerText}>{answer}</Text>
            </View>
          )}

          {chunks.length > 0 && (
            <View style={styles.chunkBox}>
              <Text style={styles.chunkTitle}>Retrieved Chunks</Text>
              {chunks.map((chunk, index) => (
                <Text key={`${index}-${chunk.text?.slice(0, 12)}`} style={styles.chunkText}>
                  {index + 1}. {chunk.text}
                </Text>
              ))}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f7f4ef",
  },
  keyboardArea: {
    flex: 1,
  },
  content: {
    padding: 18,
    paddingBottom: 36,
  },
  header: {
    marginBottom: 18,
  },
  kicker: {
    color: "#25615b",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0,
    marginBottom: 6,
    textTransform: "uppercase",
  },
  title: {
    color: "#181a1b",
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: 0,
    lineHeight: 34,
  },
  subtitle: {
    color: "#646b70",
    fontSize: 13,
    marginTop: 6,
  },
  panel: {
    backgroundColor: "#ffffff",
    borderColor: "#e4dfd7",
    borderRadius: 8,
    borderWidth: 1,
    padding: 14,
  },
  label: {
    color: "#363b3f",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 7,
    marginTop: 8,
  },
  input: {
    backgroundColor: "#fbfaf7",
    borderColor: "#d8d2c8",
    borderRadius: 8,
    borderWidth: 1,
    color: "#181a1b",
    fontSize: 15,
    minHeight: 46,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  questionInput: {
    minHeight: 104,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  button: {
    alignItems: "center",
    backgroundColor: "#25615b",
    borderRadius: 8,
    flex: 1,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 12,
  },
  secondaryButton: {
    backgroundColor: "#edf5f2",
    borderColor: "#b7d3cd",
    borderWidth: 1,
  },
  disabledButton: {
    opacity: 0.55,
  },
  pressedButton: {
    opacity: 0.82,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
  },
  secondaryButtonText: {
    color: "#25615b",
  },
  statusRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
    minHeight: 30,
  },
  statusText: {
    color: "#40474c",
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  metrics: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  metric: {
    backgroundColor: "#fff7e8",
    borderColor: "#ead6ad",
    borderRadius: 8,
    borderWidth: 1,
    color: "#725318",
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    paddingHorizontal: 10,
    paddingVertical: 8,
    textAlign: "center",
  },
  answerBox: {
    backgroundColor: "#ffffff",
    borderColor: "#e4dfd7",
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 16,
    padding: 14,
  },
  answerTitle: {
    color: "#181a1b",
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 10,
  },
  answerText: {
    color: "#202326",
    fontSize: 15,
    lineHeight: 22,
  },
  chunkBox: {
    marginTop: 16,
  },
  chunkTitle: {
    color: "#181a1b",
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 8,
  },
  chunkText: {
    color: "#4a5157",
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 8,
  },
});
