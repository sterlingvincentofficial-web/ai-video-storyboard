--[[
	Chests. Contents are rolled when the diver surfaces (so the diver's luck counts)
	and stored sealed until the player opens them. Auto Open opens them straight away.
]]

local Shared = game:GetService("ReplicatedStorage").Shared
local Formulas = require(Shared.Formulas)
local Zones = require(Shared.Config.Zones)
local Treasures = require(Shared.Config.Treasures)

local Services = require(script.Parent.Parent.Registry)

local ChestService = {}

local MAX_SEALED = 200

type Content = { c: string, t: string, v: string }

local random = Random.new()
local function rand(): number
	return random:NextNumber()
end

function ChestService.RollContents(chestId: string, luck: number, noCommon: boolean?, cursedMult: number?): Content
	local chest = Zones.ChestById[chestId]
	local treasureId = Formulas.rollTreasure(chest.zone, luck, noCommon, rand)
	local conditionId = Formulas.rollCondition(luck, cursedMult, rand)
	return { c = chestId, t = treasureId, v = conditionId }
end

local function openContent(player: Player, content: Content)
	local data = Services.DataService.Get(player)
	if data then
		data.stats.chestsOpened += 1
		Services.AnalyticsService.Step(player, "FirstChestOpened")
	end
	return Services.VaultService.AddTreasure(player, content.t, content.v)
end

-- Gives the player sealed chests (or opens them right away with Auto Open).
function ChestService.Grant(player: Player, contents: { Content })
	local data = Services.DataService.Get(player)
	if not data or #contents == 0 then
		return
	end
	local autoOpen = Services.MarketService.HasPass(player, "AutoOpen")
	local names = {}
	for _, content in contents do
		if autoOpen or #data.chests >= MAX_SEALED then
			local result = openContent(player, content)
			local treasure = Treasures.ById[content.t]
			if result and not result.autoSold then
				table.insert(names, treasure.name)
			end
		else
			table.insert(data.chests, content)
		end
	end
	local chestName = Zones.ChestById[contents[1].c].name
	if autoOpen and #names > 0 then
		Services.PlayerService.Notify(player, "Opened " .. chestName .. ": " .. table.concat(names, ", "), "Info")
	elseif not autoOpen then
		local suffix = if #contents > 1 then " x" .. #contents else ""
		Services.PlayerService.Notify(player, "+ " .. chestName .. suffix, "Chest")
	end
	Services.DataService.MarkDirty(player)
end

-- Opens the oldest sealed chest of the given type. Returns what was inside.
function ChestService.Open(player: Player, chestId: string)
	local data = Services.DataService.Get(player)
	if not data then
		return nil
	end
	for index, content in data.chests do
		if content.c == chestId then
			table.remove(data.chests, index)
			local result = openContent(player, content)
			Services.DataService.MarkDirty(player)
			return result
		end
	end
	return nil
end

-- Opens every sealed chest (optionally only one type). Returns the list of results.
function ChestService.OpenAll(player: Player, chestId: string?)
	local data = Services.DataService.Get(player)
	if not data then
		return {}
	end
	local results = {}
	local index = 1
	while index <= #data.chests do
		local content = data.chests[index]
		if chestId == nil or content.c == chestId then
			table.remove(data.chests, index)
			local result = openContent(player, content)
			if result then
				table.insert(results, result)
			end
		else
			index += 1
		end
	end
	Services.DataService.MarkDirty(player)
	return results
end

-- Kraken rewards and admin commands: chests from the player's deepest unlocked zone.
function ChestService.GrantFromZone(player: Player, zoneIndex: number, count: number, luck: number)
	local zone = Zones.List[math.clamp(zoneIndex, 1, #Zones.List)]
	local contents = {}
	for _ = 1, count do
		table.insert(contents, ChestService.RollContents(zone.chest, luck, false, Services.EconomyService.CursedMult()))
	end
	ChestService.Grant(player, contents)
end

return ChestService
