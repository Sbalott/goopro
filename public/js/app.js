// ── GooPro App ─────────────────────────────────────────────────────────────
let socket=null, rtcMgr=null, wb=null;
let myRole='profesor', myName='', mySocketId='', currentRoom='';
let micOn=true, camOn=true, screenOn=false, handRaised=false, recording=false;
let sideView='chat', mainView='video', chatUnread=0;
let remoteVideos=new Map(), participants=new Map();
let previewStream=null, previewMicOn=true, previewCamOn=true;
const COLORS=['#0ea5e9','#6366f1','#22c55e','#f59e0b','#ec4899','#ef4444','#a855f7','#14b8a6'];

// Leer parámetros de URL (para links de invitación)
function readUrlParams() {
  const p = new URLSearchParams(window.location.search);
  if (p.get('room')) document.getElementById('inp-room').value = p.get('room');
  if (p.get('role')) {
    const r = p.get('role');
    setRole(r, document.getElementById(r==='profesor'?'role-prof':'role-alu'));
  }
}

// ── Lobby ──────────────────────────────────────────────────────────────────
async function initPreview() {
  const lbl = document.getElementById('preview-label');
  try {
    previewStream = await navigator.mediaDevices.getUserMedia({ video:true, audio:true });
    document.getElementById('preview-video').srcObject = previewStream;
    lbl.textContent = '✓ Cámara y micrófono activos';
  } catch(e) {
    lbl.textContent = '⚠ Sin cámara: ' + e.message;
  }
}

function togglePreviewMic() {
  previewMicOn = !previewMicOn;
  previewStream?.getAudioTracks().forEach(t => t.enabled = previewMicOn);
  document.getElementById('prev-mic').classList.toggle('off', !previewMicOn);
  document.getElementById('prev-mic-icon').className = previewMicOn ? 'ti ti-microphone' : 'ti ti-microphone-off';
}
function togglePreviewCam() {
  previewCamOn = !previewCamOn;
  previewStream?.getVideoTracks().forEach(t => t.enabled = previewCamOn);
  document.getElementById('prev-cam').classList.toggle('off', !previewCamOn);
  document.getElementById('prev-cam-icon').className = previewCamOn ? 'ti ti-video' : 'ti ti-video-off';
}
function setRole(r, btn) {
  myRole = r;
  document.querySelectorAll('.role-card').forEach(b => b.classList.remove('active'));
  btn?.classList.add('active');
}
function genRoomId() {
  const adj=['clase','sala','aula','grupo','modulo','curso'];
  document.getElementById('inp-room').value = adj[Math.floor(Math.random()*adj.length)]+'-'+Math.floor(Math.random()*900+100);
}

async function joinRoom() {
  myName    = document.getElementById('inp-name').value.trim();
  currentRoom = document.getElementById('inp-room').value.trim().toLowerCase().replace(/\s+/g,'-');
  const err = document.getElementById('lobby-error');
  if (!myName)     { err.textContent='Ingresa tu nombre'; return; }
  if (!currentRoom){ err.textContent='Ingresa el ID de sala'; return; }
  err.textContent = '';

  // Limpiar URL
  window.history.replaceState({}, '', window.location.pathname);

  previewStream?.getTracks().forEach(t => t.stop());
  previewStream = null;

  socket = io({ transports:['websocket','polling'] });
  socket.on('connect', () => {
    mySocketId = socket.id;
    document.getElementById('conn-dot').classList.remove('disconnected');
    socket.emit('join', { roomId:currentRoom, name:myName, role:myRole });
  });
  socket.on('disconnect', () => {
    document.getElementById('conn-dot').classList.add('disconnected');
    toast('Desconectado');
  });
  socket.on('connect_error', e => err.textContent = 'Error: '+e.message);

  rtcMgr = new WebRTCManager(socket);
  rtcMgr.onRemoteStream = handleRemoteStream;
  rtcMgr.onPeerLeft = removePeerVideo;
  window.onScreenShareEnded = () => {
    screenOn = false;
    socket.emit('screen_share', { active:false });
    document.getElementById('screen-tab').style.display = 'none';
    if (mainView==='screen') switchMain('video', document.querySelector('.mtab[data-view="video"]'));
    updateCtlState();
    toast('Compartición de pantalla terminada');
  };

  const stream = await rtcMgr.startLocalMedia();
  micOn = stream ? previewMicOn : false;
  camOn = stream ? previewCamOn : false;
  if (stream) {
    stream.getAudioTracks().forEach(t => t.enabled = micOn);
    stream.getVideoTracks().forEach(t => t.enabled = camOn);
  }

  setupSocketEvents();

  // Mostrar sala
  document.getElementById('lobby').style.display = 'none';
  document.getElementById('room').style.display  = 'flex';
  document.getElementById('tb-room-id').textContent = currentRoom;
  document.getElementById('tb-my-name').textContent  = myName;
  document.getElementById('tb-role-badge').textContent  = myRole;
  document.getElementById('tb-role-badge').className = 'role-badge '+myRole;

  if (myRole==='profesor') {
    document.getElementById('ctl-rec').style.display      = '';
    document.getElementById('ctl-mute-all').style.display = '';
    document.getElementById('stab-settings').style.display= '';
  }
  updateCtlState();
}

