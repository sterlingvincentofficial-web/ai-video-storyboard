--[[
	Index panel: one page per zone (plus a Divers page). Undiscovered items show as black silhouettes;
	coloured dots show which conditions of a treasure were found.
]]

local Shared = game:GetService("ReplicatedStorage").Shared
local Formulas = require(Shared.Formulas)
local ModelFactory = require(Shared.ModelFactory)
local GameConfig = require(Shared.Config.Game)
local Zones = require(Shared.Config.Zones)
local Treasures = require(Shared.Config.Treasures)
local Conditions = require(Shared.Config.Conditions)
local Rarities = require(Shared.Config.Rarities)
local Divers = require(Shared.Config.Divers)

local UI = script.Parent.Parent
local Kit = require(UI.Kit)
local Theme = require(UI.Theme)
local Client = UI.Parent
local State = require(Client.State)

local Panel = {
	title = "📖 Index",
	color = Theme.Gold,
}

local header: TextLabel
local tabs: ScrollingFrame
local grid: ScrollingFrame
local selected = "Shallows"
local lastKey = ""

local function tile(order: number, name: string, rarityId: string, found: boolean, model: Model, dots: { Color3? }?)
	local rarity = Rarities.ById[rarityId]
	local frame = Kit.new("Frame", {
		BackgroundColor3 = if found then Theme.Card else Theme.CardDark,
		LayoutOrder = order,
		Parent = grid,
	}, { Kit.corner(12), Kit.stroke(3, if found then rarity.color else Theme.Stroke) })
	local holder = Kit.new("Frame", {
		BackgroundTransparency = 1,
		Position = UDim2.fromOffset(15, 4),
		Size = UDim2.new(1, -30, 0, 78),
		Parent = frame,
	})
	-- a black ImageColor3 turns the model into a silhouette
	Kit.viewport(holder, model, { ImageColor3 = if found then Color3.new(1, 1, 1) else Color3.new(0, 0, 0) })
	local nameLabel = Kit.text({
		Text = if found then name else "???",
		Position = UDim2.fromOffset(4, 84),
		Size = UDim2.new(1, -8, 0, 20),
		TextColor3 = if found then rarity.color else Theme.SubText,
		MaxTextSize = 16,
		Parent = frame,
	})
	if found and rarity.rainbow then
		nameLabel.TextColor3 = Color3.new(1, 1, 1)
		Kit.rainbow(nameLabel)
	end
	Kit.text({
		Text = rarityId,
		Position = UDim2.fromOffset(4, 104),
		Size = UDim2.new(1, -8, 0, 16),
		TextColor3 = Theme.SubText,
		MaxTextSize = 14,
		Parent = frame,
	})
	if dots then
		local row = Kit.new("Frame", {
			Position = UDim2.new(0, 8, 1, -18),
			Size = UDim2.new(1, -16, 0, 12),
			BackgroundTransparency = 1,
			Parent = frame,
		})
		Kit.new("UIListLayout", {
			FillDirection = Enum.FillDirection.Horizontal,
			HorizontalAlignment = Enum.HorizontalAlignment.Center,
			Padding = UDim.new(0, 4),
			Parent = row,
		})
		for index, color in dots do
			Kit.new("Frame", {
				Size = UDim2.fromOffset(12, 12),
				BackgroundColor3 = color or Color3.fromRGB(50, 55, 70),
				LayoutOrder = index,
				Parent = row,
			}, { Kit.corner(6) })
		end
	end
end

local function buildTabs()
	Kit.clear(tabs)
	local data = State.data()
	local rebirths = if data then data.rebirths else 0
	local entries = {}
	for _, zone in Zones.List do
		table.insert(
			entries,
			{ id = zone.id, name = if zone.secret and rebirths < zone.rebirthReq then "???" else zone.name }
		)
	end
	table.insert(entries, { id = "Divers", name = "Divers" })
	for order, entry in entries do
		Kit.button({
			Text = entry.name,
			Color = if selected == entry.id then Theme.Gold else Theme.Card,
			Size = UDim2.fromOffset(130, 34),
			LayoutOrder = order,
			Parent = tabs,
			OnClick = function()
				selected = entry.id
				lastKey = ""
				buildTabs()
				Panel.refresh()
			end,
		})
	end
end

function Panel.build(content: Frame)
	header = Kit.text({
		Text = "",
		Size = UDim2.new(1, 0, 0, 30),
		TextXAlignment = Enum.TextXAlignment.Left,
		MaxTextSize = 22,
		Parent = content,
	})
	local tabHolder = Kit.new("Frame", {
		Position = UDim2.fromOffset(0, 34),
		Size = UDim2.new(1, 0, 0, 50),
		BackgroundTransparency = 1,
		Parent = content,
	})
	tabs = Kit.list(tabHolder, 6, true)
	local body = Kit.new("Frame", {
		Position = UDim2.fromOffset(0, 88),
		Size = UDim2.new(1, 0, 1, -88),
		BackgroundTransparency = 1,
		Parent = content,
	})
	grid = Kit.grid(body, UDim2.fromOffset(130, 150), 8)
	buildTabs()
end

-- Cheap fingerprint of index progress so the grid only rebuilds when something new was found.
local function progressKey(data: any): string
	local variants = 0
	for _, entry in data.index do
		for _ in entry do
			variants += 1
		end
	end
	local divers = 0
	for _ in data.diverIndex do
		divers += 1
	end
	return ":" .. variants .. ":" .. divers .. ":" .. data.rebirths
end

function Panel.refresh()
	local data = State.data()
	if not data then
		return
	end
	local found, total, variants, totalVariants = Formulas.indexProgress(data.index)
	local complete = Formulas.indexZonesComplete(data.index)
	header.Text = ("Treasures %d/%d • Variants %d/%d • Pages complete %d (+%d%% income)"):format(
		found,
		total,
		variants,
		totalVariants,
		complete,
		math.floor(complete * GameConfig.IndexZoneBonus * 100 + 0.5)
	)

	local key = selected .. progressKey(data)
	if key == lastKey then
		return
	end
	lastKey = key
	Kit.clear(grid)

	if selected == "Divers" then
		for order, diver in Divers.List do
			local owned = data.diverIndex[diver.id] == true
			tile(order, diver.name, diver.tier, owned, ModelFactory.diver(diver.id))
		end
		return
	end

	local zone = Zones.ById[selected]
	if data.rebirths < zone.rebirthReq and zone.secret then
		local message = Kit.text({
			Text = ("Something is down there... Reach Rebirth %d to find out."):format(zone.rebirthReq),
			Size = UDim2.new(1, -20, 0, 40),
			TextColor3 = Theme.SubText,
			MaxTextSize = 22,
			Parent = grid,
		})
		message.LayoutOrder = 0
		return
	end
	for _, treasure in Treasures.ByZone[selected] do
		local entry = data.index[treasure.id]
		local dots = {}
		for index, condition in Conditions.List do
			dots[index] = if entry and entry[condition.id] then condition.color else nil
		end
		tile(
			treasure.order or 0,
			treasure.name,
			treasure.rarity,
			entry ~= nil,
			ModelFactory.treasure(treasure.id),
			dots
		)
	end
end

function Panel.onClose() end

return Panel
