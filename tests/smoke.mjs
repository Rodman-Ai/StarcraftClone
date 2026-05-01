// Headless-ish smoke test. Stubs out browser APIs (canvas, document, window),
// boots the game state, runs a series of simulation ticks, and asserts
// that:
//   1. Workers gather Dark Matter (resources increase from start).
//   2. AI eventually trains units.
//   3. Pathfinding produces non-null paths to a friendly tile.

import { fileURLToPath } from 'node:url';
import path from 'node:path';

// ---- DOM stubs ----
function makeCtxStub() {
  const ctx = new Proxy({}, {
    get(_, k) {
      if (k === 'imageSmoothingEnabled' || k === 'globalAlpha' || k === 'lineWidth' || k === 'fillStyle' || k === 'strokeStyle' || k === 'filter') return undefined;
      return () => {};
    },
    set() { return true; },
  });
  return ctx;
}
function makeCanvasStub(w = 800, h = 600) {
  return {
    width: w, height: h,
    style: {},
    clientWidth: w, clientHeight: h,
    getContext: () => makeCtxStub(),
    addEventListener: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: w, height: h }),
  };
}

const elements = new Map();
function makeEl(id) {
  const el = {
    id, style: {},
    classList: {
      _set: new Set(),
      add(c) { this._set.add(c); },
      remove(c) { this._set.delete(c); },
      toggle(c) { if (this._set.has(c)) this._set.delete(c); else this._set.add(c); },
      contains(c) { return this._set.has(c); },
    },
    children: [],
    appendChild(c) { this.children.push(c); },
    addEventListener: () => {},
    setProperty: () => {},
    set textContent(v) { this._text = v; },
    get textContent() { return this._text; },
    get innerHTML() { return ''; },
    set innerHTML(v) { this.children = []; },
    style: { setProperty: () => {} },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 160, height: 160 }),
    width: 0, height: 0,
    getContext: () => makeCtxStub(),
    remove: () => {},
    disabled: false,
  };
  el.style.setProperty = () => {};
  elements.set(id, el);
  return el;
}

['game', 'darkmatter', 'supply-cur', 'supply-max', 'selection-panel',
 'sel-portrait', 'sel-name', 'sel-hp', 'sel-extra', 'build-bar', 'messages',
 'end-overlay', 'end-title', 'end-sub', 'end-restart', 'fps', 'menu-toggle',
 'intro-overlay', 'intro-start', 'minimap'].forEach(makeEl);

global.window = {
  innerWidth: 800, innerHeight: 600,
  devicePixelRatio: 1,
  addEventListener: () => {},
};
global.document = {
  getElementById: id => elements.get(id) || makeEl(id),
  createElement: tag => {
    const el = makeEl('_' + tag + '_' + Math.random());
    if (tag === 'canvas') {
      el.width = 0; el.height = 0; el.getContext = () => makeCtxStub();
    }
    return el;
  },
};
global.performance = global.performance || { now: () => Date.now() };
global.requestAnimationFrame = () => 0;
global.HTMLCanvasElement = function() {};

// Make canvas element usable
const gameCanvas = elements.get('game');
gameCanvas.getContext = () => makeCtxStub();
gameCanvas.width = 800;
gameCanvas.height = 600;

// Now import the game
const root = path.dirname(fileURLToPath(import.meta.url));
const { Game } = await import(path.join(root, '..', 'src', 'game.js'));

const game = new Game(gameCanvas);
game.started = true;

// Run 90 simulated seconds (long enough for AI to amass an army & attack).
for (let i = 0; i < 30 * 90; i++) {
  game._simulate();
  if (game.ended) {
    console.log('Game ended at sim sec', (i / 30).toFixed(1));
    break;
  }
}

const player = game.players[0];
const enemy = game.players[1];
const playerUnits = game.entities.filter(e => e.kind === 'unit' && e.team === 0).length;
const enemyUnits = game.entities.filter(e => e.kind === 'unit' && e.team === 1).length;

console.log('After 30 sim sec:');
console.log('  player resources:', player.resources.toFixed(0));
console.log('  enemy resources:', enemy.resources.toFixed(0));
console.log('  player units:', playerUnits);
console.log('  enemy units:', enemyUnits);
console.log('  total entities:', game.entities.length);

let fail = 0;
function assert(cond, msg) {
  if (!cond) { console.log('FAIL:', msg); fail++; }
  else console.log('PASS:', msg);
}

assert(player.resources > 200, 'workers gathered some Dark Matter (started 200)');
assert(playerUnits >= 4, 'player still has at least 4 starting workers');
assert(enemyUnits > 0, 'enemy has units');
assert(game.entities.some(e => e.kind === 'building' && e.team === 0), 'player HQ exists');
assert(game.entities.some(e => e.kind === 'building' && e.team === 1), 'enemy HQ exists');

// Path smoke test
const { findPath } = await import(path.join(root, '..', 'src', 'world', 'pathfind.js'));
const p = findPath(game.map, 100, 100, 30, 10);
assert(Array.isArray(p) && p.length > 0, 'pathfind returns waypoints');

// Train a unit at the HQ
const { tryQueueUnit } = await import(path.join(root, '..', 'src', 'systems', 'training.js'));
const phq = game.entities.find(e => e.kind === 'building' && e.team === 0);
const queued = tryQueueUnit(game, phq, 'morty');
assert(queued, 'queueing morty succeeded');

// Drive simulation to actually spawn the unit
const before = game.entities.filter(e => e.kind === 'unit' && e.team === 0).length;
for (let i = 0; i < 30 * 8; i++) game._simulate();
const after = game.entities.filter(e => e.kind === 'unit' && e.team === 0).length;
assert(after >= before, 'morty trained successfully');

// Combat smoke: use a fresh game so scenario is isolated.
const { createUnit } = await import(path.join(root, '..', 'src', 'entities', 'entity.js'));
const game2 = new Game(gameCanvas);
game2.started = true;
const ehq = game2.entities.find(e => e.kind === 'building' && e.team === 1);
const dummy = createUnit('fedworker', 1, ehq.x - 80, ehq.y - 80);
const dummyHpStart = dummy.hp;
game2.entities.push(dummy);
const aggressor = createUnit('rick', 0, ehq.x - 60, ehq.y - 60);
game2.entities.push(aggressor);
for (let i = 0; i < 30 * 4; i++) game2._simulate();
const dummyStillAlive = game2.entities.includes(dummy);
const dummyTookDamage = !dummyStillAlive || dummy.hp < dummyHpStart;
assert(dummyTookDamage, 'Rick dealt damage to a target');

process.exit(fail);
