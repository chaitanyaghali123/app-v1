import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { ChatIcon } from "./mobile/icons";
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

import { answerUpscQuestion } from "./mobile/upscAnswer";
import { storeApiKeyOnBackend } from "./mobile/gemini";
import Dashboard from "./mobile/Dashboard";
import MarkdownAnswer from "./mobile/MarkdownAnswer";
import QueryHistory from "./mobile/QueryHistory";
import AuthFlow, { ProfileScreen } from "./mobile/authScreens";
import { restoreSession, type AuthUser } from "./mobile/authApi";
import { saveQuery, getQueries, clearQueries } from "./mobile/queryStorage";
import type { QueryRecord } from "./mobile/queryStorage";

const DEFAULT_BACKEND_URL = Platform.OS === "web" ? "http://localhost:3000" : "http://192.168.29.61:3000";
const SECURE_STORE_KEY = "upsc_gemini_api_key";
const STORED_KEY_MARKER = "stored";

type Subject = {
  id: string;
  name: string;
  icon: string;
};

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: Array<Array<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

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

const GS_SUBJECTS: Record<string, Array<{ name: string }>> = {
  gs1: [
    { name: "Indian Heritage & Culture" },
    { name: "History" },
    { name: "Geography" },
    { name: "Indian Society" },
  ],
  gs2: [
    { name: "Constitution" },
    { name: "Polity" },
    { name: "Governance" },
    { name: "Social Justice" },
    { name: "International Relations" },
  ],
  gs3: [
    { name: "Economy" },
    { name: "Agriculture" },
    { name: "Science & Technology" },
    { name: "Environment & Ecology" },
    { name: "Biodiversity" },
    { name: "Disaster Management" },
    { name: "Internal Security" },
  ],
  gs4: [
    { name: "Ethics" },
    { name: "Integrity" },
    { name: "Aptitude" },
  ],
  essay: [
    { name: "Essay" },
  ],
};

const GS_DESCRIPTIONS: Record<string, string> = {
  gs1: "This paper focuses on static and foundational humanity subjects. It covers Indian art, literature, and architecture from ancient to modern times, along with the freedom struggle, post-independence consolidation, and world history. It also examines the salient features and diversity of Indian society, social issues, and global physical/human geography.",
  gs2: "This paper focuses on administrative, legal, and geopolitical systems. It evaluates the structure, functions, and constitutional provisions of the Indian political system, executive, judiciary, and state legislatures. Additionally, it covers public policy execution, governance mechanisms, social sector development schemes, and India's bilateral and global foreign relations.",
  gs3: "This paper deals with dynamic science, economic, and security subjects. It covers macroeconomics, Indian agriculture, infrastructure, and financial growth, alongside advancements in fields like IT, space, and biotechnology. It also addresses environmental conservation, climate change, disaster risk reduction, and internal/external national security challenges.",
  gs4: "This paper tests a candidate's moral framework, attitude, and administrative decision-making skills. It explores human values, ethical theories, emotional intelligence, probity in governance, and anti-corruption measures. Half of the paper evaluates real-world ethical dilemmas through practical administrative case studies.",
  essay: "This paper tests the ability to articulate thoughts in a coherent, well-structured essay on topics spanning all areas of general studies, current affairs, and philosophical themes.",
};

const GS_NAMES: Record<string, string> = {
  gs1: "General Studies 1",
  gs2: "General Studies 2",
  gs3: "General Studies 3",
  gs4: "General Studies 4",
  essay: "Essay",
};

const SUBJECT_COLORS: Record<string, string> = {
  gs1: "#f59e0b",
  gs2: "#3b82f6",
  gs3: "#10b981",
  gs4: "#8b5cf6",
  essay: "#ec4899",
  optional: "#6366f1",
};

const OPTIONAL_SUBJECTS: Array<{ id: string; name: string; icon: string; blurb: string }> = [
  { id: "history-optional", name: "History", icon: "📜", blurb: "Ancient, Medieval, Modern & World History" },
  { id: "geography-optional", name: "Geography", icon: "🌍", blurb: "Physical, Human & Indian Geography" },
  { id: "public-administration-optional", name: "Public Administration", icon: "🏛️", blurb: "Administrative Theory & Indian Administration" },
  { id: "sociology-optional", name: "Sociology", icon: "👥", blurb: "Foundations, Social Structure & Social Change" },
  { id: "political-science-optional", name: "Political Science / PSIR", icon: "⚖️", blurb: "Political Theory & International Relations" },
  { id: "philosophy-optional", name: "Philosophy", icon: "💭", blurb: "History & Systems of Philosophy" },
];

