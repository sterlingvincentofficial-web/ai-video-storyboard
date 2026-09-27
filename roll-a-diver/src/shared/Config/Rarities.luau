--[[
	Rarity tiers shared by divers and treasures.
	`rank` orders tiers (higher = rarer). `announce` broadcasts finds to the whole server.
]]

export type Rarity = {
	id: string,
	rank: number,
	color: Color3,
	rainbow: boolean?,
	announce: boolean?,
}

local list: { Rarity } = {
	{ id = "Common", rank = 1, color = Color3.fromRGB(205, 205, 205) },
	{ id = "Uncommon", rank = 2, color = Color3.fromRGB(95, 220, 110) },
	{ id = "Rare", rank = 3, color = Color3.fromRGB(70, 150, 255) },
	{ id = "Epic", rank = 4, color = Color3.fromRGB(175, 85, 255) },
	{ id = "Legendary", rank = 5, color = Color3.fromRGB(255, 190, 40) },
	{ id = "Mythic", rank = 6, color = Color3.fromRGB(255, 80, 160), announce = true },
	{ id = "Abyssal", rank = 7, color = Color3.fromRGB(235, 40, 45), announce = true },
	{ id = "Divine", rank = 8, color = Color3.fromRGB(150, 255, 245), rainbow = true, announce = true },
	{ id = "Secret", rank = 9, color = Color3.fromRGB(25, 25, 30), rainbow = true, announce = true },
}

local byId: { [string]: Rarity } = {}
for _, rarity in list do
	byId[rarity.id] = rarity
end

return {
	List = list,
	ById = byId,
}
