--[[
	Divers: inventory (add / place / remove / sell / equip best) and the dive loop.

	Each placed diver runs a small state machine on the server:
	  Idle -> Down -> Bottom -> (Grabbed) -> Up -> Idle
	The server only sets attributes on the diver model (Phase, PhaseStart, PhaseDuration, depth, glow);
	every client animates the models itself from those attributes (see client DiverAnimator).
]]

local CollectionService = game:GetService("CollectionService")
local Workspace = game:GetService("Workspace")

local Shared = game:GetService("ReplicatedStorage").Shared
local Formulas = require(Shared.Formulas)
local Format = require(Shared.Util.Format)
local ModelFactory = require(Shared.ModelFactory)
local GameConfig = require(Shared.Config.Game)
local Divers = require(Shared.Config.Divers)
local Zones = require(Shared.Config.Zones)
local Treasures = require(Shared.Config.Treasures)
local Rarities = require(Shared.Config.Rarities)
local Remotes = require(Shared.Remotes)

local Services = require(script.Parent.Parent.Registry)

local DiverService = {}

type Content = { c: string, t: string, v: string }

type Record = {
	uid: string,
	diverId: string,
	slot: number,
	model: Model,
	phase: string,
	phaseEnd: number,
	chestId: string?,
	chestCount: number,
	contents: { Content }?,
	luck: number,
	noCommon: boolean,
	durations: { bottom: number, up: number },
	diveCount: number,
	tentacle: Model?,
}

local records: { [Player]: { [number]: Record } } = {}
local random = Random.new()

local function rand(): number
	return random:NextNumber()
end

local function now(): number
	return Workspace:GetServerTimeNow()
end

-- Slots ------------------------------------------------------------------------------------

function DiverService.SlotCount(player: Player): number
	local data = Services.DataService.Get(player)
	if not data then
		return 0
	end
	return Formulas.diveSlotCount(data.upgrades.DiveSlots, Services.MarketService.HasPass(player, "ExtraSlots"))
end

local function slotOf(data: any, uid: string): number?
	for key, value in data.slots do
		if value == uid then
			return tonumber(key)
		end
	end
	return nil
end

DiverService.SlotOf = slotOf

local function newUid(data: any, prefix: string): string
	local uid = prefix .. data.nextUid
	data.nextUid += 1
	return uid
end

-- Models -----------------------------------------------------------------------------------

local function setPhase(record: Record, phase: string, duration: number)
	record.phase = phase
	record.phaseEnd = now() + duration
	local model = record.model
	model:SetAttribute("Phase", phase)
	model:SetAttribute("PhaseStart", now())
	model:SetAttribute("PhaseDuration", duration)
end

local function destroyTentacle(record: Record)
	if record.tentacle then
		record.tentacle:Destroy()
		record.tentacle = nil
	end
end

local function destroyRecord(record: Record)
	destroyTentacle(record)
	record.model:Destroy()
end

local function makeTag(model: Model, diverId: string)
	local diver = Divers.ById[diverId]
	local rarity = Rarities.ById[diver.tier]
	local head = model:FindFirstChild("Head") :: BasePart
	local gui = Instance.new("BillboardGui")
	gui.Name = "Tag"
	gui.Size = UDim2.fromOffset(180, 66)
	gui.StudsOffset = Vector3.new(0, 3.2, 0)
	gui.MaxDistance = 90
	gui.Adornee = head
	local function line(name: string, text: string, color: Color3, y: number, height: number)
		local label = Instance.new("TextLabel")
		label.Name = name
		label.BackgroundTransparency = 1
		label.Size = UDim2.fromScale(1, height)
		label.Position = UDim2.fromScale(0, y)
		label.Font = Enum.Font.FredokaOne
		label.TextScaled = true
		label.Text = text
		label.TextColor3 = color
		local stroke = Instance.new("UIStroke")
		stroke.Thickness = 2
		stroke.Parent = label
		label.Parent = gui
	end
	line("DiverName", diver.name, Color3.new(1, 1, 1), 0, 0.36)
	line("Tier", diver.tier .. "  " .. Format.multiplier(diver.luck) .. " luck", rarity.color, 0.36, 0.3)
	line("Status", "", Color3.fromRGB(170, 230, 255), 0.66, 0.34)
	gui.Parent = model
