from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit, join_room, leave_room
from dotenv import load_dotenv
import os
import uuid

load_dotenv()
app = Flask(__name__, static_folder='templates/static')
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY')
socketio = SocketIO(app, cors_allowed_origins="*")

@app.route('/')
def index():
    return render_template('index.html')

@socketio.on('join')
def handle_join(room):
    join_room(room)
    print(f"User joined room: {room}")

@socketio.on('message')
def handle_message(payload):
    room = payload['room']
    data = payload['data']
    socketio.emit('message', data, room=room)

if __name__ ==  '__main__':
    socketio.run(app, host = "0.0.0.0", port = 5001, debug=True)