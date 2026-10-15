-- Client entry: wires the server's batched events into the renderers and effects.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)

local Modules = script.Parent:WaitForChild("Modules")
local Cutscene = require(Modules.Cutscene)
local EnemyView = require(Modules.EnemyView)
local Fx = require(Modules.Fx)
local Hud = require(Modules.Hud)
local Juice = require(Modules.Juice)
local KillFx = require(Modules.KillFx)
local UnitView = require(Modules.UnitView)

Net.event("Hits").OnClientEvent:Connect(function(hits)
	for _, h in hits do
		local id, dmg, crit, kind = h[1], h[2], h[3], h[4]
		local view = EnemyView.get(id)
		if view then
			EnemyView.hit(id, dmg, crit)
			local head = view.model:FindFirstChild("Head")
			local at = if head then head.Position + Vector3.new(0, head.Size.Y * 0.6, 0) else view.root.Position
			Fx.number(at, dmg, crit)
			if view.def.Armor and kind ~= "Grenade" and kind ~= "Chop" then
				Juice.sound("Clank", at, 1, 0.6)
				Fx.sparks(at, Color3.fromRGB(200, 220, 255), 4, 2.5)
			end
		end
	end
end)

Net.event("Deaths").OnClientEvent:Connect(KillFx.play)
Net.event("Attacks").OnClientEvent:Connect(UnitView.attacks)
Net.event("UnitFx").OnClientEvent:Connect(UnitView.unitFx)
Net.event("EnemyActs").OnClientEvent:Connect(function(list)
	for _, a in list do
		UnitView.enemyAct(a[1], a[2], a[3])
	end
end)
Net.event("GameEvent").OnClientEvent:Connect(Hud.gameEvent)

-- the intro plays once per join; the server holds wave 1 until everyone has watched or skipped it
task.spawn(Cutscene.play)
