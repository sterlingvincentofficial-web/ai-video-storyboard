--[[
	Cash upgrades. Cost of the next level = baseCost * growth ^ currentLevel.
	Upgrades are kept through rebirth.
]]

export type Upgrade = {
	id: string,
	name: string,
	description: string,
	baseCost: number,
	growth: number,
	maxLevel: number,
	order: number?,
}

local list: { Upgrade } = {
	{
		id = "DiveSlots",
		name = "Dive Slots",
		description = "+1 diver on your dock",
		baseCost = 500,
		growth = 12,
		maxLevel = 5,
	},
	{
		id = "Pedestals",
		name = "Vault Pedestals",
		description = "+1 treasure pedestal in your vault",
		baseCost = 300,
		growth = 4,
		maxLevel = 10,
	},
	{
		id = "Luck",
		name = "Lucky Charm",
		description = "+10% luck for every diver",
		baseCost = 2000,
		growth = 2.2,
		maxLevel = 20,
	},
	{
		id = "Oxygen",
		name = "Oxygen Tanks",
		description = "+8% dive speed for every diver",
		baseCost = 1500,
		growth = 2.1,
		maxLevel = 20,
	},
}

local byId: { [string]: Upgrade } = {}
for order, upgrade in list do
	upgrade.order = order
	byId[upgrade.id] = upgrade
end

return {
	List = list,
	ById = byId,
}
