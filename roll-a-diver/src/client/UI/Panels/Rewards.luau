--[[
	Rewards panel: 7-day login calendar, spin wheel, code redemption and the group reward.
]]

local RunService = game:GetService("RunService")

local Shared = game:GetService("ReplicatedStorage").Shared
local Formulas = require(Shared.Formulas)
local Format = require(Shared.Util.Format)
local Rewards = require(Shared.Config.Rewards)

local UI = script.Parent.Parent
local Kit = require(UI.Kit)
local Theme = require(UI.Theme)
local Notifications = require(UI.Notifications)
local Client = UI.Parent
local State = require(Client.State)
local Net = require(Client.Net)
local Sounds = require(Client.Sounds)

local Panel = {
	title = "🎁 Rewards",
	color = Theme.Purple,
}

local dayCells: { Frame } = {}
local claimButton: TextButton
local spinButton: TextButton
local spinInfo: TextLabel
local wheel: Frame
local codeBox: TextBox
local groupButton: TextButton
local spinning = false

local function describe(reward: Rewards.Reward): string
	local parts = {}
	if reward.cash then
		table.insert(parts, Format.money(reward.cash))
	end
	if reward.incomeMinutes then
		table.insert(parts, reward.incomeMinutes .. "m cash")
	end
	if reward.chests then
		table.insert(parts, reward.chests .. " chests")
	end
	if reward.spins then
		table.insert(parts, reward.spins .. " spins")
	end
	if reward.potionMinutes then
		table.insert(parts, "Luck " .. reward.potionMinutes .. "m")
	end
	return table.concat(parts, "\n")
end

local function section(parent: Instance, title: string, position: UDim2, size: UDim2): Frame
	local frame = Kit.new("Frame", {
		Position = position,
		Size = size,
		BackgroundColor3 = Theme.CardDark,
		Parent = parent,
	}, { Kit.corner(12), Kit.stroke(2) })
	Kit.text({
		Text = title,
		Position = UDim2.fromOffset(10, 6),
		Size = UDim2.new(1, -20, 0, 26),
		TextXAlignment = Enum.TextXAlignment.Left,
		TextColor3 = Theme.Gold,
		MaxTextSize = 24,
		Parent = frame,
	})
	return frame
end

local function spinTo(index: number)
	-- the pointer is at the top; rotate so the chosen segment ends under it
	local count = #Rewards.Wheel
	local slice = 360 / count
	local target = 360 * 5 + (360 - (index - 1) * slice)
	local start = wheel.Rotation % 360
	local started = os.clock()
	local duration = 3
	while os.clock() - started < duration do
		local t = (os.clock() - started) / duration
		local eased = 1 - (1 - t) ^ 3
		wheel.Rotation = start + (target - start) * eased
		RunService.RenderStepped:Wait()
	end
	wheel.Rotation = target % 360
end

local function doSpin()
	if spinning then
		return
	end
	spinning = true
	local response = Net.try("Spin")
	if response.ok then
		spinTo(response.index)
		Sounds.play("Reveal", 0.6, 1.1)
		local segment = Rewards.Wheel[response.index]
		Notifications.toast("Wheel: " .. segment.label .. "! " .. (response.text or ""), "Success")
	end
	spinning = false
	Panel.refresh()
end

