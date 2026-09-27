--[[
	All game math in one place. Pure functions, no Roblox services,
	so the server, the client and the offline tests use exactly the same rules.

	`rand` arguments are functions returning a number in [0, 1).
]]

local Config = script.Parent.Config
local GameConfig = require(Config.Game)
local Zones = require(Config.Zones)
local Treasures = require(Config.Treasures)
local Conditions = require(Config.Conditions)
local Divers = require(Config.Divers)
local Crates = require(Config.Crates)
local Sets = require(Config.Sets)
local Upgrades = require(Config.Upgrades)
local Rarities = require(Config.Rarities)
local Rewards = require(Config.Rewards)

local Formulas = {}

export type Rand = () -> number

-- Luck ------------------------------------------------------------------------------------

-- Luck flattens "1 in N" odds: weight = N ^ -exponent, exponent shrinks as luck grows.
function Formulas.luckExponent(luck: number): number
	luck = math.max(luck, 1)
	return 1 / (1 + GameConfig.LuckCurve * math.log(luck))
end

function Formulas.weightFor(odds: number, luck: number): number
	return odds ^ -Formulas.luckExponent(luck)
end

-- Returns the index picked from a list of positive weights.
function Formulas.pickWeighted(weights: { number }, rand: Rand): number
	local total = 0
	for _, weight in weights do
		total += weight
	end
	local roll = rand() * total
	for index, weight in weights do
		roll -= weight
		if roll < 0 then
			return index
		end
	end
	return #weights
end

-- Chance (0..1) of each entry given odds and luck. Used by the UI to show real odds.
function Formulas.chances(oddsList: { number }, luck: number): { number }
	local weights = {}
	local total = 0
	for index, odds in oddsList do
		weights[index] = Formulas.weightFor(odds, luck)
		total += weights[index]
	end
	for index, weight in weights do
		weights[index] = weight / total
	end
	return weights
end

-- Rolls -----------------------------------------------------------------------------------

function Formulas.rollCrate(crateId: string, luck: number, rand: Rand): string
	local crate = Crates.ById[crateId]
	assert(crate, "Unknown crate " .. tostring(crateId))
	local weights = {}
	for index, entry in crate.pool do
		weights[index] = Formulas.weightFor(entry.odds, luck)
	end
	return crate.pool[Formulas.pickWeighted(weights, rand)].diver
end

-- Highest zone index the player has unlocked through rebirths.
function Formulas.unlockedZoneIndex(rebirths: number): number
	local best = 1
	for index, zone in Zones.List do
		if zone.rebirthReq <= rebirths then
			best = index
		end
	end
	return best
end

-- Zone indices a diver can reach given its depth and the player's zone cap.
function Formulas.reachableZones(maxDepth: number, zoneCap: number): { number }
	local result = {}
	for index, zone in Zones.List do
		if index <= zoneCap and zone.minDepth < maxDepth then
			table.insert(result, index)
		end
	end
	if #result == 0 then
		result[1] = 1
	end
	return result
end

-- Deeper zones are more likely: weight doubles with each zone.
function Formulas.rollZone(reachable: { number }, rand: Rand): number
	local weights = {}
	for index, zoneIndex in reachable do
		weights[index] = 2 ^ zoneIndex
	end
	return reachable[Formulas.pickWeighted(weights, rand)]
end

function Formulas.rollTreasure(zoneId: string, luck: number, noCommon: boolean?, rand: Rand): string
	local pool = Treasures.ByZone[zoneId]
	assert(pool, "No treasures for zone " .. tostring(zoneId))
	local candidates = {}
	local weights = {}
	for _, treasure in pool do
		if not (noCommon and treasure.rarity == "Common") then
			table.insert(candidates, treasure)
			table.insert(weights, Formulas.weightFor(treasure.odds, luck))
		end
	end
	if #candidates == 0 then
		return pool[1].id
	end
	return candidates[Formulas.pickWeighted(weights, rand)].id
