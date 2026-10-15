--!strict
-- Remote events/functions in one place. The server creates them; clients wait for them.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Net = {}

local EVENTS = {
	"Hits", -- server -> all: { { id, damage, crit, kind } }
	"Deaths", -- server -> all: { { id, type, kind, pos, reward, owner } }
	"Attacks", -- server -> all: { { uid, kind, targetId, targetPos, travel, level } }
	"EnemyActs", -- server -> all: ability visuals { id, act, data }
	"GameEvent", -- server -> all: wave start/clear, boss, base hit, game over
	"UnitFx", -- server -> all: unit-side visuals (stun, rally, heal)
	"IntroDone", -- client -> server: finished or skipped the intro cutscene
}
local FUNCTIONS = { "PlaceUnit", "UpgradeUnit", "SellUnit" }

local folder: Folder

local function getFolder(): Folder
	if folder then
		return folder
	end
	if RunService:IsServer() then
		local f = ReplicatedStorage:FindFirstChild("Remotes") :: Folder?
		if not f then
			local newFolder = Instance.new("Folder")
			newFolder.Name = "Remotes"
			for _, n in EVENTS do
				local e = Instance.new("RemoteEvent")
				e.Name = n
				e.Parent = newFolder
			end
			for _, n in FUNCTIONS do
				local f2 = Instance.new("RemoteFunction")
				f2.Name = n
				f2.Parent = newFolder
			end
			newFolder.Parent = ReplicatedStorage
			f = newFolder
		end
		folder = f :: Folder
	else
		folder = ReplicatedStorage:WaitForChild("Remotes") :: Folder
	end
	return folder
end

function Net.event(name: string): RemoteEvent
	return getFolder():WaitForChild(name) :: RemoteEvent
end

function Net.func(name: string): RemoteFunction
	return getFolder():WaitForChild(name) :: RemoteFunction
end

return Net
