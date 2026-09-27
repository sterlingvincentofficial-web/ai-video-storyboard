--[[
	Codes, daily login streak, spin wheel and group reward.

	A reward is a table with any of:
	  cash           flat cash
	  incomeMinutes  cash equal to N minutes of the player's current income (min: `cash` or 0)
	  potionMinutes  minutes of x2 Luck Potion
	  spins          extra wheel spins
	  chests         number of chests from the player's deepest unlocked zone
]]

export type Reward = {
	cash: number?,
	incomeMinutes: number?,
	potionMinutes: number?,
	spins: number?,
	chests: number?,
}

export type Code = {
	reward: Reward,
	expires: number?, -- os.time() after which the code stops working (nil = never)
	minRebirths: number?,
}

export type Segment = {
	id: string,
	label: string,
	weight: number,
	color: Color3,
	reward: Reward,
}

local Rewards = {}

-- Codes are case-insensitive. Add new ones here for updates / YouTuber promos.
Rewards.Codes = {
	RELEASE = { reward = { cash = 5000, potionMinutes = 15 } },
	DIVEIN = { reward = { cash = 2500, spins = 2 } },
	KRAKEN = { reward = { chests = 3, spins = 1 } },
	DEEPER = { reward = { incomeMinutes = 30, potionMinutes = 10 }, minRebirths = 1 },
} :: { [string]: Code }

-- Day 1..7 of the login streak. After day 7 the streak loops back to day 1.
Rewards.Daily = {
	{ cash = 500, incomeMinutes = 5 },
	{ cash = 1000, incomeMinutes = 10, spins = 1 },
	{ chests = 2, incomeMinutes = 10 },
	{ cash = 2500, potionMinutes = 10 },
	{ incomeMinutes = 30, spins = 2 },
	{ chests = 4, potionMinutes = 15 },
	{ incomeMinutes = 60, chests = 6, spins = 3, potionMinutes = 30 },
} :: { Reward }

Rewards.FreeSpinHours = 4

-- Spin wheel segments (weights are relative).
Rewards.Wheel = {
	{
		id = "SmallCash",
		label = "5m Cash",
		weight = 30,
		color = Color3.fromRGB(70, 200, 90),
		reward = { incomeMinutes = 5, cash = 300 },
	},
	{
		id = "Chests2",
		label = "2 Chests",
		weight = 22,
		color = Color3.fromRGB(200, 140, 60),
		reward = { chests = 2 },
	},
	{
		id = "Potion10",
		label = "Luck 10m",
		weight = 16,
		color = Color3.fromRGB(80, 220, 120),
		reward = { potionMinutes = 10 },
	},
	{
		id = "MedCash",
		label = "20m Cash",
		weight = 14,
		color = Color3.fromRGB(60, 150, 255),
		reward = { incomeMinutes = 20, cash = 1000 },
	},
	{
		id = "Chests5",
		label = "5 Chests",
		weight = 8,
		color = Color3.fromRGB(175, 85, 255),
		reward = { chests = 5 },
	},
	{
		id = "Respin",
		label = "+2 Spins",
		weight = 6,
		color = Color3.fromRGB(255, 190, 40),
		reward = { spins = 2 },
	},
	{
		id = "BigCash",
		label = "2h Cash",
		weight = 3,
		color = Color3.fromRGB(255, 80, 160),
		reward = { incomeMinutes = 120, cash = 10000 },
	},
	{
		id = "Jackpot",
		label = "JACKPOT",
		weight = 1,
		color = Color3.fromRGB(235, 40, 45),
		reward = { chests = 15, potionMinutes = 30 },
	},
} :: { Segment }

-- Join-the-group reward. Set GroupId to your Roblox group id to enable it (0 = off).
Rewards.GroupId = 0
Rewards.GroupLuckBonus = 0.1
Rewards.GroupJoinReward = { cash = 2500, spins = 2 } :: Reward

return Rewards
