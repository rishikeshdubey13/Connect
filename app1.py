from flask import Flask, render_template,request
from flask_socketio import SocketIO, emit, join_room, leave_room
from dotenv import load_dotenv
import os
import uuid

load_dotenv()

app = Flask(__name__, static_folder='templates/static')
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY')
socketio = SocketIO(app, cors_allowed_origins="*")


#store active rooms
rooms = {}

def generate_room_id():
    return str(uuid.uuid4())[:8]


@app.route('/')
def index():
    return render_template('index.html')

@socketio.on_error_default
def default_error_handler(e):
    print(f"Socket error: {str(e)}")
    emit('error', {'message': 'An unexpected error occurred'})

@socketio.on('create_room')
def create_room():
    room_id = generate_room_id()
    rooms[room_id] = set()
    join_room(room_id)
    rooms[room_id].add(request.sid)
    emit('room_created',{'room':room_id})
    print(f"New room created: {room_id}")


# @socketio.on('join')
# def handle_join(room, callback=None):  # Add callback parameter
#     if room not in rooms:
#         if callback:
#             callback({'error': 'Room does not exist'})
#         return
    
#     join_room(room)
#     if callback:
#         callback({'status': 'success'})
#     emit("joined", room=room)
#     print(f"User joined room: {room}")

@socketio.on('join')
def handle_join(room):
    if room not in rooms:
        emit('join_error', {'error': 'Room does not exist'})
        return
    join_room(room)
    rooms[room].add(request.sid)
    print(f"User {request.sid} has joined the room")
    emit("joined", room=room)

@socketio.on('leave')
def handle_leave(room):
    leave_room(room)
    if room in rooms:
        rooms[room].discard(request.sid)
        if not rooms[room]:
            del rooms[room]
        # socketio.emit('user_left',room =room, include_self=False)

@socketio.on('offer')
def handle_offer(offer, room):
    # Add logging to debug
    print(f"Received offer for room {room}, forwarding to other participants")
    socketio.emit('offer', offer, room=room, include_self=False)

@socketio.on('answer')
def handle_answer(answer, room):
    # Add logging to debug
    print(f"Received answer for room {room}, forwarding to other participants")
    socketio.emit('answer', answer, room=room, include_self=False)

@socketio.on('ice')
def handle_ice(ice, room):
    # Add logging to debug
    print(f"Received ICE candidate for room {room}, forwarding to other participants")
    socketio.emit('ice', ice, room=room, include_self=False)


@socketio.on('disconnect')
def handle_disconnect():
    for room_id, participants in list(rooms.items()):
        if request.sid in participants:
            participants.discard(request.sid)
            emit('user_left', room=room_id, include_self=False)
            print(f"User disconnected from room: {room_id}")
            if not participants:
                del rooms[room_id]  # Delete empty room


# @app.route('/conference/<room_id>')
# def conference(room_id):
#     return render_template('index.html', room_id = room_id)

# Socketio



if __name__ == '__main__':
    socketio.run(app, host = "0.0.0.0", port = 5001, debug=True)
    