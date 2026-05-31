const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const path    = require('path');
const { v4: uuidv4 } = require('uuid');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*', methods: ['GET','POST'] },
  transports: ['websocket','polling'],
});

app.use(express.static(path.join(__dirname, '../public')));
app.use(express.json());

// ── State ──────────────────────────────────────────────────────────────────
const rooms = new Map();

function getOrCreateRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      id: roomId,
      participants: new Map(),
      config: {
        screenShare: 'host_only',
        chat: 'all',
        whiteboard: 'host_only',
        muteOnJoin: true,
        recording: false,
      },
      chatHistory: [],
      wbStrokes:   [],
    });
  }
  return rooms.get(roomId);
}

function publicRoom(room) {
  return {
    id: room.id,
    config: room.config,
    participants: Array.from(room.participants.values()).map(p => ({
      id: p.id, socketId: p.socketId, name: p.name,
      role: p.role, mic: p.mic, cam: p.cam,
      hand: p.hand, screenSharing: p.screenSharing,
    })),
  };
}

// ── REST ───────────────────────────────────────────────────────────────────
app.get('/api/room/:id', (req, res) => {
  const room = rooms.get(req.params.id);
  res.json(room ? { exists:true, count:room.participants.size } : { exists:false, count:0 });
});

// Ruta de salud para reverse proxy
app.get('/health', (_req, res) => res.json({ ok:true, rooms: rooms.size }));

