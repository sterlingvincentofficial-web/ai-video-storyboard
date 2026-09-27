--[[
	Client-side copy of the player's state, pushed by the server through DataSync.
]]

local Players = game:GetService("Players")

local Shared = game:GetService("ReplicatedStorage").Shared
local Remotes = require(Shared.Remotes)
local Signal = require(Shared.Util.Signal)

local State = {}

State.Changed = Signal.new()
State.EventsChanged = Signal.new()
State.sync = nil :: { [string]: any }?
State.events = {} :: { [string]: any }

local receivedAt = os.clock()

function State.data(): { [string]: any }?
	local sync = State.sync
	return sync and sync.data
end

function State.get(key: string): any
	local sync = State.sync
	return sync and sync[key]
end

function State.cash(): number
	local cash = Players.LocalPlayer:GetAttribute("Cash")
	if type(cash) == "number" then
		return cash
	end
	local data = State.data()
	return data and data.cash or 0
end

-- Server os.time() right now, estimated from the last sync.
function State.osTime(): number
	local sync = State.sync
	if not sync then
		return os.time()
	end
	return sync.osTime + (os.clock() - receivedAt)
end

function State.hasPass(passId: string): boolean
	local sync = State.sync
	return sync ~= nil and sync.passes ~= nil and sync.passes[passId] == true
end

function State.start()
	Remotes.event("DataSync").OnClientEvent:Connect(function(payload)
		State.sync = payload
		receivedAt = os.clock()
		State.Changed:Fire(payload)
	end)
	Remotes.event("EventState").OnClientEvent:Connect(function(events)
		State.events = events
		State.EventsChanged:Fire(events)
	end)
end

return State
