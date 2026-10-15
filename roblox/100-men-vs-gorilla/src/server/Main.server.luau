-- Server entry: builds the enemy rig templates from the imported meshes, hooks up the army's
-- gear, then starts the wave loop.
--
-- One-time setup in Studio: File > Import 3D -> assets/enemies/Enemies.fbx and assets/men/MenGear.fbx.
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

if MenFactory.setGear(searchIn) then
	stash(MenFactory.gear())
else
	warn("[100 Men] MenGear.fbx not imported yet - the army has no hats or weapons. File > Import 3D -> assets/men/MenGear.fbx")
end

GameService.start()
