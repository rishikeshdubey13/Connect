// Add at the top of your file
if (!window.RTCPeerConnection) {
    alert("WebRTC is not supported in your browser");
    throw new Error("WebRTC not supported");
}

const socket = io();
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');

const roomInput = document.getElementById('room');
const joinButton = document.getElementById('joinButton');
const createButton = document.getElementById('createButton');
const muteButton = document.getElementById('muteButton');
const videoOffButton = document.getElementById('videoOffButton');
const roomDisplay = document.getElementById('roomDisplay');

let pendingIceCandidates = [];
let localStream;
let remoteStream;
let peerConnection = null;
let isMuted = false;
let isVideoOff = false;
let room;
let pendingAnswer = null;

// At the top of your file, add this configuration
const configuration = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
    ],
    iceCandidatePoolSize: 10,
    // Add this to prevent SSL role conflicts
    sdpSemantics: 'unified-plan'
};

// Update your initializeWebRTC function
async function initializeWebRTC() {
    if (peerConnection) {
        peerConnection.close();
    }

    peerConnection = new RTCPeerConnection(configuration);    
}

async function createOffer() {
    try {
        if (!peerConnection || peerConnection.signalingState !== 'stable') {
            console.warn('Cannot create offer in state:', peerConnection ? peerConnection.signalingState : 'peerConnection not initialized');
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
        if (!peerConnection) {
            console.error("Cannot create answer, peerConnection not initialized");
            return;
        }
        
        // No need to set remote description again if it was already done outside
        if (peerConnection.remoteDescription === null) {
            await peerConnection.setRemoteDescription(offer);
        }
        
        const answer = await peerConnection.createAnswer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
        });
        await peerConnection.setLocalDescription(answer);
        socket.emit('answer', answer, room);
    } catch (error){
        console.error("Error creating answer:", error);
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

// Separate handler functions for clarity
function handleSignalingStateChange() {
    console.log('Signaling state:', peerConnection.signalingState);
    if (peerConnection.signalingState === 'have-local-offer' && pendingAnswer) {
        console.log('Processing queued answer');
        processPendingAnswer();
    }
}

function processPendingAnswer() {
    if (pendingAnswer && peerConnection && peerConnection.signalingState === 'have-local-offer') {
        peerConnection.setRemoteDescription(pendingAnswer)
            .then(() => {
                console.log('Pending answer successfully applied');
                pendingAnswer = null;
            })
            .catch(error => {
                console.error('Error applying pending answer:', error);
            });
    }
}
let playButtonContainer = null;
// Improved track handling function
function handleTrackEvent(event) {
    console.log('Track received:', event.track.kind);
    if (event.streams && event.streams[0]) {
        remoteStream = event.streams[0];
        remoteVideo.srcObject = event.streams[0];
        
        // Create or ensure play button exists
        if (!playButtonContainer) {
            playButtonContainer = document.createElement('div');
            playButtonContainer.id = 'remotePlayButton';
            
            const playButton = document.createElement('button');
            playButton.textContent = 'Play Remote Video';
            playButton.onclick = () => {
                remoteVideo.play().catch(e => console.log('Play still failed:', e));
            };
            
            playButtonContainer.appendChild(playButton);
            document.querySelector('.video-wrapper:nth-child(2)').appendChild(playButtonContainer);
        }
        
        // Try autoplay first
        remoteVideo.play().then(() => {
            // Hide button if autoplay worked
            if (playButtonContainer) playButtonContainer.style.display = 'none';
        }).catch(e => {
            console.log('Autoplay prevented:', e);
            // Show button when autoplay fails
            if (playButtonContainer) playButtonContainer.style.display = 'block';
        });
    }
}

let connectionAttempts = 0;
const MAX_CONNECTION_ATTEMPTS = 3;

async function resetConnection() {
    if (connectionAttempts >= MAX_CONNECTION_ATTEMPTS) {
        console.log('Maximum connection attempts reached, giving up');
        alert('Could not establish a stable connection. Please try again.');
        connectionAttempts = 0;
        return false;
    }
    
    connectionAttempts++;
    console.log(`Connection reset attempt ${connectionAttempts}`);
    
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    await initializeWebRTC();
    return true;
}

// Improved connection state handling
function handleConnectionStateChange() {
    if (!peerConnection) return;
    
    console.log('Connection state:', peerConnection.connectionState);
    
    switch(peerConnection.connectionState) {
        case 'connected':
            console.log('WebRTC connection established successfully');
            // Reset attempt counter on successful connection
            connectionAttempts = 0;
            break;
        case 'disconnected':
            console.log('WebRTC connection disconnected - waiting for reconnection');
            break;
        case 'failed':
            console.log('WebRTC connection failed - attempting reconnection');
            // Only try to reconnect if we haven't exceeded our attempts
            if (connectionAttempts < MAX_CONNECTION_ATTEMPTS) {
                connectionAttempts++;
                console.log(`Attempting reconnection... (${connectionAttempts}/${MAX_CONNECTION_ATTEMPTS})`);
                
                // Wait a bit before reinitializing
                setTimeout(async () => {
                    await initializeWebRTC();
                    createOffer();
                }, 2000);
            } else {
                console.log('Maximum reconnection attempts reached');
                alert('Could not establish a stable connection. Please refresh and try again.');
            }
            break;
    }
}

// Improved ICE connection state handler
function handleICEConnectionStateChange() {
    if (!peerConnection) return;
    
    console.log('ICE connection state:', peerConnection.iceConnectionState);
    
    // Restart ICE if needed
    if (peerConnection.restartIce) {
        peerConnection.restartIce();
    } else if (peerConnection.signalingState === 'stable') {
        createOffer({ iceRestart: true });
    }
}


//Initialize webRTC
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
    
    console.log("WebRTC initialized with signaling state:", peerConnection.signalingState);
}

