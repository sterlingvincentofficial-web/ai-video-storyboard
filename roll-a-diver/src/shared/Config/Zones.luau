--[[
	Depth zones. A diver reaches every zone whose `minDepth` is below the diver's max depth,
	as long as the player has enough rebirths to unlock that zone.

	`valueBase` scales the income of every treasure found in the zone.
	`chest` is the chest a diver brings back from this zone (see Chests below).
]]

export type Zone = {
	id: string,
	index: number?,
	name: string,
	minDepth: number,
	maxDepth: number,
	rebirthReq: number,
	valueBase: number,
	chest: string,
	color: Color3,
	secret: boolean?,
}

export type Chest = {
	id: string,
	name: string,
	zone: string,
	color: Color3,
	glow: Color3,
}

local zones: { Zone } = {
	{
		id = "Shallows",
		name = "Shallows",
		minDepth = 0,
		maxDepth = 100,
		rebirthReq = 0,
		valueBase = 1,
		chest = "RustyCrate",
		color = Color3.fromRGB(70, 210, 220),
	},
	{
		id = "Reef",
		name = "Coral Reef",
		minDepth = 100,
		maxDepth = 500,
		rebirthReq = 0,
		valueBase = 6,
		chest = "CoralChest",
		color = Color3.fromRGB(255, 120, 110),
	},
	{
		id = "Shipwreck",
		name = "Shipwreck Graveyard",
		minDepth = 500,
		maxDepth = 1500,
		rebirthReq = 0,
		valueBase = 36,
		chest = "PirateChest",
		color = Color3.fromRGB(190, 140, 70),
	},
	{
		id = "Twilight",
		name = "Twilight Zone",
		minDepth = 1500,
		maxDepth = 4000,
		rebirthReq = 1,
		valueBase = 250,
		chest = "GlowingCoffer",
		color = Color3.fromRGB(90, 110, 255),
	},
	{
		id = "Abyss",
		name = "The Abyss",
		minDepth = 4000,
		maxDepth = 8000,
		rebirthReq = 2,
		valueBase = 1800,
		chest = "AbyssalRelicBox",
		color = Color3.fromRGB(200, 30, 50),
	},
	{
		id = "Atlantis",
		name = "Atlantis",
		minDepth = 8000,
		maxDepth = 11000,
		rebirthReq = 3,
		valueBase = 13000,
		chest = "AtlanteanVault",
		color = Color3.fromRGB(80, 255, 200),
	},
	{
		id = "Bottom",
		name = "??? The Bottom",
		minDepth = 11000,
		maxDepth = 20000,
		rebirthReq = 5,
		valueBase = 100000,
		chest = "UnknownBox",
		color = Color3.fromRGB(240, 240, 240),
		secret = true,
	},
}

local chests: { Chest } = {
	{
		id = "RustyCrate",
		name = "Rusty Crate",
		zone = "Shallows",
		color = Color3.fromRGB(140, 95, 60),
		glow = Color3.fromRGB(235, 235, 235),
	},
	{
		id = "CoralChest",
		name = "Coral Chest",
		zone = "Reef",
		color = Color3.fromRGB(255, 125, 110),
		glow = Color3.fromRGB(95, 220, 110),
	},
	{
		id = "PirateChest",
		name = "Pirate Chest",
		zone = "Shipwreck",
		color = Color3.fromRGB(120, 70, 35),
		glow = Color3.fromRGB(70, 150, 255),
	},
	{
		id = "GlowingCoffer",
		name = "Glowing Coffer",
		zone = "Twilight",
		color = Color3.fromRGB(70, 80, 200),
		glow = Color3.fromRGB(175, 85, 255),
	},
	{
		id = "AbyssalRelicBox",
		name = "Abyssal Relic Box",
		zone = "Abyss",
		color = Color3.fromRGB(45, 20, 30),
		glow = Color3.fromRGB(235, 40, 45),
	},
	{
		id = "AtlanteanVault",
		name = "Atlantean Vault",
		zone = "Atlantis",
		color = Color3.fromRGB(60, 200, 170),
		glow = Color3.fromRGB(150, 255, 245),
	},
	{
		id = "UnknownBox",
		name = "??? Box",
		zone = "Bottom",
		color = Color3.fromRGB(15, 15, 18),
		glow = Color3.fromRGB(255, 255, 255),
	},
}

local zoneById: { [string]: Zone } = {}
for index, zone in zones do
	zone.index = index
	zoneById[zone.id] = zone
end

local chestById: { [string]: Chest } = {}
for _, chest in chests do
	chestById[chest.id] = chest
end

return {
	List = zones,
	ById = zoneById,
	Chests = chests,
	ChestById = chestById,
}
