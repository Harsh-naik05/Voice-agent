import { useRef, useState } from "react";

// Basic audio recorder component using MediaRecorder API
export default function AudioRecorder() {
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);

  // Start recording and capture audio chunks
  const startRecording = async () => {
   
    // Request microphone access
    try {

      // Get audio stream from the user's microphone 
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Initialize MediaRecorder with the audio stream
      mediaRecorderRef.current = new MediaRecorder(stream);

      // Reset audio chunks for new recording
      audioChunksRef.current = [];

      // Collect audio data chunks as they become available
      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      // When recording stops, create a Blob from the collected audio chunks
      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(audioChunksRef.current, {
          type: "audio/webm",
        });
        setAudioBlob(blob);
      };

      // Start recording
      mediaRecorderRef.current.start();
      setIsRecording(true);
    }catch (err) {
      console.error("Microphone access denied:", err); //handle error
    }
  };

  // Stop recording and create audio blob
  const stopRecording = () => {
    mediaRecorderRef.current.stop();
    setIsRecording(false);
  };
  // Render the UI
  return (
    <div style={{ padding: 20 }}>
      <h2>🎤 VoiceGate – Audio Recorder</h2>

      {!isRecording ? (
        <button onClick={startRecording}>🎙️Start Recording</button>
      ) : (
        <button onClick={stopRecording}>🛑Stop Recording</button>
      )}
      {audioBlob && (
        <div style={{ marginTop: 20 }}>
          <h4>Recorded Audio:</h4>
          <audio controls src={URL.createObjectURL(audioBlob)} />
        </div>
      )}
    </div>
  );
}