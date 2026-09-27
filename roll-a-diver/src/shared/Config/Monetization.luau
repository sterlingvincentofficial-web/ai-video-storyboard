--[[
	Game passes and developer products.

	After publishing, create each pass/product on the Creator Dashboard and paste its id here.
	While an id is 0 the shop shows the item as "Coming soon" and nothing can be bought.
]]

export type Pass = {
	id: string,
	name: string,
	description: string,
	assetId: number,
	robux: number,
	order: number?,
}

export type Product = {
	id: string,
	name: string,
	description: string,
	assetId: number,
	robux: number,
	order: number?,
}

local passes: { Pass } = {
	{
		id = "DoubleMoney",
		name = "x2 Money",
		description = "Double all treasure income forever.",
		assetId = 0,
		robux = 399,
	},
	{
		id = "AutoCollect",
		name = "Auto Collect",
		description = "Pedestal cash goes straight to your wallet.",
		assetId = 0,
		robux = 149,
	},
	{
		id = "AutoOpen",
		name = "Auto Open Chests",
		description = "Chests open themselves the moment divers surface.",
		assetId = 0,
		robux = 199,
	},
	{
		id = "ExtraSlots",
		name = "+2 Dive Slots",
		description = "Two extra divers on your dock.",
		assetId = 0,
		robux = 249,
	},
	{
		id = "LuckyDiver",
		name = "Lucky Diver",
		description = "x1.5 luck on every dive and roll.",
		assetId = 0,
		robux = 299,
	},
	{
		id = "VIP",
		name = "VIP",
		description = "+10% income, 12h offline earnings and a VIP chat tag.",
		assetId = 0,
		robux = 499,
	},
}

local products: { Product } = {
	{
		id = "StarterPack",
		name = "Starter Pack",
		description = "A Deep Sea Suit diver + $5,000. One per player.",
		assetId = 0,
		robux = 99,
	},
	{
		id = "LuckPotion",
		name = "Luck Potion",
		description = "x2 luck for 15 minutes. Stacks time.",
		assetId = 0,
		robux = 49,
	},
	{
		id = "OxygenTank",
		name = "Oxygen Tank",
		description = "All your divers surface instantly with their chests.",
		assetId = 0,
		robux = 25,
	},
	{
		id = "ServerLowTide",
		name = "Server Low Tide",
		description = "Start a Low Tide for the whole server right now.",
		assetId = 0,
		robux = 199,
	},
	{
		id = "CashSmall",
		name = "Cash Pouch",
		description = "10 minutes of your current income.",
		assetId = 0,
		robux = 39,
	},
	{
		id = "CashLarge",
		name = "Cash Chest",
		description = "2 hours of your current income.",
		assetId = 0,
		robux = 299,
	},
}

local passById: { [string]: Pass } = {}
for order, pass in passes do
	pass.order = order
	passById[pass.id] = pass
end

local productById: { [string]: Product } = {}
for order, product in products do
	product.order = order
	productById[product.id] = product
end

return {
	Passes = passes,
	PassById = passById,
	Products = products,
	ProductById = productById,
}
