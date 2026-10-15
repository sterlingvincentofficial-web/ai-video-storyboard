-- Server entry: builds the enemy rig templates from the imported meshes, hooks up the army's
-- gear, then starts the wave loop.
--
-- One-time setup in Studio: File > Import 3D -> assets/enemies/Enemies.fbx, assets/men/Men.fbx and
-- assets/men/MenGear.fbx (pebbles/nets for projectiles, and the avatar fallback's gear).
-- Leave the imported models where they land (or in ReplicatedStorage.Assets) and press Play.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local EnemyDefs = require(Shared.Config.Enemies)
local EnemyRig = require(Shared.EnemyRig)
local MenFactory = require(Shared.MenFactory)
local RigData = require(Shared.RigData.Enemies)

local Services = script.Parent:WaitForChild("Services")
local GameService = require(Services.GameService)

local assets = ReplicatedStorage:WaitForChild("Assets")
local searchIn = { assets, workspace }

-- Move imports out of the Workspace so they don't stand around in the scene.
local function stash(model: Instance?)
	if model and model.Parent ~= assets then
		model.Parent = assets
	end
end

local rigs = Instance.new("Folder")
rigs.Name = "Rigs"

local import = EnemyRig.findImport(searchIn)
if import then
	stash(import)
	local flip = EnemyRig.buildAll(import, rigs)
	rigs:SetAttribute("Flipped", flip)
else
	warn("[100 Men] Enemies.fbx not imported yet - using block stand-ins. File > Import 3D -> assets/enemies/Enemies.fbx")
	for variant in RigData do
		local def = EnemyDefs[variant]
		if def then
			EnemyRig.buildFallback(variant, def.Colors).Parent = rigs
		end
	end
end
rigs.Parent = ReplicatedStorage

-- the army's custom rigs (Men.fbx); without them MenFactory falls back to Roblox avatars
local MenRig = require(Shared.MenRig)
local menImport = MenRig.findImport(searchIn)
if menImport then
	stash(menImport)
	local menRigs = Instance.new("Folder")
	menRigs.Name = "MenRigs"
	MenRig.buildAll(menImport, menRigs)
	menRigs.Parent = ReplicatedStorage
else
	warn("[100 Men] Men.fbx not imported yet - the army uses plain avatars. File > Import 3D -> assets/men/Men.fbx")
end

if MenFactory.setGear(searchIn) then
	stash(MenFactory.gear())
else
	warn("[100 Men] MenGear.fbx not imported yet - the army has no hats or weapons. File > Import 3D -> assets/men/MenGear.fbx")
end

-- The intro's squad (Players:CreateHumanoidModelFromDescription only works on the server): the
-- pilot plus a level-1 Brawler, Slingshot Kid and Lumberjack. Clients clone these for the cutscene.
local Units = require(Shared.Config.Units)
local squad = Instance.new("Folder")
squad.Name = "CutsceneSquad"
local PILOT = {
	Skin = Color3.fromRGB(245, 205, 48),
	Shirt = Color3.fromRGB(13, 105, 172),
	Pants = Color3.fromRGB(164, 189, 71),
	Hat = "ArmyHelmet",
	HatColor = Color3.fromRGB(88, 102, 56),
}
local ok, err = pcall(function()
	MenFactory.squadMember("Pilot", PILOT).Parent = squad
	for _, unitId in { "Brawler", "Slingshot", "Lumberjack" } do
		MenFactory.squadMember(unitId, Units[unitId].Levels[1].Look).Parent = squad
	end
end)
if not ok then
	warn("[100 Men] couldn't build the intro squad:", err)
end
squad.Parent = assets

GameService.start()
