--[[
	Boots the real server scripts from the built place in a fake Roblox runtime and plays a full session:
	join, dive, open chests, collect, roll, upgrade, events, Kraken, rebirth, leave and rejoin.

	Build first, then run from the roll-a-diver folder:
	  rojo build default.project.json -o RollADiver.rbxlx
	  lune run tests/runtime/server_test
]]

local roblox = require("@lune/roblox")
local task = require("@lune/task")
local Mock = require("./Mock")
Mock.install()

local game = Mock.load("RollADiver.rbxlx")

-- if a test step errors, the game's loops keep Lune alive; bail out after a while
task.delay(200, function()
	print("TIMEOUT: runtime test did not finish")
	require("@lune/process").exit(2)
end)
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerScriptService = game:GetService("ServerScriptService")
local Workspace = game:GetService("Workspace")

local passed, failed = 0, 0
local verbose = require("@lune/process").env.VERBOSE ~= nil
local function check(name: string, condition: any, detail: any?)
	if verbose then
		print("  . " .. name)
	end
	if condition then
		passed += 1
	else
		failed += 1
		print("FAIL  " .. name .. (if detail ~= nil then "  (" .. tostring(detail) .. ")" else ""))
	end
end

local function waitFor(predicate: () -> boolean, timeout: number?, advance: number?): boolean
	local started = os.clock()
	while os.clock() - started < (timeout or 5) do
		if predicate() then
			return true
		end
		Mock.pump(0.05, advance)
	end
	return predicate()
end

-- speed everything up
local Shared = ReplicatedStorage:FindFirstChild("Shared")
local GameConfig = Mock.require(Shared.Config.Game)
GameConfig.DiveBaseTime = 0.4
GameConfig.DiveTimePerZone = 0.1
GameConfig.DiveRestTime = 0.1
GameConfig.KrakenGrabChance = 0
GameConfig.KrakenGrabWindow = 1
GameConfig.CollectPadCooldown = 0

