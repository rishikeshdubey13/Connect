from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO, emit, join_room, leave_room
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from dotenv import load_dotenv
from datetime import datetime
import os
import jwt
import time
from urllib.parse import quote
import psycopg2
import sys

time.sleep(15)

env_path = '../frontend-services/.env'
env_path = os.path.join(os.path.dirname(__file__), '..', 'frontend-services', '.env')

load_dotenv(env_path)

app = Flask(__name__, static_folder='templates/static')
app.config['SECRET_KEY'] = "SECRET_KEY"
socketio = SocketIO(app, cors_allowed_origins="*")

DB_USER = 'postgres'
DB_PASSWORD = os.getenv('DB_PASSWORD')  # The actual password
encoded_password = quote(str(DB_PASSWORD))

DB_HOST = 'signaling-db'       
DB_PORT = '5432'           
DB_NAME = 'signalingdb' 

db_uri = f"postgresql://{DB_USER}:{encoded_password}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

app.config['SQLALCHEMY_DATABASE_URI'] = db_uri
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['JWT_SECRET_KEY'] = os.getenv('SECRET_KEY')          

db = SQLAlchemy(app)
CORS(app)

rooms = {}

class ChatMessage(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    room = db.Column(db.String(100), nullable=False)
    sender = db.Column(db.String(100), nullable=False)
    message = db.Column(db.String(1000), nullable=False)
    timestamp = db.Column(db.DateTime(timezone=True), default=datetime.utcnow)

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

            cursor.execute("CREATE DATABASE %s", (DB_NAME))
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
# with app.app_context():
#     try:
#         db.create_all()
#     except Exception as e:
#         print(f"Error creating databse tables: ", {e})


@app.route('/')
def index():
    return "Signaling Service Running"

# def validate_token(token):
#     try:
#         decoded = jwt.decode(token.replace("Bearer ", ""), app.config['SECRET_KEY'], algorithms = ['HS256']) #Decode the token uisng jwt.deocde, 
#                                                                     # then it checks the token with the secret key
#         return decoded
#     except jwt.ExpiredSignatureError:
#         return None
#     except jwt.InvalidTokenError:
#         return None
# def validate_token(token):
#     try:
#         decoded = jwt.decode(token.replace("Bearer ", ""), app.config['SECRET_KEY'], algorithms=["HS256"])
#         return decoded
#     except jwt.ExpiredSignatureError:
#         return {'error': 'Token has expired'}
#     except jwt.InvalidTokenError as e:
#         return {'error': f'Invalid token: {str(e)}'}

def validate_token(token):
    try:
        decoded = jwt.decode(token.replace("Bearer ", ""), app.config['SECRET_KEY'], algorithms=["HS256"])
        return decoded
    except jwt.ExpiredSignatureError:
        return {'error': 'Token has expired'}
    except jwt.InvalidTokenError as e:
        return {'error': f'Invalid token: {str(e)}'}


@socketio.on('join')
def handle_join(data):
    if isinstance(data, str):
        emit('unauthorized', {'error': 'Expected object, got string'})
        return
    
    token = data.get('token')
    room = data.get('room')

    if not token or not validate_token(token):
        
        emit('unauthorized', {'error': 'Invalid or missing token'})
        return
    
    join_room(room)
    rooms[room] = rooms.get(room,0) +1 #track the occupancy of the room, where 0 is the default value
    

    if rooms[room] == 1:
        # First peer gets 'created' — only to self
        emit('created')  # defaults to include_self=True
    else:
        # Notify existing peers a new peer joined — exclude sender
        emit('joined', room=room, include_self=False)
    
    history = ChatMessage.query.filter_by(room = room).order_by(ChatMessage.timestamp.asc()).all()
    history_data = [
        {
            'sender': msg.sender,
            'message': msg.message,
            'timestamp': msg.timestamp.isoformat()
        }
        for msg in history
    ]
    emit('chat_history', history_data)
    print(f"A User joined room: {room}")


@socketio.on('message')
def handle_message(payload):
    token  = payload.get('token')
    room = payload['room']
    data = payload['data']

    if not token or not validate_token(token):
        emit('unauthorized', {'error': 'Invalid or missing token'})
        return 
    
    if not room or not data:
        emit('error', {'error': 'Invalid room or data'})
        return
    

    print(f"Message from room {room}: {data}")
    socketio.emit('message', data, room=room)


@socketio.on('leave')
def handle_leave(data):
    token = data.get('token')
    room = data.get('room')

    if not token or not validate_token(token):
        emit('unauthorized', {'error': 'Invalid or missing token'})
        return
    
    leave_room(room)
    rooms[room] = max(0, rooms.get(room, 1)-1) #decrement the occupancy of the room, where 1 is the default value
    emit('leave', room = room, include_self=False)
    print(f"A User left room: {room}")




@socketio.on('chat')
def handle_chat(data):
    token = data.get('token')
    room = data.get('room')
    sender = data.get('sender')
    message = data.get('message')

    if not token or not validate_token(token):
        emit('unauthorized', {'error': 'Invalid or missing token'})
        return
    
    if not room or not sender or not message:
        emit('error', {'error': 'Invalid room/sender/message'})
        return
    
    new_message = ChatMessage(room = room, sender = sender, message = message)
    db.session.add(new_message)
    db.session.commit()

    print(f"[{room}] {sender}: {message}")
    emit('chat', data, room=room)


@socketio.on('start_call')
def handle_start_call(data):
    """Notify all clients in the room that a call has started"""
    token = data.get('token')
    room = data.get('room')
    
    if not token or not validate_token(token):
        emit('unauthorized', {'error': 'Invalid or missing token'})
        return
    
    print(f"Call started in room: {room}")
    emit('call_started', {'call_id': room}, room=room)

@socketio.on('end_call')
def handle_end_call(data):
    """Notify all clients in the room that a call has ended"""
    token = data.get('token')
    room = data.get('room')
    
    if not token or not validate_token(token):
        emit('unauthorized', {'error': 'Invalid or missing token'})
        return
    
    print(f"Call ended in room: {room}")
    emit('call_ended', {'call_id': room}, room=room)


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
        # 'user_count': user_count,
        'sqlalchemy_uri': app.config['SQLALCHEMY_DATABASE_URI']
    })

    
if __name__ ==  '__main__':

    print(f"DB_PASSWORD from env: {DB_PASSWORD}")
    print(f"Encoded password: {encoded_password}")
    print(f"Final connection string: {db_uri}")
    print(f"Starting signaling service with database URI: {db_uri}")

    print(f"Final connection string: {db_uri}")
    print(f"Password being used: {DB_PASSWORD}")
    
    # Check database setup
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
    socketio.run(app, host = "0.0.0.0", port = 5001, debug=True)
    