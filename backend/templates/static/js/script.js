const socket = io(); //Connect flask-socketio server

const peerid = Math.floor(Math.random()*1000000); //Generate a random peer id
console.log('Peer ID:', peerid); //Log the peer id

socket.on('connect', () => {
    console.log('Connected to server')
});
let mediaready = false; //Flag to check if the media is ready
let iscaller = false; //Flag to check if the user is the caller
let localStream;
let peerConnection;
let pendingMessages = []; //Array to store pending messages

//configuration of ICE servers
const config={
    iceServers:[
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" }
    ]
}

const room  ='testroom'; //Room name
socket.emit('join', room); //Join the room


socket.on('created',() =>{
    console.log('Room created');
    iscaller =true; //Set the caller flag to true
});

socket.on('joined', () => {
    console.log('Another peer joined the room.');

    // If you're the caller, this means someone is now in the room, so start call
    if (iscaller && mediaready) {
        console.log('Caller starting call after peer joined.');
        startCall();
    }
});



//To access the local media devices
navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    .then(stream => {
        localStream = stream;
        document.getElementById('localVideo').srcObject = stream;
        mediaready = true; //Set the media ready flag to true
        console.log('Media devices ready');
        
        //handle any pending messages
        pendingMessages.forEach(msg => { handleMessage(msg); });
        pendingMessages = []; //Clear the pending messages array

        // If this is the caller, start the call after stream is ready
        if (iscaller) {
            setTimeout(() => {
                console.log('Starting call');
                startCall();
            }, 1000);
        }
    })
    .catch(err => {
        console.error("Error accessing media devices: ", err);
        alert("Error accessing media devices: " + err);
    });



//helper: ensure peer connection is setup and exists
//This function ensures that the peer connection is created only once
function ensurePeerConnection() {
    if (!peerConnection) {
        peerConnection = new RTCPeerConnection(config);

        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });

        peerConnection.ontrack = (event) => {
            console.log("Remote track received:", event);
            
            const remoteVideo = document.getElementById('remoteVideo');
            console.log("Remote tracks:", event.streams[0].getTracks());

        
            if (!remoteVideo.srcObject || remoteVideo.srcObject.id !== event.streams[0].id) {
                remoteVideo.srcObject = event.streams[0];
                console.log("✅ Remote video stream set.");
            } else {
                console.log("🔁 Duplicate ontrack event ignored.");
            }
        };
        

        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                console.log("ICE Candidate:", event.candidate); // 👈 Add this
                sendMessage({ type: 'ice-candidate', candidate: event.candidate });
            } else {
                console.log("All ICE candidates sent.");
            }
        };
        

        // peerConnection.onicecandidate = (event) => {
        //     if (event.candidate) {
        //         sendMessage({ type: 'ice-candidate', candidate: event.candidate });
        //     }
        // };
    }
}


//signalling (handle incoming messages)
//message event handler
socket.on('message',async (message) => {
    if (message.sender === peerid) return; //Ignore the message if it is sent by the same peer
    console.log('Message received:', message);

    if(!mediaready){
        pendingMessages.push(message); //save for later
    }else {
        handleMessage(message);
    }
});

//handle incoming messages
async function handleMessage(message){
    console.log('Handling message:', message);
    ensurePeerConnection(); //Ensure peer connection is created

    if (message.type === 'offer'){
        await peerConnection.setRemoteDescription(new RTCSessionDescription(message.offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        sendMessage({type:'answer',answer:answer});
    }
    else if(message.type === 'answer'){
        await peerConnection.setRemoteDescription(new RTCSessionDescription(message.answer));
    }
    else if(message.type === 'ice-candidate'){
        try{
            await peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate));
        } catch(error){
            console.error("Error adding recieved ice candidate:", error);
        }
    }
}

function sendMessage(message){
    message.sender = peerid; //Add the sender id to the message
    socket.emit('message',{room:room, data : message});
}

// sendMessage({type:'hello', content: 'World!'});

//function to start the call
async function startCall() {
    ensurePeerConnection();
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    sendMessage({ type: 'offer', offer: offer });
}
