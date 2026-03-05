import { io } from "socket.io-client";
import { useRef, useState, useEffect } from "react";

export default function AudioRecorder() {
  const socketRef = useRef(null);
  const mediaRecorderRef = useRef(null);
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

    return () => socketRef.current.disconnect();
  }, []);

  const startRecording = async () => {
    try {
      // 1. Get a fresh stream every time
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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

  return (
    <div style={{ padding: 20 }}>
      <h2>🎤 VoiceGate – Audio Recorder</h2>

      {!isRecording ? (
        <button onClick={startRecording}>🎙️ Start Recording</button>
      ) : (
        <button onClick={stopRecording}>🛑 Stop Recording</button>
      )}

      {audioBlob && (
        <div style={{ marginTop: 20 }}>
          <audio controls src={URL.createObjectURL(audioBlob)} />
        </div>
      )}
    </div>
  );
}