--[[
	Treasures and the vault: inventory, pedestals, income, collect pads, index and sets.
]]

local CollectionService = game:GetService("CollectionService")

local Shared = game:GetService("ReplicatedStorage").Shared
local Formulas = require(Shared.Formulas)
local Format = require(Shared.Util.Format)
local ModelFactory = require(Shared.ModelFactory)
local GameConfig = require(Shared.Config.Game)
local Treasures = require(Shared.Config.Treasures)
local Conditions = require(Shared.Config.Conditions)
local Rarities = require(Shared.Config.Rarities)
local Remotes = require(Shared.Remotes)

local Services = require(script.Parent.Parent.Registry)

local VaultService = {}

type VaultState = {
	stored: { [number]: number },
	models: { [number]: Model },
	lastCollect: { [number]: number },
	income: { [number]: number },
}

local states: { [Player]: VaultState } = {}

local function getState(player: Player): VaultState
	local state = states[player]
	if not state then
		state = { stored = {}, models = {}, lastCollect = {}, income = {} }
		states[player] = state
	end
	return state
end

function VaultService.PedestalCount(player: Player): number
	local data = Services.DataService.Get(player)
	if not data then
		return 0
	end
	return Formulas.pedestalCount(data.upgrades.Pedestals)
end

local function pedestalOf(data: any, uid: string): number?
	for key, value in data.pedestals do
		if value == uid then
			return tonumber(key)
		end
	end
	return nil
end

VaultService.PedestalOf = pedestalOf

local function treasureCount(data: any): number
	local count = 0
	for _ in data.treasures do
		count += 1
	end
	return count
end

-- Income --------------------------------------------------------------------------------------

-- Per-pedestal income (after every multiplier) for the player's current vault.
local function computeIncomes(player: Player, data: any): { [number]: number }
	local placedIds = {}
	for _, uid in data.pedestals do
		local item = data.treasures[uid]
		if item then
			placedIds[item.id] = true
		end
	end
	local bonuses = Formulas.setBonuses(placedIds)
	local mult = Services.EconomyService.IncomeMult(player)
	local incomes = {}
	local count = Formulas.pedestalCount(data.upgrades.Pedestals)
	for i = 1, count do
		local uid = data.pedestals[tostring(i)]
		local item = uid and data.treasures[uid]
		if item then
			incomes[i] = Formulas.treasureIncome(item.id, item.c) * (1 + (bonuses[item.id] or 0)) * mult
		end
	end
	return incomes
end

function VaultService.IncomePerSecond(player: Player): number
	local data = Services.DataService.Get(player)
	if not data then
		return 0
	end
	local total = 0
	for _, value in computeIncomes(player, data) do
		total += value
	end
	return total
end

-- Pedestal display ----------------------------------------------------------------------------

local function updateLabels(player: Player, data: any, state: VaultState)
	local plot = Services.PlotService.Get(player)
	if not plot then
		return
	end
	local autoCollect = Services.MarketService.HasPass(player, "AutoCollect")
	local count = Formulas.pedestalCount(data.upgrades.Pedestals)
	for i = 1, count do
		local parts = plot.pedestals[i]
		local uid = data.pedestals[tostring(i)]
		local item = uid and data.treasures[uid]
		if item then
			local treasure = Treasures.ById[item.id]
			local condition = Conditions.ById[item.c]
			local prefix = if condition and condition.id ~= Conditions.Default then condition.name .. " " else ""
			parts.nameLabel.Text = prefix .. treasure.name
			parts.nameLabel.TextColor3 = Rarities.ById[treasure.rarity].color
			parts.incomeLabel.Text = Format.perSecond(state.income[i] or 0)
			parts.collectLabel.Text = if autoCollect then "Auto" else "Collect " .. Format.money(state.stored[i] or 0)
		else
			parts.nameLabel.Text = "Empty"
			parts.nameLabel.TextColor3 = Color3.fromRGB(200, 200, 200)
			parts.incomeLabel.Text = ""
			parts.collectLabel.Text = if (state.stored[i] or 0) > 0
				then "Collect " .. Format.money(state.stored[i])
				else ""
		end
	end
end

