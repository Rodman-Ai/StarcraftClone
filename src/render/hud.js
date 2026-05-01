// DOM-based HUD: top resource bar, selection panel, build bar, messages,
// minimap interactivity, and end overlay. Mobile-friendly via large touch
// targets.

import { BUILDING_DEFS, UNIT_DEFS, TEAM, TILE } from '../config.js';
import { SPRITES } from './sprites.js';
import { tryQueueUnit } from '../systems/training.js';

export class HUD {
  constructor(game) {
    this.game = game;
    this.darkmatterEl = document.getElementById('darkmatter');
    this.supplyCurEl = document.getElementById('supply-cur');
    this.supplyMaxEl = document.getElementById('supply-max');
    this.selPanel = document.getElementById('selection-panel');
    this.selPortrait = document.getElementById('sel-portrait');
    this.selName = document.getElementById('sel-name');
    this.selHp = document.getElementById('sel-hp');
    this.selExtra = document.getElementById('sel-extra');
    this.buildBar = document.getElementById('build-bar');
    this.messages = document.getElementById('messages');
    this.endOverlay = document.getElementById('end-overlay');
    this.endTitle = document.getElementById('end-title');
    this.endSub = document.getElementById('end-sub');
    this.endRestart = document.getElementById('end-restart');
    this.fpsEl = document.getElementById('fps');
    this.menuToggle = document.getElementById('menu-toggle');
    this.introOverlay = document.getElementById('intro-overlay');
    this.introStart = document.getElementById('intro-start');
    this.minimap = document.getElementById('minimap');

    this._lastSel = null;
    this._buildButtons = new Map();
    this._activeBuildButton = null;

    this.endRestart.addEventListener('click', () => game.restart());
    this.introStart.addEventListener('click', () => {
      this.introOverlay.classList.add('hidden');
      game.started = true;
    });
    this.menuToggle.addEventListener('click', () => {
      this.buildBar.classList.toggle('collapsed');
    });
    this.minimap.addEventListener('click', (e) => this._onMinimapClick(e));
    this.minimap.addEventListener('touchend', (e) => {
      if (e.changedTouches && e.changedTouches[0]) {
        const t = e.changedTouches[0];
        this._onMinimapClick({ clientX: t.clientX, clientY: t.clientY });
      }
    });
  }

  _onMinimapClick(e) {
    const rect = this.minimap.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / rect.width;
    const fy = (e.clientY - rect.top) / rect.height;
    const wx = fx * this.game.map.w * TILE;
    const wy = fy * this.game.map.h * TILE;
    this.game.camera.centerOn(wx, wy);
  }

  message(text) {
    const el = document.createElement('div');
    el.className = 'msg';
    el.textContent = text;
    this.messages.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }

  showEnd(victory) {
    this.endOverlay.classList.remove('hidden');
    this.endOverlay.classList.toggle('defeat', !victory);
    this.endTitle.textContent = victory ? 'Victory!' : 'Defeat';
    this.endSub.textContent = victory
      ? 'The Council of Ricks salutes you.'
      : 'The Galactic Federation has crushed C-137. Wubba-lubba- DOH.';
  }

  hideEnd() {
    this.endOverlay.classList.add('hidden');
  }

  update() {
    const game = this.game;
    const player = game.players[TEAM.PLAYER];
    this.darkmatterEl.textContent = Math.floor(player.resources);
    this.supplyCurEl.textContent = player.supplyUsed;
    this.supplyMaxEl.textContent = player.supplyCap;

    // Selection panel
    const sel = game.selection;
    if (sel.length === 0) {
      this.selPanel.classList.add('hidden');
      this._lastSel = null;
    } else {
      this.selPanel.classList.remove('hidden');
      const primary = sel[0];
      if (this._lastSel !== primary || sel.length > 1) {
        this._renderSelectionPortrait(primary, sel.length);
      }
      this._lastSel = primary;
      // HP percentage
      const ratio = primary.hp / primary.maxHp;
      this.selHp.style.setProperty('--hp', `${Math.max(0, ratio) * 100}%`);
      // Extra
      if (primary.kind === 'unit') {
        const def = UNIT_DEFS[primary.type];
        const extra = sel.length > 1
          ? `Group of ${sel.length}`
          : `${def.role} • ${primary.hp | 0}/${primary.maxHp} HP`;
        this.selExtra.textContent = extra;
      } else if (primary.kind === 'building') {
        const def = BUILDING_DEFS[primary.type];
        const queueLen = primary.trainQueue.length;
        let extra = `${primary.hp | 0}/${primary.maxHp} HP`;
        if (primary.state === 'building') {
          extra = `Constructing ${(primary.buildProgress * 100) | 0}%`;
        } else if (queueLen > 0) {
          const q = primary.trainQueue[0];
          const pct = ((1 - q.timeLeft / q.totalTime) * 100) | 0;
          extra += ` • Training ${UNIT_DEFS[q.type].label} ${pct}% (q:${queueLen})`;
        }
        this.selExtra.textContent = extra;
      } else if (primary.kind === 'resource') {
        this.selExtra.textContent = `Dark Matter: ${primary.amount | 0}`;
      }
    }

    this._renderBuildBar();
  }

