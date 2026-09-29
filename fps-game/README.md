# TOONFIRE

A cartoon 4v4 first-person shooter for desktop and mobile browsers: you and three bots (Blue) against four bots (Red), across five worlds, each drawn in its own art style.

Built with Three.js and TypeScript. Everything is procedural: the geometry, textures, characters, sound effects and music are all generated at runtime, with no asset files except the five menu thumbnails.

## Worlds

| World | Style | Setting |
|---|---|---|
| **Splat Plaza** | Saturday-morning cel shading, thick ink outlines | Sunny town square with a fountain, market stalls and a raised terrace. Shots leave paint splats. |
| **Paper Fort** | Construction paper and corrugated cardboard, paper-fibre grain | Two cardboard castles on either side of a paper river, with origami forests and hanging paper clouds. |
| **Ink City** | Comic-book page: heavy inks, Ben-Day halftone dots, POW! pops | Retro city block with a main avenue, alleys, fire escapes, a hero statue and cars as cover. |
| **Toy Box** | Glossy vinyl toys in pastel candy colours | A giant kid's bedroom with building-block forts, a toy train and a teddy bear. You play as the toy soldiers. |
| **Neon Rooftops** | Synthwave night: glowing neon edges and bloom | Rooftops at different heights with deadly gaps between them, bridges, jump pads and a striped sunset. |

## Modes

- **Team Splat**: team deathmatch.
- **Capture the Flag**: your own flag must be at your base to score.
- **King of the Hill**: every second your team holds the zone scores a point.
- **Duck Rush**: carry the golden rubber duck to score. The carrier doesn't regenerate health.
- **Elimination**: no respawns; first team to win 4 rounds.

**Mutators** (combinable): Big Heads, Moon Gravity, Turbo, One Zap (instagib), Bottomless Ammo, Vampire.

**Bot difficulty**: Easy, Normal, Hard, Insane. Bots pathfind (A* on a 2.5D nav grid, including jump pads and ledges), strafe, lead their rocket shots, throw grenades, pick up health and weapons, and play the objective with role assignments in CTF.

## Weapons and items

**Weapons:**
- **Blaster**: full-auto.
- **Scatter**: shotgun.
- **Boomer**: splash rockets. You can rocket-jump.
- **Zapper**: scoped rail gun.
- **Splat Bombs**: bouncy grenades.

**Pickups:** health, ammo, the Boomer and Zapper, and Overcharge (double damage).

**Movement:** double jump, sprint, and jump pads.

## Progression and extras

- XP and levels, with 15 unlockable hats.
- Three daily challenges.
- Career stats.
- Kill cam, then an end-of-match victory dance and results screen.

Settings and progress are saved in `localStorage`.

## Controls

| Desktop | Mobile |
|---|---|
| WASD move · Shift sprint · Space jump (twice to double jump) | Left thumb: floating joystick (push to the edge to sprint) |
| Mouse aim · LMB fire · RMB aim/scope | Right thumb: drag to look |
| R reload · 1–4 / wheel switch · G or Q Splat Bomb | 🔥 fire (drag on it to aim while firing), ⤒ jump, ◎ scope, ↻ reload, ⇄ swap, 💣 bomb |
| Tab scoreboard · Esc pause | ☰ scoreboard · Ⅱ pause |

If the page can't capture the mouse (some embedded frames block it), drag with the left button to aim and fire, or with the right button to just look. The arrow keys also turn.

## Development

```bash
cd fps-game
npm install
npm run dev                  # http://localhost:5173
npm run typecheck
npm run build                # multi-file build in dist/
npm run build:single         # everything inlined into dist-single/index.html
node make-artifact.mjs dist-single/index.html out.html   # page body for a claude.ai Artifact
```

**Debug and test hooks:**
- `?debug=<world>&cam=x,y,z,yaw,pitch` renders a world with a fixed camera. Add `top=1` for a top-down view and `markers=1` to mark gameplay points.
- `?autostart=<world>:<mode>` jumps straight into a match.
- `window.__game.simulate(seconds)` runs the simulation headless (the Playwright scripts `sim.mjs`, `probe.mjs` and `evalshot.mjs` use this).

## Architecture

```
src/
  core/      input, settings, profile/XP, daily challenges, procedural audio (Audio.ts)
  world/     Level (box + ramp collision, raycasts), NavGrid (A*), WorldScene (loads a world)
  worlds/    one WorldDef per world: symmetric layout (LevelBuilder) + visuals + theme
  render/    Pipeline (post-processing: depth outlines, halftone, paper, neon bloom),
             Materials, Batcher (static mesh merging), Character, ViewModel, Effects
  entities/  Actor (movement physics), Weapons, Bot (AI brain)
  modes/     TDM, CTF, KOTH, Duck Rush, Elimination, mutators
  game/      Match (simulation), Game (loop, camera, player control, events → HUD/audio)
  ui/        HUD (per-world skins), menus, touch controls, CSS
```

**Rendering:** every world renders through a single post-processing pass driven by its `StyleParams`. Outlines come from the Laplacian of inverse depth, which gives both silhouettes and creases without an extra normal pass.

**Performance:** static geometry is merged per material, and characters are baked into a few vertex-coloured meshes each. Resolution scales dynamically when the frame rate drops.
