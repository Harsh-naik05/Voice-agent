from gtts import gTTS
import sys
import uuid

text = sys.argv[1]

if not text.strip():
    print("EMPTY")
    sys.exit()

output_file = f"response_{uuid.uuid4().hex}.mp3"

tts = gTTS(text)
tts.save(output_file)

print(output_file)