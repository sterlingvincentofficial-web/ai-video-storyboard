--[[
	Builds the whole screen UI: HUD (cash, income, boosts, events, tutorial), left menu,
	quick-buy buttons on the right, and the panel window that hosts every menu panel.
]]

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")
local Workspace = game:GetService("Workspace")

local Shared = game:GetService("ReplicatedStorage").Shared
local Formulas = require(Shared.Formulas)
local Format = require(Shared.Util.Format)
local Remotes = require(Shared.Remotes)

local Kit = require(script.Parent.Kit)
local Theme = require(script.Parent.Theme)
local Notifications = require(script.Parent.Notifications)
local Reveal = require(script.Parent.Reveal)
local Panels = script.Parent.Panels
local Client = script.Parent.Parent
local State = require(Client.State)
local Net = require(Client.Net)
local Sounds = require(Client.Sounds)
local Settings = require(Client.Settings)

local App = {}

type PanelModule = {
	title: string,
	color: Color3,
	build: (Frame) -> (),
	refresh: () -> (),
	onClose: () -> (),
	Shop: any?,
}

local MENU = {
	{ id = "Roll", icon = "🎲", label = "Roll", color = Theme.Blue },
	{ id = "Divers", icon = "🤿", label = "Divers", color = Theme.Cyan },
	{ id = "Vault", icon = "💎", label = "Vault", color = Theme.Purple },
	{ id = "Chests", icon = "📦", label = "Chests", color = Theme.Orange },
	{ id = "Index", icon = "📖", label = "Index", color = Theme.Gold },
	{ id = "Upgrades", icon = "⬆", label = "Upgrade", color = Theme.Green },
	{ id = "Rebirth", icon = "♻", label = "Rebirth", color = Color3.fromRGB(255, 170, 40) },
	{ id = "Rewards", icon = "🎁", label = "Rewards", color = Color3.fromRGB(230, 90, 200) },
	{ id = "Top", icon = "🏆", label = "Top", color = Color3.fromRGB(220, 170, 40) },
	{ id = "Shop", icon = "🛒", label = "Shop", color = Theme.Red },
}

-- Panels opened from somewhere other than the side menu.
local EXTRA_PANELS = { "Settings" }

local panels: { [string]: PanelModule } = {}
local panelContent: { [string]: Frame } = {}
local openPanel: string? = nil
local window: Frame
local windowTitle: TextLabel
local windowBar: Frame
local badges: { [string]: TextLabel } = {}

local cashLabel: TextLabel
local incomeLabel: TextLabel
local boostRow: Frame
local tutorialLabel: TextLabel
local tutorialFrame: Frame
local quickButtons: { [string]: TextButton } = {}
local krakenBar: Frame
local krakenFill: Frame
local krakenText: TextLabel

-- Panel window ------------------------------------------------------------------------------

function App.open(id: string)
	if openPanel == id then
		App.close()
		return
	end
	if openPanel then
		panelContent[openPanel].Visible = false
		panels[openPanel].onClose()
	end
	openPanel = id
	local panel = panels[id]
	windowTitle.Text = panel.title
	windowBar.BackgroundColor3 = panel.color
	panelContent[id].Visible = true
	window.Visible = true
	local scale = window:FindFirstChildOfClass("UIScale") :: UIScale
	scale.Scale = 0.85
	TweenService:Create(scale, TweenInfo.new(0.2, Enum.EasingStyle.Back), { Scale = 1 }):Play()
	panel.refresh()
end

function App.close()
	if openPanel then
		panelContent[openPanel].Visible = false
		panels[openPanel].onClose()
	end
	openPanel = nil
	window.Visible = false
end

