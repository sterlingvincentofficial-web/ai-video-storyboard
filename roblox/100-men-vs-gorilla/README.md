# 100 Men vs 1 Gorilla (Roblox)

Wave-based defense: place men, upgrade them, survive monkey waves and gorilla bosses.

**Art style:** classic Roblox bricks. Map parts are Plastic with Studs surfaces (LEGO-baseplate sand,
stair-stepped studded cliffs), mint water, lime shoreline strips, voxel palms. Characters are blocky R6
rigs with the classic Head mesh and smooth surfaces. See `docs/previews/`.

## Open in Studio
- **Quickest:** open `100MenVsGorilla_StyleTest.rbxlx` in Roblox Studio (File → Open from File).
- **Live sync:** install [Rojo](https://rojo.space) (VS Code extension or CLI + Studio plugin), run `rojo serve`
  in this folder, then click **Connect** in the Rojo plugin inside a new Studio place.

## Layout
| Path | What |
|---|---|
| `tools/build_models.py` | Builds the models (monkey, brawler, platform) from parts. **All colors live in `PALETTE`.** |
| `src/workspace/*.model.json` | Generated output, synced into `Workspace.StyleTest`. Don't hand-edit; re-run the script. |
| `src/server/` | Server scripts (currently only the style-test idle animation). |
| `tools/preview/` | Three.js preview renderer used to screenshot models without Studio. |

## Rebuild
```
python3 tools/build_models.py
rojo build -o 100MenVsGorilla_StyleTest.rbxlx
```
