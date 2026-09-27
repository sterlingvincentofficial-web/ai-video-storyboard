--[[
	Shop panel: gamepasses and developer products (Robux).
]]

local MarketplaceService = game:GetService("MarketplaceService")
local Players = game:GetService("Players")

local Shared = game:GetService("ReplicatedStorage").Shared
local Monetization = require(Shared.Config.Monetization)

local UI = script.Parent.Parent
local Kit = require(UI.Kit)
local Theme = require(UI.Theme)
local Notifications = require(UI.Notifications)
local Client = UI.Parent
local State = require(Client.State)

local Panel = {
	title = "🛒 Shop",
	color = Theme.Green,
}

local passButtons: { [string]: TextButton } = {}
local starterCard: Frame? = nil
local spinCard: Frame? = nil

local Shop = {}

function Shop.buyPass(passId: string)
	local pass = Monetization.PassById[passId]
	if not pass then
		return
	end
	if State.hasPass(passId) then
		Notifications.toast("You already own " .. pass.name, "Info")
		return
	end
	if pass.assetId == 0 then
		Notifications.toast(pass.name .. " is coming soon!", "Info")
		return
	end
	MarketplaceService:PromptGamePassPurchase(Players.LocalPlayer, pass.assetId)
end

function Shop.buyProduct(productId: string)
	local product = Monetization.ProductById[productId]
	if not product then
		return
	end
	if product.id == "SpinPack" and Players.LocalPlayer:GetAttribute("PaidRandomRestricted") then
		Notifications.toast("This item isn't available in your region", "Info")
		return
	end
	if product.assetId == 0 then
		Notifications.toast(product.name .. " is coming soon!", "Info")
		return
	end
	MarketplaceService:PromptProductPurchase(Players.LocalPlayer, product.assetId)
end

Panel.Shop = Shop

local function itemCard(
	parent: Instance,
	order: number,
	name: string,
	description: string,
	robux: number,
	color: Color3,
	onBuy: () -> ()
): (Frame, TextButton)
	local card = Kit.new("Frame", {
		BackgroundColor3 = Theme.Card,
		LayoutOrder = order,
		Parent = parent,
	}, { Kit.corner(12), Kit.stroke(3, color) })
	Kit.text({
		Text = name,
		Position = UDim2.fromOffset(8, 8),
		Size = UDim2.new(1, -16, 0, 30),
		TextColor3 = color,
		MaxTextSize = 26,
		Parent = card,
	})
	Kit.text({
		Text = description,
		Position = UDim2.fromOffset(8, 42),
		Size = UDim2.new(1, -16, 0, 56),
		TextColor3 = Theme.SubText,
		TextWrapped = true,
		MaxTextSize = 17,
		Parent = card,
	})
	local button = Kit.button({
		Text = "R$ " .. robux,
		Color = Theme.Green,
		AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.new(0.5, 0, 1, -8),
		Size = UDim2.new(1, -16, 0, 42),
		Parent = card,
		OnClick = onBuy,
	})
	return card, button
end

function Panel.build(content: Frame)
	local scroll = Kit.list(content, 10)
	local function section(title: string, order: number): Frame
		Kit.text({
			Text = title,
			Size = UDim2.new(1, -12, 0, 34),
			TextXAlignment = Enum.TextXAlignment.Left,
			TextColor3 = Theme.Gold,
			MaxTextSize = 28,
			LayoutOrder = order,
			Parent = scroll,
		})
		local holder = Kit.new("Frame", {
			Size = UDim2.new(1, -12, 0, 0),
			AutomaticSize = Enum.AutomaticSize.Y,
			BackgroundTransparency = 1,
			LayoutOrder = order + 1,
			Parent = scroll,
		})
		Kit.new("UIGridLayout", {
			CellSize = UDim2.fromOffset(220, 170),
			CellPadding = UDim2.fromOffset(10, 10),
			SortOrder = Enum.SortOrder.LayoutOrder,
			HorizontalAlignment = Enum.HorizontalAlignment.Center,
			Parent = holder,
		})
		return holder
	end
	local passHolder = section("Gamepasses (forever)", 1)
	for _, pass in Monetization.Passes do
		local _, button = itemCard(
			passHolder,
			pass.order or 0,
			pass.name,
			pass.description,
			pass.robux,
			Theme.Cyan,
			function()
				Shop.buyPass(pass.id)
			end
		)
		passButtons[pass.id] = button
	end
	local productHolder = section("Boosts", 3)
	for _, product in Monetization.Products do
		local card = itemCard(
			productHolder,
			product.order or 0,
			product.name,
			product.description,
			product.robux,
			Theme.Orange,
			function()
				Shop.buyProduct(product.id)
			end
		)
		if product.id == "StarterPack" then
			starterCard = card
		elseif product.id == "SpinPack" then
			spinCard = card
		end
	end
end

function Panel.refresh()
	for passId, button in passButtons do
		if State.hasPass(passId) then
			Kit.setButton(button, "OWNED", Theme.Grey)
		end
	end
	local data = State.data()
	if starterCard and data then
		starterCard.Visible = not data.starterPackClaimed
	end
	if spinCard then
		spinCard.Visible = not Players.LocalPlayer:GetAttribute("PaidRandomRestricted")
	end
end

function Panel.onClose() end

return Panel
