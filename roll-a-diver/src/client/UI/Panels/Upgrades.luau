--[[
	Upgrades panel: dive slots, pedestals, luck and oxygen (dive speed).
]]

local Shared = game:GetService("ReplicatedStorage").Shared
local Formulas = require(Shared.Formulas)
local Format = require(Shared.Util.Format)
local Upgrades = require(Shared.Config.Upgrades)

local UI = script.Parent.Parent
local Kit = require(UI.Kit)
local Theme = require(UI.Theme)
local Client = UI.Parent
local State = require(Client.State)
local Net = require(Client.Net)

local Panel = {
	title = "⬆ Upgrades",
	color = Theme.Green,
}

type Row = { level: TextLabel, button: TextButton }
local rows: { [string]: Row } = {}

local ICONS = { DiveSlots = "🤿", Pedestals = "🏛", Luck = "🍀", Oxygen = "🫧" }

function Panel.build(content: Frame)
	local list = Kit.list(content, 10)
	for _, upgrade in Upgrades.List do
		local row = Kit.new("Frame", {
			Size = UDim2.new(1, -12, 0, 86),
			BackgroundColor3 = Theme.Card,
			LayoutOrder = upgrade.order,
			Parent = list,
		}, { Kit.corner(12), Kit.stroke(3) })
		Kit.text({
			Text = (ICONS[upgrade.id] or "") .. " " .. upgrade.name,
			Position = UDim2.fromOffset(14, 8),
			Size = UDim2.new(0.55, 0, 0, 34),
			TextXAlignment = Enum.TextXAlignment.Left,
			MaxTextSize = 28,
			Parent = row,
		})
		Kit.text({
			Text = upgrade.description,
			Position = UDim2.fromOffset(14, 46),
			Size = UDim2.new(0.55, 0, 0, 24),
			TextXAlignment = Enum.TextXAlignment.Left,
			TextColor3 = Theme.SubText,
			MaxTextSize = 20,
			Parent = row,
		})
		local level = Kit.text({
			Text = "",
			AnchorPoint = Vector2.new(1, 0.5),
			Position = UDim2.new(1, -200, 0.5, 0),
			Size = UDim2.fromOffset(110, 30),
			TextColor3 = Theme.Gold,
			MaxTextSize = 24,
			Parent = row,
		})
		local button = Kit.button({
			Text = "",
			Color = Theme.Green,
			AnchorPoint = Vector2.new(1, 0.5),
			Position = UDim2.new(1, -12, 0.5, 0),
			Size = UDim2.fromOffset(170, 52),
			Parent = row,
			OnClick = function()
				Net.try("BuyUpgrade", upgrade.id)
			end,
		})
		rows[upgrade.id] = { level = level, button = button }
	end
end

function Panel.refresh()
	local data = State.data()
	if not data then
		return
	end
	local cash = State.cash()
	for id, row in rows do
		local upgrade = Upgrades.ById[id]
		local level = data.upgrades[id] or 0
		row.level.Text = ("Lv %d/%d"):format(level, upgrade.maxLevel)
		local cost = Formulas.upgradeCost(id, level)
		if cost then
			Kit.setButton(row.button, Format.money(cost), if cash >= cost then Theme.Green else Theme.Grey)
		else
			Kit.setButton(row.button, "MAX", Theme.Gold)
		end
	end
end

function Panel.onClose() end

return Panel
