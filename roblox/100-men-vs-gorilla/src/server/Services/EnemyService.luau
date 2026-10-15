-- Server-side monkeys: pure data (no models). Each enemy is a "progress along a path" that both
-- server and clients advance from (P0, T0, Speed), so movement costs no network traffic.
-- Clients draw them from the attributes on ReplicatedStorage.Enemies/<id>.
-- Damage, deaths and ability visuals are batched and sent once per frame.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local EnemyDefs = require(Shared.Config.Enemies)
local MapData = require(Shared.MapData)
local Net = require(Shared.Net)
local PathUtil = require(Shared.PathUtil)

local EnemyService = {}

local PATHS = PathUtil.fromMapData(MapData)
EnemyService.Paths = PATHS

local folder = Instance.new("Folder")
folder.Name = "Enemies"
folder.Parent = ReplicatedStorage

local hitsEvent = Net.event("Hits")
local deathsEvent = Net.event("Deaths")
local actsEvent = Net.event("EnemyActs")

local enemies = {} -- id -> enemy
local nextId = 0
local pendingHits = {}
local pendingDeaths = {}
local pendingActs = {}

-- Hooks wired up by GameService / UnitService
EnemyService.onBaseDamage = function(_amount: number) end
EnemyService.onReward = function(_amount: number) end
EnemyService.stunUnitsNear = function(_pos: Vector3, _radius: number, _time: number) end
EnemyService.stunUnit = function(_uid: number, _time: number) end
EnemyService.findUnitNear = function(_pos: Vector3, _radius: number): (number?, Vector3?)
	return nil, nil
end

local function now(): number
	return workspace:GetServerTimeNow()
end

local function progressOf(e, t: number): number
	return e.p0 + e.speed * (t - e.t0)
end

local function setSpeed(e, speed: number, t: number)
	if math.abs(speed - e.speed) < 1e-3 then
		return
	end
	e.p0 = math.min(progressOf(e, t), e.path.length)
	e.t0 = t
	e.speed = speed
	e.folder:SetAttribute("P0", e.p0)
	e.folder:SetAttribute("T0", e.t0)
	e.folder:SetAttribute("Speed", speed)
end

local function act(id: number, kind: string, data: any?)
	table.insert(pendingActs, { id, kind, data })
end

function EnemyService.spawn(typeName: string, pathName: string, healthMult: number, startProgress: number?, lane: number?): number
	local def = EnemyDefs[typeName]
	local path = PATHS[pathName]
	assert(def and path, `bad spawn {typeName} on {pathName}`)
	nextId += 1
	local id = nextId
	local t = now()
	local hp = math.floor(def.Health * healthMult + 0.5)
	local e = {
		id = id,
		type = typeName,
		def = def,
		path = path,
		lane = lane or ((math.random() * 2 - 1) * (MapData.PathWidth / 2 - 1.6) * (if def.Boss then 0.2 else 1)),
		hp = hp,
		maxHp = hp,
		hpMult = healthMult,
		p0 = startProgress or 0,
		t0 = t,
		speed = def.Speed,
		slowUntil = 0,
		slowFactor = 1,
		tauntUntil = 0,
		leapUntil = 0,
		nextAbility = t + 2 + math.random() * 2,
		enraged = false,
		atBase = false,
	}
	local f = Instance.new("Configuration")
	f.Name = tostring(id)
	f:SetAttribute("Type", typeName)
	f:SetAttribute("Path", pathName)
	f:SetAttribute("Lane", e.lane)
	f:SetAttribute("P0", e.p0)
	f:SetAttribute("T0", e.t0)
	f:SetAttribute("Speed", e.speed)
	f:SetAttribute("Hp", hp)
	f:SetAttribute("MaxHp", hp)
	f.Parent = folder
	e.folder = f
	enemies[id] = e
	return id
end

function EnemyService.count(): number
	local n = 0
	for _ in enemies do
		n += 1
	end
	return n
end

function EnemyService.get(id: number)
	return enemies[id]
end

function EnemyService.positionOf(e, t: number?): Vector3
	local pos = PathUtil.sampleLane(e.path, progressOf(e, t or now()), e.lane)
	return pos
end

-- Snapshot for targeting: { {id, pos, progress, hp, boss, targetable} }
function EnemyService.snapshot(t: number)
	local list = {}
	for id, e in enemies do
		local p = math.min(progressOf(e, t), e.path.length)
		local pos = PathUtil.sampleLane(e.path, p, e.lane)
		table.insert(list, {
			id = id,
			pos = pos,
			progress = p,
			remaining = e.path.length - p,
			hp = e.hp,
			boss = e.def.Boss == true,
			targetable = t >= e.leapUntil,
			radius = e.def.Scale * 1.6,
		})
	end
	return list
end

local function kill(e, kind: string, overkill: number)
	enemies[e.id] = nil
	local pos = EnemyService.positionOf(e)
	table.insert(pendingDeaths, { e.id, e.type, kind, pos, e.def.Reward, overkill })
	EnemyService.onReward(e.def.Reward)
	-- give clients a moment to grab the visual before its data disappears
	local f = e.folder
	f:SetAttribute("Dead", true)
	task.delay(0.5, function()
		f:Destroy()
	end)
end

