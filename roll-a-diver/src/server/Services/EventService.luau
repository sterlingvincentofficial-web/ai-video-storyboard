--[[
	Timed server-wide events:
	  Low Tide   divers dive twice as fast and reach one zone deeper
	  Blood Moon Cursed treasures are 5x more likely, the sky turns red
	  Kraken     a giant Kraken rises in the channel; everyone clicks it for chests
]]

local Players = game:GetService("Players")
local Workspace = game:GetService("Workspace")

local Shared = game:GetService("ReplicatedStorage").Shared
local GameConfig = require(Shared.Config.Game)
local Remotes = require(Shared.Remotes)

local Services = require(script.Parent.Parent.Registry)

local EventService = {}

type EventState = {
	active: boolean,
	endsAt: number,
	nextAt: number,
	warned: boolean,
}

local EVENT_NAMES = { "LowTide", "BloodMoon", "Kraken" }

local DISPLAY = {
	LowTide = {
		title = "🌊 LOW TIDE",
		start = "Low Tide! Divers dive twice as fast and reach one zone deeper!",
		warn = "The tide is going out... Low Tide in 30 seconds!",
		color = Color3.fromRGB(90, 220, 255),
	},
	BloodMoon = {
		title = "🌕 BLOOD MOON",
		start = "Blood Moon! Cursed treasures are 5x more likely!",
		warn = "The moon is turning red... Blood Moon in 30 seconds!",
		color = Color3.fromRGB(255, 70, 80),
	},
	Kraken = {
		title = "🦑 KRAKEN ATTACK",
		start = "THE KRAKEN HAS RISEN! Click it together for chests!",
		warn = "Something huge is stirring in the channel... Kraken in 30 seconds!",
		color = Color3.fromRGB(200, 90, 255),
	},
}

local states: { [string]: EventState } = {}

local function now(): number
	return Workspace:GetServerTimeNow()
end

function EventService.IsActive(name: string): boolean
	local state = states[name]
	return state ~= nil and state.active
end

function EventService.PublicState()
	local result = {}
	for name, state in states do
		result[name] = {
			active = state.active,
			endsAt = state.endsAt,
			nextAt = state.nextAt,
			title = DISPLAY[name].title,
			color = DISPLAY[name].color,
		}
	end
	return result
end

local function broadcast()
	Remotes.event("EventState"):FireAllClients(EventService.PublicState())
end

function EventService.SendTo(player: Player)
	Remotes.event("EventState"):FireClient(player, EventService.PublicState())
end

local function onStarted(name: string)
	if name == "BloodMoon" then
		Services.WorldBuilder.SetLighting("BloodMoon")
	elseif name == "Kraken" then
		Services.KrakenService.Spawn()
	end
end

local function onEnded(name: string)
	if name == "BloodMoon" then
		Services.WorldBuilder.SetLighting("Day")
	elseif name == "Kraken" then
		Services.KrakenService.Despawn()
	end
end

-- Starts (or extends) an event right now. `byName` credits a player who bought it.
function EventService.StartEvent(name: string, byName: string?)
	local state = states[name]
	local config = GameConfig.Events[name]
	if not state or not config then
		return
	end
	local display = DISPLAY[name]
	if state.active then
		state.endsAt += config.duration
	else
		state.active = true
		state.endsAt = now() + config.duration
		onStarted(name)
	end
	local text = if byName then byName .. " started a " .. display.title .. "! " .. display.start else display.start
	Services.AnnouncementService.Announce(text, display.color, false)
	broadcast()
end

function EventService.EndEvent(name: string)
	local state = states[name]
	if not state or not state.active then
		return
	end
	state.active = false
	state.warned = false
	onEnded(name)
	broadcast()
end

function EventService.Init()
	local t = now()
	for _, name in EVENT_NAMES do
		local config = GameConfig.Events[name]
		states[name] = {
			active = false,
			endsAt = 0,
			nextAt = t + config.firstDelay,
			warned = false,
		}
	end
end

function EventService.Start()
	Players.PlayerAdded:Connect(function(player)
		task.defer(EventService.SendTo, player)
	end)
	task.spawn(function()
		while true do
			task.wait(1)
			local t = now()
			for _, name in EVENT_NAMES do
				local state = states[name]
				local config = GameConfig.Events[name]
				if state.active then
					if t >= state.endsAt then
						EventService.EndEvent(name)
					end
				elseif t >= state.nextAt then
					state.nextAt = t + config.interval
					state.warned = false
					EventService.StartEvent(name)
				elseif not state.warned and t >= state.nextAt - GameConfig.Events.WarningTime then
					state.warned = true
					Services.AnnouncementService.Announce(DISPLAY[name].warn, DISPLAY[name].color, false)
				end
			end
		end
	end)
end

return EventService
