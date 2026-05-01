// Game class — owns world state, runs fixed-timestep loop, dispatches input
// events to commands and systems.

import {
  SIM_DT, TILE, TEAM, BUILDING_DEFS, STARTING_RESOURCES, STARTING_WORKERS,
  CAMERA, MAP_W, MAP_H, UNIT_DEFS,
} from './config.js';

import { GameMap, SPAWN } from './world/map.js';
import { Camera } from './world/camera.js';
import { tickCache } from './world/pathfind.js';
import { SpatialHash } from './world/spatial.js';

import { buildSpriteAtlas, SPRITES } from './render/sprites.js';
import { Renderer } from './render/renderer.js';
import { HUD } from './render/hud.js';

import { InputManager } from './input/input.js';
import {
  commandSelectAt, commandBoxSelect, commandContextAt,
  commandPlaceBuilding, clearSelection, commandMove,
} from './input/commands.js';

import {
  createUnit, createBuilding, createCrystal,
} from './entities/entity.js';

import { updateMovement } from './systems/movement.js';
import { updateCombat } from './systems/combat.js';
import { updateGather } from './systems/gather.js';
import { updateTraining, tryQueueUnit } from './systems/training.js';
import { updateBuild } from './systems/build.js';
import { updateAI } from './systems/ai.js';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    buildSpriteAtlas();

    this.input = new InputManager(canvas);
    this.camera = new Camera(canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight);
    this.renderer = new Renderer(canvas, this);
    this.hud = new HUD(this);

    this._initWorld();

    this.ui = { placingBuilding: null };
    this.cmdMarkers = [];
    this.selection = [];
    this.spatial = new SpatialHash();

    this.acc = 0;
    this.lastT = performance.now();
    this.simMs = 0;
    this.renderMs = 0;
    this.frames = 0;
    this.lastFpsT = performance.now();
    this.fps = 0;
    this.ended = false;
    this.started = false;

    this._resize();
    window.addEventListener('resize', () => this._resize());
    window.addEventListener('orientationchange', () => this._resize());

    // Center camera on player base
    const sp = SPAWN.player;
    this.camera.centerOn(sp.tx * TILE + 36, sp.ty * TILE + 36);

    requestAnimationFrame(this._tick);
  }

  _resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.resize(w, h);
    this.camera.resize(w, h);
  }

  _initWorld() {
    this.map = new GameMap();
    this.entities = [];
    this.players = [
      { resources: STARTING_RESOURCES, supplyUsed: 0, supplyCap: 0, lostHQ: false },
      { resources: STARTING_RESOURCES, supplyUsed: 0, supplyCap: 0, lostHQ: false },
    ];
    this.aiState = { tick: 0, attackCooldown: 0 };

    // Player Garage + workers
    const psp = SPAWN.player;
    const phq = createBuilding('garage', TEAM.PLAYER, psp.tx, psp.ty);
    phq.state = 'built'; phq.buildProgress = 1;
    this.map.setOccupiedRect(psp.tx, psp.ty, phq.tilesW, phq.tilesH, 1);
    this.entities.push(phq);
    for (let i = 0; i < STARTING_WORKERS; i++) {
      const u = createUnit('morty', TEAM.PLAYER,
        psp.tx * TILE + 60 + i * 20, psp.ty * TILE + 90);
      u.homeBase = phq;
      this.entities.push(u);
    }

    // Enemy HQ + workers
    const esp = SPAWN.enemy;
    const ehq = createBuilding('fedhq', TEAM.ENEMY, esp.tx, esp.ty);
    ehq.state = 'built'; ehq.buildProgress = 1;
    this.map.setOccupiedRect(esp.tx, esp.ty, ehq.tilesW, ehq.tilesH, 1);
    this.entities.push(ehq);
    for (let i = 0; i < STARTING_WORKERS; i++) {
      const u = createUnit('fedworker', TEAM.ENEMY,
        esp.tx * TILE + 20 + i * 20, esp.ty * TILE - 16);
      u.homeBase = ehq;
      this.entities.push(u);
    }
    // Give the AI a head-start barracks
    const ebt = createBuilding('fedbarracks', TEAM.ENEMY, esp.tx + 4, esp.ty + 4);
    ebt.state = 'built'; ebt.buildProgress = 1;
    this.map.setOccupiedRect(ebt.tx, ebt.ty, ebt.tilesW, ebt.tilesH, 1);
    this.entities.push(ebt);

    // Crystals near each base
    for (const c of SPAWN.playerCrystals) {
      const crys = createCrystal(c.tx, c.ty);
      this.map.setOccupiedRect(c.tx, c.ty, 1, 1, 1);
      this.entities.push(crys);
    }
    for (const c of SPAWN.enemyCrystals) {
      const crys = createCrystal(c.tx, c.ty);
      this.map.setOccupiedRect(c.tx, c.ty, 1, 1, 1);
      this.entities.push(crys);
    }

    // Auto-assign workers to nearest crystals
    for (const e of this.entities) {
      if (e.kind !== 'unit') continue;
      const crystals = this.entities.filter(o => o.kind === 'resource');
      let best = null;
      let bestD = Infinity;
      for (const c of crystals) {
        const d = (c.x - e.x) ** 2 + (c.y - e.y) ** 2;
        if (d < bestD) { bestD = d; best = c; }
      }
      if (best) {
        e.target = best;
        e.carryingFrom = best;
        e.state = 'gather';
      }
    }
  }

  message(text) { this.hud.message(text); }

  startPlacing(buildingType) {
    if (!BUILDING_DEFS[buildingType]) return;
    // Default ghost to screen center so mobile users see it immediately.
    const sx = window.innerWidth / 2;
    const sy = window.innerHeight / 2;
    this.input._lastPointer = { sx, sy };
    this.ui.placingBuilding = {
      type: buildingType,
      tx: 0, ty: 0,
      valid: false,
    };
  }

  cancelPlacing() {
    this.ui.placingBuilding = null;
  }

  restart() {
    this._initWorld();
    this.selection = [];
    this.cmdMarkers = [];
    this.ui.placingBuilding = null;
    this.ended = false;
    this.hud.hideEnd();
    const sp = SPAWN.player;
    this.camera.centerOn(sp.tx * TILE + 36, sp.ty * TILE + 36);
  }

  // ---- Input dispatch ----
  _handleEvents() {
    const events = this.input.poll();
    for (const ev of events) {
      if (this.ended) {
        // Allow nothing except minimap clicks (handled elsewhere)
        continue;
      }
      if (!this.started) continue;

      if (ev.type === 'tap') {
        if (this.ui.placingBuilding) {
          // Recompute placement at the actual tap position (not last frame's
          // ghost, which may lag a frame behind on touch).
          const ghost = this.ui.placingBuilding;
          const def = BUILDING_DEFS[ghost.type];
          const w = this.camera.screenToWorld(ev.sx, ev.sy);
          const tx = Math.max(0, Math.min(MAP_W - def.tilesW, Math.floor(w.x / TILE - def.tilesW / 2)));
          const ty = Math.max(0, Math.min(MAP_H - def.tilesH, Math.floor(w.y / TILE - def.tilesH / 2)));
          if (this.map.canPlaceBuilding(tx, ty, def.tilesW, def.tilesH)) {
            commandPlaceBuilding(this, ghost.type, tx, ty);
          } else {
            this.message('Cannot build there');
          }
          this.ui.placingBuilding = null;
          continue;
        }
        commandSelectAt(this, ev.sx, ev.sy);
      } else if (ev.type === 'rclick') {
        if (this.ui.placingBuilding) {
          this.ui.placingBuilding = null;
          continue;
        }
        commandContextAt(this, ev.sx, ev.sy);
      } else if (ev.type === 'box') {
        commandBoxSelect(this, ev.x0, ev.y0, ev.x1, ev.y1);
      } else if (ev.type === 'pan') {
        const z = this.camera.zoom;
        this.camera.pan(ev.dx / z, ev.dy / z);
      } else if (ev.type === 'zoom') {
        this.camera.setZoom(this.camera.zoom * ev.factor, ev.sx, ev.sy);
      } else if (ev.type === 'key') {
        this._handleKey(ev);
      }
    }

    // Track placement ghost from current cursor (use last known pointer)
    if (this.ui.placingBuilding) {
      const lp = this.input._lastPointer;
      const sx = lp ? lp.sx : window.innerWidth / 2;
      const sy = lp ? lp.sy : window.innerHeight / 2;
      const w = this.camera.screenToWorld(sx, sy);
      const def = BUILDING_DEFS[this.ui.placingBuilding.type];
      const tx = Math.max(0, Math.min(MAP_W - def.tilesW, Math.floor(w.x / TILE - def.tilesW / 2)));
      const ty = Math.max(0, Math.min(MAP_H - def.tilesH, Math.floor(w.y / TILE - def.tilesH / 2)));
      this.ui.placingBuilding.tx = tx;
      this.ui.placingBuilding.ty = ty;
      this.ui.placingBuilding.valid = this.map.canPlaceBuilding(tx, ty, def.tilesW, def.tilesH);
    }
  }

  _handleKey(ev) {
    if (ev.action !== 'down') return;
    const k = ev.key.toLowerCase();
    if (k === 'escape') {
      this.ui.placingBuilding = null;
      clearSelection(this);
    } else if (k === 'g') {
      const haveWorker = this.selection.some(s => s.kind === 'unit' && s.team === TEAM.PLAYER && UNIT_DEFS[s.type].canHarvest);
      if (haveWorker) this.startPlacing('garage');
    } else if (k === 'b') {
      const haveWorker = this.selection.some(s => s.kind === 'unit' && s.team === TEAM.PLAYER && UNIT_DEFS[s.type].canHarvest);
      if (haveWorker) this.startPlacing('barracks');
    } else if (k === 'm' || k === 'r' || k === 'p') {
      const buildings = this.selection.filter(s => s.kind === 'building' && s.team === TEAM.PLAYER);
      if (buildings.length === 0) return;
      const map = { m: 'morty', r: 'rick', p: 'birdperson' };
      const want = map[k];
      for (const b of buildings) {
        const def = BUILDING_DEFS[b.type];
        if (def.trains.includes(want)) {
          tryQueueUnit(this, b, want);
          return;
        }
      }
    } else if (k === '`') {
      this.hud.toggleFps();
    } else if (k === 'a') {
      // Attack-move stub: same as move, just sets state
      // Skipped in MVP
    }
  }

  _updateKeyPan(dt) {
    const k = this.input.keys;
    let dx = 0, dy = 0;
    if (k.has('arrowleft') || k.has('a')) dx -= 1;
    if (k.has('arrowright') || k.has('d')) dx += 1;
    if (k.has('arrowup') || k.has('w')) dy -= 1;
    if (k.has('arrowdown') || k.has('s')) dy += 1;
    if (dx !== 0 || dy !== 0) {
      const len = Math.hypot(dx, dy);
      const speed = CAMERA.panSpeed * dt / this.camera.zoom;
      this.camera.pan(dx / len * speed, dy / len * speed);
    }
  }

  // ---- Simulation ----
  _simulate() {
    // Rebuild spatial hash
    this.spatial.clear();
    for (const e of this.entities) {
      if (e.kind === 'projectile' || e.dead) continue;
      this.spatial.insert(e);
    }

    // Resource node shimmer
    for (const e of this.entities) {
      if (e.kind === 'resource') {
        e.shimmer = (e.shimmer + SIM_DT * 4) % 3;
      }
      if (e.flash > 0) e.flash -= SIM_DT;
    }

    updateAI(this);
    updateMovement(this);
    updateGather(this);
    updateBuild(this);
    updateCombat(this);
    updateTraining(this);

    tickCache(SIM_DT);

    // Remove dead resources / units / buildings
    const before = this.entities.length;
    this.entities = this.entities.filter(e => {
      if (e.kind === 'projectile' && e.dead) return false;
      if (e.kind === 'resource' && e.amount <= 0) {
        this.map.setOccupiedRect(e.tx, e.ty, 1, 1, 0);
        return false;
      }
      if ((e.kind === 'unit' || e.kind === 'building') && e.hp <= 0) return false;
      return true;
    });
    if (this.entities.length !== before) {
      // Rebuild selection list
      this.selection = this.selection.filter(s => s.hp === undefined || s.hp > 0);
    }

    // Command markers fade
    for (const m of this.cmdMarkers) m.life += SIM_DT;
    this.cmdMarkers = this.cmdMarkers.filter(m => m.life < m.maxLife);

    // Update supply caps each tick for HUD
    {
      // Inline computation, avoid circular import
      let pCap = 0, pUsed = 0, eCap = 0, eUsed = 0;
      for (const e of this.entities) {
        if (e.kind === 'building' && e.state === 'built') {
          const def = BUILDING_DEFS[e.type];
          if (e.team === TEAM.PLAYER) pCap += def.suppliesProvided || 0;
          else if (e.team === TEAM.ENEMY) eCap += def.suppliesProvided || 0;
        } else if (e.kind === 'unit') {
          const def = UNIT_DEFS[e.type];
          if (e.team === TEAM.PLAYER) pUsed += def.supply;
          else if (e.team === TEAM.ENEMY) eUsed += def.supply;
        }
      }
      this.players[TEAM.PLAYER].supplyCap = pCap;
      this.players[TEAM.PLAYER].supplyUsed = pUsed;
      this.players[TEAM.ENEMY].supplyCap = eCap;
      this.players[TEAM.ENEMY].supplyUsed = eUsed;
    }

    // Win/lose check
    if (!this._hasHQ(TEAM.PLAYER)) {
      this._endGame(false);
    } else if (!this._hasHQ(TEAM.ENEMY)) {
      this._endGame(true);
    }
  }

  _hasHQ(team) {
    for (const e of this.entities) {
      if (e.kind === 'building' && e.team === team
          && (e.type === 'garage' || e.type === 'fedhq')
          && e.hp > 0) return true;
    }
    return false;
  }

  _endGame(victory) {
    if (this.ended) return;
    this.ended = true;
    this.hud.showEnd(victory);
  }

  // ---- Main tick ----
  _tick = (now) => {
    requestAnimationFrame(this._tick);
    let dt = (now - this.lastT) / 1000;
    if (dt > 0.1) dt = 0.1; // clamp after pauses
    this.lastT = now;

    this._handleEvents();
    this._updateKeyPan(dt);

    if (this.started && !this.ended) {
      this.acc += dt;
      const t0 = performance.now();
      let steps = 0;
      while (this.acc >= SIM_DT && steps < 5) {
        this._simulate();
        this.acc -= SIM_DT;
        steps++;
      }
      this.simMs = performance.now() - t0;
    }

    const r0 = performance.now();
    this.renderer.draw();
    if (this.started) {
      this.renderer.drawMinimap(this.hud.minimap, this);
    }
    this.hud.update();
    this.renderMs = performance.now() - r0;

    // FPS counter
    this.frames++;
    if (now - this.lastFpsT > 500) {
      this.fps = (this.frames / ((now - this.lastFpsT) / 1000)) | 0;
      this.frames = 0;
      this.lastFpsT = now;
      this.hud.setFps(`fps:${this.fps} sim:${this.simMs.toFixed(1)}ms ren:${this.renderMs.toFixed(1)}ms ents:${this.entities.length}`);
    }
  }
}
