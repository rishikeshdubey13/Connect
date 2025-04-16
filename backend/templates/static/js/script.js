//To access the webcam
navigator.mediaDevices.getUserMedia({video:true, audio: true})
.then(stream => {
    const localVideo=document.getElementById('localVideo');
    localVideo.srcObject = stream;
})
.catch(err => {
    console.error("Erorr accessing media devices: ", err);
    alert("Error accessing media devices: " + err);
})


const socket = io(); //Connect flask-socketio server
 socket.on('connect', () => {
    console.log('Connected to server')
});
const room  ='testroom'; //Room name
socket.emit('join', room); //Join the room

//message event handler
socket.on('message',(message) => {
    console.log('Got Message: ', message);
})

//function to send message
function sendMessage(message){
    socket.emit('message',{room:room, data : message});
}

sendMessage({type:'hello', content: 'World!'});

//CREATE RTC PEER CONNECTION