function setupSocketEvents() {
  socket.on('joined', ({ participant, room, chatHistory, wbStrokes }) => {
    participants.clear();
    room.participants.forEach(p => participants.set(p.socketId, p));
    addLocalVideo();
    setTimeout(() => {
      wb = new Whiteboard('wb-canvas', socket, myRole);
      if (wbStrokes?.length) wb.replayStrokes(wbStrokes);
    }, 400);
    chatHistory.forEach(m => appendChatMsg(m, false));
    renderPeople();
    updateParticipantCount();
    toast('✓ Conectado — sala: ' + currentRoom);
  });

  socket.on('participant_joined', ({ participant }) => {
    participants.set(participant.socketId, participant);
    renderPeople(); updateParticipantCount();
    toast(participant.name + ' entró');
    setTimeout(() => rtcMgr.addPeerWithOffer(participant.socketId), 800);
  });

  socket.on('participant_left', ({ socketId, name }) => {
    participants.delete(socketId);
    removePeerVideo(socketId);
    renderPeople(); updateParticipantCount();
    toast(name + ' salió');
  });

  socket.on('participant_media', ({ socketId, mic, cam }) => {
    const p = participants.get(socketId);
    if (p) { if(mic!==undefined) p.mic=mic; if(cam!==undefined) p.cam=cam; }
    updateVideoTile(socketId); renderPeople();
  });

  socket.on('screen_share_change', ({ active, name }) => {
    if (active) {
      document.getElementById('screen-tab').style.display = '';
      document.getElementById('screen-badge').textContent  = 'Pantalla de '+name;
    } else {
      document.getElementById('screen-tab').style.display = 'none';
      if (mainView==='screen') switchMain('video', document.querySelector('.mtab[data-view="video"]'));
    }
  });

  socket.on('hand_change', ({ socketId, name, raised }) => {
    const p = participants.get(socketId);
    if (p) p.hand = raised;
    updateVideoTile(socketId); renderPeople();
    if (raised) toast('✋ '+name+' levantó la mano');
  });

  socket.on('chat_message', msg => appendChatMsg(msg, true));

  socket.on('force_mute', () => {
    micOn=false; rtcMgr.setMicEnabled(false); updateCtlState();
    toast('🔇 El profesor te silenció');
  });
  socket.on('kicked', () => { toast('Fuiste expulsado'); setTimeout(leaveRoom,1500); });
  socket.on('all_muted', () => {
    if (myRole!=='profesor') { micOn=false; rtcMgr.setMicEnabled(false); updateCtlState(); }
    toast('🔇 Todos silenciados');
  });
  socket.on('recording_changed', ({ active }) => {
    recording = active;
    document.getElementById('rec-pill').style.display = active?'flex':'none';
    document.getElementById('ctl-rec').classList.toggle('danger', active);
    document.getElementById('ctl-rec-label').textContent = active?'Detener':'Grabar';
    toast(active?'⏺ Grabando':'⏹ Grabación detenida');
  });
  socket.on('config_updated', cfg => {
    const s=document.getElementById('cfg-screen'),w=document.getElementById('cfg-wb'),
          c=document.getElementById('cfg-chat'), m=document.getElementById('cfg-mute');
    if(s) s.value=cfg.screenShare; if(w) w.value=cfg.whiteboard;
    if(c) c.value=cfg.chat;        if(m) m.checked=cfg.muteOnJoin;
  });
  socket.on('error', ({ msg }) => toast('⚠ '+msg));
}

