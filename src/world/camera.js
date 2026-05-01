import { CAMERA, TILE, MAP_W, MAP_H } from '../config.js';

export class Camera {
  constructor(viewW, viewH) {
    this.viewW = viewW;
    this.viewH = viewH;
    this.zoom = CAMERA.defaultZoom;
    this.x = 0; this.y = 0;
  }

  resize(w, h) { this.viewW = w; this.viewH = h; this.clamp(); }

  worldToScreen(wx, wy) {
    return {
      x: (wx - this.x) * this.zoom,
      y: (wy - this.y) * this.zoom,
    };
  }

  screenToWorld(sx, sy) {
    return {
      x: sx / this.zoom + this.x,
      y: sy / this.zoom + this.y,
    };
  }

  pan(dx, dy) {
    this.x += dx;
    this.y += dy;
    this.clamp();
  }

  centerOn(wx, wy) {
    this.x = wx - this.viewW / (2 * this.zoom);
    this.y = wy - this.viewH / (2 * this.zoom);
    this.clamp();
  }

  setZoom(z, anchorSx, anchorSy) {
    const newZoom = Math.max(CAMERA.minZoom, Math.min(CAMERA.maxZoom, z));
    if (anchorSx !== undefined) {
      const before = this.screenToWorld(anchorSx, anchorSy);
      this.zoom = newZoom;
      const after = this.screenToWorld(anchorSx, anchorSy);
      this.x += before.x - after.x;
      this.y += before.y - after.y;
    } else {
      this.zoom = newZoom;
    }
    this.clamp();
  }

  clamp() {
    const worldW = MAP_W * TILE;
    const worldH = MAP_H * TILE;
    const visibleW = this.viewW / this.zoom;
    const visibleH = this.viewH / this.zoom;
    this.x = Math.max(0, Math.min(worldW - visibleW, this.x));
    this.y = Math.max(0, Math.min(worldH - visibleH, this.y));
    if (visibleW > worldW) this.x = (worldW - visibleW) / 2;
    if (visibleH > worldH) this.y = (worldH - visibleH) / 2;
  }
}
