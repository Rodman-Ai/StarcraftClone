// Canvas2D renderer.  Full redraw each frame.
// Layers:
//   0 - terrain tiles
//   1 - resource nodes
//   2 - buildings (and ghost preview)
//   3 - units
//   4 - projectiles
//   5 - selection rings, HP bars, build progress
//   6 - box-select rect, command markers

import { SPRITES, unitFrame, projectileSprite } from './sprites.js';
import {
  TILE, MAP_W, MAP_H, BUILDING_DEFS, UNIT_DEFS, COLORS, TEAM,
} from '../config.js';

export class Renderer {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.game = game;
    this.dpr = 1;
  }

  resize(w, h) {
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = w * this.dpr;
    this.canvas.height = h * this.dpr;
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.imageSmoothingEnabled = false;
  }

  draw() {
    const { ctx, game } = this;
    const cam = game.camera;
    const W = this.canvas.width;
    const H = this.canvas.height;

    ctx.save();
    ctx.fillStyle = '#0b0d18';
    ctx.fillRect(0, 0, W, H);

    // Apply DPR + camera transform together
    ctx.scale(this.dpr * cam.zoom, this.dpr * cam.zoom);
    ctx.translate(-cam.x, -cam.y);

    this._drawTerrain();
    this._drawResources();
    this._drawBuildings();
    this._drawGhost();
    this._drawUnits();
    this._drawProjectiles();
    this._drawSelectionAndBars();
    this._drawCommandMarkers();

    ctx.restore();

    // Screen-space UI inside canvas (box select, etc.)
    this._drawBoxSelect();
  }

  _drawTerrain() {
    const { ctx, game } = this;
    const cam = game.camera;
    const map = game.map;
    const tileSheet = SPRITES.tiles.canvas;
    const TS = SPRITES.tiles.size;

    // Compute visible tile range
    const minTX = Math.max(0, Math.floor(cam.x / TILE));
    const minTY = Math.max(0, Math.floor(cam.y / TILE));
    const maxTX = Math.min(map.w - 1, Math.ceil((cam.x + this.canvas.width / (this.dpr * cam.zoom)) / TILE));
    const maxTY = Math.min(map.h - 1, Math.ceil((cam.y + this.canvas.height / (this.dpr * cam.zoom)) / TILE));

    for (let ty = minTY; ty <= maxTY; ty++) {
      for (let tx = minTX; tx <= maxTX; tx++) {
        const t = map.tile[ty * map.w + tx];
        ctx.drawImage(tileSheet, t * TS, 0, TS, TS, tx * TILE, ty * TILE, TILE, TILE);
      }
    }
  }

  _drawResources() {
    const { ctx, game } = this;
    for (const e of game.entities) {
      if (e.kind !== 'resource') continue;
      const sz = SPRITES.CRYSTAL_SIZE;
      const f = e.shimmer | 0;
      ctx.drawImage(SPRITES.crystal, f * sz, 0, sz, sz, e.x - sz / 2, e.y - sz / 2, sz, sz);
    }
  }

  _drawBuildings() {
    const { ctx, game } = this;
    for (const e of game.entities) {
      if (e.kind !== 'building') continue;
      const sz = SPRITES.BUILDING_SIZE;
      const def = BUILDING_DEFS[e.type];
      const dx = e.tx * TILE + (def.tilesW * TILE) / 2 - sz / 2;
      const dy = e.ty * TILE + (def.tilesH * TILE) / 2 - sz / 2;
      ctx.save();
      if (e.flash > 0) {
        ctx.globalAlpha = 0.7;
        ctx.drawImage(SPRITES[e.type], dx, dy);
        ctx.globalAlpha = 1;
      } else {
        ctx.drawImage(SPRITES[e.type], dx, dy);
      }
      // Tint while constructing
      if (e.state === 'building') {
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = '#000';
        ctx.fillRect(e.tx * TILE, e.ty * TILE + def.tilesH * TILE * (1 - e.buildProgress),
          def.tilesW * TILE, def.tilesH * TILE * (1 - e.buildProgress));
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }
  }

  _drawGhost() {
    const { ctx, game } = this;
    const ghost = game.ui.placingBuilding;
    if (!ghost) return;
    const def = BUILDING_DEFS[ghost.type];
    const sz = SPRITES.BUILDING_SIZE;
    const dx = ghost.tx * TILE + (def.tilesW * TILE) / 2 - sz / 2;
    const dy = ghost.ty * TILE + (def.tilesH * TILE) / 2 - sz / 2;
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.drawImage(SPRITES[ghost.type], dx, dy);
    ctx.globalAlpha = 1;
    ctx.fillStyle = ghost.valid ? COLORS.buildOk : COLORS.buildBad;
    ctx.fillRect(ghost.tx * TILE, ghost.ty * TILE,
      def.tilesW * TILE, def.tilesH * TILE);
    ctx.strokeStyle = ghost.valid ? '#4cd0c2' : '#ff5a5a';
    ctx.lineWidth = 1;
    ctx.strokeRect(ghost.tx * TILE + 0.5, ghost.ty * TILE + 0.5,
      def.tilesW * TILE - 1, def.tilesH * TILE - 1);
    ctx.restore();
  }

  _drawUnits() {
    const { ctx, game } = this;
    for (const e of game.entities) {
      if (e.kind !== 'unit') continue;
      const sz = SPRITES.UNIT_SIZE;
      const f = unitFrame(e.facing, e.walkFrame);
      ctx.save();
      if (e.flash > 0) {
        ctx.filter = 'brightness(2) saturate(0.5)';
      }
      ctx.drawImage(SPRITES[e.type], f.sx, f.sy, f.sw, f.sh,
        e.x - sz / 2, e.y - sz / 2, sz, sz);
      ctx.filter = 'none';

      // Carrying indicator (small crystal above worker)
      if (e.carrying > 0) {
        ctx.fillStyle = '#73e6ff';
        ctx.fillRect(e.x - 2, e.y - 12, 4, 4);
        ctx.strokeStyle = '#0b0d18';
        ctx.lineWidth = 1;
        ctx.strokeRect(e.x - 2.5, e.y - 12.5, 5, 5);
      }
      ctx.restore();
    }
  }

  _drawProjectiles() {
    const { ctx, game } = this;
    for (const e of game.entities) {
      if (e.kind !== 'projectile' || e.dead) continue;
      const spr = projectileSprite(e.color);
      ctx.drawImage(spr, e.x - 4, e.y - 4);
    }
  }

  _drawSelectionAndBars() {
    const { ctx, game } = this;
    for (const e of game.entities) {
      if (e.selected) {
        ctx.strokeStyle = e.team === TEAM.PLAYER
          ? COLORS.selectionPlayer
          : (e.team === TEAM.ENEMY ? COLORS.selectionEnemy : '#ffffff');
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const r = e.kind === 'building'
          ? Math.max(e.tilesW, e.tilesH) * TILE / 2 + 3
          : (e.radius + 4);
        ctx.ellipse(e.x, e.y + (e.kind === 'unit' ? 8 : 0), r, r * 0.5, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      // HP bar (units when damaged or selected; buildings always)
      if (e.kind === 'unit') {
        if (e.selected || e.hp < e.maxHp) {
          const w = 22, h = 3;
          const bx = e.x - w / 2;
          const by = e.y - 18;
          ctx.fillStyle = '#0b0d18';
          ctx.fillRect(bx - 1, by - 1, w + 2, h + 2);
          const ratio = Math.max(0, e.hp / e.maxHp);
          ctx.fillStyle = ratio > 0.6 ? COLORS.hpFull
            : (ratio > 0.3 ? COLORS.hpMid : COLORS.hpLow);
          ctx.fillRect(bx, by, w * ratio, h);
        }
      } else if (e.kind === 'building') {
        const w = 40, h = 4;
        const bx = e.x - w / 2;
        const by = e.ty * TILE - 8;
        ctx.fillStyle = '#0b0d18';
        ctx.fillRect(bx - 1, by - 1, w + 2, h + 2);
        const ratio = Math.max(0, e.hp / e.maxHp);
        ctx.fillStyle = ratio > 0.6 ? COLORS.hpFull
          : (ratio > 0.3 ? COLORS.hpMid : COLORS.hpLow);
        ctx.fillRect(bx, by, w * ratio, h);

        // Build progress bar
        if (e.state === 'building') {
          ctx.fillStyle = '#0b0d18';
          ctx.fillRect(bx - 1, by + h + 1, w + 2, h + 2);
          ctx.fillStyle = '#4cd0c2';
          ctx.fillRect(bx, by + h + 2, w * e.buildProgress, h);
        }
        // Train queue progress
        if (e.trainQueue.length > 0) {
          const q = e.trainQueue[0];
          const ratio = 1 - q.timeLeft / q.totalTime;
          ctx.fillStyle = '#0b0d18';
          ctx.fillRect(bx - 1, by + h + 4, w + 2, h + 2);
          ctx.fillStyle = '#ffe97a';
          ctx.fillRect(bx, by + h + 5, w * ratio, h);
        }
      } else if (e.kind === 'resource') {
        if (e.selected || e.flash > 0) {
          // brief highlight
          ctx.strokeStyle = '#73e6ff';
          ctx.lineWidth = 1;
          ctx.strokeRect(e.x - 12, e.y - 14, 24, 26);
        }
      }
    }
  }

  _drawCommandMarkers() {
    const { ctx, game } = this;
    for (let i = game.cmdMarkers.length - 1; i >= 0; i--) {
      const m = game.cmdMarkers[i];
      const t = 1 - m.life / m.maxLife;
      const r = 4 + t * 14;
      ctx.strokeStyle = m.color;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 1 - t;
      ctx.beginPath();
      ctx.arc(m.x, m.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  _drawBoxSelect() {
    const { ctx, game } = this;
    const b = game.input.box;
    if (!b) return;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    ctx.fillStyle = 'rgba(76, 208, 194, 0.15)';
    ctx.strokeStyle = '#4cd0c2';
    ctx.lineWidth = 1;
    const x = Math.min(b.x0, b.x1);
    const y = Math.min(b.y0, b.y1);
    const w = Math.abs(b.x1 - b.x0);
    const h = Math.abs(b.y1 - b.y0);
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);
    ctx.restore();
  }

  drawMinimap(canvas, game) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const map = game.map;
    const sx = W / (MAP_W * TILE);
    const sy = H / (MAP_H * TILE);

    ctx.fillStyle = '#0b0d18';
    ctx.fillRect(0, 0, W, H);

    // Tiles (sampled coarsely)
    const step = 2;
    for (let ty = 0; ty < map.h; ty += step) {
      for (let tx = 0; tx < map.w; tx += step) {
        const t = map.tile[ty * map.w + tx];
        let c;
        if (t === 0) c = '#3a5a32';
        else if (t === 1) c = '#2d4628';
        else if (t === 2) c = '#5a5e72';
        else c = '#5a3e6e';
        ctx.fillStyle = c;
        ctx.fillRect(tx * TILE * sx, ty * TILE * sy, TILE * sx * step, TILE * sy * step);
      }
    }

    // Entities
    for (const e of game.entities) {
      let c, s;
      if (e.kind === 'building') {
        c = e.team === TEAM.PLAYER ? '#4cd0c2' : (e.team === TEAM.ENEMY ? '#ff5a5a' : '#aaa');
        s = 5;
      } else if (e.kind === 'unit') {
        c = e.team === TEAM.PLAYER ? '#a8ffe6' : (e.team === TEAM.ENEMY ? '#ffb0b0' : '#ccc');
        s = 2;
      } else if (e.kind === 'resource') {
        c = '#73e6ff';
        s = 2;
      } else continue;
      ctx.fillStyle = c;
      ctx.fillRect(e.x * sx - s / 2, e.y * sy - s / 2, s, s);
    }

    // Camera viewport
    const cam = game.camera;
    const vx = cam.x * sx;
    const vy = cam.y * sy;
    const vw = (this.canvas.width / (this.dpr * cam.zoom)) * sx;
    const vh = (this.canvas.height / (this.dpr * cam.zoom)) * sy;
    ctx.strokeStyle = '#ffe97a';
    ctx.lineWidth = 1;
    ctx.strokeRect(vx + 0.5, vy + 0.5, vw, vh);
  }
}