local function buildWindow(root: Frame)
	window = Kit.new("Frame", {
		Name = "Window",
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.52, 0.53),
		Size = UDim2.fromScale(0.66, 0.72),
		BackgroundColor3 = Theme.Panel,
		Visible = false,
		ZIndex = 10,
		Parent = root,
	}, { Kit.corner(18), Kit.stroke(4) })
	Kit.new("UISizeConstraint", { MaxSize = Vector2.new(980, 620), MinSize = Vector2.new(340, 300), Parent = window })
	Kit.new("UIScale", { Parent = window })
	windowBar = Kit.new("Frame", {
		Size = UDim2.new(1, 0, 0, 52),
		BackgroundColor3 = Theme.Blue,
		Parent = window,
	}, { Kit.corner(18) })
	-- square off the bottom of the title bar
	Kit.new("Frame", {
		Position = UDim2.new(0, 0, 1, -18),
		Size = UDim2.new(1, 0, 0, 18),
		BackgroundColor3 = Color3.new(1, 1, 1),
		BorderSizePixel = 0,
		Parent = windowBar,
	})
	windowBar:GetPropertyChangedSignal("BackgroundColor3"):Connect(function()
		for _, child in windowBar:GetChildren() do
			if child:IsA("Frame") then
				child.BackgroundColor3 = windowBar.BackgroundColor3
			end
		end
	end)
	windowTitle = Kit.text({
		Text = "",
		Position = UDim2.fromOffset(16, 6),
		Size = UDim2.new(1, -90, 0, 40),
		TextXAlignment = Enum.TextXAlignment.Left,
		MaxTextSize = 34,
		StrokeThickness = 3,
		ZIndex = 2,
		Parent = windowBar,
	})
	Kit.button({
		Text = "X",
		Color = Theme.Red,
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.new(1, -8, 0, 6),
		Size = UDim2.fromOffset(44, 40),
		ZIndex = 3,
		Parent = windowBar,
		OnClick = App.close,
	})

	local ids = {}
	for _, entry in MENU do
		table.insert(ids, entry.id)
	end
	for _, id in EXTRA_PANELS do
		table.insert(ids, id)
	end
	for _, id in ids do
		local entry = { id = id }
		local module = (require :: any)(Panels:WaitForChild(entry.id)) :: PanelModule
		panels[entry.id] = module
		local content = Kit.new("Frame", {
			Name = entry.id,
			Position = UDim2.fromOffset(14, 62),
			Size = UDim2.new(1, -28, 1, -76),
			BackgroundTransparency = 1,
			Visible = false,
			Parent = window,
		})
		panelContent[entry.id] = content
		module.build(content)
	end
end

-- HUD ----------------------------------------------------------------------------------------

local function buildMenu(root: Frame)
	local menu = Kit.new("Frame", {
		Name = "Menu",
		AnchorPoint = Vector2.new(0, 0.5),
		Position = UDim2.new(0, 10, 0.52, 0),
		Size = UDim2.fromOffset(160, 420),
		BackgroundTransparency = 1,
		Parent = root,
	})
	Kit.new("UIGridLayout", {
		CellSize = UDim2.fromOffset(74, 74),
		CellPadding = UDim2.fromOffset(8, 8),
		SortOrder = Enum.SortOrder.LayoutOrder,
		Parent = menu,
	})
	for order, entry in MENU do
		local button = Kit.new("TextButton", {
			BackgroundColor3 = entry.color,
			Text = "",
			LayoutOrder = order,
			Parent = menu,
		}, { Kit.corner(14), Kit.stroke(3) })
		Kit.text({
			Text = entry.icon,
			Position = UDim2.fromScale(0.1, 0.02),
			Size = UDim2.fromScale(0.8, 0.62),
			MaxTextSize = 40,
			Parent = button,
		})
		Kit.text({
			Text = entry.label,
			Position = UDim2.fromScale(0.02, 0.64),
			Size = UDim2.fromScale(0.96, 0.32),
			MaxTextSize = 18,
			Parent = button,
		})
		local badge = Kit.text({
			Text = "!",
			AnchorPoint = Vector2.new(0.5, 0.5),
			Position = UDim2.fromScale(0.92, 0.08),
			Size = UDim2.fromOffset(28, 28),
			BackgroundTransparency = 0,
			BackgroundColor3 = Theme.Red,
			MaxTextSize = 18,
			Visible = false,
			ZIndex = 3,
			Parent = button,
		})
		Kit.corner(14).Parent = badge
		badges[entry.id] = badge
		button.Activated:Connect(function()
			Sounds.play("Click", 0.3)
			App.open(entry.id)
		end)
	end
