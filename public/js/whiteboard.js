// ── Whiteboard ─────────────────────────────────────────────────────────────
class Whiteboard {
  constructor(canvasId, socket, myRole) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.socket = socket;
    this.myRole = myRole;
    this.tool = 'pen';
    this.color = '#0ea5e9';
    this.size = 3;
    this.drawing = false;
    this.startX = 0; this.startY = 0;
    this.lastX = 0; this.lastY = 0;
    this.snapshot = null;
    this.history = [];
    this._setup();
    this.resize();
  }

  _setup() {
    this.canvas.addEventListener('mousedown', e => this._start(e));
    this.canvas.addEventListener('mousemove', e => this._move(e));
    this.canvas.addEventListener('mouseup',   e => this._end(e));
    this.canvas.addEventListener('mouseleave',e => { if(this.drawing) this._end(e); });
    this.canvas.addEventListener('touchstart', e => { e.preventDefault(); this._start(e.touches[0]); }, { passive:false });
    this.canvas.addEventListener('touchmove',  e => { e.preventDefault(); this._move(e.touches[0]); }, { passive:false });
    this.canvas.addEventListener('touchend',   e => this._end(e));

    this.socket.on('wb_stroke', stroke => this._applyStroke(stroke));
    this.socket.on('wb_clear',  () => this._doClear(false));

    // Redimensionar cuando cambie el contenedor
    this._ro = new ResizeObserver(() => this.resize());
    this._ro.observe(this.canvas.parentElement);
  }

  resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const w = parent.clientWidth  || 600;
    const h = parent.clientHeight || 400;
    if (w === this.canvas.width && h === this.canvas.height) return;

    // Guardar contenido actual
    const tmp = document.createElement('canvas');
    tmp.width = this.canvas.width;
    tmp.height = this.canvas.height;
    tmp.getContext('2d').drawImage(this.canvas, 0, 0);

    this.canvas.width  = w;
    this.canvas.height = h;

    // Restaurar
    if (tmp.width > 0 && tmp.height > 0) {
      this.ctx.drawImage(tmp, 0, 0);
    }
  }

  _getPos(e) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width)  * this.canvas.width,
      y: ((e.clientY - r.top)  / r.height) * this.canvas.height,
    };
  }

  _start(e) {
    const { x, y } = this._getPos(e);
    this.drawing = true;
    this.startX = this.lastX = x;
    this.startY = this.lastY = y;

    if (this.tool === 'pen' || this.tool === 'erase') {
      this._saveHistory();
    } else if (this.tool === 'text') {
      this.drawing = false;
      const text = prompt('Texto:');
      if (text) {
        const stroke = { tool:'text', x, y, color: this.color, size: this.size * 5 + 12, text };
        this._applyStroke(stroke);
        this.socket.emit('wb_stroke', stroke);
      }
      return;
    } else {
      // Para formas: guardar snapshot para preview
      this.snapshot = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  _move(e) {
    if (!this.drawing) return;
    const { x, y } = this._getPos(e);

    if (this.tool === 'pen') {
      const stroke = { tool:'pen', x0:this.lastX, y0:this.lastY, x1:x, y1:y, color:this.color, size:this.size };
      this._applyStroke(stroke);
      this.socket.emit('wb_stroke', stroke);
    } else if (this.tool === 'erase') {
      const stroke = { tool:'erase', x0:this.lastX, y0:this.lastY, x1:x, y1:y, size:this.size };
      this._applyStroke(stroke);
      this.socket.emit('wb_stroke', stroke);
    } else {
      // Preview: restaurar snapshot y dibujar forma provisional
      if (this.snapshot) this.ctx.putImageData(this.snapshot, 0, 0);
      const stroke = { tool:this.tool, x0:this.startX, y0:this.startY, x1:x, y1:y, color:this.color, size:this.size };
      this._applyStroke(stroke);
    }

    this.lastX = x;
    this.lastY = y;
  }

  _end(e) {
    if (!this.drawing) return;
    this.drawing = false;

    if (this.tool !== 'pen' && this.tool !== 'erase') {
      const { x, y } = e.touches ? { x: this.lastX, y: this.lastY } : this._getPos(e);
      const stroke = { tool:this.tool, x0:this.startX, y0:this.startY, x1:x, y1:y, color:this.color, size:this.size };
      this._saveHistory();
      // La forma ya está dibujada en preview; solo la enviamos
      this.socket.emit('wb_stroke', stroke);
      this.snapshot = null;
    }
  }

  _applyStroke(s) {
    const ctx = this.ctx;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (s.tool === 'erase') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = s.size * 4;
      ctx.beginPath();
      ctx.moveTo(s.x0, s.y0);
      ctx.lineTo(s.x1, s.y1);
      ctx.stroke();

    } else if (s.tool === 'pen') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.size;
      ctx.beginPath();
      ctx.moveTo(s.x0, s.y0);
      ctx.lineTo(s.x1, s.y1);
      ctx.stroke();

    } else if (s.tool === 'line') {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.size;
      ctx.beginPath();
      ctx.moveTo(s.x0, s.y0);
      ctx.lineTo(s.x1, s.y1);
      ctx.stroke();

    } else if (s.tool === 'rect') {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.size;
      ctx.strokeRect(s.x0, s.y0, s.x1 - s.x0, s.y1 - s.y0);

    } else if (s.tool === 'circle') {
      const rx = Math.abs(s.x1 - s.x0) / 2;
      const ry = Math.abs(s.y1 - s.y0) / 2;
      const cx = s.x0 + (s.x1 - s.x0) / 2;
      const cy = s.y0 + (s.y1 - s.y0) / 2;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.size;
      ctx.beginPath();
      ctx.ellipse(cx, cy, Math.max(rx, 1), Math.max(ry, 1), 0, 0, Math.PI * 2);
      ctx.stroke();

    } else if (s.tool === 'text') {
      ctx.fillStyle = s.color;
      ctx.font = `bold ${s.size}px 'DM Sans', sans-serif`;
      ctx.fillText(s.text, s.x, s.y);
    }

    ctx.restore();
  }

  _saveHistory() {
    const data = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    this.history.push(data);
    if (this.history.length > 30) this.history.shift();
  }

  undo() {
    if (!this.history.length) return;
    this.ctx.putImageData(this.history.pop(), 0, 0);
  }

  _doClear(emit) {
    this._saveHistory();
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (emit) this.socket.emit('wb_clear');
  }

  clear()           { this._doClear(true); }
  setTool(t)        { this.tool = t; this.canvas.style.cursor = t==='erase'?'cell':t==='text'?'text':'crosshair'; }
  setColor(c)       { this.color = c; }
  setSize(s)        { this.size = s; }
  replayStrokes(ss) { ss.forEach(s => this._applyStroke(s)); }
}