end

-- Conditions use a softer luck (square root) so variants stay special.
function Formulas.rollCondition(luck: number, cursedMult: number?, rand: Rand): string
	local conditionLuck = math.sqrt(math.max(luck, 1))
	local weights = {}
	for index, condition in Conditions.List do
		local weight = Formulas.weightFor(condition.odds, conditionLuck)
		if condition.id == "Cursed" and cursedMult then
			weight *= cursedMult
		end
		weights[index] = weight
	end
	return Conditions.List[Formulas.pickWeighted(weights, rand)].id
end

-- Dives -----------------------------------------------------------------------------------

function Formulas.diveDuration(deepestZoneIndex: number, speed: number): number
	local base = GameConfig.DiveBaseTime + GameConfig.DiveTimePerZone * deepestZoneIndex
	return base / math.max(speed, 0.1)
end

-- Visual depth of the dive model in studs for a real depth in metres.
function Formulas.depthToStuds(metres: number): number
	return math.clamp(18 + math.sqrt(metres) * 2.6, 18, 300)
end

-- Income ----------------------------------------------------------------------------------

function Formulas.treasureBaseIncome(treasureId: string): number
	local treasure = Treasures.ById[treasureId]
	if not treasure then
		return 0
	end
	local zone = Zones.ById[treasure.zone]
	return zone.valueBase * treasure.odds ^ 0.55
end

function Formulas.conditionMult(conditionId: string?): number
	local condition = conditionId and Conditions.ById[conditionId]
	return if condition then condition.mult else 1
end

-- Income of a single treasure before player-wide multipliers.
function Formulas.treasureIncome(treasureId: string, conditionId: string?): number
	return Formulas.treasureBaseIncome(treasureId) * Formulas.conditionMult(conditionId)
end

function Formulas.treasureSellValue(treasureId: string, conditionId: string?): number
	return math.floor(Formulas.treasureIncome(treasureId, conditionId) * GameConfig.SellValueSeconds + 0.5)
end

-- Returns { [treasureId] = bonus } for every set fully present in `placedIds`.
function Formulas.setBonuses(placedIds: { [string]: boolean }): { [string]: number }
	local bonuses = {}
	for _, set in Sets.List do
		local complete = true
		for _, itemId in set.items do
			if not placedIds[itemId] then
				complete = false
				break
			end
		end
		if complete then
			for _, itemId in set.items do
				bonuses[itemId] = (bonuses[itemId] or 0) + set.bonus
			end
		end
	end
	return bonuses
end

export type IncomeContext = {
	rebirths: number,
	doubleMoney: boolean?,
	vip: boolean?,
	indexZonesComplete: number?,
}

function Formulas.rebirthMultiplier(rebirths: number): number
	return 1 + GameConfig.RebirthIncomeBonus * rebirths
end

function Formulas.incomeMultiplier(ctx: IncomeContext): number
	local mult = Formulas.rebirthMultiplier(ctx.rebirths)
	if ctx.doubleMoney then
		mult *= 2
	end
	if ctx.vip then
		mult *= 1.1
	end
	mult *= 1 + GameConfig.IndexZoneBonus * (ctx.indexZonesComplete or 0)
	return mult
end

-- Costs -----------------------------------------------------------------------------------

function Formulas.rebirthCost(rebirths: number): number
	return GameConfig.RebirthBaseCost * GameConfig.RebirthCostGrowth ^ rebirths
end

function Formulas.upgradeCost(upgradeId: string, level: number): number?
	local upgrade = Upgrades.ById[upgradeId]
	if not upgrade or level >= upgrade.maxLevel then
		return nil
	end
	return math.floor(upgrade.baseCost * upgrade.growth ^ level + 0.5)
end

function Formulas.diveSlotCount(slotLevel: number, hasExtraSlotsPass: boolean?): number
	local count = GameConfig.BaseDiveSlots + slotLevel + (if hasExtraSlotsPass then 2 else 0)
	return math.min(count, GameConfig.MaxDiveSlots)
