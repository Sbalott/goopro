// ── WebRTC Manager ─────────────────────────────────────────────────────────
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
  ]
};

class WebRTCManager {
  constructor(socket) {
    this.socket   = socket;
    this.peers    = new Map();
    this.localStream  = null;
    this.screenStream = null;
    this.onRemoteStream = null;
    this.onPeerLeft     = null;
    this._setupSignaling();
  }

  _setupSignaling() {
    this.socket.on('offer', async ({ fromId, sdp }) => {
      const pc = this._getOrCreatePeer(fromId);
      if (pc.signalingState !== 'stable') return;
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.socket.emit('answer', { targetId: fromId, sdp: pc.localDescription });
    });

    this.socket.on('answer', async ({ fromId, sdp }) => {
      const pc = this.peers.get(fromId);
      if (pc && pc.signalingState === 'have-local-offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      }
    });

    this.socket.on('ice_candidate', async ({ fromId, candidate }) => {
      const pc = this.peers.get(fromId);
      if (pc && candidate) {
        try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch(e) {}
      }
    });
  }

  _getOrCreatePeer(remoteId) {
    if (this.peers.has(remoteId)) return this.peers.get(remoteId);

    const pc = new RTCPeerConnection(ICE_SERVERS);
    this.peers.set(remoteId, pc);

    // Añadir tracks locales
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => pc.addTrack(t, this.localStream));
    }

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) this.socket.emit('ice_candidate', { targetId: remoteId, candidate });
    };

    pc.ontrack = ({ streams }) => {
      const stream = streams[0];
      if (stream && this.onRemoteStream) this.onRemoteStream(remoteId, stream, false);
    };

    pc.onconnectionstatechange = () => {
      if (['failed','closed','disconnected'].includes(pc.connectionState)) {
        this._closePeer(remoteId);
      }
    };
    return pc;
  }

  async addPeerWithOffer(remoteId) {
    const pc = this._getOrCreatePeer(remoteId);
    try {
      const offer = await pc.createOffer({ offerToReceiveAudio:true, offerToReceiveVideo:true });
      await pc.setLocalDescription(offer);
      this.socket.emit('offer', { targetId: remoteId, sdp: pc.localDescription });
    } catch(e) { console.error('Offer error:', e); }
  }

  async startLocalMedia() {
    // 1. Intentar video HD + audio
    const constraints = [
      { video:{ width:{ideal:1280}, height:{ideal:720}, facingMode:'user' }, audio:{ echoCancellation:true, noiseSuppression:true, sampleRate:48000 } },
      { video:true, audio:true },
      { video:false, audio:true },
    ];
    for (const c of constraints) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(c);
        this.localStream = stream;
        console.log('[RTC] Stream:', stream.getTracks().map(t=>t.kind+':'+t.label));
        return stream;
      } catch(e) {
        console.warn('[RTC] Constraint failed:', c, e.message);
      }
    }
    console.error('[RTC] No media access at all');
    return null;
  }

  setMicEnabled(v) { this.localStream?.getAudioTracks().forEach(t => t.enabled = v); }
  setCamEnabled(v) { this.localStream?.getVideoTracks().forEach(t => t.enabled = v); }

  async startScreenShare() {
    // IMPORTANTE: getDisplayMedia debe llamarse desde gesto de usuario
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate:{ ideal:15 }, displaySurface:'monitor' },
      audio: false,
    });
    this.screenStream = stream;
    // Renegociar con todos los peers
    stream.getTracks().forEach(track => {
      this.peers.forEach(pc => {
        try {
          const sender = pc.getSenders().find(s => s.track?.kind === 'video');
          if (sender) sender.replaceTrack(track);
          else pc.addTrack(track, stream);
        } catch(e) {}
      });
      track.onended = () => {
        if (window.onScreenShareEnded) window.onScreenShareEnded();
      };
    });
    return stream;
  }

  async stopScreenShare() {
    this.screenStream?.getTracks().forEach(t => t.stop());
    this.screenStream = null;
    // Restaurar track de cámara
    const camTrack = this.localStream?.getVideoTracks()[0];
    if (camTrack) {
      this.peers.forEach(pc => {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) sender.replaceTrack(camTrack).catch(()=>{});
      });
    }
  }

  removePeer(id) { this._closePeer(id); }

  _closePeer(id) {
    this.peers.get(id)?.close();
    this.peers.delete(id);
    if (this.onPeerLeft) this.onPeerLeft(id);
  }

  destroy() {
    this.localStream?.getTracks().forEach(t => t.stop());
    this.screenStream?.getTracks().forEach(t => t.stop());
    this.peers.forEach(pc => pc.close());
    this.peers.clear();
    this.localStream = null;
    this.screenStream = null;
  }
}
