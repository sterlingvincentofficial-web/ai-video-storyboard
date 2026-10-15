-- The army: placement, upgrades, selling, targeting and attacks.
-- Units are real (anchored) avatar models in workspace.Units. Attacks are decided here and sent
-- to clients as one batched "Attacks" event per frame so they can animate swings, shots and
-- projectiles; damage lands when the projectile would arrive.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local MapData = require(Shared.MapData)
local MenFactory = require(Shared.MenFactory)
local Net = require(Shared.Net)
local PathUtil = require(Shared.PathUtil)
local Units = require(Shared.Config.Units)

local Economy = require(script.Parent.Economy)
local EnemyService = require(script.Parent.EnemyService)

local UnitService = {}

UnitService.MAX_PER_PLAYER = 100 -- the "100 men" in 100 Men vs 1 Gorilla
UnitService.SELL_RATE = 0.6
local CRIT_CHANCE = 0.12
local MIN_SPACING = 2.8

local folder = Instance.new("Folder")
folder.Name = "Units"
folder.Parent = workspace

local attacksEvent = Net.event("Attacks")
local unitFxEvent = Net.event("UnitFx")

local units = {} -- uid -> unit
local nextUid = 0
local pendingAttacks = {}
local scheduled = {} -- { at, fn }

local function now(): number
	return workspace:GetServerTimeNow()
end

local function schedule(at: number, fn: () -> ())
	table.insert(scheduled, { at, fn })
end

local function groundOk(pos: Vector3): boolean
	local params = RaycastParams.new()
	params.FilterType = Enum.RaycastFilterType.Include
	params.FilterDescendantsInstances = { workspace:FindFirstChild("Map") or workspace }
	local hit = workspace:Raycast(pos + Vector3.new(0, 30, 0), Vector3.new(0, -40, 0), params)
	return hit ~= nil and (hit.Instance.Name:match("^Sand%d") ~= nil or hit.Instance.Name:match("^Plaza%d") ~= nil) and math.abs(hit.Position.Y) < 0.6
end

-- Why a spot is not placeable, or nil if it is.
function UnitService.placementProblem(pos: Vector3, ignoreUid: number?): string?
	local area = MapData.BuildArea
	if pos.X < area.Min.X or pos.X > area.Max.X or pos.Z < area.Min.Z or pos.Z > area.Max.Z then
		return "Out of bounds"
	end
	if PathUtil.distanceToPaths(EnemyService.Paths, pos) < MapData.PathWidth / 2 + 1 then
		return "Too close to the path"
	end
	local base = MapData.Base
	if (Vector3.new(pos.X, 0, pos.Z) - Vector3.new(base.X, 0, base.Z)).Magnitude < MapData.BaseRadius - 1 then
		-- inside the camp is allowed, but not on the stash itself
		if (Vector3.new(pos.X, 0, pos.Z) - Vector3.new(base.X, 0, base.Z)).Magnitude < 5 then
			return "That's the Banana Stash"
		end
	end
	for uid, u in units do
		if uid ~= ignoreUid and (u.pos - pos).Magnitude < MIN_SPACING then
			return "Too close to another man"
		end
	end
	if not groundOk(pos) then
		return "Can't stand there"
	end
	return nil
end

local function facePathYaw(pos: Vector3): CFrame
	-- face the nearest bit of trail so new men look ready
	local best, bestPos = math.huge, nil
	for _, path in EnemyService.Paths do
		for d = 0, path.length, 4 do
			local p = PathUtil.sample(path, d)
			local dist = (p - pos).Magnitude
			if dist < best then
				best, bestPos = dist, p
			end
		end
	end
	if bestPos then
		return CFrame.lookAt(pos, Vector3.new(bestPos.X, pos.Y, bestPos.Z))
	end
	return CFrame.new(pos)
end

