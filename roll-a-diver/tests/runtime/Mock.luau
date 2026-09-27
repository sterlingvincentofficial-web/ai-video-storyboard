--[[
	A small fake Roblox runtime for Lune, good enough to boot the real game scripts from the built place file.

	Real instances come from Lune's roblox library (so wrong property names and bad enum values error
	exactly like in Roblox). Services with behaviour (Players, DataStores, Marketplace, RunService...)
	are replaced by mocks, and missing instance methods/events are implemented below.
]]

local fs = require("@lune/fs")
local luau = require("@lune/luau")
local roblox = require("@lune/roblox")
local serde = require("@lune/serde")
local task = require("@lune/task")

local Mock = {}

-- Signals ------------------------------------------------------------------------------------

local Signal = {}
Signal.__index = Signal

function Signal.new()
	return setmetatable({ handlers = {} }, Signal)
end

function Signal:Connect(fn)
	local handlers = self.handlers
	local entry = { fn = fn }
	table.insert(handlers, entry)
	return {
		Disconnect = function()
			local index = table.find(handlers, entry)
			if index then
				table.remove(handlers, index)
			end
		end,
		Connected = true,
	}
end

function Signal:Once(fn)
	local connection
	connection = self:Connect(function(...)
		connection.Disconnect()
		fn(...)
	end)
	return connection
end

Mock.errors = {} :: { string }

function Signal:Fire(...)
	for _, entry in table.clone(self.handlers) do
		task.spawn(function(...)
			local ok, err = xpcall(entry.fn, function(e)
				local ok2, trace = pcall(debug.traceback, tostring(e), 2)
				return if ok2 then trace else tostring(e)
			end, ...)
			if not ok then
				table.insert(Mock.errors, tostring(err))
			end
		end, ...)
	end
end

function Signal:Wait()
	local thread = coroutine.running()
	self:Once(function(...)
		task.spawn(thread, ...)
	end)
	return coroutine.yield()
end

Mock.Signal = Signal

-- Lune returns a fresh wrapper object every time an instance is accessed, so per-instance state
-- is keyed by an id stored as an attribute on the instance itself.
local nextId = 0
local function keyOf(instance): string
	local id = instance:GetAttribute("__mockId")
	if not id then
		nextId += 1
		id = "m" .. nextId
		instance:SetAttribute("__mockId", id)
	end
	return id
end
Mock.keyOf = keyOf

-- per-instance signals, created lazily
local signalStore = {}
local function signalFor(instance, name)
	local key = keyOf(instance)
	local bucket = signalStore[key]
	if not bucket then
		bucket = {}
		signalStore[key] = bucket
	end
	if not bucket[name] then
		bucket[name] = Signal.new()
	end
	return bucket[name]
end
Mock.signalFor = signalFor

local function eventProperty(className, name)
	roblox.implementProperty(className, name, function(instance)
		return signalFor(instance, name)
	end)
end

-- Clock ---------------------------------------------------------------------------------------

local clockOffset = 0
function Mock.now(): number
	return os.clock() + clockOffset
end
function Mock.advance(seconds: number)
	clockOffset += seconds
end

-- Logs ----------------------------------------------------------------------------------------

Mock.warnings = {}
Mock.clientQueue = {}
Mock.remoteLog = {} -- { remote, target, args }

-- Instance extensions -------------------------------------------------------------------------

local function modelParts(model)
	local parts = {}
	for _, d in model:GetDescendants() do
		if d:IsA("BasePart") then
			table.insert(parts, d)
		end
	end
	return parts
end

-- NOTE: Lune panics if a custom method calls another custom method, so helpers are plain functions.
local function getPivot(model)
	local primary = model.PrimaryPart
	if primary then
		return primary.CFrame
	end
	local parts = modelParts(model)
	if #parts > 0 then
		return parts[1].CFrame
	end
	return roblox.CFrame.new()
end

