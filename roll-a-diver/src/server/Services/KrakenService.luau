--[[
	The Kraken boss: rises in the channel, every click deals damage,
	and everyone who helped gets chests from their deepest unlocked zone when it is defeated.
]]

local Players = game:GetService("Players")
local Workspace = game:GetService("Workspace")

local Shared = game:GetService("ReplicatedStorage").Shared
local ModelFactory = require(Shared.ModelFactory)
local GameConfig = require(Shared.Config.Game)

local Server = script.Parent.Parent
local Services = require(Server.Registry)
local Layout = require(Server.Layout)

local KrakenService = {}

local current: Model? = nil
local contributions: { [number]: number } = {}
local lastClick: { [Player]: number } = {}
local health = 0
local maxHealth = 0
local defeated = false
local riseThread: thread? = nil

local RISE_DEPTH = 70

local function moveTo(model: Model, from: Vector3, to: Vector3, seconds: number)
	local steps = math.max(1, math.floor(seconds * 15))
	for i = 1, steps do
		if model.Parent == nil then
			return
		end
		local alpha = i / steps
		local eased = 1 - (1 - alpha) ^ 3
		model:PivotTo(CFrame.new(from:Lerp(to, eased)))
		task.wait(seconds / steps)
	end
end

local function reward()
	local total = 0
	for _, damage in contributions do
		total += damage
	end
	if total <= 0 then
		return
	end
	for userId, damage in contributions do
		local player = Players:GetPlayerByUserId(userId)
		if player and Services.DataService.Get(player) then
			local share = damage / total
			local count = math.clamp(1 + math.floor(share * 8), 1, 5)
			local luck = Services.EconomyService.LuckMult(player) * 3
			Services.ChestService.GrantFromZone(player, Services.EconomyService.ZoneCap(player), count, luck)
			Services.PlayerService.Notify(
				player,
				("Kraken defeated! You dealt %d%% of the damage: +%d chests"):format(math.floor(share * 100), count),
				"Success"
			)
		end
	end
end

local function onClick(player: Player)
	if defeated or not current then
		return
	end
	local t = os.clock()
	if t - (lastClick[player] or 0) < GameConfig.KrakenClickCooldown then
		return
	end
	lastClick[player] = t
	local data = Services.DataService.Get(player)
	if not data then
		return
	end
	local damage = 1 + data.rebirths
	health = math.max(0, health - damage)
	contributions[player.UserId] = (contributions[player.UserId] or 0) + damage
	data.stats.krakenHits += 1
	current:SetAttribute("Health", health)
	if health <= 0 then
		defeated = true
		Services.AnnouncementService.Announce("THE KRAKEN HAS BEEN DEFEATED!", Color3.fromRGB(120, 255, 140), false)
		reward()
		Services.EventService.EndEvent("Kraken")
	end
end

function KrakenService.Spawn()
	KrakenService.Despawn()
	defeated = false
	table.clear(contributions)
	table.clear(lastClick)

	local players = #Players:GetPlayers()
	local rebirthSum = 0
	for _, player in Players:GetPlayers() do
		local data = Services.DataService.Get(player)
		if data then
			rebirthSum += data.rebirths
		end
	end
	local averageRebirth = if players > 0 then rebirthSum / players else 0
	maxHealth = math.floor(GameConfig.KrakenBaseHealth * math.max(1, players) * (1 + averageRebirth))
	health = maxHealth

	local model = ModelFactory.kraken()
	model:SetAttribute("MaxHealth", maxHealth)
	model:SetAttribute("Health", health)
	for _, part in model:GetDescendants() do
		if part:IsA("BasePart") and (part.Name == "Head" or part.Name == "Mantle" or part.Name == "Hitbox") then
			-- ModelFactory parts are non-queryable; clicks need raycasts to hit them
			part.CanQuery = true
			local detector = Instance.new("ClickDetector")
			detector.MaxActivationDistance = 400
			detector.MouseClick:Connect(onClick)
			detector.Parent = part
		end
	end
	local head = model:FindFirstChild("Head") :: BasePart
	local gui = Instance.new("BillboardGui")
	gui.Name = "KrakenTag"
	gui.Size = UDim2.fromOffset(300, 60)
	gui.StudsOffset = Vector3.new(0, 30, 0)
	gui.AlwaysOnTop = true
	gui.Adornee = head
	local label = Instance.new("TextLabel")
	label.Size = UDim2.fromScale(1, 1)
	label.BackgroundTransparency = 1
	label.Font = Enum.Font.FredokaOne
	label.TextScaled = true
	label.Text = "🦑 THE KRAKEN - CLICK IT!"
	label.TextColor3 = Color3.fromRGB(255, 120, 200)
	local stroke = Instance.new("UIStroke")
	stroke.Thickness = 3
	stroke.Parent = label
	label.Parent = gui
	gui.Parent = model

	local target = Layout.KrakenPosition
	local start = target - Vector3.new(0, RISE_DEPTH, 0)
	model:PivotTo(CFrame.new(start))
	model.Parent = Workspace
	current = model
	riseThread = task.spawn(moveTo, model, start, target, 4)
end

function KrakenService.Despawn()
	local model = current
	current = nil
	if not model then
		return
	end
	if riseThread then
		pcall(task.cancel, riseThread)
		riseThread = nil
	end
	-- so the HUD stops showing it and a new Kraken never gets confused with this one
	model.Name = "SinkingKraken"
	model:SetAttribute("Health", nil)
	model:SetAttribute("MaxHealth", nil)
	for _, detector in model:GetDescendants() do
		if detector:IsA("ClickDetector") then
			detector:Destroy()
		end
	end
	local from = model:GetPivot().Position
	task.spawn(function()
		moveTo(model, from, from - Vector3.new(0, RISE_DEPTH, 0), 4)
		model:Destroy()
	end)
	if not defeated then
		Services.AnnouncementService.Announce(
			"The Kraken sank back into the deep...",
			Color3.fromRGB(200, 90, 255),
			false
		)
	end
end

return KrakenService