-- Builds a man's model. With the custom rigs this is a clone; the avatar fallback yields
-- (CreateHumanoidModelFromDescription), so callers build first and re-check state afterwards.
local function buildModel(unitId: string, level: number): (Model, number)
	local model = MenFactory.build(unitId, level)
	local humanoid = model:FindFirstChildOfClass("Humanoid")
	local root = model:FindFirstChild("HumanoidRootPart") :: BasePart
	local height = model:GetAttribute("RootHeight") or ((humanoid :: Humanoid).HipHeight + root.Size.Y / 2)
	return model, height
end

local function showModel(u, model: Model, height: number, cf: CFrame)
	model:PivotTo(cf + Vector3.new(0, height, 0))
	model:SetAttribute("Uid", u.uid)
	model:SetAttribute("Owner", u.owner.UserId)
	model.Name = tostring(u.uid)
	model.Parent = folder
	MenFactory.playIdle(model)
	u.model = model
	u.height = height
end

local function destroyModel(u)
	if u.model then
		u.model:Destroy()
		u.model = nil
	end
end

function UnitService.place(player: Player, unitId: string, pos: Vector3): (boolean, string?)
	local unit = Units[unitId]
	if not unit then
		return false, "Unknown unit"
	end
	pos = Vector3.new(pos.X, 0, pos.Z)
	local function problemNow(): string?
		if (player:GetAttribute("Units") or 0) >= UnitService.MAX_PER_PLAYER then
			return `Army full ({UnitService.MAX_PER_PLAYER} men)`
		end
		return UnitService.placementProblem(pos)
	end
	local cost = unit.Levels[1].Cost
	local problem = problemNow()
	if problem then
		return false, problem
	end
	if Economy.get(player) < cost then
		return false, "Not enough cash"
	end
	local model, height = buildModel(unitId, 1)
	-- the build may have yielded: the spot, the cap or the cash can have changed meanwhile
	problem = if player.Parent then problemNow() else "Left the game"
	if problem or not Economy.spend(player, cost) then
		model:Destroy()
		return false, problem or "Not enough cash"
	end
	nextUid += 1
	local u = {
		uid = nextUid,
		unitId = unitId,
		unit = unit,
		level = 1,
		def = unit.Levels[1],
		owner = player,
		pos = pos,
		spent = cost,
		cd = now() + 0.4,
		stunUntil = 0,
		hypedUntil = 0,
		rally = 0,
	}
	showModel(u, model, height, facePathYaw(pos))
	units[u.uid] = u
	player:SetAttribute("Units", (player:GetAttribute("Units") or 0) + 1)
	unitFxEvent:FireAllClients("place", u.uid, pos)
	return true, nil
end

function UnitService.upgrade(player: Player, uid: number): (boolean, string?)
	local u = units[uid]
	if not u or u.owner ~= player then
		return false, "Not your man"
	end
	if u.busy then
		return false, "Already upgrading"
	end
	local nextDef = u.unit.Levels[u.level + 1]
	if not nextDef then
		return false, "Max level"
	end
	if not Economy.spend(player, nextDef.Cost) then
		return false, "Not enough cash"
	end
	u.busy = true
	local model, height = buildModel(u.unitId, u.level + 1)
	u.busy = false
	if units[uid] ~= u or not u.model then -- sold, cleared or owner left during the build
		model:Destroy()
		if player.Parent then
			Economy.add(player, nextDef.Cost)
		end
		return false, "That man is gone"
	end
	u.level += 1
	u.def = nextDef
	u.spent += nextDef.Cost
	local cf = u.model:GetPivot() - Vector3.new(0, u.height, 0)
	destroyModel(u)
	showModel(u, model, height, cf)
	unitFxEvent:FireAllClients("upgrade", u.uid, u.pos, u.level)
	return true, nil
end

function UnitService.sell(player: Player, uid: number): (boolean, string?)
	local u = units[uid]
	if not u or u.owner ~= player then
		return false, "Not your man"
	end
	units[uid] = nil
	Economy.add(player, u.spent * UnitService.SELL_RATE)
	player:SetAttribute("Units", math.max(0, (player:GetAttribute("Units") or 1) - 1))
	unitFxEvent:FireAllClients("sell", uid, u.pos)
	destroyModel(u)
	return true, nil
