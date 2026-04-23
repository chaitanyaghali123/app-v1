// controllers/profile.controller.js

import { getUserSubscriptionStatus } from "../services/db.service.js";

export async function getProfile(req, res) {
  try {
    // Assuming you have userId available from auth middleware
    const userId = req.user?.id;
    const email = req.user?.email;

    if (!userId || !email) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // ✅ Fetch subscription status
    const isSubscribed = await getUserSubscriptionStatus(userId);

    res.json({
      email,
      is_subscribed: isSubscribed
    });
  } catch (err) {
    console.error("❌ getProfile error:", err.message);
    res.status(500).json({ error: "Failed to fetch profile" });
  }
}
