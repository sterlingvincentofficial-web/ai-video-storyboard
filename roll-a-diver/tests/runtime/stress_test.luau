--[[
	Stress test: 4 players play randomly on one server for a long stretch of accelerated game time.
	Events fire, the Kraken spawns, players leave and rejoin. At the end there must be no errors,
	every save must be valid, and the world must stay within a part budget.

	Build first, then run from the roll-a-diver folder:
	  rojo build default.project.json -o RollADiver.rbxlx
	  lune run tests/runtime/stress_test
]]

local process = require("@lune/process")
local task = require("@lune/task")
local roblox = require("@lune/roblox")
local Mock = require("./Mock")
Mock.install()

local game = Mock.load("RollADiver.rbxlx")
task.delay(280, function()
	print("TIMEOUT: stress test did not finish")
	process.exit(2)
end)

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerScriptService = game:GetService("ServerScriptService")
local Workspace = game:GetService("Workspace")

local passed, failed = 0, 0
local function check(name: string, condition: any, detail: any?)
	if condition then
		passed += 1
	else
		failed += 1
		print("FAIL  " .. name .. (if detail ~= nil then "  (" .. tostring(detail) .. ")" else ""))
	end
end

local Shared = ReplicatedStorage.Shared
local GameConfig = Mock.require(Shared.Config.Game)
GameConfig.DiveBaseTime = 0.5
GameConfig.DiveTimePerZone = 0.2
GameConfig.DiveRestTime = 0.2
GameConfig.KrakenGrabChance = 0.1
GameConfig.KrakenGrabWindow = 2
GameConfig.CollectPadCooldown = 0
GameConfig.AutosaveInterval = 5
GameConfig.Events.LowTide = { interval = 40, duration = 10, firstDelay = 5 }
GameConfig.Events.BloodMoon = { interval = 60, duration = 15, firstDelay = 15 }
GameConfig.Events.Kraken = { interval = 50, duration = 12, firstDelay = 10 }
GameConfig.Events.WarningTime = 2
GameConfig.KrakenBaseHealth = 20

Mock.runScript(ServerScriptService.Server.Main)
Mock.pump(0.3)
local Registry = Mock.require(ServerScriptService.Server.Registry)
local Action = ReplicatedStorage.Remotes.Action

local function act(player, name, ...)
	return Mock.invoke(Action, player, name, ...)
end

local players = {}
local nextId = 1000
local function join()
	nextId += 1
	local player = Mock.addPlayer(nextId, "Stress" .. nextId)
	local started = os.clock()
	while player:GetAttribute("Ready") ~= true and os.clock() - started < 5 do
		Mock.pump(0.05)
	end
	Mock.spawnCharacter(player)
	Registry.EconomyService.AddCash(player, 5e5)
	table.insert(players, player)
	return player
end

for _ = 1, 4 do
	join()
