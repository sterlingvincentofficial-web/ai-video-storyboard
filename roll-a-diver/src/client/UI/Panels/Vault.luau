--[[
	Vault panel: every treasure the player owns, with Place / Remove / Sell, Equip Best and Sell Unplaced.
]]

local Shared = game:GetService("ReplicatedStorage").Shared
local Formulas = require(Shared.Formulas)
local Format = require(Shared.Util.Format)
local ModelFactory = require(Shared.ModelFactory)
local GameConfig = require(Shared.Config.Game)
local Treasures = require(Shared.Config.Treasures)
local Conditions = require(Shared.Config.Conditions)
local Rarities = require(Shared.Config.Rarities)
local Sets = require(Shared.Config.Sets)

local UI = script.Parent.Parent
local Kit = require(UI.Kit)
local Theme = require(UI.Theme)
local Client = UI.Parent
local State = require(Client.State)
local Net = require(Client.Net)

local Panel = {
	title = "💎 Vault",
	color = Theme.Purple,
}

local header: TextLabel
local grid: ScrollingFrame
local lastKey = ""

local function pedestalOf(data, uid: string): number?
	for key, value in data.pedestals do
		if value == uid then
			return tonumber(key)
		end
	end
	return nil
end

function Panel.build(content: Frame)
	local top = Kit.new("Frame", { Size = UDim2.new(1, 0, 0, 44), BackgroundTransparency = 1, Parent = content })
	header = Kit.text({
		Text = "",
		Size = UDim2.new(0.5, 0, 1, 0),
		TextXAlignment = Enum.TextXAlignment.Left,
		MaxTextSize = 22,
		Parent = top,
	})
	Kit.button({
		Text = "Equip Best",
		Color = Theme.Green,
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.new(1, -170, 0, 2),
		Size = UDim2.fromOffset(150, 40),
		Parent = top,
		OnClick = function()
			Net.try("EquipBestTreasures")
		end,
	})
	Kit.button({
		Text = "Sell Unplaced",
		Color = Theme.Red,
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.new(1, 0, 0, 2),
		Size = UDim2.fromOffset(160, 40),
		Parent = top,
		OnClick = function()
			Net.try("SellUnplacedTreasures")
		end,
	})
	local body = Kit.new("Frame", {
		Position = UDim2.fromOffset(0, 50),
		Size = UDim2.new(1, 0, 1, -50),
		BackgroundTransparency = 1,
		Parent = content,
	})
	grid = Kit.grid(body, UDim2.fromOffset(150, 210), 8)
end

local function card(uid: string, item: { id: string, c: string }, pedestal: number?, order: number)
	local treasure = Treasures.ById[item.id]
	local rarity = Rarities.ById[treasure.rarity]
	local condition = Conditions.ById[item.c]
	local frame = Kit.new("Frame", {
		BackgroundColor3 = if pedestal then Theme.Card else Theme.CardDark,
		LayoutOrder = order,
		Parent = grid,
	}, { Kit.corner(12), Kit.stroke(3, rarity.color) })
	local holder = Kit.new("Frame", {
		BackgroundTransparency = 1,
		Position = UDim2.fromOffset(25, 4),
		Size = UDim2.new(1, -50, 0, 80),
		Parent = frame,
	})
	Kit.viewport(holder, ModelFactory.treasure(item.id, item.c))
	local name = Kit.text({
		Text = treasure.name,
		Position = UDim2.fromOffset(6, 86),
		Size = UDim2.new(1, -12, 0, 22),
		TextColor3 = rarity.color,
		MaxTextSize = 18,
		Parent = frame,
	})
	if rarity.rainbow then
		name.TextColor3 = Color3.new(1, 1, 1)
		Kit.rainbow(name)
	end
	local conditionText = if condition and condition.id ~= Conditions.Default
		then condition.name .. " " .. Format.multiplier(condition.mult)
		else treasure.rarity
	Kit.text({
		Text = conditionText,
		Position = UDim2.fromOffset(6, 108),
		Size = UDim2.new(1, -12, 0, 18),
		TextColor3 = if condition and condition.id ~= Conditions.Default then condition.color else Theme.SubText,
		MaxTextSize = 16,
		Parent = frame,
	})
	local setText = if treasure.set then "Set: " .. Sets.ById[treasure.set].name else ""
	Kit.text({
		Text = Format.perSecond(Formulas.treasureIncome(item.id, item.c))
			.. (if setText ~= "" then "\n" .. setText else ""),
		Position = UDim2.fromOffset(6, 126),
		Size = UDim2.new(1, -12, 0, 36),
		TextColor3 = Theme.Money,
		TextWrapped = true,
		MaxTextSize = 16,
		Parent = frame,
	})
	Kit.button({
		Text = if pedestal then "Remove" else "Place",
		Color = if pedestal then Theme.Grey else Theme.Green,
		Position = UDim2.new(0, 6, 1, -40),
		Size = UDim2.new(0.5, -9, 0, 34),
		Parent = frame,
		OnClick = function()
			if pedestal then
				Net.try("RemoveTreasure", uid)
			else
				Net.try("PlaceTreasure", uid)
			end
		end,
	})
	Kit.button({
		Text = "Sell",
		Color = Theme.Red,
		Position = UDim2.new(0.5, 3, 1, -40),
		Size = UDim2.new(0.5, -9, 0, 34),
		Parent = frame,
		OnClick = function()
			Net.try("SellTreasure", uid)
		end,
	})
end

function Panel.refresh()
	local data = State.data()
	if not data then
		return
	end
	local uids = {}
	for uid in data.treasures do
		table.insert(uids, uid)
	end
	local placed = 0
	for _ in data.pedestals do
		placed += 1
	end
	header.Text = ("Treasures %d/%d • Pedestals %d/%d • %s"):format(
		#uids,
		GameConfig.MaxTreasures,
		placed,
		State.get("pedestalCount") or 0,
		Format.perSecond(State.get("income") or 0)
	)
	local function value(uid: string): number
		local item = data.treasures[uid]
		return Formulas.treasureIncome(item.id, item.c)
	end
	table.sort(uids, function(a, b)
		local placedA, placedB = pedestalOf(data, a) ~= nil, pedestalOf(data, b) ~= nil
		if placedA ~= placedB then
			return placedA
		end
		local va, vb = value(a), value(b)
		if va == vb then
			return a < b
		end
		return va > vb
	end)
	local parts = {}
	for _, uid in uids do
		table.insert(parts, uid .. ":" .. tostring(pedestalOf(data, uid)))
	end
	local key = table.concat(parts, ",")
	if key == lastKey then
		return
	end
	lastKey = key
	Kit.clear(grid)
	for order, uid in uids do
		card(uid, data.treasures[uid], pedestalOf(data, uid), order)
	end
end

function Panel.onClose() end

return Panel
