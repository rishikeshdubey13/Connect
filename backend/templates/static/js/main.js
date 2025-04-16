// Add at the top of your file
if (!window.RTCPeerConnection) {
    alert("WebRTC is not supported in your browser");
    throw new Error("WebRTC not supported");
}

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

let pendingIceCandidates = [];
let localStream;
let remoteStream;
let peerConnection;
let isMuted = false;
let isVideoOff = false
let room;

const configuration = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
    ],
    iceCandidatePoolSize: 10
};

async function createOffer() {
    try {
        if (peerConnection.signalingState !== 'stable') {
            console.warn('Cannot create offer in state:', peerConnection.signalingState);
            return;
        }

        const offer = await peerConnection.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
        });
        await peerConnection.setLocalDescription(offer);
        console.log('Local description set, state:', peerConnection.signalingState);
        socket.emit('offer', offer, room);
    } catch (error) {
        console.error("Error creating offer:", error);
    }
}

async function createAnswer(offer) {
    try {
        await peerConnection.setRemoteDescription(offer);
        const answer = await peerConnection.createAnswer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
        });
        await peerConnection.setLocalDescription(answer);
        socket.emit('answer', answer, room);
    } catch (error){
        console.error("Error creating answer:", error);
        // will add retry logic if needed
    }
}

function handlingICECandidate(event) {
    try {
        if (event && event.candidate) {
            console.log('Sending ICE candidate:', event.candidate);
            socket.emit('ice', event.candidate, room);
        } else {
            console.log('ICE gathering complete');
        }
    } catch (error) {
        console.error("Error handling ICE candidate:", error);
    }
}

// function handleRemoteStream(event) {
//     remoteVideo.srcObject = event.streams[0];
//     remoteStream = event.streams[0];
// }

//Initailize webrtc
async function initializeWebRTC() {
    if (peerConnection) {
        peerConnection.close();
    }

    peerConnection = new RTCPeerConnection(configuration);

    // Correct event handler assignments
    peerConnection.onicecandidate = handlingICECandidate;
    peerConnection.ontrack = handleTrackEvent;
    peerConnection.oniceconnectionstatechange = handleICEConnectionStateChange;
    peerConnection.onsignalingstatechange = handleSignalingStateChange;
    peerConnection.onconnectionstatechange = handleConnectionStateChange;

    if (localStream) {
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
    }
}

// Separate handler functions for clarity
function handleSignalingStateChange() {
    console.log('Signaling state:', peerConnection.signalingState);
    if (peerConnection.signalingState === 'have-local-offer' && pendingAnswer) {
        console.log('Processing queued answer');
        socket.emit('answer', pendingAnswer, room);
        pendingAnswer = null;
    }
}

function handleICEConnectionStateChange() {
    console.log('ICE connection state:', peerConnection.iceConnectionState);
}

function handleConnectionStateChange() {
    console.log('Connection state:', peerConnection.connectionState);
}

function handleTrackEvent(event) {
    console.log('Track received:', event.track.kind);
    if (event.streams && event.streams[0]) {
        remoteVideo.srcObject = event.streams[0];
        remoteVideo.play().catch(e => console.log('Play warning:', e));
    }
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
            alert("Error accessing camera or microphone: ",error.message);
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

function leaveRoom(){
    if(peerConnection){
        peerConnection.onicecandidate = null;
        peerConnection.ontrack = null;
        peerConnection.close();
        peerConnection = null;
    }
    if (localStream){
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    if (remoteVideo.srcObject){
        remoteVideo.srcObject.getTracks().forEach(track => track.stop());
        remoteVideo.srcObject = null;
    }
    socket.emit('leave', room);
    room = null;
    UpdateRoomDisplay();
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

socket.on('joined', () => {
    console.log("Joined room, checking peerconnection state");
    if (peerConnection && localStream) {
        // Added a  slight delay to make sure everything is ready
        setTimeout(() => {
            createOffer();
        }, 500);
    }
});

socket.on('room_joined', () => {
    console.log('Successfully joined the room:', room);
    if (peerConnection && localStream) {
        setTimeout(() => {
            createOffer();
        }, 500);
    }
});

// socket.on('offer', async (offer) => {
//     console.log('Recieved offer,',offer);
//     if(!localStream){
//         await startVideo();
//     }
//     await createAnswer(offer);
// });
socket.on('offer', async (offer) => {
    console.log('Received offer, current state:', peerConnection.signalingState);
    
    if (!localStream) {
        await startVideo();
    }

    try {
        await peerConnection.setRemoteDescription(offer);
        console.log('Remote description (offer) set successfully');

        // Process any pending candidates
        if (pendingIceCandidates) {
            for (const candidate of pendingIceCandidates) {
                try {
                    await peerConnection.addIceCandidate(candidate);
                } catch (e) {
                    console.error("Error adding pending ICE candidate:", e);
                }
            }
            pendingIceCandidates = null;
        }

        await createAnswer(offer);
    } catch (error) {
        console.error("Error handling offer:", error);
    }
});

// socket.on('answer', async (answer) => {
//     console.log("Received answer, current signaling state:",peerConnection.signalingState);
//     try {
//         if(peerConnection.signalingState !== 'stable') {
//             console.log('Delaying answer processing..')
//             await new Promise(resolve => setTimeout(resolve, 500));
//         }
//         await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
//         console.log('Succesfully set remote Description');
//     } catch (error){
//         console.error("Error setting remote description", error);
//     }
    
// });
// Modify the answer handler to queue answers if in wrong state
let pendingAnswer = null;

socket.on('answer', async (answer) => {
    if (peerConnection.signalingState === 'have-local-offer') {
        try {
            await peerConnection.setRemoteDescription(answer);
            console.log('Answer successfully applied');
            // Process pending ICE candidates if any...
        } catch (e) {
            console.error('Answer processing failed:', e);
        }
    } else {
        console.log('Queueing answer (current state:', peerConnection.signalingState + ')');
        pendingAnswer = answer;
    }
});

// Add this to track signaling state changes
peerConnection.onsignalingstatechange = () => {
    console.log('Signaling state changed to:', peerConnection.signalingState);
    if (peerConnection.signalingState === 'have-local-offer' && pendingAnswer) {
        socket.emit('answer', pendingAnswer, room);
        pendingAnswer = null;
    }
};
// socket.on('answer', async (answer) => {
//     console.log("Received answer");
//     try {
//         if (peerConnection.signalingState !== 'stable') {
//             console.log('Current signaling state:', peerConnection.signalingState);
//             await new Promise(resolve => setTimeout(resolve, 1000));
//         }
//         await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
//         console.log('Remote description set successfully');
//     } catch (error) {
//         console.error("Error setting remote description", error);
//     }
// });


socket.on('ice', async (ice) => {
    console.log("Received ICE candidate");
    try {
        const candidate = new RTCIceCandidate(ice);
        if (peerConnection.remoteDescription) {
            await peerConnection.addIceCandidate(candidate);
        } else {
            if (!pendingIceCandidates) pendingIceCandidates = [];
            pendingIceCandidates.push(candidate);
            console.log('Candidate held (remote description not set yet)');
        }
    } catch (error) {
        console.error("Error adding ICE candidate:", error);
    }
});

// socket.emit('join', room);
// startVideo();




