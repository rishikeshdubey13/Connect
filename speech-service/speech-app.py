from flask import Flask, request, jsonify
from flask_socketio import SocketIO
from flask_sqlalchemy import SQLAlchemy
from vosk import Model, KaldiRecognizer
import assemblyai as aai
import openai
import os
from datetime import datetime
import psycopg2
import sys
import time
import json
import numpy as np

from dotenv import load_dotenv
from urllib.parse import quote

time.sleep(15)

env_path = '../frontend-services/.env'
env_path = os.path.join(os.path.dirname(__file__), '..', 'frontend-services', '.env')

load_dotenv(env_path)

app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY')

DB_USER = 'postgres'
DB_PASSWORD = os.getenv('DB_PASSWORD')  
encoded_password = quote(str(DB_PASSWORD))

DB_HOST = 'speech-db'
DB_PORT = '5432'            
DB_NAME = 'speechdb' 

db_uri = f"postgresql://{DB_USER}:{encoded_password}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

app.config['SQLALCHEMY_DATABASE_URI'] = db_uri
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['JWT_SECRET_KEY'] = os.getenv('SECRET_KEY') 

db = SQLAlchemy(app)


aai.settings.api_key = os.getenv('AssemblyAI_API_KEY')
openai.api_key  = os.getenv('OPENAI_API_KEY')
socketio = SocketIO(app, cors_allowed_origins="*")


class CallTranscript(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    call_id = db.Column(db.String(80), unique =True, nullable =False)
    transcript = db.Column(db.Text, nullable = False)
    summary =  db.Column(db.Text, nullable = False)
    created_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow)

model_path = os.path.join(os.path.dirname(__file__), 'model')
model = Model(model_path)
 
# audio_file = "https://assembly.ai/wildfires.mp3"
def check_database_exists():
    """Check if the database exists, create it if it doesn't"""
    try:
        # Connect to PostgreSQL server without specifying a database
        conn = psycopg2.connect(
            user=DB_USER,
            password=DB_PASSWORD,
            host=DB_HOST,
            port=DB_PORT
        )
        conn.autocommit = True
        cursor = conn.cursor()
        
        # Check if database exists
        cursor.execute(f"SELECT 1 FROM pg_database WHERE datname = '{DB_NAME}'")
        exists = cursor.fetchone()
        
        if not exists:
            print(f"Database '{DB_NAME}' does not exist. Creating it now...")
            cursor.execute(f"CREATE DATABASE {DB_NAME}")
            print(f"Database '{DB_NAME}' created successfully!")
        else:
            print(f"Database '{DB_NAME}' already exists.")
        
        cursor.close()
        conn.close()
        return True
    except Exception as e:
        print(f"Error checking/creating database: {e}")
        return False
    

def test_database_connection():
    """Test connection to the specific database"""
    try:
        # Connect to the specific database
        conn = psycopg2.connect(
            user=DB_USER,
            password=DB_PASSWORD,
            host=DB_HOST,
            port=DB_PORT,
            database=DB_NAME
        )
        print("Successfully connected to the database!")
        conn.close()
        return True
    except Exception as e:
        print(f"Error connecting to database: {e}")
        return False

def setup_database():
    """Setup database tables"""
    print("Setting up database tables...")
    with app.app_context():
        try:
            # List tables before creation
            inspector = db.inspect(db.engine)
            existing_tables = inspector.get_table_names()
            print(f"Existing tables before creation: {existing_tables}")
            
            # Create tables
            db.create_all()
            print("Tables created successfully!")
            
            # List tables after creation
            inspector = db.inspect(db.engine)
            new_tables = inspector.get_table_names()
            print(f"Tables after creation: {new_tables}")
            
            return True
        except Exception as e:
            print(f"Error creating database tables: {e}")
            return False


# transcribers = {}
recognizers = {}

@app.route('/')
def index():
    return "Speech Service Running"

@socketio.on('start_transcription')
def handle_start_transcription(data):
    call_id = data.get('call_id')
    print(f"Starting transcation for call: {{call_id}}")
    recognizers[call_id] = KaldiRecognizer(model, 16000)
    recognizers[call_id].SetWords(True)
            
    # def on_data(chunk):
    #     print("[BACKEND] on_data() trigered")
    #     if chunk.text:
    #         print(f"[BACKEND] Sending chunk: {chunk.text}")  
    #         transcriber.transcript_chunks.append(chunk.text)
    #         socketio.emit('transcription_update', {
    #             'call_id': call_id,
    #             'text': chunk.text
    #         }, room=call_id)
            
    # def on_error(error):
    #     print(f"Transcription error: {error}")
    #     socketio.emit('transcription_error', {
    #         'call_id': call_id,
    #         'error': str(error)
    #     }, room=call_id)
            
    # transcriber = aai.RealtimeTranscriber(on_data=on_data,on_error=on_error, 
    #                                       sample_rate=16000)
    # transcriber.transcript_chunks = []
    # transcriber.connect()
    # transcribers[call_id] = transcriber
    # print(f"Transcription started for call: {call_id}")


