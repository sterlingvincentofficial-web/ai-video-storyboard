-- Visual effect building blocks, all client-side and all made of parts/GUI (no uploaded
-- textures needed). The kill effects, hits and unit animations are composed from these.

local Debris = game:GetService("Debris")
local TweenService = game:GetService("TweenService")

local Fx = {}

local folder = Instance.new("Folder")
folder.Name = "ClientFx"
folder.Parent = workspace
Fx.folder = folder

local liveBricks = 0
local MAX_BRICKS = 420

local function tween(inst: Instance, time: number, props: { [string]: any }, style: Enum.EasingStyle?, dir: Enum.EasingDirection?)
	local tw = TweenService:Create(inst, TweenInfo.new(time, style or Enum.EasingStyle.Quad, dir or Enum.EasingDirection.Out), props)
	tw:Play()
	return tw
end
Fx.tween = tween

function Fx.part(props: { [string]: any }): Part
	local p = Instance.new("Part")
	p.Anchored = true
	p.CanCollide = false
	p.CanQuery = false
	p.CanTouch = false
	p.CastShadow = false
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	p.Material = Enum.Material.SmoothPlastic
	for k, v in props do
		(p :: any)[k] = v
	end
	p.Parent = props.Parent or folder
	return p
end

local function rand(a: number, b: number): number
	return a + math.random() * (b - a)
end
Fx.rand = rand

local function randomUnit(): Vector3
	local v = Vector3.new(rand(-1, 1), rand(-1, 1), rand(-1, 1))
	return if v.Magnitude > 1e-3 then v.Unit else Vector3.yAxis
end
Fx.randomUnit = randomUnit

