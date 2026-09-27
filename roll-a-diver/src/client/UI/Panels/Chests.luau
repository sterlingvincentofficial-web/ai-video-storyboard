--[[
	Chests panel: sealed chests grouped by type with Open (reveal animation) and Open All.
]]

local Shared = game:GetService("ReplicatedStorage").Shared
local ModelFactory = require(Shared.ModelFactory)
local Zones = require(Shared.Config.Zones)

local UI = script.Parent.Parent
local Kit = require(UI.Kit)
local Theme = require(UI.Theme)
local Reveal = require(UI.Reveal)
local Client = UI.Parent
local State = require(Client.State)
local Net = require(Client.Net)

local Panel = {
	title = "📦 Chests",
	color = Theme.Orange,
}

local list: ScrollingFrame
local empty: TextLabel
local openAllButton: TextButton
local lastKey = ""
local busy = false

local function open(chestId: string)
	if busy then
		return
	end
	busy = true
	local response = Net.try("OpenChest", chestId)
	if response.ok then
		Reveal.chest(chestId, response.result)
	end
	busy = false
end

local function openAll(chestId: string?)
	if busy then
		return
	end
	busy = true
	local response = Net.try("OpenAllChests", chestId)
	if response.ok then
		Reveal.summary(response.results)
	end
	busy = false
end

function Panel.build(content: Frame)
	local top = Kit.new("Frame", { Size = UDim2.new(1, 0, 0, 44), BackgroundTransparency = 1, Parent = content })
	Kit.text({
		Text = "Divers bring chests up from the trench. Open them to find treasure!",
		Size = UDim2.new(1, -200, 1, 0),
		TextXAlignment = Enum.TextXAlignment.Left,
		TextColor3 = Theme.SubText,
		MaxTextSize = 18,
		Parent = top,
	})
	openAllButton = Kit.button({
		Text = "Open Everything",
		Color = Theme.Orange,
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.new(1, 0, 0, 2),
		Size = UDim2.fromOffset(190, 40),
		Parent = top,
		OnClick = function()
			task.spawn(openAll, nil)
		end,
	})
	local body = Kit.new("Frame", {
		Position = UDim2.fromOffset(0, 50),
		Size = UDim2.new(1, 0, 1, -50),
		BackgroundTransparency = 1,
		Parent = content,
	})
	list = Kit.list(body, 8)
	empty = Kit.text({
		Text = "No chests yet. Wait for your divers to surface!",
		Position = UDim2.fromScale(0.1, 0.4),
		Size = UDim2.fromScale(0.8, 0.12),
		TextColor3 = Theme.SubText,
		MaxTextSize = 24,
		Parent = body,
	})
end

function Panel.refresh()
	local data = State.data()
	if not data then
		return
	end
	local counts: { [string]: number } = {}
	local total = 0
	for _, content in data.chests do
		counts[content.c] = (counts[content.c] or 0) + 1
		total += 1
	end
	empty.Visible = total == 0
	openAllButton.Visible = total > 1
	local parts = {}
	for _, chest in Zones.Chests do
		table.insert(parts, tostring(counts[chest.id] or 0))
	end
	local key = table.concat(parts, ",")
	if key == lastKey then
		return
	end
	lastKey = key
	Kit.clear(list)
	for order, chest in Zones.Chests do
		local count = counts[chest.id]
		if count and count > 0 then
			local row = Kit.new("Frame", {
				Size = UDim2.new(1, -12, 0, 90),
				BackgroundColor3 = Theme.Card,
				LayoutOrder = order,
				Parent = list,
			}, { Kit.corner(12), Kit.stroke(3, chest.glow) })
			local holder = Kit.new("Frame", {
				BackgroundTransparency = 1,
				Position = UDim2.fromOffset(8, 5),
				Size = UDim2.fromOffset(80, 80),
				Parent = row,
			})
			Kit.viewport(holder, ModelFactory.chest(chest.id))
			Kit.text({
				Text = chest.name,
				Position = UDim2.fromOffset(100, 10),
				Size = UDim2.new(0.4, 0, 0, 34),
				TextXAlignment = Enum.TextXAlignment.Left,
				TextColor3 = chest.glow,
				MaxTextSize = 28,
				Parent = row,
			})
			Kit.text({
				Text = ("x%d  •  from the %s"):format(count, Zones.ById[chest.zone].name),
				Position = UDim2.fromOffset(100, 48),
				Size = UDim2.new(0.4, 0, 0, 26),
				TextXAlignment = Enum.TextXAlignment.Left,
				TextColor3 = Theme.SubText,
				MaxTextSize = 20,
				Parent = row,
			})
			Kit.button({
				Text = "Open",
				Color = Theme.Green,
				AnchorPoint = Vector2.new(1, 0.5),
				Position = UDim2.new(1, -150, 0.5, 0),
				Size = UDim2.fromOffset(120, 48),
				Parent = row,
				OnClick = function()
					task.spawn(open, chest.id)
				end,
			})
			Kit.button({
				Text = "Open All",
				Color = Theme.Orange,
				AnchorPoint = Vector2.new(1, 0.5),
				Position = UDim2.new(1, -12, 0.5, 0),
				Size = UDim2.fromOffset(130, 48),
				Parent = row,
				OnClick = function()
					task.spawn(openAll, chest.id)
				end,
			})
		end
	end
end

function Panel.onClose() end

return Panel
