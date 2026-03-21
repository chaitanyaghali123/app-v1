// src/components/AskForm.tsx
import React, { useState, useEffect, useRef } from "react";
import {
  fetchSubjects,
  getRevisionsBySubject,
  fetchAnswer,
  learnMore
} from "../api";
import { AnswerResponse, RevisionItem } from "../types";
import { getCached, setCached } from "../utils/cache"; // 🔹 new import
import "./AskForm.css";

const AskForm: React.FC = () => {
  const [subjects, setSubjects] = useState<string[]>([]);
  const [subjectId, setSubjectId] = useState(
    import.meta.env.VITE_DEFAULT_SUBJECT || "General"
  );
  const [query, setQuery] = useState("");
  const [answerData, setAnswerData] = useState<AnswerResponse | null>(null);
  const [detailedAnswer, setDetailedAnswer] = useState<any>(null);
  const [revisionItems, setRevisionItems] = useState<RevisionItem[]>([]);
  const [showRevision, setShowRevision] = useState(false);
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);

  const userId = import.meta.env.VITE_DEFAULT_USER_ID || "anon";
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    fetchSubjects().then(setSubjects).catch(() => setSubjects(["General"]));
  }, []);

  useEffect(() => {
    if (showRevision) {
      getRevisionsBySubject(subjectId, userId)
        .then(setRevisionItems)
        .catch((err) => console.error("Fetching revisions failed:", err));
    }
  }, [showRevision, subjectId, userId]);

  // 🎤 Speech Recognition
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.continuous = false;

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setQuery((prev) => (prev ? prev + " " : "") + transcript);
    };

    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
  }, []);

  const handleMicClick = () => {
    if (!recognitionRef.current) {
      alert("Speech recognition not supported in this browser.");
      return;
    }
    if (!listening) {
      setListening(true);
      recognitionRef.current.start();
    } else {
      recognitionRef.current.stop();
      setListening(false);
    }
  };

  // 🔹 Ask with UI cache
  const handleSubmit = async (q?: string) => {
    const prompt = q || query;
    if (!prompt.trim()) return;
    setLoading(true);
    setAnswerData(null);
    setDetailedAnswer(null);

    const cacheKey = `answer:${subjectId}:${userId}:${prompt}`;
    const cached = getCached(cacheKey);
    if (cached) {
      console.log("⚡ UI cache hit:", cacheKey);
      setAnswerData(cached);
      setLoading(false);
      return;
    }

    try {
      const res = await fetchAnswer(prompt, subjectId, userId);
      setAnswerData(res);
      setCached(cacheKey, res); // uses ANSWER_TTL from .env
    } catch (err) {
      console.error("Error in handleSubmit:", err);
      setAnswerData({
        answer: "Error fetching answer.",
        expanded_answer: null,
        citations: [],
        prompt,
        subject_id: subjectId,
        revision_id: null
      });
    } finally {
      setLoading(false);
    }
  };

  // 🔹 Learn More with UI cache
  const handleLearnMore = async () => {
    if (!answerData?.revision_id) return;
    const cacheKey = `learnmore:${answerData.revision_id}`;
    const cached = getCached(cacheKey);
    if (cached) {
      console.log("⚡ UI cache hit:", cacheKey);
      setDetailedAnswer(cached);
      return;
    }

    try {
      const res = await learnMore({ response_id: String(answerData.revision_id) });
      const detailed = {
        detailed: res.detailed,
        revision_id: res.revision_id,
        citations: res.citations
      };
      setDetailedAnswer(detailed);
      setCached(cacheKey, detailed); // uses LEARNMORE_TTL from .env
    } catch (err) {
      console.error("Learn more failed:", err);
    }
  };

  const citations = answerData?.citations ?? [];

  return (
    <div className="ask-form-container">
      <label>
        Subject:
        <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
          {subjects.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>

      {/* 🔹 Input + Mic */}
      <div className="input-container mic-input">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type or speak your question..."
        />
        <button
          type="button"
          className={`mic-btn ${listening ? "active" : ""}`}
          onClick={handleMicClick}
          title="Speak"
        >
          🎙️
        </button>
      </div>

      <div className="buttons">
        <button onClick={() => handleSubmit()}>Ask</button>
        <button onClick={() => setShowRevision(!showRevision)}>Revision</button>
      </div>

      {loading && (
        <div className="loading">
          <span className="spinner"></span>
          Fetching answer…
        </div>
      )}

      {!loading && answerData && (
        <div className="answer-block">
          <h3>Answer</h3>
          <div dangerouslySetInnerHTML={{ __html: answerData.answer }} />
          {answerData.expanded_answer && (
            <div className="expanded-answer">
              <h4>Learn More (auto)</h4>
              <div dangerouslySetInnerHTML={{ __html: answerData.expanded_answer }} />
            </div>
          )}
          {answerData.revision_id && (
            <button onClick={handleLearnMore}>Learn More</button>
          )}
          {citations.length > 0 && (
            <ul>
              {citations.map((c, i) => (
                <li key={i}>{c.source}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {detailedAnswer && (
        <div className="answer-block">
          <h3>Expanded Answer</h3>
          <div dangerouslySetInnerHTML={{ __html: detailedAnswer.answer }} />
        </div>
      )}

      {showRevision && (
        <div className="answer-block revision-history">
          <h3>Revision History</h3>
          {revisionItems.length > 0 ? (
            revisionItems.map((r, i) => (
              <div key={i} className="revision-item">
                <p>
                  <strong>Q:</strong> {r.prompt}
                </p>
                <div dangerouslySetInnerHTML={{ __html: r.answer }} />
                {r.expanded_answer && (
                  <div className="expanded-answer">
                    <h4>Learn More</h4>
                    <div dangerouslySetInnerHTML={{ __html: r.expanded_answer }} />
                  </div>
                )}
              </div>
            ))
          ) : (
            <p>No revision history.</p>
          )}
        </div>
      )}
    </div>
  );
};

export default AskForm;
