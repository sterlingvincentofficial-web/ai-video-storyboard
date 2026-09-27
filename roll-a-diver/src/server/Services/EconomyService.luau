--[[
	Cash in and out, plus every player-wide multiplier (income, luck, speed, zone cap).
]]

local Shared = game:GetService("ReplicatedStorage").Shared
local Formulas = require(Shared.Formulas)
local Format = require(Shared.Util.Format)
local GameConfig = require(Shared.Config.Game)
local Zones = require(Shared.Config.Zones)

local Services = require(script.Parent.Parent.Registry)

local EconomyService = {}

local function refreshCashDisplay(player: Player, data: { [string]: any })
	player:SetAttribute("Cash", data.cash)
	local leaderstats = player:FindFirstChild("leaderstats")
	if leaderstats then
		local cash = leaderstats:FindFirstChild("Cash") :: StringValue?
		if cash then
			cash.Value = Format.money(data.cash)
		end
		local rebirths = leaderstats:FindFirstChild("Rebirths") :: IntValue?
		if rebirths then
			rebirths.Value = data.rebirths
		end
	end
end

function EconomyService.CreateLeaderstats(player: Player)
	local leaderstats = Instance.new("Folder")
	leaderstats.Name = "leaderstats"
	local cash = Instance.new("StringValue")
	cash.Name = "Cash"
	cash.Parent = leaderstats
	local rebirths = Instance.new("IntValue")
	rebirths.Name = "Rebirths"
	rebirths.Parent = leaderstats
	leaderstats.Parent = player
	local data = Services.DataService.Get(player)
	if data then
		refreshCashDisplay(player, data)
	end
end

function EconomyService.RefreshDisplay(player: Player)
	local data = Services.DataService.Get(player)
	if data then
		refreshCashDisplay(player, data)
	end
end

function EconomyService.AddCash(player: Player, amount: number)
	local data = Services.DataService.Get(player)
	if not data or amount ~= amount or amount <= 0 then
		return
	end
	data.cash += amount
	data.totalEarned += amount
	refreshCashDisplay(player, data)
end

function EconomyService.TrySpend(player: Player, amount: number): boolean
	local data = Services.DataService.Get(player)
	if not data or amount ~= amount or amount < 0 or data.cash < amount then
		return false
	end
	data.cash -= amount
	refreshCashDisplay(player, data)
	return true
end

-- Multipliers ------------------------------------------------------------------------------

function EconomyService.IncomeMult(player: Player): number
	local data = Services.DataService.Get(player)
	if not data then
		return 1
	end
	local market = Services.MarketService
	return Formulas.incomeMultiplier({
		rebirths = data.rebirths,
		doubleMoney = market.HasPass(player, "DoubleMoney"),
		vip = market.HasPass(player, "VIP"),
		indexZonesComplete = Formulas.indexZonesComplete(data.index),
	})
end

function EconomyService.PotionActive(player: Player): boolean
	local data = Services.DataService.Get(player)
	return data ~= nil and data.luckPotionEnds > os.time()
end

-- Luck used for diver rolls (potion and gamepass only).
function EconomyService.RollLuck(player: Player): number
	local luck = 1
	if EconomyService.PotionActive(player) then
		luck *= GameConfig.LuckPotionMult
	end
	if Services.MarketService.HasPass(player, "LuckyDiver") then
		luck *= 1.5
	end
	return luck
end

-- Luck applied on top of each diver's own luck when rolling treasure.
function EconomyService.LuckMult(player: Player): number
	local data = Services.DataService.Get(player)
	if not data then
		return 1
	end
	return Formulas.luckUpgradeMult(data.upgrades.Luck) * EconomyService.RollLuck(player)
end

function EconomyService.SpeedMult(player: Player): number
	local data = Services.DataService.Get(player)
	if not data then
		return 1
	end
	local speed = Formulas.speedUpgradeMult(data.upgrades.Oxygen)
	if Services.EventService.IsActive("LowTide") then
		speed *= GameConfig.LowTideSpeedMult
	end
	return speed
end

-- Deepest zone the player's divers may reach (Low Tide opens one extra zone).
function EconomyService.ZoneCap(player: Player): number
	local data = Services.DataService.Get(player)
	if not data then
		return 1
	end
	local cap = Formulas.unlockedZoneIndex(data.rebirths)
	if Services.EventService.IsActive("LowTide") then
		cap += 1
	end
	return math.min(cap, #Zones.List)
end

function EconomyService.CursedMult(): number?
	if Services.EventService.IsActive("BloodMoon") then
		return GameConfig.BloodMoonCursedMult
	end
	return nil
end

return EconomyService