// SPA fallback — todas las rutas sirven el index.html
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ── WebSocket ──────────────────────────────────────────────────────────────
io.on('connection', socket => {
  let currentRoom = null;
  let currentParticipant = null;

  socket.on('join', ({ roomId, name, role }) => {
    const room = getOrCreateRoom(roomId);
    const participant = {
      id: uuidv4(), socketId: socket.id,
      name: name || 'Usuario', role,
      mic: !room.config.muteOnJoin, cam: true,
      hand: false, screenSharing: false,
      joinedAt: Date.now(),
    };
    room.participants.set(socket.id, participant);
    socket.join(roomId);
    currentRoom = roomId;
    currentParticipant = participant;

    socket.emit('joined', {
      participant,
      room: publicRoom(room),
      chatHistory: room.chatHistory.slice(-80),
      wbStrokes:   room.wbStrokes,
    });
    socket.to(roomId).emit('participant_joined', { participant });
    console.log(`[${roomId}] +${name} (${role}) | total:${room.participants.size}`);
  });

  // WebRTC signaling
  socket.on('offer',         ({ targetId, sdp })       => io.to(targetId).emit('offer',         { fromId:socket.id, sdp }));
  socket.on('answer',        ({ targetId, sdp })       => io.to(targetId).emit('answer',        { fromId:socket.id, sdp }));
  socket.on('ice_candidate', ({ targetId, candidate }) => io.to(targetId).emit('ice_candidate', { fromId:socket.id, candidate }));

  // Media state
  socket.on('media_state', ({ mic, cam }) => {
    if (!currentRoom) return;
    const p = rooms.get(currentRoom)?.participants.get(socket.id);
    if (!p) return;
    if (mic !== undefined) p.mic = mic;
    if (cam !== undefined) p.cam = cam;
    socket.to(currentRoom).emit('participant_media', { socketId:socket.id, mic:p.mic, cam:p.cam });
  });

  // Screen share
  socket.on('screen_share', ({ active }) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    const p = room?.participants.get(socket.id);
    if (!p) return;
    const allowed = room.config.screenShare === 'all' || p.role === 'profesor';
    if (!allowed) { socket.emit('error', { msg:'Solo el profesor puede compartir pantalla.' }); return; }
    p.screenSharing = active;
    io.to(currentRoom).emit('screen_share_change', { socketId:socket.id, active, name:p.name });
  });

  // Hand raise
  socket.on('hand_raise', ({ raised }) => {
    if (!currentRoom) return;
    const p = rooms.get(currentRoom)?.participants.get(socket.id);
    if (!p) return;
    p.hand = raised;
    io.to(currentRoom).emit('hand_change', { socketId:socket.id, name:p.name, raised });
  });

  // Chat
  socket.on('chat_message', ({ text }) => {
    if (!currentRoom || !text?.trim()) return;
    const room = rooms.get(currentRoom);
    const p = room?.participants.get(socket.id);
    if (!p) return;
    const allowed = room.config.chat === 'all' || p.role === 'profesor';
    if (!allowed) { socket.emit('error', { msg:'El chat está restringido.' }); return; }
    const msg = { id:uuidv4(), sender:p.name, role:p.role, text:text.trim(), time:Date.now() };
    room.chatHistory.push(msg);
    if (room.chatHistory.length > 200) room.chatHistory.shift();
    io.to(currentRoom).emit('chat_message', msg);
  });

  // Whiteboard
  socket.on('wb_stroke', stroke => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    const p = room?.participants.get(socket.id);
    if (!p) return;
    const allowed = room.config.whiteboard === 'all' || p.role === 'profesor';
    if (!allowed) { socket.emit('error', { msg:'Solo el profesor puede dibujar.' }); return; }
    room.wbStrokes.push(stroke);
    if (room.wbStrokes.length > 2000) room.wbStrokes = room.wbStrokes.slice(-1500);
    socket.to(currentRoom).emit('wb_stroke', stroke);
  });

  socket.on('wb_clear', () => {
    if (!currentRoom) return;
    const p = rooms.get(currentRoom)?.participants.get(socket.id);
    if (!p || p.role !== 'profesor') return;
    rooms.get(currentRoom).wbStrokes = [];
    io.to(currentRoom).emit('wb_clear');
  });

  // Host controls
  socket.on('mute_participant', ({ targetSocketId }) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    const p = room?.participants.get(socket.id);
    if (!p || p.role !== 'profesor') return;
    const target = room.participants.get(targetSocketId);
    if (!target) return;
    target.mic = false;
    io.to(targetSocketId).emit('force_mute');
    io.to(currentRoom).emit('participant_media', { socketId:targetSocketId, mic:false, cam:target.cam });
  });

  socket.on('kick_participant', ({ targetSocketId }) => {
    if (!currentRoom) return;
    const p = rooms.get(currentRoom)?.participants.get(socket.id);
    if (!p || p.role !== 'profesor') return;
    io.to(targetSocketId).emit('kicked');
    io.sockets.sockets.get(targetSocketId)?.disconnect(true);
  });

  socket.on('mute_all', () => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    const p = room?.participants.get(socket.id);
    if (!p || p.role !== 'profesor') return;
    room.participants.forEach((part, sid) => {
      if (part.role !== 'profesor') {
        part.mic = false;
        io.to(sid).emit('force_mute');
      }
    });
    io.to(currentRoom).emit('all_muted');
  });

  socket.on('update_config', config => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    const p = room?.participants.get(socket.id);
    if (!p || p.role !== 'profesor') return;
    Object.assign(room.config, config);
    io.to(currentRoom).emit('config_updated', room.config);
  });

  socket.on('recording_state', ({ active }) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    const p = room?.participants.get(socket.id);
    if (!p || p.role !== 'profesor') return;
    room.config.recording = active;
    io.to(currentRoom).emit('recording_changed', { active });
  });

  socket.on('disconnect', () => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room) return;
    const p = room.participants.get(socket.id);
    room.participants.delete(socket.id);
    if (p) {
      io.to(currentRoom).emit('participant_left', { socketId:socket.id, name:p.name });
      console.log(`[${currentRoom}] -${p.name} | remaining:${room.participants.size}`);
    }
    if (room.participants.size === 0) { rooms.delete(currentRoom); }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 GooPro — Sbalott Ecosystem`);
  console.log(`   Local:   http://localhost:${PORT}`);
  console.log(`   Network: http://0.0.0.0:${PORT}`);
  console.log(`   Health:  http://localhost:${PORT}/health\n`);
});
