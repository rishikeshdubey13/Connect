from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO, emit, join_room, leave_room
from dotenv import load_dotenv
from functools import wraps
import os
import jwt

load_dotenv()

app = Flask(__name__, static_folder='templates/static')
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY')
socketio = SocketIO(app, cors_allowed_origins="*")

rooms = {}

@app.route('/')
def index():
    return "Signaling Service Running"

def validate_token(token):
    try:
        decode = jwt.decode(token.replace("Bearer ", ""), app.config['SECRET_KEY'], algorithms = ['HS256']) #Decode the token uisng jwt.deocde, 
                                                                    # then it checks the token with the secret key
        return decode
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None
    


@socketio.on('join')
def handle_join(data):
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

    if not token or not validate_token(token):
        emit('unauthorized', {'error': 'Invalid or missing token'})
        return
    
    print(f"Chat message from room {room}: {data}")
    emit('chat', data, room=room)


    
if __name__ ==  '__main__':
    socketio.run(app, host = "0.0.0.0", port = 5001, debug=True)
    