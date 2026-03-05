

                                    /* ---------------- WEEK 2: BACKEND STT STREAMING ---------------- */


import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import dotenv from "dotenv";
import { fileURLToPath } from "url";                       /*-----ES modules don’t support _dirname directly----*/
import { GoogleGenerativeAI } from "@google/generative-ai"; /*---send STT text to the LLM---*/

dotenv.config();

/* ---------------- BASIC SETUP ---------------- */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);          /*-Recreates __dirname so files (WAV, Python scripts) can be accessed reliably.--*/

const PYTHON_PATH = path.join(__dirname, ".venv", "Scripts", "python.exe");

const app = express();
app.use(cors());                                    /*---create express app---*/

const server = http.createServer(app);              /*----Wraps Express in an HTTP server so Socket.IO can attach to it.--*/

const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"],
  },                                                 /*---Creates Socket.IO server for voice intake---*/                                      
});

/* ---------------- LLM (GEMINI) SETUP ---------------- */
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: "gemini-2.5-flash",
});

/* ---------------- SOCKET (WEEK 2 CORE) ---------------- */
io.on("connection", (socket) => {
  console.log("✅ Client connected:", socket.id);

  let audioChunks = [];                                 /*---stores streamed audio data---*/
  let llmBusy = false;                                  /*---prevents overlapping LLM calls---*/

  // 1️⃣ Receive streamed audio
  socket.on("audio_chunk", (arrayBuffer) => {
    audioChunks.push(Buffer.from(arrayBuffer));
  });                                                   /*----Receives live microphone chunks---*/

  // 2️⃣ Audio stream ends
  socket.on("audio_end", () => {
    const audioBuffer = Buffer.concat(audioChunks);
    audioChunks = [];                                  /*---Combines all chunks into one continuous audio stream---*/

    if (audioBuffer.length < 8000) {
      console.warn("⚠️ Audio too short");
      return;
    }

    const wavPath = path.join(
      __dirname,
      `recording-${socket.id}-${Date.now()}.wav`
    );                                                  /*---Defines / cretes path for temporary WAV file---*/

    // 3️⃣ Convert raw audio → WAV (FFmpeg Stt) 
    const ffmpeg = spawn("ffmpeg", [
      "-y",
      "-i", "pipe:0",
      "-ar", "16000",
      "-ac", "1",
      "-acodec", "pcm_s16le",
      wavPath,
    ]);                                             /*---Converts streamed audio into: 16kHz, Mono ,PCM WAV---*/

    ffmpeg.stdin.write(audioBuffer);
    ffmpeg.stdin.end();

    ffmpeg.on("close", () => {
      if (!fs.existsSync(wavPath)) return;       /*---Safety check before processing.--*/

      // 4️⃣ Speech-to-Text (Python Whisper)
      const stt = spawn(PYTHON_PATH, ["stt_stream.py", wavPath]);

      stt.stdout.on("data", async (data) => {
        const textChunk = data.toString().trim();
        if (!textChunk) return;

        console.log("📝 STT:", textChunk);
        socket.emit("stt_chunk", textChunk);

        // 5️⃣ Send STT text → LLM
        if (llmBusy) return;
        llmBusy = true;

        try {
          const result = await model.generateContent(textChunk);
          const reply = result.response.text();

          console.log("🤖 LLM:", reply);
          socket.emit("llm_response", reply);
        } catch (err) {
          console.error("LLM error:", err.message);
        } finally {
          setTimeout(() => (llmBusy = false), 1000);
        }                                                    /*---Cooldown before next LLM request--*/
      });

      stt.on("close", () => {
        if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath);   //Deletes temporary WAV file to save disk space.
      });
    });
  });

  socket.on("disconnect", () => {
    console.log("❌ Client disconnected:", socket.id);
  });
});

/* ---------------- START ---------------- */
server.listen(3000, () => {
  console.log("🚀 Week 2 server running on http://localhost:3000");
});
































                                    /*--------------Frontend: AudioRecorder.jsx------------------*/



/* ---------------- WEEK 2: SOCKET CONNECTION ---------------- */
  useEffect(() => {                                                    /*------Managing External Systems outside of React------*/ 
    socketRef.current = io("http://localhost:3000");

    socketRef.current.on("connect", () => {
      console.log("🟢 Connected to STT backend:", socketRef.current.id);
    });

    return () => socketRef.current.disconnect();                      /*------Cleanup function to disconnect socket-------*/
  }, []);

/* ---------------- WEEK 2: STREAM MIC → STT ---------------- */
  const startStreaming = async () => {                                /*-------Starts microphone capture-------*/
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });    /*Requests microphone access and gets audio stream for stt*/


    streamRef.current = stream;                                     /*-------Store stream ref to stop later-------*/

    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: "audio/webm",
    });                                                              /*-------Converts raw mic stream into audio chunks-------*/
    mediaRecorderRef.current = mediaRecorder;                       /*-------Store /Keeps recorder reference--------*/

    // 🔴 Send live audio chunks to backend STT
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        socketRef.current.emit("audio_chunk", event.data);          /*------Sends audio chunk to backend----*/
      }
    };

    // 🔴 Signal end of audio stream
    mediaRecorder.onstop = () => {
      socketRef.current.emit("audio_end");
      stream.getTracks().forEach((t) => t.stop());                 /*------Stop speaking, Signals end for backend------*/
    };

    // Low-latency chunks
    mediaRecorder.start(250);                     /*------recording starts in 250ms----*/
  };

  const stopStreaming = () => {
    mediaRecorderRef.current?.stop();
  };