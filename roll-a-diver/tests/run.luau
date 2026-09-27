--[[
	Offline tests for the shared game logic.
	Run from the roll-a-diver folder:  lune run tests/run
]]

local Loader = require("./loader")

local Shared = Loader.root("src/shared")
local Formulas = Loader.require(Shared.Formulas)
local Format = Loader.require(Shared.Util.Format)
local Config = Shared.Config
local Zones = Loader.require(Config.Zones)
local Treasures = Loader.require(Config.Treasures)
local Divers = Loader.require(Config.Divers)
local Crates = Loader.require(Config.Crates)
local Sets = Loader.require(Config.Sets)
local Conditions = Loader.require(Config.Conditions)
local Rarities = Loader.require(Config.Rarities)
local Monetization = Loader.require(Config.Monetization)
local Upgrades = Loader.require(Config.Upgrades)

local passed, failed = 0, 0

local function test(name: string, fn: () -> ())
	local ok, err = pcall(fn)
	if ok then
		passed += 1
	else
		failed += 1
		print("FAIL  " .. name .. "\n      " .. tostring(err))
	end
end

local function eq(actual, expected, label: string?)
	if actual ~= expected then
		error(
			("%sexpected %s, got %s"):format(label and (label .. ": ") or "", tostring(expected), tostring(actual)),
			2
		)
	end
end

local function near(actual: number, expected: number, tolerance: number, label: string?)
	if math.abs(actual - expected) > tolerance then
		error(
			("%sexpected ~%s, got %s"):format(label and (label .. ": ") or "", tostring(expected), tostring(actual)),
			2
		)
	end
end

local seed = 12345
local function rand(): number
	-- deterministic LCG so failures are reproducible
	seed = (seed * 1103515245 + 12345) % 2147483648
	return seed / 2147483648
end

-- Config integrity ---------------------------------------------------------------------------

test("every crate entry points at a real diver", function()
	for _, crate in Crates.List do
		for _, entry in crate.pool do
			assert(Divers.ById[entry.diver], crate.id .. " -> " .. entry.diver)
			assert(entry.odds >= 1, "odds must be >= 1")
		end
	end
end)

test("every diver tier and treasure rarity exists", function()
	for _, diver in Divers.List do
		assert(Rarities.ById[diver.tier], diver.id)
		if diver.ability then
			assert(Divers.Abilities[diver.ability], "ability text missing for " .. diver.ability)
		end
	end
	for _, treasure in Treasures.List do
		assert(Rarities.ById[treasure.rarity], treasure.id)
	end
end)

test("every diver except the starter can be rolled", function()
	for _, diver in Divers.List do
		local found = false
		for _, crate in Crates.List do
			for _, entry in crate.pool do
				if entry.diver == diver.id then
					found = true
				end
			end
		end
		assert(found or diver.id == Divers.StarterDiver, diver.id .. " is not in any crate")
	end
end)

