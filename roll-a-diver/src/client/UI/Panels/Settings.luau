--[[
	Settings panel: sound effects, low graphics and hiding other players' divers.
	Saved on the server so they follow the player between sessions.
]]

local UI = script.Parent.Parent
local Kit = require(UI.Kit)
local Theme = require(UI.Theme)
local Client = UI.Parent
local State = require(Client.State)
local Net = require(Client.Net)
local Settings = require(Client.Settings)

local Panel = {
	title = "⚙ Settings",
	color = Theme.Grey,
}

local OPTIONS = {
	{ key = "sfx", label = "Sound effects", description = "Clicks, coins and reveal sounds" },
	{ key = "lowGraphics", label = "Low graphics", description = "Fewer lights and particles for smoother play" },
	{ key = "hideOthers", label = "Hide other docks", description = "Only animate your own divers" },
}

local buttons: { [string]: TextButton } = {}

function Panel.build(content: Frame)
	local list = Kit.list(content, 10)
	for order, option in OPTIONS do
		local row = Kit.new("Frame", {
			Size = UDim2.new(1, -12, 0, 76),
			BackgroundColor3 = Theme.Card,
			LayoutOrder = order,
			Parent = list,
		}, { Kit.corner(12), Kit.stroke(2) })
		Kit.text({
			Text = option.label,
			Position = UDim2.fromOffset(14, 8),
			Size = UDim2.new(0.6, 0, 0, 30),
			TextXAlignment = Enum.TextXAlignment.Left,
			MaxTextSize = 26,
			Parent = row,
		})
		Kit.text({
			Text = option.description,
			Position = UDim2.fromOffset(14, 42),
			Size = UDim2.new(0.6, 0, 0, 22),
			TextXAlignment = Enum.TextXAlignment.Left,
			TextColor3 = Theme.SubText,
			MaxTextSize = 18,
			Parent = row,
		})
		buttons[option.key] = Kit.button({
			Text = "",
			AnchorPoint = Vector2.new(1, 0.5),
			Position = UDim2.new(1, -12, 0.5, 0),
			Size = UDim2.fromOffset(120, 46),
			Parent = row,
			OnClick = function()
				local current = Settings.get()
				current[option.key] = not current[option.key]
				Settings.apply(current)
				Panel.refresh()
				Net.try("SaveSettings", current)
			end,
		})
	end
end

function Panel.refresh()
	local current = Settings.get()
	for key, button in buttons do
		Kit.setButton(button, if current[key] then "ON" else "OFF", if current[key] then Theme.Green else Theme.Grey)
	end
	local _ = State
end

function Panel.onClose() end

return Panel
