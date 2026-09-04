const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
app.use(express.static('public'));

const players = {};
const buildings = {};

const SPAWN_POINTS = [
  { x: 0, y: 2, z: 80 },
  { x: 60, y: 2, z: 60 },
  { x: -60, y: 2, z: 60 },
  { x: 0, y: 16, z: -40 } // 城の最上階
];

function getRandomSpawn() {
  return SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)];
}

io.on('connection', (socket) => {
  socket.on('join', (data) => {
    const spawn = getRandomSpawn();
    players[socket.id] = {
      id: socket.id,
      name: data.name ? data.name.substring(0, 10) : 'Player',
      skin: data.skin || 'steve',
      x: spawn.x, y: spawn.y, z: spawn.z, rotY: 0,
      hp: 100, kills: 0, deaths: 0
    };

    socket.emit('init', { id: socket.id, players, buildings });
    socket.broadcast.emit('playerJoined', players[socket.id]);
  });

  socket.on('playerMove', (data) => {
    const p = players[socket.id];
    if (p) {
      p.x = data.x; p.y = data.y; p.z = data.z; p.rotY = data.rotY;
      socket.broadcast.emit('playerMoved', p);
    }
  });

  socket.on('buildWall', (wallData) => {
    const wallId = `wall_${Date.now()}_${Math.random()}`;
    buildings[wallId] = {
      id: wallId,
      ownerId: socket.id,
      x: wallData.x, y: wallData.y, z: wallData.z,
      rotY: wallData.rotY,
      hp: 150
    };
    io.emit('wallBuilt', buildings[wallId]);
  });

  socket.on('damageWall', (data) => {
    const wall = buildings[data.wallId];
    if (wall) {
      wall.hp -= data.damage;
      if (wall.hp <= 0) {
        delete buildings[data.wallId];
        io.emit('wallDestroyed', data.wallId);
      } else {
        io.emit('wallDamaged', { wallId: data.wallId, hp: wall.hp });
      }
    }
  });

  socket.on('hit', (data) => {
    const target = players[data.targetId];
    const attacker = players[socket.id];

    if (target && attacker && target.hp > 0) {
      target.hp -= data.damage;
      socket.emit('hitSuccess', { damage: data.damage });

      if (target.hp <= 0) {
        target.hp = 0;
        target.deaths++;
        attacker.kills++;

        // 撃破位置・スキン情報を全員に通知（ボクセル粉砕エフェクト用）
        io.emit('playerKilled', {
          victimId: target.id,
          killerName: attacker.name,
          victimName: target.name,
          weapon: data.weapon,
          x: target.x, y: target.y, z: target.z,
          skin: target.skin
        });

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
  console.log(`Minecraft Voxel Warzone Server running on port ${PORT}`);
});