end

function UnitService.removeOwner(player: Player)
	for uid, u in units do
		if u.owner == player then
			units[uid] = nil
			destroyModel(u)
		end
	end
end

function UnitService.clear()
	for uid, u in units do
		units[uid] = nil
		destroyModel(u)
	end
end

-- Hooks the enemies use (Chucker bananas, boss slams and boulders).
function UnitService.stun(uid: number, duration: number)
	local u = units[uid]
	if u then
		u.stunUntil = math.max(u.stunUntil, now() + duration)
		unitFxEvent:FireAllClients("stun", uid, u.pos, duration)
	end
end

function UnitService.stunNear(pos: Vector3, radius: number, duration: number)
	for uid, u in units do
		if (u.pos - pos).Magnitude <= radius then
			UnitService.stun(uid, duration)
		end
	end
end

function UnitService.findNear(pos: Vector3, radius: number): (number?, Vector3?)
	local best, bestD = nil, radius
	for uid, u in units do
		local d = (u.pos - pos).Magnitude
		if d <= bestD then
			best, bestD = uid, d
		end
	end
	return best, best and units[best].pos + Vector3.new(0, 3, 0)
end

-- ---------------------------------------------------------------- combat

local function faceTarget(u, target: Vector3)
	local flat = Vector3.new(target.X, u.pos.Y, target.Z)
	if u.model and (flat - u.pos).Magnitude > 0.1 then
		u.model:PivotTo(CFrame.lookAt(u.pos, flat) + Vector3.new(0, u.height, 0))
	end
end

local function pickTarget(u, list)
	local def = u.def
	local best, bestScore = nil, -math.huge
	for _, e in list do
		if e.targetable then
			local d = (Vector3.new(e.pos.X, 0, e.pos.Z) - u.pos).Magnitude - e.radius
			if d <= def.Range then
				-- hunters go for bosses, then the beefiest; everyone else hits whoever is closest to the stash
				local score = if u.unit.Kind == "Bullet" then (if e.boss then 1e9 else 0) + e.hp else -e.remaining
				if score > bestScore then
					best, bestScore = e, score
				end
			end
		end
	end
	return best
end

local function damageRoll(u, base: number): (number, boolean)
	local crit = math.random() < CRIT_CHANCE
	local dmg = base * (1 + u.rally) * (if crit then 2 else 1)
	return dmg, crit
end

local function splashAround(center: Vector3, radius: number, dmg: number, kind: string, crit: boolean, list)
	for _, e in list do
		if (e.pos - center).Magnitude <= radius + e.radius then
			EnemyService.damage(e.id, dmg, kind, { splash = true, crit = crit })
		end
	end
end

