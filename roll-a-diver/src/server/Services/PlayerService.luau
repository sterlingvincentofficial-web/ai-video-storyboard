--[[
	Player lifecycle (join, spawn, leave), state sync to the client and toast notifications.
]]

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local Workspace = game:GetService("Workspace")

local Shared = game:GetService("ReplicatedStorage").Shared
local Formulas = require(Shared.Formulas)
local Remotes = require(Shared.Remotes)

local Services = require(script.Parent.Parent.Registry)

local PlayerService = {}

local ready: { [Player]: boolean } = {}

function PlayerService.Notify(player: Player, text: string, kind: string?)
	Remotes.event("Notify"):FireClient(player, text, kind or "Info")
end

function PlayerService.IsReady(player: Player): boolean
	return ready[player] == true
end

-- Everything the client UI needs, in one table.
function PlayerService.BuildSync(player: Player): { [string]: any }?
	local data = Services.DataService.Get(player)
	if not data then
		return nil
	end
	local economy = Services.EconomyService
	return {
		data = data,
		passes = Services.MarketService.GetOwned(player),
		income = Services.VaultService.IncomePerSecond(player),
		incomeMult = economy.IncomeMult(player),
		luckMult = economy.LuckMult(player),
		rollLuck = economy.RollLuck(player),
		speedMult = economy.SpeedMult(player),
		zoneCap = economy.ZoneCap(player),
		unlockedZone = Formulas.unlockedZoneIndex(data.rebirths),
		slotCount = Services.DiverService.SlotCount(player),
		pedestalCount = Services.VaultService.PedestalCount(player),
		saving = Services.DataService.IsSaving(player),
		osTime = os.time(),
		serverTime = Workspace:GetServerTimeNow(),
	}
end

local function sync(player: Player)
	local payload = PlayerService.BuildSync(player)
	if payload then
		Remotes.event("DataSync"):FireClient(player, payload)
	end
end

local function teleportToPlot(player: Player, character: Model)
	local plot = Services.PlotService.Get(player)
	if not plot then
		return
	end
	local root = character:WaitForChild("HumanoidRootPart", 10) :: BasePart?
	if root then
		task.wait()
		character:PivotTo(Services.PlotService.SpawnCFrame(plot))
	end
end

local function onPlayerAdded(player: Player)
	if not Services.DataService.Load(player) then
		if player.Parent then
			player:Kick("Your save data couldn't be loaded. Please rejoin in a minute.")
		end
		return
	end
	Services.MarketService.LoadPasses(player)
	local plot = Services.PlotService.Assign(player)
	if not plot then
		player:Kick("This server is full. Please join another one.")
		return
	end
	local data = Services.DataService.Get(player)
	assert(data)

	-- brand new player: a free starter diver so the first dive starts right away
	if next(data.divers) == nil then
		Services.DiverService.AddDiver(player, "SnorkelSam", true)
	end

	Services.EconomyService.CreateLeaderstats(player)
	Services.DiverService.Refresh(player)
	Services.VaultService.Refresh(player)
	Services.MarketService.ApplyPassPerks(player)

	-- offline earnings
	if data.lastOnline > 0 then
		local away = os.time() - data.lastOnline
		if away > 60 then
			local amount = Formulas.offlineEarnings(
				away,
				Services.VaultService.IncomePerSecond(player),
				Services.MarketService.HasPass(player, "VIP")
			)
			if amount > 0 then
				Services.EconomyService.AddCash(player, amount)
				Remotes.event("OfflineEarnings"):FireClient(player, away, amount)
			end
		end
	end
	data.lastOnline = os.time()

	ready[player] = true
	player:SetAttribute("Ready", true)
	sync(player)

	player.CharacterAdded:Connect(function(character)
		teleportToPlot(player, character)
	end)
	if player.Character then
		task.spawn(teleportToPlot, player, player.Character)
	end
end

local function beforeRelease(player: Player)
	Services.VaultService.CollectAll(player)
	local data = Services.DataService.Get(player)
	if data then
		data.lastOnline = os.time()
	end
end

local function onPlayerRemoving(player: Player)
	ready[player] = nil
	if Services.DataService.Get(player) then
		beforeRelease(player)
		Services.DataService.Release(player)
	end
	Services.DiverService.Clear(player)
	Services.VaultService.Clear(player)
	Services.PlotService.Release(player)
	Services.MarketService.Forget(player)
end

function PlayerService.Init()
	Services.DataService.BeforeRelease = beforeRelease
end

function PlayerService.Start()
	Players.PlayerAdded:Connect(onPlayerAdded)
	Players.PlayerRemoving:Connect(onPlayerRemoving)
	for _, player in Players:GetPlayers() do
		task.spawn(onPlayerAdded, player)
	end

	-- push state to clients a few times per second when something changed,
	-- and at least every 2 seconds so timers and income stay fresh
	local lastSync: { [Player]: number } = {}
	RunService.Heartbeat:Connect(function()
		local t = os.clock()
		for player in ready do
			local since = t - (lastSync[player] or 0)
			if since >= 0.2 and (Services.DataService.ConsumeDirty(player) or since > 2) then
				lastSync[player] = t
				sync(player)
			end
		end
	end)
	Players.PlayerRemoving:Connect(function(player)
		lastSync[player] = nil
	end)
end

return PlayerService