-- boot the server
local main = ServerScriptService.Server.Main
Mock.runScript(main)
Mock.pump(0.3)
local Registry = Mock.require(ServerScriptService.Server.Registry)
check("services registered", Registry.PlayerService ~= nil and Registry.DiverService ~= nil)
check("plots built", Workspace:FindFirstChild("Plots") and #Workspace.Plots:GetChildren() == 6)
check("harbor built", Workspace:FindFirstChild("Harbor") ~= nil)
local remotes = ReplicatedStorage:FindFirstChild("Remotes")
check("remotes created", remotes and remotes:FindFirstChild("Action") and remotes:FindFirstChild("DataSync"))

local Action = remotes.Action
local function act(player, name, ...)
	return Mock.invoke(Action, player, name, ...)
end

-- join ----------------------------------------------------------------------------------------
local player = Mock.addPlayer(101, "Tester")
check(
	"player ready",
	waitFor(function()
		return player:GetAttribute("Ready") == true
	end)
)
Mock.spawnCharacter(player)
Mock.pump(0.2)
local data = Registry.DataService.Get(player)
check("data loaded", data ~= nil)
check("starting cash", data and data.cash == GameConfig.StartingCash, data and data.cash)
check("leaderstats", player:FindFirstChild("leaderstats") ~= nil)
local plot = Registry.PlotService.Get(player)
check("plot assigned", plot ~= nil)
check("starter diver on dock", plot and #plot.divers:GetChildren() == 1)
local synced = false
for _, entry in Mock.remoteLog do
	if entry.remote == "DataSync" and entry.target == player then
		synced = true
	end
end
check("state synced to client", synced)

-- dive ----------------------------------------------------------------------------------------
check(
	"diver brings back a chest",
	waitFor(function()
		return #data.chests > 0
	end, 8, 0.2),
	#data.chests
)
check("dive counted", data.stats.dives > 0)
local diveFx = false
for _, entry in Mock.remoteLog do
	if entry.remote == "DiveFx" then
		diveFx = true
	end
end
check("dive fx broadcast", diveFx)

-- open a chest ----------------------------------------------------------------------------------
local chestId = data.chests[1].c
local opened = act(player, "OpenChest", chestId)
check("open chest ok", opened.ok, opened.err)
check("treasure added", opened.result and opened.result.uid ~= nil)
check("treasure auto placed", opened.result and opened.result.placed == true)
check("index updated", opened.result and data.index[opened.result.treasureId] ~= nil)
Mock.pump(0.1)
check("pedestal model spawned", #plot.treasures:GetChildren() >= 1)

-- income and collecting -------------------------------------------------------------------------
local income = Registry.VaultService.IncomePerSecond(player)
check("income > 0", income > 0, income)
task.wait(2.2)
local before = data.cash
local pad = plot.pedestals[1].pad
local hitPart = player.Character.HumanoidRootPart
Mock.signalFor(pad, "Touched"):Fire(hitPart)
Mock.pump(0.1)
check("collect pad pays out", data.cash > before, data.cash - before)
check("collected stat", data.stats.collected > 0)

-- roll -------------------------------------------------------------------------------------------
Registry.EconomyService.AddCash(player, 1e9)
local roll = act(player, "Roll", "Snorkel")
check("roll ok", roll.ok, roll.err)
check("roll gave diver", roll.diverId ~= nil and data.divers[roll.uid] == roll.diverId)
check("roll auto placed", roll.placed == true)
check("roll locked crate refused", act(player, "Roll", "Abyss").ok == false)
check("bad action refused", act(player, "NotAThing").ok == false)
task.wait(0.1)
check("bad arg refused", act(player, "Roll", 123).ok == false)
task.wait(0.1)
local many = 0
for _ = 1, 5 do
	task.wait(0.1)
	if act(player, "Roll", "Scuba").ok then
		many += 1
	end
end
check("repeated rolls", many == 5, many)

-- divers inventory -------------------------------------------------------------------------------
task.wait(0.1)
check("equip best divers", act(player, "EquipBestDivers").ok)
Mock.pump(0.1)
local placedCount = 0
for _ in data.slots do
	placedCount += 1
end
check("dock filled", placedCount == Registry.DiverService.SlotCount(player), placedCount)
local spareUid
for uid in data.divers do
	if not Registry.DiverService.SlotOf(data, uid) then
		spareUid = uid
	end
end
task.wait(0.1)
if spareUid then
	check("sell spare diver", act(player, "SellDiver", spareUid).ok)
end
task.wait(0.1)
local firstPlaced = data.slots["1"]
check("remove diver", act(player, "RemoveDiver", firstPlaced).ok)
task.wait(0.1)
check("place diver", act(player, "PlaceDiver", firstPlaced).ok)

-- upgrades --------------------------------------------------------------------------------------
task.wait(0.1)
local up = act(player, "BuyUpgrade", "DiveSlots")
check("buy dive slot", up.ok and data.upgrades.DiveSlots == 1, up.err)
task.wait(0.1)
check("buy pedestal", act(player, "BuyUpgrade", "Pedestals").ok and data.upgrades.Pedestals == 1)
task.wait(0.1)
check("buy luck", act(player, "BuyUpgrade", "Luck").ok)
check("slot count grew", Registry.DiverService.SlotCount(player) == 4)

-- chests: many dives, open all, vault actions -----------------------------------------------------
check(
	"more chests",
	waitFor(function()
		return #data.chests >= 5
	end, 10, 0.3),
	#data.chests
)
task.wait(0.1)
local all = act(player, "OpenAllChests")
check("open all", all.ok and #all.results >= 5, all.results and #all.results)
check("chests emptied", #data.chests == 0)
task.wait(0.1)
check("equip best treasures", act(player, "EquipBestTreasures").ok)
local unplacedUid
for uid in data.treasures do
	if not Registry.VaultService.PedestalOf(data, uid) then
		unplacedUid = uid
	end
end
if unplacedUid then
	task.wait(0.1)
	check("sell treasure", act(player, "SellTreasure", unplacedUid).ok)
end
task.wait(0.1)
local placedUid = data.pedestals["1"]
check("remove treasure", act(player, "RemoveTreasure", placedUid).ok)
task.wait(0.1)
check("place treasure", act(player, "PlaceTreasure", placedUid).ok)
task.wait(0.1)
check("sell unplaced treasures", act(player, "SellUnplacedTreasures").ok)

-- kraken grab (click the tentacle) ---------------------------------------------------------------
GameConfig.KrakenGrabChance = 1
GameConfig.KrakenGrabWindow = 30
local tentacle
check(
	"kraken grabs a diver",
	waitFor(function()
		for _, child in plot.divers:GetChildren() do
			if child.Name == "KrakenTentacle" and pcall(function()
				return child.Hitbox
			end) then
				tentacle = child
				return true
			end
		end
		return false
	end, 8, 0.05)
)
if tentacle then
	local chestsBefore = #data.chests
	local detector = tentacle.Hitbox:FindFirstChildOfClass("ClickDetector")
	Mock.signalFor(detector, "MouseClick"):Fire(player)
	Mock.pump(0.1)
	check("tentacle removed after rescue", not pcall(function()
		return tentacle.Hitbox
	end) or tentacle.Parent == nil)
	GameConfig.KrakenGrabChance = 0
	check(
		"rescued diver surfaces with bonus",
		waitFor(function()
			return #data.chests >= chestsBefore + 2
		end, 8, 0.3),
		#data.chests - chestsBefore
	)
end
GameConfig.KrakenGrabChance = 0
-- let any other grabbed divers time out
Mock.pump(0.5, 5)

-- gamepasses and products via admin commands --------------------------------------------------------
local function chat(message)
	Mock.signalFor(player, "Chatted"):Fire(message)
	Mock.pump(0.1)
end
chat("/pass AutoOpen")
check("dev pass toggled", Registry.MarketService.HasPass(player, "AutoOpen"))
local sealedBefore = #data.chests
local openedBefore = data.stats.chestsOpened
waitFor(function()
	return data.stats.chestsOpened > openedBefore
end, 6, 0.3)
check("auto open opens new chests", data.stats.chestsOpened > openedBefore and #data.chests <= sealedBefore)
chat("/pass AutoCollect")
local cashBefore = data.cash
Mock.pump(1.2)
check("auto collect pays each second", data.cash > cashBefore)
chat("/pass ExtraSlots")
check("extra slots pass", Registry.DiverService.SlotCount(player) == 6, Registry.DiverService.SlotCount(player))
chat("/product LuckPotion")
check("luck potion", data.luckPotionEnds > os.time())
chat("/product OxygenTank")
chat("/product StarterPack")
check("starter pack", data.starterPackClaimed == true)
chat("/product CashSmall")
chat("/diver Poseidon")
local hasPoseidon = false
for _, id in data.divers do
	if id == "Poseidon" then
		hasPoseidon = true
	end
end
check("admin diver", hasPoseidon)
chat("/chest 3 4")
Mock.pump(0.2)

-- server events -----------------------------------------------------------------------------------
chat("/event lowtide")
check("low tide active", Registry.EventService.IsActive("LowTide"))
check("low tide opens a zone", Registry.EconomyService.ZoneCap(player) == 4, Registry.EconomyService.ZoneCap(player))
chat("/event bloodmoon")
check("blood moon active", Registry.EventService.IsActive("BloodMoon"))
check("blood moon lighting", game:GetService("Lighting").ClockTime == 0)
chat("/endevent bloodmoon")
check("blood moon ended", not Registry.EventService.IsActive("BloodMoon"))
chat("/event kraken")
Mock.pump(0.3)
local kraken = Workspace:FindFirstChild("Kraken")
check("kraken spawned", kraken ~= nil)
if kraken then
	local maxHealth = kraken:GetAttribute("MaxHealth")
	check("kraken has health", type(maxHealth) == "number" and maxHealth > 0, maxHealth)
	check("kraken body is clickable", kraken.Head.CanQuery == true)
	local detector = kraken.Head:FindFirstChildOfClass("ClickDetector")
	local chestsBefore = #data.chests
	local openedCount = data.stats.chestsOpened
	for _ = 1, 400 do
		if not Registry.EventService.IsActive("Kraken") then
			break
		end
		Mock.signalFor(detector, "MouseClick"):Fire(player)
		task.wait(0.13)
	end
	Mock.pump(0.2)
	check("kraken defeated", not Registry.EventService.IsActive("Kraken"))
	check("defeated kraken leaves the HUD", Workspace:FindFirstChild("Kraken") == nil)
	check("kraken reward", #data.chests > chestsBefore or data.stats.chestsOpened > openedCount)
end
chat("/endevent lowtide")

-- rebirth ---------------------------------------------------------------------------------------------
task.wait(0.1)
data.cash = 0
local notEnough = act(player, "Rebirth")
check("rebirth refused without cash", notEnough.ok == false and data.rebirths == 0, notEnough.err)
data.cash = 1e12
task.wait(0.1)
local rebirth = act(player, "Rebirth")
check("rebirth ok", rebirth.ok and data.rebirths == 1, rebirth.err or notEnough.err)
check("rebirth reset cash", data.cash == GameConfig.StartingCash)
check(
	"rebirth kept Poseidon",
	(function()
		for _, id in data.divers do
			if id == "Poseidon" then
				return true
			end
		end
		return false
	end)()
)
check("rebirth cleared treasures", next(data.treasures) == nil)
check("rebirth kept upgrades", data.upgrades.DiveSlots == 1)
check("rebirth zone unlocked", Registry.EconomyService.ZoneCap(player) == 4, Registry.EconomyService.ZoneCap(player))
-- put something back in the vault so offline earnings have income to pay out
chat("/chest 1 3")
Mock.pump(0.3)
check("vault earning again", Registry.VaultService.IncomePerSecond(player) > 0)

-- second player -------------------------------------------------------------------------------------
local player2 = Mock.addPlayer(202, "Friend")
check(
	"second player ready",
	waitFor(function()
		return player2:GetAttribute("Ready") == true
	end)
)
check("second plot", Registry.PlotService.Get(player2) ~= nil and Registry.PlotService.Get(player2) ~= plot)

-- leave and rejoin -------------------------------------------------------------------------------------
local rebirthsSaved = data.rebirths
local diverCount = 0
for _ in data.divers do
	diverCount += 1
end
Mock.removePlayer(player)
Mock.pump(0.3)
check("plot released", plot.owner == nil)
local store = Mock.dataStores[GameConfig.DataStoreName]
check("saved to datastore", store and store["u_101"] ~= nil)
-- pretend they were away for an hour
local serde = require("@lune/serde")
local saved = serde.decode("json", store["u_101"])
check("lock released on leave", saved.lock == nil)
saved.lastOnline = os.time() - 3600
store["u_101"] = serde.encode("json", saved)

local rejoin = Mock.addPlayer(101, "Tester")
check(
	"rejoin ready",
	waitFor(function()
		return rejoin:GetAttribute("Ready") == true
	end)
)
local data2 = Registry.DataService.Get(rejoin)
check("progress kept", data2 and data2.rebirths == rebirthsSaved)
local diverCount2 = 0
for _ in data2.divers do
	diverCount2 += 1
end
check("divers kept", diverCount2 == diverCount, diverCount2)
local offline = false
for _, entry in Mock.remoteLog do
	if entry.remote == "OfflineEarnings" and entry.target == rejoin then
		offline = true
	end
end
check("offline earnings popup", offline)

-- wipe ------------------------------------------------------------------------------------------------
Mock.signalFor(rejoin, "Chatted"):Fire("/wipe")
Mock.pump(0.3)
local wiped = Registry.DataService.Get(rejoin)
check("wipe resets", wiped.rebirths == 0 and wiped.cash == GameConfig.StartingCash)

-- shutdown saves ----------------------------------------------------------------------------------------
for _, fn in Mock.bindToClose do
	task.spawn(fn)
end
Mock.pump(0.5)

-- warnings -------------------------------------------------------------------------------------------
local unexpected = {}
for _, message in Mock.warnings do
	if not message:find("KICK") then
		table.insert(unexpected, message)
	end
end
check("no server warnings", #unexpected == 0, table.concat(unexpected, "\n      "))

print(("\nserver runtime: %d passed, %d failed"):format(passed, failed))
local _ = roblox
-- server loops run forever, so exit explicitly
require("@lune/process").exit(if failed > 0 then 1 else 0)
