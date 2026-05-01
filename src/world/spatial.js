// Cheap spatial hash for entity neighbor queries.
// Cell size ~= 2 tiles.

import { TILE } from '../config.js';

const CELL = TILE * 2;

export class SpatialHash {
  constructor() {
    this.cells = new Map();
  }
  clear() { this.cells.clear(); }
  _key(cx, cy) { return cx * 73856093 ^ cy * 19349663; }

  insert(e) {
    const cx = Math.floor(e.x / CELL);
    const cy = Math.floor(e.y / CELL);
    const k = this._key(cx, cy);
    let arr = this.cells.get(k);
    if (!arr) { arr = []; this.cells.set(k, arr); }
    arr.push(e);
  }

  // Yield entities within radius r of (x, y). Calls cb(entity).
  forEachInRadius(x, y, r, cb) {
    const minCx = Math.floor((x - r) / CELL);
    const maxCx = Math.floor((x + r) / CELL);
    const minCy = Math.floor((y - r) / CELL);
    const maxCy = Math.floor((y + r) / CELL);
    const r2 = r * r;
    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const arr = this.cells.get(this._key(cx, cy));
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) {
          const e = arr[i];
          const dx = e.x - x, dy = e.y - y;
          if (dx * dx + dy * dy <= r2) cb(e);
        }
      }
    }
  }

  // Pick the closest entity matching pred within radius.
  closest(x, y, r, pred) {
    let best = null;
    let bestD = r * r;
    this.forEachInRadius(x, y, r, e => {
      if (pred && !pred(e)) return;
      const dx = e.x - x, dy = e.y - y;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = e; }
    });
    return best;
  }
}
