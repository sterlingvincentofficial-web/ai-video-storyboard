# Store listing

Everything you paste into the Creator Dashboard. The art is in the `StoreArt/` folder of the zip linked in
[MODELS.md](MODELS.md).

## Art

| File | Where it goes | Size |
|------|---------------|------|
| `Icon_512.png` | Creator Dashboard → your experience → **Places / Basic Info → Icon** | 512×512 |
| `Thumbnail1_Docks.png` | **Thumbnails** (first slot, the main one) | 1920×1080 |
| `Thumbnail2_Kraken.png` | Thumbnails, slot 2 | 1920×1080 |
| `Thumbnail3_Secret.png` | Thumbnails, slot 3 | 1920×1080 |

The art is AI-generated, so check the title lettering on each image before uploading. Roblox moderates
icons and thumbnails; these contain no real brands, people or off-platform links.

## Title

**Roll a Diver** 🌊

(Spare titles for A/B tests later: `Roll a Diver 🤿 [KRAKEN]`, `Roll a Diver! 💎 Deep Sea Treasure`.)

## Description

```
🎲 ROLL divers. 🤿 They DIVE into the dark. 💎 They bring back TREASURE.

The sea is pitch black. You can't see what's down there... but your divers can.
Roll for divers from crates, send them off your dock and see what they drag back up.

🌊 7 ZONES: Shallows, Coral Reef, Shipwreck Graveyard, Twilight Zone, The Abyss, Atlantis... and ??? The Bottom
🤿 25 DIVERS, each with their own ability
💎 56 TREASURES with rarities from Common to SECRET, plus Golden, Cursed, Crystal, Glitched and other conditions
🐙 KRAKEN BOSS: the whole server fights it together for loot
🌕 Events: Low Tide and Blood Moon
♻ Rebirth for permanent boosts and deeper crates
🏆 Global leaderboards, a daily login streak and a free reward wheel

CODES: RELEASE • DIVEIN • KRAKEN
(Type them in the 🎁 Rewards menu. More codes at milestones!)

👍 Like the game and join the group for updates!
```

Before publishing, double-check that the codes above match `src/shared/Config/Rewards.luau`. The fourth code,
`DEEPER`, needs one rebirth, so it's kept back for a later update post.

## Settings

| Field | Value |
|-------|-------|
| Genre | **Simulation** (subgenre: Incremental Simulator, if it's offered) |
| Max players | 6 (the map has 6 docks. Set it in **Places → Configure → Server Size**) |
| Devices | Computer, Phone, Tablet, Console (the UI scales to phones) |
| Maturity questionnaire | Answer honestly. The game has cartoon "combat" against the Kraken (clicking) and paid random items (crates can be bought with in-game cash, and Robux buys luck boosts). No blood, no realistic violence, no social hangout features beyond the default chat. The expected outcome is **Minimal** or **Mild**. |
| Private servers | Optional. 50–100 Robux is typical for simulators. |

## Game passes and developer products

Suggested prices are already in `src/shared/Config/Monetization.luau` (the `robux` field is what the shop
shows). Create each item on the dashboard at the same price and paste its id into `assetId`.
[LAUNCH.md](LAUNCH.md) walks through it.

**Game passes (one-time)**

| id | Name | Robux | Why this price |
|----|------|------:|----------------|
| AutoCollect | Auto Collect | 149 | Cheap convenience, often the first purchase |
| AutoOpen | Auto Open Chests | 199 | Convenience |
| ExtraSlots | +2 Dive Slots | 249 | Direct progression boost |
| LuckyDiver | Lucky Diver | 299 | Luck, the most-bought pass type in roll games |
| DoubleMoney | x2 Money | 399 | The standard headline pass |
| VIP | VIP | 499 | Bundle plus status (chat tag) |

**Developer products (repeatable)**

| id | Name | Robux |
|----|------|------:|
| OxygenTank | Oxygen Tank | 25 |
| CashSmall | Cash Pouch | 39 |
| SpinPack | 3 Wheel Spins | 49 |
| LuckPotion | Luck Potion | 49 |
| StarterPack | Starter Pack (one per player) | 99 |
| ServerLowTide | Server Low Tide | 199 |
| CashLarge | Cash Chest | 299 |

Players in regions that restrict paid random items (detected with PolicyService) never see the Cash
Pouch, Cash Chest or wheel spins. Their Starter Pack gives a luck potion instead of cash.

For the gamepass icons, a screenshot of the matching diver or treasure from the game works fine, or reuse
`Icon_512.png`.

## Launch update post (Group wall / social)

```
🌊 ROLL A DIVER IS OUT! 🤿
Roll divers, send them into the pitch-black sea and see what treasure comes back up.
Fight the Kraken with the whole server!
🎁 Codes: RELEASE, DIVEIN, KRAKEN
```