end

local function buildTopBar(root: Frame)
	local top = Kit.new("Frame", {
		Name = "Cash",
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 6),
		Size = UDim2.fromOffset(320, 84),
		BackgroundTransparency = 1,
		Parent = root,
	})
	local pill = Kit.new("Frame", {
		Size = UDim2.new(1, 0, 0, 52),
		BackgroundColor3 = Theme.PanelDark,
		BackgroundTransparency = 0.15,
		Parent = top,
	}, { Kit.corner(26), Kit.stroke(3) })
	cashLabel = Kit.text({
		Text = "$0",
		Position = UDim2.fromOffset(12, 4),
		Size = UDim2.new(1, -24, 1, -8),
		TextColor3 = Theme.Money,
		MaxTextSize = 42,
		StrokeThickness = 3,
		Parent = pill,
	})
	incomeLabel = Kit.text({
		Text = "",
		Position = UDim2.fromOffset(0, 54),
		Size = UDim2.new(1, 0, 0, 24),
		TextColor3 = Theme.Text,
		MaxTextSize = 22,
		Parent = top,
	})

	boostRow = Kit.new("Frame", {
		Name = "Boosts",
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 90),
		Size = UDim2.fromOffset(700, 30),
		BackgroundTransparency = 1,
		Parent = root,
	})
	Kit.new("UIListLayout", {
		FillDirection = Enum.FillDirection.Horizontal,
		HorizontalAlignment = Enum.HorizontalAlignment.Center,
		Padding = UDim.new(0, 8),
		Parent = boostRow,
	})

	tutorialFrame = Kit.new("Frame", {
		Name = "Tutorial",
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 124),
		Size = UDim2.fromOffset(560, 40),
		BackgroundColor3 = Theme.Gold,
		Visible = false,
		Parent = root,
	}, { Kit.corner(20), Kit.stroke(3) })
	tutorialLabel = Kit.text({
		Text = "",
		Position = UDim2.fromOffset(12, 4),
		Size = UDim2.new(1, -24, 1, -8),
		MaxTextSize = 22,
		Parent = tutorialFrame,
	})

	krakenBar = Kit.new("Frame", {
		Name = "KrakenBar",
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 168),
		Size = UDim2.fromOffset(420, 30),
		BackgroundColor3 = Theme.PanelDark,
		Visible = false,
		Parent = root,
	}, { Kit.corner(12), Kit.stroke(3) })
	krakenFill = Kit.new("Frame", {
		Size = UDim2.fromScale(1, 1),
		BackgroundColor3 = Color3.fromRGB(200, 60, 200),
		Parent = krakenBar,
	}, { Kit.corner(12) })
	krakenText = Kit.text({
		Text = "",
		Size = UDim2.fromScale(1, 1),
		MaxTextSize = 20,
		ZIndex = 2,
		Parent = krakenBar,
	})
end

