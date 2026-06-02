import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import Groq from "groq-sdk";
import mongoose from "mongoose";

dotenv.config();

/* ---------------- GROQ ---------------- */
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

/* ---------------- MONGODB ---------------- */
mongoose.connect(process.env.MONGO_URI);

mongoose.connection.on("connected", () => {
  console.log("🟢 MongoDB connected");
});

mongoose.connection.on("error", (err) => {
  console.error("❌ MongoDB error:", err);
});

/* ---------------- SCHEMA ---------------- */
const Conversation = mongoose.model(
  "Conversation",
  new mongoose.Schema({
    userText: String,
    aiResponse: String,
    createdAt: { type: Date, default: Date.now },
  })
);

/* ---------------- BASIC ---------------- */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PYTHON_PATH = path.join(__dirname, ".venv", "Scripts", "python.exe");

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "http://localhost:5173" },
});

/* ---------------- LLM ---------------- */
async function generateLLM(prompt) {
  try {
    const completion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: "You are a helpful voice assistant." },
        { role: "user", content: prompt },
      ],
      model: "llama-3.3-70b-versatile",
      temperature: 0.7,
      max_tokens: 250,
    });

    return completion.choices[0]?.message?.content || "No response";
  } catch (err) {
    console.error("❌ GROQ ERROR:", err.message);
    return "Sorry, I could not respond right now.";
  }
}

/* ---------------- SOCKET ---------------- */
io.on("connection", (socket) => {
  console.log("✅ Client connected:", socket.id);

  let audioChunks = [];
  let fullText = "";
  socket.llmBusy = false;
  socket.llmTimer = null;

  socket.on("audio_chunk", (chunk) => {
    audioChunks.push(Buffer.from(chunk));
  });

  socket.on("audio_end", () => {
    const audioBuffer = Buffer.concat(audioChunks);
    audioChunks = [];

    if (!audioBuffer || audioBuffer.length < 8000) {
      console.log("⚠️ Audio too short");
      return;
    }

    const wavPath = path.join(
      __dirname,
      `recording-${socket.id}-${Date.now()}.wav`
    );

    const ffmpeg = spawn("ffmpeg", [
      "-y",
      "-i", "pipe:0",
      "-ar", "16000",
      "-ac", "1",
      "-acodec", "pcm_s16le",
      wavPath,
    ]);

    ffmpeg.on("error", (err) => {
      console.error("❌ FFmpeg error:", err);
    });

    ffmpeg.stdin.write(audioBuffer);
    ffmpeg.stdin.end();

    ffmpeg.on("close", async () => {
      if (!fs.existsSync(wavPath)) {
        console.error("❌ WAV not created");
        return;
      }

      console.log("🎧 WAV ready");

      const stt = spawn(PYTHON_PATH, ["stt_stream.py", wavPath]);

      stt.stdout.on("data", (data) => {
        const textChunk = data.toString().trim();
        if (!textChunk || textChunk === "STT started") return;

        console.log("📝 STT:", textChunk);

        fullText += " " + textChunk;

        // Send complete sentence to frontend
        socket.emit("stt_chunk", fullText.trim());

        clearTimeout(socket.llmTimer);

        socket.llmTimer = setTimeout(async () => {
          if (socket.llmBusy) return;

          if (!fullText.trim() || fullText.length < 3) {
            console.log("⚠️ Ignoring empty input");
            return;
          }

          socket.llmBusy = true;

          try {
            const replyText = await generateLLM(fullText);

            //let reply = replyText.slice(0, 500);
            let reply = replyText;
            if (!reply.trim()) reply = "Hello! How can I help you?";

            console.log("🤖 AI:", reply);

            socket.emit("llm_response", reply);

            // ✅ Save to DB
            await Conversation.create({
              userText: fullText,
              aiResponse: reply,
            });

            // ✅ TTS
            const tts = spawn(PYTHON_PATH, ["tts.py", reply]);

            tts.stdout.on("data", (data) => {
              const audioFile = data.toString().trim();
              const audioPath = path.join(__dirname, audioFile);

              if (!fs.existsSync(audioPath)) return;

              const audioBuffer = fs.readFileSync(audioPath);
              socket.emit("tts_audio", audioBuffer);

              fs.unlinkSync(audioPath);
            });

            tts.stderr.on("data", (d) => {
              console.error("❌ TTS error:", d.toString());
            });

          } catch (err) {
            console.error("❌ LLM ERROR:", err);
          } finally {
            fullText = "";
            socket.llmBusy = false;
          }
        }, 2500);
      });

      stt.stderr.on("data", (d) => {
        console.error("❌ STT ERROR:", d.toString());
      });

      stt.on("close", () => {
        if (fs.existsSync(wavPath)) {
          try {
            fs.unlinkSync(wavPath);
          } catch {}
        }
      });
    });
  });

  socket.on("disconnect", () => {
    console.log("❌ Client disconnected:", socket.id);

    if (socket.llmTimer) {
      clearTimeout(socket.llmTimer);
    }
  });
});

/* ---------------- START ---------------- */
server.listen(3000, () => {
  console.log("🚀 Server running on http://localhost:3000");
});

/* ---------------- GLOBAL ERROR HANDLER ---------------- */
process.on("uncaughtException", (err) => {
  console.error("🔥 Uncaught Error:", err);
});

process.on("unhandledRejection", (err) => {
  console.error("🔥 Promise Error:", err);
});
