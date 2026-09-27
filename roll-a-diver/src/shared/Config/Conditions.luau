--[[
	Treasure conditions (variants). Every opened treasure rolls one.
	`odds` is "1 in N" at luck x1; `mult` multiplies the treasure's income and sell value.
	`effect` is read by ModelFactory to decorate the pedestal model.
]]

export type Condition = {
	id: string,
	name: string,
	odds: number,
	mult: number,
	color: Color3,
	effect: string,
	rank: number?,
	announce: boolean?,
}

local list: { Condition } = {
	{
		id = "Barnacled",
		name = "Barnacled",
		odds = 1,
		mult = 1,
		color = Color3.fromRGB(170, 160, 140),
		effect = "None",
	},
	{ id = "Polished", name = "Polished", odds = 8, mult = 2, color = Color3.fromRGB(220, 240, 255), effect = "Shine" },
	{ id = "Golden", name = "Golden", odds = 40, mult = 3, color = Color3.fromRGB(255, 200, 40), effect = "Gold" },
	{ id = "Cursed", name = "Cursed", odds = 150, mult = 5, color = Color3.fromRGB(160, 60, 255), effect = "Smoke" },
	{
		id = "Crystal",
		name = "Crystal",
		odds = 600,
		mult = 8,
		color = Color3.fromRGB(150, 240, 255),
		effect = "Crystal",
	},
	{
		id = "Ancient",
		name = "Ancient",
		odds = 3000,
		mult = 15,
		color = Color3.fromRGB(120, 200, 110),
		effect = "Ancient",
		announce = true,
	},
	{
		id = "Glitched",
		name = "Glitched",
		odds = 25000,
		mult = 40,
		color = Color3.fromRGB(255, 40, 200),
		effect = "Glitch",
		announce = true,
	},
}

local byId: { [string]: Condition } = {}
for rank, condition in list do
	condition.rank = rank
	byId[condition.id] = condition
end

return {
	List = list,
	ById = byId,
	Default = "Barnacled",
}
