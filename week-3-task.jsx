/* ---------------- WEEK 3 : TTS PLAYBACK PIPELINE ---------------- */

// 🔊 Convert AI response to speech using Python TTS
const tts = spawn(PYTHON_PATH, ["tts.py", reply]);

tts.stdout.on("data", (data) => {

  // Python script returns generated audio filename
  const audioFile = data.toString().trim();

  // Create full path of generated audio
  const audioPath = path.join(__dirname, audioFile);

  // Read the generated audio file
  const audioBuffer = fs.readFileSync(audioPath);

  // Send audio to frontend (browser speaker)
  socket.emit("tts_audio", audioBuffer);

  // Delete the temporary audio file
  fs.unlinkSync(audioPath);
});

// Error handling
tts.stderr.on("data", (d) => {
  console.error("TTS error:", d.toString());
});










/*
What This Week 3 Code Does

1️⃣ Receives AI text response.

2️⃣ Runs Python TTS engine.

spawn(PYTHON_PATH, ["tts.py", reply]);

Python script converts text → speech.

3️⃣ Python generates an audio file

Example output:

speech_123.wav

4️⃣ Node.js reads the audio

fs.readFileSync(audioPath);

5️⃣ Audio sent to frontend via Socket

socket.emit("tts_audio", audioBuffer);

The browser receives it and plays through the speaker.

6️⃣ Temporary file removed

fs.unlinkSync(audioPath);

This prevents storage from filling up.

*/