end
check("4 players joined", #players == 4)

local CRATES = { "Snorkel", "Scuba", "Deep" }
local UPGRADES = { "DiveSlots", "Pedestals", "Luck", "Oxygen" }
local actionsRun = 0
local rejoins = 0

local function randomAction(player)
	local data = Registry.DataService.Get(player)
	if not data then
		return
	end
	local roll = math.random(1, 12)
	if roll == 1 then
		act(player, "Roll", CRATES[math.random(1, #CRATES)])
	elseif roll == 2 then
		act(player, "OpenAllChests")
	elseif roll == 3 and #data.chests > 0 then
		act(player, "OpenChest", data.chests[1].c)
	elseif roll == 4 then
		act(player, "EquipBestTreasures")
	elseif roll == 5 then
		act(player, "EquipBestDivers")
	elseif roll == 6 then
		act(player, "BuyUpgrade", UPGRADES[math.random(1, #UPGRADES)])
	elseif roll == 7 then
		act(player, "SellUnplacedTreasures")
	elseif roll == 8 then
		act(player, "Spin")
	elseif roll == 9 then
		act(player, "ClaimDaily")
	elseif roll == 10 then
		-- walk onto a random collect pad
		local plot = Registry.PlotService.Get(player)
		local root = player.Character and player.Character:FindFirstChild("HumanoidRootPart")
		if plot and root then
			local pad = plot.pedestals[math.random(1, #plot.pedestals)].pad
			root.CFrame = pad.CFrame + roblox.Vector3.new(0, 3, 0)
			Mock.signalFor(pad, "Touched"):Fire(root)
		end
	elseif roll == 11 then
		-- click the kraken or a tentacle if there is one
		local kraken = Workspace:FindFirstChild("Kraken")
		local head = kraken and kraken:FindFirstChild("Head")
		local detector = head and head:FindFirstChildOfClass("ClickDetector")
		if detector then
			Mock.signalFor(detector, "MouseClick"):Fire(player)
		end
		local plot = Registry.PlotService.Get(player)
		if plot then
			for _, child in plot.divers:GetChildren() do
				if child.Name == "KrakenTentacle" then
					local ok, hitbox = pcall(function()
						return child.Hitbox
					end)
					local tentacleDetector = ok and hitbox and hitbox:FindFirstChildOfClass("ClickDetector")
					if tentacleDetector then
						Mock.signalFor(tentacleDetector, "MouseClick"):Fire(player)
					end
				end
			end
		end
	else
		-- rebirth when affordable
		if data.cash >= Mock.require(Shared.Formulas).rebirthCost(data.rebirths) then
			act(player, "Rebirth")
		end
	end
	actionsRun += 1
end

-- ~2 minutes of real time at 4x speed
local started = os.clock()
local lastRejoin = os.clock()
while os.clock() - started < 110 do
	for _, player in players do
		if math.random() < 0.5 then
			randomAction(player)
		end
	end
	if os.clock() - lastRejoin > 25 then
		lastRejoin = os.clock()
		local leaving = table.remove(players, math.random(1, #players))
		Mock.removePlayer(leaving)
		Mock.pump(0.3)
		join()
		rejoins += 1
	end
	Mock.pump(0.1, 0.4)
end

check("lots of actions ran", actionsRun > 500, actionsRun)
check("players left and rejoined", rejoins >= 3, rejoins)

-- every player's data is sane
for _, player in players do
	local data = Registry.DataService.Get(player)
	check(player.Name .. " data loaded", data ~= nil)
	if data then
		check(player.Name .. " cash is a real number", data.cash == data.cash and data.cash >= 0, data.cash)
		local ok, err = pcall(Mock.assertSerializable, data)
		check(player.Name .. " save is DataStore-safe", ok, err)
		local slotsOk = true
		for _, uid in data.slots do
			if not data.divers[uid] then
				slotsOk = false
			end
		end
		check(player.Name .. " dock slots valid", slotsOk)
		local pedestalsOk = true
		for _, uid in data.pedestals do
			if not data.treasures[uid] then
				pedestalsOk = false
			end
		end
		check(player.Name .. " pedestals valid", pedestalsOk)
		check(player.Name .. " made progress", data.stats.dives > 10, data.stats.dives)
	end
end

-- events actually happened
local sawEvents = { LowTide = false, BloodMoon = false, Kraken = false }
for _, entry in Mock.remoteLog do
	if entry.remote == "Announce" then
		local text = tostring(entry.args[1])
		if text:find("Low Tide") then
			sawEvents.LowTide = true
		elseif text:find("Blood Moon") then
			sawEvents.BloodMoon = true
		elseif text:find("KRAKEN") or text:find("Kraken") then
			sawEvents.Kraken = true
		end
	end
end
for name, seen in sawEvents do
	check("event fired: " .. name, seen)
end

-- part budget: a full server must stay light enough for phones
local partCount = 0
for _, descendant in Workspace:GetDescendants() do
	if descendant:IsA("BasePart") then
		partCount += 1
	end
end
print(("parts in workspace with %d players: %d"):format(#players, partCount))
check("part count within budget", partCount < 8000, partCount)

-- self-test runs without crashing
local selfTestOk, summary = pcall(Registry.SelfTest.Report, players[1])
for _, result in Registry.SelfTest.Run(players[1]) do
	if result.status ~= "PASS" then
		print(("  selftest %s: %s %s"):format(result.status, result.name, tostring(result.detail)))
	end
end
check("/selftest runs", selfTestOk, summary)
if selfTestOk then
	print(summary)
end

-- saves: stop everyone and make sure every save is valid JSON with the lock released
for _, player in table.clone(players) do
	Mock.removePlayer(player)
end
Mock.pump(1)
local store = Mock.dataStores[GameConfig.DataStoreName]
local serde = require("@lune/serde")
local savesOk, locked = 0, 0
for _, raw in store do
	local saved = serde.decode("json", raw)
	savesOk += 1
	if saved.lock ~= nil then
		locked += 1
	end
end
check("saves written", savesOk >= 4, savesOk)
check("all session locks released", locked == 0, locked)

check("no handler errors", #Mock.errors == 0, table.concat(Mock.errors, "\n\n"):sub(1, 2000))
local unexpected = {}
for _, message in Mock.warnings do
	if not message:find("KICK") then
		table.insert(unexpected, message)
	end
end
check("no server warnings", #unexpected == 0, table.concat(unexpected, "\n"):sub(1, 2000))

print(("\nstress: %d passed, %d failed"):format(passed, failed))
process.exit(if failed > 0 then 1 else 0)
