-- Draws every monkey locally from the server's path data (ReplicatedStorage.Enemies), so
-- movement is perfectly smooth and free. Gives them their personality: waddle walks, springy
-- bobble heads that wobble on every step and every hit, knockback leans, pounding at the stash,
-- leaps, taunts and nets. KillFx takes a model over with EnemyView.release(id) when it dies.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local EnemyDefs = require(Shared.Config.Enemies)
local MapData = require(Shared.MapData)
local PathUtil = require(Shared.PathUtil)
local Fx = require(script.Parent.Fx)
local Juice = require(script.Parent.Juice)

local EnemyView = {}

local PATHS = PathUtil.fromMapData(MapData)
local rigs = ReplicatedStorage:WaitForChild("Rigs")
local data = ReplicatedStorage:WaitForChild("Enemies")

local folder = Instance.new("Folder")
folder.Name = "ClientEnemies"
folder.Parent = workspace

type Spring = { x: number, v: number }
local function spring(): Spring
	return { x = 0, v = 0 }
end
local function stepSpring(s: Spring, dt: number, stiffness: number, damping: number)
	local a = -stiffness * s.x - damping * s.v
	s.v += a * dt
	s.x += s.v * dt
end

local views = {} -- id -> view

local function motor(model: Model, name: string): Motor6D?
	return model:FindFirstChild(name, true) :: Motor6D?
end

local function hpBar(view)
	local head = view.model:FindFirstChild("Head") :: BasePart?
	if not head or view.def.Boss then
		return
	end
	local bb = Instance.new("BillboardGui")
	bb.Size = UDim2.fromScale(3.4 * view.def.Scale, 0.42)
	bb.StudsOffsetWorldSpace = Vector3.new(0, head.Size.Y * 0.5 + 1.2, 0)
	bb.AlwaysOnTop = true
	bb.MaxDistance = 140
	bb.LightInfluence = 0
	local back = Instance.new("Frame")
	back.Size = UDim2.fromScale(1, 1)
	back.BackgroundColor3 = Color3.fromRGB(20, 24, 20)
	back.BorderSizePixel = 0
	back.Parent = bb
	local fill = Instance.new("Frame")
	fill.Size = UDim2.fromScale(1, 1)
	fill.BackgroundColor3 = Color3.fromRGB(80, 230, 60)
	fill.BorderSizePixel = 0
	fill.Parent = back
	for i = 1, 9 do -- segment ticks
		local tick = Instance.new("Frame")
		tick.Size = UDim2.new(0, 1, 1, 0)
		tick.Position = UDim2.fromScale(i / 10, 0)
		tick.BackgroundColor3 = Color3.fromRGB(20, 24, 20)
		tick.BorderSizePixel = 0
		tick.ZIndex = 2
		tick.Parent = back
	end
	local stroke = Instance.new("UIStroke")
	stroke.Thickness = 1.5
	stroke.Parent = back
	bb.Adornee = head
	bb.Enabled = false
	bb.Parent = view.model
	view.bar = bb
	view.barFill = fill
end

local function create(cfg: Configuration)
	local id = tonumber(cfg.Name)
	local typeName = cfg:GetAttribute("Type")
	local template = rigs:FindFirstChild(typeName)
	if not id or not template then
		return
	end
	local def = EnemyDefs[typeName]
	local model = template:Clone() :: Model
	if def.Scale ~= 1 then
		model:ScaleTo(def.Scale)
	end
	model.Name = cfg.Name
	local view = {
		id = id,
		cfg = cfg,
		def = def,
		type = typeName,
		model = model,
		root = model.PrimaryPart,
		rootHeight = (template:GetAttribute("RootHeight") or 3) * def.Scale,
		path = PATHS[cfg:GetAttribute("Path")],
		lane = cfg:GetAttribute("Lane") or 0,
		neck = motor(model, "Neck"),
		rootJoint = motor(model, "RootJoint"),
		lShoulder = motor(model, "Left Shoulder"),
		rShoulder = motor(model, "Right Shoulder"),
		lHip = motor(model, "Left Hip"),
		rHip = motor(model, "Right Hip"),
		phase = math.random() * 6,
		headX = spring(),
		headZ = spring(),
		lean = spring(),
		lastHp = cfg:GetAttribute("Hp"),
		pos = Vector3.zero,
		dir = Vector3.new(0, 0, -1),
		throwT = -10,
		slamT = -10,
		gorilla = def.Boss == true,
	}
	hpBar(view)
	model.Parent = folder
	views[id] = view
	if def.Boss then
		Juice.sound("Roar", nil, 0.9)
		Juice.shake(0.5)
	end
end

local function destroy(id: number)
	local view = views[id]
	if view then
		views[id] = nil
		view.model:Destroy()
	end
end

for _, c in data:GetChildren() do
	task.spawn(create, c)