// ── Video tiles ────────────────────────────────────────────────────────────
function makeTile(id, name, role, isMe, stream, micState, camState, handState) {
  document.getElementById('tile-'+id)?.remove();
  const color = COLORS[Math.abs(hashStr(name)) % COLORS.length];
  const inits = getInitials(name);

  const tile = document.createElement('div');
  tile.className = 'video-tile';
  tile.id = 'tile-'+id;

  // Video element
  const vid = document.createElement('video');
  vid.autoplay = true; vid.playsInline = true;
  if (isMe) vid.muted = true;
  if (stream) vid.srcObject = stream;
  tile.appendChild(vid);

  // Avatar overlay (shown when cam is off)
  const ov = document.createElement('div');
  ov.className = 'tile-overlay'; ov.id = 'overlay-'+id;
  ov.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;background:var(--bg2);'+(camState?'display:none;':'');
  ov.innerHTML = `<div class="tile-avatar" style="background:${color}22;color:${color}">${inits}</div><div class="tile-name-overlay">${escHtml(name)}</div>`;
  tile.appendChild(ov);

  // Bottom bar
  const bar = document.createElement('div');
  bar.className = 'tile-bar';
  bar.innerHTML = `<span class="tile-name">${escHtml(name)}${isMe?' (tú)':''}</span>
    <span class="tile-icons">
      <i class="ti ${micState?'ti-microphone':'ti-microphone-off'} tile-icon ${micState?'':'muted'}" id="icon-mic-${id}"></i>
      <i class="ti ${camState?'ti-video':'ti-video-off'} tile-icon ${camState?'':'muted'}" id="icon-cam-${id}"></i>
    </span>`;
  tile.appendChild(bar);

  // Badges
  if (isMe) { const b=document.createElement('span'); b.className='tile-you-badge'; b.textContent='Tú'; tile.appendChild(b); }
  if (role==='profesor' && !isMe) { const b=document.createElement('span'); b.className='tile-prof-badge'; b.textContent='Profe'; tile.appendChild(b); }
  const hb = document.createElement('span'); hb.className='tile-hand-badge'; hb.id='hand-'+id;
  hb.textContent='✋'; hb.style.display=handState?'':'none'; tile.appendChild(hb);

  vid.play().catch(()=>{});
  return tile;
}

function addLocalVideo() {
  const grid = document.getElementById('video-grid');
  const p = participants.get(mySocketId) || { role:myRole, hand:false };
  const tile = makeTile('local', myName, myRole, true, rtcMgr.localStream, micOn, camOn, false);
  grid.appendChild(tile);
  updateEmptyState();
}

function handleRemoteStream(socketId, stream, isScreen) {
  if (isScreen) {
    const sv = document.getElementById('screen-video');
    if (sv) { sv.srcObject=stream; sv.play().catch(()=>{}); }
    return;
  }
  const grid = document.getElementById('video-grid');
  const p = participants.get(socketId);
  const existing = remoteVideos.get(socketId);
  if (existing) {
    existing.srcObject = stream; existing.play().catch(()=>{});
    return;
  }
  const tile = makeTile(socketId, p?.name||'Usuario', p?.role||'alumno', false, stream, p?.mic??true, p?.cam??true, p?.hand??false);
  grid.appendChild(tile);
  remoteVideos.set(socketId, tile.querySelector('video'));
  updateEmptyState();
}

