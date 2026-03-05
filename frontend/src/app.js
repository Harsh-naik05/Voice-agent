socket.on("tts-audio", (audioBuffer) => {
  const blob = new Blob([audioBuffer], { type: "audio/mp3" });
  const url = URL.createObjectURL(blob);

  const audio = new Audio(url);
  audio.play();
});