# 100 Men vs 1 Gorilla (Roblox)

Wave-based defense: place men, upgrade them, survive monkey waves and gorilla bosses.

**Art style:** classic Roblox bricks. Map parts are Plastic with Studs surfaces (LEGO-baseplate sand,
stair-stepped studded cliffs), mint water, lime shoreline strips, voxel palms. Monkeys are textured
meshes made in Blender; the men are real Roblox avatars (R15) dressed per unit level. See `docs/previews/`.

## Open in Studio
1. Open `100MenVsGorilla_StyleTest.rbxlx` (File → Open from File).
2. **Import the meshes** (one time): Home/Avatar tab → **Import 3D** → pick `assets/monkey/Monkey.fbx` → Import.
   Do the same for `assets/men/MenGear.fbx`. Leave them where they land; the showcase script finds them.
3. Press **Play**: three monkeys wander the beach and two level 1 Brawlers idle next to them.
4. Save the place so the imports stay.

Optional: upload `assets/men/Brawler_Shirt.png` and `Brawler_Pants.png` (Asset Manager → Bulk Import),
then put the image IDs in `src/shared/Units.luau` (`ShirtTemplate` / `PantsTemplate`). Until then the
Brawler wears plain white/blue body colors. If the monkey comes in flat gray, upload `MonkeyAtlas.png` and
set `MONKEY_TEXTURE_ID` in `src/server/StyleShowcase.server.luau`.

Live sync instead: install [Rojo](https://rojo.space), run `rojo serve` here, click **Connect** in the Rojo plugin.

## Layout
| Path | What |
|---|---|
| `tools/build_models.py` | Builds the map platform from studded parts. **All map colors live in `PALETTE`.** |
| `tools/blender/build_monkey.py` | Builds the Monkey mesh + texture atlas in Blender (`pip install bpy`) → `assets/monkey/`, and `src/shared/RigData/Monkey.luau`. |
| `tools/blender/build_gear.py` | Builds the men's gear meshes (headband, hand wraps) → `assets/men/MenGear.fbx`. |
| `tools/clothing/make_templates.py` | Draws classic Shirt/Pants templates for the men's outfits → `assets/men/`. |
| `src/shared/MonkeyRig.luau` | Rigs the imported monkey (root, Motor6Ds, Humanoid). |
| `src/shared/MenFactory.luau`, `Units.luau` | Men are real Roblox avatars (HumanoidDescription) dressed per unit level. |
| `src/client/MonkeyAnimator.client.luau` | Procedural walk/idle/tail animation for monkeys. |
| `src/workspace/*.model.json` | Generated map output, synced into `Workspace.StyleTest`. Don't hand-edit; re-run the script. |
| `src/server/StyleShowcase.server.luau` | Style-test scene: spawns rigged monkeys + Brawlers. |
| `tools/preview/` | Three.js preview renderer used to screenshot models without Studio. |

## Rebuild
```
python3 tools/build_models.py
python3 tools/blender/monkey_texture.py
python tools/blender/build_monkey.py && python tools/blender/build_gear.py   # Blender venv with bpy
python3 tools/clothing/make_templates.py
rojo build -o 100MenVsGorilla_StyleTest.rbxlx
```