function VaultService.Refresh(player: Player)
	local data = Services.DataService.Get(player)
	local plot = Services.PlotService.Get(player)
	if not data or not plot then
		return
	end
	local state = getState(player)
	local count = Formulas.pedestalCount(data.upgrades.Pedestals)
	for i = 1, GameConfig.MaxPedestals do
		local key = tostring(i)
		local uid = data.pedestals[key]
		if uid and (i > count or not data.treasures[uid]) then
			data.pedestals[key] = nil
			uid = nil
		end
		local model: Model? = state.models[i]
		if model and model:GetAttribute("Uid") ~= uid then
			model:Destroy()
			state.models[i] = nil
			model = nil
		end
		if uid and not model then
			local item = data.treasures[uid]
			local newModel = ModelFactory.treasure(item.id, item.c)
			newModel:SetAttribute("Uid", uid)
			newModel:PivotTo(plot.pedestals[i].top)
			CollectionService:AddTag(newModel, "SpinTreasure")
			newModel.Parent = plot.treasures
			state.models[i] = newModel
		end
	end
	state.income = computeIncomes(player, data)
	Services.PlotService.UpdateLocks(plot, Services.DiverService.SlotCount(player), count)
	updateLabels(player, data, state)
	Services.DataService.MarkDirty(player)
end

function VaultService.Clear(player: Player)
	local state = states[player]
	if state then
		for _, model in state.models do
			model:Destroy()
		end
	end
	states[player] = nil
end

-- Collecting ----------------------------------------------------------------------------------

function VaultService.CollectPedestal(player: Player, index: number)
	local data = Services.DataService.Get(player)
	local state = states[player]
	if not data or not state then
		return
	end
	local last = state.lastCollect[index] or 0
	if os.clock() - last < GameConfig.CollectPadCooldown then
		return
	end
	state.lastCollect[index] = os.clock()
	local amount = state.stored[index] or 0
	if amount <= 0 then
		return
	end
	state.stored[index] = 0
	Services.EconomyService.AddCash(player, amount)
	data.stats.collected += amount
	local plot = Services.PlotService.Get(player)
	if plot then
		Remotes.event("CollectFx"):FireClient(player, plot.pedestals[index].pad.CFrame.Position, amount)
	end
	updateLabels(player, data, state)
	Services.DataService.MarkDirty(player)
end

-- Moves every stored pedestal balance into the wallet (used on leave and rebirth).
function VaultService.CollectAll(player: Player): number
	local data = Services.DataService.Get(player)
	local state = states[player]
	if not data or not state then
		return 0
	end
	local total = 0
	for index, amount in state.stored do
		total += amount
		state.stored[index] = 0
	end
	if total > 0 then
		Services.EconomyService.AddCash(player, total)
		data.stats.collected += total
	end
	return total
end

local function incomeTick()
	for player, state in states do
		local data = Services.DataService.Get(player)
		if data then
			local incomes = computeIncomes(player, data)
			state.income = incomes
			local autoCollect = Services.MarketService.HasPass(player, "AutoCollect")
			local total = 0
			for index, income in incomes do
				if autoCollect then
					total += income
				else
					state.stored[index] = (state.stored[index] or 0) + income
				end
			end
			if total > 0 then
				Services.EconomyService.AddCash(player, total)
				data.stats.collected += total
			end
			updateLabels(player, data, state)
		end
	end
end

-- Treasures -----------------------------------------------------------------------------------

export type AddResult = {
	uid: string?,
	treasureId: string,
	condition: string,
	isNew: boolean,
	newVariant: boolean,
	autoSold: boolean,
	sellValue: number,
	placed: boolean,
}

-- Adds a treasure (from a chest) to the player: index, inventory, auto-place, announcements.
function VaultService.AddTreasure(player: Player, treasureId: string, conditionId: string): AddResult?
	local data = Services.DataService.Get(player)
	if not data or not Treasures.ById[treasureId] then
		return nil
	end
	local treasure = Treasures.ById[treasureId]
	local condition = Conditions.ById[conditionId]

	local zonesBefore = Formulas.indexZonesComplete(data.index)
	local isNew = data.index[treasureId] == nil
	data.index[treasureId] = data.index[treasureId] or {}
	local newVariant = not data.index[treasureId][conditionId]
	data.index[treasureId][conditionId] = true
	local zonesAfter = Formulas.indexZonesComplete(data.index)

	local result: AddResult = {
		uid = nil,
		treasureId = treasureId,
		condition = conditionId,
		isNew = isNew,
		newVariant = newVariant,
		autoSold = false,
		sellValue = Formulas.treasureSellValue(treasureId, conditionId),
		placed = false,
	}

	if treasureCount(data) >= GameConfig.MaxTreasures then
		result.autoSold = true
		Services.EconomyService.AddCash(player, result.sellValue)
		Services.PlayerService.Notify(
			player,
			"Treasure storage full: sold " .. treasure.name .. " for " .. Format.money(result.sellValue),
			"Info"
		)
	else
		local uid = "t" .. data.nextUid
		data.nextUid += 1
		data.treasures[uid] = { id = treasureId, c = conditionId }
		result.uid = uid
		local count = Formulas.pedestalCount(data.upgrades.Pedestals)
		for i = 1, count do
			if not data.pedestals[tostring(i)] then
				data.pedestals[tostring(i)] = uid
				result.placed = true
				break
			end
		end
	end

	if isNew then
		Services.PlayerService.Notify(player, "NEW! " .. treasure.name .. " added to your Index", "New")
	end
	if zonesAfter > zonesBefore then
		Services.PlayerService.Notify(player, "Index page complete! +5% income forever", "Success")
	end

	local rarity = Rarities.ById[treasure.rarity]
	if rarity.announce or (condition and condition.announce) then
		local prefix = if condition and condition.id ~= Conditions.Default then condition.name .. " " else ""
		local odds = treasure.odds * (if condition then condition.odds else 1)
		Services.AnnouncementService.Announce(
			("%s found a %s%s (%s)!"):format(player.DisplayName, prefix, treasure.name, Format.odds(odds)),
			rarity.color,
			rarity.rank >= Rarities.ById.Divine.rank or (condition ~= nil and condition.id == "Glitched")
		)
	end

	VaultService.Refresh(player)
	return result
