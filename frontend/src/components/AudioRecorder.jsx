import { io } from "socket.io-client";
import { useRef, useState, useEffect } from "react";
import "./AudioRecorder2.css";

export default function AudioRecorder() {
  const socketRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const canvasRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const streamRef = useRef(null);
  const audioChunksRef = useRef([]);

  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);

  // Prompt & Response States
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState("");

  useEffect(() => {
    socketRef.current = io("http://localhost:3000");

    socketRef.current.on("connect", () => {
      console.log("🟢 Frontend connected:", socketRef.current.id);
    });

    socketRef.current.on("tts_audio", (audioBuffer) => {
      const blob = new Blob([audioBuffer], { type: "audio/mp3" });
      const url = URL.createObjectURL(blob);

      new Audio(url).play();
    });

    socketRef.current.onAny((event, data) => {
        console.log("EVENT:", event);
        console.log("DATA:", data);
    });

    // STT from backend
    socketRef.current.on("stt_chunk", (text) => {
        console.log("STT:", text);
        setPrompt(text);
    });

    // AI response from backend
    socketRef.current.on("llm_response", (text) => {
        console.log("AI:", text);
        setResponse(text);
    });



    return () => socketRef.current.disconnect();
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });

      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      streamRef.current = stream;

      visualize();

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm",
      });

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          socketRef.current.emit("audio_chunk", event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, {
          type: "audio/webm",
        });

        setAudioBlob(blob);

        socketRef.current.emit("audio_end");

        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
        }
      };

      mediaRecorder.start(250);

      setPrompt("Listening...");
      setResponse("");

      setIsRecording(true);
    } catch (err) {
      console.error("Mic error:", err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();

      setResponse("Generating AI response...");

      setIsRecording(false);
    }
  };

  const visualize = () => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;

    if (!canvas || !analyser) return;

    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;

    const centerX = width / 2;
    const centerY = height / 2;

    const radius = Math.min(width, height) * 0.35;

    const bufferLength = analyser.frequencyBinCount;
    const freqArray = new Uint8Array(bufferLength);

    let angle = 0;

    const draw = () => {
      requestAnimationFrame(draw);

      analyser.getByteFrequencyData(freqArray);

      ctx.clearRect(0, 0, width, height);

      // Radar Rings
      for (let r = 1; r <= 3; r++) {
        ctx.beginPath();
        ctx.arc(
          centerX,
          centerY,
          radius * (0.6 + r * 0.15),
          0,
          Math.PI * 2
        );
        ctx.strokeStyle = `rgba(34, 197, 94, ${0.1 + r * 0.05})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Frequency Bars
      const barCount = 64;
      const step = Math.floor(bufferLength / barCount);
      const angleStep = (Math.PI * 2) / barCount;

      for (let i = 0; i < barCount; i++) {
        const freqIndex = i * step;

        const amplitude = freqArray[freqIndex] / 255;
        const barHeight = radius * 0.5 * amplitude;

        const startRadius = radius * 0.6;
        const endRadius = startRadius + barHeight;

        const rad = i * angleStep + angle * 0.2;

        const x1 = centerX + Math.cos(rad) * startRadius;
        const y1 = centerY + Math.sin(rad) * startRadius;

        const x2 = centerX + Math.cos(rad) * endRadius;
        const y2 = centerY + Math.sin(rad) * endRadius;

        const gradient = ctx.createLinearGradient(x1, y1, x2, y2);

        gradient.addColorStop(0, "#22c55e");
        gradient.addColorStop(1, "#a3e635");

        ctx.beginPath();
        ctx.lineWidth = 4;
        ctx.strokeStyle = gradient;
        ctx.shadowBlur = 12;
        ctx.shadowColor = "#22c55e";

        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      // Center Orb
      const avgVolume =
        freqArray.reduce((a, b) => a + b, 0) / freqArray.length;

      const pulseScale = 0.8 + (avgVolume / 255) * 0.5;

      ctx.beginPath();
      ctx.arc(
        centerX,
        centerY,
        radius * 0.25 * pulseScale,
        0,
        Math.PI * 2
      );

      ctx.fillStyle = "#22c55e";
      ctx.shadowBlur = 30;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(centerX, centerY, radius * 0.15, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();

      // Particles
      const particleCount = 36;

      for (let p = 0; p < particleCount; p++) {
        const particleAngle =
          angle + (p / particleCount) * Math.PI * 2;

        const radDist = radius * 0.85;

        const x =
          centerX + Math.cos(particleAngle) * radDist;

        const y =
          centerY + Math.sin(particleAngle) * radDist;

        ctx.beginPath();
        ctx.arc(
          x,
          y,
          2 + Math.sin(angle * 5 + p) * 1.5,
          0,
          Math.PI * 2
        );

        ctx.fillStyle = `rgba(34,197,94,${
          0.5 + Math.sin(angle * 10) * 0.3
        })`;

        ctx.fill();
      }

      angle += 0.02;
    };

    draw();
  };

  return (
    <div className="app">
      <nav className="navbar">
        <div className="logo">
          <span style={{ color: "#39ff14" }}>AI</span> VOICE AGENTS
        </div>
      </nav>

      <div className="hero">
        <div className="hero-content">

          {/* LEFT */}
          <div className="left-section">
            <h1 className="left">
              <span style={{ color: "#39ff14" }}>AI</span>
              <span>-VOICE</span>
              <br />
              AGENTS
            </h1>
          </div>

          {/* CENTER */}
          <div className="center">
            <canvas
              ref={canvasRef}
              width={500}
              height={500}
              className="radial-canvas"
            />

            {!isRecording ? (
              <button
                onClick={startRecording}
                className="mic-btn"
              >
                🎤
              </button>
            ) : (
              <button
                onClick={stopRecording}
                className="mic-btn stop"
              >
                🔴
              </button>
            )}

            <p className="status">
              {isRecording
                ? "LISTENING..."
                : "CLICK TO TALK"}
            </p>
          </div>

          {/* RIGHT PANEL */}
          <div className="right-panel">

            <div className="chat-card prompt-card">
              <h3>🎤 USER PROMPT</h3>

              <div className="card-content">
                {prompt ||
                  "Waiting for user voice input..."}
              </div>
            </div>

            <div className="chat-card response-card">
              <h3>🤖 AI RESPONSE</h3>

              <div className="card-content">
                {response ||
                  "AI response will appear here..."}
              </div>
            </div>

          </div>

        </div>
      </div>

      {audioBlob && (
        <div className="audio-player">
          <audio
            controls
            src={URL.createObjectURL(audioBlob)}
          />
        </div>
      )}
    </div>
  );
}
