--!strict
-- The army. Each unit has 3 levels; each level is a full stat block plus its look.
--   Attack kinds (UnitService + client FX key off these):
--     Punch     melee single target              Chop     melee splash (cleave)
--     Pebble    projectile single target         Bullet   hitscan-ish fast projectile, boss bonus
--     Grenade   lobbed projectile, splash        Net      projectile, slows (and splash at L3)
--     Heal      heals the Banana Stash, hypes nearby men
--     Taunt     stops nearby monkeys and makes them fight him
--     Rally     aura: nearby men hit harder; shouts a faster-attack burst
--   Look: body colors, gear names from RigData/Gear, optional Shirt/Pants template image IDs.

export type Look = {
	Skin: Color3,
	Shirt: Color3,
	Pants: Color3,
	Hat: string?,
	HatColor: Color3?,
	Held: { string }?, -- gear meshes held in the right hand (several pieces make one item)
	HeldColors: { Color3 }?,
	LeftHeld: { string }?,
	LeftHeldColors: { Color3 }?,
	Wraps: Color3?, -- boxing wraps on both hands
	Badge: string?, -- chest badge mesh
	BadgeColor: Color3?,
	ShirtTemplate: number?,
	PantsTemplate: number?,
	Aura: boolean?, -- level 3 sparkle
}

export type Level = {
	Cost: number, -- to place (level 1) or to upgrade into this level
	Damage: number,
	Range: number,
	Cooldown: number,
	Splash: number?,
	BossBonus: number?,
	SlowFactor: number?,
	SlowTime: number?,
	Heal: number?,
	TauntRadius: number?,
	TauntTime: number?,
	RallyRadius: number?,
	RallyBonus: number?,
	Look: Look,
}

export type UnitDef = {
	DisplayName: string,
	Blurb: string,
	Kind: string,
	ProjectileSpeed: number?,
	Order: number,
	Levels: { Level },
}

local function rgb(r: number, g: number, b: number): Color3
	return Color3.fromRGB(r, g, b)
end

-- gear tiers: wood/plain -> steel -> gold
local WOOD = rgb(140, 92, 54)
local STEEL = rgb(170, 176, 186)
local GOLD = rgb(250, 196, 40)
local DARK = rgb(52, 54, 60)
local SKINS = { rgb(234, 184, 146), rgb(196, 140, 98), rgb(142, 96, 64), rgb(250, 214, 180), rgb(110, 72, 48) }

local function look(base: Look, over: { [string]: any }): Look
	local out = table.clone(base) :: any
	for k, v in over do
		out[k] = v
	end
	return out
end

local function levels(base: Look, stats: { { [string]: any } }, l2: { [string]: any }, l3: { [string]: any }): { Level }
	local looks = {
		base,
		look(base, l2),
		look(look(base, l2), l3),
	}
	local out = {}
	for i, s in stats do
		local lv = table.clone(s) :: any
		lv.Look = looks[i]
		out[i] = lv
	end
	return out
end

local RANK2 = { Badge = "Chevron", BadgeColor = STEEL }
local RANK3 = { Badge = "Star", BadgeColor = GOLD, Aura = true }