function removePeerVideo(socketId) {
  rtcMgr.removePeer(socketId);
  document.getElementById('tile-'+socketId)?.remove();
  remoteVideos.delete(socketId);
  updateEmptyState();
}

function updateVideoTile(socketId) {
  const p = participants.get(socketId); if(!p) return;
  const mi=document.getElementById('icon-mic-'+socketId);
  const ci=document.getElementById('icon-cam-'+socketId);
  const hb=document.getElementById('hand-'+socketId);
  const ov=document.getElementById('overlay-'+socketId);
  if(mi) mi.className='ti '+(p.mic?'ti-microphone':'ti-microphone-off')+' tile-icon'+(p.mic?'':' muted');
  if(ci) ci.className='ti '+(p.cam?'ti-video':'ti-video-off')+' tile-icon'+(p.cam?'':' muted');
  if(hb) hb.style.display=p.hand?'':'none';
  if(ov) ov.style.display=p.cam?'none':'';
}

function updateEmptyState() {
  const grid=document.getElementById('video-grid');
  const es=document.getElementById('empty-state');
  if(es) es.style.display=grid.children.length===0?'flex':'none';
}

// ── Controls ───────────────────────────────────────────────────────────────
function toggleMic() {
  micOn=!micOn; rtcMgr.setMicEnabled(micOn);
  socket.emit('media_state',{mic:micOn});
  const mi=document.getElementById('icon-mic-local');
  if(mi) mi.className='ti '+(micOn?'ti-microphone':'ti-microphone-off')+' tile-icon'+(micOn?'':' muted');
  updateCtlState();
  toast(micOn?'🎤 Micro activado':'🔇 Silenciado');
}
function toggleCam() {
  camOn=!camOn; rtcMgr.setCamEnabled(camOn);
  socket.emit('media_state',{cam:camOn});
  const ov=document.getElementById('overlay-local');
  if(ov) ov.style.display=camOn?'none':'';
  const ci=document.getElementById('icon-cam-local');
  if(ci) ci.className='ti '+(camOn?'ti-video':'ti-video-off')+' tile-icon'+(camOn?'':' muted');
  updateCtlState();
  toast(camOn?'📷 Cámara activada':'📷 Cámara desactivada');
}

async function toggleScreenShare() {
  // DEBE ejecutarse directamente desde click (gesto de usuario)
  if (!screenOn) {
    try {
      await rtcMgr.startScreenShare();
      screenOn=true;
      socket.emit('screen_share',{active:true});
      document.getElementById('screen-tab').style.display='';
      switchMain('screen', document.querySelector('.mtab[data-view="screen"]'));
      updateCtlState();
      toast('🖥 Compartiendo pantalla');
    } catch(e) {
      if(e.name!=='NotAllowedError') toast('Error al compartir: '+e.message);
      else toast('Compartición cancelada');
    }
  } else {
    await rtcMgr.stopScreenShare();
    screenOn=false;
    socket.emit('screen_share',{active:false});
    document.getElementById('screen-tab').style.display='none';
    if(mainView==='screen') switchMain('video', document.querySelector('.mtab[data-view="video"]'));
    updateCtlState();
    toast('Dejaste de compartir');
  }
}

function toggleHand() {
  handRaised=!handRaised;
  socket.emit('hand_raise',{raised:handRaised});
  updateCtlState();
  toast(handRaised?'✋ Mano levantada':'Mano bajada');
}
function toggleRecording() { socket.emit('recording_state',{active:!recording}); }
function muteAll() { socket.emit('mute_all'); }

