const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
app.use(express.static('public'));

const players = {};

// リスポーン地点（立体マップ用）
const SPAWN_POINTS = [
  { x: 0, y: 2, z: 25 },
  { x: 0, y: 2, z: -25 },
  { x: 25, y: 2, z: 0 },
  { x: -25, y: 2, z: 0 },
  { x: 0, y: 10, z: 0 } // 中央の高台
];

function getRandomSpawn() {
  return SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)];
}

io.on('connection', (socket) => {
  console.log(`接続: ${socket.id}`);

  socket.on('join', (name) => {
    const spawn = getRandomSpawn();
    players[socket.id] = {
      id: socket.id,
      name: name ? name.substring(0, 10) : 'Player',
      x: spawn.x,
      y: spawn.y,
      z: spawn.z,
      rotY: 0,
      hp: 100,
      kills: 0,
      deaths: 0,
      color: `hsl(${Math.floor(Math.random() * 360)}, 80%, 50%)`
    };

    // 初期化データを送信
    socket.emit('init', { id: socket.id, players });
    socket.broadcast.emit('playerJoined', players[socket.id]);
  });

  // プレイヤー移動・回転の同期
  socket.on('playerMove', (data) => {
    const p = players[socket.id];
    if (p) {
      p.x = data.x;
      p.y = data.y;
      p.z = data.z;
      p.rotY = data.rotY;
      socket.broadcast.emit('playerMoved', p);
    }
  });

  // 攻撃ヒット判定
  socket.on('hit', (data) => {
    const target = players[data.targetId];
    const attacker = players[socket.id];

    if (target && attacker && target.hp > 0) {
      target.hp -= data.damage;
      
      // 攻撃者にヒット通知（ヒットマーカー用）
      socket.emit('hitSuccess', { damage: data.damage });

      if (target.hp <= 0) {
        // キル発生
        target.hp = 0;
        target.deaths++;
        attacker.kills++;

        io.emit('killLog', { killer: attacker.name, victim: target.name, weapon: data.weapon });

        // 2秒後にリスポーン
        setTimeout(() => {
          if (players[target.id]) {
            const spawn = getRandomSpawn();
            players[target.id].hp = 100;
            players[target.id].x = spawn.x;
            players[target.id].y = spawn.y;
            players[target.id].z = spawn.z;
            io.emit('playerRespawn', players[target.id]);
          }
        }, 2000);
      } else {
        io.emit('playerDamaged', { id: target.id, hp: target.hp });
      }
    }
  });

  socket.on('disconnect', () => {
    delete players[socket.id];
    io.emit('playerLeft', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`3D FPS Server running on port ${PORT}`);
});