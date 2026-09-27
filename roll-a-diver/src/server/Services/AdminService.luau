--[[
	Chat commands for testing. Only work in Studio or for the game's owner.

	/cash 1e6            add cash
	/rebirth             free rebirth (sets cash to the cost first)
	/event lowtide|bloodmoon|kraken
	/endevent lowtide|bloodmoon|kraken
	/diver PoseidonId    give a diver (ids from Config/Divers)
	/chest 3 5           give 5 chests from zone 3
	/pass DoubleMoney    toggle a gamepass (Studio only)
	/product LuckPotion  run a developer product's effect (Studio only)
	/wipe                reset your save
]]

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")

local Shared = game:GetService("ReplicatedStorage").Shared
local Formulas = require(Shared.Formulas)
local Divers = require(Shared.Config.Divers)
local Monetization = require(Shared.Config.Monetization)

local Services = require(script.Parent.Parent.Registry)

local AdminService = {}

local EVENT_ALIASES = { lowtide = "LowTide", bloodmoon = "BloodMoon", kraken = "Kraken" }

local function isAdmin(player: Player): boolean
	if RunService:IsStudio() then
		return true
	end
	if game.CreatorType == Enum.CreatorType.User then
		return player.UserId == game.CreatorId
	end
	local ok, rank = pcall(function()
		return player:GetRankInGroup(game.CreatorId)
	end)
	return ok and rank >= 254
end

local commands: { [string]: (Player, { string }) -> string? } = {
	cash = function(player, args)
		local amount = tonumber(args[1]) or 1e6
		Services.EconomyService.AddCash(player, amount)
		return "Added cash"
	end,
	rebirth = function(player)
		local data = Services.DataService.Get(player)
		if not data then
			return nil
		end
		data.cash = math.max(data.cash, Formulas.rebirthCost(data.rebirths))
		local response = Services.RebirthService.Rebirth(player)
		return if response.ok then "Rebirthed" else response.err
	end,
	event = function(_, args)
		local name = EVENT_ALIASES[string.lower(args[1] or "")]
		if not name then
			return "Events: lowtide, bloodmoon, kraken"
		end
		Services.EventService.StartEvent(name)
		return "Started " .. name
	end,
	endevent = function(_, args)
		local name = EVENT_ALIASES[string.lower(args[1] or "")]
		if not name then
			return "Events: lowtide, bloodmoon, kraken"
		end
		Services.EventService.EndEvent(name)
		return "Ended " .. name
	end,
	diver = function(player, args)
		local id = args[1]
		if not id or not Divers.ById[id] then
			return "Unknown diver id"
		end
		Services.DiverService.AddDiver(player, id, true)
		return "Gave " .. id
	end,
	chest = function(player, args)
		local zone = tonumber(args[1]) or 1
		local count = math.clamp(tonumber(args[2]) or 1, 1, 100)
		Services.ChestService.GrantFromZone(player, zone, count, Services.EconomyService.LuckMult(player))
		return "Gave chests"
	end,
	pass = function(player, args)
		if not RunService:IsStudio() then
			return "Pass toggles only work in Studio"
		end
		local id = args[1]
		local data = Services.DataService.Get(player)
		if not data or not id or not Monetization.PassById[id] then
			return "Unknown pass id"
		end
		data.devPasses[id] = not data.devPasses[id] or nil
		Services.MarketService.ApplyPassPerks(player)
		Services.VaultService.Refresh(player)
		return id .. (if data.devPasses[id] then " ON" else " OFF")
	end,
	product = function(player, args)
		if not RunService:IsStudio() then
			return "Product tests only work in Studio"
		end
		local id = args[1]
		if not id or not Monetization.ProductById[id] then
			return "Unknown product id"
		end
		Services.MarketService.GrantProduct(player, id)
		return "Granted " .. id
	end,
	wipe = function(player)
		Services.DataService.Wipe(player)
		Services.DiverService.Clear(player)
		Services.VaultService.Clear(player)
		Services.DiverService.AddDiver(player, Divers.StarterDiver, true)
		Services.VaultService.Refresh(player)
		Services.EconomyService.RefreshDisplay(player)
		return "Save wiped"
	end,
}

local function onChatted(player: Player, message: string)
	if string.sub(message, 1, 1) ~= "/" or not isAdmin(player) then
		return
	end
	local parts = string.split(string.sub(message, 2), " ")
	local name = string.lower(table.remove(parts, 1) or "")
	local command = commands[name]
	if not command or not Services.PlayerService.IsReady(player) then
		return
	end
	local ok, response = pcall(command, player, parts)
	Services.DataService.MarkDirty(player)
	Services.PlayerService.Notify(player, "[Admin] " .. tostring(if ok then response or "Done" else response), "Info")
end

function AdminService.Start()
	local TextChatService = game:GetService("TextChatService")
	if TextChatService.ChatVersion == Enum.ChatVersion.TextChatService then
		-- modern chat: register real commands so they are not sent as chat messages
		local folder = Instance.new("Folder")
		folder.Name = "AdminCommands"
		folder.Parent = TextChatService
		for name in commands do
			local command = Instance.new("TextChatCommand")
			command.Name = name
			command.PrimaryAlias = "/" .. name
			command.Parent = folder
			command.Triggered:Connect(function(source, text)
				local player = Players:GetPlayerByUserId(source.UserId)
				if player then
					onChatted(player, text)
				end
			end)
		end
		return
	end
	local function hook(player: Player)
		player.Chatted:Connect(function(message)
			onChatted(player, message)
		end)
	end
	Players.PlayerAdded:Connect(hook)
	for _, player in Players:GetPlayers() do
		hook(player)
	end
end

return AdminService