end
data.ChildAdded:Connect(create)
data.ChildRemoved:Connect(function(c)
	local id = tonumber(c.Name)
	if id then
		task.delay(0.1, destroy, id) -- KillFx may already have claimed it
	end
end)

-- ---------------------------------------------------------------- API

function EnemyView.get(id: number)
	return views[id]
end

function EnemyView.position(id: number): Vector3?
	local v = views[id]
	return v and v.root and v.root.Position
end

-- True if any drawn monkey stands within `radius` (flat) of pos. Used to raise combat stances.
function EnemyView.anyWithin(pos: Vector3, radius: number): boolean
	local r2 = radius * radius
	for _, v in views do
		local d = v.pos - pos
		if d.X * d.X + d.Z * d.Z <= r2 then
			return true
		end
	end
	return false
end

-- Hands a model over to the kill effects (stops animating and positioning it).
function EnemyView.release(id: number)
	local v = views[id]
	views[id] = nil
	return v
end

-- A hit: wobble the bobble head, lean back, flash white, show the bar.
function EnemyView.hit(id: number, dmg: number, crit: boolean, fromDir: Vector3?)
	local v = views[id]
	if not v then
		return
	end
	local kick = (if crit then 2.2 else 1.2) / math.max(1, v.def.Scale)
	v.headX.v += (math.random() - 0.5) * 30 * kick + 14 * kick
	v.headZ.v += (math.random() - 0.5) * 34 * kick
	v.lean.v += 12 * kick
	Fx.flash(v.model, if v.def.Armor then Color3.fromRGB(200, 220, 255) else nil)
	if v.bar then
		v.bar.Enabled = true
	end
	local _ = fromDir
end

-- Ability visuals: wind-ups and throws.
function EnemyView.act(id: number, kind: string)
	local v = views[id]
	if not v then
		return
	end
	if kind == "throw" then
		v.throwT = os.clock()
	elseif kind == "slam" then
		v.slamT = os.clock()
	elseif kind == "enrage" then
		v.headX.v += 40
		for _, p in v.model:GetDescendants() do
			if p:IsA("BasePart") and p.Name == "Torso" then
				local fire = Instance.new("Fire")
				fire.Color = Color3.fromRGB(255, 60, 30)
				fire.SecondaryColor = Color3.fromRGB(255, 160, 40)
				fire.Size = 6
				fire.Heat = 12
				fire.Parent = p
				local light = Instance.new("PointLight")
				light.Color = Color3.fromRGB(255, 70, 40)
				light.Range = 14
				light.Brightness = 3
				light.Parent = p
			end
		end
	end
end

-- ---------------------------------------------------------------- per frame

local roots, cframes = {}, {}
local BASE = MapData.Base

