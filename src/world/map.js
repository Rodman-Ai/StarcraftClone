// Tile-based terrain.  Tile types:
//   0 = grass (passable)
//   1 = grass-dark (passable)
//   2 = rock (impassable)
//   3 = path (passable)
//
// `occ` tracks dynamic occupancy (buildings, resource nodes) so pathfinding
// can avoid them.

import { MAP_W, MAP_H, TILE } from '../config.js';

export class GameMap {
  constructor() {
    this.w = MAP_W;
    this.h = MAP_H;
    this.tile = new Uint8Array(MAP_W * MAP_H);
    this.occ = new Uint8Array(MAP_W * MAP_H); // bit 0: blocked by building/rock
    this.generate();
  }

  idx(x, y) { return y * this.w + x; }
  inBounds(tx, ty) { return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h; }

  get(tx, ty) {
    if (!this.inBounds(tx, ty)) return 2;
    return this.tile[this.idx(tx, ty)];
  }

  isPassable(tx, ty) {
    if (!this.inBounds(tx, ty)) return false;
    if (this.tile[this.idx(tx, ty)] === 2) return false;
    if (this.occ[this.idx(tx, ty)]) return false;
    return true;
  }

  setOccupied(tx, ty, val = 1) {
    if (!this.inBounds(tx, ty)) return;
    this.occ[this.idx(tx, ty)] = val;
  }

  setOccupiedRect(tx, ty, w, h, val = 1) {
    for (let y = ty; y < ty + h; y++) {
      for (let x = tx; x < tx + w; x++) {
        this.setOccupied(x, y, val);
      }
    }
  }

  // Returns true if every tile in rect is passable (terrain) and unoccupied,
  // and not equal to `ignoreOcc` (for re-checking own ghost).
  canPlaceBuilding(tx, ty, w, h) {
    for (let y = ty; y < ty + h; y++) {
      for (let x = tx; x < tx + w; x++) {
        if (!this.inBounds(x, y)) return false;
        if (this.tile[this.idx(x, y)] === 2) return false;
        if (this.occ[this.idx(x, y)]) return false;
      }
    }
    return true;
  }

  worldToTile(wx, wy) {
    return { tx: Math.floor(wx / TILE), ty: Math.floor(wy / TILE) };
  }
  tileToWorld(tx, ty) {
    return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
  }

  generate() {
    // Random-ish but seeded for repeatable feel
    let seed = 1337;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) & 0x7fffffff;
      return seed / 0x7fffffff;
    };

    // Fill grass with patches of dark grass and scattered paths
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const r = rand();
        if (r < 0.18) this.tile[this.idx(x, y)] = 1;
        else this.tile[this.idx(x, y)] = 0;
      }
    }
    // Smooth dark-grass blobs
    for (let pass = 0; pass < 2; pass++) {
      const next = new Uint8Array(this.tile);
      for (let y = 1; y < this.h - 1; y++) {
        for (let x = 1; x < this.w - 1; x++) {
          let c = 0;
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++)
              if (this.tile[this.idx(x + dx, y + dy)] === 1) c++;
          next[this.idx(x, y)] = c >= 5 ? 1 : (c <= 2 ? 0 : this.tile[this.idx(x, y)]);
        }
      }
      this.tile = next;
    }

    // Rocks (impassable) — small clusters away from spawns
    const placeRockCluster = (cx, cy, n) => {
      for (let i = 0; i < n; i++) {
        const rx = cx + Math.floor((rand() - 0.5) * 6);
        const ry = cy + Math.floor((rand() - 0.5) * 4);
        if (this.inBounds(rx, ry)) this.tile[this.idx(rx, ry)] = 2;
      }
    };
    placeRockCluster(this.w * 0.5 | 0, this.h * 0.3 | 0, 8);
    placeRockCluster(this.w * 0.5 | 0, this.h * 0.7 | 0, 8);
    placeRockCluster(this.w * 0.3 | 0, this.h * 0.5 | 0, 6);
    placeRockCluster(this.w * 0.7 | 0, this.h * 0.5 | 0, 6);

    // Center alien path band
    const cy = this.h / 2 | 0;
    for (let x = 0; x < this.w; x++) {
      if (rand() < 0.6) this.tile[this.idx(x, cy)] = 3;
    }

    // Carve safe spawn areas (no rocks) at corners
    const carveArea = (cx, cy, r) => {
      for (let y = cy - r; y <= cy + r; y++) {
        for (let x = cx - r; x <= cx + r; x++) {
          if (this.inBounds(x, y) && this.tile[this.idx(x, y)] === 2) {
            this.tile[this.idx(x, y)] = 0;
          }
        }
      }
    };
    carveArea(8, this.h - 8, 6);
    carveArea(this.w - 8, 8, 6);

    // Mark rocks as occupied for pathfinding too
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.tile[this.idx(x, y)] === 2) {
          this.occ[this.idx(x, y)] = 1;
        }
      }
    }
  }
}

// Player and enemy starting tile positions
export const SPAWN = {
  player: { tx: 8, ty: MAP_H - 10 },
  enemy: { tx: MAP_W - 11, ty: 8 },
  playerCrystals: [
    { tx: 14, ty: MAP_H - 8 },
    { tx: 12, ty: MAP_H - 12 },
    { tx: 6, ty: MAP_H - 14 },
  ],
  enemyCrystals: [
    { tx: MAP_W - 16, ty: 9 },
    { tx: MAP_W - 14, ty: 13 },
    { tx: MAP_W - 7, ty: 14 },
  ],
};
