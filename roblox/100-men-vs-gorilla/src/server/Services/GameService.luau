-- The game loop: waves 1-100, boss waves, the Banana Stash's health, game over and restart.
-- Public state lives as attributes on ReplicatedStorage.GameState so every HUD can read it.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local EnemyDefs = require(Shared.Config.Enemies)
local Net = require(Shared.Net)
local Waves = require(Shared.Config.Waves)

local Economy = require(script.Parent.Economy)
local EnemyService = require(script.Parent.EnemyService)
local UnitService = require(script.Parent.UnitService)

local GameService = {}

local BASE_MAX_HP = 1000

-- Reused if it already exists, so a GameState placed in ReplicatedStorage in Studio (with a
-- StartWave attribute) works too.
local state = ReplicatedStorage:FindFirstChild("GameState") or Instance.new("Configuration")
state.Name = "GameState"
state:SetAttribute("Wave", 0)
state:SetAttribute("TotalWaves", Waves.Total)
state:SetAttribute("Phase", "Intermission") -- Intermission | Wave | GameOver | Victory
state:SetAttribute("NextWaveAt", 0)
state:SetAttribute("BaseHp", BASE_MAX_HP)
state:SetAttribute("BaseMaxHp", BASE_MAX_HP)
state:SetAttribute("Boss", "")
-- Jump to a later wave for testing: set StartWave on ReplicatedStorage.GameState while the intro
-- plays, or on a GameState you put there in Studio before pressing Play.
state:SetAttribute("StartWave", state:GetAttribute("StartWave") or 1)
state.Parent = ReplicatedStorage

local gameEvent = Net.event("GameEvent")
local INTRO_MAX = 38 -- seconds a joining player may spend in the intro before the game starts anyway
local joinedAt: { [Player]: number } = {}
Net.event("IntroDone").OnServerEvent:Connect(function(p: Player)
	p:SetAttribute("IntroDone", true)
end)
local baseHp = BASE_MAX_HP
local running = 0 -- bumps on restart so old wave threads stop
local lostRun = 0 -- the run whose stash fell; it can't be un-lost by a heal

local function now(): number
	return workspace:GetServerTimeNow()
end

EnemyService.onBaseDamage = function(amount: number)
	if state:GetAttribute("Phase") ~= "Wave" and state:GetAttribute("Phase") ~= "Intermission" then
		return
	end
	baseHp = math.max(0, baseHp - amount)
end
EnemyService.onReward = function(amount: number)
	Economy.addAll(amount)
end
UnitService.onHeal = function(amount: number)
	local phase = state:GetAttribute("Phase")
	if baseHp <= 0 or (phase ~= "Wave" and phase ~= "Intermission") then
		return -- medics can't revive a fallen stash
	end
	baseHp = math.min(BASE_MAX_HP, baseHp + amount)
end

local function spawnGroup(run: number, wave, group)
	for _ = 1, group.Count do
		if running ~= run then
			return
		end
		EnemyService.spawn(group.Type, group.Path or "North", wave.HealthMult)
		task.wait(group.Gap)
	end
end

