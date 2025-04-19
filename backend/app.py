from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit, join_room, leave_room
from dotenv import load_dotenv
import os

load_dotenv()

app = Flask(__name__, static_folder='templates/static')
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY')
socketio = SocketIO(app, cors_allowed_origins="*")

rooms = {}

@app.route('/')
def index():
    return render_template('index.html')

@socketio.on('join')
def handle_join(room):
    join_room(room)
    
    if room not in rooms:
        rooms[room] = 1
        # First peer gets 'created' — only to self
        emit('created')  # defaults to include_self=True
    else:
        rooms[room] += 1
        # Notify existing peers a new peer joined — exclude sender
        emit('joined', room=room, include_self=False)

    print(f"A User joined room: {room}")


@socketio.on('message')
def handle_message(payload):
    room = payload['room']
    data = payload['data']
    print(f"Message from room {room}: {data}")
    socketio.emit('message', data, room=room)

@socketio.on('leave')
def handle_leave(room):
    print(f"A User left room: {room}")
    emit('leave', room = room, include_self=False)


@socketio.on('chat')
def handle_chat(data):
    room = data['room']
    print(f"Chat message from room {room}: {data}")
    emit('chat', data, room=room)


    
if __name__ ==  '__main__':
    socketio.run(app, host = "0.0.0.0", port = 5001, debug=True)
    