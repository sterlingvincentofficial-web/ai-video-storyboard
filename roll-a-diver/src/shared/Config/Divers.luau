--[[
	Every diver a player can roll.

	maxDepth  metres the diver can reach (decides which zones they can bring chests back from)
	luck      multiplier on treasure rarity rolls
	speed     multiplier on dive speed (higher = shorter dives)
	look      procedural model style: suit / skin / helmet colors and helmet type
	          helmet types: Mask, Scuba, Brass, Pirate, Crown, Ghost, Fin, Knight
	ability   optional special rule handled by DiverService (see Abilities below)
]]

export type DiverLook = {
	suit: Color3,
	accent: Color3,
	skin: Color3,
	helmet: string,
}

export type Diver = {
	id: string,
	name: string,
	tier: string,
	maxDepth: number,
	luck: number,
	speed: number,
	look: DiverLook,
	ability: string?,
	order: number?,
}

local function rgb(r: number, g: number, b: number): Color3
	return Color3.fromRGB(r, g, b)
end

local SKIN_A = rgb(255, 205, 160)
local SKIN_B = rgb(200, 140, 95)
local SKIN_C = rgb(120, 80, 55)

local list: { Diver } = {
	-- Common: Shallows only
	{
		id = "SnorkelSam",
		name = "Snorkel Sam",
		tier = "Common",
		maxDepth = 100,
		luck = 1,
		speed = 1,
		look = { suit = rgb(60, 150, 230), accent = rgb(255, 230, 60), skin = SKIN_A, helmet = "Mask" },
	},
	{
		id = "PoolKid",
		name = "Pool Kid",
		tier = "Common",
		maxDepth = 100,
		luck = 1.05,
		speed = 1,
		look = { suit = rgb(255, 120, 60), accent = rgb(255, 255, 255), skin = SKIN_B, helmet = "Mask" },
	},
	{
		id = "BeachBob",
		name = "Beach Bob",
		tier = "Common",
		maxDepth = 100,
		luck = 1.1,
		speed = 1.05,
		look = { suit = rgb(240, 210, 120), accent = rgb(230, 60, 60), skin = SKIN_C, helmet = "Mask" },
	},
	{
		id = "FloatieFran",
		name = "Floatie Fran",
		tier = "Common",
		maxDepth = 100,
		luck = 1.15,
		speed = 1.1,
		look = { suit = rgb(255, 150, 200), accent = rgb(255, 240, 80), skin = SKIN_A, helmet = "Mask" },
	},

	-- Rare: down to the Reef
	{
		id = "ScubaSteve",
		name = "Scuba Steve",
		tier = "Rare",
		maxDepth = 500,
		luck = 1.5,
		speed = 1.1,
		look = { suit = rgb(30, 30, 40), accent = rgb(255, 210, 0), skin = SKIN_A, helmet = "Scuba" },
	},
	{
		id = "LifeguardLucy",
		name = "Lifeguard Lucy",
		tier = "Rare",
		maxDepth = 500,
		luck = 1.6,
		speed = 1.15,
		look = { suit = rgb(230, 40, 40), accent = rgb(255, 255, 255), skin = SKIN_B, helmet = "Scuba" },
	},
	{
		id = "SpearfisherSal",
		name = "Spearfisher Sal",
		tier = "Rare",
		maxDepth = 500,
		luck = 1.7,
		speed = 1.1,
		look = { suit = rgb(60, 110, 70), accent = rgb(200, 200, 200), skin = SKIN_C, helmet = "Scuba" },
	},
	{
		id = "ReefRanger",
		name = "Reef Ranger",
		tier = "Rare",
		maxDepth = 500,
		luck = 1.8,
		speed = 1.2,
		look = { suit = rgb(40, 190, 170), accent = rgb(255, 120, 110), skin = SKIN_A, helmet = "Scuba" },
	},

	-- Epic: down to the Shipwreck Graveyard
	{
		id = "PirateDiver",
		name = "Pirate Diver",
		tier = "Epic",
		maxDepth = 1500,
		luck = 2.5,
		speed = 1.2,
		look = { suit = rgb(120, 30, 30), accent = rgb(20, 20, 20), skin = SKIN_B, helmet = "Pirate" },
	},
	{
		id = "NavyFrogman",
		name = "Navy Frogman",
		tier = "Epic",
		maxDepth = 1500,
		luck = 2.6,
		speed = 1.3,
		look = { suit = rgb(40, 60, 40), accent = rgb(90, 90, 90), skin = SKIN_A, helmet = "Scuba" },
	},
	{
		id = "TreasureTina",
		name = "Treasure Tina",
		tier = "Epic",
		maxDepth = 1500,
		luck = 2.8,
		speed = 1.2,
		look = { suit = rgb(160, 60, 200), accent = rgb(255, 200, 40), skin = SKIN_C, helmet = "Scuba" },
	},
	{
		id = "WreckHunter",
		name = "Wreck Hunter",
		tier = "Epic",
		maxDepth = 1500,
		luck = 3,
		speed = 1.25,
		look = { suit = rgb(90, 60, 40), accent = rgb(200, 150, 60), skin = SKIN_A, helmet = "Brass" },
	},

	-- Legendary: down to the Twilight Zone
	{
		id = "TreasureHunterJack",
		name = "Treasure Hunter Jack",
		tier = "Legendary",
		maxDepth = 4000,
		luck = 5,
		speed = 1.35,
		look = { suit = rgb(150, 110, 60), accent = rgb(255, 215, 0), skin = SKIN_B, helmet = "Pirate" },
	},
	{
		id = "Mermaid",
		name = "Mermaid",
		tier = "Legendary",
		maxDepth = 4000,
		luck = 5.5,
		speed = 1.5,
		look = { suit = rgb(40, 200, 180), accent = rgb(255, 120, 200), skin = SKIN_A, helmet = "Fin" },
		ability = "NoCommon",
	},
	{
		id = "CaveDiverCole",
		name = "Cave Diver Cole",
		tier = "Legendary",
		maxDepth = 4000,
		luck = 6,
		speed = 1.35,
		look = { suit = rgb(230, 120, 30), accent = rgb(40, 40, 40), skin = SKIN_C, helmet = "Scuba" },
	},
	{
		id = "SharkWhisperer",
		name = "Shark Whisperer",
		tier = "Legendary",
		maxDepth = 4000,
		luck = 6.5,
		speed = 1.4,
		look = { suit = rgb(110, 130, 150), accent = rgb(255, 255, 255), skin = SKIN_A, helmet = "Fin" },
		ability = "KrakenImmune",
	},

	-- Abyssal: down to the Abyss
	{
		id = "DeepSeaSuit",
		name = "Deep Sea Suit",
		tier = "Abyssal",
		maxDepth = 8000,
		luck = 12,
		speed = 1.5,
		look = { suit = rgb(170, 150, 120), accent = rgb(200, 150, 50), skin = SKIN_A, helmet = "Brass" },
	},
	{
		id = "AnglerfishAndy",
		name = "Anglerfish Andy",
		tier = "Abyssal",
		maxDepth = 8000,
		luck = 13,
		speed = 1.5,
		look = { suit = rgb(30, 25, 45), accent = rgb(255, 250, 150), skin = SKIN_B, helmet = "Brass" },
	},
	{
		id = "SubmarinePilot",
		name = "Submarine Pilot",
		tier = "Abyssal",
		maxDepth = 8000,
		luck = 12,
		speed = 1.6,
		look = { suit = rgb(240, 200, 30), accent = rgb(40, 40, 40), skin = SKIN_A, helmet = "Brass" },
		ability = "ShareDepth",
	},
	{
		id = "PressureKnight",
		name = "Pressure Knight",
		tier = "Abyssal",
		maxDepth = 8000,
		luck = 15,
		speed = 1.55,
		look = { suit = rgb(120, 130, 150), accent = rgb(235, 40, 45), skin = SKIN_C, helmet = "Knight" },
	},

	-- Divine: down to Atlantis
	{
		id = "Poseidon",
		name = "Poseidon",
		tier = "Divine",
		maxDepth = 11000,
		luck = 25,
		speed = 1.75,
		look = { suit = rgb(40, 110, 200), accent = rgb(255, 215, 60), skin = SKIN_A, helmet = "Crown" },
		ability = "DoubleEvery5",
	},
	{
		id = "AtlanteanGuard",
		name = "Atlantean Guard",
		tier = "Divine",
		maxDepth = 11000,
		luck = 28,
		speed = 1.75,
		look = { suit = rgb(60, 220, 190), accent = rgb(255, 200, 80), skin = SKIN_B, helmet = "Knight" },
		ability = "KrakenImmune",
	},
	{
		id = "SirenQueen",
		name = "Siren Queen",
		tier = "Divine",
		maxDepth = 11000,
		luck = 22,
		speed = 1.8,
		look = { suit = rgb(150, 60, 200), accent = rgb(150, 255, 245), skin = SKIN_A, helmet = "Crown" },
		ability = "AdjacentLuck",
	},

	-- Secret
	{
		id = "GhostCaptain",
		name = "Ghost Captain",
		tier = "Secret",
		maxDepth = 20000,
		luck = 60,
		speed = 2,
		look = { suit = rgb(160, 255, 220), accent = rgb(20, 20, 20), skin = rgb(190, 255, 235), helmet = "Ghost" },
		ability = "IgnoreZoneLock",
	},
	{
		id = "KrakenTamer",
		name = "Kraken Tamer",
		tier = "Secret",
		maxDepth = 20000,
		luck = 70,
		speed = 2,
		look = { suit = rgb(90, 20, 60), accent = rgb(255, 60, 30), skin = SKIN_C, helmet = "Knight" },
		ability = "KrakenTamer",
	},
}

-- Player-facing ability descriptions.
local abilities: { [string]: string } = {
	NoCommon = "Never brings back Common treasure.",
	KrakenImmune = "The Kraken never grabs this diver.",
	ShareDepth = "Divers next to this one dive as deep as it does.",
	DoubleEvery5 = "Every 5th dive brings back 2 chests.",
	AdjacentLuck = "Divers next to this one get +50% luck.",
	IgnoreZoneLock = "Ignores rebirth zone locks and can reach any depth.",
	KrakenTamer = "Tames the Kraken: grabs on any of your divers become bonus chests.",
}

local byId: { [string]: Diver } = {}
for order, diver in list do
	assert(byId[diver.id] == nil, "Duplicate diver id " .. diver.id)
	diver.order = order
	byId[diver.id] = diver
end

return {
	List = list,
	ById = byId,
	Abilities = abilities,
	StarterDiver = "SnorkelSam",
}
