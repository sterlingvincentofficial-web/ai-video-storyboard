--[[
	General tuning knobs. Most balance changes only need this file.
]]

return {
	-- Save data
	DataStoreName = "RollADiver_Data_v1",
	AutosaveInterval = 60,

	-- Starting state
	StartingCash = 250,

	-- Dock and vault
	BaseDiveSlots = 3,
	MaxDiveSlots = 10, -- 3 base + 5 upgrades + 2 from the gamepass
	BasePedestals = 6,
	MaxPedestals = 16,
	MaxDivers = 60,
	MaxTreasures = 150,

	-- Dive timing (seconds, before speed multipliers)
	DiveBaseTime = 6,
	DiveTimePerZone = 4,
	DiveRestTime = 1,
	DiveBottomShare = 0.2, -- share of the dive spent at the bottom
	DiveDescentShare = 0.4, -- share spent going down (the rest is going up)

	-- Kraken grabs a surfacing diver
	KrakenGrabChance = 0.05,
	KrakenGrabWindow = 6,

	-- Income
	CollectPadCooldown = 0.5,
	SellValueSeconds = 20, -- a treasure sells for this many seconds of its income
	DiverSellShare = 0.25, -- a diver sells for this share of the price of the cheapest roll that contains it
	OfflineShare = 0.25,
	OfflineCapHours = 8,
	OfflineCapHoursVIP = 12,
	IndexZoneBonus = 0.05, -- permanent income bonus per fully completed zone page

	-- Rebirth
	RebirthBaseCost = 30000000,
	RebirthCostGrowth = 20,
	RebirthIncomeBonus = 0.5,
	RebirthKeepTiers = { Divine = true, Secret = true },

	-- Luck math: effective exponent = 1 / (1 + LuckCurve * ln(luck))
	LuckCurve = 0.25,

	-- Server events (seconds)
	Events = {
		LowTide = { interval = 45 * 60, duration = 5 * 60, firstDelay = 10 * 60 },
		BloodMoon = { interval = 90 * 60, duration = 10 * 60, firstDelay = 30 * 60 },
		Kraken = { interval = 120 * 60, duration = 3 * 60, firstDelay = 20 * 60 },
		WarningTime = 30,
	},
	LowTideSpeedMult = 2,
	BloodMoonCursedMult = 5,
	KrakenBaseHealth = 250,
	KrakenClickCooldown = 0.12,

	-- Luck potion
	LuckPotionMult = 2,
	LuckPotionSeconds = 15 * 60,

	-- Rare find announcements: set false to only announce inside the server
	CrossServerAnnouncements = true,

	-- Plots
	PlotCount = 6,
}
