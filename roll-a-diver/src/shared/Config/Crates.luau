--[[
	Diver rolls. Each roll costs cash and picks one diver from its pool,
	weighted by "1 in N" odds (luck flattens the odds, see Formulas.weightFor).
]]

export type CrateEntry = { diver: string, odds: number }

export type Crate = {
	id: string,
	name: string,
	price: number,
	rebirthReq: number,
	color: Color3,
	pool: { CrateEntry },
	order: number?,
}

local list: { Crate } = {
	{
		id = "Snorkel",
		name = "Snorkel Roll",
		price = 100,
		rebirthReq = 0,
		color = Color3.fromRGB(80, 200, 255),
		pool = {
			{ diver = "SnorkelSam", odds = 2 },
			{ diver = "PoolKid", odds = 3 },
			{ diver = "BeachBob", odds = 4 },
			{ diver = "FloatieFran", odds = 5 },
			{ diver = "ScubaSteve", odds = 12 },
			{ diver = "LifeguardLucy", odds = 18 },
			{ diver = "SpearfisherSal", odds = 30 },
			{ diver = "PirateDiver", odds = 250 },
			{ diver = "TreasureTina", odds = 500 },
			{ diver = "Mermaid", odds = 5000 },
		},
	},
	{
		id = "Scuba",
		name = "Scuba Roll",
		price = 10000,
		rebirthReq = 0,
		color = Color3.fromRGB(60, 230, 140),
		pool = {
			{ diver = "ScubaSteve", odds = 2 },
			{ diver = "LifeguardLucy", odds = 3 },
			{ diver = "SpearfisherSal", odds = 4 },
			{ diver = "ReefRanger", odds = 6 },
			{ diver = "PirateDiver", odds = 12 },
			{ diver = "NavyFrogman", odds = 20 },
			{ diver = "TreasureTina", odds = 30 },
			{ diver = "WreckHunter", odds = 45 },
			{ diver = "TreasureHunterJack", odds = 250 },
			{ diver = "CaveDiverCole", odds = 400 },
			{ diver = "Mermaid", odds = 700 },
			{ diver = "DeepSeaSuit", odds = 5000 },
		},
	},
	{
		id = "Deep",
		name = "Deep Roll",
		price = 1500000,
		rebirthReq = 0,
		color = Color3.fromRGB(150, 90, 255),
		pool = {
			{ diver = "NavyFrogman", odds = 2 },
			{ diver = "WreckHunter", odds = 3 },
			{ diver = "TreasureTina", odds = 4 },
			{ diver = "PirateDiver", odds = 5 },
			{ diver = "TreasureHunterJack", odds = 15 },
			{ diver = "CaveDiverCole", odds = 20 },
			{ diver = "SharkWhisperer", odds = 35 },
			{ diver = "Mermaid", odds = 50 },
			{ diver = "DeepSeaSuit", odds = 300 },
			{ diver = "AnglerfishAndy", odds = 400 },
			{ diver = "SubmarinePilot", odds = 800 },
			{ diver = "PressureKnight", odds = 1200 },
			{ diver = "Poseidon", odds = 15000 },
		},
	},
	{
		id = "Abyss",
		name = "Abyss Roll",
		price = 75000000,
		rebirthReq = 2,
		color = Color3.fromRGB(235, 40, 60),
		pool = {
			{ diver = "SharkWhisperer", odds = 2 },
			{ diver = "CaveDiverCole", odds = 3 },
			{ diver = "TreasureHunterJack", odds = 3 },
			{ diver = "DeepSeaSuit", odds = 8 },
			{ diver = "AnglerfishAndy", odds = 10 },
			{ diver = "PressureKnight", odds = 15 },
			{ diver = "SubmarinePilot", odds = 25 },
			{ diver = "AtlanteanGuard", odds = 400 },
			{ diver = "SirenQueen", odds = 700 },
			{ diver = "Poseidon", odds = 1500 },
			{ diver = "GhostCaptain", odds = 25000 },
			{ diver = "KrakenTamer", odds = 60000 },
		},
	},
	{
		id = "Atlantis",
		name = "Atlantis Roll",
		price = 25000000000,
		rebirthReq = 4,
		color = Color3.fromRGB(90, 255, 215),
		pool = {
			{ diver = "DeepSeaSuit", odds = 2 },
			{ diver = "AnglerfishAndy", odds = 3 },
			{ diver = "PressureKnight", odds = 4 },
			{ diver = "SubmarinePilot", odds = 5 },
			{ diver = "AtlanteanGuard", odds = 40 },
			{ diver = "SirenQueen", odds = 60 },
			{ diver = "Poseidon", odds = 120 },
			{ diver = "GhostCaptain", odds = 3000 },
			{ diver = "KrakenTamer", odds = 8000 },
		},
	},
}

local byId: { [string]: Crate } = {}
for order, crate in list do
	crate.order = order
	byId[crate.id] = crate
end

return {
	List = list,
	ById = byId,
}
