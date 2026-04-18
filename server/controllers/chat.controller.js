import {
  createChat,
  getChats,
  getChatMessages,
  addMessage,
  updateChatTitle
} from "../services/db.service.js";

import { queryChroma } from "../services/vector.service.js";
import { handleLLMAnswer } from "../services/llm-response-handler.js";

// =====================================
// ✅ Create Chat
// =====================================
export const createChatHandler = async (req, res) => {
  try {
    const { userId, subjectId } = req.body;

    if (!userId || !subjectId) {
      return res.status(400).json({ error: "Missing userId or subjectId" });
    }

    const result = await createChat(userId, subjectId);

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
// ✅ Get Chat Messages
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
// ✅ Send Message (CORE LOGIC)
// =====================================
export const sendMessageHandler = async (req, res) => {
  try {
    const { chatId, message, subjectId } = req.body;

    if (!chatId || !message) {
      return res.status(400).json({ error: "Missing chatId or message" });
    }

    // 1️⃣ Save user message
    await addMessage(chatId, "user", message);

    // 2️⃣ Get full chat history
    const history = await getChatMessages(chatId);

    // 3️⃣ Retrieve context from vector DB
    const chunks = await queryChroma({
      prompt: message,
      subject_id: subjectId || "General"
    });

    // 4️⃣ Generate answer (LLM)
    const llmResult = await handleLLMAnswer({
      prompt: message,
      chunks,
      subject_id: subjectId || "General",
      user_id: "anon",
      history // 🔥 THIS ENABLES CHAT CONTEXT
    });

    // 5️⃣ Save assistant response (only the HTML string)
    await addMessage(chatId, "assistant", llmResult.answer);

    // 6️⃣ Update chat title (first message only)
    if (history.length === 1) {
      await updateChatTitle(chatId, message);
    }

    // 7️⃣ Return full updated conversation
    const updatedMessages = await getChatMessages(chatId);

    res.json({
      chatId,
      messages: updatedMessages,
      citations: llmResult.citations, // optional: include citations separately
      context_source: llmResult.context_source,
      tokensUsed: llmResult.tokensUsed
    });

  } catch (err) {
    console.error("❌ sendMessage error:", err);
    res.status(500).json({ error: "Failed to process message" });
  }
};
