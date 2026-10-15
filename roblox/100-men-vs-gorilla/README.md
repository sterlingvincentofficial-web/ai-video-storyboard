# 100 Men vs 1 Gorilla (Roblox)

Wave defense: place up to 100 men, upgrade them, and survive 100 waves of bobble-headed monkeys
and gorilla bosses trying to steal your Banana Stash. You don't fight; your army does.

## Play it in Studio
1. Open `100MenVsGorilla.rbxlx` (File → Open from File).
2. **Import the meshes once:** Avatar/Home tab → **Import 3D** →
   - `assets/enemies/Enemies.fbx` (all 11 monkeys and gorillas, textures embedded)
   - `assets/men/Men.fbx` (the whole army: 9 units x 3 levels + the intro's pilot, textures embedded)
   - `assets/men/MenGear.fbx` (projectiles like pebbles and nets)

   Leave them where they land; the server tidies them into `ReplicatedStorage.Assets`.
3. Press **Play**. The first wave starts after 12 seconds. Pick a man on the hotbar (or keys 1-9),
   click the sand to place him, click a man to upgrade or sell him. Q / right-click cancels.
4. **Save the place** so the imports stay.

Before the imports, the game still runs with block stand-ins for the monkeys and plain Roblox
avatars for the men.

**Optional:**
- Sounds and music: upload `assets/sfx/*.wav` (Asset Manager → Bulk Import) and paste the IDs into
  `src/shared/Sounds.luau`. Until then, built-in Roblox sounds stand in for the effects and there
  is no music. The `music_*` files are the soundtrack: a calm loop between waves, a battle loop,
  a boss loop, and victory / game-over stingers (a MUSIC button and the M key toggle it).
- Logo: upload `marketing/final/logo.png` as a Decal and paste its id into
  `src/shared/Config/Brand.luau`; the intro's title card then uses it.
- Game page: the icon and thumbnails are in `marketing/final/` (see `marketing/README.md`).
- Jump to a later wave for testing: set the `StartWave` attribute on `ReplicatedStorage.GameState`
  while the game is running in Studio, before the first wave starts (the attribute is created when you press Play).

## The roster
| Monkeys | | Bosses (every 10th wave) | |
|---|---|---|---|
| Monkey | the basic brown bobble-head | Silverback | ground slams stun your men |
| Speedy | fast, cocky | Rock Thrower | hurls boulders |
| Banana Chucker | throws bananas that daze men | Berserker | enrages at half health |
| Brute | bucket helmet + armor | The Alpha | summons more monkeys |
| Baby Monkey | tiny, comes in swarms | The Gorilla (Titan) | wave 100, does all of it |
| Ninja Monkey | leaps over your front line | | |

| Army (3 levels each) | |
|---|---|
| Brawler | punches (heads pop off) |
| Slingshot Kid | pebbles |
| Lumberjack | axe cleave |
| Hunter | sniper, boss damage |
| Medic | heals the stash, hypes the men |
| Bait Guy | banana costume, taunts monkeys |
| Grenadier | splash, launches monkeys |
| Zookeeper | nets slow monkeys down |
| Commander | aura buff + rally shout |

## Kill feel (client)
Every kill style follows the weapon: **Bonk** (head pops off, bounces, bursts), **Whack** (batted
away), **Pop** (squash-and-stretch into studded bricks), **Launch** (blasted into the sky),
**Caught** (shrinks into the net), plus a multi-explosion boss death. On top: hit flashes,
wobbling bobble heads, damage numbers, coins flying into the cash counter, a combo counter with
callouts, camera shake and FOV punches.

## Intro cutscene (client)
Plays once when a player joins (Skip button, or Space/Enter). The squad's chopper flies in past the
islet, the temple idol's eyes light up and monkeys pour down the stairs, a Banana Chucker on the
Banana Stash hits the windshield with a slow-motion banana, the chopper spins out and crashes
exactly onto the map's wreck, the men tumble out into a pile, and THE Gorilla roars from the
temple before the title slam and the swoop into the HUD. The server holds wave 1 until every
player has finished or skipped it (38 s cap). The whole thing is data: `tools/cutscene/intro.json`
(camera keys, flight path, actor tracks, events, poses), played by `Cutscene.luau` in the game and
by `tools/preview/studio.html` for preview videos.

## Layout
| Path | What |
|---|---|
| `tools/build_map.py` | Builds the map + `src/shared/MapData.luau` (paths, base, build area). Fails if any two props overlap or surfaces z-fight. |
| `tools/build_models.py` | Shared studded-brick helpers and palette. |
| `tools/blender/enemy_defs.py` | Every enemy variant: proportions, colors, face, extras. |
| `tools/blender/enemy_textures.py` | Paints each variant's atlas (Pillow). |
| `tools/blender/build_enemies.py` | Builds `Enemies.fbx` + `RigData/Enemies.luau` (Blender `bpy`). |
| `tools/blender/men_defs.py` | The army: every unit's outfit, hat, face, weapon and 3 levels. |
| `tools/blender/men_textures.py` | Paints each army variant's face/shirt atlas (Pillow). |
| `tools/blender/build_men.py` | Builds `Men.fbx` (jointed toy figures, brick-built weapons) + `RigData/Men.luau`. |
| `tools/blender/build_gear.py` | Builds `MenGear.fbx` (projectiles, and the avatar fallback's gear) + `RigData/Gear.luau`. |
| `tools/clothing/make_templates.py` | Optional Shirt/Pants templates. |
| `tools/sfx/make_sfx.py` | Synthesizes the sound pack. |
| `tools/sfx/make_music.py` | Synthesizes the soundtrack (seamless loops + stingers). |
| `marketing/` | Game icon, thumbnails and logo (`final/`) and the game renders they were made from (`refs/`). |
| `tools/cutscene/intro.json` | The intro timeline; `build_intro.py` turns it into `Config/Intro.luau`, `mix_audio.py` mixes a preview soundtrack. |
| `tools/preview/` | three.js previews without Studio: `index.html` (the map), `studio.html` (combat scenes, the intro, army lineups, gameplay stills with `hud.js` mirroring the HUD), `grade.js` (the Lighting colour grade). |
| `src/shared/Config/` | Enemy stats, unit levels, wave recipes. |
| `src/server/Services/` | Economy, enemies (data-only, path-based), units (targeting/attacks), game loop. |
| `src/client/Modules/` | Enemy rendering + animation, army animation, kill effects, juice, HUD. |

## Rebuild
```
python3 tools/build_map.py
python3 tools/cutscene/build_intro.py
python3 tools/blender/enemy_textures.py
python3 tools/blender/men_textures.py
python tools/blender/build_enemies.py && python tools/blender/build_men.py && python tools/blender/build_gear.py   # venv with bpy
python3 tools/sfx/make_sfx.py && python3 tools/sfx/make_music.py
rojo build -o 100MenVsGorilla.rbxlx
```
