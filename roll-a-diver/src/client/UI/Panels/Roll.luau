--[[
	Roll panel: one card per crate with its price, real odds (after luck) and Roll / Auto buttons.
]]

local Shared = game:GetService("ReplicatedStorage").Shared
local Formulas = require(Shared.Formulas)
local Format = require(Shared.Util.Format)
local Crates = require(Shared.Config.Crates)
local Divers = require(Shared.Config.Divers)
local Rarities = require(Shared.Config.Rarities)

local UI = script.Parent.Parent
local Kit = require(UI.Kit)
local Theme = require(UI.Theme)
local Reveal = require(UI.Reveal)
local Notifications = require(UI.Notifications)
local Client = UI.Parent
local State = require(Client.State)
local Net = require(Client.Net)

local Panel = {
	title = "🎲 Roll Divers",
	color = Theme.Blue,
}

type CardRefs = {
	card: Frame,
	price: TextLabel,
	lock: TextLabel,
	oddsList: ScrollingFrame,
	rollButton: TextButton,
	autoButton: TextButton,
	lastLuck: number,
}

local cards: { [string]: CardRefs } = {}
local autoCrate: string? = nil
local rolling = false

local function doRoll(crateId: string, fast: boolean): boolean
	if rolling then
		return false
	end
	rolling = true
	local response = Net.try("Roll", crateId)
	if response.ok then
		if response.beginnersLuck then
			Notifications.toast("🍀 Beginner's luck! Your first roll is always Rare or better", "New")
		end
		Reveal.roll(crateId, response.diverId, response.isNew, response.placed, fast)
	end
	rolling = false
	return response.ok == true
end

local function setAuto(crateId: string?)
	autoCrate = crateId
	for id, refs in cards do
		Kit.setButton(
			refs.autoButton,
			if autoCrate == id then "STOP" else "AUTO",
			if autoCrate == id then Theme.Red else Theme.Purple
		)
	end
	if crateId then
		task.spawn(function()
			while autoCrate == crateId do
				if not doRoll(crateId, true) then
					setAuto(nil)
					break
				end
				task.wait(0.25)
			end
		end)
	end
end

local function fillOdds(refs: CardRefs, crateId: string, luck: number)
	refs.lastLuck = luck
	Kit.clear(refs.oddsList)
	local crate = Crates.ById[crateId]
	local oddsList = {}
	for index, entry in crate.pool do
		oddsList[index] = entry.odds
	end
	local chances = Formulas.chances(oddsList, luck)
	local data = State.data()
	for index, entry in crate.pool do
		local diver = Divers.ById[entry.diver]
		local rarity = Rarities.ById[diver.tier]
		local owned = data and data.diverIndex[entry.diver]
		local row = Kit.new("Frame", {
			Size = UDim2.new(1, -8, 0, 22),
			BackgroundTransparency = 1,
			LayoutOrder = index,
			Parent = refs.oddsList,
		})
		local nameLabel = Kit.text({
			Text = (if owned then "" else "? ") .. diver.name,
			Size = UDim2.fromScale(0.62, 1),
			TextXAlignment = Enum.TextXAlignment.Left,
			TextColor3 = rarity.color,
			MaxTextSize = 18,
			Parent = row,
		})
		if rarity.rainbow then
			nameLabel.TextColor3 = Color3.new(1, 1, 1)
			Kit.rainbow(nameLabel)
		end
		Kit.text({
			Text = Format.odds(1 / chances[index]),
			Position = UDim2.fromScale(0.62, 0),
			Size = UDim2.fromScale(0.38, 1),
			TextXAlignment = Enum.TextXAlignment.Right,
			TextColor3 = Theme.SubText,
			MaxTextSize = 16,
			Parent = row,
		})
	end
end

function Panel.build(content: Frame)
	local list = Kit.list(content, 10, true)
	for _, crate in Crates.List do
		local card = Kit.new("Frame", {
			Size = UDim2.new(0, 250, 1, -16),
			BackgroundColor3 = Theme.Card,
			LayoutOrder = crate.order,
			Parent = list,
		}, { Kit.corner(14), Kit.stroke(3, crate.color) })
		Kit.text({
			Text = crate.name,
			Position = UDim2.fromOffset(10, 8),
			Size = UDim2.new(1, -20, 0, 32),
			TextColor3 = crate.color,
			MaxTextSize = 28,
			Parent = card,
		})
		local price = Kit.text({
			Text = Format.money(crate.price),
			Position = UDim2.fromOffset(10, 40),
			Size = UDim2.new(1, -20, 0, 26),
			TextColor3 = Theme.Money,
			MaxTextSize = 24,
			Parent = card,
		})
		local oddsHolder = Kit.new("Frame", {
			Position = UDim2.fromOffset(8, 72),
			Size = UDim2.new(1, -16, 1, -130),
			BackgroundColor3 = Theme.CardDark,
			Parent = card,
		}, { Kit.corner(10) })
		local oddsList = Kit.list(oddsHolder, 2)
		local rollButton = Kit.button({
			Text = "ROLL",
			Color = Theme.Green,
			AnchorPoint = Vector2.new(0, 1),
			Position = UDim2.new(0, 8, 1, -8),
			Size = UDim2.new(0.6, -12, 0, 44),
			Parent = card,
			OnClick = function()
				task.spawn(doRoll, crate.id, false)
			end,
		})
		local autoButton = Kit.button({
			Text = "AUTO",
			Color = Theme.Purple,
			AnchorPoint = Vector2.new(1, 1),
			Position = UDim2.new(1, -8, 1, -8),
			Size = UDim2.new(0.4, -8, 0, 44),
			Parent = card,
			OnClick = function()
				setAuto(if autoCrate == crate.id then nil else crate.id)
			end,
		})
		local lock = Kit.text({
			Text = "",
			Position = UDim2.fromScale(0.05, 0.4),
			Size = UDim2.fromScale(0.9, 0.12),
			TextColor3 = Theme.Gold,
			MaxTextSize = 26,
			Visible = false,
			ZIndex = 5,
			Parent = card,
		})
		cards[crate.id] = {
			card = card,
			price = price,
			lock = lock,
			oddsList = oddsList,
			rollButton = rollButton,
			autoButton = autoButton,
			lastLuck = -1,
		}
	end
end

function Panel.refresh()
	local data = State.data()
	if not data then
		return
	end
	local luck = State.get("rollLuck") or 1
	local cash = State.cash()
	for id, refs in cards do
		local crate = Crates.ById[id]
		local locked = data.rebirths < crate.rebirthReq
		refs.lock.Visible = locked
		refs.lock.Text = ("🔒 Rebirth %d"):format(crate.rebirthReq)
		refs.oddsList.Visible = not locked
		refs.rollButton.Visible = not locked
		refs.autoButton.Visible = not locked
		refs.price.TextColor3 = if cash >= crate.price then Theme.Money else Theme.Red
		if refs.lastLuck ~= luck then
			fillOdds(refs, id, luck)
		end
	end
end

function Panel.onClose() end

return Panel
