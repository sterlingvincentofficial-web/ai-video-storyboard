-- The army's side of the show: procedural attack animations layered over the idle (punch combos,
-- overhead axe chops, slingshot draws, rifle recoil, grenade lobs, net shots, banana taunts),
-- the projectiles in flight, and unit effects (placing, level-ups, stuns, heals, rallies).
-- Also plays the monkeys' ability visuals (banana throws, boss slams, boulders, summons).

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local MapData = require(Shared.MapData)
local EnemyView = require(script.Parent.EnemyView)
local Fx = require(script.Parent.Fx)
local Juice = require(script.Parent.Juice)

local UnitView = {}

local unitsFolder = workspace:WaitForChild("Units")

local function unitModel(uid: number): Model?
	return unitsFolder:FindFirstChild(tostring(uid)) :: Model?
end

local function partOf(model: Model?, name: string): BasePart?
	return model and model:FindFirstChild(name) :: BasePart?
end

-- ---------------------------------------------------------------- combat animation
-- Data-driven (Config/UnitAnims, generated from tools/anim/unit_anims.json, also used by the
-- preview studio). While a monkey is in range a man blends into his combat stance (boxer guard,
-- shouldered rifle, raised slingshot...), attacks are keyframed clips that leave that stance and
-- return to it, and the whole pose is blended over the idle animation so nothing snaps.

local Units = require(Shared.Config.Units)
local UnitAnims = require(Shared.Config.UnitAnims)

local EASE = {
	linear = function(a: number) return a end,
	out = function(a: number) return 1 - (1 - a) ^ 3 end,
	["in"] = function(a: number) return a * a * a end,
	inout = function(a: number) return if a < 0.5 then 4 * a * a * a else 1 - (-2 * a + 2) ^ 3 / 2 end,
}
local ZERO = { 0, 0, 0, 0, 0, 0 }

local function full(v: { number }?): { number }
	if not v then
		return ZERO
	end
	return { v[1], v[2], v[3], v[4] or 0, v[5] or 0, v[6] or 0 }
end

-- Absolute pose of `kind` at time t into clip (or the stance when clip is nil).
local function poseAt(kind: string, clipName: string?, t: number): { [string]: { number } }
	local K = UnitAnims[kind]
	local stance = K.stance or {}
	local out = {}
	for j, v in stance do
		out[j] = full(v)
	end
	if not clipName then
		return out
	end
	local clip = K.clips[clipName]
	local keys = { { t = 0, pose = {} } }
	for _, k in clip.keys do
		table.insert(keys, k)
	end
	table.insert(keys, { t = clip.dur, pose = {}, ease = "inout" })
	local i = 1
	while i < #keys - 1 and t >= keys[i + 1].t do
		i += 1
	end
	local k0, k1 = keys[i], keys[i + 1]
	local a = math.clamp((t - k0.t) / math.max(1e-4, k1.t - k0.t), 0, 1)
	local e = EASE[k1.ease or "inout"](a)
	local joints = {}
	for j in stance do
		joints[j] = true
	end
	for _, k in clip.keys do
		for j in k.pose do
			joints[j] = true
		end
	end
	for j in joints do
		local v0, v1 = full(k0.pose[j] or stance[j]), full(k1.pose[j] or stance[j])
		local v = table.create(6)
		for n = 1, 6 do
			v[n] = v0[n] + (v1[n] - v0[n]) * e
		end
		out[j] = v
	end
	return out
end

local function toCFrame(v: { number }): CFrame
	return CFrame.new(v[4], v[5], v[6]) * CFrame.Angles(v[1], v[2], v[3])
end

-- The custom army rigs have no Animator idle, so they breathe here (same motion as the preview).
local function idlePose(t: number, seed: number): { [string]: CFrame }
	local b = math.sin(t * 2.2 + seed) * 0.03
	return {
		Root = CFrame.new(0, b * 0.6, 0),
		Neck = CFrame.Angles(b, 0, 0),
		RightShoulder = CFrame.Angles(0, 0, 0.06 + b),
		LeftShoulder = CFrame.Angles(0, 0, -0.06 - b),
	}
