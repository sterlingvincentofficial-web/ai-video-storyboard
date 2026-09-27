--[[
	Rebirth panel: cost, progress, what you gain and what you keep.
]]

local TweenService = game:GetService("TweenService")

local Shared = game:GetService("ReplicatedStorage").Shared
local Formulas = require(Shared.Formulas)
local Format = require(Shared.Util.Format)
local Zones = require(Shared.Config.Zones)

local UI = script.Parent.Parent
local Kit = require(UI.Kit)
local Theme = require(UI.Theme)
local Client = UI.Parent
local State = require(Client.State)
local Net = require(Client.Net)

local Panel = {
	title = "♻ Rebirth",
	color = Theme.Gold,
}

local current: TextLabel
local gain: TextLabel
local unlock: TextLabel
local costLabel: TextLabel
local fill: Frame
local button: TextButton

function Panel.build(content: Frame)
	current = Kit.text({
		Text = "",
		Position = UDim2.fromScale(0.05, 0.02),
		Size = UDim2.fromScale(0.9, 0.1),
		TextColor3 = Theme.Gold,
		MaxTextSize = 34,
		Parent = content,
	})
	gain = Kit.text({
		Text = "",
		Position = UDim2.fromScale(0.05, 0.14),
		Size = UDim2.fromScale(0.9, 0.08),
		TextColor3 = Theme.Money,
		MaxTextSize = 26,
		Parent = content,
	})
	unlock = Kit.text({
		Text = "",
		Position = UDim2.fromScale(0.05, 0.23),
		Size = UDim2.fromScale(0.9, 0.08),
		TextColor3 = Theme.Cyan,
		MaxTextSize = 24,
		Parent = content,
	})
	Kit.text({
		Text = "Resets: cash, divers, treasures and chests",
		Position = UDim2.fromScale(0.05, 0.34),
		Size = UDim2.fromScale(0.9, 0.06),
		TextColor3 = Theme.Red,
		MaxTextSize = 20,
		Parent = content,
	})
	Kit.text({
		Text = "Keeps: upgrades, Index, gamepasses and Divine & Secret divers",
		Position = UDim2.fromScale(0.05, 0.41),
		Size = UDim2.fromScale(0.9, 0.06),
		TextColor3 = Theme.SubText,
		MaxTextSize = 20,
		Parent = content,
	})
	local bar = Kit.new("Frame", {
		Position = UDim2.fromScale(0.1, 0.52),
		Size = UDim2.fromScale(0.8, 0.08),
		BackgroundColor3 = Theme.PanelDark,
		Parent = content,
	}, { Kit.corner(12), Kit.stroke(3) })
	fill = Kit.new("Frame", {
		Size = UDim2.fromScale(0, 1),
		BackgroundColor3 = Theme.Gold,
		Parent = bar,
	}, { Kit.corner(12) })
	costLabel = Kit.text({
		Text = "",
		Size = UDim2.fromScale(1, 1),
		MaxTextSize = 22,
		ZIndex = 3,
		Parent = bar,
	})
	button = Kit.button({
		Text = "REBIRTH",
		Color = Theme.Gold,
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.fromScale(0.5, 0.68),
		Size = UDim2.fromOffset(260, 64),
		Parent = content,
		OnClick = function()
			local response = Net.try("Rebirth")
			if response.ok then
				Panel.refresh()
			end
		end,
	})
end

function Panel.refresh()
	local data = State.data()
	if not data then
		return
	end
	local rebirths = data.rebirths
	local cost = Formulas.rebirthCost(rebirths)
	local cash = State.cash()
	current.Text = ("Rebirth %d"):format(rebirths)
	gain.Text = ("Income x%s  →  x%s"):format(
		tostring(Formulas.rebirthMultiplier(rebirths)),
		tostring(Formulas.rebirthMultiplier(rebirths + 1))
	)
	local nowZone = Formulas.unlockedZoneIndex(rebirths)
	local nextZone = Formulas.unlockedZoneIndex(rebirths + 1)
	if nextZone > nowZone then
		local zone = Zones.List[nextZone]
		unlock.Text = "Unlocks a new depth: " .. (if zone.secret then "???" else zone.name)
	else
		local upcoming = nil
		for _, zone in Zones.List do
			if zone.rebirthReq > rebirths + 1 then
				upcoming = zone
				break
			end
		end
		unlock.Text = if upcoming
			then ("Next new zone at Rebirth %d"):format(upcoming.rebirthReq)
			else "Every zone unlocked!"
	end
	local progress = math.clamp(cash / cost, 0, 1)
	TweenService:Create(fill, TweenInfo.new(0.3), { Size = UDim2.fromScale(progress, 1) }):Play()
	costLabel.Text = Format.money(cash) .. " / " .. Format.money(cost)
	Kit.setButton(
		button,
		if progress >= 1 then "REBIRTH!" else "Need " .. Format.money(cost - cash),
		if progress >= 1 then Theme.Gold else Theme.Grey
	)
end

function Panel.onClose() end

return Panel
