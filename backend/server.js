import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

/* ---------------- BASIC SETUP ---------------- */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PYTHON_PATH = path.join(__dirname, ".venv", "Scripts", "python.exe");
console.log("🐍 Using Python:", PYTHON_PATH);

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"],
  },
});

/* ---------------- GEMINI SETUP ---------------- */
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const model = genAI.getGenerativeModel({
  model: "gemini-2.5-flash",
});

/* ---------------- SOCKET ---------------- */
io.on("connection", (socket) => {
  console.log("✅ Client connected:", socket.id);

  let audioChunks = [];
  socket.llmBusy = false;

  socket.on("audio_chunk", (arrayBuffer) => {
    audioChunks.push(Buffer.from(arrayBuffer));
  });

  socket.on("audio_end", () => {
    console.log("🎙️ Audio recording finished");

    const audioBuffer = Buffer.concat(audioChunks);
    audioChunks = [];

    if (audioBuffer.length < 2000) {
      socket.emit("error", "Audio too short");
      return;
    }

    const wavPath = path.join(
      __dirname,
      `recording-${socket.id}-${Date.now()}.wav`
    );

    /* ---------- FFmpeg ---------- */
    console.log("🎚️ Audio buffer size:", audioBuffer.length);
    if (!audioBuffer || audioBuffer.length < 8000) {
      console.warn("⚠️ Audio too short or empty, skipping");
      return;
    }

    const ffmpeg = spawn("ffmpeg", [
      "-hide_banner",      // 1. Hides the huge version/config text
      "-loglevel", "error", // 2. Hides progress bars and warnings
      "-y",
      "-i", "pipe:0",
      "-ar", "16000",
      "-ac", "1",
      "-acodec", "pcm_s16le",
      wavPath,
    ]);


    let ffmpegErrorLog = "";
    ffmpeg.stderr.on("data", (d) => {
      console.error("FFmpeg error:", d.toString());
    });

    ffmpeg.stdin.write(audioBuffer);
    ffmpeg.stdin.end();
    
    ffmpeg.on("close", async (code) => {
      if (code !== 0) {
        console.error("❌ FFmpeg failed");
        return;
      }

      // ⏳ wait until file really exists (Windows-safe)
      let attempts = 0;
      while (!fs.existsSync(wavPath) && attempts < 10) {
        await new Promise((r) => setTimeout(r, 100));
        attempts++;
      }

      if (!fs.existsSync(wavPath)) {
        console.error("❌ WAV file not found after FFmpeg:", wavPath);
        return;
      }

      console.log("🎧 WAV ready:", wavPath);

      /* ---------- STT ---------- */
      const stt = spawn(PYTHON_PATH, ["stt_stream.py", wavPath]);

      stt.stdout.on("data", async (data) => {
        const textChunk = data.toString().trim();
        if (!textChunk || textChunk === "STT started") return;

        console.log("📝 STT chunk:", textChunk);
        socket.emit("stt_chunk", textChunk);

        if (socket.llmBusy) return;
        socket.llmBusy = true;

        try {
          const result = await model.generateContent(textChunk);
          const reply = result.response.text();

          console.log("🤖 Gemini:", reply);
          socket.emit("llm_response", reply);
        } catch (err) {
          console.error("Gemini error:", err.message);
        } finally {
          setTimeout(() => {
            socket.llmBusy = false;
          }, 1200);
        }
      });

      stt.stderr.on("data", (d) =>
        console.error("STT error:", d.toString())
      );

      stt.on("close", () => {
        if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath);
      });
    });
  });

  socket.on("disconnect", () => {
    console.log("❌ Client disconnected:", socket.id);
  });
});

/* ---------------- START ---------------- */
const PORT = 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});