function updateCtlState() {
  const mic=document.getElementById('ctl-mic');
  const cam=document.getElementById('ctl-cam');
  const scr=document.getElementById('ctl-screen');
  const hnd=document.getElementById('ctl-hand');
  if(mic){ mic.className='ctl'+(micOn?' active':' danger'); mic.querySelector('span').textContent=micOn?'Micro':'Silenciado'; document.getElementById('ctl-mic-icon').className=micOn?'ti ti-microphone':'ti ti-microphone-off'; }
  if(cam){ cam.className='ctl'+(camOn?' active':' danger'); cam.querySelector('span').textContent=camOn?'Cámara':'Sin cámara'; document.getElementById('ctl-cam-icon').className=camOn?'ti ti-video':'ti ti-video-off'; }
  if(scr){ scr.className='ctl'+(screenOn?' active':''); document.getElementById('ctl-screen-label').textContent=screenOn?'Compartiendo':'Pantalla'; }
  if(hnd){ hnd.className='ctl'+(handRaised?' active':''); document.getElementById('ctl-hand-label').textContent=handRaised?'Mano ✋':'Mano'; }
}

// ── Chat ───────────────────────────────────────────────────────────────────
function sendChat() {
  const inp=document.getElementById('chat-inp');
  const text=inp.value.trim(); if(!text) return;
  socket.emit('chat_message',{text}); inp.value='';
}
function appendChatMsg(msg, isNew) {
  const msgs=document.getElementById('chat-msgs');
  const isMine=msg.sender===myName;
  const d=new Date(msg.time);
  const time=d.getHours().toString().padStart(2,'0')+':'+d.getMinutes().toString().padStart(2,'0');
  const div=document.createElement('div');
  div.className='chat-msg'+(isMine?' mine':'');
  div.innerHTML=`<div class="chat-header"><span class="chat-sender ${msg.role||''}">${escHtml(msg.sender)}</span><span class="chat-time">${time}</span></div><span class="chat-bubble">${escHtml(msg.text)}</span>`;
  msgs.appendChild(div);
  msgs.scrollTop=msgs.scrollHeight;
  if(isNew && !isMine && sideView!=='chat'){
    chatUnread++;
    const b=document.getElementById('chat-unread');
    b.textContent=chatUnread; b.style.display='';
  }
}

// ── People ─────────────────────────────────────────────────────────────────
function renderPeople() {
  const list=document.getElementById('people-list'); list.innerHTML='';
  participants.forEach((p,sid)=>{
    const isMe=sid===mySocketId;
    const color=COLORS[Math.abs(hashStr(p.name))%COLORS.length];
    const canCtrl=myRole==='profesor'&&!isMe;
    const row=document.createElement('div'); row.className='person-row';
    row.innerHTML=`<div class="person-left"><div class="person-avatar" style="background:${color}22;color:${color}">${getInitials(p.name)}</div><div><div class="person-name">${escHtml(p.name)}${isMe?' (tú)':''}</div><div class="person-sub">${p.role}${p.hand?' · ✋':''}</div></div></div>
    <div style="display:flex;align-items:center;gap:6px"><div class="person-indicators"><i class="ti ${p.mic?'ti-microphone':'ti-microphone-off'} ind ${p.mic?'':'off'}"></i><i class="ti ${p.cam?'ti-video':'ti-video-off'} ind ${p.cam?'':'off'}"></i></div>${canCtrl?`<div class="person-actions"><button class="pa-btn" onclick="kickMute('${sid}')" title="Silenciar"><i class="ti ti-microphone-off"></i></button><button class="pa-btn danger" onclick="kickUser('${sid}')" title="Expulsar"><i class="ti ti-user-x"></i></button></div>`:''}</div>`;
    list.appendChild(row);
  });
}
function kickMute(sid){ socket.emit('mute_participant',{targetSocketId:sid}); }
function kickUser(sid){ if(confirm('¿Expulsar?')) socket.emit('kick_participant',{targetSocketId:sid}); }

