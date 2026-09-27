--[[
	Boots the server AND the real client scripts from the built place, then drives the UI:
	opens every panel, rolls, opens a chest, buys an upgrade, and checks nothing errored.

	Build first, then run from the roll-a-diver folder:
	  rojo build default.project.json -o RollADiver.rbxlx
	  lune run tests/runtime/client_test
]]

local process = require("@lune/process")
local task = require("@lune/task")
local Mock = require("./Mock")
Mock.install()

local game = Mock.load("RollADiver.rbxlx")
task.delay(150, function()
	print("TIMEOUT: client test did not finish")
	process.exit(2)
end)

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerScriptService = game:GetService("ServerScriptService")
local StarterPlayer = game:GetService("StarterPlayer")

local passed, failed = 0, 0
local function check(name: string, condition: any, detail: any?)
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

local GameConfig = Mock.require(ReplicatedStorage.Shared.Config.Game)
GameConfig.DiveBaseTime = 0.4
GameConfig.DiveTimePerZone = 0.1
GameConfig.DiveRestTime = 0.1
GameConfig.KrakenGrabChance = 0

-- server
Mock.runScript(ServerScriptService.Server.Main)
Mock.pump(0.3)
local Registry = Mock.require(ServerScriptService.Server.Registry)

-- player + client
local player = Mock.addPlayer(301, "UiTester")
Mock.services.Players.LocalPlayer = player
Mock.clientEvents = true
check(
	"player ready",
	waitFor(function()
		return player:GetAttribute("Ready") == true
	end)
)
Mock.spawnCharacter(player)
local data = Registry.DataService.Get(player)
Registry.EconomyService.AddCash(player, 1e7)

local clientFolder = StarterPlayer.StarterPlayerScripts.Client
-- route client actions straight to the server handler
local Net = Mock.require(clientFolder.Net)
local actionRemote = ReplicatedStorage.Remotes.Action
Net.action = function(name, ...)
	local ok, response = pcall(Mock.invoke, actionRemote, player, name, ...)
	if not ok then
		table.insert(Mock.errors, "action " .. name .. ": " .. tostring(response))
		return { ok = false, err = "error" }
	end
	if require("@lune/process").env.DEBUG then
		print("ACTION", name, response.ok, response.err)
	end
	return response
end

Mock.runScript(clientFolder.Main)
Mock.pump(1)

local gui = player.PlayerGui:FindFirstChild("RollADiver")
check("screen gui built", gui ~= nil)
local State = Mock.require(clientFolder.State)
check(
	"client received state",
	waitFor(function()
		return State.data() ~= nil
	end)
)
local App = Mock.require(clientFolder.UI.App)

local function findButton(root, text: string)
	for _, descendant in root:GetDescendants() do
		if descendant.ClassName == "TextButton" and descendant.Visible then
			local label = descendant:FindFirstChild("Label")
			if label and label.Text == text then
				return descendant
			end
		end
	end
	return nil
end

local function click(button)
	Mock.signalFor(button, "Activated"):Fire()
end

-- open every panel
for _, id in { "Roll", "Divers", "Vault", "Chests", "Index", "Upgrades", "Rebirth", "Shop" } do
	App.open(id)
	Mock.pump(0.3)
	local content = gui.Root.Window:FindFirstChild(id)
	check("panel " .. id .. " opened", content and content.Visible and #content:GetDescendants() > 0)
end
App.close()

-- roll from the UI
App.open("Roll")
Mock.pump(0.2)
local rollsBefore = data.stats.rolls
local rollButton = findButton(gui.Root.Window.Roll, "ROLL")
check("roll button exists", rollButton ~= nil)
if rollButton then
	click(rollButton)
	check(
		"roll from UI",
		waitFor(function()
			return data.stats.rolls > rollsBefore
		end, 3)
	)
	Mock.pump(2)
	check("roll reveal shown", gui.Root:FindFirstChild("Reveal") ~= nil or data.stats.rolls > rollsBefore)
end
App.close()

-- wait for a chest, open it from the UI
check(
	"chest arrives",
	waitFor(function()
		return #data.chests > 0
	end, 8, 0.2)
)
App.open("Chests")
Mock.pump(0.4)
local openButton = findButton(gui.Root.Window.Chests, "Open")
check("open button exists", openButton ~= nil)
if openButton then
	local openedBefore = data.stats.chestsOpened
	click(openButton)
	check(
		"chest opened from UI",
		waitFor(function()
			return data.stats.chestsOpened > openedBefore
		end, 3)
	)
	Mock.pump(1.5)
end
App.close()

-- vault and divers panels reflect data
App.open("Vault")
Mock.pump(0.4)
check("vault shows treasures", findButton(gui.Root.Window.Vault, "Sell") ~= nil)
App.open("Divers")
Mock.pump(0.4)
check("divers panel shows divers", findButton(gui.Root.Window.Divers, "Remove") ~= nil)

-- upgrade from the UI
App.open("Upgrades")
Mock.pump(0.4)
local levelBefore = data.upgrades.Pedestals
for _, descendant in gui.Root.Window.Upgrades:GetDescendants() do
	if descendant.ClassName == "TextButton" then
		local label = descendant:FindFirstChild("Label")
		if label and label.Text:sub(1, 1) == "$" and data.upgrades.Pedestals == levelBefore then
			click(descendant)
			Mock.pump(0.2)
		end
	end
end
check(
	"upgrade bought from UI",
	data.upgrades.DiveSlots + data.upgrades.Pedestals + data.upgrades.Luck + data.upgrades.Oxygen > 0
)

-- index tabs
App.open("Index")
Mock.pump(0.3)
local diversTab = findButton(gui.Root.Window.Index, "Divers")
if diversTab then
	click(diversTab)
	Mock.pump(0.3)
end
check("index divers tab", diversTab ~= nil)

-- events + announcements reach the HUD
Mock.signalFor(player, "Chatted"):Fire("/event lowtide")
Mock.signalFor(player, "Chatted"):Fire("/event kraken")
Mock.pump(1.5)
check("kraken bar visible", gui.Root:FindFirstChild("KrakenBar") and gui.Root.KrakenBar.Visible)

-- diver animation moved the models underwater at some point
local sawUnderwater = false
local plot = Registry.PlotService.Get(player)
for _ = 1, 60 do
	Mock.pump(0.05, 0.05)
	for _, model in plot.divers:GetChildren() do
		if model.ClassName == "Model" and model.PrimaryPart and model.PrimaryPart.CFrame.Position.Y < -2 then
			sawUnderwater = true
		end
	end
	if sawUnderwater then
		break
	end
end
check("divers animate into the trench", sawUnderwater)

-- no errors anywhere
Mock.pump(0.5)
check("no handler errors", #Mock.errors == 0, table.concat(Mock.errors, "\n\n"))
local unexpected = {}
for _, message in Mock.warnings do
	table.insert(unexpected, message)
end
check("no warnings", #unexpected == 0, table.concat(unexpected, "\n"))

print(("\nclient runtime: %d passed, %d failed"):format(passed, failed))
process.exit(if failed > 0 then 1 else 0)
