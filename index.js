const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",  // Your client app's origin
        methods: ["GET", "POST"]
      }
});

app.get('/xyz', (req, res) => {
    let list = waiting_list.map(socket => socket.id)
    let obj = Object.fromEntries(socketToRoom);
    res.send({ count: user_count, waiting_list : list, socketToRoom: obj})
});

app.use(express.static(path.join(__dirname, './build')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, './build', 'index.html'));
});

let socketToRoom = new Map()

let waiting_list = []
let user_count = 0

const processSocket = (user_socket) => {

    if (waiting_list.length > 0) {

        let peer_socket = waiting_list.pop()
        let curr_socket = user_socket

        const room_id = `${curr_socket.id}-${peer_socket.id}`

        socketToRoom.set(peer_socket.id, room_id)
        socketToRoom.set(curr_socket.id, room_id)

        peer_socket.join(room_id)
        curr_socket.join(room_id)

        // Send event to one client so that he can start the WebRTC Peer connection process
        curr_socket.emit("CONNECTION_SUCCESS")

    } else {

        waiting_list.push(user_socket)

    }

}

io.on('connection', (socket) => {

    console.log("User Connected")

    user_count = user_count + 1
    io.emit("ACTIVE_USER_COUNT", user_count)

    processSocket(socket)

    socket.on("MSG", (msg) => {
        socket.to(socketToRoom.get(socket.id)).emit("MSG", msg)
    })

    socket.on("OFFER", (offer) => {
        // console.log("OFFER ", offer)
        socket.to(socketToRoom.get(socket.id)).emit("OFFER", offer)
    })

    socket.on("ANSWER", (answer) => {
        // console.log("ANSWER ", answer)
        socket.to(socketToRoom.get(socket.id)).emit("ANSWER", answer)
    })

    socket.on("ICE_CANDIDATE", (ice_candidate) => {
        // console.log("ICE_CAN", ice_candidate)
        socket.to(socketToRoom.get(socket.id)).emit("ICE_CANDIDATE", ice_candidate)
    })

    socket.on("USER_TYPING", () => {
        socket.to(socketToRoom.get(socket.id)).emit("NOTIFICATION", "Stranger Typing ...")
    })

    socket.on("NEXT_CHAT", async () => {

        if ( user_count <= 2 ) {
            socket.emit("NOTIFICATION", "No More Users. You can Disconnect.")
            return
        }

        const room_name = socketToRoom.get(socket.id)
        socketToRoom.delete(socket.id)
        socket.emit("PEER_DISCONNECTED")  // To notify client to create new peer object
        socket.leave(room_name)

        processSocket(socket)

        let sockets_array = await io.in(room_name).fetchSockets();
        let peer_socket = sockets_array[0];
        
        // If the user who is not connected with anyone, sends the request for next chat
        // So checking if peer_socket is available then only do this request
        if(peer_socket) {
            peer_socket.emit("PEER_DISCONNECTED") // To notify client to create new peer object
            socketToRoom.delete(peer_socket.id)
            peer_socket.leave(room_name)

            processSocket(peer_socket);
        }

    })

    // Send other use the notification to reset its peer client, add him in waiting list or pair with aother
    socket.on("disconnect", async () => {

        user_count = user_count - 1
        io.emit("ACTIVE_USER_COUNT", user_count)

        // Check if he was in the room
        const room_name = socketToRoom.get(socket.id)
        socketToRoom.delete(socket.id)

        if (room_name) {
            // Pair the 2nd user with someone in waiting list or push this user in waiting list

            try {
                
                let sockets_array = await io.in(room_name).fetchSockets();
                let peer_socket = sockets_array[0];
                socketToRoom.delete(peer_socket.id)
                peer_socket.leave(room_name)

                // If the peer socket exist in room 
                peer_socket.emit("PEER_DISCONNECTED")  // To notify client to create new peer object
                if (peer_socket) processSocket(peer_socket);

            } catch (e) {

                console.log("Error : ", e.message)

            }

        } else {

            // If the user disconnectes while he was in waiting list
            waiting_list = waiting_list.filter(socket_ => socket_.id != socket.id)

        }

        console.log("User Disconnected")
    })

});

server.listen(8080, () => {
    console.log('listening on *:8080');
});