function isOptionalSubject(id: string) {
  return OPTIONAL_SUBJECTS.some((s) => s.id === id);
}

function subjectColor(id: string): string {
  return SUBJECT_COLORS[id] ?? SUBJECT_COLORS.optional ?? "#6366f1";
}

type AppRoute = "dashboard" | "qa" | "history" | "optional-picker" | "profile";

const ROUTES = new Set<string>(["dashboard", "qa", "history", "optional-picker", "profile"]);

// The app has no router, so a page refresh resets state to the dashboard. To
// survive a reload this snapshot keeps the last route (and the QA context) so
// refreshing the Q&A page lands back on Q&A with the same subject/question.
function loadUiSnapshot(): { route: AppRoute; subject: Subject | null; question: string } {
  if (!isWeb) return { route: "dashboard", subject: null, question: "" };
  try {
    const raw = localStorage.getItem("upsc_ui_snapshot");
    if (!raw) return { route: "dashboard", subject: null, question: "" };
    const parsed = JSON.parse(raw);
    let route: AppRoute = ROUTES.has(parsed.route)
      ? (parsed.route as AppRoute)
      : "dashboard";
    const subject: Subject | null = parsed.subject || null;
    if ((route === "qa" || route === "history") && !subject) route = "dashboard";
    return {
      route,
      subject,
      question: typeof parsed.question === "string" ? parsed.question : "",
    };
  } catch {
    return { route: "dashboard", subject: null, question: "" };
  }
}

