--[[
	Economy simulation: a greedy bot plays for a few hours of game time
	and prints when it hits each milestone. Use it to sanity-check balance after config changes.

	Run from the roll-a-diver folder:  lune run tests/sim [hours]
]]

local process = require("@lune/process")
local Loader = require("./loader")

local Shared = Loader.root("src/shared")
local Formulas = Loader.require(Shared.Formulas)
local Format = Loader.require(Shared.Util.Format)
local Config = Shared.Config
local GameConfig = Loader.require(Config.Game)
local Zones = Loader.require(Config.Zones)
local Treasures = Loader.require(Config.Treasures)
local Divers = Loader.require(Config.Divers)
local Crates = Loader.require(Config.Crates)
local Rarities = Loader.require(Config.Rarities)

local HOURS = tonumber(process.args[1]) or 6

math.randomseed(tonumber(process.args[2]) or 7)
local function rand(): number
	return math.random()
end

local state = {
	cash = GameConfig.StartingCash,
	rebirths = 0,
	divers = { { id = Divers.StarterDiver, timer = 0 } },
	treasures = {}, -- list of incomes (placed)
	upgrades = { DiveSlots = 0, Pedestals = 0, Luck = 0, Oxygen = 0 },
	rolls = 0,
	bestTier = "Common",
}

local function slots()
	return Formulas.diveSlotCount(state.upgrades.DiveSlots, false)
end

local function pedestals()
	return Formulas.pedestalCount(state.upgrades.Pedestals)
end

local function income(): number
	local total = 0
	for _, value in state.treasures do
		total += value
	end
	return total * Formulas.incomeMultiplier({ rebirths = state.rebirths })
end

local function diveTime(diverId: string): number
	local diver = Divers.ById[diverId]
	local cap = Formulas.unlockedZoneIndex(state.rebirths)
	local reachable = Formulas.reachableZones(diver.maxDepth, cap)
	local speed = diver.speed * Formulas.speedUpgradeMult(state.upgrades.Oxygen)
	return Formulas.diveDuration(reachable[#reachable], speed) + GameConfig.DiveRestTime
end

local function addTreasure(value: number)
	if #state.treasures < pedestals() then
		table.insert(state.treasures, value)
		return
	end
	local worstIndex, worst = 1, math.huge
	for index, v in state.treasures do
		if v < worst then
			worstIndex, worst = index, v
		end
	end
	if value > worst then
		state.cash += worst * GameConfig.SellValueSeconds
		state.treasures[worstIndex] = value
	else
		state.cash += value * GameConfig.SellValueSeconds
	end
end

local function dive(diverId: string)
	local diver = Divers.ById[diverId]
	local cap = Formulas.unlockedZoneIndex(state.rebirths)
	local reachable = Formulas.reachableZones(diver.maxDepth, cap)
	local zoneIndex = Formulas.rollZone(reachable, rand)
	local luck = diver.luck * Formulas.luckUpgradeMult(state.upgrades.Luck)
	local treasureId = Formulas.rollTreasure(Zones.List[zoneIndex].id, luck, diver.ability == "NoCommon", rand)
	local conditionId = Formulas.rollCondition(luck, nil, rand)
	addTreasure(Formulas.treasureIncome(treasureId, conditionId))
end

local function sortDivers()
	table.sort(state.divers, function(a, b)
		return Formulas.diverScore(a.id) > Formulas.diverScore(b.id)
	end)
	while #state.divers > slots() do
		local removed = table.remove(state.divers)
		state.cash += Formulas.diverSellValue(removed.id)
	end
end

local function bestCrate()
	local best = nil
	for _, crate in Crates.List do
		if crate.rebirthReq <= state.rebirths and crate.price <= state.cash then
			best = crate
		end
	end
	return best
end

local milestones = {}
local lastRoll = -math.huge
local function mark(key: string, t: number, extra: string?)
	if not milestones[key] then
		milestones[key] = true
		print(
			("[%8s] %-28s income %s  cash %s %s"):format(
				Format.duration(t),
				key,
				Format.perSecond(income()),
				Format.money(state.cash),
				extra or ""
			)
		)
	end
end

local function tryBuy(t: number)
	-- rebirth first
	local rebirthCost = Formulas.rebirthCost(state.rebirths)
	if state.cash >= rebirthCost then
		state.rebirths += 1
		state.cash = GameConfig.StartingCash
		local kept = {}
		for _, d in state.divers do
			if GameConfig.RebirthKeepTiers[Divers.ById[d.id].tier] then
				table.insert(kept, d)
			end
		end
		if #kept == 0 then
			kept = { { id = Divers.StarterDiver, timer = 0 } }
		end
		state.divers = kept
		state.treasures = {}
		mark("Rebirth " .. state.rebirths, t)
		return
	end
	for _, id in { "DiveSlots", "Pedestals" } do
		local cost = Formulas.upgradeCost(id, state.upgrades[id])
		if cost and state.cash >= cost then
			state.cash -= cost
			state.upgrades[id] += 1
			return
		end
	end
	-- once the dock is full and a rebirth is within reach, stop spending and save up
	local minutesToRebirth = (rebirthCost - state.cash) / math.max(income(), 1) / 60
	if #state.divers >= slots() and minutesToRebirth < 20 then
		return
	end
	local crate = if t - lastRoll >= 2 then bestCrate() else nil
	if crate then
		-- keep rolling the best affordable crate, but save up for a better one once close
		local nextCrate = Crates.List[crate.order + 1]
		local saving = nextCrate and nextCrate.rebirthReq <= state.rebirths and state.cash >= nextCrate.price * 0.25
		local emptySlot = #state.divers < slots()
		if emptySlot or not saving then
			state.cash -= crate.price
			state.rolls += 1
			lastRoll = t
			local diverId = Formulas.rollCrate(crate.id, Formulas.luckUpgradeMult(state.upgrades.Luck), rand)
			table.insert(state.divers, { id = diverId, timer = 0 })
			sortDivers()
			mark("First " .. crate.name, t)
			local tier = Divers.ById[diverId].tier
			if Rarities.ById[tier].rank > Rarities.ById[state.bestTier].rank then
				state.bestTier = tier
				mark("First " .. tier .. " diver", t, "(" .. diverId .. ")")
			end
			return
		end
	end
	for _, id in { "Luck", "Oxygen" } do
		local cost = Formulas.upgradeCost(id, state.upgrades[id])
		if cost and state.cash * 0.3 >= cost then
			state.cash -= cost
			state.upgrades[id] += 1
			return
		end
	end
end

local checkpoints = { 60, 300, 900, 1800, 3600, 7200, 10800, 14400, 21600, 28800, 43200 }
local nextCheckpoint = 1

for t = 1, HOURS * 3600 do
	for _, diver in state.divers do
		diver.timer += 1
		if diver.timer >= diveTime(diver.id) then
			diver.timer = 0
			dive(diver.id)
		end
	end
	state.cash += income()
	for _ = 1, 3 do
		tryBuy(t)
	end
	if checkpoints[nextCheckpoint] == t then
		nextCheckpoint += 1
		local diverNames = {}
		for _, d in state.divers do
			table.insert(diverNames, d.id)
		end
		print(
			("  @%s  income %s  rebirths %d  slots %d  pedestals %d  divers: %s"):format(
				Format.duration(t),
				Format.perSecond(income()),
				state.rebirths,
				slots(),
				pedestals(),
				table.concat(diverNames, ", ")
			)
		)
	end
end

print(("\nFinished %d hours. rolls=%d rebirths=%d"):format(HOURS, state.rolls, state.rebirths))
