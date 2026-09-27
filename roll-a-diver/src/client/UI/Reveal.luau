--[[
	Full-screen reveal overlays: diver roll spin, chest opening, "open all" summary and offline earnings.
]]

local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")

local Shared = game:GetService("ReplicatedStorage").Shared
local Formulas = require(Shared.Formulas)
local Format = require(Shared.Util.Format)
local ModelFactory = require(Shared.ModelFactory)
local Divers = require(Shared.Config.Divers)
local Crates = require(Shared.Config.Crates)
local Treasures = require(Shared.Config.Treasures)
local Conditions = require(Shared.Config.Conditions)
local Rarities = require(Shared.Config.Rarities)
local Zones = require(Shared.Config.Zones)

local Kit = require(script.Parent.Kit)
local Theme = require(script.Parent.Theme)
local Sounds = require(script.Parent.Parent.Sounds)

local Reveal = {}

local root: Instance
local current: Frame? = nil

function Reveal.mount(parent: Instance)
	root = parent
end

function Reveal.isOpen(): boolean
	return current ~= nil
end

local function close()
	if current then
		current:Destroy()
		current = nil
	end
end

local function overlay(): (Frame, Frame)
	close()
	local frame = Kit.new("TextButton", {
		Name = "Reveal",
		Size = UDim2.fromScale(1, 1),
		BackgroundColor3 = Color3.new(0, 0, 0),
		BackgroundTransparency = 0.45,
		Text = "",
		AutoButtonColor = false,
		ZIndex = 50,
		Parent = root,
	})
	local card = Kit.new("Frame", {
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = UDim2.fromOffset(360, 420),
		BackgroundColor3 = Theme.Panel,
		ZIndex = 51,
		Parent = frame,
	}, { Kit.corner(18), Kit.stroke(4) })
	Kit.new("UISizeConstraint", { MaxSize = Vector2.new(360, 420), Parent = card })
	current = frame :: any
	frame.Activated:Connect(close)
	return frame :: any, card
end

local function label(card: Frame, text: string, y: number, height: number, color: Color3?, maxSize: number?): TextLabel
	return Kit.text({
		Text = text,
		Position = UDim2.new(0.05, 0, y, 0),
		Size = UDim2.new(0.9, 0, height, 0),
		TextColor3 = color or Theme.Text,
		MaxTextSize = maxSize or 36,
		ZIndex = 52,
		Parent = card,
	})
end

local function colorFor(rarityId: string, target: TextLabel)
	local rarity = Rarities.ById[rarityId]
	target.TextColor3 = if rarity.rainbow then Color3.new(1, 1, 1) else rarity.color
	if rarity.rainbow then
		Kit.rainbow(target)
	end
end

local function popIn(card: Frame)
	local scale = Kit.new("UIScale", { Scale = 0.3, Parent = card })
	TweenService:Create(scale, TweenInfo.new(0.35, Enum.EasingStyle.Back), { Scale = 1 }):Play()
end

