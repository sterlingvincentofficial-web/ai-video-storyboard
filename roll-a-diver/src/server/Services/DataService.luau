--[[
	Player save data: load with a session lock, autosave, save on leave and on shutdown.
	If DataStores are unavailable (e.g. Studio without API access) the game still runs,
	it just doesn't save.
]]

local DataStoreService = game:GetService("DataStoreService")
local HttpService = game:GetService("HttpService")
local RunService = game:GetService("RunService")

local Shared = game:GetService("ReplicatedStorage").Shared
local GameConfig = require(Shared.Config.Game)
local Signal = require(Shared.Util.Signal)

local DataService = {}

DataService.Saving = Signal.new()

local LOCK_TIMEOUT = 30 * 60
local LOAD_RETRIES = 4

type Profile = {
	data: { [string]: any },
	canSave: boolean,
	dirty: boolean,
	lastSave: number,
}

local profiles: { [Player]: Profile } = {}
local store: DataStore? = nil
local shuttingDown = false

-- Fresh save for a brand new player. Keys are strings so it serialises cleanly.
function DataService.Template(): { [string]: any }
	return {
		version = 1,
		cash = GameConfig.StartingCash,
		totalEarned = 0,
		rebirths = 0,
		nextUid = 1,
		divers = {}, -- [uid] = diverId
		slots = {}, -- [tostring(slot)] = diver uid
		treasures = {}, -- [uid] = { id = treasureId, c = conditionId }
		pedestals = {}, -- [tostring(index)] = treasure uid
		chests = {}, -- list of { c = chestId, t = treasureId, v = conditionId }
		index = {}, -- [treasureId] = { [conditionId] = true }
		diverIndex = {}, -- [diverId] = true
		upgrades = { DiveSlots = 0, Pedestals = 0, Luck = 0, Oxygen = 0 },
		luckPotionEnds = 0,
		starterPackClaimed = false,
		receipts = {}, -- recent purchase ids, newest last
		devPasses = {}, -- Studio-only pass overrides for testing
		stats = { dives = 0, chestsOpened = 0, rolls = 0, collected = 0, krakenHits = 0 },
		lastOnline = 0,
		lock = nil,
	}
end

local function reconcile(target: { [string]: any }, template: { [string]: any })
	for key, value in template do
		if target[key] == nil then
			target[key] = if type(value) == "table" then table.clone(value) else value
		elseif type(value) == "table" and type(target[key]) == "table" and next(value) ~= nil then
			reconcile(target[key], value)
		end
	end
end

local function keyFor(player: Player): string
	return "u_" .. player.UserId
end

function DataService.Init()
	local ok, result = pcall(function()
		return DataStoreService:GetDataStore(GameConfig.DataStoreName)
	end)
	if ok then
		store = result
	else
		warn("[DataService] DataStores unavailable, progress will not save:", result)
	end
end

-- Loads (or creates) the player's data. Returns false if the player should be kicked.
function DataService.Load(player: Player): boolean
	local data: { [string]: any }? = nil
	local canSave = store ~= nil

	if store then
		local jobId = if game.JobId ~= "" then game.JobId else "studio-" .. HttpService:GenerateGUID(false)
		for attempt = 1, LOAD_RETRIES do
			local lockedElsewhere = false
			local ok, result = pcall(function()
				return (store :: DataStore):UpdateAsync(keyFor(player), function(old)
					old = old or DataService.Template()
					local lock = old.lock
					local stealLock = attempt == LOAD_RETRIES
					if lock and lock.job ~= jobId and os.time() - (lock.time or 0) < LOCK_TIMEOUT and not stealLock then
						lockedElsewhere = true
						return nil
					end
					old.lock = { job = jobId, time = os.time() }
					return old
				end)
			end)
			if ok and result then
				data = result
				break
			elseif not ok then
				warn(("[DataService] Load attempt %d failed for %s: %s"):format(attempt, player.Name, tostring(result)))
				if RunService:IsStudio() and tostring(result):find("API") then
					-- Studio without "Enable Studio Access to API Services"
					canSave = false
					break
				end
			end
			if lockedElsewhere then
				warn(("[DataService] %s's data is locked by another server, retrying"):format(player.Name))
			end
			if not player.Parent then
				return false
			end
			task.wait(if lockedElsewhere then 6 else 2)
		end
		if not data and canSave then
			return false
		end
	end

	if not player.Parent then
		return false
	end

	local loaded = data or DataService.Template()
	reconcile(loaded, DataService.Template())
	profiles[player] = {
		data = loaded,
		canSave = canSave,
		dirty = true,
		lastSave = os.clock(),
	}
	if not canSave then
		warn("[DataService] Running without saving for " .. player.Name)
	end
	return true
end

function DataService.Get(player: Player): { [string]: any }?
	local profile = profiles[player]
	return profile and profile.data
end

function DataService.IsSaving(player: Player): boolean
	local profile = profiles[player]
	return profile ~= nil and profile.canSave
end

-- Marks the player's data as changed so the next sync sends it to their client.
function DataService.MarkDirty(player: Player)
	local profile = profiles[player]
	if profile then
		profile.dirty = true
	end
end

function DataService.ConsumeDirty(player: Player): boolean
	local profile = profiles[player]
	if profile and profile.dirty then
		profile.dirty = false
		return true
	end
	return false
end

function DataService.Save(player: Player, release: boolean?): boolean
	local profile = profiles[player]
	if not profile or not profile.canSave or not store then
		return false
	end
	DataService.Saving:Fire(player, profile.data)
	local jobId = profile.data.lock and profile.data.lock.job
	local data = profile.data
	data.lastOnline = os.time()
	local ok, err = pcall(function()
		(store :: DataStore):UpdateAsync(keyFor(player), function(old)
			if old and old.lock and jobId and old.lock.job ~= jobId then
				-- another server took over this session; never overwrite its data
				return nil
			end
			data.lock = if release then nil else { job = jobId, time = os.time() }
			return data
		end)
	end)
	if not ok then
		warn(("[DataService] Save failed for %s: %s"):format(player.Name, tostring(err)))
	end
	profile.lastSave = os.clock()
	return ok
end

function DataService.Release(player: Player)
	DataService.Save(player, true)
	profiles[player] = nil
end

-- Studio/admin helper: reset a player to a fresh save.
function DataService.Wipe(player: Player)
	local profile = profiles[player]
	if profile then
		local lock = profile.data.lock
		profile.data = DataService.Template()
		profile.data.lock = lock
		profile.dirty = true
	end
end

-- Set by PlayerService: flushes things like uncollected pedestal cash before the final save.
DataService.BeforeRelease = nil :: ((Player) -> ())?

local function releaseForShutdown(player: Player)
	local hook = DataService.BeforeRelease
	if hook then
		pcall(hook, player)
	end
	DataService.Release(player)
end

function DataService.Start()
	task.spawn(function()
		while not shuttingDown do
			task.wait(5)
			for player, profile in profiles do
				if os.clock() - profile.lastSave >= GameConfig.AutosaveInterval then
					task.spawn(DataService.Save, player, false)
				end
			end
		end
	end)

	game:BindToClose(function()
		shuttingDown = true
		local pending = 0
		for player in profiles do
			pending += 1
			task.spawn(function()
				releaseForShutdown(player)
				pending -= 1
			end)
		end
		local started = os.clock()
		while pending > 0 and os.clock() - started < 25 do
			task.wait(0.1)
		end
	end)
end

return DataService