function Panel.build(content: Frame)
	-- daily calendar
	local daily = section(content, "📅 Daily Rewards", UDim2.fromScale(0, 0), UDim2.new(1, 0, 0.36, -6))
	local row = Kit.new("Frame", {
		Position = UDim2.fromOffset(10, 36),
		Size = UDim2.new(1, -170, 1, -44),
		BackgroundTransparency = 1,
		Parent = daily,
	})
	Kit.new("UIListLayout", {
		FillDirection = Enum.FillDirection.Horizontal,
		Padding = UDim.new(0, 6),
		SortOrder = Enum.SortOrder.LayoutOrder,
		Parent = row,
	})
	for day, reward in Rewards.Daily do
		local cell = Kit.new("Frame", {
			Size = UDim2.new(1 / #Rewards.Daily, -6, 1, 0),
			BackgroundColor3 = Theme.Card,
			LayoutOrder = day,
			Parent = row,
		}, { Kit.corner(10), Kit.stroke(2) })
		Kit.text({
			Name = "Day",
			Text = "Day " .. day,
			Position = UDim2.fromScale(0.05, 0.02),
			Size = UDim2.fromScale(0.9, 0.24),
			MaxTextSize = 18,
			Parent = cell,
		})
		Kit.text({
			Text = describe(reward),
			Position = UDim2.fromScale(0.05, 0.3),
			Size = UDim2.fromScale(0.9, 0.66),
			TextColor3 = Theme.SubText,
			TextWrapped = true,
			MaxTextSize = 14,
			Parent = cell,
		})
		dayCells[day] = cell
	end
	claimButton = Kit.button({
		Text = "CLAIM",
		Color = Theme.Green,
		AnchorPoint = Vector2.new(1, 0.5),
		Position = UDim2.new(1, -10, 0.58, 0),
		Size = UDim2.fromOffset(140, 56),
		Parent = daily,
		OnClick = function()
			local response = Net.try("ClaimDaily")
			if response.ok then
				Sounds.play("Coin", 0.6)
				Notifications.toast(("Day %d reward: %s"):format(response.day, response.text or ""), "Success")
			end
			Panel.refresh()
		end,
	})

	-- spin wheel
	local spin = section(content, "🎡 Spin Wheel", UDim2.fromScale(0, 0.36), UDim2.new(0.55, -6, 0.64, 0))
	local wheelHolder = Kit.new("Frame", {
		AnchorPoint = Vector2.new(0, 0.5),
		Position = UDim2.new(0, 14, 0.56, 0),
		Size = UDim2.fromScale(0.5, 0.78),
		BackgroundTransparency = 1,
		Parent = spin,
	})
	Kit.new("UIAspectRatioConstraint", { AspectRatio = 1, Parent = wheelHolder })
	wheel = Kit.new("Frame", {
		Size = UDim2.fromScale(1, 1),
		BackgroundColor3 = Theme.Panel,
		Parent = wheelHolder,
	}, { Kit.corner(999), Kit.stroke(4, Theme.Gold) })
	local count = #Rewards.Wheel
	for index, segment in Rewards.Wheel do
		local angle = math.rad((index - 1) * 360 / count)
		local x, y = 0.5 + math.sin(angle) * 0.33, 0.5 - math.cos(angle) * 0.33
		local label = Kit.text({
			Text = segment.label,
			AnchorPoint = Vector2.new(0.5, 0.5),
			Position = UDim2.fromScale(x, y),
			Size = UDim2.fromScale(0.34, 0.16),
			Rotation = (index - 1) * 360 / count,
			BackgroundTransparency = 0,
			BackgroundColor3 = segment.color,
			MaxTextSize = 16,
			Parent = wheel,
		})
		Kit.corner(8).Parent = label
	end
	Kit.text({
		Text = "▼",
		AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.fromScale(0.5, 0.06),
		Size = UDim2.fromScale(0.16, 0.14),
		TextColor3 = Theme.Red,
		MaxTextSize = 34,
		ZIndex = 3,
		Parent = wheelHolder,
	})
	spinButton = Kit.button({
		Text = "SPIN",
		Color = Theme.Orange,
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.new(1, -12, 0.3, 0),
		Size = UDim2.new(0.42, 0, 0, 56),
		Parent = spin,
		OnClick = function()
			task.spawn(doSpin)
		end,
	})
	spinInfo = Kit.text({
		Text = "",
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.new(1, -12, 0.3, 64),
		Size = UDim2.new(0.42, 0, 0, 44),
		TextColor3 = Theme.SubText,
		TextWrapped = true,
		MaxTextSize = 18,
		Parent = spin,
	})

	-- odds are always shown (required for random rewards that can be bought with Robux)
	local totalWeight = 0
	for _, segment in Rewards.Wheel do
		totalWeight += segment.weight
	end
	local oddsLines = {}
	for _, segment in Rewards.Wheel do
		local percent = segment.weight / totalWeight * 100
		table.insert(
			oddsLines,
			("%s %s%%"):format(
				segment.label,
				if percent < 1 then string.format("%.1f", percent) else tostring(math.floor(percent + 0.5))
			)
		)
	end
	Kit.text({
		Name = "Odds",
		Text = "Odds: " .. table.concat(oddsLines, " • "),
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.new(1, -12, 0.3, 112),
		Size = UDim2.new(0.42, 0, 0.7, -120),
		TextColor3 = Theme.SubText,
		TextWrapped = true,
		TextYAlignment = Enum.TextYAlignment.Top,
		MaxTextSize = 13,
		Parent = spin,
	})

	-- codes
	local codes = section(content, "🔑 Codes", UDim2.new(0.55, 6, 0.36, 0), UDim2.new(0.45, -6, 0.3, -6))
	codeBox = Kit.new("TextBox", {
		Position = UDim2.new(0, 10, 0, 40),
		Size = UDim2.new(0.62, -10, 0, 42),
		BackgroundColor3 = Theme.Panel,
		PlaceholderText = "Enter code",
		PlaceholderColor3 = Theme.SubText,
		Text = "",
		TextColor3 = Theme.Text,
		Font = Theme.Font,
		TextScaled = true,
		ClearTextOnFocus = false,
		Parent = codes,
	}, { Kit.corner(8), Kit.stroke(2), Kit.new("UITextSizeConstraint", { MaxTextSize = 24 }) })
	Kit.button({
		Text = "REDEEM",
		Color = Theme.Green,
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.new(1, -10, 0, 40),
		Size = UDim2.new(0.38, -10, 0, 42),
		Parent = codes,
		OnClick = function()
			local response = Net.try("RedeemCode", codeBox.Text)
			if response.ok then
				Sounds.play("Coin", 0.6)
				Notifications.toast("Code redeemed! " .. (response.text or ""), "Success")
				codeBox.Text = ""
			end
		end,
	})

	-- group
	local group = section(content, "👥 Group Bonus", UDim2.new(0.55, 6, 0.66, 0), UDim2.new(0.45, -6, 0.34, 0))
	Kit.text({
		Text = ("Join our group for +%d%% luck forever!"):format(math.floor(Rewards.GroupLuckBonus * 100)),
		Position = UDim2.fromOffset(10, 36),
		Size = UDim2.new(1, -20, 0, 26),
		TextColor3 = Theme.SubText,
		MaxTextSize = 18,
		Parent = group,
	})
	groupButton = Kit.button({
		Text = "CLAIM",
		Color = Theme.Blue,
		Position = UDim2.new(0, 10, 0, 70),
		Size = UDim2.new(1, -20, 0, 42),
		Parent = group,
		OnClick = function()
			local response = Net.try("ClaimGroup")
			if response.ok then
				Notifications.toast(response.text or "Group bonus active!", "Success")
			end
			Panel.refresh()
		end,
	})
end

function Panel.refresh()
	local data = State.data()
	if not data then
		return
	end
	local today = Formulas.dayNumber(State.osTime())
	local canClaim, nextStreak = Formulas.dailyStreak(data.daily.lastDay, data.daily.streak, today)
	local current = if canClaim then nextStreak else data.daily.streak
	for day, cell in dayCells do
		local claimed = if canClaim then day < nextStreak else day <= current
		cell.BackgroundColor3 = if day == current and canClaim
			then Theme.Gold
			elseif claimed then Theme.Green
			else Theme.Card
	end
	Kit.setButton(claimButton, if canClaim then "CLAIM" else "Tomorrow!", if canClaim then Theme.Green else Theme.Grey)

	local wait = Formulas.freeSpinWait(data.spins.lastFree, State.osTime())
	local total = data.spins.extra + (if wait == 0 then 1 else 0)
	spinInfo.Text = if wait == 0
		then ("Free spin ready! (+%d extra)"):format(data.spins.extra)
		else ("%d spins • free in %s"):format(data.spins.extra, Format.duration(wait))
	Kit.setButton(spinButton, if total > 0 then "SPIN" else "No spins", if total > 0 then Theme.Orange else Theme.Grey)

	if Rewards.GroupId == 0 then
		Kit.setButton(groupButton, "Coming soon", Theme.Grey)
	elseif data.groupClaimed then
		Kit.setButton(groupButton, "Bonus active ✓", Theme.Green)
	else
		Kit.setButton(groupButton, "CLAIM", Theme.Blue)
	end
end

-- Whether something on this panel is ready to claim (for the menu badge).
function Panel.hasClaimable(): boolean
	local data = State.data()
	if not data then
		return false
	end
	local canClaim = Formulas.dailyStreak(data.daily.lastDay, data.daily.streak, Formulas.dayNumber(State.osTime()))
	return canClaim or Formulas.freeSpinWait(data.spins.lastFree, State.osTime()) == 0 or data.spins.extra > 0
end

function Panel.onClose() end

return Panel
