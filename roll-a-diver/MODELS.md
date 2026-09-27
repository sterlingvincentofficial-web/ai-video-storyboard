# 3D models (Higgsfield)

The game ships with built-in blocky models for every diver, treasure, chest and the Kraken, so it
works with nothing imported. On top of that, 24 of the most-seen items were generated as textured
3D models with Higgsfield (Meshy v6). Import them and they replace the built-in look automatically:
no code changes needed.

**Download everything (models + store art):**
https://d2ol7oe51mr4n9.cloudfront.net/user_3IBf7n4ojUR6epQXmBO9jOL8gQ8/0b70619e-b6a7-46da-8c86-0ad77b644e5b.zip

The zip has `Models/` (24 `.glb` files, already named correctly) and `StoreArt/` (icon and thumbnails,
see [STORE.md](STORE.md)). Every model is a single textured mesh under Roblox's 20,000-triangle limit.

## Import (about 5 minutes)

1. Unzip. In Studio open **RollADiver.rbxlx** (or your published place).
2. **Home → Import 3D** (the 3D Importer). Select all 24 files in `Models/` at once.
3. In the import settings, keep *Anchored* on and leave everything else at the default. Click **Import**.
   The models land in Workspace, each named after its file (e.g. `Diver_Poseidon`).
4. Open **View → Command Bar**, paste this, and press Enter. It moves the models to where the game looks
   for them:

   ```lua
   local RS = game:GetService("ReplicatedStorage")
   local assets = RS:FindFirstChild("Assets") or Instance.new("Folder", RS); assets.Name = "Assets"
   local models = assets:FindFirstChild("Models") or Instance.new("Folder", assets); models.Name = "Models"
   local moved = 0
   for _, child in workspace:GetChildren() do
   	local n = child.Name
   	if n == "Kraken" and child:IsA("Model") and child:FindFirstChildWhichIsA("MeshPart", true)
   		or n:match("^Diver_") or n:match("^Treasure_") or n:match("^Chest_") then
   		local old = models:FindFirstChild(n); if old then old:Destroy() end
   		child.Parent = models; moved += 1
   	end
   end
   print("Moved " .. moved .. " models to ReplicatedStorage.Assets.Models")
   ```

   It should print `Moved 24 models`. (It only moves the imported `Kraken`, not the game's own one, which
   is only created while the game runs.)
5. Press **Play**. Roll or open chests and you'll see the new models. Type `/selftest` in chat: the
   *Imported 3D models found* line should now be PASS.
6. Publish (**File → Publish to Roblox**).

## How it works

`src/shared/ModelFactory.luau` checks `ReplicatedStorage.Assets.Models` for a model with the item's name.
If there is one, it clones it, sizes it to fit (divers 5.6 studs tall, treasures and chests 2.8 studs,
the Kraken 80 studs), stands it on the same spot and hides the built-in parts. The built-in parts stay
in place (invisible), so glow effects, rarity lights, click targets and animations keep working.

You can add more: name any model `Diver_<Id>`, `Treasure_<Id>` or `Chest_<Id>` using the ids in
`src/shared/Config/` and drop it in the same folder.

## Fine-tuning a model

Select a model in `ReplicatedStorage.Assets.Models` and add an attribute in the Properties window:

| Attribute   | Type   | What it does                                                            |
|-------------|--------|--------------------------------------------------------------------------|
| `YRotation` | number | Turn it around the vertical axis in degrees. Default 180. Try 0 or 90 if a diver faces the wrong way. |
| `Scale`     | number | Size multiplier on top of the automatic size, e.g. `1.2`.               |

## The 24 models

