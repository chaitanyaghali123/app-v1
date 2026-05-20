// chat.routes.js

import express from "express";
import {
  createChatHandler,
  sendMessageHandler,
  listChatsHandler,
  getChatMessagesHandler
} from "../controllers/chat.controller.js";

// ✅ IMPORT THIS
import { upload } from "../middleware/upload.middleware.js";

const router = express.Router();

// ✅ Create new chat
router.post("/create", createChatHandler);

// 🔥 ✅ UPDATED: add upload middleware here
router.post("/message", upload.array("files"), sendMessageHandler);

// ✅ List chats
router.get("/list", listChatsHandler);

// ✅ Get messages of a chat
router.get("/:chatId", getChatMessagesHandler);

export default router;
