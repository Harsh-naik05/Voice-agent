import sys
from faster_whisper import WhisperModel

def main():
    if len(sys.argv) < 2:
        print("No audio file provided", flush=True)
        sys.exit(1)

    audio_path = sys.argv[1]

    print("STT started", flush=True)

    # ✅ CORRECT constructor (positional argument)
    model = WhisperModel(
        "base",              # ← REQUIRED positional argument
        device="cpu",
        compute_type="int8"
    )

    segments, info = model.transcribe(
        audio_path,
        beam_size=5,
        vad_filter=True,
        language="en"
    )

    for segment in segments:
        text = segment.text.strip()
        if text:
            print(text, flush=True)

if __name__ == "__main__":
    main()