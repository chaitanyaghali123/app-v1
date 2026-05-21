// controllers/chat.controller.js

import {
  createChat,
  getChats,
  getChatMessages,
  addMessage,
} from "../services/db.service.js";

import {
  queryChroma,
  storeDocument,
} from "../services/vector.service.js";

import { extractTextFromPDF } from "../services/pdf.service.js";

import { handleLLMAnswer } from "../services/llm-response-handler.js";

import fs from "fs/promises";

// =====================================
// ✅ CREATE CHAT
// =====================================
export const createChatHandler = async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res
        .status(400)
        .json({ error: "Missing userId" });
    }

    const result = await createChat(userId);

    res.json(result);

  } catch (err) {
    console.error(
      "❌ createChat error:",
      err
    );

    res
      .status(500)
      .json({ error: "Failed to create chat" });
  }
};

// =====================================
// ✅ LIST CHATS
// =====================================
export const listChatsHandler = async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res
        .status(400)
        .json({ error: "Missing userId" });
    }

    const chats = await getChats(userId);

    res.json(chats);

  } catch (err) {
    console.error(
      "❌ listChats error:",
      err
    );

    res
      .status(500)
      .json({ error: "Failed to fetch chats" });
  }
};

// =====================================
// ✅ GET CHAT MESSAGES
// =====================================
export const getChatMessagesHandler = async (
  req,
  res
) => {
  try {
    const { chatId } = req.params;

    const messages =
      await getChatMessages(chatId);

    res.json({ messages });

  } catch (err) {
    console.error(
      "❌ getChatMessages error:",
      err
    );

    res
      .status(500)
      .json({
        error: "Failed to fetch messages",
      });
  }
};

// =====================================
// 🚀 SEND MESSAGE
// =====================================
export const sendMessageHandler = async (
  req,
  res
) => {
  let filePaths = [];

  try {
    const { chatId, message } = req.body;

    const files = req.files || [];

    // =====================================
    // ✅ VALIDATION
    // =====================================
    if (
      !chatId ||
      (!message && files.length === 0)
    ) {
      return res.status(400).json({
        error: "Message or files required",
      });
    }

    let fileContents = [];
    let fileDescriptions = [];

    // =====================================
    // 📎 FILE PROCESSING
    // =====================================
    for (const file of files) {
      filePaths.push(file.path);

      try {
        // =========================
        // 📄 PDF
        // =========================
        if (
          file.mimetype ===
          "application/pdf"
        ) {
          const text =
            await extractTextFromPDF(
              file.path
            );

          if (text?.trim()) {
            // 🔥 Smaller context
            fileContents.push(
              `PDF CONTENT:\n${text.substring(
                0,
                2500
              )}`
            );

            // Store full text in vector DB
            await storeDocument({
              text,
              doc_id: file.filename,
            });

            fileDescriptions.push(
              `📄 ${file.originalname}`
            );
          }

          // =========================
          // 🖼 IMAGE
          // =========================
        } else if (
          file.mimetype.startsWith("image")
        ) {
          // ❌ NO BASE64
          fileContents.push(
            `Image uploaded: ${file.originalname}`
          );

          fileDescriptions.push(
            `🖼 ${file.originalname}`
          );

          // =========================
          // 📁 TEXT FILES
          // =========================
        } else {
          const buffer =
            await fs.readFile(file.path);

          fileContents.push(
            buffer
              .toString("utf-8")
              .substring(0, 2000)
          );

          fileDescriptions.push(
            `📁 ${file.originalname}`
          );
        }

      } catch (err) {
        console.error(
          "❌ File processing error:",
          err
        );
      }
    }

    // =====================================
    // 🧠 FINAL PROMPT
    // =====================================
    const finalPrompt = `
USER QUESTION:
${message || "Explain the uploaded file"}

FILES:
${fileDescriptions.join(", ")}

CONTENT:
${fileContents.join("\n\n")}
`;

    // =====================================
    // 💾 SAVE USER MESSAGE
    // =====================================
    await addMessage(
      chatId,
      "user",
      message || "📎 File uploaded"
    );

    // =====================================
    // 🧠 HISTORY (LIMITED)
    // =====================================
    const rawHistory =
      await getChatMessages(chatId);

    const history = rawHistory
      .slice(-4)
      .map((m) => ({
        role: m.role,
        content: (m.content || "").substring(
          0,
          400
        ),
      }));

    // =====================================
    // 📚 RAG SEARCH
    // =====================================
    let chunks = [];

    if (message?.trim()) {
      try {
        chunks = await queryChroma({
          prompt: message,
        });

        console.log(
          `📚 Retrieved chunks: ${chunks.length}`
        );

      } catch (err) {
        console.error(
          "❌ Chroma query failed:",
          err
        );
      }
    }

    // =====================================
    // 🚀 CALL LLAMA SERVER
    // =====================================
    const llmResult =
      await handleLLMAnswer({
        prompt: finalPrompt,
        chunks,
        user_id: "anon",
        history,
      });

    // =====================================
    // 💾 SAVE ASSISTANT MESSAGE
    // =====================================
    await addMessage(
      chatId,
      "assistant",
      llmResult.answer
    );

    // =====================================
    // 📜 UPDATED CHAT
    // =====================================
    const updatedMessages =
      await getChatMessages(chatId);

    // =====================================
    // ✅ RESPONSE
    // =====================================
    return res.json({
      chatId,

      messages: updatedMessages,

      context: chunks,

      source: "llama-server",

      provider:
        llmResult.provider ||
        "llama-server",

      tokensUsed:
        llmResult.tokensUsed || 0,
    });

  } catch (err) {
    console.error(
      "❌ sendMessage error:",
      err
    );

    res.status(500).json({
      error: "Failed to process message",
    });

  } finally {
    // =====================================
    // 🧹 CLEAN TEMP FILES
    // =====================================
    for (const p of filePaths) {
      try {
        await fs.unlink(p);
      } catch {}
    }
  }
};