end

function Formulas.pedestalCount(pedestalLevel: number): number
	return math.min(GameConfig.BasePedestals + pedestalLevel, GameConfig.MaxPedestals)
end

function Formulas.luckUpgradeMult(level: number): number
	return 1 + 0.1 * level
end

function Formulas.speedUpgradeMult(level: number): number
	return 1 + 0.08 * level
end

-- Cheapest roll that can give this diver, times the configured share.
function Formulas.diverSellValue(diverId: string): number
	local cheapest = math.huge
	for _, crate in Crates.List do
		for _, entry in crate.pool do
			if entry.diver == diverId then
				cheapest = math.min(cheapest, crate.price)
			end
		end
	end
	if cheapest == math.huge then
		cheapest = 100
	end
	return math.floor(cheapest * GameConfig.DiverSellShare)
end

-- Sorting helpers ---------------------------------------------------------------------------

-- Rough strength of a diver for "equip best": rarity first, then luck and speed.
function Formulas.diverScore(diverId: string): number
	local diver = Divers.ById[diverId]
	if not diver then
		return 0
	end
	local rank = Rarities.ById[diver.tier].rank
	return rank * 1000 + diver.luck * 10 + diver.speed
end

-- Index ------------------------------------------------------------------------------------

export type IndexData = { [string]: { [string]: boolean } }

-- A zone page is complete when every treasure of that zone was found in any condition.
function Formulas.zoneIndexComplete(index: IndexData, zoneId: string): boolean
	local pool = Treasures.ByZone[zoneId]
	if not pool then
		return false
	end
	for _, treasure in pool do
		if not index[treasure.id] then
			return false
		end
	end
	return true
end

function Formulas.indexZonesComplete(index: IndexData): number
	local count = 0
	for _, zone in Zones.List do
		if Formulas.zoneIndexComplete(index, zone.id) then
			count += 1
		end
	end
	return count
end

-- Returns found treasures, total treasures, found variants, total variants.
function Formulas.indexProgress(index: IndexData): (number, number, number, number)
	local found, variants = 0, 0
	for _, treasure in Treasures.List do
		local entry = index[treasure.id]
		if entry then
			found += 1
			for _ in entry do
				variants += 1
			end
		end
	end
	return found, #Treasures.List, variants, #Treasures.List * #Conditions.List
end

-- Daily rewards / wheel ---------------------------------------------------------------------

-- UTC day number for a unix timestamp.
function Formulas.dayNumber(unixTime: number): number
	return math.floor(unixTime / 86400)
end

-- Given the last claimed day and current streak, returns (canClaim, newStreak) for `today`.
-- Missing a day resets the streak to 1; the 7-day calendar loops.
function Formulas.dailyStreak(lastDay: number, streak: number, today: number): (boolean, number)
	if lastDay == today then
		return false, streak
	end
	if lastDay == today - 1 then
		return true, (streak % #Rewards.Daily) + 1
	end
	return true, 1
end

function Formulas.pickWheelSegment(rand: Rand): number
	local weights = {}
	for index, segment in Rewards.Wheel do
		weights[index] = segment.weight
	end
	return Formulas.pickWeighted(weights, rand)
end

-- Seconds until the next free spin is ready (0 = ready now).
function Formulas.freeSpinWait(lastFreeSpin: number, now: number): number
	return math.max(0, lastFreeSpin + Rewards.FreeSpinHours * 3600 - now)
end

function Formulas.offlineEarnings(seconds: number, incomePerSecond: number, vip: boolean?): number
	local capHours = if vip then GameConfig.OfflineCapHoursVIP else GameConfig.OfflineCapHours
	local capped = math.clamp(seconds, 0, capHours * 3600)
	return math.floor(capped * incomePerSecond * GameConfig.OfflineShare)
end

return Formulas
