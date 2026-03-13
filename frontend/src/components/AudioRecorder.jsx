
import { io } from "socket.io-client";
import { useRef, useState, useEffect } from "react";


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
  

  useEffect(() => {
    // connect to socket
    socketRef.current = io("http://localhost:3000");

    socketRef.current.on("connect", () => {
      console.log("🟢 Frontend connected:", socketRef.current.id);
    });

    // 🔊 RECEIVE AI VOICE FROM BACKEND
    socketRef.current.on("tts_audio", (audioBuffer) => {
      const blob = new Blob([audioBuffer], { type: "audio/mp3" });
      const url = URL.createObjectURL(blob);

      const audio = new Audio(url);
      audio.play();
    });    

    return () => socketRef.current.disconnect();
  }, []);

  const startRecording = async () => {
    try {
      // 1. Get a fresh stream every time
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Set up audio context and analyser for visualization
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();

      analyser.fftSize = 1024;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      visualize();

      streamRef.current = stream;

      // 2. Create a fresh MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm",
      });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      // 3. Handle data - REMOVED ASYNC/AWAIT TO FIX RACE CONDITION
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          
          // Send the Blob directly! Socket.io will convert it to Buffer on backend.
          // This ensures the data is queued to send BEFORE 'onstop' fires.
          socketRef.current.emit("audio_chunk", event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        setAudioBlob(blob);

        // This will now definitely arrive AFTER the last chunk
        socketRef.current.emit("audio_end");

        // Stop the microphone stream to release the hardware
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
        }
      };

      // Start recording with 250ms chunks
      mediaRecorder.start(250);
      setIsRecording(true);

    } catch (err) {
      console.error("Error accessing microphone:", err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // VISUALIZATION FUNCTION
  const visualize = () => {

    
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;

    if (!canvas || !analyser) return;

    const canvasCtx = canvas.getContext("2d");

    const bufferLength = analyser.frequencyBinCount;

    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {

      requestAnimationFrame(draw);

      analyser.getByteTimeDomainData(dataArray);

      canvasCtx.fillStyle = "#0f172a";
      canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

      canvasCtx.lineWidth = 3;
      canvasCtx.strokeStyle = "#22c55e";

      canvasCtx.shadowBlur = 20;
      canvasCtx.shadowColor = "#22c55e";

      canvasCtx.beginPath();

      const sliceWidth = canvas.width / bufferLength;

      let x = 0;

      for (let i = 0; i < bufferLength; i++) {

        const v = dataArray[i] / 128.0;
        const y = (v * canvas.height) / 2;

        if (i === 0) {
          canvasCtx.moveTo(x, y);
        } else {
          canvasCtx.lineTo(x, y);
        }

        x += sliceWidth;

      }

      canvasCtx.lineTo(canvas.width, canvas.height / 2);

      canvasCtx.stroke();

    };

    draw();

  };

  return (
    <div style={{ padding: 20 }}>
      <h2>🎤🤖 Voiceagent - AI</h2>

      
      {!isRecording ? (
        <button onClick={startRecording} className="btn1">🎙️ Start Recording</button>
      ) : (
        <button onClick={stopRecording} className="btn2">🛑 Stop Recording</button>
      )}

      <div style={{ marginTop: 40 }}>

        <canvas
          ref={canvasRef}
          width={600}
          height={200}
          style={{
            borderRadius: 20,
            background: "#0f172a"
          }}
        />

      </div>

      {audioBlob && (
        <div style={{ marginTop: 20 }}>
          <audio controls src={URL.createObjectURL(audioBlob)} />
        </div>
      )}

      
    </div>
  );
}



/*
import { io } from "socket.io-client";
import { useRef, useState, useEffect } from "react";

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

  useEffect(() => {

    socketRef.current = io("http://localhost:3000");

    socketRef.current.on("connect", () => {
      console.log("🟢 Connected:", socketRef.current.id);
    });

    socketRef.current.on("tts_audio", (audioBuffer) => {

      const blob = new Blob([audioBuffer], { type: "audio/mp3" });
      const url = URL.createObjectURL(blob);

      const audio = new Audio(url);
      audio.play();

    });

    return () => socketRef.current.disconnect();

  }, []);

  const startRecording = async () => {

    try {

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();

      analyser.fftSize = 1024;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      visualize();

      streamRef.current = stream;

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

        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });

        setAudioBlob(blob);

        socketRef.current.emit("audio_end");

        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
        }

      };

      mediaRecorder.start(250);

      setIsRecording(true);

    } catch (err) {

      console.error("Mic error:", err);

    }
  };

  const stopRecording = () => {

    if (mediaRecorderRef.current && isRecording) {

      mediaRecorderRef.current.stop();

      setIsRecording(false);

    }

  };

  const visualize = () => {

    const canvas = canvasRef.current;
    const analyser = analyserRef.current;

    if (!canvas || !analyser) return;

    const canvasCtx = canvas.getContext("2d");

    const bufferLength = analyser.frequencyBinCount;

    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {

      requestAnimationFrame(draw);

      analyser.getByteTimeDomainData(dataArray);

      canvasCtx.fillStyle = "#0f172a";
      canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

      canvasCtx.lineWidth = 3;
      canvasCtx.strokeStyle = "#22c55e";

      canvasCtx.shadowBlur = 20;
      canvasCtx.shadowColor = "#22c55e";

      canvasCtx.beginPath();

      const sliceWidth = canvas.width / bufferLength;

      let x = 0;

      for (let i = 0; i < bufferLength; i++) {

        const v = dataArray[i] / 128.0;
        const y = (v * canvas.height) / 2;

        if (i === 0) {
          canvasCtx.moveTo(x, y);
        } else {
          canvasCtx.lineTo(x, y);
        }

        x += sliceWidth;

      }

      canvasCtx.lineTo(canvas.width, canvas.height / 2);

      canvasCtx.stroke();

    };

    draw();

  };

  return (

    <div
      style={{
        padding: 40,
        textAlign: "center",
        background: "#020617",
        minHeight: "100vh",
        color: "white",
        fontFamily: "sans-serif"
      }}
    >

      <h1>🤖 AI Voice Agent</h1>

      <p>Talk with your AI assistant</p>

      {!isRecording ? (

        <button
          onClick={startRecording}
          style={{
            padding: "14px 30px",
            fontSize: 18,
            background: "#22c55e",
            border: "none",
            borderRadius: 10,
            color: "white",
            cursor: "pointer"
          }}
        >
          🎙 Start Talking
        </button>

      ) : (

        <button
          onClick={stopRecording}
          style={{
            padding: "14px 30px",
            fontSize: 18,
            background: "#ef4444",
            border: "none",
            borderRadius: 10,
            color: "white",
            cursor: "pointer"
          }}
        >
          🛑 Stop
        </button>

      )}

      <div style={{ marginTop: 40 }}>

        <canvas
          ref={canvasRef}
          width={600}
          height={200}
          style={{
            borderRadius: 20,
            background: "#0f172a"
          }}
        />

      </div>

      {audioBlob && (

        <div style={{ marginTop: 30 }}>

          <audio controls src={URL.createObjectURL(audioBlob)} />

        </div>

      )}

    </div>

  );

}


*/