end

type AnimState = {
	motors: { [string]: Motor6D },
	kind: string,
	range: number,
	hasStance: boolean,
	w: number,
	engagedUntil: number,
	clip: string?,
	clipKind: string?,
	t0: number,
	cycle: number,
	nextScan: number,
}
local states: { [Model]: AnimState } = {}

local function motorsOf(model: Model): { [string]: Motor6D }
	local out = {}
	for _, d in model:GetDescendants() do
		if d:IsA("Motor6D") then
			out[d.Name] = d
		end
	end
	return out
end

local function stateOf(model: Model): AnimState?
	local st = states[model]
	if st then
		return st
	end
	local unit = Units[model:GetAttribute("Unit") or ""]
	if not unit then
		return nil
	end
	local level = unit.Levels[model:GetAttribute("Level") or 1] or unit.Levels[1]
	local kind = unit.Kind
	local K = UnitAnims[kind]
	st = {
		motors = motorsOf(model),
		kind = kind,
		range = level.Range,
		hasStance = K ~= nil and next(K.stance or {}) ~= nil,
		w = 0,
		engagedUntil = 0,
		clip = nil,
		clipKind = nil,
		t0 = 0,
		cycle = 0,
		nextScan = 0,
	}
	states[model] = st
	return st
end

-- Plays the next attack clip of `kind` (cycling jab/cross etc.).
local function play(model: Model, kind: string)
	local st = stateOf(model)
	local K = UnitAnims[kind]
	if not (st and K) then
		return
	end
	st.cycle += 1
	local name = K.cycle[(st.cycle - 1) % #K.cycle + 1]
	st.clip, st.clipKind, st.t0 = name, kind, os.clock()
	st.engagedUntil = math.max(st.engagedUntil, os.clock() + (if st.hasStance then 2 else K.clips[name].dur))
end

RunService.Stepped:Connect(function(_, dt)
	local now = os.clock()
	for _, model in unitsFolder:GetChildren() do
		if not model:IsA("Model") then
			continue
		end
		local st = stateOf(model)
		if not st then
			continue
		end
		-- raise the stance when a monkey wanders into range (checked a few times a second)
		if st.hasStance and now >= st.nextScan then
			st.nextScan = now + 0.2
			if EnemyView.anyWithin(model:GetPivot().Position, st.range + 4) then
				st.engagedUntil = math.max(st.engagedUntil, now + 1)
			end
		end
		local target = if now < st.engagedUntil then 1 else 0
		st.w += (target - st.w) * math.min(1, dt * 10)
		local custom = model:GetAttribute("CustomRig") == true
		if st.w < 0.01 and not st.clip and not custom then
			continue -- fully idle: leave the Animator's idle alone
		end
		local kind = st.clipKind or st.kind
		local t = now - st.t0
		if st.clip and t >= UnitAnims[kind].clips[st.clip].dur then
			st.clip, st.clipKind = nil, nil
			kind = st.kind
		end
		local pose = poseAt(kind, st.clip, t)
		local K = UnitAnims[kind]
		if K.bounce and pose.Root then
			pose.Root[5] += math.sin(now * math.pi * 2 * K.bounce[2]) * K.bounce[1]
		end
		if custom then
			local idle = idlePose(now, (model:GetAttribute("Uid") or 0) * 1.7)
			for joint, m in st.motors do
				local base = idle[joint] or CFrame.identity
				local v = pose[joint]
				m.Transform = if v then base:Lerp(toCFrame(v), st.w) else base
			end
		else
			for joint, v in pose do
				local m = st.motors[joint]
				if m then
					m.Transform = m.Transform:Lerp(toCFrame(v), st.w)
				end
			end
		end
	end
	for model in states do
		if not model.Parent then
			states[model] = nil
		end
	end
end)

-- ---------------------------------------------------------------- projectiles

type Shot = {
	part: BasePart,
	from: Vector3,
	targetId: number?,
	targetPos: Vector3,
	t0: number,
	dur: number,
	arc: number,
	spin: number,
	onArrive: (Vector3) -> (),
}
local shots: { Shot } = {}

local function shoot(part: BasePart, from: Vector3, targetId: number?, targetPos: Vector3, dur: number, arc: number,
	spin: number, onArrive: (Vector3) -> ())
	part.CFrame = CFrame.new(from)
	table.insert(shots, { part = part, from = from, targetId = targetId, targetPos = targetPos, t0 = os.clock(),
		dur = math.max(dur, 0.05), arc = arc, spin = spin, onArrive = onArrive })
end

RunService.RenderStepped:Connect(function()
	local now = os.clock()
	local i = 1
	while i <= #shots do
		local s = shots[i]
		local live = s.targetId and EnemyView.position(s.targetId)
		if live then
			s.targetPos = live
		end
		local a = math.min(1, (now - s.t0) / s.dur)
		local pos = s.from:Lerp(s.targetPos, a) + Vector3.new(0, math.sin(a * math.pi) * s.arc, 0)
		s.part.CFrame = CFrame.new(pos) * CFrame.Angles(now * s.spin, now * s.spin * 0.7, 0)
		if a >= 1 then
			table.remove(shots, i)
			s.part:Destroy()
			s.onArrive(s.targetPos)
		else
			i += 1
		end
	end
end)

local gearModel: Instance? = nil
local function gearMesh(name: string): BasePart?
	if not gearModel then
		local assets = ReplicatedStorage:FindFirstChild("Assets")
		if assets then
			for _, d in assets:GetDescendants() do
				if d.Name == "GearFront" then
					gearModel = d.Parent
					break
				end
			end
		end
	end
	local src = gearModel and gearModel:FindFirstChild(name, true)
	return src and (src :: BasePart):Clone()
end

local function muzzle(model: Model, aimAt: Vector3): Vector3
	local hand = partOf(model, "RightHand")
	local p = if hand then hand.Position else model:GetPivot().Position
	local dir = (aimAt - p)
	dir = if dir.Magnitude > 0.1 then dir.Unit else Vector3.zAxis
	return p + dir * 2.2
end

-- ---------------------------------------------------------------- attacks

local KIND_SOUND = { Punch = "Swing", Chop = "Swing", Pebble = "Sling", Bullet = "Shot", Grenade = "Throw", Net = "NetShot" }

local function attack(entry)
	local uid, kind, targetId, targetPos, travel, level, crit = entry[1], entry[2], entry[3], entry[4], entry[5], entry[6], entry[7]
	local model = unitModel(uid)
	if not model then
		return
	end
	play(model, kind)
	local origin = model:GetPivot().Position
	local aim = (EnemyView.position(targetId) or targetPos) + Vector3.new(0, 1, 0)
	if KIND_SOUND[kind] then
		Juice.sound(KIND_SOUND[kind], origin, Fx.rand(0.95, 1.1), 0.8)
	end
	local gold = level >= 3
	if kind == "Punch" or kind == "Chop" then
		task.delay(travel, function()
			local at = (EnemyView.position(targetId) or targetPos) + Vector3.new(0, 1.5, 0)
			if kind == "Punch" then
				Fx.sparks(at, if gold then Color3.fromRGB(255, 210, 60) else Color3.new(1, 1, 1), if crit then 10 else 5, 3)
				Fx.ring(at, if crit then 3 else 1.8, Color3.new(1, 1, 1), 0.15, 0.15)
				Juice.sound("Hit", at, Fx.rand(0.9, 1.2))
				if crit then
					Fx.text(at + Vector3.new(0, 1.5, 0), "SMACK!", Color3.fromRGB(255, 220, 60), 0.8)
				end
			else
				local ground = Vector3.new(at.X, 0.25, at.Z)
				Fx.ring(ground, 7, Color3.fromRGB(255, 240, 200), 0.3, 0.3)
				Fx.poof(ground, 3)
				Fx.bricks(ground, { Color3.fromRGB(236, 205, 110), Color3.fromRGB(214, 180, 92) }, 6, 18, 0.7)
				Juice.sound("Chop", at, Fx.rand(0.9, 1.05))
				Juice.shake(0.12, at)
			end
		end)
	elseif kind == "Pebble" then
		task.delay(0.16, function()
			local lh = partOf(model, "LeftHand")
			local from = if lh then lh.Position else muzzle(model, aim)
			local pebble = gearMesh("Pebble") or Fx.part({ Shape = Enum.PartType.Ball, Size = Vector3.one * 0.45 })
			pebble.Anchored = true
			pebble.CanCollide = false
			pebble.Color = if gold then Color3.fromRGB(255, 200, 40) else Color3.fromRGB(140, 140, 150)
			pebble.Parent = Fx.folder
			shoot(pebble, from, targetId, aim, math.max(0.05, travel - 0.16), 1.2, 20, function(at)
				Fx.sparks(at, Color3.new(1, 1, 1), 4, 2.5)
				Juice.sound("Hit", at, 1.4, 0.7)
			end)
		end)
	elseif kind == "Bullet" then
		local from = muzzle(model, aim)
		local flash = Fx.part({ Shape = Enum.PartType.Ball, Size = Vector3.one * 0.9, Position = from,
			Color = Color3.fromRGB(255, 220, 120), Material = Enum.Material.Neon })
		Fx.tween(flash, 0.08, { Size = Vector3.one * 0.1, Transparency = 1 })
		game:GetService("Debris"):AddItem(flash, 0.1)
		local len = (aim - from).Magnitude
		local tracer = Fx.part({ Size = Vector3.new(0.12, 0.12, len), CFrame = CFrame.lookAt(from, aim) * CFrame.new(0, 0, -len / 2),
			Color = if gold then Color3.fromRGB(255, 210, 60) else Color3.fromRGB(255, 250, 200), Material = Enum.Material.Neon })
		Fx.tween(tracer, 0.1, { Transparency = 1, Size = Vector3.new(0.02, 0.02, len) })
		game:GetService("Debris"):AddItem(tracer, 0.12)
		Juice.shake(0.05, from)
		task.delay(travel, function()
			local at = (EnemyView.position(targetId) or targetPos) + Vector3.new(0, 1.5, 0)
			Fx.sparks(at, Color3.fromRGB(255, 230, 150), 8, 3.5)
		end)
	elseif kind == "Grenade" then
		task.delay(0.22, function()
			local rh = partOf(model, "RightHand")
			local from = if rh then rh.Position else muzzle(model, aim)
			local nade = Fx.part({ Shape = Enum.PartType.Ball, Size = Vector3.one * 0.7, Color = if gold then
				Color3.fromRGB(250, 196, 40) else Color3.fromRGB(70, 90, 50) })
			local dist = (aim - from).Magnitude
			shoot(nade, from, targetId, aim, math.max(0.1, travel - 0.22), 5 + dist * 0.18, 12, function(at)
				local ground = Vector3.new(at.X, 1, at.Z)
				Fx.explosion(ground, 4.5)
				Fx.bricks(ground, { Color3.fromRGB(236, 205, 110), Color3.fromRGB(90, 86, 84) }, 8, 30, 0.8)
				Juice.sound("Boom", ground, Fx.rand(0.9, 1.1))
				Juice.shake(0.25, ground)
				Fx.text(ground + Vector3.new(0, 4, 0), "KA-BOOM!", Color3.fromRGB(255, 150, 40), 0.9)
			end)
		end)
	elseif kind == "Net" then
		local from = muzzle(model, aim)
		Fx.poof(from, 1.2, Color3.fromRGB(255, 255, 255))
		local net = gearMesh("Net")
		if net then
			net.Anchored = true
			net.CanCollide = false
			net.Color = Color3.fromRGB(240, 236, 210)
			net.Parent = Fx.folder
		else
			net = Fx.part({ Shape = Enum.PartType.Ball, Size = Vector3.one * 2, Material = Enum.Material.ForceField,
				Color = Color3.fromRGB(240, 240, 220) })
		end
		shoot(net :: BasePart, from, targetId, aim, travel, 1.5, 6, function(at)
			Fx.poof(at, 2, Color3.fromRGB(220, 250, 255))
			Juice.sound("Hit", at, 0.8, 0.6)
		end)
	elseif kind == "Taunt" then
		local pos = targetPos
		Fx.ring(Vector3.new(pos.X, 0.3, pos.Z), 14, Color3.fromRGB(255, 220, 40), 0.5, 0.35)
		Fx.text(model:GetPivot().Position + Vector3.new(0, 4, 0), "OOH BANANA!", Color3.fromRGB(255, 220, 40), 0.9)
		Juice.sound("Squeak", pos, 0.9)
	end
end

-- ---------------------------------------------------------------- unit effects

local function unitFx(kind: string, uid: number, pos: Vector3, extra: any)
	local model = unitModel(uid)
	local ground = Vector3.new(pos.X, 0.3, pos.Z)
	if kind == "place" then
		Fx.ring(ground, 4, Color3.fromRGB(120, 255, 120), 0.35, 0.3)
		Fx.poof(ground, 2.5)
		Fx.text(pos + Vector3.new(0, 6.5, 0), "+1 MAN", Color3.fromRGB(140, 255, 140), 0.8)
		Juice.sound("Place", pos)
	elseif kind == "upgrade" then
		local column = Fx.part({ Shape = Enum.PartType.Cylinder, Size = Vector3.new(14, 4, 4),
			CFrame = CFrame.new(pos + Vector3.new(0, 7, 0)) * CFrame.Angles(0, 0, math.pi / 2),
			Color = Color3.fromRGB(255, 220, 90), Material = Enum.Material.Neon, Transparency = 0.3 })
		Fx.tween(column, 0.6, { Size = Vector3.new(14, 0.2, 0.2), Transparency = 1 })
		game:GetService("Debris"):AddItem(column, 0.65)
		Fx.sparks(pos + Vector3.new(0, 3, 0), Color3.fromRGB(255, 220, 90), 16, 6)
		Fx.text(pos + Vector3.new(0, 7, 0), `LEVEL {extra}!`, Color3.fromRGB(255, 220, 60))
		Juice.sound("LevelUp", pos)
		if model then
			Fx.flash(model, Color3.fromRGB(255, 220, 90), 0.4)
		end
	elseif kind == "sell" then
		Fx.poof(ground + Vector3.new(0, 2, 0), 3)
		Juice.sound("Coin", pos)
	elseif kind == "stun" then
		if model then
			local head = partOf(model, "Head")
			Fx.dizzy(function()
				return head and head.Parent and head.Position + Vector3.new(0, 1.3, 0)
			end, extra)
		end
	elseif kind == "heal" then
		if model then
			play(model, "Heal")
		end
		Fx.ring(ground, extra, Color3.fromRGB(120, 255, 140), 0.6, 0.25)
		for _ = 1, 6 do
			local plus = Fx.part({ Size = Vector3.new(0.7, 0.2, 0.2), Color = Color3.fromRGB(110, 255, 130), Material = Enum.Material.Neon,
				Position = pos + Vector3.new(Fx.rand(-3, 3), Fx.rand(1, 3), Fx.rand(-3, 3)) })
			local bar = Fx.part({ Size = Vector3.new(0.2, 0.7, 0.2), Color = plus.Color, Material = Enum.Material.Neon, Position = plus.Position })
			for _, p in { plus, bar } do
				Fx.tween(p, 0.8, { Position = p.Position + Vector3.new(0, 3, 0), Transparency = 1 })
				game:GetService("Debris"):AddItem(p, 0.85)
			end
		end
		local base = MapData.Base
		Fx.text(base + Vector3.new(0, 9, 0), "+HP", Color3.fromRGB(120, 255, 140), 0.7)
		Juice.sound("Heal", pos)
	elseif kind == "rally" then
		if model then
			play(model, "Rally")
		end
		Fx.ring(ground, extra, Color3.fromRGB(255, 150, 40), 0.55, 0.35)
		Fx.text(pos + Vector3.new(0, 7, 0), "CHARGE!", Color3.fromRGB(255, 150, 40))
		Juice.sound("Rally", pos)
		for _, other in unitsFolder:GetChildren() do
			if other:IsA("Model") and (other:GetPivot().Position - pos).Magnitude <= extra then
				Fx.flash(other, Color3.fromRGB(255, 150, 40), 0.3)
			end
		end
	end
end

-- ---------------------------------------------------------------- monkey abilities

local function enemyAct(id: number, kind: string, data: any)
	EnemyView.act(id, kind)
	local view = EnemyView.get(id)
	local from = (view and view.root and view.root.Position or Vector3.zero) + Vector3.new(0, 2, 0)
	if kind == "throw" and data then
		local upos, flight = data[2], data[3]
		task.delay(0.45, function()
			local banana = Fx.part({ Size = Vector3.new(0.4, 1.3, 0.4), Color = Color3.fromRGB(255, 214, 40) })
			shoot(banana, from, nil, upos, flight - 0.35, 5, 14, function(at)
				Fx.text(at + Vector3.new(0, 2, 0), "SPLAT!", Color3.fromRGB(255, 214, 40), 0.8)
				Fx.bricks(at, { Color3.fromRGB(255, 214, 40), Color3.fromRGB(255, 240, 160) }, 5, 12, 0.5)
				Juice.sound("Squeak", at, 1.6)
			end)
		end)
	elseif kind == "slam" and data then
		local pos, radius = data[1], data[2]
		task.delay(0.45, function()
			local ground = Vector3.new(pos.X, 0.3, pos.Z)
			Fx.ring(ground, radius, Color3.fromRGB(255, 240, 210), 0.45, 0.6)
			Fx.ring(ground, radius * 0.6, Color3.fromRGB(255, 200, 120), 0.3, 0.4)
			Fx.poof(ground, 6)
			Fx.bricks(ground, { Color3.fromRGB(236, 205, 110), Color3.fromRGB(104, 116, 106) }, 18, 30, 1.2)
			Juice.sound("Slam", ground, 0.8)
			Juice.shake(0.55, ground)
		end)
	elseif kind == "boulder" and data then
		local upos, flight = data[1], data[2]
		local rock = Fx.part({ Size = Vector3.one * 2.6, Color = Color3.fromRGB(128, 132, 128), Material = Enum.Material.Slate })
		shoot(rock, from + Vector3.new(0, 4, 0), nil, upos, flight, 14, 5, function(at)
			local ground = Vector3.new(at.X, 0.5, at.Z)
			Fx.ring(ground, 9, Color3.fromRGB(220, 220, 210), 0.4, 0.4)
			Fx.poof(ground, 5, Color3.fromRGB(200, 200, 190))
			Fx.bricks(ground, { Color3.fromRGB(128, 132, 128), Color3.fromRGB(96, 100, 98) }, 16, 28, 1)
			Juice.sound("Boom", ground, 0.7)
			Juice.shake(0.4, ground)
		end)
	elseif kind == "summon" and data then
		Fx.text(data[1] + Vector3.new(0, 8, 0), "OOH OOH AH AH!", Color3.fromRGB(255, 140, 60))
		Fx.ring(Vector3.new(data[1].X, 0.3, data[1].Z), 10, Color3.fromRGB(255, 140, 60), 0.5, 0.3)
		Juice.sound("Roar", data[1], 1.1)
	elseif kind == "enrage" then
		Juice.callout("ENRAGED!", Color3.fromRGB(255, 60, 40), 1.2)
		Juice.sound("Roar", from, 0.75)
		Juice.shake(0.5)
	end
end

function UnitView.attacks(list)
	for _, entry in list do
		attack(entry)
	end
end
UnitView.unitFx = unitFx
UnitView.enemyAct = enemyAct

return UnitView
