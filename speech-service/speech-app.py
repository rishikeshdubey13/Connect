from flask import Flask
from dotenv import load_dotenv
import assemblyai as aai
import os

env_path = '../frontend-services/.env'
env_path = os.path.join(os.path.dirname(__file__), '..', 'frontend-services', '.env')

load_dotenv(env_path)

app = Flask(__name__)


@app.route('/')
def index():
    return "Speech Service Running"

aai.settings.api_key = os.getenv('AssemblyAI_API_KEY')
audio_file = "https://assembly.ai/wildfires.mp3"


config = aai.TranscriptionConfig(speech_model=aai.SpeechModel.best)

transcript = aai.Transcriber(config=config).transcribe(audio_file)

if transcript.status == "error":
  raise RuntimeError(f"Transcription failed: {transcript.error}")

print(transcript.text)


if __name__ == '__main__':  
    app.run(host='0.0.0.0', port=5003)