import { Server } from "socket.io";

let connections = {}; // roomId -> [socketId, ...]
let roomParticipants = {}; // roomId -> { [socketId]: { socketId, username, joinedAt } }
let socketToRoom = {}; // socketId -> roomId
let messages = {}; // roomId -> [{ sender, data, 'socket-id-sender', time }]
let timeOnline = {};

const normalizeRoomId = (room) => {
    if (!room) return "";
    let clean = String(room).trim();
    if (clean.includes("/")) {
        const parts = clean.split("/").filter(Boolean);
        clean = parts[parts.length - 1] || clean;
    }
    return clean.toLowerCase();
};

const findRoomBySocketId = (sockId) => {
    for (const [room, clientList] of Object.entries(connections)) {
        if (Array.isArray(clientList) && clientList.includes(sockId)) {
            return room;
        }
    }
    return null;
};

export const connectToSocket = (server) => {
    const io = new Server(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"],
            allowedHeaders: ["*"],
            credentials: true
        }
    });

    const leaveCurrentRoom = (sock) => {
        const roomId = socketToRoom[sock.id] || findRoomBySocketId(sock.id);
        if (!roomId) return;

        console.log(`[Socket] ${sock.id} leaving room "${roomId}"`);
        try {
            sock.leave(roomId);
        } catch (e) {
            console.error(`[Socket] Error leaving room ${roomId}:`, e);
        }
        delete socketToRoom[sock.id];

        if (roomParticipants[roomId]) {
            delete roomParticipants[roomId][sock.id];
        }

        if (connections[roomId]) {
            const idx = connections[roomId].indexOf(sock.id);
            if (idx !== -1) {
                connections[roomId].splice(idx, 1);
            }

            // Notify remaining participants in the room
            console.log(`[Socket] Emitting user-left ${sock.id} to room "${roomId}". Remaining count: ${connections[roomId].length}`);
            io.to(roomId).emit("user-left", sock.id);
            const remaining = Object.values(roomParticipants[roomId] || {});
            io.to(roomId).emit("participants-update", remaining);

            if (connections[roomId].length === 0) {
                console.log(`[Socket] Room "${roomId}" is now empty. Cleaning up.`);
                delete connections[roomId];
                delete roomParticipants[roomId];
                delete messages[roomId];
            }
        }
        delete timeOnline[sock.id];
    };

    io.on("connection", (socket) => {
        console.log(`[Socket] Client connected: ${socket.id}`);

        socket.on("join-call", (path, username) => {
            const rawRoom = typeof path === 'object' && path !== null ? (path.path || path.room || path.meetingCode) : path;
            const displayName = typeof path === 'object' && path !== null ? path.username : username;
            const roomId = normalizeRoomId(rawRoom);

            if (!roomId) {
                console.warn(`[Socket] join-call attempted with empty room from ${socket.id}`);
                return;
            }

            // Leave previous room if socket was already in a different room
            const prevRoom = socketToRoom[socket.id];
            if (prevRoom && prevRoom !== roomId) {
                leaveCurrentRoom(socket);
            }

            socket.join(roomId);
            socketToRoom[socket.id] = roomId;

            if (!connections[roomId]) {
                connections[roomId] = [];
            }
            if (!connections[roomId].includes(socket.id)) {
                connections[roomId].push(socket.id);
            }

            if (!roomParticipants[roomId]) {
                roomParticipants[roomId] = {};
            }
            roomParticipants[roomId][socket.id] = {
                socketId: socket.id,
                username: displayName || "Participant",
                joinedAt: new Date().toISOString()
            };

            timeOnline[socket.id] = new Date();

            const participantList = Object.values(roomParticipants[roomId]);
            console.log(`[Socket] ${socket.id} (${displayName || 'Participant'}) joined room "${roomId}". Total participants: ${participantList.length}`);

            // Confirm room membership to the joining socket
            socket.emit("room-joined", {
                roomId: roomId,
                socketId: socket.id,
                participants: participantList
            });

            // Announce to all participants in the room
            io.to(roomId).emit("user-joined", socket.id, connections[roomId], participantList);

            // Authoritative participant synchronization
            io.to(roomId).emit("participants-update", participantList);

            // Send existing chat messages to newly joined user
            if (messages[roomId] !== undefined && Array.isArray(messages[roomId])) {
                for (let a = 0; a < messages[roomId].length; ++a) {
                    socket.emit(
                        "chat-message",
                        messages[roomId][a]['data'],
                        messages[roomId][a]['sender'],
                        messages[roomId][a]['socket-id-sender'],
                        messages[roomId][a]['time']
                    );
                }
            }
        });

        socket.on("signal", (toId, message) => {
            let targetId = toId;
            let payload = message;

            if (typeof toId === 'object' && toId !== null && !message) {
                targetId = toId.toId || toId.to || toId.recipientId;
                payload = toId;
            }

            if (!targetId) {
                console.warn(`[Socket] signal event from ${socket.id} without recipient target ID`);
                return;
            }

            io.to(targetId).emit("signal", socket.id, payload);
        });

        socket.on("change-guest-access", (path, allowGuests) => {
            const roomId = normalizeRoomId(path);
            if (roomId) {
                io.to(roomId).emit("guest-access-updated", allowGuests);
            }
        });

        socket.on("chat-message", (data, sender) => {
            const roomId = socketToRoom[socket.id] || findRoomBySocketId(socket.id);
            if (!roomId) {
                console.warn(`[Socket] chat-message received from ${socket.id} without room`);
                return;
            }

            if (!messages[roomId]) {
                messages[roomId] = [];
            }

            const senderName = sender || roomParticipants[roomId]?.[socket.id]?.username || "Participant";
            const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            const msgObj = {
                sender: senderName,
                data: data,
                'socket-id-sender': socket.id,
                time: timeStr
            };

            messages[roomId].push(msgObj);
            console.log(`[Socket] message in "${roomId}" from ${senderName}:`, data);

            io.to(roomId).emit("chat-message", data, senderName, socket.id, timeStr);
        });

        socket.on("leave-call", () => {
            leaveCurrentRoom(socket);
        });

        socket.on("disconnect", () => {
            console.log(`[Socket] Client disconnected: ${socket.id}`);
            leaveCurrentRoom(socket);
        });
    });

    return io;
};

export default connectToSocket;