end

local function createRecord(player: Player, slot: number, uid: string, diverId: string): Record?
	local plot = Services.PlotService.Get(player)
	if not plot then
		return nil
	end
	local slotParts = plot.slots[slot]
	local model = ModelFactory.diver(diverId)
	model.Name = "Diver" .. slot
	model:SetAttribute("Home", slotParts.home)
	model:SetAttribute("Entry", slotParts.entry)
	model:SetAttribute("OwnerId", player.UserId)
	model:SetAttribute("Slot", slot)
	model:SetAttribute("DepthStuds", 0)
	model:SetAttribute("DepthMeters", 0)
	model:PivotTo(slotParts.home)
	makeTag(model, diverId)
	CollectionService:AddTag(model, "Diver")
	model.Parent = plot.divers

	local record: Record = {
		uid = uid,
		diverId = diverId,
		slot = slot,
		model = model,
		phase = "Idle",
		phaseEnd = 0,
		chestCount = 0,
		luck = 1,
		noCommon = false,
		durations = { bottom = 1, up = 1 },
		diveCount = 0,
	}
	-- stagger the first dive so a full dock doesn't move in lockstep
	setPhase(record, "Idle", GameConfig.DiveRestTime + random:NextNumber(0, 1.5))
	return record
end

-- Rebuilds the diver models on the player's dock to match their save data.
function DiverService.Refresh(player: Player)
	local data = Services.DataService.Get(player)
	local plot = Services.PlotService.Get(player)
	if not data or not plot then
		return
	end
	local playerRecords = records[player] or {}
	records[player] = playerRecords
	local slotCount = DiverService.SlotCount(player)

	for slot = 1, GameConfig.MaxDiveSlots do
		local key = tostring(slot)
		local uid = data.slots[key]
		if uid and (slot > slotCount or not data.divers[uid]) then
			data.slots[key] = nil
			uid = nil
		end
		local record = playerRecords[slot]
		if record and record.uid ~= uid then
			destroyRecord(record)
			playerRecords[slot] = nil
			record = nil
		end
		if uid and not record then
			playerRecords[slot] = createRecord(player, slot, uid, data.divers[uid]) :: Record
		end
	end

	Services.PlotService.UpdateLocks(plot, slotCount, Services.VaultService.PedestalCount(player))
	Services.DataService.MarkDirty(player)
end

function DiverService.Clear(player: Player)
	local playerRecords = records[player]
	if playerRecords then
		for _, record in playerRecords do
			destroyRecord(record)
		end
	end
	records[player] = nil
end

-- Dive loop --------------------------------------------------------------------------------

local function neighbours(playerRecords: { [number]: Record }, slot: number): { Record }
	local result = {}
	for _, other in { slot - 1, slot + 1 } do
		local record = playerRecords[other]
		if record then
			table.insert(result, record)
		end
	end
	return result
end

local function hasAbilityPlaced(playerRecords: { [number]: Record }, ability: string): boolean
	for _, record in playerRecords do
		if Divers.ById[record.diverId].ability == ability then
			return true
		end
	end
	return false
end