local invokeHandlers = {}
-- Calls the server handler directly (game code can't run inside a custom Lune method).
function Mock.invoke(remote, player, ...)
	local handler = invokeHandlers[keyOf(remote)]
	assert(handler, "no OnServerInvoke for " .. remote.Name)
	return handler(player, ...)
end

-- Registers the custom methods/properties (must run from the main script, not during require).
function Mock.install()
	roblox.implementMethod("Model", "GetPivot", function(model)
		return getPivot(model)
	end)
	roblox.implementMethod("Model", "PivotTo", function(model, target)
		local pivot = getPivot(model)
		for _, part in modelParts(model) do
			part.CFrame = target * pivot:ToObjectSpace(part.CFrame)
		end
	end)
	roblox.implementMethod("Model", "GetBoundingBox", function(model)
		local minV, maxV
		for _, part in modelParts(model) do
			local p, s = part.CFrame.Position, part.Size / 2
			local lo, hi = p - s, p + s
			minV = if minV
				then roblox.Vector3.new(math.min(minV.X, lo.X), math.min(minV.Y, lo.Y), math.min(minV.Z, lo.Z))
				else lo
			maxV = if maxV
				then roblox.Vector3.new(math.max(maxV.X, hi.X), math.max(maxV.Y, hi.Y), math.max(maxV.Z, hi.Z))
				else hi
		end
		minV = minV or roblox.Vector3.zero
		maxV = maxV or roblox.Vector3.zero
		return roblox.CFrame.new((minV + maxV) / 2), maxV - minV
	end)
	roblox.implementMethod("Instance", "WaitForChild", function(instance, name)
		local child = instance:FindFirstChild(name)
		local started = os.clock()
		while not child do
			if os.clock() - started > 5 then
				error("Infinite yield on WaitForChild(" .. name .. ") in " .. instance:GetFullName())
			end
			task.wait(0.01)
			child = instance:FindFirstChild(name)
		end
		return child
	end)
	roblox.implementMethod("Instance", "GetPropertyChangedSignal", function(instance, name)
		return signalFor(instance, "Changed:" .. name)
	end)
	roblox.implementMethod("Instance", "GetAttributeChangedSignal", function(instance, name)
		return signalFor(instance, "AttributeChanged:" .. name)
	end)
	eventProperty("BasePart", "Touched")
	eventProperty("ClickDetector", "MouseClick")
	eventProperty("TextChatCommand", "Triggered")
	eventProperty("Player", "CharacterAdded")
	eventProperty("Player", "Chatted")
	eventProperty("GuiButton", "Activated")
	eventProperty("GuiButton", "MouseButton1Down")
	eventProperty("GuiButton", "MouseButton1Up")
	eventProperty("GuiObject", "MouseLeave")
	eventProperty("ValueBase", "Changed")
	eventProperty("RemoteEvent", "OnClientEvent")
	eventProperty("RemoteEvent", "OnServerEvent")
	roblox.implementMethod("Player", "Kick", function(player, message)
		table.insert(Mock.warnings, "KICK " .. player.Name .. ": " .. tostring(message))
		player.Parent = nil
	end)
	roblox.implementMethod("Player", "GetRankInGroup", function()
		return 0
	end)
	roblox.implementMethod("Player", "IsInGroup", function()
		return true
	end)
	roblox.implementMethod("RemoteEvent", "FireClient", function(remote, player, ...)
		table.insert(Mock.remoteLog, { remote = remote.Name, target = player, args = table.pack(...) })
		if Mock.clientEvents and player == Mock.services.Players.LocalPlayer then
			table.insert(Mock.clientQueue, { remote = remote, args = table.pack(...) })
		end
	end)
	roblox.implementMethod("RemoteEvent", "FireAllClients", function(remote, ...)
		table.insert(Mock.remoteLog, { remote = remote.Name, target = "all", args = table.pack(...) })
		if Mock.clientEvents then
			table.insert(Mock.clientQueue, { remote = remote, args = table.pack(...) })
		end
	end)
	roblox.implementProperty("RemoteFunction", "OnServerInvoke", function(remote)
		return invokeHandlers[keyOf(remote)]
	end, function(remote, fn)
		invokeHandlers[keyOf(remote)] = fn
	end)
	roblox.implementMethod("Workspace", "GetServerTimeNow", function()
		return Mock.now()
	end)
	roblox.implementMethod("SoundService", "PlayLocalSound", function() end)
	for _, method in { "Clear", "FillBlock", "FillBall" } do
		roblox.implementMethod("Terrain", method, function() end)
	end
end

-- Mock services -------------------------------------------------------------------------------

local function deepCopy(value)
	if type(value) ~= "table" then
		return value
	end
	local copy = {}
	for k, v in value do
		copy[k] = deepCopy(v)
	end
	return copy
end

-- Validates the table would survive a DataStore (JSON) round trip.
local function assertSerializable(value, path)
	path = path or "data"
	local t = typeof(value)
	if t == "table" then
		local count, stringKeys, numberKeys = 0, 0, 0
		for k, v in value do
			count += 1
			if type(k) == "string" then
				stringKeys += 1
			elseif type(k) == "number" then
				numberKeys += 1
			else
				error(path .. " has a non string/number key")
			end
			assertSerializable(v, path .. "." .. tostring(k))
		end
		if stringKeys > 0 and numberKeys > 0 then
			error(path .. " mixes string and number keys (breaks DataStore JSON)")
		end
		if numberKeys > 0 and numberKeys ~= #value then
			error(path .. " is a sparse array (breaks DataStore JSON)")
		end
	elseif t ~= "string" and t ~= "number" and t ~= "boolean" and t ~= "nil" then
		error(path .. " contains a " .. t .. " which DataStores cannot save")
	end
end
Mock.assertSerializable = assertSerializable

Mock.dataStores = {} :: { [string]: { [string]: string } }

local DataStoreService = {}
function DataStoreService:GetDataStore(name)
	Mock.dataStores[name] = Mock.dataStores[name] or {}
	local storage = Mock.dataStores[name]
	local store = {}
	function store:UpdateAsync(key, transform)
		task.wait(0.01)
		local current = if storage[key] then serde.decode("json", storage[key]) else nil
		local result = transform(current)
		if result == nil then
			return nil
		end
		assertSerializable(result)
		storage[key] = serde.encode("json", result)
		return serde.decode("json", storage[key])
	end
	function store:GetAsync(key)
		return if storage[key] then serde.decode("json", storage[key]) else nil
	end
	return store
end

Mock.orderedStores = {} :: { [string]: { [string]: number } }
function DataStoreService:GetOrderedDataStore(name)
	Mock.orderedStores[name] = Mock.orderedStores[name] or {}
	local storage = Mock.orderedStores[name]
	local store = {}
	function store:SetAsync(key, value)
		assert(type(value) == "number" and value == math.floor(value), "OrderedDataStore values must be integers")
		storage[key] = value
	end
	function store:GetSortedAsync(ascending, pageSize)
		local items = {}
		for key, value in storage do
			table.insert(items, { key = key, value = value })
		end
		table.sort(items, function(a, b)
			return if ascending then a.value < b.value else a.value > b.value
		end)
		local page = {}
		for i = 1, math.min(pageSize, #items) do
			page[i] = items[i]
		end
		return {
			GetCurrentPage = function()
				return page
			end,
		}
	end
	return store
end

local playersInstance -- real Players instance (so player.Parent works)
local Players = {
	PlayerAdded = Signal.new(),
	PlayerRemoving = Signal.new(),
	LocalPlayer = nil,
	list = {},
}
function Players:GetPlayers()
	return table.clone(self.list)
end
function Players:GetPlayerByUserId(userId)
	for _, player in self.list do
		if player.UserId == userId then
			return player
		end
	end
	return nil
end
function Players:GetNameFromUserIdAsync(userId)
	return "User" .. tostring(userId)
end
function Players:GetPlayerFromCharacter(character)
	for _, player in self.list do
		if player.Character == character then
			return player
		end
	end
	return nil
end

function Mock.addPlayer(userId: number, name: string)
	local player = roblox.Instance.new("Player")
	player.Name = name
	player.DisplayName = name
	player.UserId = userId
	player.Parent = playersInstance
	local gui = roblox.Instance.new("PlayerGui")
	gui.Parent = player
	table.insert(Players.list, player)
	Players.PlayerAdded:Fire(player)
	return player
end

function Mock.spawnCharacter(player)
	local character = roblox.Instance.new("Model")
	character.Name = player.Name
	local root = roblox.Instance.new("Part")
	root.Name = "HumanoidRootPart"
	root.Parent = character
	character.PrimaryPart = root
	character.Parent = Mock.game:GetService("Workspace")
	player.Character = character
	signalFor(player, "CharacterAdded"):Fire(character)
	return character
end

function Mock.removePlayer(player)
	local index = table.find(Players.list, player)
	if index then
		table.remove(Players.list, index)
	end
	Players.PlayerRemoving:Fire(player)
	task.wait(0.1)
	player.Parent = nil
end

local heartbeat = Signal.new()
local renderStepped = Signal.new()
local RunService = {
	Heartbeat = heartbeat,
	RenderStepped = renderStepped,
	Stepped = Signal.new(),
	isServer = true,
}
function RunService:IsStudio()
	return true
end
function RunService:IsServer()
	return self.isServer
end
function RunService:IsClient()
	return not self.isServer
end
Mock.RunService = RunService

local MarketplaceService = {
	PromptGamePassPurchaseFinished = Signal.new(),
	ProcessReceipt = nil,
	prompts = {},
}
function MarketplaceService:UserOwnsGamePassAsync()
	return false
end
function MarketplaceService:PromptGamePassPurchase(_, id)
	table.insert(self.prompts, id)
end
function MarketplaceService:PromptProductPurchase(_, id)
	table.insert(self.prompts, id)
end

local MessagingService = {}
function MessagingService:PublishAsync() end
function MessagingService:SubscribeAsync() end

local CollectionService = { added = {}, removed = {} }
function CollectionService:AddTag(instance, tag)
	instance:AddTag(tag)
	if self.added[tag] then
		self.added[tag]:Fire(instance)
	end
end
function CollectionService:GetTagged(tag)
	local result = {}
	for _, d in Mock.game:GetDescendants() do
		if d:HasTag(tag) then
			table.insert(result, d)
		end
	end
	return result
end
function CollectionService:GetInstanceAddedSignal(tag)
	self.added[tag] = self.added[tag] or Signal.new()
	return self.added[tag]
end
function CollectionService:GetInstanceRemovedSignal(tag)
	self.removed[tag] = self.removed[tag] or Signal.new()
	return self.removed[tag]
end

local HttpService = {}
function HttpService:JSONEncode(value)
	return serde.encode("json", value)
end
function HttpService:JSONDecode(text)
	return serde.decode("json", text)
end
local guidCounter = 0
function HttpService:GenerateGUID()
	guidCounter += 1
	return "guid-" .. guidCounter
end

local TweenService = {}
function TweenService:Create(instance, _, goals)
	local tween = { Completed = Signal.new() }
	function tween:Play()
		for key, value in goals do
			instance[key] = value
		end
		self.Completed:Fire(roblox.Enum.PlaybackState.Completed)
	end
	return tween
end

local TextChatService = { ChatVersion = roblox.Enum.ChatVersion.LegacyChatService, OnIncomingMessage = nil }

local Debris = {}
function Debris:AddItem(instance, lifetime)
	task.delay(lifetime or 10, function()
		pcall(instance.Destroy, instance)
	end)
end

local UserInputService = { TouchEnabled = false, KeyboardEnabled = true }

local mockServices = {
	UserInputService = UserInputService,
	DataStoreService = DataStoreService,
	Players = Players,
	RunService = RunService,
	MarketplaceService = MarketplaceService,
	MessagingService = MessagingService,
	CollectionService = CollectionService,
	HttpService = HttpService,
	TweenService = TweenService,
	TextChatService = TextChatService,
	Debris = Debris,
}
Mock.services = mockServices

-- Random (not provided by Lune)
local RandomClass = {}
RandomClass.__index = RandomClass
function RandomClass.new()
	return setmetatable({}, RandomClass)
end
function RandomClass:NextNumber(min, max)
	min = min or 0
	max = max or 1
	return min + math.random() * (max - min)
end
function RandomClass:NextInteger(min, max)
	return math.random(min, max)
end

-- Script runner --------------------------------------------------------------------------------

local moduleCache = {}
local bindToClose = {}
Mock.bindToClose = bindToClose

local gameProxy

local function makeEnv(scriptInstance)
	local env = {}
	env.script = scriptInstance
	env.game = gameProxy
	env.workspace = Mock.game:GetService("Workspace")
	env.Instance = roblox.Instance
	env.Enum = roblox.Enum
	env.Random = RandomClass
	for _, name in
		{
			"Vector3",
			"Vector2",
			"CFrame",
			"Color3",
			"UDim",
			"UDim2",
			"NumberRange",
			"NumberSequence",
			"NumberSequenceKeypoint",
			"ColorSequence",
			"ColorSequenceKeypoint",
			"Rect",
			"Font",
			"TweenInfo",
			"PhysicalProperties",
			"BrickColor",
		}
	do
		env[name] = roblox[name]
	end
	if not env.TweenInfo then
		env.TweenInfo = {
			new = function(...)
				return table.pack(...)
			end,
		}
	end
	env.task = task
	env.warn = function(...)
		local parts = {}
		for i = 1, select("#", ...) do
			parts[i] = tostring((select(i, ...)))
		end
		table.insert(Mock.warnings, table.concat(parts, " "))
	end
	env.print = function() end
	env.require = function(target)
		if typeof(target) == "Instance" then
			return Mock.require(target)
		end
		return require(target)
	end
	return setmetatable(env, { __index = getfenv(1) })
end

function Mock.require(moduleScript)
	-- Lune hands out a new wrapper per access, so cache by path
	local key = moduleScript:GetFullName()
	if moduleCache[key] ~= nil then
		return moduleCache[key]
	end
	assert(moduleScript.ClassName == "ModuleScript", moduleScript:GetFullName() .. " is not a ModuleScript")
	local chunk = luau.load(moduleScript.Source, {
		debugName = moduleScript:GetFullName(),
		environment = makeEnv(moduleScript),
	})
	local result = chunk()
	moduleCache[key] = result
	return result
end

function Mock.runScript(scriptInstance)
	local chunk = luau.load(scriptInstance.Source, {
		debugName = scriptInstance:GetFullName(),
		environment = makeEnv(scriptInstance),
	})
	task.spawn(chunk)
end

-- Loads the built place and wires up the fake game.
function Mock.load(placePath: string)
	local game = roblox.deserializePlace(fs.readFile(placePath))
	Mock.game = game
	playersInstance = game:GetService("Players")
	mockServices.Workspace = nil
	gameProxy = setmetatable({}, {
		__index = function(_, key)
			if key == "GetService" then
				return function(_, name)
					return mockServices[name] or game:GetService(name)
				end
			elseif key == "BindToClose" then
				return function(_, fn)
					table.insert(bindToClose, fn)
				end
			elseif key == "JobId" then
				return ""
			elseif key == "CreatorId" then
				return 1
			elseif key == "CreatorType" then
				return roblox.Enum.CreatorType.User
			elseif key == "Workspace" then
				return game:GetService("Workspace")
			end
			local value = game[key]
			if type(value) == "function" then
				return function(_, ...)
					return value(game, ...)
				end
			end
			return value
		end,
	})
	-- Workspace.CurrentCamera for client code
	local workspace = game:GetService("Workspace")
	if not workspace:FindFirstChildOfClass("Camera") then
		local camera = roblox.Instance.new("Camera")
		camera.Parent = workspace
		workspace.CurrentCamera = camera
	end
	-- read-only in Roblox, but Lune has no default for it
	-- PHONE=1 runs the client at an iPhone landscape resolution with touch input
	local phone = require("@lune/process").env.PHONE ~= nil
	workspace.CurrentCamera.ViewportSize = if phone then roblox.Vector2.new(812, 375) else roblox.Vector2.new(1280, 720)
	UserInputService.TouchEnabled = phone
	UserInputService.KeyboardEnabled = not phone
	if not workspace:FindFirstChild("Terrain") then
		local terrain = roblox.Instance.new("Terrain")
		terrain.Parent = workspace
	end
	return game
end

-- Drives Heartbeat / RenderStepped for a while (real time).
function Mock.pump(seconds: number, advancePerStep: number?)
	local started = os.clock()
	while os.clock() - started < seconds do
		if advancePerStep then
			Mock.advance(advancePerStep)
		end
		-- deliver server -> client events outside of any custom method
		local queue = Mock.clientQueue
		Mock.clientQueue = {}
		for _, item in queue do
			signalFor(item.remote, "OnClientEvent"):Fire(table.unpack(item.args, 1, item.args.n))
		end
		heartbeat:Fire(1 / 30)
		renderStepped:Fire(1 / 30)
		task.wait(1 / 30)
	end
end

return Mock