  _renderSelectionPortrait(e, count) {
    const ctx = this._ensurePortraitCtx();
    const W = 48, H = 48;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#1a1d3a';
    ctx.fillRect(0, 0, W, H);
    if (e.kind === 'unit') {
      const sz = SPRITES.UNIT_SIZE;
      ctx.imageSmoothingEnabled = false;
      // Use front-facing first frame
      ctx.drawImage(SPRITES[e.type], 0, 0, sz, sz, (W - sz) / 2, (H - sz) / 2 + 2, sz, sz);
      this.selName.textContent = UNIT_DEFS[e.type].label + (count > 1 ? ` ×${count}` : '');
    } else if (e.kind === 'building') {
      const sz = SPRITES.BUILDING_SIZE;
      ctx.imageSmoothingEnabled = false;
      const scale = Math.min(W / sz, H / sz);
      const dw = sz * scale, dh = sz * scale;
      ctx.drawImage(SPRITES[e.type], (W - dw) / 2, (H - dh) / 2, dw, dh);
      this.selName.textContent = BUILDING_DEFS[e.type].label;
    } else if (e.kind === 'resource') {
      const sz = SPRITES.CRYSTAL_SIZE;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(SPRITES.crystal, 0, 0, sz, sz, (W - sz) / 2, (H - sz) / 2, sz, sz);
      this.selName.textContent = 'Dark Matter Crystal';
    }
  }

  _ensurePortraitCtx() {
    if (!this._portraitCanvas) {
      const c = document.createElement('canvas');
      c.width = 48; c.height = 48;
      c.style.width = '48px';
      c.style.height = '48px';
      c.style.imageRendering = 'pixelated';
      this.selPortrait.innerHTML = '';
      this.selPortrait.appendChild(c);
      this._portraitCanvas = c;
      this._portraitCtx = c.getContext('2d');
    }
    return this._portraitCtx;
  }

  _renderBuildBar() {
    const game = this.game;
    const sel = game.selection;
    // Determine what build options are available
    let options = [];

    // If player selected own building, show its train options
    const buildings = sel.filter(s => s.kind === 'building' && s.team === TEAM.PLAYER && s.state === 'built');
    const units = sel.filter(s => s.kind === 'unit' && s.team === TEAM.PLAYER);

    if (buildings.length > 0) {
      const b = buildings[0];
      const def = BUILDING_DEFS[b.type];
      for (const t of def.trains) {
        const u = UNIT_DEFS[t];
        options.push({
          key: `train-${t}`,
          icon: t,
          label: u.label,
          cost: u.cost,
          hk: hotkeyFor(t),
          enabled: game.players[TEAM.PLAYER].resources >= u.cost,
          action: () => tryQueueUnit(game, b, t),
        });
      }
    }

    // If worker(s) selected, show buildings they can place
    const hasWorker = units.some(u => UNIT_DEFS[u.type].canHarvest);
    if (hasWorker) {
      options.push({
        key: 'place-garage',
        icon: 'garage',
        label: 'Garage',
        cost: BUILDING_DEFS.garage.cost,
        hk: 'G',
        enabled: game.players[TEAM.PLAYER].resources >= BUILDING_DEFS.garage.cost,
        action: () => game.startPlacing('garage'),
      });
      options.push({
        key: 'place-barracks',
        icon: 'barracks',
        label: 'Barracks',
        cost: BUILDING_DEFS.barracks.cost,
        hk: 'B',
        enabled: game.players[TEAM.PLAYER].resources >= BUILDING_DEFS.barracks.cost,
        action: () => game.startPlacing('barracks'),
      });
    }

    // Diff-render: if option set changed, rebuild
    const sig = options.map(o => o.key).join('|');
    if (this._lastSig !== sig) {
      this.buildBar.innerHTML = '';
      this._buildButtons.clear();
      for (const opt of options) {
        const btn = document.createElement('button');
        btn.className = 'build-btn';
        btn.type = 'button';
        const ico = document.createElement('canvas');
        ico.className = 'icon';
        ico.width = 28; ico.height = 28;
        const ictx = ico.getContext('2d');
        ictx.imageSmoothingEnabled = false;
        if (UNIT_DEFS[opt.icon]) {
          const sz = SPRITES.UNIT_SIZE;
          ictx.drawImage(SPRITES[opt.icon], 0, 0, sz, sz, -2, -2, sz, sz);
        } else if (BUILDING_DEFS[opt.icon]) {
          const sz = SPRITES.BUILDING_SIZE;
          ictx.drawImage(SPRITES[opt.icon], 0, 0, sz, sz, 0, 0, 28, 28);
        }
        btn.appendChild(ico);
        const lab = document.createElement('div');
        lab.textContent = opt.label;
        btn.appendChild(lab);
        const cost = document.createElement('div');
        cost.className = 'cost';
        cost.textContent = `${opt.cost}`;
        btn.appendChild(cost);
        if (opt.hk) {
          const h = document.createElement('div');
          h.className = 'hk';
          h.textContent = opt.hk;
          btn.appendChild(h);
        }
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          if (btn.disabled) return;
          opt.action();
        });
        // Touch: prevent click delay glitches
        btn.addEventListener('touchstart', (e) => {
          e.preventDefault();
          if (btn.disabled) return;
          opt.action();
        }, { passive: false });
        this.buildBar.appendChild(btn);
        this._buildButtons.set(opt.key, { btn, opt });
      }
      this._lastSig = sig;
    }

    // Always update enabled state
    for (const { btn, opt } of this._buildButtons.values()) {
      btn.disabled = !opt.enabled;
    }
  }

  setFps(text) {
    if (!this.fpsEl) return;
    this.fpsEl.textContent = text;
  }
  toggleFps() {
    this.fpsEl.classList.toggle('hidden');
  }
}

function hotkeyFor(unitType) {
  switch (unitType) {
    case 'morty': return 'M';
    case 'rick': return 'R';
    case 'birdperson': return 'P';
    default: return '';
  }
}
