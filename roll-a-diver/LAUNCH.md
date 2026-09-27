# Launch checklist

From zero to a public game. Allow about 45 minutes, most of it creating passes and products.
Tick the boxes as you go.

You need: Roblox Studio, this folder (or the `RollADiver.rbxlx` file), and the models/art zip linked in
[MODELS.md](MODELS.md).

---

## 1. Open and check in Studio (5 min)

- [ ] Open `RollADiver.rbxlx` (double-click it, or **File → Open from File**). In edit mode the map is
      empty. It builds itself when the game runs.
- [ ] Press **Play**. You should spawn on the harbor with a dock, a starter diver and the tutorial arrow.
- [ ] Type `/selftest` in chat. Open **View → Output**. Expected in Studio before publishing:
      everything PASS except these WARNs: *Saving is enabled* / *DataStore tests skipped* (API access is
      off until step 3), *Gamepasses and products have ids*, *Group reward configured*,
      *Imported 3D models found* and possibly *Analytics events accepted*. There should be **no FAIL**.
- [ ] Stop the game.

## 2. Import the 3D models (optional, 5 min)

- [ ] Follow [MODELS.md](MODELS.md): **Import 3D** the 24 `.glb` files, then run the command-bar
      script. It should print `Moved 24 models`.
- [ ] Play, open a few chests and check the divers and treasures look right. If a diver faces
      backwards, give its model a `YRotation` attribute of `0` (see MODELS.md).

Skipping this is fine. The game works with its built-in models.

## 3. Publish (5 min)

- [ ] **File → Publish to Roblox** → *Create new experience*. Name it **Roll a Diver**. Pick the owner:
      you, or your group if you want group-owned revenue.
- [ ] **Home → Game Settings → Security → Enable Studio Access to API Services** → Save.
      (Saving, leaderboards and the self-test's DataStore checks need this.)
- [ ] Still in Game Settings: **Permissions / Places → Max players = 6**. The map has 6 docks. If
      Studio doesn't offer it, set it in step 6.

## 4. Game passes and developer products (20 min)

Open the [Creator Dashboard](https://create.roblox.com/dashboard/creations) → your experience →
**Monetization**. Prices and descriptions are in [STORE.md](STORE.md). For icons you can reuse
`StoreArt/Icon_512.png` or screenshots.

**Passes** (Monetization → Passes → Create a Pass → then open the pass → Sales → *Item for sale* on,
set the price):

| id in code | Name | Robux | Paste its ID here |
|---|---|---:|---|
| DoubleMoney | x2 Money | 399 | |
| AutoCollect | Auto Collect | 149 | |
| AutoOpen | Auto Open Chests | 199 | |
| ExtraSlots | +2 Dive Slots | 249 | |
| LuckyDiver | Lucky Diver | 299 | |
| VIP | VIP | 499 | |

**Developer products** (Monetization → Developer Products → Create):

| id in code | Name | Robux | Paste its ID here |
|---|---|---:|---|
| SpinPack | 3 Wheel Spins | 49 | |
| StarterPack | Starter Pack | 99 | |
| LuckPotion | Luck Potion | 49 | |
| OxygenTank | Oxygen Tank | 25 | |
| ServerLowTide | Server Low Tide | 199 | |
| CashSmall | Cash Pouch | 39 | |
| CashLarge | Cash Chest | 299 | |

- [ ] Put each ID into the game. In Studio: **Explorer → ReplicatedStorage → Shared → Config →
      Monetization**, double-click it, and replace `assetId = 0` with the ID for each item. If you use
      Rojo, edit `src/shared/Config/Monetization.luau` instead and rebuild.
- [ ] If you changed a price on the dashboard, change the matching `robux = ` number too. The shop
      shows that number.

## 5. Optional: group reward

- [ ] If you have a Roblox group, open **Shared → Config → Rewards** and set `Rewards.GroupId = <your group id>`
      (the number in the group's URL). Players who join get +10% luck and a one-time reward from the
      Rewards menu. Leave it at `0` to hide the button.

## 6. Store page (10 min)

Creator Dashboard → your experience → **Configure** (Basic Info / Places / Thumbnails):

- [ ] **Name** and **Description**: copy them from [STORE.md](STORE.md).
- [ ] **Genre**: Simulation.
- [ ] **Icon**: `StoreArt/Icon_512.png`. **Thumbnails**: the three `Thumbnail*.png` files, docks first.
      Check the lettering on each image first (it's AI-generated).
- [ ] **Devices**: Computer, Phone, Tablet and Console all on.
- [ ] **Places → Configure Place → Server size**: 6 (if not set in step 3).
- [ ] **Maturity & Compliance questionnaire**: fill it in honestly. See the notes in STORE.md.
      This is required before the game can be public.

## 7. Publish again and test the live game (5 min)

- [ ] In Studio: **File → Publish to Roblox** (this saves the passes, IDs and models into the live game).
- [ ] Creator Dashboard → your experience → keep it **Private** for now, then on the game page click
      **Play** (as the owner you can join a private game).
- [ ] In the live server type `/selftest`. Press **F9** to see the report. Expected: all PASS.
      A WARN is OK only for *Group reward* (if you skipped step 5) and *Imported 3D models* (if you
      skipped step 2). If anything FAILs, see the table below.
- [ ] Buy the cheapest item (Oxygen Tank, 25 Robux) to confirm purchases work end to end.
- [ ] Owner chat commands work in the live game too. If you used `/cash` or `/rebirth` while testing,
      type **`/wipe`** before you leave so your test money doesn't sit at the top of the global
      leaderboard.

## 8. Go public

- [ ] Creator Dashboard → your experience → **Privacy / Visibility → Public**.
- [ ] Post the launch message from STORE.md on your group wall or socials.

---

## If `/selftest` shows a FAIL

| FAIL line | Fix |
|---|---|
| All services loaded | Open **Output**. A script error at start-up names the file. Usually an edit to a Config file broke its syntax (a missing comma). |
| Ocean terrain generated / docks / harbor | Something stopped `WorldBuilder`. Check Output for the first error. |
| DataStore read/write / Leaderboard store readable | API access is off (step 3) or Roblox DataStores are having an outage (check status.roblox.com). |
| Paid random item policy checked | PolicyService didn't answer. Rejoin. If it persists, the shop treats you as restricted (safe default). |
| Game config is valid | An edit in `Config/` points at an id that doesn't exist (the detail names it). |
| Dive loop is running | A diver didn't change phase in 20 seconds. Check Output for errors from `DiverService`. |

## After launch

- **Creator Dashboard → Analytics**: the *Funnels* page shows the onboarding steps (Dive → Open → Collect
  → Roll → Upgrade), and the *Economy* page shows where cash comes from and goes.
- **Monitoring → Error Report**: check it daily for the first week.
- **Codes**: add new ones in `Config/Rewards.luau` for milestones (1K likes, updates, YouTuber promos).
  `DEEPER` is saved for your first update post.
- **Balance**: change numbers in `src/shared/Config/`, then run `lune run tests/sim 8` to see the new pacing
  before you publish.