-- Applies damage. Returns true if it killed.
function EnemyService.damage(id: number, amount: number, kind: string, opts: { splash: boolean?, crit: boolean? }?): boolean
	local e = enemies[id]
	if not e then
		return false
	end
	local dmg = amount
	if e.def.Armor and not (opts and opts.splash) then
		dmg *= 1 - e.def.Armor
	end
	dmg = math.max(1, math.floor(dmg + 0.5))
	e.hp -= dmg
	table.insert(pendingHits, { id, dmg, opts and opts.crit or false, kind })
	if e.hp <= 0 then
		kill(e, kind, -e.hp)
		return true
	end
	e.folder:SetAttribute("Hp", e.hp)
	if e.def.Ability == "Enrage" or e.def.Ability == "Titan" then
		if not e.enraged and e.hp < e.maxHp * 0.5 then
			e.enraged = true
			e.folder:SetAttribute("Enraged", true)
			act(id, "enrage")
		end
	end
	return false
end

function EnemyService.slow(id: number, factor: number, duration: number)
	local e = enemies[id]
	if not e or e.def.Boss then
		if e then -- bosses shrug off most of it
			e.slowFactor = math.max(e.slowFactor, 0.8)
			e.slowUntil = now() + duration * 0.5
		end
		return
	end
	e.slowFactor = math.min(if now() < e.slowUntil then e.slowFactor else 1, factor)
	e.slowUntil = now() + duration
	e.folder:SetAttribute("Netted", e.slowUntil)
end

function EnemyService.taunt(id: number, baitPos: Vector3, duration: number): boolean
	local e = enemies[id]
	if not e or e.def.Boss or e.atBase then
		return false
	end
	e.tauntUntil = now() + duration
	e.folder:SetAttribute("TauntPos", baitPos)
	e.folder:SetAttribute("TauntUntil", e.tauntUntil)
	return true
end

function EnemyService.clear()
	for _, e in enemies do
		e.folder:Destroy()
	end
	table.clear(enemies)
end

local function wantedSpeed(e, t: number): number
	if e.atBase or t < e.tauntUntil then
		return 0
	end
	local s = e.def.Speed * (if e.enraged then 1.6 else 1)
	if t < e.slowUntil then
		s *= e.slowFactor
	end
	return s
end

-- ---------------------------------------------------------------- abilities

local function ability(e, t: number)
	local pos = EnemyService.positionOf(e, t)
	local a = e.def.Ability
	local titan = a == "Titan"
	if a == "Throw" then
		local uid, upos = EnemyService.findUnitNear(pos, 22)
		if uid then
			act(e.id, "throw", { uid, upos, 0.8 })
			task.delay(0.8, function()
				EnemyService.stunUnit(uid, 1.2)
			end)
			e.nextAbility = t + 4.5
		else
			e.nextAbility = t + 0.5
		end
	elseif a == "Leap" then
		local uid = EnemyService.findUnitNear(pos, 9)
		if uid and not e.atBase then
			local p = progressOf(e, t)
			local target = math.min(p + 14, e.path.length - 1)
			e.p0, e.t0 = target, t + 0.55
			e.leapUntil = t + 0.55
			e.folder:SetAttribute("LeapFrom", p)
			e.folder:SetAttribute("LeapT", t)
			e.folder:SetAttribute("P0", e.p0)
			e.folder:SetAttribute("T0", e.t0)
			e.nextAbility = t + 3.5
		else
			e.nextAbility = t + 0.3
		end
	elseif a == "Slam" or a == "Enrage" or (titan and math.random() < 0.4) then
		act(e.id, "slam", { pos, 16 })
		task.delay(0.45, function()
			EnemyService.stunUnitsNear(pos, 16, 1.5)
		end)
		e.nextAbility = t + (if e.enraged then 4 else 6)
	elseif a == "Boulder" or (titan and math.random() < 0.5) then
		local uid, upos = EnemyService.findUnitNear(pos, 45)
		if uid and upos then
			act(e.id, "boulder", { upos, 1.2 })
			task.delay(1.2, function()
				EnemyService.stunUnitsNear(upos, 8, 2.5)
			end)
		end
		e.nextAbility = t + 7
	elseif a == "Summon" or titan then
		act(e.id, "summon", { pos })
		local p = progressOf(e, t)
		for i = 1, 4 do
			EnemyService.spawn("Monkey", e.path.name, e.hpMult or 1, math.max(0, p - 3 - i), (i - 2.5) * 1.6)
		end
		e.nextAbility = t + 9
	else
		e.nextAbility = math.huge
	end
end

-- ---------------------------------------------------------------- tick

function EnemyService.step(dt: number)
	local t = now()
	for _, e in enemies do
		local p = progressOf(e, t)
		if not e.atBase and p >= e.path.length - 0.25 then
			e.atBase = true
			e.folder:SetAttribute("AtBase", true)
		end
		setSpeed(e, wantedSpeed(e, t), t)
		if e.atBase then
			EnemyService.onBaseDamage(e.def.BaseDps * dt)
		end
		if t >= e.nextAbility then
			ability(e, t)
		end
	end
end

function EnemyService.flush()
	if #pendingHits > 0 then
		hitsEvent:FireAllClients(pendingHits)
		pendingHits = {}
	end
	if #pendingDeaths > 0 then
		deathsEvent:FireAllClients(pendingDeaths)
		pendingDeaths = {}
	end
	if #pendingActs > 0 then
		actsEvent:FireAllClients(pendingActs)
		pendingActs = {}
	end
end

return EnemyService
