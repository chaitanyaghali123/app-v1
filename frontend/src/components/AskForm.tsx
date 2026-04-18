import React, { useState, useEffect, useRef } from "react";
import { fetchSubjects } from "../api";
import "./AskForm.css";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

const TypingIndicator: React.FC = () => (
  <div className="typing-indicator">
    <span></span><span></span><span></span>
  </div>
);

const AskForm: React.FC = () => {
  const userId = import.meta.env.VITE_DEFAULT_USER_ID || "anon";

  const [chatId, setChatId] = useState<string | null>(null);
  const [chats, setChats] = useState<any[]>([]);
  const [conversation, setConversation] = useState<any[]>([]);
  const [query, setQuery] = useState("");
  const [subjects, setSubjects] = useState<string[]>([]);
  const [subjectId, setSubjectId] = useState("General");
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // 🔥 FIXED NORMALIZER (handles broken JSON)
  const normalizeMessages = (msgs: any[]) => {
    return msgs.map((m) => {
      let content = m.content;

      if (typeof content === "string") {
        // Try valid JSON
        try {
          if (content.trim().startsWith("{")) {
            const parsed = JSON.parse(content);
            content = parsed.answer || content;
          }
        } catch (e) {}

        // Handle broken JSON string
        if (content.includes('"answer"')) {
          const match = content.match(/"answer"\s*:\s*"([\s\S]*?)"/);
          if (match && match[1]) {
            content = match[1]
              .replace(/\\"/g, '"')
              .replace(/\\n/g, "\n");
          }
        }

        // Clean leftover junk
        content = content
          .replace(/^\s*\{.*?"answer"\s*:\s*"?/, "")
          .replace(/",?\s*"citations".*$/, "")
          .trim();
      }

      if (typeof content === "object") {
        content = content?.answer || JSON.stringify(content);
      }

      return { ...m, content };
    });
  };

  useEffect(() => {
    fetchSubjects().then(setSubjects).catch(() => setSubjects(["General"]));
  }, []);

  const loadChats = async () => {
    try {
      const res = await fetch(`${API_BASE}/chat/list?userId=${userId}`);
      const data = await res.json();
      setChats(data);
    } catch (err) {
      console.error("❌ loadChats error:", err);
    }
  };

  useEffect(() => {
    loadChats();
  }, []);

  const createChat = async () => {
    try {
      const res = await fetch(`${API_BASE}/chat/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, subjectId })
      });

      const data = await res.json();
      setChatId(data.chatId);
      setConversation([]);
      loadChats();
      setSidebarOpen(false);
    } catch (err) {
      console.error("❌ createChat error:", err);
    }
  };

  const loadMessages = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/chat/${id}`);
      const data = await res.json();

      setChatId(id);
      setConversation(normalizeMessages(data.messages || []));
      setSidebarOpen(false);
    } catch (err) {
      console.error("❌ loadMessages error:", err);
    }
  };

  const handleSubmit = async () => {
    if (!query.trim() || loading) return;

    let currentChatId = chatId;

    try {
      if (!currentChatId) {
        const res = await fetch(`${API_BASE}/chat/create`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, subjectId })
        });

        const data = await res.json();
        currentChatId = data.chatId;
        setChatId(currentChatId);
      }

      const userMessage = { role: "user", content: query };

      setConversation((prev) => [
        ...prev,
        userMessage,
        { role: "assistant", content: "typing…" }
      ]);

      setLoading(true);
      setQuery("");

      const res = await fetch(`${API_BASE}/chat/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: currentChatId,
          message: query,
          subjectId
        })
      });

      const data = await res.json();

      setConversation(normalizeMessages(data.messages || []));
      loadChats();
    } catch (err) {
      console.error("❌ sendMessage error:", err);
    }

    setLoading(false);
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation]);

  return (
    <div className="app">
      {/* Sidebar Toggle */}
      <button
        className="sidebar-toggle"
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        📒
      </button>

      {/* Overlay */}
      <div
        className={`overlay ${sidebarOpen ? "visible" : "hidden"}`}
        onClick={() => setSidebarOpen(false)}
      ></div>

      {/* Sidebar */}
      <div className={`sidebar ${sidebarOpen ? "open" : "closed"}`}>
        <button onClick={createChat}>+ New Chat</button>

        {chats.map((chat) => (
          <div
            key={chat.chatId}
            onClick={() => loadMessages(chat.chatId)}
            className="chat-item"
          >
            {chat.title || "Untitled"}
          </div>
        ))}
      </div>

      {/* Chat Area */}
      <div className="chat-area">
        <select
          value={subjectId}
          onChange={(e) => setSubjectId(e.target.value)}
        >
          {subjects.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>

        <div className="conversation">
          {conversation.map((msg, i) => (
            <div key={i} className={`message ${msg.role}`}>
              {msg.content === "typing…" ? (
                <TypingIndicator />
              ) : msg.role === "assistant" ? (
                <div
                  dangerouslySetInnerHTML={{
                    __html: String(msg.content)
                  }}
                />
              ) : (
                String(msg.content)
              )}
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <div className="input-container">
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Send a message..."
            rows={1}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />

          <button onClick={handleSubmit} disabled={loading}>
            ➤
          </button>
        </div>
      </div>
    </div>
  );
};

export default AskForm;