async function startVideo() {
    try {
        // Try with more specific constraints
        localStream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 },
                frameRate: { ideal: 30 }
            },
            audio: {
                echoCancellation: true,
                noiseSuppression: true
            }
        });
        
        console.log('Media access granted, setting up local Video');
        localVideo.srcObject = localStream;
        await initializeWebRTC();
        return true;
    } catch (error) {
        console.error("Error accessing media device:", error);
        if (error.name === 'NotAllowedError') {
            alert("Camera and microphone access denied. Please check your browser permissions.");
                return false; // Prevent further execution
            }
        }
}

function updateRoomDisplay() {
    if (room) {
        roomDisplay.textContent = `Current Room: ${room}`;
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
    updateRoomDisplay();
}

// Event Listeners
joinButton.addEventListener('click', async() => {
    if (!roomInput.value){
        alert("Please enter a room ID");
        return;
    };
    room = roomInput.value;
    updateRoomDisplay();

    const started = await startVideo();
    if (started){
        socket.emit('join', room);
    }
});

createButton.addEventListener('click', async() => {
    const started = await startVideo();
    if (started) {
        socket.emit('create_room');
    }
});

muteButton.addEventListener('click', () => {
    if (!localStream) return;

    const audioTracks = localStream.getAudioTracks();
    if (audioTracks.length == 0) return;

    isMuted = !isMuted;
    audioTracks[0].enabled = !isMuted;
    muteButton.textContent = isMuted ? 'Unmute' : 'Mute';
});

videoOffButton.addEventListener('click', () => {
    if (!localStream) return;
    
    const videoTracks = localStream.getVideoTracks();
    if (videoTracks.length == 0) return;

    isVideoOff = !isVideoOff;
    videoTracks[0].enabled = !isVideoOff;
    videoOffButton.textContent = isVideoOff ? 'Video On' : 'Video Off';
});

// Socket event handlers
socket.on('join_error', (data) => {
    alert(data.error);
});

socket.on('room_created', async (data) => {
    room = data.room;
    roomInput.value = room;
    updateRoomDisplay();
    console.log('Room created, waiting for other participants..');
});

// Add this to your socket.on('joined') handler
socket.on('joined', () => {
    console.log("Joined room, checking peerConnection state");
    
    // Debug media stream status
    if (localStream) {
        const videoTracks = localStream.getVideoTracks();
        const audioTracks = localStream.getAudioTracks();
        
        console.log(`Local video tracks: ${videoTracks.length}, enabled: ${videoTracks.length ? videoTracks[0].enabled : 'N/A'}`);
        console.log(`Local audio tracks: ${audioTracks.length}, enabled: ${audioTracks.length ? audioTracks[0].enabled : 'N/A'}`);
    } else {
        console.warn('No local stream available when joining room');
    }
    
    if (peerConnection && localStream) {
        // Added a slight delay to make sure everything is ready
        setTimeout(() => {
            createOffer();
        }, 500);
    }
});

socket.on('offer', async (offer) => {
    console.log('Received offer');
    
    if (!localStream) {
        await startVideo();
    }
    
    if (!peerConnection) {
        console.log("PeerConnection not initialized, waiting...");
        await initializeWebRTC();
    }

    try {
        // Reset connection if we're in a failed state
        if (peerConnection.iceConnectionState === 'failed' || 
            peerConnection.connectionState === 'failed') {
            console.log('Reinitializing connection due to failed state');
            await initializeWebRTC();
        }
        
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        console.log('Remote description (offer) set successfully');

        // Process any pending candidates
        if (pendingIceCandidates && pendingIceCandidates.length > 0) {
            for (const candidate of pendingIceCandidates) {
                try {
                    await peerConnection.addIceCandidate(candidate);
                    console.log("Added pending ICE candidate");
                } catch (e) {
                    console.error("Error adding pending ICE candidate:", e);
                }
            }
            pendingIceCandidates = [];
        }

        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('answer', answer, room);
        console.log('Answer created and sent');
    } catch (error) {
        console.error("Error handling offer:", error);
    }
});

socket.on('answer', async (answer) => {
    console.log("Received answer");
    if (!peerConnection) {
        console.error("PeerConnection not initialized when answer received");
        return;
    }
    
    try {
        // Add this check before applying the answer
        if (peerConnection.signalingState === 'have-local-offer') {
            // Create a properly formatted RTCSessionDescription
            const remoteDesc = new RTCSessionDescription({
                type: 'answer',
                sdp: answer.sdp
            });
            
            await peerConnection.setRemoteDescription(remoteDesc);
            console.log('Answer successfully applied');
        } else {
            console.log('Cannot apply answer in state:', peerConnection.signalingState);
            // Store for later if needed
            pendingAnswer = answer;
        }
    } catch (e) {
        console.error('Answer processing failed:', e);
        // Try reinitializing on persistent errors
        if (e.name === 'InvalidAccessError') {
            console.log('SSL role conflict detected, reinitializing connection');
            await initializeWebRTC();
            // Wait before attempting to reconnect
            setTimeout(() => createOffer(), 1000);
        }
    }
});

socket.on('ice', async (ice) => {
    console.log("Received ICE candidate");
    if (!peerConnection) {
        console.log("PeerConnection not initialized, storing ICE candidate");
        if (!pendingIceCandidates) pendingIceCandidates = [];
        pendingIceCandidates.push(ice);
        return;
    }
    
    try {
        const candidate = new RTCIceCandidate(ice);
        if (peerConnection.remoteDescription) {
            await peerConnection.addIceCandidate(candidate);
            console.log("ICE candidate added successfully");
        } else {
            if (!pendingIceCandidates) pendingIceCandidates = [];
            pendingIceCandidates.push(candidate);
            console.log('Candidate held (remote description not set yet)');
        }
    } catch (error) {
        console.error("Error adding ICE candidate:", error);
    }
});

socket.on('user_left', () => {
    console.log("Remote user left the room");
    if (remoteVideo.srcObject) {
        remoteVideo.srcObject.getTracks().forEach(track => track.stop());
        remoteVideo.srcObject = null;
    }
});