const socket = io();
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
// const room = 'myroom' //later change this to dynmaic room ID

const roomInput = document.getElementById('room');
const joinButton = document.getElementById('joinButton');
const createButton = document.getElementById('createButton');
const muteButton = document.getElementById('muteButton');
const videoOffButton = document.getElementById('videoOffButton');
const roomDisplay = document.getElementById('roomDisplay')

// socket.emit('join', room)

// socket.on('joined', () =>{
//     console.log('Joined room:', room);
// });

let localStream;
let remoteStream;
let peerConnection;
let isMuted = false;
let isVideoOff = false
let room;

const configuration = {
    iceServers: [{urls: "stun:stun.l.google.com:19302" }]
};

async function createOffer() {
    try{
        const offer = await peerConnection.createOffer()
        await peerConnection.setLocalDescription(offer)
        socket.emit('offer',offer,room)
    } catch (error) {
        console.error("Error creating offer:", error)
    }
}

async function createAnswer(offer) {
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription (offer))
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('answer', answer, room);
    } catch (error){
        console.error("Error creating answer:", error);
    }
}

function handlingICECandidate(event) {
    if (event.candidate){
        socket.emit('ice', event.candidate, room);
    }
}

// function handleRemoteStream(event) {
//     remoteVideo.srcObject = event.streams[0];
//     remoteStream = event.streams[0];
// }

//Initailize webrtc


async function startVideo(){
    try{
        localStream = await navigator.mediaDevices.getUserMedia({video: true, audio: true});
        localVideo.srcObject = localStream;

        peerConnection = new RTCPeerConnection(configuration)
        localStream.getTracks().forEach(track => peerConnection.addTrack(track,localStream)); //this make local media availavle to remote peer
        
        peerConnection.onicecandidate = handlingICECandidate;
        peerConnection.ontrack = event => {
            remoteVideo.srcObject = event.streams[0];
            remoteStream =  evemt.streams[0];
        };
    } catch (error){
        console.error ("Error accesing media device:", error);
    }
}

function UpdateRoomDisplay() {
    if (room) {
        roomDisplay.textContent= `Current Room: ${room}`;
        roomDisplay.style.display = 'block';
    } else {
        roomDisplay.style.display = 'none';
    }
}

joinButton.addEventListener('click', () => {
    if (!roomInput.value){
        alert("Please enter a room id")
        return;
    };
    room = roomInput.value;
    socket.emit('join',room);
    startVideo().then(() => {
        createOffer();
        UpdateRoomDisplay();
    });
});

createButton.addEventListener('click', () => {
    socket.emit('create_room');
})

muteButton.addEventListener('click', () => {
    isMuted = !isMuted;
    localStream.getAudioTracks()[0].enabled = !isMuted
    muteButton.textContent = isMuted ? 'Unmute' : 'Mute'
});

videoOffButton.addEventListener('click', () => {
    isVideoOff = !isVideoOff;
    localStream.getVideoTracks()[0].enabled = !isVideoOff
    videoOffButton.textContent = isVideoOff ? 'Video Off' : 'Vide On'
})

//Socket event handler
socket.on('room_created', (data) => {
    room = data.room;
    roomInput.value = room;

    UpdateRoomDisplay();
    startVideo.then(() =>{
        console.log('Room created, waiting for other participants..')
    });
});

socket.on('joined', () => {
    console.log('Succesfully joined the room:', room);
});

socket.on('offer', async (offer) => {
    await startVideo();
    await createAnswer(offer);
});

socket.on('answer', async (answer) => {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
});

socket.on('ice', async (ice) => {
    if(peerConnection){
        try{
            await peerConnection.addIceCandidate(new RTCIceCandidate(ice))
        } catch (error){
            console.error("Error adding ICE Candidate:", error);
        }
    }
});

// socket.emit('join', room);
// startVideo();