export default function App() {
  const [route, setRoute] = useState<AppRoute>(() => loadUiSnapshot().route);
  const [backendUrl, setBackendUrl] = useState(DEFAULT_BACKEND_URL);
  const [sessionUser, setSessionUser] = useState<AuthUser | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [apiKey, setApiKey] = useState("");
  const [hasSavedApiKey, setHasSavedApiKey] = useState(false);
  const [activeSubject, setActiveSubject] = useState<Subject | null>(() => loadUiSnapshot().subject);
  const [queries, setQueries] = useState<QueryRecord[]>([]);
  const [question, setQuestion] = useState(() => loadUiSnapshot().question);
  const [status, setStatus] = useState("");
  const [answer, setAnswer] = useState("");
  const [generating, setGenerating] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState<number | null>(null);
  const [tokenCount, setTokenCount] = useState(0);
  const [showApiInput, setShowApiInput] = useState(false);
  const [pyqs, setPyqs] = useState<Array<{ paper: string; year: number | null; title: string; pdf_url: string }>>([]);
  const [pyqsLoading, setPyqsLoading] = useState(false);
  const [showPyqs, setShowPyqs] = useState(false);
  const [debugMode, setDebugMode] = useState(() => {
    if (isWeb) return localStorage.getItem("upsc_debug") === "true";
    return false;
  });
  const [hasAsked, setHasAsked] = useState(false);
  const [askedQuestion, setAskedQuestion] = useState("");
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const toggleDebug = useCallback(() => {
    setDebugMode((prev) => {
      const next = !prev;
      if (isWeb) localStorage.setItem("upsc_debug", String(next));
      return next;
    });
  }, []);

  useEffect(() => {
    if (!isWeb) return;
    try {
      localStorage.setItem(
        "upsc_ui_snapshot",
        JSON.stringify({ route, subject: activeSubject, question })
      );
    } catch {
      // storage may be unavailable (private mode, quota) — the refresh restore
      // just silently degrades to the dashboard in that case.
    }
  }, [route, activeSubject, question]);

  // Tap-to-start / tap-to-stop dictation via the browser's Web Speech API. The
  // transcript is dropped into the question input for editing — nothing is
  // auto-sent.
  const toggleVoiceInput = useCallback(() => {
    if (!isWeb) {
      setStatus("Voice input isn't available in this build yet. Type your question instead.");
      return;
    }
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) {
      setStatus("Voice input isn't supported in this browser. Try Chrome or Edge.");
      return;
    }
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      return;
    }
    try {
      const rec = new SR();
      rec.lang = "en-IN";
      rec.interimResults = true;
      rec.continuous = true;
      rec.onresult = (event) => {
        if (recognitionRef.current !== rec) return;
        let text = "";
        for (let i = 0; i < event.results.length; i++) {
          text += event.results[i][0]?.transcript ?? "";
        }
        setQuestion(text);
      };
      rec.onend = () => {
        const wasActive = recognitionRef.current === rec;
        recognitionRef.current = null;
        setListening(false);
        if (wasActive) setStatus("");
      };
      rec.onerror = rec.onend;
      recognitionRef.current = rec;
      rec.start();
      setListening(true);
      setStatus("Listening... tap the mic when you're done.");
    } catch {
      recognitionRef.current = null;
      setListening(false);
      setStatus("Couldn't start voice input.");
    }
  }, []);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  const cleanBackendUrl = backendUrl.trim().replace(/\/+$/, "");

  useEffect(() => {
    let mounted = true;
    restoreSession(cleanBackendUrl)
      .then((user) => {
        if (mounted) setSessionUser(user);
      })
      .catch(() => {
        if (mounted) setSessionUser(null);
      })
      .finally(() => {
        if (mounted) setSessionLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [cleanBackendUrl]);

  const handleTogglePyqs = useCallback(() => {
    if (showPyqs) {
      setShowPyqs(false);
      return;
    }
    if (pyqs.length > 0) {
      setShowPyqs(true);
      return;
    }
    if (!activeSubject) return;
    setPyqsLoading(true);
    setShowPyqs(true);
    fetch(`${cleanBackendUrl}/api/pyqs/${activeSubject.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setPyqs(data.pyqs);
      })
      .catch(() => {})
      .finally(() => setPyqsLoading(false));
  }, [showPyqs, pyqs.length, activeSubject, cleanBackendUrl]);

  useEffect(() => {
    setPyqs([]);
    setShowPyqs(false);
  }, [activeSubject?.id]);

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
    setAskedQuestion("");
    setAnswer("");
    setHasAsked(false);
    setShowPyqs(false);
    if (subject.id === "optional") {
      setRoute("optional-picker");
      return;
    }
    setRoute("qa");
  }, []);

  const handleSelectOptional = useCallback((subject: Subject) => {
    setActiveSubject(subject);
    setQuestion("");
    setAskedQuestion("");
    setAnswer("");
    setHasAsked(false);
    setShowPyqs(false);
    setRoute("qa");
  }, []);

  const handleBackToDashboard = useCallback(() => {
    setRoute("dashboard");
    setActiveSubject(null);
    setHasAsked(false);
    setAskedQuestion("");
    setAnswer("");
  }, []);

  const handleHistoryPress = useCallback(() => {
    if (!activeSubject) return;
    setQueries(getQueries(activeSubject.id));
    setRoute("history");
  }, [activeSubject]);

  const handleSelectQuery = useCallback((record: QueryRecord) => {
    setAskedQuestion(record.question);
    setQuestion("");
    setAnswer(formatAnswer(record.answer));
    setTokenCount(record.tokenCount);
    setHasAsked(true);
    setRoute("qa");
  }, []);

  const handleBackFromHistory = useCallback(() => {
    setRoute("qa");
  }, []);

  const handleNewQueryFromHistory = useCallback(() => {
    setQuestion("");
    setAskedQuestion("");
    setAnswer("");
    setTokenCount(0);
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

    // Commit the question as a message and clear the composer (ChatGPT-style).
    // Any live dictation stops first so a late transcript can't overwrite the
    // input after it has been cleared.
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
      setListening(false);
    }
    setAskedQuestion(cleanQuestion);
    setQuestion("");
    setAnswer("");
    setElapsedSeconds(null);
    setGenerating(true);
    setHasAsked(true);
    setStatus("Preparing your answer...");

    try {
      const result = await answerUpscQuestion({
        backendUrl: cleanBackendUrl,
        question: cleanQuestion,
        subject: activeSubject.id,
        onStatus: setStatus,
        onToken: (token) => {
          setAnswer(repairMojibake(token));
        },
      });

      const cleanAnswer = formatAnswer(result.answer);
      setAnswer(cleanAnswer);
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
          timestamp: startedAt,
        });
      }
    } catch (error) {
      // Nothing was produced: put the question back in the composer so it can
      // be edited and retried, and drop the message bubble.
      setAskedQuestion("");
      setQuestion(cleanQuestion);
      setHasAsked(false);
      setAnswer("");
      setElapsedSeconds(null);
      setStatus(error instanceof Error ? error.message : "Generation failed.");
    } finally {
      setGenerating(false);
    }
  }, [cleanBackendUrl, canAsk, activeSubject, question]);

  // Enter sends the question on web; Shift+Enter keeps the newline.
  const composerRef = useRef<React.ElementRef<typeof TextInput>>(null);
  const askRef = useRef(askQuestion);
  askRef.current = askQuestion;

  useEffect(() => {
    if (!isWeb) return;
    const node = composerRef.current as unknown as {
      addEventListener?: (type: string, fn: (e: KeyboardEvent) => void) => void;
      removeEventListener?: (type: string, fn: (e: KeyboardEvent) => void) => void;
    } | null;
    if (!node || typeof node.addEventListener !== "function") return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        askRef.current();
      }
    };
    node.addEventListener("keydown", onKeyDown);
    return () => node.removeEventListener?.("keydown", onKeyDown);
  }, []);

  if (sessionLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        <View style={styles.sessionSplash}>
          <ActivityIndicator color="#4f46e5" />
        </View>
      </SafeAreaView>
    );
  }

  if (!sessionUser) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        <AuthFlow backendUrl={cleanBackendUrl} onAuthenticated={setSessionUser} />
      </SafeAreaView>
    );
  }

  if (route === "profile") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.topBar}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setRoute("dashboard")}
              style={({ pressed }) => [
                styles.backBtn,
                pressed && styles.backBtnPressed,
              ]}
            >
              <Text style={styles.backText}>← Back</Text>
            </Pressable>
          </View>
          <ProfileScreen
            backendUrl={cleanBackendUrl}
            user={sessionUser}
            onUserUpdated={setSessionUser}
            onLoggedOut={() => setSessionUser(null)}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (route === "dashboard") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        <View style={styles.dashboardTopRow}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setRoute("profile")}
            style={({ pressed }) => [
              styles.profileBtn,
              pressed && styles.profileBtnPressed,
            ]}
          >
            <Text style={styles.profileBtnText}>👤 Profile</Text>
          </Pressable>
        </View>
        <Dashboard
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
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
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

  if (route === "optional-picker") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        <ScrollView contentContainerStyle={styles.scroll}>
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
          </View>
          <View style={styles.subjectInfoCard}>
            <Text style={[styles.subjectInfoTitle, { color: SUBJECT_COLORS.optional }]}>
              Optional Subjects
            </Text>
            <Text style={styles.subjectInfoDesc}>
              Choose an optional subject to view its source material, previous year questions and current affairs.
            </Text>
          </View>
          <View style={styles.optionalGrid}>
            {OPTIONAL_SUBJECTS.map((sub) => (
              <Pressable
                key={sub.id}
                accessibilityRole="button"
                onPress={() =>
                  handleSelectOptional({
                    id: sub.id,
                    name: sub.name,
                    icon: sub.icon,
                  })
                }
                style={({ pressed }) => [
                  styles.optionalCard,
                  { borderColor: SUBJECT_COLORS.optional + "30" },
                  pressed && { borderColor: SUBJECT_COLORS.optional, backgroundColor: SUBJECT_COLORS.optional + "08" },
                ]}
              >
                <View style={[styles.optionalIconWrap, { backgroundColor: SUBJECT_COLORS.optional + "15" }]}>
                  <Text style={styles.optionalIcon}>{sub.icon}</Text>
                </View>
                <Text style={[styles.optionalName, { color: SUBJECT_COLORS.optional }]}>{sub.name}</Text>
                <Text style={styles.optionalBlurb}>{sub.blurb}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: "padding", android: undefined })}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, styles.qaScroll]}
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
            {activeSubject && (GS_SUBJECTS[activeSubject.id] || isOptionalSubject(activeSubject.id)) && (
              <Pressable
                accessibilityRole="button"
                onPress={handleTogglePyqs}
                style={({ pressed }) => [
                  styles.pyqToggleBtn,
                  { borderColor: subjectColor(activeSubject.id) + "40" },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={styles.pyqToggleText}>
                  {showPyqs ? "Hide" : "Show"} Previous Year Questions
                </Text>
                <Text style={styles.pyqToggleArrow}>{showPyqs ? "v" : ">"}</Text>
              </Pressable>
            )}
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
            <Text style={styles.debugItem}>Tokens: {tokenCount}</Text>
            <Text style={styles.debugItem}>Time: {elapsedSeconds === null ? "--" : `${elapsedSeconds.toFixed(1)}s`}</Text>
          </View>
          )}

          {isOptionalSubject(activeSubject?.id || "") ? (
            <View style={styles.subjectInfoCard}>
              <Text style={[styles.subjectInfoTitle, { color: subjectColor(activeSubject!.id) }]}>
                {activeSubject!.name}
              </Text>
              <Text style={styles.subjectInfoDesc}>
                {OPTIONAL_SUBJECTS.find((s) => s.id === activeSubject!.id)?.blurb || "Optional Subject"}
              </Text>
            </View>
          ) : null}

          {showPyqs && pyqs.length > 0 ? (
            <View style={styles.pyqCard}>
              {pyqs.map((pyq, i) => (
                <Pressable
                  key={i}
                  onPress={() => { if (isWeb) window.open(pyq.pdf_url, "_blank"); }}
                  style={({ pressed }) => [styles.pyqItem, pressed && { opacity: 0.7 }]}
                >
                  <View style={[styles.pyqDot, { backgroundColor: subjectColor(activeSubject!.id) }]} />
                  <View style={styles.pyqItemContent}>
                    <Text style={styles.pyqItemYear}>{pyq.year ?? "Older"}</Text>
                    <Text style={styles.pyqItemTitle}>{pyq.title}</Text>
                  </View>
                  <Text style={styles.pyqArrow}>↗</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {showPyqs && pyqsLoading ? (
            <View style={styles.pyqCard}>
              <ActivityIndicator color="#4f46e5" />
              <Text style={styles.pyqLoadingText}>Loading PYQs...</Text>
            </View>
          ) : null}

          {hasAsked && askedQuestion.trim() ? (
            <View style={styles.userBubble}>
              <Text style={styles.userBubbleText}>{askedQuestion}</Text>
            </View>
          ) : null}

          <View style={styles.statusRow}>
            {generating && <ActivityIndicator color="#4f46e5" />}
            <Text style={styles.statusText}>{status}</Text>
          </View>

          {answer.length > 0 && (
            <View style={styles.answerCard}>
              <MarkdownAnswer text={formatAnswer(answer)} />
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>

        <View style={styles.inputArea}>
          {listening ? (
            <View style={styles.listeningRow}>
              <View style={styles.listeningDot} />
              <Text style={styles.listeningText}>Listening — tap the mic when you're done</Text>
            </View>
          ) : null}
          <View style={styles.chatInputRow}>
            <TextInput
              editable={!generating}
              multiline
              onChangeText={setQuestion}
              placeholder={listening ? "Listening..." : "Ask your UPSC question..."}
              placeholderTextColor="#9ca3af"
              ref={composerRef}
              style={styles.chatInput}
              textAlignVertical="top"
              value={question}
            />
            <Pressable
              accessibilityLabel="Voice input"
              accessibilityRole="button"
              disabled={generating}
              onPress={toggleVoiceInput}
              style={({ pressed }) => [
                styles.inputIconBtn,
                listening && styles.inputIconBtnListening,
                pressed && { opacity: 0.7 },
              ]}
            >
              <ChatIcon
                color={listening ? "#ef4444" : "#4b5563"}
                name="microphone"
                size={22}
              />
            </Pressable>
            <Pressable
              accessibilityLabel="Ask question"
              accessibilityRole="button"
              disabled={!canAsk}
              onPress={askQuestion}
              style={({ pressed }) => [
                styles.sendBtn,
                !canAsk && styles.sendBtnDisabled,
                pressed && canAsk && { opacity: 0.85 },
              ]}
            >
              {generating ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <ChatIcon color="#ffffff" name="arrow-up" size={20} />
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  flex: {
    flex: 1,
  },
  sessionSplash: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  dashboardTopRow: {
    paddingHorizontal: 20,
    paddingTop: 12,
    alignItems: "flex-end",
  },
  profileBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  profileBtnPressed: {
    opacity: 0.7,
  },
  profileBtnText: {
    color: "#374151",
    fontSize: 14,
    fontWeight: "700",
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 36,
    width: "100%",
    maxWidth: 850,
    alignSelf: "center",
  },
  // Extra bottom room on the Q&A screen so the fixed input bar never covers
  // the last lines of a long answer (~90px input + breathing space).
  qaScroll: {
    paddingBottom: 110,
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
    color: "#111827",
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
    color: "#111827",
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
    color: "#111827",
    fontSize: 14,
    fontWeight: "700",
  },
  // User message bubble (the asked question, shown above the answer)
  userBubble: {
    alignSelf: "flex-end",
    maxWidth: "86%",
    backgroundColor: "#F7F7F8",
    borderRadius: 20,
    borderBottomRightRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 4,
    marginBottom: 4,
  },
  userBubbleText: {
    color: "#111827",
    fontSize: 15,
    lineHeight: 22,
  },
  // Bottom-fixed composer: white bar, centered chat input, mic + send inside
  inputArea: {
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 16,
  },
  listeningRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: 8,
    paddingTop: 2,
    paddingBottom: 8,
  },
  listeningDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#ef4444",
  },
  listeningText: {
    color: "#6b7280",
    fontSize: 12,
    fontWeight: "600",
  },
  chatInputRow: {
    width: "100%",
    maxWidth: 800,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 56,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 28,
    backgroundColor: "#F7F7F8",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  chatInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    color: "#111827",
    paddingHorizontal: 12,
    paddingVertical: 10,
    maxHeight: 110,
    backgroundColor: "transparent",
  },
  inputIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  inputIconBtnListening: {
    backgroundColor: "#fee2e2",
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4f46e5",
  },
  sendBtnDisabled: {
    opacity: 0.5,
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
  subjectInfoCard: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#f3f4f6",
    padding: 14,
    marginBottom: 12,
  },
  subjectInfoTitle: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 6,
  },
  subjectInfoDesc: {
    color: "#6b7280",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 10,
  },
  optionalGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  optionalCard: {
    width: "48%",
    backgroundColor: "#ffffff",
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: "flex-start",
    paddingVertical: 16,
    paddingHorizontal: 14,
    gap: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  optionalIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  optionalIcon: {
    fontSize: 20,
  },
  optionalName: {
    fontSize: 14,
    fontWeight: "800",
  },
  optionalBlurb: {
    color: "#6b7280",
    fontSize: 12,
    lineHeight: 16,
  },
  subjectInfoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  subjectInfoBadge: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 8,
  },
  subjectInfoNum: {
    fontSize: 13,
    fontWeight: "800",
    width: 22,
    height: 22,
    borderRadius: 11,
    textAlign: "center",
    lineHeight: 22,
    overflow: "hidden",
  },
  subjectInfoText: {
    color: "#374151",
    fontSize: 15,
    fontWeight: "600",
  },
  pyqCard: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#f3f4f6",
    padding: 10,
    marginBottom: 12,
  },
  pyqToggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    minHeight: 40,
    flexShrink: 1,
  },
  pyqToggleText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  pyqToggleArrow: {
    color: "#9ca3af",
    fontSize: 13,
    fontWeight: "700",
  },
  pyqItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#f9fafb",
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "#f3f4f6",
  },
  pyqDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  pyqItemContent: {
    flex: 1,
  },
  pyqItemTitle: {
    color: "#6b7280",
    fontSize: 13,
    fontWeight: "500",
    marginTop: 2,
  },
  pyqItemYear: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "700",
  },
  pyqArrow: {
    color: "#9ca3af",
    fontSize: 16,
    fontWeight: "600",
  },
  pyqLoadingText: {
    color: "#6b7280",
    fontSize: 13,
    marginTop: 6,
    textAlign: "center",
  },
});
