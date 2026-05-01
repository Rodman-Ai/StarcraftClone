# Rick & Morty: Galactic Conquest

A 2D pixel-art StarCraft-style RTS skirmish themed around the Rick and Morty
universe. Single-page web game, no build step, no dependencies.

Play C-137 Resistance vs the Galactic Federation: harvest Dark Matter, train
Mortys, build a Garage and Barracks, and crush the enemy HQ.

## Run locally

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

Or just open `index.html` in any modern browser. Works on desktop and mobile.

## Controls

### Desktop

- **Left-click** — select unit / building (drag to box-select multiple units)
- **Right-click** — contextual command (move, attack, gather)
- **Arrow keys / WASD** — pan camera
- **Mouse wheel** — zoom
- **B** — build Barracks (worker selected) • **G** — build Garage
- **M / R / P** — queue Morty / Rick / Bird Person at selected building
- **Esc** — cancel placement / clear selection
- **`** (backtick) — toggle FPS overlay

### Mobile

- **Tap** — select
- **Long-press** — contextual command
- **Drag empty terrain** — pan camera
- **Pinch** — zoom
- **Bottom build bar** — train units / place buildings
- **Top-right ≡** — collapse build bar

## Game design

- **Player faction (C-137 Resistance):** Morty (worker), Rick (heavy ranged
  hero), Bird Person (fast ranged).
- **Enemy faction (Galactic Federation):** Fed Drone (worker), Fed Soldier
  (ranged), Gromflomite (heavy).
- **Resource:** Dark Matter, harvested from cyan crystal nodes.
- **Buildings:** Garage (HQ — trains workers, deposit point, +8 supply) and
  Barracks (trains combat units, +4 supply).
- **Win:** destroy the enemy HQ. **Lose:** lose your last HQ.

## Architecture

Vanilla HTML5 + Canvas2D, ES modules. Fixed-timestep simulation at 30 Hz
with variable-rate rendering. Procedural pixel-art sprite atlas built once
at boot. Tile-grid BFS pathfinding with a small per-frame cache.

```
index.html               canvas + HUD overlay, mounts main.js
styles.css               HUD layout, mobile-friendly
src/main.js              boots the Game
src/game.js              main loop, world state, input dispatch
src/config.js            tunables (costs, HP, speeds, AI thresholds)
src/world/               map, camera, pathfinding, spatial hash
src/render/              renderer, procedural sprite atlas, HUD
src/input/               unified pointer + commands (select/move/attack/build)
src/entities/            entity factories
src/systems/             movement, combat, gather, training, build, AI
tests/smoke.mjs          headless simulation smoke test
```

## Testing

```sh
node tests/smoke.mjs
```

Boots the simulation in a stubbed-DOM environment and asserts: workers
gather Dark Matter, training spawns units, pathfinding returns waypoints,
combat deals damage.
