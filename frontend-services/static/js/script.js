let username = "";
let socket;
let room = "";
let peerid = Math.floor(Math.random()*1000000); //Generate a random peer id
let mediaready = false; //Flag to check if the media is ready
let iscaller = false; //Flag to check if the user is the caller
let localStream;
let peerConnection;
let pendingMessages = []; //Array to store pending messages

const config = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
        { urls: "stun:stun3.l.google.com:19302" },
        { urls: "stun:stun4.l.google.com:19302" }
    ]
};


window.onload  = () => {
    const token = localStorage.getItem("token");
    if (token) {
        fetchMe();
        document.getElementById("authSection").style.display = "block";
        document.getElementById("mainApp").style.display = "none";
}
};
//Moving everything to the joinRoom function

function joinRoom() {
    room = document.getElementById('roomInput').value.trim(); //trim the input to remove any extra spaces
    if(!room) return alert("Please enter a room name");

    document.getElementById('joinForm').style.display = 'none'; //Hide the join form
    document.getElementById('videoSection').style.display = 'block'; //Show the video section
    document.getElementById('roomName').innerText = room; //Set the room name in the video section


    const isDocker = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
    const SIGNALING_URL = isDocker ? 'http://signaling:5001' : 'http://localhost:5001';
    socket = io(SIGNALING_URL);

    // socket = io("http://signaling:5001");  // Use service name in Docker
    // const isDocker = window.location.hostname !== 'localhost';
    // const SIGNALING_URL = isDocker ? 'http://signaling:5001' : 'http://localhost:5001';
    // socket = io(SIGNALING_URL);

    
    //Connect to the socket server

    if (socket) {
        socket.on('leave', () => {
            console.log("Other peer has left the call.");
            alert("The other person has left the call.");
            cleanUp();
        });
    }
    

    socket.on('connect', () => {
        console.log("Connected to server with socket ID:", socket.id);
        const joinData = { room: room, token: localStorage.getItem("token")};
        console.log("Join Data:", joinData)
        socket.emit('join', joinData); //Join the room
    });

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

    // socket.on('chat', data => {
    //     if (data.sender !== peerid) {
    //         console.log("Chat received:", data);
    //         addMessage(`Peer: ${data.message}`);
    //     }
    // });
    if (socket) {
        socket.on('chat', data => {
            if (username && data.sender !== username) {
                addMessage(`${data.sender}: ${data.message}`);
            }
        });
    }


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
    
}


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
                console.log("ICE Candidate:", event.candidate); 
                sendMessage({ type: 'ice-candidate', candidate: event.candidate });
            } else {
                console.log("All ICE candidates sent.");
            }
        };

        peerConnection.oniceconnectionstatechange = () => {
            console.log("ICE connection State: ", peerConnection.iceConnectionState);
        };

        peerConnection.onicegatheringstatechange = () => {
            console.log("ICE gathering State:", peerConnection.iceGatheringState);
        };   
        

    }
}

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
    socket.emit('message',{room:room, data : message, token: localStorage.getItem("token")});
}

// sendMessage({type:'hello', content: 'World!'});

//function to start the call
async function startCall() {
    ensurePeerConnection();
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    sendMessage({ type: 'offer', offer: offer });
}
function toggleMute(){
    if(!localStream) return;

    const audioTracks = localStream.getAudioTracks()[0];
    if(!audioTracks) return alert("No auidio tracks found");

    audioTracks.enabled = !audioTracks.enabled; //Toggle the audio track
    document.getElementById('muteBtn').innerText = audioTracks.enabled ? "Mute":"Unmute";
}

function toggleVideo(){
    if(!localStream) return;

    const videoTracks = localStream.getVideoTracks()[0];
    if(!videoTracks) return alert("No video tracks found");

    videoTracks.enabled = !videoTracks.enabled; //Toggle the video track
    document.getElementById('videoBtn').innerText = videoTracks.enabled ? "Turn Camera Off" : "Turn Camera On";
}

function hangUp(){
    console.log("hanging up...");

    if (socket && socket.connected) {
        socket.emit('leave', room);
        socket.disconnect();
        socket = null;
    }
    cleanUp();
}

function cleanUp(){
    //stop the local stream
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;

    //close peer connection
    if(peerConnection){
        peerConnection.close();
        peerConnection = null;
    }

    //remove video streams
    document.getElementById('localVideo').srcObject = null;
    document.getElementById('remoteVideo').srcObject = null;

    //reset the flags
    mediaready = false;
    iscaller =false;
    pendingMessages = [];

    //reset the socket
    if(socket){
        socket.disconnect();
        socket = null;
    }


    //reset the UI
    document.getElementById('videoSection').style.display = "none";
    document.getElementById('joinForm').style.display = "block";
    document.getElementById('roomInput').value = "";

    console.log("Call ended and resources cleaned up.");

}

function sendChat() {
    const msg = document.getElementById('chatInput').value.trim();
    if (!msg || !socket) return;

    console.log("Sending chat message:", msg);

    socket.emit('chat', { 
        room: room, 
        message: msg, 
        sender: username, 
        token: localStorage.getItem("token")
    });
    
    addMessage(`You: ${msg}`);
    document.getElementById('chatInput').value = '';
}

function addMessage(text) {
    const messagesDiv = document.getElementById('messages');
    const msgElem = document.createElement('div');
    msgElem.textContent = text;
    messagesDiv.appendChild(msgElem);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}




const AUTH_API = "http://auth:5002"; // auth-service

function register() {
    const u = document.getElementById("usernameInput").value;
    const p = document.getElementById("passwordInput").value;
    if (!u || !p) {
        alert("Please enter both username and password.");
        return;
    }
    fetch("http://localhost:5002/register", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ username: u, password: p })
    }).then(res => res.json())
      .then(data => {
          if (data.message) {
              document.getElementById("authMsg").innerText = "Registered successfully. Please log in.";
          } else {
              document.getElementById("authMsg").innerText = data.error || "Error during registration.";
          } 
      });
}

function login() {
    const u = document.getElementById("usernameInput").value;   
    const p = document.getElementById("passwordInput").value;
    if (!u || !p) {
        alert("Please enter both username and password.");
        return;
    }
    fetch("http://localhost:5002/login", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ username: u, password: p })
    }).then(res => res.json())
      .then(data => {
          if (data.message === "Login successful") {
              username = data.username || u; // Set username from server response or input
              localStorage.setItem("token", data.token); //Store the token in local storage

              document.getElementById("roomUsername").innerText = username;
              document.getElementById("authSection").style.display = "none";
              document.getElementById("mainApp").style.display = "block";
          } else {
              document.getElementById("authMsg").innerText = data.error || "Login failed.";
          }
      });
}
function fetchMe() {
    const token = localStorage.getItem("token");
    if (!token) return;

    fetch("http://localhost:5002/me", {
        method: "GET",
        headers: {
            "Authorization": "Bearer " + token
        }
    })
    .then(res => {
        if (!res.ok) {
            throw new Error("Unauthorized");
        }
        return res.json();
    })
    .then(data => {
        document.getElementById("roomUsername").innerText = data.username;
        localStorage.setItem("username", data.username);
        console.log("Logged in as:", data.username);
        // you can update UI here
    })
    .catch(err => {
        console.error(err);
        logout();
    });
}

function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    location.reload(); // refresh page to go back to login
    document.getElementById("mainApp").style.display = "none";
    document.getElementById("authSection").style.display = "block";
}

