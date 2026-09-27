--[[
	Game passes and developer products.
	Pass ownership is cached per player; product receipts are de-duplicated through save data.
]]

local MarketplaceService = game:GetService("MarketplaceService")
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")

local Shared = game:GetService("ReplicatedStorage").Shared
local Monetization = require(Shared.Config.Monetization)
local Format = require(Shared.Util.Format)
local GameConfig = require(Shared.Config.Game)

local Services = require(script.Parent.Parent.Registry)

local MarketService = {}

local owned: { [Player]: { [string]: boolean } } = {}
local MAX_RECEIPTS = 50

local passByAsset: { [number]: string } = {}
for _, pass in Monetization.Passes do
	if pass.assetId ~= 0 then
		passByAsset[pass.assetId] = pass.id
	end
end

local productByAsset: { [number]: string } = {}
for _, product in Monetization.Products do
	if product.assetId ~= 0 then
		productByAsset[product.assetId] = product.id
	end
end

function MarketService.LoadPasses(player: Player)
	local passes = {}
	for _, pass in Monetization.Passes do
		if pass.assetId ~= 0 then
			local ok, result = pcall(function()
				return MarketplaceService:UserOwnsGamePassAsync(player.UserId, pass.assetId)
			end)
			if ok and result then
				passes[pass.id] = true
			end
		end
	end
	owned[player] = passes
	MarketService.ApplyPassPerks(player)
end

function MarketService.HasPass(player: Player, passId: string): boolean
	local passes = owned[player]
	if passes and passes[passId] then
		return true
	end
	-- Studio-only overrides set with the /pass admin command
	if RunService:IsStudio() then
		local data = Services.DataService.Get(player)
		if data and data.devPasses[passId] then
			return true
		end
	end
	return false
end

function MarketService.GetOwned(player: Player): { [string]: boolean }
	local result = {}
	for _, pass in Monetization.Passes do
		if MarketService.HasPass(player, pass.id) then
			result[pass.id] = true
		end
	end
	return result
end

-- Things that change the world when a pass is gained (extra dive slots, VIP tag).
function MarketService.ApplyPassPerks(player: Player)
	player:SetAttribute("VIP", MarketService.HasPass(player, "VIP"))
	if Services.DataService.Get(player) then
		Services.DiverService.Refresh(player)
		Services.DataService.MarkDirty(player)
	end
end

function MarketService.Forget(player: Player)
	owned[player] = nil
end

-- Products ---------------------------------------------------------------------------------

local function currentIncome(player: Player): number
	return Services.VaultService.IncomePerSecond(player)
end

local productHandlers: { [string]: (Player, { [string]: any }) -> () } = {
	StarterPack = function(player, data)
		if not data.starterPackClaimed then
			data.starterPackClaimed = true
			Services.DiverService.AddDiver(player, "DeepSeaSuit")
		end
		Services.EconomyService.AddCash(player, 5000)
		Services.PlayerService.Notify(player, "Starter Pack claimed! Deep Sea Suit + $5,000", "Success")
	end,
	LuckPotion = function(player, data)
		data.luckPotionEnds = math.max(data.luckPotionEnds, os.time()) + GameConfig.LuckPotionSeconds
		Services.PlayerService.Notify(player, "Luck Potion active: x2 luck!", "Success")
	end,
	OxygenTank = function(player)
		Services.DiverService.SurfaceAll(player)
		Services.PlayerService.Notify(player, "Oxygen Tank! All divers are surfacing.", "Success")
	end,
	ServerLowTide = function(player)
		Services.EventService.StartEvent("LowTide", player.DisplayName)
	end,
	CashSmall = function(player)
		local amount = math.max(1000, currentIncome(player) * 600)
		Services.EconomyService.AddCash(player, amount)
		Services.PlayerService.Notify(player, "+" .. Format.money(amount), "Success")
	end,
	CashLarge = function(player)
		local amount = math.max(20000, currentIncome(player) * 7200)
		Services.EconomyService.AddCash(player, amount)
		Services.PlayerService.Notify(player, "+" .. Format.money(amount), "Success")
	end,
}

-- Also used by the /product admin command to test product effects in Studio.
function MarketService.GrantProduct(player: Player, productId: string): boolean
	local data = Services.DataService.Get(player)
	local handler = productHandlers[productId]
	if not data or not handler then
		return false
	end
	handler(player, data)
	Services.DataService.MarkDirty(player)
	return true
end

local function processReceipt(receipt): Enum.ProductPurchaseDecision
	local player = Players:GetPlayerByUserId(receipt.PlayerId)
	local data = player and Services.DataService.Get(player)
	if not player or not data then
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end
	local purchaseId = tostring(receipt.PurchaseId)
	if table.find(data.receipts, purchaseId) then
		return Enum.ProductPurchaseDecision.PurchaseGranted
	end
	local productId = productByAsset[receipt.ProductId]
	if not productId then
		warn("[MarketService] Unknown product id " .. tostring(receipt.ProductId))
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end
	local ok, err = pcall(MarketService.GrantProduct, player, productId)
	if not ok then
		warn("[MarketService] Grant failed: " .. tostring(err))
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end
	table.insert(data.receipts, purchaseId)
	while #data.receipts > MAX_RECEIPTS do
		table.remove(data.receipts, 1)
	end
	-- Only confirm once the purchase is really saved. If the save fails Roblox retries later,
	-- and the receipt id already in data.receipts stops the item being granted twice.
	if Services.DataService.IsSaving(player) and not Services.DataService.Save(player, false) then
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end
	return Enum.ProductPurchaseDecision.PurchaseGranted
end

function MarketService.Init()
	MarketplaceService.ProcessReceipt = processReceipt

	MarketplaceService.PromptGamePassPurchaseFinished:Connect(function(player, assetId, purchased)
		if not purchased then
			return
		end
		local passId = passByAsset[assetId]
		if passId then
			owned[player] = owned[player] or {}
			owned[player][passId] = true
			MarketService.ApplyPassPerks(player)
			Services.PlayerService.Notify(
				player,
				"Thanks for buying " .. Monetization.PassById[passId].name .. "!",
				"Success"
			)
		end
	end)
end

return MarketService
