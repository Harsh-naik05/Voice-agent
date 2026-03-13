import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

/* ---------------- MONGODB CONNECTION ---------------- */

mongoose.connect(process.env.MONGO_URI);

mongoose.connection.on("connected", () => {
  console.log("🟢 MongoDB connected");
});

mongoose.connection.on("error", (err) => {
  console.error("❌ MongoDB connection error:", err);
});


/* ---------------- CONVERSATION SCHEMA ---------------- */

const conversationSchema = new mongoose.Schema({
  userText: String,
  aiResponse: String,
  createdAt: { type: Date, default: Date.now }
});

const Conversation = mongoose.model("Conversation", conversationSchema);


/* ---------------- SAVE DATA TO DATABASE ---------------- */

async function saveConversation(userText, aiResponse) {
  await Conversation.create({
    userText: userText,
    aiResponse: aiResponse
  });
}