local Units: { [string]: UnitDef } = {
	Brawler = {
		DisplayName = "Brawler", Blurb = "Cheap. Angry. Punches monkeys in the face.",
		Kind = "Punch", Order = 1,
		Levels = levels(
			{ Skin = SKINS[1], Shirt = rgb(240, 240, 234), Pants = rgb(46, 78, 132), Hat = "Headband",
				HatColor = rgb(210, 36, 36), Wraps = rgb(235, 232, 220) },
			{
				{ Cost = 100, Damage = 10, Range = 7, Cooldown = 0.75 },
				{ Cost = 140, Damage = 18, Range = 7.5, Cooldown = 0.6 },
				{ Cost = 380, Damage = 34, Range = 8, Cooldown = 0.45 },
			},
			look(RANK2 :: any, { Wraps = STEEL }), look(RANK3 :: any, { Wraps = GOLD, HatColor = GOLD })
		),
	},
	Slingshot = {
		DisplayName = "Slingshot Kid", Blurb = "Pings pebbles at anything with a tail.",
		Kind = "Pebble", ProjectileSpeed = 70, Order = 2,
		Levels = levels(
			{ Skin = SKINS[4], Shirt = rgb(255, 150, 40), Pants = rgb(190, 160, 110), Hat = "Cap",
				HatColor = rgb(40, 110, 220), LeftHeld = { "Slingshot" }, LeftHeldColors = { WOOD } },
			{
				{ Cost = 150, Damage = 8, Range = 20, Cooldown = 0.7 },
				{ Cost = 180, Damage = 13, Range = 23, Cooldown = 0.55 },
				{ Cost = 450, Damage = 22, Range = 26, Cooldown = 0.38 },
			},
			look(RANK2 :: any, { LeftHeldColors = { STEEL } }), look(RANK3 :: any, { LeftHeldColors = { GOLD } })
		),
	},
	Lumberjack = {
		DisplayName = "Lumberjack", Blurb = "Big axe. Hits the whole crowd.",
		Kind = "Chop", Order = 3,
		Levels = levels(
			{ Skin = SKINS[2], Shirt = rgb(200, 40, 40), Pants = rgb(40, 50, 80), Hat = "Beanie",
				HatColor = rgb(30, 30, 34), Held = { "AxeHandle", "AxeHead" }, HeldColors = { WOOD, STEEL } },
			{
				{ Cost = 250, Damage = 20, Range = 8, Cooldown = 1.3, Splash = 7 },
				{ Cost = 300, Damage = 34, Range = 8.5, Cooldown = 1.1, Splash = 8 },
				{ Cost = 700, Damage = 65, Range = 9, Cooldown = 0.9, Splash = 10 },
			},
			look(RANK2 :: any, { HeldColors = { WOOD, rgb(200, 210, 225) } }),
			look(RANK3 :: any, { HeldColors = { rgb(90, 50, 30), GOLD } })
		),
	},
	Hunter = {
		DisplayName = "Hunter", Blurb = "Long range. Wrecks bosses.",
		Kind = "Bullet", ProjectileSpeed = 260, Order = 4,
		Levels = levels(
			{ Skin = SKINS[3], Shirt = rgb(196, 170, 112), Pants = rgb(96, 104, 64), Hat = "SafariHat",
				HatColor = rgb(214, 190, 130), Held = { "RifleStock", "RifleBarrel" }, HeldColors = { WOOD, DARK } },
			{
				{ Cost = 400, Damage = 40, Range = 38, Cooldown = 1.8, BossBonus = 2 },
				{ Cost = 450, Damage = 70, Range = 44, Cooldown = 1.5, BossBonus = 2.5 },
				{ Cost = 1100, Damage = 140, Range = 52, Cooldown = 1.15, BossBonus = 3 },
			},
			look(RANK2 :: any, { HeldColors = { DARK, STEEL } }), look(RANK3 :: any, { HeldColors = { DARK, GOLD } })
		),
	},
	Medic = {
		DisplayName = "Medic", Blurb = "Patches up the Banana Stash. Hypes the boys.",
		Kind = "Heal", Order = 5,
		Levels = levels(
			{ Skin = SKINS[5], Shirt = rgb(245, 245, 245), Pants = rgb(150, 200, 230), Hat = "MedicCap",
				HatColor = rgb(250, 250, 250), Held = { "Medkit" }, HeldColors = { rgb(250, 250, 250) } },
			{
				{ Cost = 300, Damage = 0, Range = 18, Cooldown = 4, Heal = 15 },
				{ Cost = 350, Damage = 0, Range = 22, Cooldown = 3.2, Heal = 28 },
				{ Cost = 800, Damage = 0, Range = 26, Cooldown = 2.5, Heal = 50 },
			},
			look(RANK2 :: any, {}), look(RANK3 :: any, { HeldColors = { GOLD } })
		),
	},
	Bait = {
		DisplayName = "Bait Guy", Blurb = "Dressed as a banana. Monkeys can't resist.",
		Kind = "Taunt", Order = 6,
		Levels = levels(
			{ Skin = SKINS[1], Shirt = rgb(255, 214, 40), Pants = rgb(255, 214, 40), Hat = "BananaHat",
				HatColor = rgb(255, 214, 40), Held = { "BigBanana" }, HeldColors = { rgb(255, 224, 60) } },
			{
				{ Cost = 200, Damage = 3, Range = 12, Cooldown = 5, TauntRadius = 12, TauntTime = 2.2 },
				{ Cost = 240, Damage = 6, Range = 14, Cooldown = 4.2, TauntRadius = 14, TauntTime = 2.8 },
				{ Cost = 600, Damage = 12, Range = 16, Cooldown = 3.4, TauntRadius = 17, TauntTime = 3.4 },
			},
			look(RANK2 :: any, {}), look(RANK3 :: any, { HatColor = GOLD })
		),
	},
	Grenadier = {
		DisplayName = "Grenadier", Blurb = "Lobs grenades. Monkeys go flying.",
		Kind = "Grenade", ProjectileSpeed = 32, Order = 7,
		Levels = levels(
			{ Skin = SKINS[2], Shirt = rgb(96, 110, 60), Pants = rgb(80, 92, 50), Hat = "ArmyHelmet",
				HatColor = rgb(84, 98, 52), Held = { "Grenade" }, HeldColors = { rgb(70, 90, 50) } },
			{
				{ Cost = 450, Damage = 26, Range = 24, Cooldown = 2.2, Splash = 9 },
				{ Cost = 500, Damage = 44, Range = 27, Cooldown = 1.9, Splash = 10.5 },
				{ Cost = 1200, Damage = 80, Range = 30, Cooldown = 1.5, Splash = 13 },
			},
			look(RANK2 :: any, {}), look(RANK3 :: any, { HeldColors = { GOLD } })
		),
	},
	Zookeeper = {
		DisplayName = "Zookeeper", Blurb = "Nets monkeys. Slows them right down.",
		Kind = "Net", ProjectileSpeed = 45, Order = 8,
		Levels = levels(
			{ Skin = SKINS[4], Shirt = rgb(150, 160, 90), Pants = rgb(60, 90, 60), Hat = "ZooCap",
				HatColor = rgb(60, 110, 70), Held = { "NetGun", "NetGunMuzzle" }, HeldColors = { DARK, rgb(255, 140, 30) } },
			{
				{ Cost = 350, Damage = 6, Range = 20, Cooldown = 1.6, SlowFactor = 0.5, SlowTime = 2.5 },
				{ Cost = 380, Damage = 12, Range = 23, Cooldown = 1.3, SlowFactor = 0.42, SlowTime = 3 },
				{ Cost = 900, Damage = 22, Range = 26, Cooldown = 1.0, SlowFactor = 0.33, SlowTime = 3.5, Splash = 6 },
			},
			look(RANK2 :: any, {}), look(RANK3 :: any, { HeldColors = { DARK, GOLD } })
		),
	},
	Commander = {
		DisplayName = "Commander", Blurb = "Barks orders. Everyone nearby hits harder.",
		Kind = "Rally", Order = 9,
		Levels = levels(
			{ Skin = SKINS[3], Shirt = rgb(36, 50, 92), Pants = rgb(30, 36, 60), Hat = "OfficerCap",
				HatColor = rgb(36, 50, 92), Held = { "Megaphone" }, HeldColors = { rgb(220, 50, 50) } },
			{
				{ Cost = 600, Damage = 0, Range = 18, Cooldown = 8, RallyRadius = 18, RallyBonus = 0.25 },
				{ Cost = 700, Damage = 0, Range = 22, Cooldown = 7, RallyRadius = 22, RallyBonus = 0.4 },
				{ Cost = 1600, Damage = 0, Range = 26, Cooldown = 6, RallyRadius = 26, RallyBonus = 0.6 },
			},
			look(RANK2 :: any, {}), look(RANK3 :: any, { HeldColors = { GOLD } })
		),
	},
}

return Units