-- Studded toy bricks that burst out, bounce on the ground and shrink away. The signature kill.
function Fx.bricks(origin: Vector3, colors: { Color3 }, count: number, power: number, size: number?, upBias: number?)
	size = size or 1
	local budget = math.min(count, MAX_BRICKS - liveBricks)
	for _ = 1, budget do
		liveBricks += 1
		local s = (size :: number) * rand(0.7, 1.15)
		local long = math.random() < 0.5
		local b = Fx.part({
			Size = if long then Vector3.new(0.9, 0.45, 0.45) * s else Vector3.new(0.5, 0.45, 0.5) * s,
			CFrame = CFrame.new(origin + randomUnit() * 0.6 * (size :: number)) * CFrame.Angles(rand(0, 6), rand(0, 6), rand(0, 6)),
			Color = colors[math.random(1, #colors)],
			Material = Enum.Material.Plastic,
			TopSurface = Enum.SurfaceType.Studs,
			Anchored = false,
			CanCollide = true,
		})
		local dir = randomUnit()
		dir = Vector3.new(dir.X, math.abs(dir.Y) + (upBias or 0.8), dir.Z).Unit
		b.AssemblyLinearVelocity = dir * power * rand(0.55, 1.15)
		b.AssemblyAngularVelocity = randomUnit() * rand(8, 22)
		local life = rand(1.1, 1.8)
		task.delay(life, function()
			tween(b, 0.25, { Size = Vector3.zero, Transparency = 1 }, Enum.EasingStyle.Back, Enum.EasingDirection.In)
			task.delay(0.26, function()
				b:Destroy()
				liveBricks -= 1
			end)
		end)
	end
end

function Fx.brickBudgetLeft(): number
	return MAX_BRICKS - liveBricks
end

-- Soft dust puff (balls that swell and fade).
function Fx.poof(pos: Vector3, size: number, color: Color3?)
	for _ = 1, 6 do
		local s = size * rand(0.5, 0.9)
		local ball = Fx.part({
			Shape = Enum.PartType.Ball,
			Size = Vector3.one * s * 0.4,
			Position = pos + randomUnit() * size * 0.35,
			Color = color or Color3.fromRGB(245, 235, 210),
			Transparency = 0.15,
		})
		tween(ball, rand(0.35, 0.55), { Size = Vector3.one * s, Transparency = 1,
			Position = ball.Position + Vector3.new(0, size * 0.4, 0) })
		Debris:AddItem(ball, 0.6)
	end
end

-- Flat expanding shockwave ring on the ground.
function Fx.ring(pos: Vector3, radius: number, color: Color3, time: number?, thickness: number?)
	local ring = Fx.part({
		Shape = Enum.PartType.Cylinder,
		Size = Vector3.new(thickness or 0.25, 1, 1),
		CFrame = CFrame.new(pos) * CFrame.Angles(0, 0, math.pi / 2),
		Color = color,
		Material = Enum.Material.Neon,
		Transparency = 0.15,
	})
	tween(ring, time or 0.35, { Size = Vector3.new(thickness or 0.25, radius * 2, radius * 2), Transparency = 1 })
	Debris:AddItem(ring, (time or 0.35) + 0.05)
end

-- Fast little neon chips.
function Fx.sparks(pos: Vector3, color: Color3, count: number, speed: number?)
	for _ = 1, count do
		local chip = Fx.part({
			Size = Vector3.new(0.18, 0.18, 0.5),
			Color = color,
			Material = Enum.Material.Neon,
			CFrame = CFrame.lookAt(pos, pos + randomUnit()),
		})
		local dir = chip.CFrame.LookVector
		tween(chip, rand(0.15, 0.3), { CFrame = chip.CFrame + dir * (speed or 4) * rand(0.6, 1.2), Size = Vector3.new(0.05, 0.05, 0.15) })
		Debris:AddItem(chip, 0.32)
	end
end

local FONT = Enum.Font.GothamBlack

local function billboard(pos: Vector3, w: number, h: number): (BillboardGui, Part)
	local anchor = Fx.part({ Size = Vector3.one * 0.1, Position = pos, Transparency = 1 })
	local bb = Instance.new("BillboardGui")
	bb.Size = UDim2.fromScale(w, h)
	bb.AlwaysOnTop = true
	bb.LightInfluence = 0
	bb.MaxDistance = 260
	bb.Adornee = anchor
	bb.Parent = anchor
	return bb, anchor
end

-- Comic-book burst word ("POP!", "BONK!") that punches in and floats away.
function Fx.text(pos: Vector3, text: string, color: Color3, scale: number?)
	scale = scale or 1
	local bb, anchor = billboard(pos, 7 * (scale :: number), 3 * (scale :: number))
	local label = Instance.new("TextLabel")
	label.BackgroundTransparency = 1
	label.Size = UDim2.fromScale(1, 1)
	label.AnchorPoint = Vector2.new(0.5, 0.5)
	label.Position = UDim2.fromScale(0.5, 0.5)
	label.Text = text
	label.Font = FONT
	label.TextScaled = true
	label.TextColor3 = color
	label.Rotation = rand(-14, 14)
	local stroke = Instance.new("UIStroke")
	stroke.Thickness = 3
	stroke.Color = Color3.new(0, 0, 0)
	stroke.Parent = label
	local uiScale = Instance.new("UIScale")
	uiScale.Scale = 0.2
	uiScale.Parent = label
	label.Parent = bb
	tween(uiScale, 0.18, { Scale = 1.15 }, Enum.EasingStyle.Back)
	task.delay(0.18, function()
		tween(uiScale, 0.1, { Scale = 1 })
	end)
	tween(anchor, 0.8, { Position = pos + Vector3.new(0, 2.2, 0) }, Enum.EasingStyle.Quad)
	task.delay(0.5, function()
		tween(label, 0.3, { TextTransparency = 1 })
		tween(stroke, 0.3, { Transparency = 1 })
	end)
	Debris:AddItem(anchor, 0.85)
end

-- Damage number: pops, drifts sideways and up, fades. Crits are bigger and gold.
function Fx.number(pos: Vector3, amount: number, crit: boolean, color: Color3?)
	local s = if crit then 1.6 else 1
	local bb, anchor = billboard(pos + Vector3.new(rand(-0.8, 0.8), 0, rand(-0.8, 0.8)), 3 * s, 1.4 * s)
	local label = Instance.new("TextLabel")
	label.BackgroundTransparency = 1
	label.Size = UDim2.fromScale(1, 1)
	label.Text = if crit then `{amount}!` else tostring(amount)
	label.Font = FONT
	label.TextScaled = true
	label.TextColor3 = if crit then Color3.fromRGB(255, 200, 30) else (color or Color3.new(1, 1, 1))
	local stroke = Instance.new("UIStroke")
	stroke.Thickness = 2
	stroke.Parent = label
	local uiScale = Instance.new("UIScale")
	uiScale.Scale = 1.8
	uiScale.Parent = label
	label.Parent = bb
	tween(uiScale, 0.15, { Scale = 1 }, Enum.EasingStyle.Back)
	local drift = Vector3.new(rand(-1.5, 1.5), rand(2.2, 3.2), rand(-1.5, 1.5))
	tween(anchor, 0.7, { Position = anchor.Position + drift }, Enum.EasingStyle.Quart)
	task.delay(0.45, function()
		tween(label, 0.25, { TextTransparency = 1 })
		tween(stroke, 0.25, { Transparency = 1 })
	end)
	Debris:AddItem(anchor, 0.75)
end

-- Dizzy stars circling above something for `time` seconds.
function Fx.dizzy(getPos: () -> Vector3?, time: number)
	local stars = {}
	for i = 1, 3 do
		stars[i] = Fx.part({
			Size = Vector3.new(0.45, 0.45, 0.12),
			Color = Color3.fromRGB(255, 220, 60),
			Material = Enum.Material.Neon,
		})
	end
	local t0 = os.clock()
	local conn
	conn = game:GetService("RunService").RenderStepped:Connect(function()
		local t = os.clock() - t0
		local p = getPos()
		if t > time or not p then
			conn:Disconnect()
			for _, s in stars do
				s:Destroy()
			end
			return
		end
		for i, s in stars do
			local a = t * 7 + i * math.pi * 2 / 3
			s.CFrame = CFrame.new(p + Vector3.new(math.cos(a) * 1, 0.2 + math.sin(t * 9 + i) * 0.1, math.sin(a) * 1))
				* CFrame.Angles(0, -a, t * 6)
		end
	end)
end

-- Cartoon explosion: fireball, smoke, ring, sparks.
function Fx.explosion(pos: Vector3, radius: number)
	local core = Fx.part({ Shape = Enum.PartType.Ball, Size = Vector3.one, Position = pos,
		Color = Color3.fromRGB(255, 220, 90), Material = Enum.Material.Neon })
	tween(core, 0.18, { Size = Vector3.one * radius * 1.6 }, Enum.EasingStyle.Back)
	task.delay(0.15, function()
		tween(core, 0.25, { Transparency = 1, Color = Color3.fromRGB(255, 120, 30) })
	end)
	Debris:AddItem(core, 0.45)
	for _ = 1, 7 do
		local smoke = Fx.part({ Shape = Enum.PartType.Ball, Size = Vector3.one * radius * 0.4,
			Position = pos + randomUnit() * radius * 0.4, Color = Color3.fromRGB(90, 86, 84), Transparency = 0.2 })
		tween(smoke, rand(0.5, 0.8), { Size = Vector3.one * radius * rand(0.9, 1.3), Transparency = 1,
			Position = smoke.Position + Vector3.new(0, radius * 0.8, 0) })
		Debris:AddItem(smoke, 0.85)
	end
	Fx.ring(Vector3.new(pos.X, 0.2, pos.Z), radius * 1.3, Color3.fromRGB(255, 200, 80), 0.3, 0.3)
	Fx.sparks(pos, Color3.fromRGB(255, 180, 40), 10, radius * 1.5)
end

-- Colorful paper confetti that flutters down.
function Fx.confetti(pos: Vector3, count: number)
	local palette = { Color3.fromRGB(255, 80, 80), Color3.fromRGB(255, 214, 40), Color3.fromRGB(80, 200, 255),
		Color3.fromRGB(120, 230, 90), Color3.fromRGB(240, 120, 255) }
	for _ = 1, count do
		local c = Fx.part({
			Size = Vector3.new(0.35, 0.05, 0.25),
			Color = palette[math.random(1, #palette)],
			CFrame = CFrame.new(pos) * CFrame.Angles(rand(0, 6), rand(0, 6), rand(0, 6)),
		})
		local target = pos + Vector3.new(rand(-6, 6), rand(2, 7), rand(-6, 6))
		tween(c, 0.4, { Position = target }, Enum.EasingStyle.Quad)
		task.delay(0.4, function()
			tween(c, rand(1, 1.6), { Position = Vector3.new(target.X + rand(-2, 2), 0.1, target.Z + rand(-2, 2)),
				Orientation = Vector3.new(rand(0, 720), rand(0, 720), rand(0, 720)) }, Enum.EasingStyle.Sine)
		end)
		Debris:AddItem(c, 2.2)
	end
end

-- White hit flash on a model (pooled Highlights; Roblox caps how many can show at once).
-- The Highlights live in our own folder and only adorn the model, so a model destroyed
-- mid-flash (kill effects do that) never takes a pooled Highlight down with it.
local flashPool: { Highlight } = {}
local FLASH_MAX = 24
local flashLive = 0
function Fx.flash(model: Model, color: Color3?, time: number?)
	if flashLive >= FLASH_MAX or not model.Parent then
		return
	end
	local h = table.remove(flashPool) or Instance.new("Highlight")
	flashLive += 1
	h.FillColor = color or Color3.new(1, 1, 1)
	h.OutlineTransparency = 1
	h.FillTransparency = 0.05
	h.DepthMode = Enum.HighlightDepthMode.Occluded
	h.Adornee = model
	h.Enabled = true
	h.Parent = folder
	tween(h, time or 0.12, { FillTransparency = 1 })
	task.delay((time or 0.12) + 0.02, function()
		h.Enabled = false -- pooled: never falls back to highlighting its parent folder
		h.Adornee = nil
		flashLive -= 1
		table.insert(flashPool, h)
	end)
end

return Fx
