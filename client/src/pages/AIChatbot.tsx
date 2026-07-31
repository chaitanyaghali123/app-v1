import React, { useState, useRef, useEffect } from "react";

const SUBJECTS = [
  { id: "history", label: "History" },
  { id: "geography", label: "Geography" },
  { id: "polity", label: "Polity" },
  { id: "economy", label: "Economy" },
  { id: "environment", label: "Environment" },
  { id: "science", label: "Science & Tech" },
];

export default function AIChatbot() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [subject, setSubject] = useState("");
  const [elapsed, setElapsed] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const startRef = useRef<number>(0);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const handleSubmit = async () => {
    if (!question.trim() || loading) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setAnswer("");
    setError("");
    setStatus("Fetching source material...");
    startRef.current = Date.now();
    setElapsed(null);

    try {
      const backendUrl =
        process.env.REACT_APP_API_URL || "http://localhost:3000";

      const response = await fetch(`${backendUrl}/api/rag/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          prompt: question.trim(),
          subject: subject || undefined,
          deviceId: localStorage.getItem("deviceId") || "web-default",
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Server error (${response.status})`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("Streaming not available");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          const jsonStr = trimmed.slice(6).trim();
          if (!jsonStr) continue;

          try {
            const data = JSON.parse(jsonStr);
            if (data.type === "token") {
              setAnswer(data.text);
            } else if (data.type === "status") {
              setStatus(data.status);
            } else if (data.type === "done") {
              setAnswer(data.answer || "");
              setStatus("");
              setElapsed((Date.now() - startRef.current) / 1000);
            } else if (data.type === "error") {
              throw new Error(data.error);
            }
          } catch (e) {
            if (e instanceof SyntaxError) continue;
            throw e;
          }
        }
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Request failed");
      setStatus("");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div style={{ maxWidth: 800, margin: "2rem auto", fontFamily: "system-ui, sans-serif", padding: "0 1rem" }}>
      <h2 style={{ marginBottom: "1rem" }}>UPSC RAG Assistant</h2>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <select
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          style={{ padding: "0.5rem", fontSize: "1rem", borderRadius: 6, border: "1px solid #ccc" }}
        >
          <option value="">All Subjects</option>
          {SUBJECTS.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
      </div>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        <textarea
          rows={3}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask your UPSC question..."
          style={{ flex: 1, padding: "0.75rem", fontSize: "1rem", borderRadius: 6, border: "1px solid #ccc", resize: "vertical" }}
        />
      </div>

      <button
        onClick={handleSubmit}
        disabled={loading || !question.trim()}
        style={{
          padding: "0.6rem 1.5rem",
          fontSize: "1rem",
          borderRadius: 6,
          border: "none",
          backgroundColor: loading ? "#6c757d" : "#0d6efd",
          color: "#fff",
          cursor: loading ? "not-allowed" : "pointer",
        }}
      >
        {loading ? "Thinking..." : "Ask"}
      </button>

      {status && (
        <div style={{ marginTop: "1rem", color: "#6c757d", fontStyle: "italic" }}>
          {status}
        </div>
      )}

      {answer && (
        <div style={{ marginTop: "1.5rem", padding: "1.5rem", backgroundColor: "#f8f9fa", borderRadius: 8, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
          <h3 style={{ marginTop: 0, marginBottom: "0.5rem" }}>Answer</h3>
          {answer}
          {elapsed !== null && (
            <div style={{ marginTop: "1rem", fontSize: "0.85rem", color: "#6c757d" }}>
              Generated in {elapsed.toFixed(1)}s
            </div>
          )}
        </div>
      )}

      {error && (
        <div style={{ marginTop: "1rem", padding: "1rem", backgroundColor: "#f8d7da", borderRadius: 6, color: "#842029" }}>
          {error}
        </div>
      )}
    </div>
  );
}
