// Unified pointer input.  Maps mouse + touch into a small set of events
// that the game loop polls each frame.
//
// Events emitted (queued for game loop, drained per simulation tick):
//   { type: 'tap',        sx, sy, button }   — short tap / left-click
//   { type: 'rclick',     sx, sy }            — right-click / long-press
//   { type: 'box',        x0, y0, x1, y1 }    — completed drag-select
//   { type: 'pan',        dx, dy }            — camera pan
//   { type: 'zoom',       factor, sx, sy }    — pinch / wheel
//   { type: 'key',        key, action }       — keyboard
//
// The handler also exposes `box` (current drag rect) for live rendering.

const TAP_THRESHOLD = 6;       // px
const LONGPRESS_MS = 380;
const DOUBLE_TAP_MS = 280;

export class InputManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.queue = [];
    this.box = null;            // active box-select rect in screen coords

    this._down = null;          // primary pointer
    this._secondary = null;     // for pinch
    this._lastTapAt = 0;
    this._lastTapPos = null;
    this._lastPointer = { sx: 0, sy: 0 }; // last mouse/touch position

    // For two-finger pinch
    this._pinchStart = 0;

    // Set up listeners
    canvas.addEventListener('mousedown', this._onMouseDown);
    canvas.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mouseup', this._onMouseUp);
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('wheel', this._onWheel, { passive: false });

    canvas.addEventListener('touchstart', this._onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', this._onTouchMove, { passive: false });
    canvas.addEventListener('touchend', this._onTouchEnd, { passive: false });
    canvas.addEventListener('touchcancel', this._onTouchEnd, { passive: false });

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);

    // Track keys held for pan
    this.keys = new Set();
  }

  poll() {
    const out = this.queue;
    this.queue = [];
    return out;
  }

  push(ev) { this.queue.push(ev); }

  // ---- mouse ----
  _onMouseDown = (e) => {
    e.preventDefault();
    const { x, y } = this._evXY(e);
    this._lastPointer = { sx: x, sy: y };
    if (e.button === 2) {
      // right-click: command on press
      this.queue.push({ type: 'rclick', sx: x, sy: y });
      return;
    }
    if (e.button !== 0) return;
    this._down = {
      sx: x, sy: y, x0: x, y0: y,
      isTouch: false, time: performance.now(),
      moved: false, longTimer: 0,
      pan: false,
    };
  };

  _onMouseMove = (e) => {
    const { x, y } = this._evXY(e);
    this._lastPointer = { sx: x, sy: y };
    if (!this._down) return;
    const dx = x - this._down.sx;
    const dy = y - this._down.sy;
    if (!this._down.moved && (dx * dx + dy * dy) > TAP_THRESHOLD * TAP_THRESHOLD) {
      this._down.moved = true;
      // start box-select
      this.box = { x0: this._down.x0, y0: this._down.y0, x1: x, y1: y };
    }
    if (this._down.moved && this.box) {
      this.box.x1 = x; this.box.y1 = y;
    }
    this._down.sx = x; this._down.sy = y;
  };

  _onMouseUp = (e) => {
    if (!this._down) return;
    const { x, y } = this._evXY(e);
    if (this._down.moved && this.box) {
      this.queue.push({ type: 'box', x0: this.box.x0, y0: this.box.y0, x1: x, y1: y });
    } else {
      this.queue.push({ type: 'tap', sx: x, sy: y, button: 0 });
    }
    this.box = null;
    this._down = null;
  };

  _onWheel = (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const { x, y } = this._evXY(e);
    this.queue.push({ type: 'zoom', factor, sx: x, sy: y });
  };

  // ---- touch ----
  _onTouchStart = (e) => {
    e.preventDefault();
    if (e.touches.length === 1) {
      const t = e.touches[0];
      const { x, y } = this._evXY(t);
      this._lastPointer = { sx: x, sy: y };
      this._down = {
        sx: x, sy: y, x0: x, y0: y,
        isTouch: true, time: performance.now(),
        moved: false,
        longTimer: setTimeout(() => this._fireLongPress(), LONGPRESS_MS),
        startedOnUnit: false, pan: false,
      };
    } else if (e.touches.length === 2) {
      // Pinch start
      if (this._down && this._down.longTimer) {
        clearTimeout(this._down.longTimer);
        this._down.longTimer = 0;
      }
      this._down = null;
      this.box = null;
      const a = e.touches[0], b = e.touches[1];
      const dx = a.clientX - b.clientX;
      const dy = a.clientY - b.clientY;
      this._pinchStart = Math.hypot(dx, dy);
      this._secondary = { dist: this._pinchStart };
    }
  };

  _onTouchMove = (e) => {
    e.preventDefault();
    if (e.touches.length === 2 && this._secondary) {
      const a = e.touches[0], b = e.touches[1];
      const cx = (a.clientX + b.clientX) / 2 - this.canvas.getBoundingClientRect().left;
      const cy = (a.clientY + b.clientY) / 2 - this.canvas.getBoundingClientRect().top;
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const factor = d / this._secondary.dist;
      if (Math.abs(factor - 1) > 0.02) {
        this.queue.push({ type: 'zoom', factor, sx: cx, sy: cy });
        this._secondary.dist = d;
      }
      return;
    }
    if (!this._down) return;
    const t = e.touches[0];
    if (!t) return;
    const { x, y } = this._evXY(t);
    this._lastPointer = { sx: x, sy: y };
    const dx = x - this._down.x0;
    const dy = y - this._down.y0;
    if (!this._down.moved && (dx * dx + dy * dy) > TAP_THRESHOLD * TAP_THRESHOLD) {
      this._down.moved = true;
      if (this._down.longTimer) {
        clearTimeout(this._down.longTimer);
        this._down.longTimer = 0;
      }
      // On touch we always interpret drag as panning (no box-select on mobile).
      this._down.pan = true;
    }
    if (this._down.pan) {
      const ddx = x - this._down.sx;
      const ddy = y - this._down.sy;
      this.queue.push({ type: 'pan', dx: -ddx, dy: -ddy });
    }
    this._down.sx = x; this._down.sy = y;
  };

  _onTouchEnd = (e) => {
    e.preventDefault();
    if (e.touches.length >= 2) return;
    if (!this._down) {
      this._secondary = null;
      return;
    }
    if (this._down.longTimer) {
      clearTimeout(this._down.longTimer);
      this._down.longTimer = 0;
    }
    if (!this._down.moved) {
      const now = performance.now();
      const wasDouble = (this._lastTapPos
        && now - this._lastTapAt < DOUBLE_TAP_MS
        && Math.hypot(this._down.sx - this._lastTapPos.x, this._down.sy - this._lastTapPos.y) < 24);
      this.queue.push({ type: 'tap', sx: this._down.sx, sy: this._down.sy, button: 0, double: !!wasDouble });
      this._lastTapAt = now;
      this._lastTapPos = { x: this._down.sx, y: this._down.sy };
    }
    this._down = null;
    this._secondary = null;
  };

  _fireLongPress() {
    if (!this._down || this._down.moved) return;
    this.queue.push({ type: 'rclick', sx: this._down.sx, sy: this._down.sy });
    this._down.longTimer = 0;
    // Mark as already handled so the upcoming touchend doesn't also fire tap.
    this._down.moved = true;
  }

  _onKeyDown = (e) => {
    if (e.repeat) return;
    this.keys.add(e.key.toLowerCase());
    this.queue.push({ type: 'key', key: e.key, action: 'down' });
  };
  _onKeyUp = (e) => {
    this.keys.delete(e.key.toLowerCase());
    this.queue.push({ type: 'key', key: e.key, action: 'up' });
  };

  _evXY(e) {
    const r = this.canvas.getBoundingClientRect();
    const cx = e.clientX !== undefined ? e.clientX : (e.touches?.[0]?.clientX ?? 0);
    const cy = e.clientY !== undefined ? e.clientY : (e.touches?.[0]?.clientY ?? 0);
    return { x: cx - r.left, y: cy - r.top };
  }
}