local function buildQuickShop(root: Frame)
	local holder = Kit.new("Frame", {
		Name = "QuickShop",
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.new(1, -10, 0, 70),
		Size = UDim2.fromOffset(170, 220),
		BackgroundTransparency = 1,
		Parent = root,
	})
	Kit.new("UIListLayout", { Padding = UDim.new(0, 6), SortOrder = Enum.SortOrder.LayoutOrder, Parent = holder })
	local entries: { { id: string, text: string, color: Color3, product: boolean? } } = {
		{ id = "StarterPack", text = "🎁 Starter Pack", color = Theme.Purple, product = true },
		{ id = "DoubleMoney", text = "💰 x2 Money", color = Theme.Green },
		{ id = "AutoCollect", text = "🧲 Auto Collect", color = Theme.Red },
		{ id = "AutoOpen", text = "📦 Auto Open", color = Theme.Orange },
	}
	for order, entry in entries do
		quickButtons[entry.id] = Kit.button({
			Text = entry.text,
			Color = entry.color,
			Size = UDim2.new(1, 0, 0, 42),
			LayoutOrder = order,
			Parent = holder,
			OnClick = function()
				local shop = panels.Shop.Shop
				if entry.product then
					shop.buyProduct(entry.id)
				else
					shop.buyPass(entry.id)
				end
			end,
		})
	end
end

-- Live updates ----------------------------------------------------------------------------

local function boostChip(text: string, color: Color3): TextLabel
	local chip = Kit.text({
		Text = text,
		Size = UDim2.fromOffset(0, 28),
		AutomaticSize = Enum.AutomaticSize.X,
		TextScaled = false,
		TextSize = 18,
		BackgroundTransparency = 0.1,
		BackgroundColor3 = color,
		Parent = boostRow,
	})
	Kit.corner(12).Parent = chip
	Kit.padding(4).Parent = chip
	return chip
end

local function updateBoosts()
	for _, child in boostRow:GetChildren() do
		if child:IsA("TextLabel") then
			child:Destroy()
		end
	end
	local data = State.data()
	if data and data.luckPotionEnds > State.osTime() then
		boostChip("🍀 x2 Luck " .. Format.duration(data.luckPotionEnds - State.osTime()), Theme.Green)
	end
	local serverNow = Workspace:GetServerTimeNow()
	for _, name in { "LowTide", "BloodMoon", "Kraken" } do
		local event = State.events[name]
		if event and event.active then
			boostChip(event.title .. " " .. Format.duration(event.endsAt - serverNow), event.color)
		end
	end
	local rebirths = data and data.rebirths or 0
	if rebirths > 0 then
		boostChip("♻ x" .. tostring(Formulas.rebirthMultiplier(rebirths)) .. " income", Color3.fromRGB(200, 140, 30))
	end
end

local function updateKraken()
	local kraken = Workspace:FindFirstChild("Kraken")
	local health = kraken and kraken:GetAttribute("Health")
	local maxHealth = kraken and kraken:GetAttribute("MaxHealth")
	if type(health) == "number" and type(maxHealth) == "number" and maxHealth > 0 then
		krakenBar.Visible = true
		krakenFill.Size = UDim2.fromScale(math.clamp(health / maxHealth, 0, 1), 1)
		krakenText.Text = ("🦑 KRAKEN  %d / %d  - click it!"):format(health, maxHealth)
	else
		krakenBar.Visible = false
	end
end

local function tutorialText(data): string?
	local stats = data.stats
	if stats.dives == 0 then
		return "Your diver is exploring the dark trench... wait for them to surface!"
	elseif stats.chestsOpened == 0 then
		return "Open your chest! Tap 📦 Chests"
	elseif stats.collected == 0 then
		return "Walk onto the green pad in front of your treasure to collect cash"
	elseif stats.rolls == 0 then
		return "Roll a new diver! Tap 🎲 Roll"
	elseif data.upgrades.DiveSlots == 0 and data.upgrades.Pedestals == 0 then
		return "Buy an upgrade to grow your dock! Tap ⬆ Upgrade"
	end
	return nil
end