| Name | Triangles | Link |
|------|----------:|------|
| Diver_SnorkelSam | 7,372 | [glb](https://d8j0ntlcm91z4.cloudfront.net/user_3IBf7n4ojUR6epQXmBO9jOL8gQ8/hf_20260927_033940_d65f966b-8260-4806-9b70-059267af5c88.glb) |
| Diver_ScubaSteve | 13,580 | [glb](https://d8j0ntlcm91z4.cloudfront.net/user_3IBf7n4ojUR6epQXmBO9jOL8gQ8/hf_20260927_033941_d0ecd12b-8795-4bbc-b98b-98539f2c9ae6.glb) |
| Diver_PirateDiver | 16,062 | [glb](https://d8j0ntlcm91z4.cloudfront.net/user_3IBf7n4ojUR6epQXmBO9jOL8gQ8/hf_20260927_033943_b6936cd7-b8c2-435d-960a-6ee251417997.glb) |
| Diver_Mermaid | 11,870 | [glb](https://d8j0ntlcm91z4.cloudfront.net/user_3IBf7n4ojUR6epQXmBO9jOL8gQ8/hf_20260927_033945_4056a3d9-15cd-42b9-a2ae-d9870c5c369a.glb) |
| Diver_DeepSeaSuit | 16,733 | [glb](https://d8j0ntlcm91z4.cloudfront.net/user_3IBf7n4ojUR6epQXmBO9jOL8gQ8/hf_20260927_041622_b39043ab-1b3b-4659-af8f-b3298f35aaf4.glb) |
| Diver_Poseidon | 18,096 | [glb](https://d8j0ntlcm91z4.cloudfront.net/user_3IBf7n4ojUR6epQXmBO9jOL8gQ8/hf_20260927_033947_10052d27-ea70-483e-8d86-fc9c2d682182.glb) |
| Diver_GhostCaptain | 13,182 | [glb](https://d8j0ntlcm91z4.cloudfront.net/user_3IBf7n4ojUR6epQXmBO9jOL8gQ8/hf_20260927_033949_c9d270fe-6141-4623-984e-c8ca54d22a76.glb) |
| Diver_KrakenTamer | 13,448 | [glb](https://d8j0ntlcm91z4.cloudfront.net/user_3IBf7n4ojUR6epQXmBO9jOL8gQ8/hf_20260927_033951_9d395cea-95bb-41af-8d3b-f6e188c3088d.glb) |
| Chest_RustyCrate | 6,068 | [glb](https://d8j0ntlcm91z4.cloudfront.net/user_3IBf7n4ojUR6epQXmBO9jOL8gQ8/hf_20260927_034011_c1f44173-ead5-477a-84c0-fd094891abc4.glb) |
| Chest_CoralChest | 7,267 | [glb](https://d8j0ntlcm91z4.cloudfront.net/user_3IBf7n4ojUR6epQXmBO9jOL8gQ8/hf_20260927_034013_b25378b9-3f59-4354-8f6b-6e7c0e06538d.glb) |
| Chest_PirateChest | 5,933 | [glb](https://d8j0ntlcm91z4.cloudfront.net/user_3IBf7n4ojUR6epQXmBO9jOL8gQ8/hf_20260927_034014_bc5e3e61-6f0c-4cd0-95ae-d8e3928e7d9d.glb) |
| Chest_GlowingCoffer | 4,172 | [glb](https://d8j0ntlcm91z4.cloudfront.net/user_3IBf7n4ojUR6epQXmBO9jOL8gQ8/hf_20260927_034016_5e7d902a-6c28-46bd-b1f5-9f4003e09de6.glb) |
| Chest_AbyssalRelicBox | 3,031 | [glb](https://d8j0ntlcm91z4.cloudfront.net/user_3IBf7n4ojUR6epQXmBO9jOL8gQ8/hf_20260927_034019_67189793-90bd-42c8-84a6-7d010bd22c0a.glb) |
| Chest_AtlanteanVault | 6,737 | [glb](https://d8j0ntlcm91z4.cloudfront.net/user_3IBf7n4ojUR6epQXmBO9jOL8gQ8/hf_20260927_034020_fba3b27c-b763-4b96-a82b-2eda6ed69417.glb) |
| Chest_UnknownBox | 13,845 | [glb](https://d8j0ntlcm91z4.cloudfront.net/user_3IBf7n4ojUR6epQXmBO9jOL8gQ8/hf_20260927_034022_e0524252-bc26-48a1-a8a2-9d9ccd376315.glb) |
| Kraken | 17,170 | [glb](https://d8j0ntlcm91z4.cloudfront.net/user_3IBf7n4ojUR6epQXmBO9jOL8gQ8/hf_20260927_034023_c6f9df13-0811-4f71-9efe-d22f3308e19c.glb) |
| Treasure_GoldenDuck | 5,442 | [glb](https://d8j0ntlcm91z4.cloudfront.net/user_3IBf7n4ojUR6epQXmBO9jOL8gQ8/hf_20260927_034037_05eb922f-4d26-49c6-ab0a-ef76fad9aeb3.glb) |
| Treasure_SunkenCrown | 16,422 | [glb](https://d8j0ntlcm91z4.cloudfront.net/user_3IBf7n4ojUR6epQXmBO9jOL8gQ8/hf_20260927_034038_61c0cce1-26c4-42ed-b137-ec18ab4b9167.glb) |
| Treasure_BlackbeardSkull | 19,458 | [glb](https://d8j0ntlcm91z4.cloudfront.net/user_3IBf7n4ojUR6epQXmBO9jOL8gQ8/hf_20260927_041624_24afcc71-e0ab-4e1b-b0ea-ce06c775d199.glb) |
| Treasure_PoseidonTrident | 7,680 | [glb](https://d8j0ntlcm91z4.cloudfront.net/user_3IBf7n4ojUR6epQXmBO9jOL8gQ8/hf_20260927_034043_c6ae220e-61f1-47c6-b104-a2c6b18e630c.glb) |
| Treasure_AtlanteanCrown | 18,046 | [glb](https://d8j0ntlcm91z4.cloudfront.net/user_3IBf7n4ojUR6epQXmBO9jOL8gQ8/hf_20260927_034044_834cfb10-c6a7-47bf-98d5-d3aeeaebbf37.glb) |
| Treasure_AbyssHeart | 14,320 | [glb](https://d8j0ntlcm91z4.cloudfront.net/user_3IBf7n4ojUR6epQXmBO9jOL8gQ8/hf_20260927_034045_03867ac7-db61-4bb7-9032-262abb4cd7fe.glb) |
| Treasure_HeartOfTheOcean | 7,483 | [glb](https://d8j0ntlcm91z4.cloudfront.net/user_3IBf7n4ojUR6epQXmBO9jOL8gQ8/hf_20260927_034046_19aa6929-86e4-408e-94ea-16d3fcf70107.glb) |
| Treasure_LastTreasure | 7,118 | [glb](https://d8j0ntlcm91z4.cloudfront.net/user_3IBf7n4ojUR6epQXmBO9jOL8gQ8/hf_20260927_034048_96b978fa-1d3f-49b4-b42b-f963fa4065fe.glb) |

`assets/models.txt` has the same list in a plain `name url` format.

## Performance note

A dock shows up to 10 divers and 16 treasures, so a full 6-player server can show about 150 imported
meshes at 5–20k triangles each. If phones struggle, keep the imported divers and remove the imported
treasures (the built-in treasures are much lighter). Low Graphics mode in Settings also helps.
