--[[
	Cash upgrades: dive slots, pedestals, luck and dive speed.
]]

local Shared = game:GetService("ReplicatedStorage").Shared
local Formulas = require(Shared.Formulas)
local Upgrades = require(Shared.Config.Upgrades)

local Services = require(script.Parent.Parent.Registry)

local UpgradeService = {}

function UpgradeService.Buy(player: Player, upgradeId: string): { [string]: any }
	local data = Services.DataService.Get(player)
	if not data or not Upgrades.ById[upgradeId] then
		return { ok = false, err = "Unknown upgrade" }
	end
	local level = data.upgrades[upgradeId] or 0
	local cost = Formulas.upgradeCost(upgradeId, level)
	if not cost then
		return { ok = false, err = "Already maxed" }
	end
	if not Services.EconomyService.TrySpend(player, cost) then
		return { ok = false, err = "Not enough cash" }
	end
	data.upgrades[upgradeId] = level + 1
	if upgradeId == "DiveSlots" then
		Services.DiverService.Refresh(player)
	elseif upgradeId == "Pedestals" then
		Services.VaultService.Refresh(player)
	end
	Services.DataService.MarkDirty(player)
	return { ok = true, level = level + 1 }
end

return UpgradeService