RunService.RenderStepped:Connect(function(dt)
	dt = math.min(dt, 1 / 20)
	local t = workspace:GetServerTimeNow()
	local clock = os.clock()
	table.clear(roots)
	table.clear(cframes)
	for id, v in views do
		local cfg = v.cfg
		if not cfg.Parent then
			continue
		end
		local speed = cfg:GetAttribute("Speed") or 0
		local p = math.min((cfg:GetAttribute("P0") or 0) + speed * (t - (cfg:GetAttribute("T0") or t)), v.path.length)
		local hop = 0
		local leapT = cfg:GetAttribute("LeapT")
		if leapT and t - leapT < 0.55 then
			local a = (t - leapT) / 0.55
			local from = cfg:GetAttribute("LeapFrom") or p
			p = from + ((cfg:GetAttribute("P0") or p) - from) * a
			hop = math.sin(a * math.pi) * 7
		end
		local pos, dir = PathUtil.sampleLane(v.path, p, v.lane)
		local moving = speed > 0.1
		local tauntUntil = cfg:GetAttribute("TauntUntil") or 0
		local attacking = cfg:GetAttribute("AtBase") or t < tauntUntil
		if attacking then
			local at = if t < tauntUntil then cfg:GetAttribute("TauntPos") else BASE
			if at then
				local flat = Vector3.new(at.X - pos.X, 0, at.Z - pos.Z)
				if flat.Magnitude > 0.1 then
					dir = flat.Unit
				end
			end
		end
		-- smooth the facing so turns at path corners don't snap
		v.dir = v.dir:Lerp(dir, math.min(1, dt * 8))
		if v.dir.Magnitude < 1e-3 then
			v.dir = dir
		end
		local look = v.dir.Unit

		-- animation
		local walkRate = if v.type == "Speedy" or v.type == "Ninja" then 1.6 else if v.type == "Baby" then 1.9 else 1
		if moving then
			v.phase += dt * speed * 0.9 * walkRate / v.def.Scale
		end
		local swing = math.sin(v.phase)
		local stepKick = math.abs(math.cos(v.phase))
		local bob = if moving then math.abs(swing) * 0.22 * v.def.Scale else 0
		if v.type == "Baby" and moving then
			bob *= 2.2 -- tiny hops
		end
		-- bobble head springs: every footfall flicks the head, the spring does the rest
		if moving and stepKick > 0.97 then
			v.headZ.v += (if swing > 0 then 1 else -1) * 3.5
			v.headX.v += 2
		end
		stepSpring(v.headX, dt, 140, 7)
		stepSpring(v.headZ, dt, 140, 7)
		stepSpring(v.lean, dt, 90, 10)

		local legAmp = if moving then 0.65 else 0
		local armAmp = if moving then 0.7 else 0.08
		local lArm = CFrame.Angles(-swing * armAmp, 0, 0)
		local rArm = CFrame.Angles(swing * armAmp, 0, 0)
		-- (on this rig +X swings an arm forward/up, -X swings it back)
		if v.gorilla and moving then -- knuckle walk: arms swing wide and reach forward
			lArm = CFrame.Angles(0.35 - swing * 0.55, 0, 0)
			rArm = CFrame.Angles(0.35 + swing * 0.55, 0, 0)
		end
		if attacking then -- pounding the stash (or the Bait Guy)
			local beat = math.sin(clock * 11 + id)
			lArm = CFrame.Angles(1.6 + beat * 1.1, 0, -0.2)
			rArm = CFrame.Angles(1.6 - beat * 1.1, 0, 0.2)
			bob = math.abs(beat) * 0.15
			if beat > 0.98 then
				v.headX.v += 5
			end
		end
		local throwA = clock - v.throwT
		if throwA < 0.8 then -- wind up and fling a banana
			local k = throwA / 0.8
			-- reach back over the shoulder, then whip it forward
			rArm = if k < 0.6 then CFrame.Angles(-k / 0.6 * 2.4, 0, 0) else CFrame.Angles(-2.4 + (k - 0.6) / 0.4 * 4.2, 0, 0)
		end
		local slamA = clock - v.slamT
		local slamLean = 0
		if slamA < 0.75 then -- both fists up... and down
			local k = slamA / 0.75
			local up = if k < 0.55 then k / 0.55 else 1 - (k - 0.55) / 0.45 * 1.4
			lArm = CFrame.Angles(3 * up, 0, 0)
			rArm = CFrame.Angles(3 * up, 0, 0)
			slamLean = if k < 0.55 then -0.2 * up else 0.35
		end
		local hipL = CFrame.Angles(swing * legAmp, 0, 0)
		local hipR = CFrame.Angles(-swing * legAmp, 0, 0)
		if hop > 0 then
			hipL = CFrame.Angles(0.9, 0, 0)
			hipR = CFrame.Angles(-0.6, 0, 0)
			lArm = CFrame.Angles(2.6, 0, -0.4)
			rArm = CFrame.Angles(2.6, 0, 0.4)
		end
		local waddle = if moving then swing * 0.1 else 0
		local forwardLean = (if v.gorilla and moving then 0.25 else if v.type == "Ninja" and moving then 0.3 else 0)
			+ slamLean - v.lean.x * 0.05
		if v.rootJoint then
			v.rootJoint.Transform = CFrame.new(0, bob, 0) * CFrame.Angles(-forwardLean, 0, waddle)
		end
		if v.neck then
			v.neck.Transform = CFrame.Angles(-v.headX.x * 0.03, 0, v.headZ.x * 0.035)
		end
		if v.lShoulder then
			v.lShoulder.Transform = lArm
		end
		if v.rShoulder then
			v.rShoulder.Transform = rArm
		end
		if v.lHip then
			v.lHip.Transform = hipL
		end
		if v.rHip then
			v.rHip.Transform = hipR
		end

		-- health bar
		local hp = cfg:GetAttribute("Hp") or 0
		if v.barFill and hp ~= v.lastHp then
			v.lastHp = hp
			v.barFill.Size = UDim2.fromScale(math.clamp(hp / (cfg:GetAttribute("MaxHp") or 1), 0, 1), 1)
		end
		-- net
		local netted = (cfg:GetAttribute("Netted") or 0) > t
		if netted ~= (v.net ~= nil) then
			if netted then
				local net = Fx.part({
					Shape = Enum.PartType.Ball,
					Size = Vector3.one * 4.4 * v.def.Scale,
					Color = Color3.fromRGB(240, 240, 220),
					Material = Enum.Material.ForceField,
					Transparency = 0.2,
					Parent = v.model,
				})
				v.net = net
			elseif v.net then
				v.net:Destroy()
				v.net = nil
			end
		end

		local cf = CFrame.lookAt(pos, pos + look) + Vector3.new(0, v.rootHeight + hop, 0)
		table.insert(roots, v.root)
		table.insert(cframes, cf)
		v.pos = pos
		if v.net then
			v.net.CFrame = cf
		end
	end
	if #roots > 0 then
		workspace:BulkMoveTo(roots, cframes, Enum.BulkMoveMode.FireCFrameChanged)
	end
end)

return EnemyView
