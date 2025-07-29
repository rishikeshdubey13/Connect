let username = "";
let socket;
let room = "";
let peerid = Math.floor(Math.random()*1000000); //Generate a random peer id
let mediaready = false; //Flag to check if the media is ready
let iscaller = false; //Flag to check if the user is the caller
let localStream;
let peerConnection;
let pendingMessages = []; 
let speechSocket;
let isTranscribing = false; // Flag to check
let lastSend = 0;
let subtitleTimeout;


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
        document.getElementById("authSection").style.display = "none";
        document.getElementById("mainApp").style.display = "block";
}
};

function getSrviceUrl(service){
    const isDocker = window.location.hostname !== 'localhost' && window.location.hostname !=='127.0.0.1';

    const ports = {
        'signaling': 5001,
        'speech': 5003,
        'auth': 5002,
        'translation': 5004,
    }

    return isDocker ? `http://${service}:${ports[service]}` : `http://localhost:${ports[service]}`;

}

const Translation_url = getSrviceUrl('translation');
const translationSocket = io(Translation_url);

// translationSocket.on('connect_error', (err) => {
//     console.error("Translation service connection failed:", err);
//     alert("Unable to connect to the translation service. Please try again later.");
// });

function stopTranscription(callId) {
    if (speechSocket) {
        speechSocket.emit('end_transcription', { call_id: callId });
        isTranscribing = false;
        speechSocket.disconnect();
        speechSocket = null;
        console.log("Transcription stopped for call:", callId);

    }
}

