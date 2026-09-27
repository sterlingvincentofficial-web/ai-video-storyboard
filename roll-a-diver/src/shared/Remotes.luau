--[[
	All networking goes through the remotes declared here.
	The server creates them; clients wait for them.
]]

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local EVENTS = {
	"DataSync", -- server -> client: full player state snapshot
	"Notify", -- server -> client: toast message
	"Announce", -- server -> all: rare find / server news
	"EventState", -- server -> all: Low Tide / Blood Moon / Kraken state
	"DiveFx", -- server -> all: a diver surfaced with chests
	"CollectFx", -- server -> client: cash collected from a pedestal
	"OfflineEarnings", -- server -> client: welcome back popup
}

local FUNCTIONS = {
	"Action", -- client -> server: every player action (roll, place, sell, ...)
}

local Remotes = {}

local folder: Folder
if RunService:IsServer() then
	local existing = ReplicatedStorage:FindFirstChild("Remotes")
	if existing and existing:IsA("Folder") then
		folder = existing
	else
		folder = Instance.new("Folder")
		folder.Name = "Remotes"
		folder.Parent = ReplicatedStorage
	end
	for _, name in EVENTS do
		if not folder:FindFirstChild(name) then
			local remote = Instance.new("RemoteEvent")
			remote.Name = name
			remote.Parent = folder
		end
	end
	for _, name in FUNCTIONS do
		if not folder:FindFirstChild(name) then
			local remote = Instance.new("RemoteFunction")
			remote.Name = name
			remote.Parent = folder
		end
	end
else
	folder = ReplicatedStorage:WaitForChild("Remotes") :: Folder
end

function Remotes.event(name: string): RemoteEvent
	return folder:WaitForChild(name) :: RemoteEvent
end

function Remotes.func(name: string): RemoteFunction
	return folder:WaitForChild(name) :: RemoteFunction
end

return Remotes
