# TOONFIRE hype ad

A 31-second trailer cut from real gameplay, with an original rock track synthesized in code. Nothing is stock footage or stock music.

## Pipeline

| Step | Script | What it does |
|---|---|---|
| 1. Footage | `shots.mjs`, `touchshot.mjs`, `cap.mjs` | Drives the running game in headless Chromium on a virtual clock and captures every frame (1920×1080, 30 fps). |
| 2. Music | `music.py` | Synthesizes the soundtrack with numpy/scipy. See below. |
| 3. Edit | `compose.py` | Cuts the shots to the beat and adds the title slams, flashes, zoom punches, shake, the phone mockup and the end card. Pipes frames to ffmpeg. |

**Capture details:**
- The player can run on autopilot, where a bot brain plays in first person.
- Shots can be staged: close-range duels, a back bonk, a jump-pad flight, a flag grab and the victory lineup.
- Chase cameras use the game's spectator camera.

**Soundtrack:**
- 150 BPM in E minor.
- Distorted double-tracked guitars and bass.
- Synthesized kick, snare, toms, hats and cymbals.
- A lead guitar line, a riser and a sub drop.

Every cut and title lands on the grid: a beat is 0.4 s and a bar is 1.6 s.

- **0–3.2 s:** intro riff, then a drum build.
- **3.2 s:** logo drop.
- **4.8–20.8 s:** world montage, 2 bars per world.
- **20.8–27.2 s:** feature cards on half-bar cuts, ending in stop hits.
- **27.2 s:** end card over the final chord.

## Running it

```bash
cd fps-game
npm install && npm run dev                          # game at http://localhost:5173
pip install numpy scipy pillow imageio-ffmpeg       # or have ffmpeg on PATH
cd marketing/ad
./fetch-fonts.sh
node shots.mjs                                      # all shots → frames/ (slow on software GL)
node touchshot.mjs                                  # phone UI shot
python3 music.py music.wav
python3 compose.py toonfire_ad.mp4                  # 16:9
python3 compose.py toonfire_ad_vertical.mp4 vertical  # 9:16 for Shorts/Reels/TikTok
```

**Environment variables:**
- `CHROMIUM_PATH`: path to a Chromium binary, if Playwright can't find one.
- `GAME_URL`: where the game is served, if not `http://localhost:5173/`.
- `FFMPEG`: path to ffmpeg, if it isn't on your PATH.

**Other commands:**
- `node shots.mjs plaza_duel,bonk` captures only the shots you name.
- `python3 compose.py x stills 3.3,21.1` renders single frames of the edit for checking.
