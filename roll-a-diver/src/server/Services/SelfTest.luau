--[[
	/selftest — live checks that only real Roblox can answer (DataStores, analytics, policy,
	the dive loop running, the world built, passes configured). Non-destructive.
	Results are printed to the Output window (F9 in game) and summarised as a toast.
]]

local CollectionService = game:GetService("CollectionService")
local DataStoreService = game:GetService("DataStoreService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage.Shared
local Formulas = require(Shared.Formulas)
local Monetization = require(Shared.Config.Monetization)
local Divers = require(Shared.Config.Divers)
local Treasures = require(Shared.Config.Treasures)
local Zones = require(Shared.Config.Zones)
local Crates = require(Shared.Config.Crates)
local Rewards = require(Shared.Config.Rewards)

local Services = require(script.Parent.Parent.Registry)

local SelfTest = {}

type Result = { status: "PASS" | "WARN" | "FAIL", name: string, detail: string? }

function SelfTest.Run(player: Player): { Result }
	local results: { Result } = {}
	local function add(status: "PASS" | "WARN" | "FAIL", name: string, detail: string?)
		table.insert(results, { status = status, name = name, detail = detail })
	end
	local function check(name: string, ok: boolean, detail: string?, warnOnly: boolean?)
		add(if ok then "PASS" elseif warnOnly then "WARN" else "FAIL", name, if ok then nil else detail)
	end

	-- services and remotes
	local expected = {
		"WorldBuilder",
		"PlotService",
		"DataService",
		"EconomyService",
		"AnalyticsService",
		"RewardService",
		"LeaderboardService",
		"MarketService",
		"EventService",
		"KrakenService",
		"VaultService",
		"ChestService",
		"DiverService",
		"RollService",
		"ActionService",
		"PlayerService",
	}
	local missing = {}
	for _, name in expected do
		if not Services[name] then
			table.insert(missing, name)
		end
	end
	check("All services loaded", #missing == 0, table.concat(missing, ", "))
	local remotes = ReplicatedStorage:FindFirstChild("Remotes")
	check("Remotes created", remotes ~= nil and remotes:FindFirstChild("Action") ~= nil)

	-- world
	local plots = Workspace:FindFirstChild("Plots")
	check("6 docks built", plots ~= nil and #plots:GetChildren() == 6)
	check("Harbor built", Workspace:FindFirstChild("Harbor") ~= nil)
	check("Leaderboard boards built", Workspace:FindFirstChild("EarnedLeaderboard") ~= nil)
	local terrainOk, terrainErr = pcall(function()
		local region = Region3.new(Vector3.new(-8, -8, -8), Vector3.new(8, 0, 8)):ExpandToGrid(4)
		local materials = Workspace.Terrain:ReadVoxels(region, 4)
		assert(materials[1][1][1].Name == "Water")
	end)
	check("Ocean terrain generated", terrainOk, "no water found at the map centre: " .. tostring(terrainErr))

	-- player state
	local data = Services.DataService.Get(player)
	check("Your save data loaded", data ~= nil)
	check(
		"Saving is enabled",
		Services.DataService.IsSaving(player),
		"Game Settings > Security > Enable Studio Access to API Services (and publish the game)",
		true
	)
	local plot = Services.PlotService.Get(player)
	check("You have a dock", plot ~= nil)
	if data and plot then
		local placed = 0
		for _ in data.slots do
			placed += 1
		end
		check("Diver models match your dock", #plot.divers:GetChildren() >= placed, ("%d placed"):format(placed))
		local tagged = #CollectionService:GetTagged("Diver")
		check("Divers tagged for animation", tagged >= placed)
		check("Save format is current", data.version == Services.DataService.CurrentVersion)
	end

	-- DataStores (only meaningful with API access)
	if Services.DataService.IsSaving(player) then
		local storeOk, storeErr = pcall(function()
			local store = DataStoreService:GetDataStore("RollADiver_SelfTest")
			local key = "ping_" .. player.UserId
			store:SetAsync(key, os.time())
			assert(type(store:GetAsync(key)) == "number")
		end)
		check("DataStore read/write", storeOk, tostring(storeErr))
		local orderedOk, orderedErr = pcall(function()
			DataStoreService:GetOrderedDataStore("RollADiver_TopEarned_v1"):GetSortedAsync(false, 1)
		end)
		check("Leaderboard store readable", orderedOk, tostring(orderedErr))
	else
		add("WARN", "DataStore tests skipped", "API access is off")
	end

	-- policy / analytics / chat
	check("Paid random item policy checked", player:GetAttribute("PaidRandomRestricted") ~= nil)
	local analyticsOk = pcall(function()
		(game:GetService("AnalyticsService") :: any):LogCustomEvent(player, "SelfTest", 1)
	end)
	check("Analytics events accepted", analyticsOk, "AnalyticsService rejected an event", true)
	local chat = game:GetService("TextChatService")
	check(
		"Admin chat commands registered",
		chat.ChatVersion ~= Enum.ChatVersion.TextChatService or chat:FindFirstChild("AdminCommands") ~= nil
	)

	-- config integrity
	local configOk, configErr = pcall(function()
		for _, crate in Crates.List do
			for _, entry in crate.pool do
				assert(Divers.ById[entry.diver], crate.id .. " -> " .. entry.diver)
			end
		end
		for _, zone in Zones.List do
			assert(Treasures.ByZone[zone.id], "no treasures in " .. zone.id)
		end
		assert(Formulas.rebirthCost(0) > 0)
		assert(#Rewards.Wheel > 0 and #Rewards.Daily == 7)
	end)
	check("Game config is valid", configOk, tostring(configErr))

	-- monetization setup
	local unset = {}
	for _, pass in Monetization.Passes do
		if pass.assetId == 0 then
			table.insert(unset, pass.name)
		end
	end
	for _, product in Monetization.Products do
		if product.assetId == 0 then
			table.insert(unset, product.name)
		end
	end
	check(
		"Gamepasses and products have ids",
		#unset == 0,
		("%d not set up yet: %s"):format(#unset, table.concat(unset, ", ")),
		true
	)
	check("Group reward configured", Rewards.GroupId ~= 0, "Rewards.GroupId is 0 (group reward off)", true)

	-- imported 3D models (optional)
	local assets = ReplicatedStorage:FindFirstChild("Assets")
	local models = assets and assets:FindFirstChild("Models")
	local count = if models then #models:GetChildren() else 0
	check(
		"Imported 3D models found",
		count > 0,
		"none yet — the game uses its built-in models (see MODELS.md to import the Higgsfield ones)",
		true
	)

	-- dive loop actually running (waits up to 20 seconds for a diver to change phase)
	if plot then
		local diver = plot.divers:FindFirstChildWhichIsA("Model")
		if diver then
			local startPhase = diver:GetAttribute("PhaseStart")
			local started = os.clock()
			while os.clock() - started < 20 and diver.Parent and diver:GetAttribute("PhaseStart") == startPhase do
				task.wait(0.25)
			end
			check(
				"Dive loop is running",
				diver:GetAttribute("PhaseStart") ~= startPhase,
				"no diver phase change in 20s"
			)
		else
			add("WARN", "Dive loop not checked", "no diver on your dock")
		end
	end

	return results
end

function SelfTest.Report(player: Player): string
	local results = SelfTest.Run(player)
	local counts = { PASS = 0, WARN = 0, FAIL = 0 }
	print("========== Roll a Diver self-test ==========")
	for _, result in results do
		counts[result.status] += 1
		print(("[%s] %s%s"):format(result.status, result.name, if result.detail then " — " .. result.detail else ""))
		if result.status ~= "PASS" then
			Services.PlayerService.Notify(
				player,
				("%s: %s"):format(result.status, result.name),
				if result.status == "FAIL" then "Danger" else "Info"
			)
		end
	end
	local summary = ("Self-test: %d PASS, %d WARN, %d FAIL (details in Output / F9)"):format(
		counts.PASS,
		counts.WARN,
		counts.FAIL
	)
	print(summary)
	return summary
end

return SelfTest
