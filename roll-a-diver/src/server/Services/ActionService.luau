--[[
	The single client -> server entry point. Every action is validated and rate limited here
	before it reaches the service that performs it. Clients get back { ok, err?, ... }.
]]

local Shared = game:GetService("ReplicatedStorage").Shared
local Remotes = require(Shared.Remotes)
local Format = require(Shared.Util.Format)

local Services = require(script.Parent.Parent.Registry)

local ActionService = {}

local MIN_INTERVAL = 0.08
local lastAction: { [Player]: number } = {}

local function isString(value: any): boolean
	return type(value) == "string" and #value > 0 and #value < 64
end

local function isSlot(value: any): boolean
	return type(value) == "number" and value == math.floor(value) and value >= 1 and value <= 32
end

local function result(ok: boolean, err: string?)
	return { ok = ok, err = err }
end

local handlers: { [string]: (Player, ...any) -> any } = {
	Roll = function(player, crateId)
		if not isString(crateId) then
			return result(false, "Bad roll")
		end
		return Services.RollService.Roll(player, crateId)
	end,

	PlaceDiver = function(player, uid, slot)
		if not isString(uid) or (slot ~= nil and not isSlot(slot)) then
			return result(false)
		end
		return result(Services.DiverService.Place(player, uid, slot))
	end,
	RemoveDiver = function(player, uid)
		if not isString(uid) then
			return result(false)
		end
		return result(Services.DiverService.Remove(player, uid))
	end,
	SellDiver = function(player, uid)
		if not isString(uid) then
			return result(false)
		end
		return result(Services.DiverService.Sell(player, uid))
	end,
	SellUnplacedDivers = function(player, maxRank)
		if type(maxRank) ~= "number" then
			return result(false)
		end
		local sold, total = Services.DiverService.SellUnplaced(player, math.clamp(math.floor(maxRank), 1, 9))
		return { ok = true, sold = sold, total = total }
	end,
	EquipBestDivers = function(player)
		Services.DiverService.EquipBest(player)
		return result(true)
	end,

	OpenChest = function(player, chestId)
		if not isString(chestId) then
			return result(false)
		end
		local opened = Services.ChestService.Open(player, chestId)
		if not opened then
			return result(false, "No chest to open")
		end
		return { ok = true, result = opened }
	end,
	OpenAllChests = function(player, chestId)
		if chestId ~= nil and not isString(chestId) then
			return result(false)
		end
		local results = Services.ChestService.OpenAll(player, chestId)
		return { ok = true, results = results }
	end,

	PlaceTreasure = function(player, uid, index)
		if not isString(uid) or (index ~= nil and not isSlot(index)) then
			return result(false)
		end
		return result(Services.VaultService.Place(player, uid, index))
	end,
	RemoveTreasure = function(player, uid)
		if not isString(uid) then
			return result(false)
		end
		return result(Services.VaultService.Remove(player, uid))
	end,
	SellTreasure = function(player, uid)
		if not isString(uid) then
			return result(false)
		end
		return result(Services.VaultService.Sell(player, uid))
	end,
	SellUnplacedTreasures = function(player)
		local sold, total = Services.VaultService.SellUnplaced(player)
		if sold > 0 then
			Services.PlayerService.Notify(
				player,
				("Sold %d treasures for %s"):format(sold, Format.money(total)),
				"Success"
			)
		end
		return { ok = true, sold = sold, total = total }
	end,
	EquipBestTreasures = function(player)
		Services.VaultService.EquipBest(player)
		return result(true)
	end,

	BuyUpgrade = function(player, upgradeId)
		if not isString(upgradeId) then
			return result(false)
		end
		return Services.UpgradeService.Buy(player, upgradeId)
	end,
	RedeemCode = function(player, code)
		if type(code) ~= "string" or #code > 64 then
			return result(false, "Enter a code")
		end
		return Services.RewardService.RedeemCode(player, code)
	end,
	ClaimDaily = function(player)
		return Services.RewardService.ClaimDaily(player)
	end,
	Spin = function(player)
		return Services.RewardService.Spin(player)
	end,
	ClaimGroup = function(player)
		return Services.RewardService.ClaimGroup(player)
	end,
	SaveSettings = function(player, settings)
		local data = Services.DataService.Get(player)
		if not data or type(settings) ~= "table" then
			return result(false)
		end
		for _, key in { "sfx", "lowGraphics", "hideOthers" } do
			if type(settings[key]) == "boolean" then
				data.settings[key] = settings[key]
			end
		end
		return result(true)
	end,
	Rebirth = function(player)
		return Services.RebirthService.Rebirth(player)
	end,
}

function ActionService.Start()
	Remotes.func("Action").OnServerInvoke = function(player: Player, name: any, ...)
		if type(name) ~= "string" or not handlers[name] then
			return result(false, "Unknown action")
		end
		if not Services.PlayerService.IsReady(player) then
			return result(false, "Still loading...")
		end
		local t = os.clock()
		if t - (lastAction[player] or 0) < MIN_INTERVAL then
			return result(false, "Slow down!")
		end
		lastAction[player] = t
		local ok, response = pcall(handlers[name], player, ...)
		if not ok then
			warn(("[ActionService] %s failed for %s: %s"):format(name, player.Name, tostring(response)))
			return result(false, "Something went wrong")
		end
		Services.DataService.MarkDirty(player)
		return response
	end
	game:GetService("Players").PlayerRemoving:Connect(function(player)
		lastAction[player] = nil
	end)
end

return ActionService
