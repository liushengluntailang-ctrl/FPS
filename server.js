const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

app.use(express.static(path.join(__dirname, "public")));

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  transports: ["polling", "websocket"],
  allowEIO3: true
});

// 部屋データ（リロードしても消えないようにメモリに保持）
const rooms = {};

function getRoomList() {
  return Object.values(rooms).map(r => ({
    id: r.id,
    name: r.name,
    mode: r.mode,
    playerCount: Object.keys(r.players).length
  }));
}

io.on("connection", (socket) => {
  let currentRoomId = null;

  socket.on("getRooms", () => {
    socket.emit("roomList", getRoomList());
  });

  socket.on("createRoom", ({ name, mode }) => {
    const roomId = "room_" + Math.random().toString(36).substring(2, 9);
    rooms[roomId] = {
      id: roomId,
      name: name || "部屋 " + roomId.substring(5),
      mode: mode || "custom",
      players: {},
      blocks: {}
    };
    io.emit("roomList", getRoomList());
    socket.emit("roomCreated", roomId);
  });

  socket.on("joinRoom", ({ roomId, playerName }) => {
    // 部屋がなければ自動作成して復元
    if (!rooms[roomId]) {
      rooms[roomId] = {
        id: roomId,
        name: "復帰した部屋",
        mode: "skywars",
        players: {},
        blocks: {}
      };
    }
    const room = rooms[roomId];
    currentRoomId = roomId;
    socket.join(roomId);

    room.players[socket.id] = {
      id: socket.id,
      name: playerName || "Steve",
      x: 0, y: 15, z: 0,
      yaw: 0, pitch: 0,
      hp: 100
    };

    socket.emit("roomJoined", {
      roomInfo: { id: room.id, name: room.name, mode: room.mode },
      myPlayer: room.players[socket.id],
      players: room.players,
      blocks: room.blocks
    });

    socket.to(roomId).emit("playerJoinedRoom", room.players[socket.id]);
    io.emit("roomList", getRoomList());
  });

  socket.on("move", (pos) => {
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId];
    if (room.players[socket.id]) {
      Object.assign(room.players[socket.id], pos);
      socket.to(currentRoomId).emit("playerMoved", { id: socket.id, ...pos });
    }
  });

  socket.on("placeBlock", (block) => {
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const key = `${block.x},${block.y},${block.z}`;
    rooms[currentRoomId].blocks[key] = block.type;
    io.to(currentRoomId).emit("blockPlaced", block);
  });

  socket.on("breakBlock", (pos) => {
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const key = `${pos.x},${pos.y},${pos.z}`;
    delete rooms[currentRoomId].blocks[key];
    io.to(currentRoomId).emit("blockBroken", pos);
  });

  socket.on("action", (act) => {
    if (!currentRoomId) return;
    socket.to(currentRoomId).emit("playerAction", { fromId: socket.id, ...act });
  });

  // 退出時：部屋自体は削除せずプレイヤーだけ減らす（リロード対策）
  function leave() {
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId];
    delete room.players[socket.id];
    socket.leave(currentRoomId);
    socket.to(currentRoomId).emit("playerLeftRoom", socket.id);
    currentRoomId = null;
    io.emit("roomList", getRoomList());
  }

  socket.on("leaveRoom", leave);
  socket.on("disconnect", leave);
});

const PORT = process.env.PORT || 8000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server listening on 0.0.0.0:${PORT}`);
});
