--[[
	Rebirth: reset cash, divers, treasures and chests for a permanent income bonus
	and access to a deeper zone. Upgrades, the Index and Divine/Secret divers are kept.
]]

local Shared = game:GetService("ReplicatedStorage").Shared
local Formulas = require(Shared.Formulas)
local Format = require(Shared.Util.Format)
local GameConfig = require(Shared.Config.Game)
local Divers = require(Shared.Config.Divers)
local Zones = require(Shared.Config.Zones)

local Services = require(script.Parent.Parent.Registry)

local RebirthService = {}

function RebirthService.Rebirth(player: Player): { [string]: any }
	local data = Services.DataService.Get(player)
	if not data then
		return { ok = false, err = "Data not loaded" }
	end
	Services.VaultService.CollectAll(player)
	local cost = Formulas.rebirthCost(data.rebirths)
	if data.cash < cost then
		return { ok = false, err = "You need " .. Format.money(cost) }
	end

	-- keep Divine and Secret divers
	local kept = {}
	for uid, diverId in data.divers do
		if GameConfig.RebirthKeepTiers[Divers.ById[diverId].tier] then
			kept[uid] = diverId
		end
	end
	data.divers = kept
	data.slots = {}
	data.treasures = {}
	data.pedestals = {}
	data.chests = {}
	data.cash = GameConfig.StartingCash
	data.rebirths += 1
	Services.VaultService.ClearForRebirth(player)

	if next(kept) == nil then
		Services.DiverService.AddDiver(player, Divers.StarterDiver, true)
	end
	Services.DiverService.EquipBest(player)
	Services.VaultService.Refresh(player)
	Services.EconomyService.RefreshDisplay(player)
	Services.DataService.MarkDirty(player)

	local unlocked = Zones.List[Formulas.unlockedZoneIndex(data.rebirths)]
	Services.AnnouncementService.Announce(
		("%s reached Rebirth %d!"):format(player.DisplayName, data.rebirths),
		Color3.fromRGB(255, 220, 90),
		false
	)
	Services.PlayerService.Notify(
		player,
		("Rebirth %d! Income x%s. Deepest zone: %s"):format(
			data.rebirths,
			tostring(Formulas.rebirthMultiplier(data.rebirths)),
			unlocked.name
		),
		"Success"
	)
	return { ok = true, rebirths = data.rebirths }
end

return RebirthService
