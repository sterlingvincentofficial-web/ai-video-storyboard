-- The intro cutscene: the squad's chopper flies in, a Banana Chucker knocks it out of the sky,
-- it crashes onto the map's wreck, the men tumble out and THE Gorilla roars from the temple.
--
-- Everything is driven by Config/Intro (generated from tools/cutscene/intro.json, which the
-- preview studio plays too): camera keys, the chopper's flight, actor tracks (men + monkeys)
-- and timed events. Client-only: actors are local clones, the map is only hidden/shown locally.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")
local UserInputService = game:GetService("UserInputService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local EnemyDefs = require(Shared.Config.Enemies)
local Intro = require(Shared.Config.Intro)
local Net = require(Shared.Net)
local Sounds = require(Shared.Sounds)
local Fx = require(script.Parent.Fx)
local Hud = require(script.Parent.Hud)
local Juice = require(script.Parent.Juice)

local Cutscene = {}

local player = Players.LocalPlayer
local camera = workspace.CurrentCamera
local rad = math.rad
local FONT = Enum.Font.LuckiestGuy
local FONT_UI = Enum.Font.FredokaOne
local GREEN = Color3.fromRGB(120, 240, 150)

local EASE = {
	linear = function(a: number) return a end,
	out = function(a: number) return 1 - (1 - a) ^ 3 end,
	["in"] = function(a: number) return a * a * a end,
	inout = function(a: number) return if a < 0.5 then 4 * a * a * a else 1 - (-2 * a + 2) ^ 3 / 2 end,
}

local function v3(t: { number }?): Vector3?
	return if t then Vector3.new(t[1], t[2], t[3]) else nil
end

local function angles(yaw: number, pitch: number, roll: number): CFrame
	return CFrame.Angles(0, rad(yaw), 0) * CFrame.Angles(rad(pitch), 0, 0) * CFrame.Angles(0, 0, rad(roll))
end

-- playback rate (slow-mo) at time t, and the rate-scaled clock it produces
local RATE = Intro.rate
local function rateAt(t: number): number
	for i = 1, #RATE - 1 do
		local a, b = RATE[i], RATE[i + 1]
		if t < b[1] then
			local k = math.clamp((t - a[1]) / math.max(1e-4, b[1] - a[1]), 0, 1)
			return a[2] + (b[2] - a[2]) * k
		end
	end
	return RATE[#RATE][2]
end

-- ---------------------------------------------------------------- the chopper's flight

local HELI = Intro.Heli
local WRECK = HELI.Wreck
local wreckCF = CFrame.new(v3(WRECK.pos) :: Vector3) * angles(WRECK.yaw, WRECK.pitch, WRECK.roll)
local wreckFlat = CFrame.new(WRECK.pos[1], 0, WRECK.pos[3]) * CFrame.Angles(0, rad(WRECK.yaw), 0)

type HeliKey = { t: number, pos: Vector3, yaw: number, pitch: number, roll: number, linear: boolean?, ease: string? }
local HK: { HeliKey } = {}
for _, k in Intro.heli.keys do
	table.insert(HK, {
		t = k.t,
		pos = if k.pos == "wreck" then v3(WRECK.pos) :: Vector3 else v3(k.pos) :: Vector3,
		yaw = k.yaw, pitch = k.pitch, roll = k.roll, linear = k.linear, ease = k.ease,
	})
end

-- Hermite through the keys with time-scaled tangents (smooth, no overshoot on uneven spacing).
local function slope(i: number, get: (HeliKey) -> any): any
	local a, b = HK[math.max(1, i - 1)], HK[math.min(#HK, i + 1)]
	return (get(b) - get(a)) / math.max(1e-4, b.t - a.t)
end

local function heliCF(t: number): CFrame
	if t <= HK[1].t then
		local k = HK[1]
		return CFrame.new(k.pos) * angles(k.yaw, k.pitch, k.roll)
	end
	for i = 1, #HK - 1 do
		local k0, k1 = HK[i], HK[i + 1]
		if t < k1.t then
			local dt = k1.t - k0.t
			local s = (t - k0.t) / dt
			local function interp(get: (HeliKey) -> any): any
				if k1.linear then
					local e = EASE[k1.ease or "linear"](s)
					return get(k0) + (get(k1) - get(k0)) * e
				end
				local m0, m1 = slope(i, get) * dt, slope(i + 1, get) * dt
				local s2, s3 = s * s, s * s * s
				return get(k0) * (2 * s3 - 3 * s2 + 1) + m0 * (s3 - 2 * s2 + s) + get(k1) * (-2 * s3 + 3 * s2) + m1 * (s3 - s2)
			end
			local pos = interp(function(k) return k.pos end)
			local yaw = interp(function(k) return k.yaw end)
			local pitch = interp(function(k) return k.pitch end)
			local roll = interp(function(k) return k.roll end)
			return CFrame.new(pos) * angles(yaw, pitch, roll)
		end
	end
	local k = HK[#HK]
	return CFrame.new(k.pos) * angles(k.yaw, k.pitch, k.roll)
end

-- ---------------------------------------------------------------- frames + resolving keys

local playerPos = Vector3.new(0, 0, 70)
local banana = nil :: any

local function bananaPos(t: number): Vector3
	if not banana then
		return Vector3.zero
	end
	local a = math.clamp((t - banana.t0) / (banana.t1 - banana.t0), 0, 1)
	local target = heliCF(t) * banana.to
	return banana.p0:Lerp(target, a) + Vector3.new(0, math.sin(a * math.pi) * banana.arc, 0)
end

local function frameAt(rel: string?, t: number): CFrame
	if rel == "heli" then
		return heliCF(t)
	elseif rel == "wreckFlat" then
		return wreckFlat
	elseif rel == "banana" then
		return CFrame.new(bananaPos(t))
	elseif rel == "player" then
		return CFrame.new(playerPos)
	end
	return CFrame.identity
end

local function resolve(rel: string?, p: Vector3, t: number): Vector3
	if rel == "banana" or rel == "player" then
		return frameAt(rel, t).Position + p -- world-axis offsets
	end
	return frameAt(rel, t) * p
end

-- ---------------------------------------------------------------- camera

local CAM = Intro.camera
local function cameraAt(t: number): (CFrame, number)
	local i = 1
	while i < #CAM and t >= CAM[i + 1].t do
		i += 1
	end
	local k0 = CAM[i]
	local k1 = CAM[i + 1]
	local function point(k, which: string): Vector3
		local rel = if which == "pos" then k.rel else (k.lookRel or k.rel)
		return resolve(rel, v3(k[which]) :: Vector3, t)
	end
	local pos, look, fov = point(k0, "pos"), point(k0, "look"), k0.fov or 70
	if k1 and not k1.cut then
		local a = EASE[k1.ease or "inout"](math.clamp((t - k0.t) / math.max(1e-4, k1.t - k0.t), 0, 1))
		pos = pos:Lerp(point(k1, "pos"), a)
		look = look:Lerp(point(k1, "look"), a)
		fov += ((k1.fov or 70) - fov) * a
	end
	return CFrame.lookAt(pos, look), fov
end

-- ---------------------------------------------------------------- actor tracks

type Key = { [string]: any }
local tracks: { [string]: { Key } } = {}
for name, keys in Intro.tracks do
	local out = {}
	local prev: Key = { pos = Vector3.zero, yaw = 0, pitch = 0, roll = 0, visible = true }
	for i, k in keys do
		local n: Key = {
			t = k.t,
			rel = if k.pos then k.rel else prev.rel,
			pos = v3(k.pos) or prev.pos,
			yaw = k.yaw or prev.yaw,
			pitch = k.pitch or prev.pitch,
			roll = k.roll or prev.roll,
			visible = if k.hide then false elseif k.show then true else (if i == 1 then true else prev.visible),
			pose = k.pose or prev.pose,
			poseT = if k.pose then k.t else prev.poseT,
			prevPose = if k.pose then prev.pose else prev.prevPose,
			anim = k.anim or prev.anim,
			animT = if k.anim then k.t else prev.animT,
			moves = k.pos ~= nil and not k.cut,
			arc = k.arc,
			ease = k.ease,
			face = k.face,
		}
		table.insert(out, n)
		prev = n
	end
	tracks[name] = out
end

type ActorState = { cf: CFrame, visible: boolean, key: Key, speed: number }
local function trackAt(name: string, t: number): ActorState
	local keys = tracks[name]
	local i = 1
	while i < #keys and t >= keys[i + 1].t do
		i += 1
	end
	local k0 = keys[i]
	local k1 = keys[i + 1]
	local p0 = resolve(k0.rel, k0.pos, t)
	local frame = frameAt(k0.rel, t)
	local yaw, pitch, roll = k0.yaw, k0.pitch, k0.roll
	local pos, speed = p0, 0
	if t < k0.t then
		pos = p0
	elseif k1 and k1.moves then
		local span = math.max(1e-4, k1.t - k0.t)
		local a = EASE[k1.ease or "linear"](math.clamp((t - k0.t) / span, 0, 1))
		local p1 = resolve(k1.rel, k1.pos, t)
		pos = p0:Lerp(p1, a) + Vector3.new(0, math.sin(a * math.pi) * (k1.arc or 0), 0)
		local d = k1.pos - k0.pos
		speed = Vector3.new(d.X, 0, d.Z).Magnitude / span
		frame = frameAt(k1.rel, t)
		if k1.face and speed > 0.05 then
			yaw = math.deg(math.atan2(-d.X, -d.Z))
		else
			yaw += (k1.yaw - k0.yaw) * a
		end
		pitch += (k1.pitch - k0.pitch) * a
		roll += (k1.roll - k0.roll) * a
	end
	local rot = (frame - frame.Position) * angles(yaw, pitch, roll)
	return { cf = rot + pos, visible = k0.visible, key = k0, speed = speed }
end

-- ---------------------------------------------------------------- men poses

local ZERO6 = { 0, 0, 0, 0, 0, 0 }
local function full(v: { number }?): { number }
	if not v then
		return ZERO6
	end
	return { v[1], v[2], v[3], v[4] or 0, v[5] or 0, v[6] or 0 }
end

local function poseAt(name: string?, t: number): { [string]: { number } }
	local out: { [string]: { number } } = {}
	local P = name and Intro.poses[name]
	if not P then
		return out
	end
	if P.base then
		out = poseAt(P.base, t)
	end
	for j, v in P.pose or {} do
		out[j] = full(v)
	end
	if P.keys then
		local keys = P.keys
		local lt = t % P.loop
		local i = #keys
		for n = 1, #keys do
			if lt >= keys[n].t then
				i = n
			end
		end
		local k0 = keys[i]
		local k1 = keys[i % #keys + 1]
		local t1 = if i == #keys then P.loop else k1.t
		local a = EASE.inout(math.clamp((lt - k0.t) / math.max(1e-4, t1 - k0.t), 0, 1))
		for j, v in k0.pose do
			local w0, w1 = full(v), full(k1.pose[j] or v)
			local o = table.create(6)
			for n = 1, 6 do
				o[n] = w0[n] + (w1[n] - w0[n]) * a
			end
			out[j] = o
		end
	end
	return out
end

local function blendedPose(key: Key, t: number): { [string]: { number } }
	local cur = poseAt(key.pose, t - (key.poseT or 0))
	local w = math.clamp((t - (key.poseT or 0)) / 0.18, 0, 1)
	if w >= 1 or not key.prevPose then
		return cur
	end
	local old = poseAt(key.prevPose, t)
	local out = {}
	for j, v in cur do
		local o = old[j] or ZERO6
		local r = table.create(6)
		for n = 1, 6 do
			r[n] = o[n] + (v[n] - o[n]) * w
		end
		out[j] = r
	end
	for j, o in old do
		if not cur[j] then
			local r = table.create(6)
			for n = 1, 6 do
				r[n] = o[n] * (1 - w)
			end
			out[j] = r
		end
	end
	return out
end

-- ---------------------------------------------------------------- monkey animation (EnemyView's rig)

local function spring()
	return { x = 0, v = 0 }
end
local function stepSpring(s, dt: number, k: number, d: number)
	s.v += (-k * s.x - d * s.v) * dt
	s.x += s.v * dt
end

local function animateMonkey(a, t: number, dt: number, st: ActorState)
	local anim = st.key.anim or "idle"
	local moving = st.speed > 0.5
	local clock = a.clock
	if moving then
		a.phase += dt * st.speed * 0.9 * (if a.variant == "Speedy" then 1.6 elseif a.variant == "Baby" then 1.9 else 1) / a.scale
	end
	local swing = math.sin(a.phase)
	if moving and math.abs(math.cos(a.phase)) > 0.97 then
		a.headZ.v += (if swing > 0 then 1 else -1) * 3.5
		a.headX.v += 2
	end
	stepSpring(a.headX, dt, 140, 7)
	stepSpring(a.headZ, dt, 140, 7)
	local armAmp = if moving then 0.7 else 0.08
	local lArm = CFrame.Angles(-swing * armAmp + (if moving then 0 else math.sin(clock * 2) * 0.05), 0, 0)
	local rArm = CFrame.Angles(swing * armAmp, 0, 0)
	local hipL = CFrame.Angles(if moving then swing * 0.65 else 0, 0, 0)
	local hipR = CFrame.Angles(if moving then -swing * 0.65 else 0, 0, 0)
	local bob = if moving then math.abs(swing) * 0.22 * a.scale else 0
	local lean, waddle, neckX = 0, if moving then swing * 0.1 else 0, 0
	if a.gorilla and moving then
		lArm = CFrame.Angles(0.35 - swing * 0.55, 0, 0)
		rArm = CFrame.Angles(0.35 + swing * 0.55, 0, 0)
		lean = 0.25
	end
	if not moving then
		if anim == "pound" then
			local beat = math.sin(clock * 11 + a.seed)
			lArm = CFrame.Angles(1.6 + beat * 1.1, 0, -0.2)
			rArm = CFrame.Angles(1.6 - beat * 1.1, 0, 0.2)
			bob = math.abs(beat) * 0.15 * a.scale
			if beat > 0.98 then
				a.headX.v += 5
			end
		elseif anim == "throw" then
			local k = math.clamp((t - (st.key.animT or t)) / 0.8, 0, 1)
			rArm = if k < 0.6 then CFrame.Angles(-k / 0.6 * 2.4, 0, 0) else CFrame.Angles(-2.4 + (k - 0.6) / 0.4 * 4.2, 0, 0)
			lean = if k < 0.6 then -0.15 * k / 0.6 else 0.2
		elseif anim == "hang" then
			lArm = CFrame.Angles(3.0, 0, -0.15)
			rArm = CFrame.Angles(3.0, 0, 0.15)
			hipL = CFrame.Angles(0.3 + math.sin(clock * 3) * 0.35, 0, 0)
			hipR = CFrame.Angles(0.3 - math.sin(clock * 3) * 0.35, 0, 0)
			waddle = math.sin(clock * 1.6) * 0.18
		elseif anim == "eat" then
			rArm = CFrame.Angles(2.3 + math.sin(clock * 9) * 0.25, 0, 0.3)
			neckX = math.sin(clock * 9) * 0.08
		elseif anim == "roar" then
			local k = math.clamp((t - (st.key.animT or t)) / 0.25, 0, 1)
			lArm = CFrame.Angles(2.7 * k, 0, -0.7 * k)
			rArm = CFrame.Angles(2.7 * k, 0, 0.7 * k)
			lean = -0.3 * k
			neckX = -0.45 * k
		end
	end
	if a.motors.RootJoint then
		a.motors.RootJoint.Transform = CFrame.new(0, bob, 0) * CFrame.Angles(-lean, 0, waddle)
	end
	if a.motors.Neck then
		a.motors.Neck.Transform = CFrame.Angles(neckX - a.headX.x * 0.03, 0, a.headZ.x * 0.035)
	end
	if a.motors["Left Shoulder"] then
		a.motors["Left Shoulder"].Transform = lArm
	end
	if a.motors["Right Shoulder"] then
		a.motors["Right Shoulder"].Transform = rArm
	end
	if a.motors["Left Hip"] then
		a.motors["Left Hip"].Transform = hipL
	end
	if a.motors["Right Hip"] then
		a.motors["Right Hip"].Transform = hipR
	end
end

-- ---------------------------------------------------------------- UI

local function make(class: string, props: { [string]: any }): any
	local inst = Instance.new(class)
	for k, v in props do
		if k ~= "Parent" then
			(inst :: any)[k] = v
		end
	end
	inst.Parent = props.Parent
	return inst
end

local function buildUi()
	local gui = make("ScreenGui", { Name = "Intro", ResetOnSpawn = false, IgnoreGuiInset = true, DisplayOrder = 20,
		Parent = player:WaitForChild("PlayerGui") })
	local ui = { gui = gui }
	ui.top = make("Frame", { Size = UDim2.new(1, 0, 0.11, 0), Position = UDim2.fromScale(0, -0.11), BackgroundColor3 = Color3.new(0, 0, 0),
		BorderSizePixel = 0, Parent = gui })
	ui.bottom = make("Frame", { Size = UDim2.new(1, 0, 0.11, 0), Position = UDim2.fromScale(0, 1), BackgroundColor3 = Color3.new(0, 0, 0),
		BorderSizePixel = 0, Parent = gui })
	TweenService:Create(ui.top, TweenInfo.new(0.5, Enum.EasingStyle.Quad), { Position = UDim2.fromScale(0, 0) }):Play()
	TweenService:Create(ui.bottom, TweenInfo.new(0.5, Enum.EasingStyle.Quad), { Position = UDim2.fromScale(0, 0.89) }):Play()
	ui.alarm = make("Frame", { Size = UDim2.fromScale(1, 1), BackgroundColor3 = Color3.fromRGB(255, 20, 20), BackgroundTransparency = 1,
		BorderSizePixel = 0, ZIndex = 2, Parent = gui })
	ui.flash = make("Frame", { Size = UDim2.fromScale(1, 1), BackgroundColor3 = Color3.new(1, 1, 1), BackgroundTransparency = 1,
		BorderSizePixel = 0, ZIndex = 9, Parent = gui })
	ui.sub = make("Frame", { Size = UDim2.new(0.8, 0, 0.07, 0), Position = UDim2.fromScale(0.5, 0.86), AnchorPoint = Vector2.new(0.5, 1),
		BackgroundTransparency = 1, Visible = false, ZIndex = 5, Parent = gui })
	ui.who = make("TextLabel", { Size = UDim2.new(1, 0, 0.42, 0), BackgroundTransparency = 1, Font = FONT, TextScaled = true,
		TextColor3 = GREEN, ZIndex = 5, Parent = ui.sub })
	make("UIStroke", { Thickness = 2, Parent = ui.who })
	ui.line = make("TextLabel", { Size = UDim2.new(1, 0, 0.58, 0), Position = UDim2.fromScale(0, 0.42), BackgroundTransparency = 1,
		Font = FONT_UI, TextScaled = true, TextColor3 = Color3.new(1, 1, 1), ZIndex = 5, Parent = ui.sub })
	make("UIStroke", { Thickness = 2, Parent = ui.line })
	ui.title = make("TextLabel", { Size = UDim2.fromScale(0.86, 0.22), Position = UDim2.fromScale(0.5, 0.42), AnchorPoint = Vector2.new(0.5, 0.5),
		BackgroundTransparency = 1, Font = FONT, TextScaled = true, TextColor3 = Color3.fromRGB(255, 214, 40), Visible = false,
		ZIndex = 8, Rotation = -4, Parent = gui })
	ui.titleStroke = make("UIStroke", { Thickness = 6, Parent = ui.title })
	ui.titleScale = make("UIScale", { Parent = ui.title })
	ui.skip = make("TextButton", { Size = UDim2.fromOffset(150, 40), Position = UDim2.new(1, -20, 1, -16), AnchorPoint = Vector2.new(1, 1),
		BackgroundColor3 = GREEN, Text = "SKIP >>", Font = FONT, TextScaled = true, TextColor3 = Color3.fromRGB(16, 18, 16),
		ZIndex = 10, Parent = gui })
	make("UICorner", { CornerRadius = UDim.new(0, 6), Parent = ui.skip })
	make("UIStroke", { Thickness = 3, ApplyStrokeMode = Enum.ApplyStrokeMode.Border, Parent = ui.skip })
	return ui
end

-- ---------------------------------------------------------------- the player

local running = false

function Cutscene.play()
	if running then
		return
	end
	running = true
	local assets = ReplicatedStorage:WaitForChild("Assets")
	local heliTemplate = assets:WaitForChild("HeliFlying", 10)
	local squad = assets:WaitForChild("CutsceneSquad", 15)
	local rigs = ReplicatedStorage:WaitForChild("Rigs", 15)
	local map = workspace:WaitForChild("Map", 10)
	local function done()
		running = false
		Hud.setVisible(true)
		Hud.introFinished()
		Net.event("IntroDone"):FireServer()
	end
	if not (heliTemplate and squad and rigs and map) then
		warn("[Intro] assets missing, skipping the intro")
		done()
		return
	end

	-- the player stands still while it plays
	local character = player.Character or player.CharacterAdded:Wait()
	local hrp = character:WaitForChild("HumanoidRootPart", 5) :: BasePart?
	local humanoid = character:FindFirstChildOfClass("Humanoid")
	if hrp then
		playerPos = hrp.Position
	end
	local oldSpeed, oldJump = 16, 50
	if humanoid then
		oldSpeed, oldJump = humanoid.WalkSpeed, humanoid.JumpPower
		humanoid.WalkSpeed = 0
		humanoid.JumpPower = 0
	end

	local folder = Instance.new("Folder")
	folder.Name = "IntroActors"
	folder.Parent = workspace
	Hud.setVisible(false)
	local ui = buildUi()

	-- ---- map: hide what the intro reveals, restore everything at the end
	local hidden: { [BasePart]: number } = {}
	local effects: { [Instance]: boolean } = {}
	local function hide(part: BasePart)
		if hidden[part] == nil then
			hidden[part] = part.Transparency
		end
		part.Transparency = 1
	end
	local function reveal(part: BasePart)
		if hidden[part] ~= nil then
			part.Transparency = hidden[part]
		end
	end
	local wreck = map:FindFirstChild("Map_Wreck")
	local wreckParts: { BasePart } = {}
	if wreck then
		for _, d in wreck:GetDescendants() do
			if d:IsA("BasePart") then
				hide(d)
				table.insert(wreckParts, d)
			elseif d:IsA("Fire") or d:IsA("Smoke") then
				effects[d] = d.Enabled
				d.Enabled = false
			end
		end
	end
	local north = map:FindFirstChild("Map_North")
	local base = map:FindFirstChild("Map_Base")
	for _, name in { "Brazier", "BrazierFire" } do
		local p = north and north:FindFirstChild(name)
		if p and p:IsA("BasePart") then
			hide(p)
		end
	end
	if base then
		for _, p in base:GetChildren() do
			if p:IsA("BasePart") and p.Name:match("^StashTop") then
				hide(p)
			end
		end
	end
	local eyes: { { part: BasePart, color: Color3, material: Enum.Material } } = {}
	for _, name in { "IdolEyeL", "IdolEyeR" } do
		local p = north and north:FindFirstChild(name)
		if p and p:IsA("BasePart") then
			table.insert(eyes, { part = p, color = p.Color, material = p.Material })
			p.Color = Color3.fromRGB(40, 26, 18)
			p.Material = Enum.Material.SmoothPlastic
		end
	end

	-- ---- the flying chopper
	local heli = heliTemplate:Clone() :: Model
	local heliParts: { BasePart } = {}
	local heliLocal: { CFrame } = {}
	local heliKind: { string } = {}
	local splat: BasePart? = nil
	for _, p in heli:GetDescendants() do
		if p:IsA("BasePart") then
			p.Anchored = true
			p.CanCollide = false
			p.CanQuery = false
			table.insert(heliParts, p)
			table.insert(heliLocal, p.CFrame)
			table.insert(heliKind, if p.Name:match("^HeliRotor") then "rotor" elseif p.Name == "HeliTailRotor" then "tail" else "")
			if p.Name == "HeliBananaSplat" then
				splat = p
				p.Transparency = 1
			end
		end
	end
	heli.Parent = folder
	local hub = CFrame.new(v3(HELI.hub) :: Vector3)
	local tailHub = CFrame.new(v3(HELI.tailHub) :: Vector3)
	local heliRoot = heli:FindFirstChild("HeliRoot") :: BasePart
	local spin, tailSpin = 0, 0

	-- ---- actors
	local actors: { [string]: any } = {}
	for name, def in Intro.actors do
		local model: Model? = nil
		local a: any = { name = name, def = def, clock = 0, phase = math.random() * 6, seed = math.random() * 10,
			headX = spring(), headZ = spring() }
		if def.kind == "man" then
			local template = squad:FindFirstChild(name)
			if template then
				model = template:Clone()
				;(model :: Model):ScaleTo(def.scale or 1)
				local root = (model :: Model):FindFirstChild("HumanoidRootPart") :: BasePart
				-- root height above the soles: custom rigs carry it, avatars are measured
				local soles = math.huge
				for _, foot in { "LeftFoot", "RightFoot" } do
					local f = (model :: Model):FindFirstChild(foot) :: BasePart?
					if f then
						soles = math.min(soles, f.Position.Y - f.Size.Y / 2)
					end
				end
				a.root = root
				local rootHeight = template:GetAttribute("RootHeight")
				a.offset = CFrame.new(0, if rootHeight then rootHeight * (def.scale or 1)
					elseif soles < math.huge then root.Position.Y - soles else 3 * (def.scale or 1), 0)
			end
		else
			local template = rigs:FindFirstChild(def.variant)
			if template then
				model = template:Clone()
				local scale = (EnemyDefs[def.variant] and EnemyDefs[def.variant].Scale) or 1
				if scale ~= 1 then
					(model :: Model):ScaleTo(scale)
				end
				a.scale = scale
				a.variant = def.variant
				a.gorilla = EnemyDefs[def.variant] and EnemyDefs[def.variant].Boss == true
				a.root = (model :: Model).PrimaryPart
				a.offset = CFrame.new(0, (template:GetAttribute("RootHeight") or 3) * scale, 0)
			end
		end
		if model then
			a.model = model
			a.motors = {}
			for _, d in model:GetDescendants() do
				if d:IsA("Motor6D") then
					a.motors[d.Name] = d
				elseif d:IsA("BasePart") then
					d.CanCollide = false
					d.CanQuery = false
					d.CanTouch = false
				end
			end
			if a.root then
				a.root.Anchored = true
			end
			actors[name] = a
		end
	end
	-- the Chucker carries the banana it is about to throw
	local held: BasePart? = nil
	local chucker = actors.Chucker
	if chucker then
		held = Fx.part({ Size = Vector3.new(0.5, 1.6, 0.5), Color = Color3.fromRGB(255, 214, 40), Parent = folder })
	end

	-- ---- sounds that live for a while
	local function loopSound(name: string, parent: Instance): Sound
		local def = Sounds[name]
		local s = Instance.new("Sound")
		s.SoundId = if def.Id then `rbxassetid://{def.Id}` else def.Fallback
		s.Volume = def.Volume
		s.Looped = true
		s.RollOffMinDistance = 25
		s.RollOffMaxDistance = 400
		s.Parent = parent
		s:Play()
		return s
	end
	local rotorSound: Sound? = nil
	local alarmSound: Sound? = nil
	local alarmUntil, smokeUntil, slideUntil = -1, -1, -1
	local nextSmoke, nextSlide = 0, 0
	local subToken = 0

	local function heliPoint(t: number, localP: Vector3): Vector3
		return heliCF(t) * localP
	end
	local S = HELI.scale
	local ENGINE = Vector3.new(0, 6.6 * S, 0.8 * S)
	local SKIDS = Vector3.new(0, -1.0 * S, -2 * S)

	local function say(ev)
		subToken += 1
		local token = subToken
		ui.who.Text = ev.who or ""
		ui.line.Text = ev.text or ""
		ui.sub.Visible = true
		if ev.sound then
			Juice.sound(ev.sound)
		end
		if ev.shout then
			Juice.callout(ev.shout, Color3.fromRGB(255, 60, 40), 1.2)
		end
		task.delay(ev.dur or 2, function()
			if subToken == token then
				ui.sub.Visible = false
			end
		end)
	end

	local function flash(time: number)
		ui.flash.BackgroundTransparency = 0
		TweenService:Create(ui.flash, TweenInfo.new(time), { BackgroundTransparency = 1 }):Play()
	end

	local function actorHead(a): Vector3
		local head = a.model and (a.model:FindFirstChild("Head") :: BasePart?)
		return if head then head.Position + Vector3.new(0, 1, 0) else a.root.Position
	end

	local handlers = {}
	handlers.rotor = function()
		rotorSound = loopSound("Rotor", heliRoot)
	end
	handlers.say = say
	handlers.sound = function(ev)
		Juice.sound(ev.name, nil, ev.pitch, ev.volume)
	end
	handlers.shake = function(ev)
		Juice.shake(ev.amount)
	end
	handlers.punch = function(ev)
		Juice.punch(ev.amount)
	end
	handlers.idolEyes = function()
		for _, e in eyes do
			e.part.Material = e.material
			TweenService:Create(e.part, TweenInfo.new(0.5), { Color = e.color }):Play()
			Fx.sparks(e.part.Position, e.color, 8, 3)
		end
	end
	handlers.banana = function(ev, t)
		local p0 = if actors[ev.from] then trackAt(ev.from, t).cf * (v3(ev.fromLocal) :: Vector3) else Vector3.new(0, 12, 42)
		local model = Fx.part({ Size = Vector3.new(0.6, 1.8, 0.6), Color = Color3.fromRGB(255, 214, 40), Parent = folder })
		local tip = Fx.part({ Size = Vector3.new(0.35, 0.35, 0.35), Color = Color3.fromRGB(80, 56, 30), Parent = folder })
		banana = { p0 = p0, t0 = t, t1 = ev.arrive, to = v3(ev.to), arc = ev.arc or 6, model = model, tip = tip }
		if held then
			held.Transparency = 1
		end
	end
	handlers.splat = function(_, t)
		local at = if banana then bananaPos(t) else heliPoint(t, Vector3.new(-1.6, 5.4, -5.4))
		if banana then
			banana.model:Destroy()
			banana.tip:Destroy()
		end
		if splat then
			splat.Transparency = 0
		end
		Juice.sound("Splat")
		Fx.text(at + Vector3.new(0, 1.5, 0), "SPLAT!", Color3.fromRGB(255, 214, 40), 1.3)
		Fx.bricks(at, { Color3.fromRGB(255, 214, 40), Color3.fromRGB(255, 240, 150) }, 10, 18, 0.6)
		Juice.shake(0.35)
	end
	handlers.alarm = function(ev)
		alarmUntil = ev["until"]
		alarmSound = loopSound("Alarm", heliRoot)
	end
	handlers.smoke = function(ev)
		smokeUntil = ev["until"]
	end
	handlers.slide = function(ev)
		slideUntil = ev["until"]
	end
	handlers.impact = function(_, t)
		local at = heliPoint(t, SKIDS)
		at = Vector3.new(at.X, 0.5, at.Z)
		Fx.poof(at, 7, Color3.fromRGB(236, 205, 110))
		Fx.sparks(at, Color3.fromRGB(255, 200, 80), 14, 6)
		Fx.bricks(at, { Color3.fromRGB(236, 205, 110), Color3.fromRGB(214, 180, 92) }, 14, 24, 0.8)
		Fx.ring(at, 9, Color3.fromRGB(255, 240, 200), 0.4, 0.3)
		Juice.sound("Thud", nil, 0.6)
		Juice.sound("Crash", nil, 1.15, 0.7)
		Juice.shake(0.55)
	end
	handlers.crash = function()
		heli.Parent = nil
		for _, p in wreckParts do
			reveal(p)
		end
		for e, on in effects do
			(e :: any).Enabled = on
		end
		local at = wreckCF * ENGINE
		Fx.explosion(at, 7)
		Fx.bricks(at, { Color3.fromRGB(88, 102, 56), Color3.fromRGB(66, 78, 42), Color3.fromRGB(236, 205, 110) }, 30, 34, 1)
		Fx.poof(Vector3.new(at.X, 1, at.Z), 9, Color3.fromRGB(236, 205, 110))
		flash(0.35)
		Juice.sound("Boom")
		Juice.sound("Crash")
		Juice.shake(1)
		if rotorSound then
			rotorSound:Destroy()
			rotorSound = nil
		end
		if alarmSound then
			alarmSound:Destroy()
			alarmSound = nil
		end
		alarmUntil = -1
	end
	handlers.land = function(ev, t)
		local a = actors[ev.actor]
		if not a then
			return
		end
		local p = trackAt(ev.actor, t).cf.Position
		Fx.poof(Vector3.new(p.X, 0.6, p.Z), if ev.soft then 2.5 else 4, Color3.fromRGB(236, 205, 110))
		Juice.sound("Thud", nil, if ev.soft then 1.2 else 0.9)
		Juice.shake(if ev.soft then 0.05 else 0.15)
	end
	handlers.faceBanana = function(ev)
		local a = actors[ev.actor]
		local head = a and a.model and (a.model:FindFirstChild("Head") :: BasePart?)
		if head then
			local peel = Fx.part({ Size = Vector3.new(1.0, 0.5, 0.15), Color = Color3.fromRGB(255, 214, 40), Anchored = false,
				CFrame = head.CFrame * CFrame.new(0, 0.05, -head.Size.Z / 2 - 0.05) * CFrame.Angles(0, 0, rad(20)), Parent = a.model })
			local weld = Instance.new("WeldConstraint")
			weld.Part0 = head
			weld.Part1 = peel
			weld.Parent = peel
		end
	end
	handlers.dizzy = function(ev)
		local a = actors[ev.actor]
		if a then
			Fx.dizzy(function()
				return if a.model.Parent then actorHead(a) else nil
			end, ev.dur or 2)
		end
	end
	handlers.title = function(ev)
		ui.title.Text = ev.text
		ui.title.Visible = true
		ui.title.TextTransparency = 0
		ui.titleStroke.Transparency = 0
		ui.titleScale.Scale = 3
		TweenService:Create(ui.titleScale, TweenInfo.new(0.3, Enum.EasingStyle.Back), { Scale = 1 }):Play()
		Juice.sound("Title")
		Juice.shake(0.45)
		task.delay(ev.dur or 1.8, function()
			TweenService:Create(ui.title, TweenInfo.new(0.35), { TextTransparency = 1 }):Play()
			TweenService:Create(ui.titleStroke, TweenInfo.new(0.35), { Transparency = 1 }):Play()
		end)
	end
	handlers.letterbox = function(ev)
		if not ev.on then
			TweenService:Create(ui.top, TweenInfo.new(0.5), { Position = UDim2.fromScale(0, -0.11) }):Play()
			TweenService:Create(ui.bottom, TweenInfo.new(0.5), { Position = UDim2.fromScale(0, 1) }):Play()
			TweenService:Create(ui.skip, TweenInfo.new(0.3), { BackgroundTransparency = 1, TextTransparency = 1 }):Play()
		end
	end

	-- ---- per frame
	camera.CameraType = Enum.CameraType.Scriptable
	local t0 = os.clock()
	local lastT = 0
	local nextEvent = 1
	local events = Intro.events
	local finished = false

	local function finish()
		if finished then
			return
		end
		finished = true
		keyConn:Disconnect()
		RunService:UnbindFromRenderStep("IntroCutscene")
		if rotorSound then
			rotorSound:Destroy()
		end
		if alarmSound then
			alarmSound:Destroy()
		end
		folder:Destroy()
		ui.gui:Destroy()
		for p, tr in hidden do
			p.Transparency = tr
		end
		for e, on in effects do
			(e :: any).Enabled = on
		end
		for _, e in eyes do
			e.part.Color = e.color
			e.part.Material = e.material
		end
		Juice.baseFov = 70
		camera.CameraType = Enum.CameraType.Custom
		if humanoid then
			humanoid.WalkSpeed = oldSpeed
			humanoid.JumpPower = oldJump
		end
		done()
	end

	ui.skip.Activated:Connect(finish)
	local keyConn = UserInputService.InputBegan:Connect(function(input, processed)
		if not processed and (input.KeyCode == Enum.KeyCode.Space or input.KeyCode == Enum.KeyCode.Return) then
			finish()
		end
	end)

	RunService:BindToRenderStep("IntroCutscene", Enum.RenderPriority.Camera.Value, function()
		if finished then
			return
		end
		local t = os.clock() - t0
		if t >= Intro.duration then
			finish()
			return
		end
		local dt = math.min(t - lastT, 1 / 20)
		lastT = t
		local rate = rateAt(t)

		while nextEvent <= #events and events[nextEvent].t <= t do
			local ev = events[nextEvent]
			nextEvent += 1
			local h = handlers[ev["do"]]
			if h then
				task.spawn(h, ev, t)
			end
		end

		-- chopper
		if heli.Parent then
			local cf = heliCF(t)
			spin += dt * rate * Intro.rotorRps * math.pi * 2
			tailSpin += dt * rate * Intro.rotorRps * math.pi * 5
			local cfs = table.create(#heliParts)
			for i, p in heliParts do
				local kind = heliKind[i]
				if kind == "rotor" then
					cfs[i] = cf * hub * CFrame.Angles(0, spin, 0) * hub:Inverse() * heliLocal[i]
				elseif kind == "tail" then
					cfs[i] = cf * tailHub * CFrame.Angles(tailSpin, 0, 0) * tailHub:Inverse() * heliLocal[i]
				else
					cfs[i] = cf * heliLocal[i]
				end
			end
			workspace:BulkMoveTo(heliParts, cfs, Enum.BulkMoveMode.FireCFrameChanged)
			if rotorSound then
				rotorSound.PlaybackSpeed = 0.6 + 0.4 * rate
			end
		end

		-- actors
		for name, a in actors do
			local st = trackAt(name, t)
			local wanted = if st.visible then folder else nil
			if a.model.Parent ~= wanted then
				a.model.Parent = wanted
			end
			if not st.visible then
				continue
			end
			a.clock += dt * rate
			a.root.CFrame = st.cf * a.offset
			if a.def.kind == "man" then
				local pose = blendedPose(st.key, t)
				for j, m in a.motors do
					local v = pose[j]
					m.Transform = if v then CFrame.new(v[4], v[5], v[6]) * CFrame.Angles(v[1], v[2], v[3]) else CFrame.identity
				end
			else
				animateMonkey(a, t, dt * rate, st)
			end
		end
		if held and chucker then
			local arm = chucker.model:FindFirstChild("RightArm") :: BasePart?
			if arm then
				held.CFrame = arm.CFrame * CFrame.new(0, -arm.Size.Y * 0.5, -0.2) * CFrame.Angles(rad(20), 0, rad(15))
			end
		end
		if banana and banana.model.Parent then
			local p = bananaPos(t)
			banana.model.CFrame = CFrame.new(p) * CFrame.Angles(t * 9, t * 6, 0)
			banana.tip.CFrame = banana.model.CFrame * CFrame.new(0, 1.0, 0)
		end

		-- running effects
		if t < alarmUntil then
			ui.alarm.BackgroundTransparency = 0.72 + 0.28 * math.abs(math.cos(t * 6))
		else
			ui.alarm.BackgroundTransparency = 1
		end
		if t < smokeUntil and t >= nextSmoke then
			nextSmoke = t + 0.07
			Fx.poof(heliPoint(t, ENGINE), 2.6, Color3.fromRGB(70, 68, 66))
		end
		if t < slideUntil and t >= nextSlide then
			nextSlide = t + 0.05
			local nose = heliPoint(t, Vector3.new(0, 0, -6 * S))
			Fx.poof(Vector3.new(nose.X, 0.8, nose.Z), 3.4, Color3.fromRGB(236, 205, 110))
			local hx = heliCF(t).Position.X
			for _, p in wreckParts do
				if (p.Name:match("^Trench") or p.Name:match("^Berm")) and p.Position.X > hx + 1 then
					reveal(p)
				end
			end
		end

		-- camera last, so Juice's shake lands on top of it
		local cf, fov = cameraAt(t)
		camera.CFrame = cf
		Juice.baseFov = fov
		camera.FieldOfView = fov
	end)
end

return Cutscene
