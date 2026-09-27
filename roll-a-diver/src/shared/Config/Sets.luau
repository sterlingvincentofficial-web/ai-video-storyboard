--[[
	Treasure sets. When every treasure of a set is displayed in the vault at the same time,
	each of those treasures earns `bonus` extra income (0.25 = +25%).
]]

export type TreasureSet = {
	id: string,
	name: string,
	bonus: number,
	items: { string },
}

local list: { TreasureSet } = {
	{ id = "BeachDay", name = "Beach Day", bonus = 0.25, items = { "LostSunglasses", "PearlNecklace", "GoldenDuck" } },
	{
		id = "PirateCaptain",
		name = "Pirate Captain",
		bonus = 0.25,
		items = { "CaptainsHat", "BronzeCompass", "PirateMap", "Cutlass" },
	},
	{ id = "DeepGlow", name = "Deep Glow", bonus = 0.3, items = { "BioOrb", "GlowingIdol", "Moonstone" } },
	{
		id = "KrakenSlayer",
		name = "Kraken Slayer",
		bonus = 0.35,
		items = { "KrakenTooth", "KrakenEye", "LeviathanScale" },
	},
	{
		id = "Atlantean",
		name = "Atlantean Regalia",
		bonus = 0.5,
		items = { "CrystalTablet", "AtlanteanHelm", "PoseidonTrident", "AtlanteanCrown" },
	},
}

local byId: { [string]: TreasureSet } = {}
for _, set in list do
	byId[set.id] = set
end

return {
	List = list,
	ById = byId,
}
