--[[
	Divers panel: every owned diver with Place / Remove / Sell, plus Equip Best and Sell Spare.
]]

local Shared = game:GetService("ReplicatedStorage").Shared
local Formulas = require(Shared.Formulas)
local Format = require(Shared.Util.Format)
local ModelFactory = require(Shared.ModelFactory)
local GameConfig = require(Shared.Config.Game)
local Divers = require(Shared.Config.Divers)
local Rarities = require(Shared.Config.Rarities)

local UI = script.Parent.Parent
local Kit = require(UI.Kit)
local Theme = require(UI.Theme)
local Notifications = require(UI.Notifications)
local Client = UI.Parent
local State = require(Client.State)
local Net = require(Client.Net)

local Panel = {
	title = "🤿 Divers",
	color = Theme.Cyan,
}

local header: TextLabel
local grid: ScrollingFrame
local lastKey = ""

local function slotOf(data, uid: string): number?
	for key, value in data.slots do
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
		Size = UDim2.new(0.45, 0, 1, 0),
		TextXAlignment = Enum.TextXAlignment.Left,
		MaxTextSize = 24,
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
			Net.try("EquipBestDivers")
		end,
	})
	Kit.button({
		Text = "Sell Spare ≤ Rare",
		Color = Theme.Red,
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.new(1, 0, 0, 2),
		Size = UDim2.fromOffset(160, 40),
		Parent = top,
		OnClick = function()
			local response = Net.try("SellUnplacedDivers", Rarities.ById.Rare.rank)
			if response.ok then
				Notifications.toast(
					if response.sold > 0
						then ("Sold %d divers for %s"):format(response.sold, Format.money(response.total))
						else "No spare divers to sell",
					"Info"
				)
			end
		end,
	})
	local body = Kit.new("Frame", {
		Position = UDim2.fromOffset(0, 50),
		Size = UDim2.new(1, 0, 1, -50),
		BackgroundTransparency = 1,
		Parent = content,
	})
	grid = Kit.grid(body, UDim2.fromOffset(160, 230), 8)
end

local function card(uid: string, diverId: string, slot: number?, order: number)
	local diver = Divers.ById[diverId]
	local rarity = Rarities.ById[diver.tier]
	local frame = Kit.new("Frame", {
		BackgroundColor3 = if slot then Theme.Card else Theme.CardDark,
		LayoutOrder = order,
		Parent = grid,
	}, { Kit.corner(12), Kit.stroke(3, rarity.color) })
	local holder = Kit.new("Frame", {
		BackgroundTransparency = 1,
		Position = UDim2.fromOffset(20, 4),
		Size = UDim2.new(1, -40, 0, 92),
		Parent = frame,
	})
	Kit.viewport(holder, ModelFactory.diver(diverId))
	local name = Kit.text({
		Text = diver.name,
		Position = UDim2.fromOffset(6, 98),
		Size = UDim2.new(1, -12, 0, 22),
		TextColor3 = rarity.color,
		MaxTextSize = 20,
		Parent = frame,
	})
	if rarity.rainbow then
		name.TextColor3 = Color3.new(1, 1, 1)
		Kit.rainbow(name)
	end
	Kit.text({
		Text = ("%s • %s luck"):format(diver.tier, Format.multiplier(diver.luck)),
		Position = UDim2.fromOffset(6, 120),
		Size = UDim2.new(1, -12, 0, 17),
		TextColor3 = Theme.SubText,
		MaxTextSize = 15,
		Parent = frame,
	})
	Kit.text({
		Text = ("%s • %s speed"):format(
			Format.depth(math.min(diver.maxDepth, 11000)),
			Format.multiplier(diver.speed)
		),
		Position = UDim2.fromOffset(6, 137),
		Size = UDim2.new(1, -12, 0, 17),
		TextColor3 = Theme.SubText,
		MaxTextSize = 15,
		Parent = frame,
	})
	local ability = if diver.ability then Divers.Abilities[diver.ability] else (if slot then "On your dock" else "")
	Kit.text({
		Text = ability,
		Position = UDim2.fromOffset(6, 154),
		Size = UDim2.new(1, -12, 0, 28),
		TextColor3 = if diver.ability then Theme.Gold else Theme.Money,
		TextWrapped = true,
		MaxTextSize = 13,
		Parent = frame,
	})
	Kit.button({
		Text = if slot then "Remove" else "Place",
		Color = if slot then Theme.Grey else Theme.Green,
		Position = UDim2.new(0, 6, 1, -40),
		Size = UDim2.new(0.5, -9, 0, 34),
		Parent = frame,
		OnClick = function()
			if slot then
				Net.try("RemoveDiver", uid)
			else
				Net.try("PlaceDiver", uid)
			end
		end,
	})
	Kit.button({
		Text = "Sell " .. Format.money(Formulas.diverSellValue(diverId)),
		Color = Theme.Red,
		Position = UDim2.new(0.5, 3, 1, -40),
		Size = UDim2.new(0.5, -9, 0, 34),
		Parent = frame,
		OnClick = function()
			Net.try("SellDiver", uid)
		end,
	})
end

function Panel.refresh()
	local data = State.data()
	if not data then
		return
	end
	local count = 0
	local uids = {}
	for uid in data.divers do
		count += 1
		table.insert(uids, uid)
	end
	local placed = 0
	for _ in data.slots do
		placed += 1
	end
	header.Text = ("Divers %d/%d • Dock %d/%d"):format(
		count,
		GameConfig.MaxDivers,
		placed,
		State.get("slotCount") or 0
	)

	table.sort(uids, function(a, b)
		local slotA, slotB = slotOf(data, a), slotOf(data, b)
		if (slotA ~= nil) ~= (slotB ~= nil) then
			return slotA ~= nil
		end
		local scoreA, scoreB = Formulas.diverScore(data.divers[a]), Formulas.diverScore(data.divers[b])
		if scoreA == scoreB then
			return a < b
		end
		return scoreA > scoreB
	end)

	-- only rebuild the cards when the list actually changed
	local parts = {}
	for _, uid in uids do
		table.insert(parts, uid .. ":" .. tostring(slotOf(data, uid)))
	end
	local key = table.concat(parts, ",")
	if key == lastKey then
		return
	end
	lastKey = key
	Kit.clear(grid)
	for order, uid in uids do
		card(uid, data.divers[uid], slotOf(data, uid), order)
	end
end

function Panel.onClose() end

return Panel