local function attack(u, t: number, list)
	local def = u.def
	local kind = u.unit.Kind
	local hype = if t < u.hypedUntil then 0.75 else 1
	if kind == "Heal" then
		UnitService.onHeal(def.Heal)
		for _, other in units do
			if (other.pos - u.pos).Magnitude <= def.Range then
				other.hypedUntil = t + 3
			end
		end
		unitFxEvent:FireAllClients("heal", u.uid, u.pos, def.Range)
		u.cd = t + def.Cooldown
		return
	end
	if kind == "Rally" then
		for _, other in units do
			if other ~= u and (other.pos - u.pos).Magnitude <= def.RallyRadius then
				other.hypedUntil = t + 2.5
			end
		end
		unitFxEvent:FireAllClients("rally", u.uid, u.pos, def.RallyRadius)
		u.cd = t + def.Cooldown
		return
	end
	if kind == "Taunt" then
		local hit = 0
		for _, e in list do
			if (e.pos - u.pos).Magnitude <= def.TauntRadius and EnemyService.taunt(e.id, u.pos, def.TauntTime) then
				hit += 1
				EnemyService.damage(e.id, def.Damage, "Taunt", { splash = true })
			end
		end
		if hit > 0 then
			table.insert(pendingAttacks, { u.uid, "Taunt", 0, u.pos, 0, u.level })
			u.cd = t + def.Cooldown
		else
			u.cd = t + 0.3
		end
		return
	end

	local target = pickTarget(u, list)
	if not target then
		u.cd = t + 0.15
		return
	end
	faceTarget(u, target.pos)
	local dmg, crit = damageRoll(u, def.Damage)
	if target.boss and def.BossBonus then
		dmg *= def.BossBonus
	end
	local travel
	if kind == "Punch" or kind == "Chop" then
		travel = if kind == "Chop" then 0.28 else 0.1
	else
		local dist = (target.pos - u.pos).Magnitude
		travel = dist / (u.unit.ProjectileSpeed or 60)
		if kind == "Grenade" then
			travel = math.max(travel, 0.65)
		end
	end
	table.insert(pendingAttacks, { u.uid, kind, target.id, target.pos, travel, u.level, crit })
	local id = target.id
	schedule(t + travel, function()
		local e = EnemyService.get(id)
		local at = if e then EnemyService.positionOf(e) else target.pos
		if kind == "Chop" or kind == "Grenade" then
			splashAround(at, def.Splash or 6, dmg, kind, crit, EnemyService.snapshot(now()))
		elseif kind == "Net" then
			EnemyService.slow(id, def.SlowFactor, def.SlowTime)
			if def.Splash then
				for _, other in EnemyService.snapshot(now()) do
					if (other.pos - at).Magnitude <= def.Splash then
						EnemyService.slow(other.id, def.SlowFactor, def.SlowTime)
					end
				end
			end
			EnemyService.damage(id, dmg, kind, { crit = crit })
		else
			EnemyService.damage(id, dmg, kind, { crit = crit })
		end
	end)
	u.cd = t + def.Cooldown * hype
end

UnitService.onHeal = function(_amount: number) end

function UnitService.step()
	local t = now()
	-- run due damage first so kills land the same frame their hit was promised
	local i = 1
	while i <= #scheduled do
		local s = scheduled[i]
		if t >= s[1] then
			table.remove(scheduled, i)
			s[2]()
		else
			i += 1
		end
	end
	-- commander auras
	for _, u in units do
		u.rally = 0
	end
	for _, c in units do
		if c.unit.Kind == "Rally" then
			for _, u in units do
				if u ~= c and (u.pos - c.pos).Magnitude <= c.def.RallyRadius then
					u.rally = math.min(1, u.rally + c.def.RallyBonus)
				end
			end
		end
	end
	local list = nil
	for _, u in units do
		if t >= u.cd and t >= u.stunUntil then
			list = list or EnemyService.snapshot(t)
			attack(u, t, list)
		end
	end
end

function UnitService.flush()
	if #pendingAttacks > 0 then
		attacksEvent:FireAllClients(pendingAttacks)
		pendingAttacks = {}
	end
end

-- wire the enemy-side hooks
EnemyService.stunUnit = UnitService.stun
EnemyService.stunUnitsNear = UnitService.stunNear
EnemyService.findUnitNear = UnitService.findNear

-- remote handlers
Net.func("PlaceUnit").OnServerInvoke = function(player, unitId, pos)
	if typeof(unitId) ~= "string" or typeof(pos) ~= "Vector3" then
		return false, "Bad request"
	end
	return UnitService.place(player, unitId, pos)
end
Net.func("UpgradeUnit").OnServerInvoke = function(player, uid)
	if typeof(uid) ~= "number" then
		return false, "Bad request"
	end
	return UnitService.upgrade(player, uid)
end
Net.func("SellUnit").OnServerInvoke = function(player, uid)
	if typeof(uid) ~= "number" then
		return false, "Bad request"
	end
	return UnitService.sell(player, uid)
end

return UnitService
