import React, { useState, useEffect, useRef } from "react";
import parse from "html-react-parser";
import { Link } from "react-router-dom";
import LogoutButton from "./LogoutButton";
import "./AskForm.css";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

const TypingIndicator: React.FC = () => (
  <div className="typing-indicator">
    <span></span>
    <span></span>
    <span></span>
  </div>
);

const AskForm: React.FC = () => {
  const userId = import.meta.env.VITE_DEFAULT_USER_ID || "anon";

  const [chatId, setChatId] = useState<string | null>(null);
  const [chats, setChats] = useState<any[]>([]);
  const [conversation, setConversation] = useState<any[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const attachMenuRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<any>(null);

  // 🎤 Speech Recognition
useEffect(() => {
  const SpeechRecognition =
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition;

  if (SpeechRecognition) {
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = false;

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setQuery(transcript);   // put text in textarea
      setTimeout(() => {
        handleSubmit();       // auto-send after typing
      }, 300);                // small delay so state updates
    };

    recognitionRef.current = recognition;
  }
}, []);

  const startListening = () => {
    recognitionRef.current?.start();
  };

  // 📒 Load chats
  const loadChats = async () => {
    const res = await fetch(`${API_BASE}/chat/list?userId=${userId}`);
    const data = await res.json();
    setChats(data);
  };

  useEffect(() => {
    loadChats();
  }, []);

  // ✅ Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        attachMenuRef.current &&
        !attachMenuRef.current.contains(e.target as Node)
      ) {
        setShowAttachMenu(false);
      }
    };

    if (showAttachMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showAttachMenu]);

  // 📎 File select
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList) return;

    const files = Array.from(fileList);
    setSelectedFiles((prev) => [...prev, ...files]);

    setShowAttachMenu(false);
    e.target.value = "";
  };

  // 🚀 Send message
  const handleSubmit = async () => {
    if ((!query.trim() && selectedFiles.length === 0) || loading) return;

    let currentChatId = chatId;

    if (!currentChatId) {
      const res = await fetch(`${API_BASE}/chat/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });

      const data = await res.json();
      currentChatId = data.chatId;
      setChatId(currentChatId);
    }

    setConversation((prev) => [
      ...prev,
      { role: "user", content: query || "📎 File uploaded" },
      { role: "assistant", content: "typing…" },
    ]);

    setLoading(true);
    setQuery("");

    const formData = new FormData();
    formData.append("chatId", currentChatId!);
    formData.append("message", query);

    selectedFiles.forEach((file) => {
      formData.append("files", file);
    });

    const res = await fetch(`${API_BASE}/chat/message`, {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    setConversation(data.messages || []);
    setSelectedFiles([]);
    setShowAttachMenu(false);
    setLoading(false);
    loadChats();
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation]);

  return (
    <div className="app">
      <button
        className="sidebar-toggle"
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        📒
      </button>

      <div
        className={`overlay ${sidebarOpen ? "visible" : "hidden"}`}
        onClick={() => setSidebarOpen(false)}
      ></div>

      <div className={`sidebar ${sidebarOpen ? "open" : "closed"}`}>
        <button
          onClick={async () => {
            const res = await fetch(`${API_BASE}/chat/create`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ userId }),
            });

            const data = await res.json();
            setChatId(data.chatId);
            setConversation([]);
            loadChats();
            setSidebarOpen(false);
          }}
        >
          + New Chat
        </button>

        {chats.map((chat) => (
          <div
            key={chat.chatId}
            className="chat-item"
            onClick={() => {
              setChatId(chat.chatId);
              fetch(`${API_BASE}/chat/${chat.chatId}`)
                .then((res) => res.json())
                .then((data) => setConversation(data.messages || []));
              setSidebarOpen(false);
            }}
          >
            {chat.title || "Untitled"}
          </div>
        ))}

        <div className="account-settings">
          <h4>Account</h4>
          <Link to="/profile">My Account</Link>
          <Link to="/subscribe">Manage Subscription</Link>
          <LogoutButton />
        </div>
      </div>

      <div className="chat-area">
        <div className="conversation">
          {conversation.map((msg, i) => (
            <div key={i} className={`message ${msg.role}`}>
              {msg.content === "typing…" ? (
                <TypingIndicator />
              ) : (
                parse(msg.content)
              )}
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* INPUT */}
<div className="input-container">
  <div className="textarea-wrapper">
    <textarea
      value={query}
      onChange={(e) => setQuery(e.target.value)}
      placeholder="Message Aryabhata..."
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          handleSubmit();
        }
      }}
    />

 <div className="input-actions">
  <div className="left-actions">
    <button
      className="plus-button"
      onClick={(e) => {
        e.stopPropagation();
        setShowAttachMenu((prev) => !prev);
      }}
    >
      +
    </button>
  </div>

  <div className="right-actions">
    <button className="mic-button" onClick={startListening}>🎙️</button>
    <button className="send-btn" onClick={handleSubmit} disabled={loading}>⬆</button>
  </div>
</div>


    {showAttachMenu && (
      <div
        className="attachment-options"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => {
            setShowAttachMenu(false);
            cameraInputRef.current?.click();
          }}
        >
          📷 Camera
        </button>

        <button
          onClick={() => {
            setShowAttachMenu(false);
            fileInputRef.current?.click();
          }}
        >
          📁 Files
        </button>

        <button
          onClick={() => {
            setShowAttachMenu(false);
            fileInputRef.current?.click();
          }}
        >
          🖼 Photos
        </button>
      </div>
    )}
  </div>

  <input
    type="file"
    multiple
    ref={fileInputRef}
    style={{ display: "none" }}
    onChange={handleFileSelect}
  />

  <input
    type="file"
    accept="image/*"
    capture="environment"
    ref={cameraInputRef}
    style={{ display: "none" }}
    onChange={handleFileSelect}
  />
</div>

        {/* ✅ FIXED SECTION */}
        {selectedFiles.length > 0 && (
          <div className="file-preview">
            {selectedFiles.map((f, i) => (
              <span key={i}>{f.name}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AskForm;