test("every zone has treasures and a chest", function()
	for _, zone in Zones.List do
		assert(Treasures.ByZone[zone.id] and #Treasures.ByZone[zone.id] > 0, zone.id)
		assert(Zones.ChestById[zone.chest], zone.chest)
	end
end)

test("set items are real treasures and tag back to their set", function()
	for _, set in Sets.List do
		for _, itemId in set.items do
			local treasure = Treasures.ById[itemId]
			assert(treasure, itemId)
			eq(treasure.set, set.id, itemId)
		end
	end
end)

test("ids are unique across passes and products", function()
	local seen = {}
	for _, pass in Monetization.Passes do
		assert(not seen[pass.id], pass.id)
		seen[pass.id] = true
	end
	for _, product in Monetization.Products do
		assert(not seen[product.id], product.id)
		seen[product.id] = true
	end
end)

test("rarer treasures in a zone are worth more", function()
	for _, zone in Zones.List do
		local previousOdds, previousIncome = 0, 0
		local pool = table.clone(Treasures.ByZone[zone.id])
		table.sort(pool, function(a, b)
			return a.odds < b.odds
		end)
		for _, treasure in pool do
			local income = Formulas.treasureBaseIncome(treasure.id)
			if treasure.odds > previousOdds then
				assert(income > previousIncome, treasure.id)
			end
			previousOdds, previousIncome = treasure.odds, income
		end
	end
end)

-- Formulas ------------------------------------------------------------------------------------

test("luck exponent is 1 at luck 1 and shrinks with luck", function()
	near(Formulas.luckExponent(1), 1, 1e-9)
	assert(Formulas.luckExponent(10) < Formulas.luckExponent(2))
	near(Formulas.luckExponent(0.5), 1, 1e-9, "luck below 1 clamps")
end)

test("weighted pick matches odds at luck 1", function()
	local counts = { 0, 0 }
	for _ = 1, 20000 do
		local index = Formulas.pickWeighted({ 3, 1 }, rand)
		counts[index] += 1
	end
	near(counts[1] / 20000, 0.75, 0.02)
end)

test("crate rolls respect odds roughly", function()
	local hits = 0
	local n = 40000
	for _ = 1, n do
		if Formulas.rollCrate("Snorkel", 1, rand) == "SnorkelSam" then
			hits += 1
		end
	end
	local chances = Formulas.chances(
		(function()
			local list = {}
			for i, entry in Crates.ById.Snorkel.pool do
				list[i] = entry.odds
			end
			return list
		end)(),
		1
	)
	near(hits / n, chances[1], 0.015)
end)

test("more luck gives rarer divers more often", function()
	local function rareShare(luck)
		local hits = 0
		for _ = 1, 20000 do
			local diver = Divers.ById[Formulas.rollCrate("Snorkel", luck, rand)]
			if Rarities.ById[diver.tier].rank >= 4 then
				hits += 1
			end
		end
		return hits
	end
	assert(rareShare(5) > rareShare(1) * 1.5)
end)

test("zone lock and depth decide reachable zones", function()
	local cap = Formulas.unlockedZoneIndex(0)
	eq(cap, 3, "zones unlocked at rebirth 0")
	eq(#Formulas.reachableZones(100, cap), 1, "common diver")
	eq(#Formulas.reachableZones(500, cap), 2, "rare diver")
	eq(#Formulas.reachableZones(8000, cap), 3, "abyssal diver capped by rebirth")
	eq(#Formulas.reachableZones(8000, Formulas.unlockedZoneIndex(2)), 5, "abyssal diver at rebirth 2")
	eq(Formulas.unlockedZoneIndex(5), #Zones.List, "all zones at rebirth 5")
end)

test("NoCommon never returns Common treasure", function()
	for _ = 1, 3000 do
		local id = Formulas.rollTreasure("Shallows", 1, true, rand)
		assert(Treasures.ById[id].rarity ~= "Common", id)
	end
end)

test("conditions: mostly barnacled, cursed boost works", function()
	local barnacled, cursedNormal, cursedMoon = 0, 0, 0
	for _ = 1, 30000 do
		local c = Formulas.rollCondition(1, nil, rand)
		if c == "Barnacled" then
			barnacled += 1
		elseif c == "Cursed" then
			cursedNormal += 1
		end
		if Formulas.rollCondition(1, 5, rand) == "Cursed" then
			cursedMoon += 1
		end
	end
	assert(barnacled / 30000 > 0.8, "barnacled share " .. barnacled / 30000)
	assert(cursedMoon > cursedNormal * 3, "blood moon boosts cursed")
end)

test("set bonus only when complete", function()
	local partial = Formulas.setBonuses({ CaptainsHat = true, BronzeCompass = true, PirateMap = true })
	eq(partial.CaptainsHat, nil)
	local full = Formulas.setBonuses({ CaptainsHat = true, BronzeCompass = true, PirateMap = true, Cutlass = true })
	eq(full.Cutlass, 0.25)
end)

test("costs and counts", function()
	eq(Formulas.upgradeCost("DiveSlots", 0), 500)
	eq(Formulas.upgradeCost("DiveSlots", Upgrades.ById.DiveSlots.maxLevel), nil, "max level has no cost")
	eq(Formulas.diveSlotCount(0, false), 3)
	eq(Formulas.diveSlotCount(5, true), 10)
	eq(Formulas.pedestalCount(99), 16)
	eq(Formulas.rebirthCost(0), 30000000)
	eq(Formulas.rebirthCost(1), 600000000)
	near(Formulas.incomeMultiplier({ rebirths = 2, doubleMoney = true }), 4, 1e-9)
end)

test("offline earnings are capped", function()
	eq(Formulas.offlineEarnings(3600, 100, false), 90000)
	eq(Formulas.offlineEarnings(100 * 3600, 1, false), 8 * 3600 * 0.25)
	eq(Formulas.offlineEarnings(100 * 3600, 1, true), 12 * 3600 * 0.25)
end)

test("diver sell value uses the cheapest crate", function()
	eq(Formulas.diverSellValue("ScubaSteve"), 25)
	eq(Formulas.diverSellValue("SnorkelSam"), 25)
end)

test("format helpers", function()
	eq(Format.number(999), "999")
	eq(Format.number(1000), "1K")
	eq(Format.number(1234), "1.23K")
	eq(Format.number(15500000), "15.5M")
	eq(Format.number(2.5), "2.5")
	eq(Format.money(250), "$250")
	eq(Format.odds(1000), "1 in 1K")
	eq(Format.depth(1234), "-1,234m")
	eq(Format.duration(125), "2m 5s")
	eq(Format.multiplier(1.5), "x1.5")
	eq(Format.multiplier(2), "x2")
end)

test("conditions list is ordered by rarity", function()
	for i = 2, #Conditions.List do
		assert(Conditions.List[i].odds > Conditions.List[i - 1].odds)
		assert(Conditions.List[i].mult > Conditions.List[i - 1].mult)
	end
end)

test("index progress and zone completion", function()
	local index = {}
	eq(Formulas.indexZonesComplete(index), 0)
	for _, treasure in Treasures.ByZone.Shallows do
		index[treasure.id] = { Barnacled = true }
	end
	index.SeaGlass.Golden = true
	eq(Formulas.indexZonesComplete(index), 1)
	local found, total, variants = Formulas.indexProgress(index)
	eq(found, #Treasures.ByZone.Shallows)
	eq(total, #Treasures.List)
	eq(variants, found + 1)
end)

print(("\n%d passed, %d failed"):format(passed, failed))
if failed > 0 then
	error("tests failed")
end