local function bossHealthMult(n: number): number
	return 1 + math.max(0, n // 10 - 1) * 0.6
end

local function runWave(run: number, n: number)
	local wave = Waves.get(n)
	state:SetAttribute("Wave", n)
	state:SetAttribute("Phase", "Wave")
	state:SetAttribute("Boss", wave.Boss or "")
	gameEvent:FireAllClients("WaveStart", n, wave.Boss)
	local spawning = 0
	for i, group in wave.Groups do
		spawning += 1
		task.delay((i - 1) * 2.2, function()
			spawnGroup(run, wave, group)
			spawning -= 1
		end)
	end
	if wave.Boss then
		spawning += 1
		task.delay(4, function()
			if running ~= run then
				return
			end
			gameEvent:FireAllClients("BossIncoming", wave.Boss, EnemyDefs[wave.Boss].DisplayName)
			task.wait(2.5)
			if running == run then
				EnemyService.spawn(wave.Boss, "North", bossHealthMult(n))
			end
			spawning -= 1
		end)
	end
	-- wait for the wave to be fully spawned and wiped (or the stash to fall)
	task.wait(1)
	while running == run and (spawning > 0 or EnemyService.count() > 0) do
		if baseHp <= 0 or lostRun == run then
			return false
		end
		task.wait(0.25)
	end
	if running ~= run or lostRun == run then
		return false
	end
	local bonus = 40 + n * 12
	Economy.addAll(bonus)
	gameEvent:FireAllClients("WaveClear", n, bonus)
	return true
end

-- Wave 1 waits until every player has finished (or skipped) the intro cutscene.
local function waitForIntros(run: number)
	state:SetAttribute("Phase", "Intro")
	while running == run do
		local waiting = false
		for _, p in Players:GetPlayers() do
			if not p:GetAttribute("IntroDone") and os.clock() - (joinedAt[p] or 0) < INTRO_MAX then
				waiting = true
			end
		end
		if not waiting and #Players:GetPlayers() > 0 then
			return
		end
		task.wait(0.25)
	end
end

local function gameLoop(run: number)
	waitForIntros(run)
	if running ~= run then
		return
	end
	local startWave = math.clamp(state:GetAttribute("StartWave") or 1, 1, Waves.Total)
	state:SetAttribute("Phase", "Intermission")
	state:SetAttribute("NextWaveAt", now() + Waves.FirstDelay)
	task.wait(Waves.FirstDelay)
	for n = startWave, Waves.Total do
		if running ~= run then
			return
		end
		local cleared = runWave(run, n)
		if running ~= run then
			return
		end
		if not cleared then
			GameService.gameOver(run)
			return
		end
		if n == Waves.Total then
			state:SetAttribute("Phase", "Victory")
			gameEvent:FireAllClients("Victory")
			-- celebrate, then start a fresh game
			task.wait(15)
			if running == run then
				GameService.restart()
			end
			return
		end
		state:SetAttribute("Phase", "Intermission")
		state:SetAttribute("NextWaveAt", now() + Waves.Intermission)
		task.wait(Waves.Intermission)
	end
end

function GameService.start()
	running += 1
	baseHp = BASE_MAX_HP
	state:SetAttribute("BaseHp", baseHp)
	task.spawn(gameLoop, running)
end

function GameService.restart()
	EnemyService.clear()
	UnitService.clear()
	Economy.resetAll()
	GameService.start()
end

-- Called by the heartbeat the moment the stash falls, and by the wave loop; only the first runs.
function GameService.gameOver(run: number)
	if running ~= run or lostRun == run then
		return
	end
	lostRun = run
	state:SetAttribute("Phase", "GameOver")
	gameEvent:FireAllClients("GameOver", state:GetAttribute("Wave"))
	task.wait(7)
	if running ~= run then
		return
	end
	GameService.restart()
end

-- One service erroring must not stop the others (or the flushes and the game-over check).
local lastWarn = 0
local function safely(name: string, fn: (...any) -> (), ...)
	local ok, err = pcall(fn, ...)
	if not ok and os.clock() - lastWarn > 2 then
		lastWarn = os.clock()
		warn(`[100 Men] {name} failed: {err}`)
	end
end

-- per-frame heartbeat for every service
RunService.Heartbeat:Connect(function(dt)
	safely("EnemyService.step", EnemyService.step, dt)
	safely("UnitService.step", UnitService.step)
	safely("EnemyService.flush", EnemyService.flush)
	safely("UnitService.flush", UnitService.flush)
	local shown = math.floor(baseHp + 0.5)
	if state:GetAttribute("BaseHp") ~= shown then
		if shown < (state:GetAttribute("BaseHp") or shown) then
			gameEvent:FireAllClients("BaseHit", shown)
		end
		state:SetAttribute("BaseHp", shown)
	end
	if baseHp <= 0 and state:GetAttribute("Phase") == "Wave" then
		task.spawn(GameService.gameOver, running)
	end
end)

local function onJoin(p: Player)
	joinedAt[p] = os.clock()
	Economy.setup(p)
end
Players.PlayerAdded:Connect(onJoin)
for _, p in Players:GetPlayers() do
	onJoin(p)
end
Players.PlayerRemoving:Connect(function(p)
	joinedAt[p] = nil
end)
Players.PlayerRemoving:Connect(UnitService.removeOwner)

return GameService