function joinRoom(event) {
    event.preventDefault();
    room = document.getElementById('roomInput').value.trim(); //trim the input to remove any extra spaces
    if(!room) return alert("Please enter a room name");

    document.getElementById('joinForm').style.display = 'none'; //Hide the join form
    document.getElementById('videoSection').style.display = 'block'; //Show the video section
    document.getElementById('roomName').innerText = room; //Set the room name in the video section


    
    const SIGNALING_URL = getSrviceUrl('signaling'); 
    socket = io(SIGNALING_URL);

    

    // Start transcription with the room name
    
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
    navigator.mediaDevices.getUserMedia({ video: true, audio: { channelCount: 1, sampleRate: 16000 } })
        .then(stream => {
        localStream = stream;
        document.getElementById('localVideo').srcObject = stream;
        mediaready = true; //Set the media ready flag to true
        console.log('Media devices ready');

        async function startTranscription(callId) {
            if (!window.AudioWorklet) {
                console.error("AudioWorklet is not supported in this browser");
                alert("Your browser does not support AudioWorklet. Please use a modern browser.");
                return;
            }
            
            const isDocker = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
            const SPEECH_URL = getSrviceUrl('speech'); 
            console.log("Connecting to speech service at:", SPEECH_URL);
            speechSocket = io(SPEECH_URL, { reconnectionAttempts: 5, reconnectionDelay: 5000 });
            const targetLang =  document.getElementById('targetLanguage').value; 

            
            speechSocket.on('connect', async () => {
                console.log("Connected to speech service");
                speechSocket.emit('start_transcription', { call_id: callId, target_lang: targetLang });
                isTranscribing = true;

                try {
                    const audioContext = new AudioContext({ sampleRate: 16000 });
                    await audioContext.audioWorklet.addModule('/static/js/processor.js');
                    if (audioContext.state === 'suspended') {
                        await audioContext.resume();
                    }
        
                    const processor = new AudioWorkletNode(audioContext, 'audio-processor');
        
                    processor.port.onmessage = (event) => {
                        const audioData = event.data;
                        if (isTranscribing && Date.now() - lastSend > 250) {
                            if (audioData && audioData.length > 0) {
                                speechSocket.emit('audio_chunk', {
                                    audio: Array.from(audioData),  
                                    call_id: callId,
                                    target_lang: targetLang 
                                });
                                lastSend = Date.now();
                            }
                        }
                    };
            
                    const source = audioContext.createMediaStreamSource(localStream);
                    source.connect(processor);
                    processor.connect(audioContext.destination);
            } catch (err) {
                console.error("Error setting up AudioWorklet:", err);
                speechSocket.emit('transcription_error', { call_id: callId, error: 'AudioWorklet setup failed: ' + err.message });
            }
        });
        
            speechSocket.on('connect_error', (err) => {
                console.error("Speech service connection failed:", err);
                isTranscribing = false;
                setTimeout(() => {
                    if (speechSocket) {
                        speechSocket.connect();
                    }
                }, 5000); // Retry after 5 seconds
            });

            translationSocket.on('connect_error', (err) => {
                console.error("Translation service connection failed:", err);
                setTimeout(() => {
                    translationSocket.connect();
                }, 5000); // Retry after 5 seconds
            });
        
            //Added two new event listener for translation_update.
            // for orginal
            speechSocket.on('transcription_update', (data) => {
                console.log('Transcription update recived:', data);
                if (data && data.text) {
                    displaySubtitle(data.text, 'original');
                }
            });

            // for translated text
            speechSocket.on('translation_update', (data) => {
                console.log("Translation update received:", data);
                if (data && data.translated) {
                    displaySubtitle(data.translated, 'translated');
                }
            });
        }
        
        
        
        
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
        startTranscription(room); 
 
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


//function to start the call
async function startCall() {
    ensurePeerConnection();
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    sendMessage({ type: 'offer', offer: offer });

    socket.emit('start_call', {
        token: localStorage.getItem("token"),
        room: room
    });
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

        socket.emit('end_call', {
            token: localStorage.getItem("token"),
            room: room
        });

        if (socket && socket.connected) {
            socket.emit('leave', room);
            socket.disconnect();
            socket = null;
        }
        stopTranscription(room);
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

         //reset speechSocket
        if(speechSocket){
            speechSocket.disconnect();
            speechSocket = null;
    }

        //reset the UI
        document.getElementById('videoSection').style.display = "none";
        document.getElementById('joinForm').style.display = "block";
        document.getElementById('roomInput').value = "";

        console.log("Call ended and resources cleaned up.");
        document.getElementById('messages').innerHTML = '';
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
    messagesDiv.scrollTop = messagesDiv.scrollHeight; // Auto-scroll
}


function displaySubtitle(text, type = 'original') {
    const subtitleDiv = document.getElementById('subtitleDisplay');
    if (!subtitleDiv) {
        console.warn("Subtitle display element not found");
        return;
    }
    const subtitleElement = document.createElement('div');
    subtitleElement.className = type === 'original' ? 'subtitle-original' : 'subtitle-translated';
    subtitleElement.innerText = text;
    subtitleDiv.appendChild(subtitleElement);


    clearTimeout(subtitleTimeout);
    subtitleTimeout = setTimeout(() => {
        subtitleDiv.innerText = '';
    }, 5000);
}


const AUTH_API = getSrviceUrl('auth');



function register() {
    const u = document.getElementById("usernameInput").value;
    const p = document.getElementById("passwordInput").value;
    if (!u || !p) {
        alert("Please enter both username and password.");
        return;
    }
    
    
    fetch(`${getSrviceUrl('auth')}/register`, {
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
    fetch(`${getSrviceUrl('auth')}/login`, {
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

    fetch(`${getSrviceUrl('auth')}/me`, {
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
        
        username = data.username; // Set the global username variable
        document.getElementById("roomUsername").innerText = data.username;
        localStorage.setItem("username", data.username);
        console.log("Logged in as:", data.username);
    })
    .catch(err => {
        console.error(err);
        logout();
    });
}

function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    username = "";
    location.reload(); // refresh page to go back to login
    document.getElementById("mainApp").style.display = "none";
    document.getElementById("authSection").style.display = "block";
}