local function updateHud()
	local data = State.data()
	if not data then
		return
	end
	cashLabel.Text = Format.money(State.cash())
	incomeLabel.Text = "+" .. Format.perSecond(State.get("income") or 0)

	local chests = #data.chests
	badges.Chests.Visible = chests > 0
	badges.Chests.Text = if chests > 99 then "99+" else tostring(chests)
	local canRebirth = State.cash() >= Formulas.rebirthCost(data.rebirths)
	badges.Rebirth.Visible = canRebirth
	local rewards = panels.Rewards :: any
	badges.Rewards.Visible = rewards.hasClaimable()
	badges.Rewards.Text = "!"
	Settings.load(data)

	local text = tutorialText(data)
	tutorialFrame.Visible = text ~= nil
	tutorialLabel.Text = text or ""

	for passId, button in quickButtons do
		if passId == "StarterPack" then
			button.Visible = not data.starterPackClaimed
		else
			button.Visible = not State.hasPass(passId)
		end
	end
end

-- Entry ------------------------------------------------------------------------------------

function App.start()
	local player = Players.LocalPlayer
	local gui = Kit.new("ScreenGui", {
		Name = "RollADiver",
		ResetOnSpawn = false,
		IgnoreGuiInset = false,
		ZIndexBehavior = Enum.ZIndexBehavior.Sibling,
		Parent = player:WaitForChild("PlayerGui"),
	})
	local root = Kit.new("Frame", {
		Name = "Root",
		Size = UDim2.fromScale(1, 1),
		BackgroundTransparency = 1,
		Parent = gui,
	})
	-- shrink the UI on small screens (phones)
	local uiScale = Kit.new("UIScale", { Parent = root })
	local function rescale()
		local camera = Workspace.CurrentCamera
		if camera then
			local size = camera.ViewportSize
			local scale = math.clamp(math.min(size.X / 1280, size.Y / 760), 0.55, 1.15)
			uiScale.Scale = scale
			root.Size = UDim2.fromScale(1 / scale, 1 / scale)
		end
	end
	rescale()
	if Workspace.CurrentCamera then
		Workspace.CurrentCamera:GetPropertyChangedSignal("ViewportSize"):Connect(rescale)
	end

	Notifications.mount(root)
	Reveal.mount(root)
	buildTopBar(root)
	buildMenu(root)
	buildWindow(root)
	buildQuickShop(root)
	-- settings gear (top right)
	Kit.button({
		Text = "⚙",
		Color = Theme.Grey,
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.new(1, -10, 0, 10),
		Size = UDim2.fromOffset(52, 52),
		Parent = root,
		OnClick = function()
			App.open("Settings")
		end,
	})

	Net.onError = function(message)
		Notifications.toast(message, "Error")
	end

	Remotes.event("Notify").OnClientEvent:Connect(function(text, kind)
		Notifications.toast(text, kind)
		if kind == "Chest" then
			Sounds.play("Coin", 0.25, 1.4)
		end
	end)
	Remotes.event("Announce").OnClientEvent:Connect(function(text, color)
		Notifications.announce(text, color)
	end)
	Remotes.event("OfflineEarnings").OnClientEvent:Connect(function(seconds, amount)
		task.delay(1.5, Reveal.offline, seconds, amount)
	end)

	-- refresh the open panel when data changes (throttled)
	local pending = false
	local remindedDaily = false
	State.Changed:Connect(function()
		if not remindedDaily and State.data() then
			remindedDaily = true
			local rewards = panels.Rewards :: any
			if rewards.hasClaimable() then
				task.delay(3, Notifications.toast, "🎁 Your daily reward is ready! Tap Rewards", "New")
			end
		end
		updateHud()
		if openPanel and not pending then
			pending = true
			task.delay(0.15, function()
				pending = false
				if openPanel then
					panels[openPanel].refresh()
				end
			end)
		end
	end)
	player:GetAttributeChangedSignal("Cash"):Connect(function()
		cashLabel.Text = Format.money(State.cash())
	end)

	local elapsed = 0
	RunService.Heartbeat:Connect(function(dt)
		elapsed += dt
		if elapsed >= 0.5 then
			elapsed = 0
			updateBoosts()
			updateKraken()
		end
	end)
end

return App
