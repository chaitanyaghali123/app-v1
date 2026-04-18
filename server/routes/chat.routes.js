import express from "express";
import {
  createChatHandler,
  sendMessageHandler,
  listChatsHandler,
  getChatMessagesHandler
} from "../controllers/chat.controller.js";

const router = express.Router();

// ✅ Create new chat
router.post("/create", createChatHandler);

// ✅ Send message
router.post("/message", sendMessageHandler);

// ✅ List chats
router.get("/list", listChatsHandler);

// ✅ Get messages of a chat
router.get("/:chatId", getChatMessagesHandler);

export default router;