local function startDive(player: Player, playerRecords: { [number]: Record }, record: Record)
	local diver = Divers.ById[record.diverId]
	local maxDepth = diver.maxDepth
	local luck = diver.luck * Services.EconomyService.LuckMult(player)
	for _, neighbour in neighbours(playerRecords, record.slot) do
		local other = Divers.ById[neighbour.diverId]
		if other.ability == "ShareDepth" then
			maxDepth = math.max(maxDepth, other.maxDepth)
		elseif other.ability == "AdjacentLuck" then
			luck *= 1.5
		end
	end

	local zoneCap = Services.EconomyService.ZoneCap(player)
	if diver.ability == "IgnoreZoneLock" then
		zoneCap = #Zones.List
	end
	local reachable = Formulas.reachableZones(maxDepth, zoneCap)
	local zoneIndex = Formulas.rollZone(reachable, rand)
	local zone = Zones.List[zoneIndex]
	local bottomDepth = math.min(zone.maxDepth, maxDepth)
	local depthMeters = math.max(5, zone.minDepth + rand() * (bottomDepth - zone.minDepth))

	local speed = diver.speed * Services.EconomyService.SpeedMult(player)
	local total = Formulas.diveDuration(reachable[#reachable], speed)

	record.diveCount += 1
	record.chestId = zone.chest
	record.chestCount = if diver.ability == "DoubleEvery5" and record.diveCount % 5 == 0 then 2 else 1
	record.contents = nil
	record.luck = luck
	record.noCommon = diver.ability == "NoCommon"
	record.durations = {
		bottom = total * GameConfig.DiveBottomShare,
		up = total * (1 - GameConfig.DiveBottomShare - GameConfig.DiveDescentShare),
	}
	local model = record.model
	model:SetAttribute("DepthMeters", depthMeters)
	model:SetAttribute("DepthStuds", Formulas.depthToStuds(depthMeters))
	model:SetAttribute("ZoneName", zone.name)
	model:SetAttribute("GlowColor", nil)
	setPhase(record, "Down", total * GameConfig.DiveDescentShare)
end

-- Rolls what is inside the chests the diver is carrying and lights the glow in the best rarity colour.
local function prepareAscent(player: Player, record: Record, duration: number)
	local contents: { Content } = {}
	local bestRank = 0
	local glow: Color3? = nil
	if record.chestId and record.chestCount > 0 then
		local cursedMult = Services.EconomyService.CursedMult()
		for _ = 1, record.chestCount do
			local content = Services.ChestService.RollContents(record.chestId, record.luck, record.noCommon, cursedMult)
			table.insert(contents, content)
			local rarity = Rarities.ById[Treasures.ById[content.t].rarity]
			if rarity.rank > bestRank then
				bestRank = rarity.rank
				glow = rarity.color
			end
		end
	end
	record.contents = contents
	record.model:SetAttribute("GlowColor", glow)
	record.model:SetAttribute("GlowRank", bestRank)
	setPhase(record, "Up", duration)
	local _ = player
end

local function rescue(player: Player, record: Record)
	if record.phase ~= "Grabbed" then
		return
	end
	destroyTentacle(record)
	record.chestCount += 1
	Services.PlayerService.Notify(player, "You fought off the Kraken! +1 bonus chest", "Success")
	prepareAscent(player, record, math.max(2, record.durations.up * 0.5))
end

local function spawnTentacle(player: Player, record: Record)
	local entry = record.model:GetAttribute("Entry") :: Vector3
	local tentacle = ModelFactory.tentacle(0.9)
	tentacle.Name = "KrakenTentacle"
	tentacle:PivotTo(
		CFrame.new(entry + Vector3.new(2.5, -3, 3)) * CFrame.Angles(0, math.rad(random:NextNumber(0, 360)), 0)
	)
	local hitbox = tentacle:FindFirstChild("Hitbox") :: BasePart
	local detector = Instance.new("ClickDetector")
	detector.MaxActivationDistance = 90
	detector.Parent = hitbox
	local gui = Instance.new("BillboardGui")
	gui.Size = UDim2.fromOffset(160, 50)
	gui.StudsOffset = Vector3.new(0, 8, 0)
	gui.AlwaysOnTop = true
	gui.Adornee = hitbox
	local label = Instance.new("TextLabel")
	label.Size = UDim2.fromScale(1, 1)
	label.BackgroundTransparency = 1
	label.Font = Enum.Font.FredokaOne
	label.TextScaled = true
	label.Text = "🦑 CLICK TO SAVE!"
	label.TextColor3 = Color3.fromRGB(255, 90, 90)
	local stroke = Instance.new("UIStroke")
	stroke.Thickness = 3
	stroke.Parent = label
	label.Parent = gui
	gui.Parent = tentacle
	detector.MouseClick:Connect(function(clicker)
		if clicker == player then
			rescue(player, record)
		end
	end)
	CollectionService:AddTag(tentacle, "Tentacle")
	tentacle.Parent = record.model.Parent
	record.tentacle = tentacle
end

local function reachBottom(player: Player, playerRecords: { [number]: Record }, record: Record)
	local diver = Divers.ById[record.diverId]
	local immune = diver.ability == "KrakenImmune" or diver.ability == "KrakenTamer"
	if not immune and rand() < GameConfig.KrakenGrabChance then
		if hasAbilityPlaced(playerRecords, "KrakenTamer") then
			record.chestCount += 1
			Services.PlayerService.Notify(
				player,
				"Your Kraken Tamer turned a Kraken attack into a bonus chest!",
				"Success"
			)
		else
			spawnTentacle(player, record)
			Services.PlayerService.Notify(
				player,
				"🦑 The Kraken grabbed " .. diver.name .. "! Click the tentacle!",
				"Danger"
			)
			setPhase(record, "Grabbed", GameConfig.KrakenGrabWindow)
			return
		end
	end
	prepareAscent(player, record, record.durations.up)
end

local function surface(player: Player, record: Record)
	local data = Services.DataService.Get(player)
	if data then
		data.stats.dives += 1
		Services.AnalyticsService.Step(player, "FirstDive")
		local contents = record.contents or {}
		if #contents > 0 and record.chestId then
			Services.ChestService.Grant(player, contents)
			Remotes.event("DiveFx")
				:FireAllClients(record.model, record.chestId, #contents, record.model:GetAttribute("GlowColor"))
		end
	end
	record.contents = nil
	record.model:SetAttribute("GlowColor", nil)
	setPhase(record, "Idle", GameConfig.DiveRestTime)
end

local function step()
	local t = now()
	for player, playerRecords in records do
		for _, record in playerRecords do
			if t >= record.phaseEnd then
				local ok, err = pcall(function()
					if record.phase == "Idle" then
						startDive(player, playerRecords, record)
					elseif record.phase == "Down" then
						setPhase(record, "Bottom", record.durations.bottom)
					elseif record.phase == "Bottom" then
						reachBottom(player, playerRecords, record)
					elseif record.phase == "Grabbed" then
						destroyTentacle(record)
						record.chestCount = 0
						Services.PlayerService.Notify(
							player,
							"The Kraken stole the chest! Be faster next time.",
							"Danger"
						)
						prepareAscent(player, record, record.durations.up)
					elseif record.phase == "Up" then
						surface(player, record)
					end
				end)
				if not ok then
					warn("[DiverService] dive step failed:", err)
					setPhase(record, "Idle", GameConfig.DiveRestTime)
				end
			end
		end
	end
end

-- Oxygen Tank: every diver still underwater comes up right away with its chest.
function DiverService.SurfaceAll(player: Player)
	local playerRecords = records[player]
	if not playerRecords then
		return
	end
	for _, record in playerRecords do
		if record.phase == "Down" or record.phase == "Bottom" then
			prepareAscent(player, record, 1.5)
		elseif record.phase == "Grabbed" then
			rescue(player, record)
		end
	end
end

-- Inventory --------------------------------------------------------------------------------

function DiverService.DiverCount(data: any): number
	local count = 0
	for _ in data.divers do
		count += 1
	end
	return count
end

-- Adds a diver to the inventory and puts it on the dock if there is a free slot.
function DiverService.AddDiver(player: Player, diverId: string, force: boolean?): (string?, boolean)
	local data = Services.DataService.Get(player)
	if not data or not Divers.ById[diverId] then
		return nil, false
	end
	if not force and DiverService.DiverCount(data) >= GameConfig.MaxDivers then
		return nil, false
	end
	local uid = newUid(data, "d")
	data.divers[uid] = diverId
	local isNew = not data.diverIndex[diverId]
	data.diverIndex[diverId] = true
	local slotCount = DiverService.SlotCount(player)
	for slot = 1, slotCount do
		if not data.slots[tostring(slot)] then
			data.slots[tostring(slot)] = uid
			break
		end
	end
	DiverService.Refresh(player)
	return uid, isNew
end

function DiverService.Place(player: Player, uid: string, slot: number?): (boolean, string?)
	local data = Services.DataService.Get(player)
	if not data or not data.divers[uid] then
		return false, "That diver doesn't exist"
	end
	local slotCount = DiverService.SlotCount(player)
	local current = slotOf(data, uid)
	if slot == nil then
		if current then
			return false, "Already on the dock"
		end
		for candidate = 1, slotCount do
			if not data.slots[tostring(candidate)] then
				slot = candidate
				break
			end
		end
		if not slot then
			return false, "Your dock is full. Remove a diver or buy more slots"
		end
	end
	assert(slot)
	if slot < 1 or slot > slotCount then
		return false, "That slot is locked"
	end
	if current then
		data.slots[tostring(current)] = nil
	end
	data.slots[tostring(slot)] = uid
	DiverService.Refresh(player)
	return true
end

function DiverService.Remove(player: Player, uid: string): (boolean, string?)
	local data = Services.DataService.Get(player)
	if not data then
		return false
	end
	local slot = slotOf(data, uid)
	if not slot then
		return false, "Not on the dock"
	end
	data.slots[tostring(slot)] = nil
	DiverService.Refresh(player)
	return true
end

function DiverService.Sell(player: Player, uid: string): (boolean, string?)
	local data = Services.DataService.Get(player)
	if not data or not data.divers[uid] then
		return false, "That diver doesn't exist"
	end
	if DiverService.DiverCount(data) <= 1 then
		return false, "You can't sell your last diver"
	end
	local slot = slotOf(data, uid)
	if slot then
		data.slots[tostring(slot)] = nil
	end
	local value = Formulas.diverSellValue(data.divers[uid])
	data.divers[uid] = nil
	Services.EconomyService.AddCash(player, value, "SellDiver")
	DiverService.Refresh(player)
	return true
end

-- Sells every diver that is not on the dock and is at or below the given rarity rank.
function DiverService.SellUnplaced(player: Player, maxRank: number): (number, number)
	local data = Services.DataService.Get(player)
	if not data then
		return 0, 0
	end
	local sold, total = 0, 0
	for uid, diverId in data.divers do
		local rank = Rarities.ById[Divers.ById[diverId].tier].rank
		if not slotOf(data, uid) and rank <= maxRank and DiverService.DiverCount(data) > 1 then
			total += Formulas.diverSellValue(diverId)
			data.divers[uid] = nil
			sold += 1
		end
	end
	if total > 0 then
		Services.EconomyService.AddCash(player, total, "SellDiver")
	end
	DiverService.Refresh(player)
	return sold, total
end

function DiverService.EquipBest(player: Player)
	local data = Services.DataService.Get(player)
	if not data then
		return
	end
	local uids = {}
	for uid in data.divers do
		table.insert(uids, uid)
	end
	table.sort(uids, function(a, b)
		local scoreA, scoreB = Formulas.diverScore(data.divers[a]), Formulas.diverScore(data.divers[b])
		if scoreA == scoreB then
			return a < b
		end
		return scoreA > scoreB
	end)
	table.clear(data.slots)
	for slot = 1, math.min(#uids, DiverService.SlotCount(player)) do
		data.slots[tostring(slot)] = uids[slot]
	end
	DiverService.Refresh(player)
end

function DiverService.Start()
	task.spawn(function()
		while true do
			task.wait(0.1)
			step()
		end
	end)
end

return DiverService