// ── Navigation ─────────────────────────────────────────────────────────────
function switchMain(view, btn) {
  mainView=view;
  document.querySelectorAll('.mtab').forEach(b=>b.classList.remove('active'));
  btn?.classList.add('active');
  document.getElementById('view-video').style.display=view==='video'?'':'none';
  document.getElementById('view-wb').style.display=view==='wb'?'':'none';
  document.getElementById('view-screen').style.display=view==='screen'?'':'none';
  if(view==='wb') setTimeout(()=>wb?.resize(), 100);
}
function switchSide(view, btn) {
  sideView=view;
  document.querySelectorAll('.stab').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('side-chat').style.display=view==='chat'?'':'none';
  document.getElementById('side-people').style.display=view==='people'?'':'none';
  document.getElementById('side-settings').style.display=view==='settings'?'':'none';
  if(view==='chat'){ chatUnread=0; document.getElementById('chat-unread').style.display='none'; }
}
function updateConfig() {
  socket.emit('update_config',{
    screenShare:document.getElementById('cfg-screen').value,
    whiteboard: document.getElementById('cfg-wb').value,
    chat:       document.getElementById('cfg-chat').value,
    muteOnJoin: document.getElementById('cfg-mute').checked,
  });
}

// ── Whiteboard ─────────────────────────────────────────────────────────────
function setWbTool(t,btn){ wb?.setTool(t); document.querySelectorAll('.wbt').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); }
function setWbColor(el){ wb?.setColor(el.dataset.color); document.querySelectorAll('.wbc').forEach(e=>e.classList.remove('active')); el.classList.add('active'); }
function clearWB(){ wb?.clear(); }
function undoWB(){ wb?.undo(); }

// ── Invite link ─────────────────────────────────────────────────────────────
function getBaseUrl() {
  return window.location.origin + window.location.pathname.replace(/\/$/,'');
}
function getInviteLink() {
  return getBaseUrl() + '?room=' + encodeURIComponent(currentRoom) + '&role=alumno';
}
function showInviteModal() {
  const link = getInviteLink();
  document.getElementById('invite-link-input').value = link;
  document.getElementById('invite-room-name').textContent = currentRoom;
  // QR simple con API pública
  const qr = document.getElementById('invite-qr');
  qr.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(link)}" alt="QR" style="border-radius:8px;border:3px solid #fff"/>`;
  document.getElementById('invite-modal').style.display='flex';
}
function closeInviteModal(){ document.getElementById('invite-modal').style.display='none'; }
function copyInviteLink() {
  const link=getInviteLink();
  navigator.clipboard?.writeText(link).then(()=>{
    const btn=document.querySelector('.copy-link-btn');
    btn.innerHTML='<i class="ti ti-check"></i> Copiado!';
    setTimeout(()=>btn.innerHTML='<i class="ti ti-copy"></i> Copiar',2000);
  });
}
function copyRoomId() {
  navigator.clipboard?.writeText(currentRoom).then(()=>toast('ID copiado'));
}

// ── Room actions ───────────────────────────────────────────────────────────
function leaveRoom() {
  rtcMgr?.destroy(); socket?.disconnect();
  document.getElementById('room').style.display='none';
  document.getElementById('lobby').style.display='flex';
  participants.clear(); remoteVideos.clear();
  document.getElementById('video-grid').innerHTML='';
  document.getElementById('chat-msgs').innerHTML='';
  recording=false; screenOn=false; handRaised=false; wb=null;
  initPreview();
}
function updateParticipantCount() { document.getElementById('count-num').textContent=participants.size; }

// ── Utils ──────────────────────────────────────────────────────────────────
function toast(msg) {
  const t=document.getElementById('toast');
  t.textContent=msg; t.classList.add('show');
  clearTimeout(t._t); t._t=setTimeout(()=>t.classList.remove('show'),2800);
}
function getInitials(n){ return (n||'?').split(' ').map(w=>w[0]?.toUpperCase()||'').join('').slice(0,2)||'??'; }
function hashStr(s){ let h=0; for(let i=0;i<s.length;i++) h=(Math.imul(31,h)+s.charCodeAt(i))|0; return h; }
function escHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ── Boot ───────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded',()=>{ genRoomId(); readUrlParams(); initPreview(); });