end

function VaultService.Place(player: Player, uid: string, index: number?): (boolean, string?)
	local data = Services.DataService.Get(player)
	if not data or not data.treasures[uid] then
		return false, "That treasure doesn't exist"
	end
	local count = Formulas.pedestalCount(data.upgrades.Pedestals)
	local current = pedestalOf(data, uid)
	if index == nil then
		if current then
			return false, "Already on display"
		end
		for candidate = 1, count do
			if not data.pedestals[tostring(candidate)] then
				index = candidate
				break
			end
		end
		if not index then
			return false, "Every pedestal is full. Remove a treasure or buy more pedestals"
		end
	end
	assert(index)
	if index < 1 or index > count then
		return false, "That pedestal is locked"
	end
	if current then
		data.pedestals[tostring(current)] = nil
	end
	data.pedestals[tostring(index)] = uid
	VaultService.Refresh(player)
	return true
end

function VaultService.Remove(player: Player, uid: string): (boolean, string?)
	local data = Services.DataService.Get(player)
	if not data then
		return false
	end
	local index = pedestalOf(data, uid)
	if not index then
		return false, "Not on display"
	end
	data.pedestals[tostring(index)] = nil
	VaultService.Refresh(player)
	return true
end

function VaultService.Sell(player: Player, uid: string): (boolean, string?)
	local data = Services.DataService.Get(player)
	if not data or not data.treasures[uid] then
		return false, "That treasure doesn't exist"
	end
	local item = data.treasures[uid]
	local index = pedestalOf(data, uid)
	if index then
		data.pedestals[tostring(index)] = nil
	end
	data.treasures[uid] = nil
	Services.EconomyService.AddCash(player, Formulas.treasureSellValue(item.id, item.c))
	VaultService.Refresh(player)
	return true
end

-- Sells every treasure that is not on display. Returns how many and for how much.
function VaultService.SellUnplaced(player: Player): (number, number)
	local data = Services.DataService.Get(player)
	if not data then
		return 0, 0
	end
	local sold, total = 0, 0
	for uid, item in data.treasures do
		if not pedestalOf(data, uid) then
			total += Formulas.treasureSellValue(item.id, item.c)
			data.treasures[uid] = nil
			sold += 1
		end
	end
	if total > 0 then
		Services.EconomyService.AddCash(player, total)
	end
	VaultService.Refresh(player)
	return sold, total
end

-- Puts the highest-earning treasures on display, then tries completing sets.
function VaultService.EquipBest(player: Player)
	local data = Services.DataService.Get(player)
	if not data then
		return
	end
	local uids = {}
	for uid in data.treasures do
		table.insert(uids, uid)
	end
	local function value(uid: string): number
		local item = data.treasures[uid]
		return Formulas.treasureIncome(item.id, item.c)
	end
	table.sort(uids, function(a, b)
		local va, vb = value(a), value(b)
		if va == vb then
			return a < b
		end
		return va > vb
	end)
	local count = Formulas.pedestalCount(data.upgrades.Pedestals)
	table.clear(data.pedestals)
	for i = 1, math.min(count, #uids) do
		data.pedestals[tostring(i)] = uids[i]
	end
	VaultService.Refresh(player)
end

function VaultService.ClearForRebirth(player: Player)
	local state = states[player]
	if state then
		table.clear(state.stored)
	end
end

function VaultService.Start()
	task.spawn(function()
		while true do
			task.wait(1)
			local ok, err = pcall(incomeTick :: any)
			if not ok then
				warn("[VaultService] tick failed:", err)
			end
		end
	end)
end

return VaultService