@socketio.on('audio_chunk')
def handle_audio_chunk(data):
    call_id = data.get('call_id')
    raw_audio = data.get('audio')
    
    if not call_id or not raw_audio:
        print("⚠️ Invalid or missing audio data")
        return
    try:
   
        if isinstance(raw_audio, list):
            audio_array = np.array(raw_audio, dtype=np.float32)
            
            if np.max(np.abs(audio_array)) > 1.0:
                audio_array = audio_array / np.max(np.abs(audio_array))
            audio_data = (audio_array * 32767).astype(np.int16).tobytes()
        else:
            return
    except Exception as e:
        print(f"Failed to convert audio: {e}")
        return


    if call_id in recognizers:
        recognizer = recognizers[call_id]
        try:

            if recognizer.AcceptWaveform(audio_data):
                result = json.loads(recognizer.Result())
                text = result.get('text')
                if text:
                    print(f"🗣️ Final: {text}")
                    socketio.emit('transcription_update', {'call_id': call_id, 'text': text}, room=call_id)
            else:
                partial = json.loads(recognizer.PartialResult()).get('partial', '')
                if partial:
                    print(f"✏️ Partial: {partial}")
                    socketio.emit('transcription_update', {'call_id': call_id, 'text': partial}, room=call_id)
        except Exception as e:
            print(f"Vosk crashed while decoding: {e}")




    # if not call_id or not audio_data:
    #     print(f'Invalid audio chunk recieved: {data}')
    #     return


    # if call_id in transcribers:
    #     print(f"[BACKEND] Received audio chunk for call: {call_id}, size: len(audio_data)")
    #     transcribers[call_id].stream(audio_data)


@socketio.on('end_transcription')
def handle_end_transcription(data):
    call_id = data.get('call_id')
    
    if call_id in recognizers:
        final = json.loads(recognizers[call_id].FinalResult())
        final_text = final.get('text', '')
        print(f"✅ Transcription complete: {final_text}")
        del recognizers[call_id]

    record = CallTranscript(call_id=call_id, transcript=final_text, summary="")
    db.session.add(record)
    db.session.commit()

    socketio.emit('transcription_complete', {
        'call_id': call_id,
        'transcript': final_text,
        'summary': "Summary feature disabled with Vosk"
    }, room=call_id)

def generate_summary(text):
    """Generate summary using OpenAI's GPT-3.5"""
    try:
        response = openai.ChatCompletion.create(
            model='gpt-3.5-turbo',
            messages=[
                {"role": "system", "content": "Summarize the content in 3–5 bullet points."},
                {"role": "user", "content": text}
            ]
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        print(f"OpenAI summary generation error: {e}")
        return "Summary unavailable due to error."


# config = aai.TranscriptionConfig(speech_model=aai.SpeechModel.best)

# transcript = aai.Transcriber(config=config).transcribe(audio_file)

# if transcript.status == "error":
#   raise RuntimeError(f"Transcription failed: {transcript.error}")

# print(transcript.text)

@app.route('/check-db', methods=['GET'])
def check_db():
    """Route to check database status"""
    db_exists = check_database_exists()
    db_connection = test_database_connection()
    
    try:
        with app.app_context():
            inspector = db.inspect(db.engine)
            tables = inspector.get_table_names()
            # user_count = User.query.count()
    except Exception as e:
        tables = f"Error getting tables: {str(e)}"
        user_count = f"Error getting user count: {str(e)}"
    
    return jsonify({
        'database_exists': db_exists,
        'connection_working': db_connection,
        'tables': tables,
        'user_count': user_count,
        'sqlalchemy_uri': app.config['SQLALCHEMY_DATABASE_URI']
    })


if __name__ == '__main__':  
    if not check_database_exists():
        print("Failed to ensure database exists. Exiting.")
        sys.exit(1)
    
    if not test_database_connection():
        print("Failed to connect to database. Exiting.")
        sys.exit(1)
    
    if not setup_database():
        print("Failed to set up database tables. Exiting.")
        sys.exit(1)
    
    print("Database setup complete. Starting Flask server...")
    print("Starting Vosk Speech Service...")

    socketio.run(app, host='0.0.0.0', port=5003, debug =True,allow_unsafe_werkzeug=True)