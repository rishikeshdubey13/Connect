from flask import Flask
from flask_socketio import SocketIO, emit
from flask_cors import CORS
from dotenv import load_dotenv
from deep_translator import GoogleTranslator
import os


# env_path = os.path.join(os.path.dirname(__file__), '..', 'frontend-services','.env')
# load_dotenv(env_path)

app = Flask(__name__)
CORS(app)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY')
socketio = SocketIO(app, cors_allowed_origins= '*')

# @app.route('/')
# def index():
#     return 'Translation service is running!'

# def mock_translate(text, target_lang):
#     return f"[{target_lang}] {text}"
def translate_text(text, target_lang):
    try:
        translator = GoogleTranslator(source= 'auto', target = target_lang)
        translated_text = translator.translate(text)
        return translated_text
    except Exception as e:
        print(f"Translation erorr: {e}")
        return f"Translation Failed: {str(e)} "


socketio.on('translate')
def handle_translation(data):
    text = data.get("text")
    target_lang =data.get("target_lang")
    if not text or not target_lang:
        emit("translated", {"error": 'Missing text or target_lang'})
        return 
    translated = translate_text(text, target_lang)
    emit("translated", {"translated": translated, "lang": target_lang})



if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5004)

