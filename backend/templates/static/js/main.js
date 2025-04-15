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
    iceServers: [
        {urls: "stun:stun.l.google.com:19302"},
        {urls: "stun:stun1.l.google.com:19302"},
        {urls: "stun:stun2.l.google.com:19302"}
      ]
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
async function initializeWebRTC(){
    if(peerConnection){
        peerConnection.close();
    }

    peerConnection = new RTCPeerConnection(configuration);
    if (localStream){
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track,localStream) //this make local media availavle to remote peer
        });
    }
        peerConnection.onicecandidate = handlingICECandidate;

        peerConnection.oniceconnectionstatechange = () => {
            console.log("ICE connection state:", peerConnection.iceConnectionState);
        };
          
        peerConnection.onsignalingstatechange = () => {
            console.log("Signaling state:", peerConnection.signalingState);
        };

        peerConnection.ontrack = event => {
            console.log("Remote track received:", event.track.kind);
            console.log("Streams array length:", event.streams.length);
            if (event.streams[0]) {
              console.log("Setting remote stream");
              remoteVideo.srcObject = event.streams[0];
              remoteStream = event.streams[0];
              
              // Force a re-render of the video element
              remoteVideo.load();
            } else {
              console.error("No stream received in track event");
            }
          };
        return peerConnection;
}


async function startVideo(){
    try{
        localStream = await navigator.mediaDevices.getUserMedia({video: true, audio: true});
        console.log('Media acces granted, setting up local Video')
        localVideo.srcObject = localStream;

        await initializeWebRTC();

        return true;

    } catch (error){
        console.error ("Error accesing media device:", error);

        if (error.name === 'NotAllowedError') {
            alert("Camera and microphone access denied. Please check your browser permissions.");
        } else {
            alert("Error accessing camera or microphone: " + error.message);
        }
        
        return false;
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

joinButton.addEventListener('click', async() => {
    if (!roomInput.value){
        alert("Please enter a room id")
        return;
    };
    room = roomInput.value;
    UpdateRoomDisplay();

    const started = await startVideo();
    if (started){
        socket.emit('join', room);

        // socket.emit('join',room,(response) => {
        //     if (response && response.error) {
        //         alert(response.error);
        //         return;
        //     }
        // });
    }
});

createButton.addEventListener('click', async() => {
    const started = await startVideo();
    if (started) {
        socket.emit('create_room');
    }
})

muteButton.addEventListener('click', () => {
    if (!localStream) return;

    const audiotracks = localStream.getAudioTracks();
    if (audiotracks.length == 0) return;

    isMuted = !isMuted;
    localStream.getAudioTracks()[0].enabled = !isMuted
    muteButton.textContent = isMuted ? 'Unmute' : 'Mute'
});

videoOffButton.addEventListener('click', () => {
    if (!localStream) return;
    
    const videotracks = localStream.getVideoTracks();
    if (videotracks.length == 0) return;

    isVideoOff = !isVideoOff;
    localStream.getVideoTracks()[0].enabled = !isVideoOff
    videoOffButton.textContent = isVideoOff ? 'Video Off' : 'Vide On'
})

socket.on('join_error', (data) => {
    alert(data.error);
});

//Socket event handler
socket.on('room_created', async (data) => {
    room = data.room;
    roomInput.value = room;

    UpdateRoomDisplay();
    // startVideo.then(() => {
    //     console.log('Room created, waiting for other participants..')
    // });
    await startVideo();
    console.log('Room created, waiting for other participants..')
});

socket.on('room_joined', () => {
    console.log('Succesfully joined the room:', room);
    //creating an offer if joining an existing room
    if (peerConnection && localStream) {
        setTimeout(() => {
            createOffer();
        }, 1000);
    }
});

socket.on('joined', () => {
    console.log("Joined room, checking peerconnection state:", peerConnection?.conneectionState);
    if (peerConnection && localStream) {
        console.log("Creating offer..")
        createOffer();
    }
});

socket.on('offer', async (offer) => {
    console.log('Recieved offer,',offer);
    if(!localStream){
        await startVideo();
    }
    await createAnswer(offer);
});

socket.on('answer', async (answer) => {
    console.log("Received answer", answer) 
    if(peerConnection) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    }
});

socket.on('ice', async (ice) => {
    console.log("Received ice candidate", ice)
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




