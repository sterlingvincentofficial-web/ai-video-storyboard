--!strict
-- Enemy stats. Health scales per wave in WaveService; everything else is per type.
--   Speed       studs per second along the path
--   BaseDps     damage per second to the Banana Stash once they reach it
--   Reward      cash per kill
--   Scale       visual + hit size multiplier on top of the mesh
--   Armor       fraction of non-splash damage ignored
--   Colors      used by the kill effects (bricks fly in these colors)
--   Ability     special behaviour handled by EnemyService

export type EnemyDef = {
	DisplayName: string,
	Health: number,
	Speed: number,
	BaseDps: number,
	Reward: number,
	Scale: number,
	Armor: number?,
	Boss: boolean?,
	Ability: string?,
	Colors: { Fur: Color3, Cream: Color3, Accent: Color3? },
}

local function rgb(r: number, g: number, b: number): Color3
	return Color3.fromRGB(r, g, b)
end

local CREAM = rgb(250, 246, 182)

local Enemies: { [string]: EnemyDef } = {
	Monkey = {
		DisplayName = "Monkey",
		Health = 30, Speed = 8, BaseDps = 3, Reward = 5, Scale = 1,
		Colors = { Fur = rgb(116, 80, 58), Cream = CREAM },
	},
	Speedy = {
		DisplayName = "Speedy",
		Health = 22, Speed = 15, BaseDps = 3, Reward = 6, Scale = 0.95,
		Colors = { Fur = rgb(54, 54, 62), Cream = CREAM, Accent = rgb(220, 40, 40) },
	},
	Chucker = {
		DisplayName = "Banana Chucker",
		Health = 42, Speed = 7, BaseDps = 3, Reward = 8, Scale = 1, Ability = "Throw",
		Colors = { Fur = rgb(178, 112, 54), Cream = CREAM, Accent = rgb(255, 214, 40) },
	},
	Brute = {
		DisplayName = "Brute",
		Health = 160, Speed = 5.5, BaseDps = 8, Reward = 15, Scale = 1.15, Armor = 0.35,
		Colors = { Fur = rgb(92, 58, 40), Cream = rgb(236, 222, 160), Accent = rgb(150, 156, 164) },
	},
	Baby = {
		DisplayName = "Baby Monkey",
		Health = 9, Speed = 10, BaseDps = 1, Reward = 2, Scale = 0.9,
		Colors = { Fur = rgb(156, 106, 70), Cream = rgb(255, 240, 196), Accent = rgb(245, 245, 240) },
	},
	Ninja = {
		DisplayName = "Ninja Monkey",
		Health = 48, Speed = 10, BaseDps = 4, Reward = 10, Scale = 1, Ability = "Leap",
		Colors = { Fur = rgb(98, 78, 64), Cream = CREAM, Accent = rgb(30, 30, 36) },
	},
	Silverback = {
		DisplayName = "SILVERBACK",
		Health = 2600, Speed = 3.6, BaseDps = 60, Reward = 400, Scale = 1.5, Boss = true, Ability = "Slam",
		Colors = { Fur = rgb(48, 48, 54), Cream = rgb(122, 122, 130), Accent = rgb(176, 180, 188) },
	},
	RockThrower = {
		DisplayName = "ROCK THROWER",
		Health = 5200, Speed = 3.4, BaseDps = 80, Reward = 700, Scale = 1.5, Boss = true, Ability = "Boulder",
		Colors = { Fur = rgb(98, 86, 76), Cream = rgb(140, 132, 124), Accent = rgb(128, 132, 128) },
	},
	Berserker = {
		DisplayName = "BERSERKER",
		Health = 9000, Speed = 3.8, BaseDps = 120, Reward = 1100, Scale = 1.55, Boss = true, Ability = "Enrage",
		Colors = { Fur = rgb(112, 42, 36), Cream = rgb(150, 110, 104), Accent = rgb(255, 60, 40) },
	},
	Alpha = {
		DisplayName = "THE ALPHA",
		Health = 15000, Speed = 3.2, BaseDps = 160, Reward = 1600, Scale = 1.6, Boss = true, Ability = "Summon",
		Colors = { Fur = rgb(34, 32, 38), Cream = rgb(112, 110, 120), Accent = rgb(250, 196, 40) },
	},
	Titan = {
		DisplayName = "THE GORILLA",
		Health = 90000, Speed = 2.8, BaseDps = 1000, Reward = 10000, Scale = 2.6, Boss = true, Ability = "Titan",
		Colors = { Fur = rgb(26, 24, 30), Cream = rgb(96, 92, 104), Accent = rgb(250, 196, 40) },
	},
}

return Enemies
