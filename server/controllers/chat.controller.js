// server/controllers/chat.controller.js

import {
  createChat,
  getChats,
  getChatMessages,
  addMessage,
} from "../services/db.service.js";

import { queryChroma, storeDocument } from "../services/vector.service.js";
import { extractTextFromPDF } from "../services/pdf.service.js";
import { handleLLMAnswer } from "../services/llm-response-handler.js";

import fs from "fs/promises";

// =====================================
// ✅ Create Chat
// =====================================
export const createChatHandler = async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "Missing userId" });
    }

    const result = await createChat(userId);
    res.json(result);

  } catch (err) {
    console.error("❌ createChat error:", err);
    res.status(500).json({ error: "Failed to create chat" });
  }
};

// =====================================
// ✅ List Chats
// =====================================
export const listChatsHandler = async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: "Missing userId" });
    }

    const chats = await getChats(userId);
    res.json(chats);

  } catch (err) {
    console.error("❌ listChats error:", err);
    res.status(500).json({ error: "Failed to fetch chats" });
  }
};

// =====================================
// ✅ Get Messages
// =====================================
export const getChatMessagesHandler = async (req, res) => {
  try {
    const { chatId } = req.params;

    const messages = await getChatMessages(chatId);
    res.json({ messages });

  } catch (err) {
    console.error("❌ getChatMessages error:", err);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
};

// =====================================
// 🚀 Send Message (LLM via llama-server)
// =====================================
export const sendMessageHandler = async (req, res) => {
  let filePaths = [];

  try {
    const { chatId, message } = req.body;
    const files = req.files || [];

    if (!chatId || (!message && files.length === 0)) {
      return res.status(400).json({ error: "Message or files required" });
    }

    let fileContents = [];
    let fileDescriptions = [];

    // 📎 FILE PROCESSING
    for (const file of files) {
      filePaths.push(file.path);

      try {
        if (file.mimetype === "application/pdf") {
          const text = await extractTextFromPDF(file.path);

          if (text?.trim()) {
            fileContents.push(`PDF:\n${text.substring(0, 5000)}`);
            await storeDocument({ text, doc_id: file.filename });
            fileDescriptions.push(`📄 ${file.originalname}`);
          }

        } else if (file.mimetype.startsWith("image")) {
          const buffer = await fs.readFile(file.path);
          const base64 = buffer.toString("base64");
          fileContents.push(`Image base64:\n${base64.substring(0, 1000)}`);
          fileDescriptions.push(`🖼 ${file.originalname}`);

        } else {
          const buffer = await fs.readFile(file.path);
          fileContents.push(buffer.toString("utf-8").substring(0, 3000));
          fileDescriptions.push(`📁 ${file.originalname}`);
        }

      } catch (err) {
        console.error("❌ File error:", err);
      }
    }

    // 🧠 PROMPT
    const finalPrompt = `
USER QUESTION:
${message || "Explain the uploaded file"}

FILES:
${fileDescriptions.join(", ")}

CONTENT:
${fileContents.join("\n\n")}
`;

    await addMessage(chatId, "user", message || "📎 File uploaded");
    const history = await getChatMessages(chatId);

    // 📚 RAG (VECTOR SEARCH)
    let chunks = [];
    if (message) {
      chunks = await queryChroma({ prompt: message });
    }

    // 🚀 CALL LOCAL LLM (llama-server)
    const llmResult = await handleLLMAnswer({
      prompt: finalPrompt,
      chunks,
      user_id: "anon",
      history,
    });

    await addMessage(chatId, "assistant", llmResult.answer);
    const updatedMessages = await getChatMessages(chatId);

    return res.json({
      chatId,
      messages: updatedMessages,
      context: chunks,
      source: "llama-server",   // ✅ updated source
    });

  } catch (err) {
    console.error("❌ sendMessage error:", err);
    res.status(500).json({ error: "Failed" });

  } finally {
    for (const p of filePaths) {
      try { await fs.unlink(p); } catch {}
    }
  }
};


