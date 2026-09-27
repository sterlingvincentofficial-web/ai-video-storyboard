# Roll a Diver

**Roll divers → they dive into a pitch-black trench → unlock treasure.**

A Roblox idle collection tycoon. Your dock sits over a bottomless trench. Roll divers, watch their
flashlights sink into the dark, and see what glows as they come back up.

Everything (world, docks, divers, treasures, chests, Kraken, UI) is built from code, so the place
works as soon as you open it. Optional textured 3D models made with Higgsfield replace the built-in
look when you import them (see [MODELS.md](MODELS.md)).

**Publishing?** Follow [LAUNCH.md](LAUNCH.md) step by step. The store text, prices and art are in
[STORE.md](STORE.md).

---

## Put it in Roblox Studio

### Option A: open the ready-made place file (easiest)
1. Download `RollADiver.rbxlx` from this folder.
2. Double-click it (or **Studio → File → Open from File**).
3. Press **Play**. The world builds itself when the game starts. In edit mode the map looks empty,
   which is expected.

### Option B: live-sync with Rojo (best for keeping code in git)
1. Install the [Rojo](https://rojo.space) Studio plugin and the `rojo` CLI (7.4+).
2. In this folder: `rojo serve`
3. In Studio: open a new Baseplate, then **Rojo plugin → Connect**. Delete the default Baseplate part.
4. Edits to files in `src/` now appear in Studio instantly.

To rebuild the place file after changing code: `rojo build default.project.json -o RollADiver.rbxlx`

### Before publishing
See [LAUNCH.md](LAUNCH.md) for the full checklist. In short: publish, turn on API services, create the
passes and products and paste their ids into `src/shared/Config/Monetization.luau` (items with id `0`
show as "coming soon"), then run `/selftest` in a live server.

---

## Testing in Studio

Chat commands work in Studio and for the game owner:

| Command | Does |
|---|---|
| `/cash 1e9` | add cash |
| `/rebirth` | rebirth for free |
| `/event lowtide` · `/event bloodmoon` · `/event kraken` | start an event |
| `/endevent kraken` | end an event |
| `/diver Poseidon` | give a diver (ids in `Config/Divers.luau`) |
| `/chest 3 10` | 10 chests from zone 3 |
| `/pass AutoOpen` | toggle a gamepass (Studio only) |
| `/product LuckPotion` | run a product's effect (Studio only) |
| `/wipe` | reset your save |
| `/selftest` | check saving, leaderboards, policy, config and the dive loop in the running game (PASS/WARN/FAIL in the Output window) |

---

## How the game works

| System | Summary |
|---|---|
| **Roll** | 5 rolls (Snorkel, Scuba, Deep, Abyss, Atlantis), each a pool of divers with "1 in N" odds. Luck flattens the odds. |
| **Divers** | 25 divers in 7 tiers. Stats: max depth, luck, speed. Divine and Secret divers have abilities (Poseidon: every 5th dive gives 2 chests, Ghost Captain ignores zone locks, and more). |
| **Dive loop** | Idle → Down → Bottom → (Kraken grab) → Up → Idle. The server sets attributes and every client animates the jump, the sink into the dark, the flashlight and the rising glow. |
| **The glow** | While a diver rises, it glows in the rarity colour of the best treasure in its chest. |
| **Chests** | Contents are rolled when the diver surfaces (the diver's luck counts), then kept sealed until you open them. |
| **Treasures** | 56 treasures across 7 zones, each with 7 conditions (Barnacled → Glitched, up to x40). They go on vault pedestals and earn $/s. Step on the green pad to collect. |
| **Sets** | Display a full set (e.g. Pirate Captain) for bonus income. |
| **Index** | A page per zone plus divers. Silhouettes for undiscovered items. Each finished page gives +5% income forever. |
| **Zones** | Shallows, Reef and Shipwreck to start. Rebirths unlock Twilight (1), Abyss (2), Atlantis (3) and ??? The Bottom (5). |
| **Rebirth** | Resets cash, divers, treasures and chests. +50% income per rebirth and a new zone. Keeps upgrades, the Index, and Divine/Secret divers. |
| **Upgrades** | Dive slots, vault pedestals, luck, dive speed. |
| **Kraken grab** | 5% of dives: a tentacle grabs your diver. Click it within 6s for a bonus chest, or the chest is lost. |
| **Events** | Low Tide (divers are 2x faster and reach +1 zone), Blood Moon (Cursed x5, red sky), Kraken boss (whole server clicks it, chests for everyone). |
| **Offline** | 25% of your income while away, up to 8h (12h for VIP). |
| **Rewards** | Codes (`RELEASE`, `DIVEIN`, `KRAKEN`, `DEEPER` after 1 rebirth), a 7-day login streak, a free wheel spin every 4 hours, and an optional join-the-group luck bonus (`GroupId` in `Config/Rewards.luau`). |
| **Leaderboards** | Global Top Earners and Top Rebirths (OrderedDataStore). Shown on two boards in the harbor and in the Top menu. |
| **New players** | A guided first minute (arrow and beam: dive, open, collect, roll, upgrade), and the first roll is guaranteed Rare or better. |
| **Settings** | Sound effects on/off, low graphics, hide other players' divers. Saved per player. |
| **Monetization** | Passes: x2 Money, Auto Collect, Auto Open, +2 Slots, Lucky Diver, VIP. Products: Starter Pack, Luck Potion, Oxygen Tank, Server Low Tide, cash packs, wheel spins. Where paid random items are restricted (PolicyService), cash packs and spins are hidden and paid cash becomes a luck potion. |

### Balance (from `tests/sim.luau`, an active player)
First Rare diver about 1 min · Scuba roll about 2.5 min · Legendary about 10 min · **Rebirth 1 about 1 h** · Rebirth 2 about 2.5 h ·
Rebirth 3 about 5 h. Change numbers in `src/shared/Config/`, then rerun the sim.

---

## Project layout

```
default.project.json        Rojo project
RollADiver.rbxlx            built place, open in Studio
src/shared/                 ReplicatedStorage.Shared (used by server and client)
  Config/                   ALL game data and tuning: divers, treasures, zones, crates, prices...
  Formulas.luau             all game math (luck, income, costs), pure and tested
  ModelFactory.luau         builds every model from parts (or uses imported models, see MODELS.md)
  Remotes.luau              networking
src/server/                 ServerScriptService.Server
  Main.server.luau          boots services
  Layout.luau               world positions
  Services/                 Data, Plots, Divers, Chests, Vault, Roll, Upgrades, Rebirth,
                            Events, Kraken, Market, Rewards, Leaderboards, Analytics,
                            Announcements, Actions, Admin, SelfTest, Players
src/client/                 StarterPlayerScripts.Client
  UI/                       HUD, menu, 11 panels, reveal animations, toasts
  Controllers/              diver animation, world effects, chat tags, tutorial guide
tests/                      offline tests (Lune)
assets/models.txt           Higgsfield model download links
LAUNCH.md · STORE.md · MODELS.md
```

## Tests (no Studio needed)

Requires [Lune](https://lune-org.github.io/docs) 0.8+.

```bash
lune run tests/run                    # config + formula unit tests
lune run tests/sim 8                  # 8-hour economy simulation
rojo build default.project.json -o RollADiver.rbxlx
lune run tests/runtime/server_test    # boots the real server scripts from the place file in a
                                      # mock Roblox runtime and plays a whole session
lune run tests/runtime/client_test    # builds the real UI and opens every panel
PHONE=1 lune run tests/runtime/client_test   # same at phone resolution
lune run tests/runtime/stress_test    # 4 players play randomly for 2 minutes with events,
                                      # rejoins and the Kraken; checks saves, locks and part count
```

Current results: unit 24/24, server 116/116, client 35/35 (desktop and phone), stress 36/36.

## Not included yet (ideas for live ops)
- Custom sounds and music (UI uses Roblox's built-in click/ping sounds)
- Trading between players
- Weekly diver drops and limited events (add entries to `Config/`)
