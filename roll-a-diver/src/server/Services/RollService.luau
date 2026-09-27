--[[
	Diver rolls: pay for a crate, get a random diver from its pool.
]]

local Shared = game:GetService("ReplicatedStorage").Shared
local Formulas = require(Shared.Formulas)
local Format = require(Shared.Util.Format)
local GameConfig = require(Shared.Config.Game)
local Crates = require(Shared.Config.Crates)
local Divers = require(Shared.Config.Divers)
local Rarities = require(Shared.Config.Rarities)

local Services = require(script.Parent.Parent.Registry)

local RollService = {}

local random = Random.new()
local function rand(): number
	return random:NextNumber()
end

function RollService.Roll(player: Player, crateId: string): { [string]: any }
	local data = Services.DataService.Get(player)
	local crate = Crates.ById[crateId]
	if not data or not crate then
		return { ok = false, err = "Unknown roll" }
	end
	if data.rebirths < crate.rebirthReq then
		return { ok = false, err = ("Unlocks at Rebirth %d"):format(crate.rebirthReq) }
	end
	if Services.DiverService.DiverCount(data) >= GameConfig.MaxDivers then
		return { ok = false, err = "Your diver inventory is full. Sell some divers first" }
	end
	if not Services.EconomyService.TrySpend(player, crate.price, "Roll:" .. crate.id) then
		return { ok = false, err = "Not enough cash" }
	end

	local diverId = Formulas.rollCrate(crate.id, Services.EconomyService.RollLuck(player), rand)
	local uid, isNew = Services.DiverService.AddDiver(player, diverId)
	data.stats.rolls += 1
	Services.AnalyticsService.Step(player, "FirstRoll")
	Services.DataService.MarkDirty(player)

	local diver = Divers.ById[diverId]
	local rarity = Rarities.ById[diver.tier]
	if rarity.announce then
		local odds = 0
		for _, entry in crate.pool do
			if entry.diver == diverId then
				odds = entry.odds
			end
		end
		Services.AnnouncementService.Announce(
			("%s rolled %s (%s)!"):format(player.DisplayName, diver.name, Format.odds(odds)),
			rarity.color,
			rarity.rank >= Rarities.ById.Divine.rank
		)
	end

	return {
		ok = true,
		diverId = diverId,
		uid = uid,
		isNew = isNew,
		placed = uid ~= nil and Services.DiverService.SlotOf(data, uid) ~= nil,
	}
end

return RollService