-- Spins through the crate's divers, then lands on the rolled one.
function Reveal.roll(crateId: string, diverId: string, isNew: boolean, placed: boolean, fast: boolean?)
	local crate = Crates.ById[crateId]
	local frame, card = overlay()
	popIn(card)
	label(card, crate.name, 0.03, 0.09, crate.color, 30)
	local nameLabel = label(card, "...", 0.62, 0.11, Theme.Text, 40)
	local tierLabel = label(card, "", 0.74, 0.07, Theme.SubText, 26)
	local infoLabel = label(card, "", 0.83, 0.12, Theme.SubText, 20)
	local holder = Kit.new("Frame", {
		BackgroundTransparency = 1,
		Position = UDim2.fromScale(0.15, 0.13),
		Size = UDim2.fromScale(0.7, 0.48),
		ZIndex = 52,
		Parent = card,
	})

	local spinTime = if fast then 0.35 else 1.4
	local started = os.clock()
	local nextSwap = 0
	while os.clock() - started < spinTime and frame.Parent do
		local t = (os.clock() - started) / spinTime
		if os.clock() >= nextSwap then
			local entry = crate.pool[math.random(1, #crate.pool)]
			local diver = Divers.ById[entry.diver]
			nameLabel.Text = diver.name
			nameLabel.TextColor3 = Rarities.ById[diver.tier].color
			nextSwap = os.clock() + 0.04 + t * t * 0.25
			Sounds.play("Click", 0.15, 1 + t)
		end
		RunService.RenderStepped:Wait()
	end
	if not frame.Parent then
		return
	end

	local diver = Divers.ById[diverId]
	nameLabel.Text = diver.name
	colorFor(diver.tier, nameLabel)
	tierLabel.Text = diver.tier .. (if isNew then "  •  NEW!" else "")
	colorFor(diver.tier, tierLabel)
	local zoneCount = #Formulas.reachableZones(diver.maxDepth, #Zones.List)
	infoLabel.Text = ("%s luck • %s • dives to %s"):format(
		Format.multiplier(diver.luck),
		if placed then "On your dock!" else "In your inventory",
		Format.depth(math.min(diver.maxDepth, Zones.List[zoneCount].maxDepth))
	)
	Kit.viewport(holder, ModelFactory.diver(diverId), { ZIndex = 52 })
	Sounds.play("Reveal", 0.6, 1.2)
	local rarity = Rarities.ById[diver.tier]
	local stroke = card:FindFirstChildOfClass("UIStroke")
	if stroke then
		stroke.Color = rarity.color
	end
	task.delay(if fast then 0.9 else 3, function()
		if current == frame then
			close()
		end
	end)
end

local function treasureCard(card: Frame, result: { [string]: any })
	local treasure = Treasures.ById[result.treasureId]
	local condition = Conditions.ById[result.condition]
	local holder = Kit.new("Frame", {
		BackgroundTransparency = 1,
		Position = UDim2.fromScale(0.2, 0.14),
		Size = UDim2.fromScale(0.6, 0.44),
		ZIndex = 52,
		Parent = card,
	})
	Kit.viewport(holder, ModelFactory.treasure(result.treasureId, result.condition), { ZIndex = 52 })
	local prefix = if condition and condition.id ~= Conditions.Default then condition.name .. " " else ""
	local nameLabel = label(card, prefix .. treasure.name, 0.6, 0.11, Theme.Text, 34)
	colorFor(treasure.rarity, nameLabel)
	local tier =
		label(card, treasure.rarity .. (if result.isNew then "  •  NEW!" else ""), 0.72, 0.07, Theme.SubText, 24)
	colorFor(treasure.rarity, tier)
	local income = Formulas.treasureIncome(result.treasureId, result.condition)
	local info = if result.autoSold
		then "Storage full: sold for " .. Format.money(result.sellValue)
		elseif result.placed then "Placed in your vault: +" .. Format.perSecond(income)
		else "In your vault inventory: " .. Format.perSecond(income)
	label(card, info, 0.81, 0.07, Theme.Money, 22)
	if condition and condition.id ~= Conditions.Default then
		label(
			card,
			condition.name .. " " .. Format.multiplier(condition.mult) .. " income",
			0.89,
			0.06,
			condition.color,
			20
		)
	end
	local stroke = card:FindFirstChildOfClass("UIStroke")
	if stroke then
		stroke.Color = Rarities.ById[treasure.rarity].color
	end
end

-- Shakes the chest, then bursts it open to show the treasure.
function Reveal.chest(chestId: string, result: { [string]: any })
	local chest = Zones.ChestById[chestId]
	local frame, card = overlay()
	popIn(card)
	local title = label(card, chest.name, 0.03, 0.09, chest.glow, 30)
	local holder = Kit.new("Frame", {
		BackgroundTransparency = 1,
		Position = UDim2.fromScale(0.15, 0.18),
		Size = UDim2.fromScale(0.7, 0.5),
		ZIndex = 52,
		Parent = card,
	})
	local viewport = Kit.viewport(holder, ModelFactory.chest(chestId), { ZIndex = 52 })
	local started = os.clock()
	while os.clock() - started < 0.9 and frame.Parent do
		local t = os.clock() - started
		viewport.Rotation = math.sin(t * 40) * (4 + t * 10)
		RunService.RenderStepped:Wait()
	end
	if not frame.Parent then
		return
	end
	viewport:Destroy()
	title.Text = chest.name .. " opened!"
	Sounds.play("Reveal", 0.6, 1)
	treasureCard(card, result)
	task.delay(3.5, function()
		if current == frame then
			close()
		end
	end)
end

-- Summary after "Open All": the best finds plus totals.
function Reveal.summary(results: { { [string]: any } })
	if #results == 0 then
		return
	end
	local _, card = overlay()
	popIn(card)
	card.Size = UDim2.fromOffset(420, 460)
	local sizeConstraint = card:FindFirstChildOfClass("UISizeConstraint")
	if sizeConstraint then
		sizeConstraint.MaxSize = Vector2.new(420, 460)
	end
	label(card, ("Opened %d chests"):format(#results), 0.03, 0.08, Theme.Gold, 30)
	table.sort(results, function(a, b)
		return Formulas.treasureIncome(a.treasureId, a.condition) > Formulas.treasureIncome(b.treasureId, b.condition)
	end)
	local newCount, soldTotal = 0, 0
	for _, result in results do
		if result.isNew then
			newCount += 1
		end
		if result.autoSold then
			soldTotal += result.sellValue
		end
	end
	for index = 1, math.min(8, #results) do
		local result = results[index]
		local treasure = Treasures.ById[result.treasureId]
		local condition = Conditions.ById[result.condition]
		local prefix = if condition and condition.id ~= Conditions.Default then condition.name .. " " else ""
		local row = label(
			card,
			prefix
				.. treasure.name
				.. "  "
				.. Format.perSecond(Formulas.treasureIncome(result.treasureId, result.condition)),
			0.12 + (index - 1) * 0.085,
			0.07,
			Theme.Text,
			22
		)
		colorFor(treasure.rarity, row)
	end
	local footer = ("%d new for your Index"):format(newCount)
	if soldTotal > 0 then
		footer ..= " • auto-sold " .. Format.money(soldTotal)
	end
	label(card, footer, 0.83, 0.07, Theme.Money, 22)
	label(card, "Tap to close", 0.91, 0.06, Theme.SubText, 18)
end

function Reveal.offline(seconds: number, amount: number)
	local _, card = overlay()
	popIn(card)
	label(card, "Welcome back!", 0.08, 0.12, Theme.Gold, 40)
	label(card, "Your treasures kept earning for", 0.3, 0.08, Theme.SubText, 24)
	label(card, Format.duration(seconds), 0.4, 0.1, Theme.Text, 34)
	label(card, "+" .. Format.money(amount), 0.55, 0.16, Theme.Money, 56)
	label(card, "Tap to collect", 0.85, 0.07, Theme.SubText, 22)
	Sounds.play("Coin", 0.6)
end

return Reveal
