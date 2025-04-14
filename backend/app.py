from flask import Flask, render_template
from flask_socketio import SocketIO, emit, join_room, leave_room
from dotenv import load_dotenv
import os
import uuid

load_dotenv()

app = Flask(__name__, static_folder='templates/static')
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY')
socketio = SocketIO(app, cors_allowed_origins="*")


#store active rooms
rooms = set()

def generate_room_id():
    return str(uuid.uuid4())[:8]


@app.route('/')
def index():
    return render_template('index.html')

@socketio.on('create')
def create_room():
    roomId = generate_room_id()
    rooms.add(roomId)
    join_room(roomId)
    emit('room_joined',{'room':roomId})
    print(f"New room created: {roomId}")


@socketio.on('join')
def handle_join(room):
    join_room(room)
    socketio.emit("joined", room=room)
    print(f"User joind room: {room}")

# @socketio.on('leave')
# def handle_leave(room):
#     leave_room(room)
#     if room in rooms:
#         socketio.emit('user_left',room =room, include_self=False)

@socketio.on('offer')
def handle_offer(offer,room):
    socketio.emit('offer',offer, room = room,include_self=False)

@socketio.on('answer')
def handle_answer(answer, room):
    socketio.emit('answer', answer, room = room, include_self= False)

@socketio.on('ice')
def handle_ice(ice, room):
    socketio.emit('ice',ice, room = room, include_self=False)


@socketio.on('disconnect')
def handle_disconnect():
    print("User disconnected")


# @app.route('/conference/<room_id>')
# def conference(room_id):
#     return render_template('index.html', room_id = room_id)

# Socketio



if __name__ == '__main__':
    socketio.run(app, host = "0.0.0.0", port = 5001, debug=True)
