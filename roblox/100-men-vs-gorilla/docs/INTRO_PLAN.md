# Intro cutscene: the remix

Our take on the reference intro (helicopter approach → banana hit → crash → first wave), shot on our own map.
About **32 seconds**, plays on a player's first join, **Skip** button from the first second, replay from the menu.

The twist vs. the reference: the chopper is carrying **your squad**. A monkey knocks it out of the sky with a
banana, the men tumble out of the wreck, and **THE Gorilla** roars from the temple. That sets up the whole game in
one beat: men, monkeys, banana stash, gorilla.

## Shot list

| # | Time | Shot | What happens | Sound |
|---|------|------|--------------|-------|
| 1 | 0–4s | **Inside the chopper**, over the pilot's shoulder | Squad packed in the cabin (Brawler cracking knuckles, Slingshot Kid, Lumberjack hugging his axe). Island ahead through the windshield. Radio text: *"Drop zone in 30!"* | rotor loop, radio crackle |
| 2 | 4–7s | **Exterior tracking shot** over the sea | Chopper skims past the palm islet toward the island, camera alongside, a bit of roll. | rotor, wind |
| 3 | 7–10s | **Temple reveal**: crane up the giant stairs | The idol's eyes go from dark to glowing orange. Monkeys pour out of the temple door and drum their chests on the plateau. | drum hit, monkey chatter |
| 4 | 10–13s | **The camp below** | Monkeys raid the Banana Stash: stuffing bananas, one swinging on the flag pole. The chopper's shadow sweeps over them; they all look up. | squeaks |
| 5 | 13–17s | **Slow-mo banana** | A Banana Chucker on top of the stash winds up and throws. Slow-mo follow-cam on the spinning banana with a motion trail... **SPLAT** on the windshield (the same splat that stays on the wreck). | whoosh (pitched down), splat |
| 6 | 17–20s | **Chaos in the cockpit** | Red alarm flashes. The pilot is blind under the banana. The chopper spins twice, smoke trailing, and the men's bobble heads bounce off the walls. *"MAYDAY!"* | alarm, rotor wobble |
| 7 | 20–23s | **Crash**: wide shot by the helipad | It misses the big **H** by a few studs and slams into the sand at the wreck spot. Studded-brick burst, white flash, camera shake, and the scorch mark appears. | crash boom |
| 8 | 23–27s | **Tumble out** | The side door pops off. The men spill out one by one into a comedy pile, and a helmet rolls away. The pilot crawls out last with the banana still on his face. | thuds, boing |
| 9 | 27–30s | **Gorilla roar** | Cut to the temple top. THE Gorilla rises behind the brazier and roars (screen shake). The monkeys scatter back into the jungle and the temple. Title stamp: **100 MEN vs 1 GORILLA**. | roar, title slam |
| 10 | 30–32s | **Into gameplay** | The camera swoops down to the normal camp view and the HUD slides in: *PROTECT THE BANANA STASH*, *NEXT WAVE IN 10*, then a tutorial arrow: "Place your first Brawler here". | horn |

## Continuity with the map

- The crash spot **is** the wreck that already sits in the map (`Map_Base` → `Heli*` parts, with the banana splat on its
  windshield). During the cutscene the static wreck is hidden and a flying copy is animated. On impact the static
  wreck is shown again.
- The monkeys come from the temple door and the jungle, exactly where the waves come from, so the cutscene also
  teaches the player where to look.
- The squad you see tumbling out is your starting unit lineup.

## How it gets built

- **`src/client/Modules/Cutscene.luau`**: a data-driven timeline (the same idea as `UnitAnims`):
  - Camera keys: CFrame, FOV, easing, plus a playback-rate curve, so slow-mo is just rate 0.25 on shot 5.
  - Event keys at set times: spawn actor, play sound, Fx burst, shake, UI text.
- **Actors**:
  - **Flying chopper:** `build_map.py` also writes an intact copy of the helicopter into `ReplicatedStorage.Assets`.
  - **Monkeys:** `EnemyRig.build`.
  - **Men:** pre-built by the server into `ReplicatedStorage.Assets.CutsceneSquad`, since avatars can only be built server-side.
  - **Gorilla:** the Titan rig.
- **Fx reuse**: the brick burst, shake and flash from `Fx`/`KillFx`, and the banana trail from the Banana Chucker.
- **UI**:
  - Letterbox bars, a Skip button and the title stamp, in the same font and style as the HUD.
  - First-join flag saved as a player attribute for now, moved to DataStore when Gems and meta progression land.
- **Server**: `GameService` holds wave 1 until every player has finished or skipped, with a 35s cap so nobody waits forever.
- **New sounds** (`tools/sfx/make_sfx.py`): rotor loop, radio crackle, splat, alarm, crash and title slam. The roar,
  boing, thud and horn already exist.

## Order of work

1. Timeline player + camera path + skip (test with an empty shot list).
2. Flying chopper asset + shots 1, 2, 7 (the flight and the crash): the backbone.
3. Monkeys and banana (shots 3–6), men tumble (8), gorilla + title (9), hand-off to HUD (10).
4. Preview renders of every shot for your review before we polish timings.

## Build prompt (run when the user says "go")

First redo the two sloppy spots on the map:
- **Crash site:** turn the flat disc with random debris into a real crash. Add a gouge trench plowed toward the helipad, sand berms pushed up around the nose, and a snapped rotor blade stuck upright in the sand. Spill the squad's cargo crates from the open door, add a small fire with smoke on the engine, and give the whole wreck a cleaner, chunkier helicopter model.
- **Lagoon:** make the pond sit down in stepped sand and stone banks instead of flat tiles. Rebuild the dock as one solid boardwalk on pilings, with rope railings, that properly connects both stilt huts with ladders. Add lily pads and reeds, and tie the rope fence into the dock.

Then build the 32-second skippable intro:
1. Squad inside the chopper.
2. Flyover past the islet.
3. The idol's eyes ignite and monkeys pour down the stairs.
4. Monkeys raid the Banana Stash.
5. A slow-motion banana splats onto the windshield.
6. Mayday spin.
7. Crash just short of the helipad, landing exactly on the map's wreck.
8. The men tumble out into a pile.
9. THE Gorilla roars from the temple, then the title stamp.
10. Swoop into the HUD with "NEXT WAVE IN 10".

Build it as a data-driven camera and event timeline. Reuse the existing Fx, rigs and sounds, with the server holding wave 1 until everyone finishes or skips. Show preview renders of every shot for review.
