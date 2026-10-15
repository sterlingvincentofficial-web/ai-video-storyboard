-- How monkeys die. The style follows whatever landed the killing blow:
--   Bonk    (punches)  bobble head pops off with a boing, bounces away and bursts; body crumbles
--   Whack   (axe)      batted off sideways, tumbling, then bursts into bricks
--   Pop     (pebbles, bullets, taunts)  squash-and-stretch balloon pop into a brick burst
--   Launch  (grenades) blasted up into the sky screaming, bursts with a twinkle
--   Caught  (nets)     shrinks into the net and poofs
--   Boss               chain of explosions, then a giant brick shower, confetti and a coin fountain
-- Every kill also feeds the combo, shakes the camera a little and sends coins to the cash counter.
-- Everything is anchored and moved by our own little physics step: cheap, smooth, deterministic.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local EnemyDefs = require(Shared.Config.Enemies)
local EnemyView = require(script.Parent.EnemyView)
local Fx = require(script.Parent.Fx)
local Juice = require(script.Parent.Juice)

local KillFx = {}

local GRAVITY = 90

-- ---------------------------------------------------------------- tiny physics for flying bits

type Flyer = {
	part: BasePart,
	pos: Vector3,
	vel: Vector3,
	rot: CFrame,
	spin: Vector3,
	floor: number,
	bounce: number,
	bounces: number,
	life: number,
	onBounce: ((Flyer) -> ())?,
	onDone: ((Flyer) -> ())?,
	trail: boolean?,
	trailT: number,
}
local flyers: { Flyer } = {}

local function fly(part: BasePart, vel: Vector3, spin: Vector3, opts: { [string]: any }?): Flyer
	part.Anchored = true
	local o = opts or {}
	local f: Flyer = {
		part = part,
		pos = part.Position,
		vel = vel,
		rot = part.CFrame.Rotation,
		spin = spin,
		floor = o.floor or 0,
		bounce = o.bounce or 0.45,
		bounces = 0,
		life = o.life or 1.2,
		onBounce = o.onBounce,
		onDone = o.onDone,
		trail = o.trail,
		trailT = 0,
	}
	table.insert(flyers, f)
	return f
end

RunService.RenderStepped:Connect(function(dt)
	dt = math.min(dt, 1 / 20)
	local i = 1
	while i <= #flyers do
		local f = flyers[i]
		f.life -= dt
		if f.life <= 0 or not f.part.Parent then
			table.remove(flyers, i)
			if f.onDone and f.part.Parent then
				f.onDone(f)
			end
			continue
		end
		f.vel -= Vector3.new(0, GRAVITY * dt, 0)
		f.pos += f.vel * dt
		if f.spin.Magnitude > 0 then
			f.rot = CFrame.fromAxisAngle(f.spin.Unit, f.spin.Magnitude * dt) * f.rot
		end
		local half = f.part.Size.Y * 0.5
		if f.pos.Y < f.floor + half and f.vel.Y < 0 then
			f.pos = Vector3.new(f.pos.X, f.floor + half, f.pos.Z)
			f.vel = Vector3.new(f.vel.X * 0.6, -f.vel.Y * f.bounce, f.vel.Z * 0.6)
			f.spin *= 0.6
			f.bounces += 1
			if f.onBounce then
				f.onBounce(f)
			end
		end
		if f.trail then
			f.trailT -= dt
			if f.trailT <= 0 then
				f.trailT = 0.05
				Fx.poof(f.pos, 1.4, Color3.fromRGB(230, 230, 230))
			end
		end
		f.part.CFrame = CFrame.new(f.pos) * f.rot
		i += 1
	end
end)

-- ---------------------------------------------------------------- helpers

local function palette(def): { Color3 }
	local c = def.Colors
	local out = { c.Fur, c.Fur, c.Fur, c.Cream, c.Cream }
	if c.Accent then
		table.insert(out, c.Accent)
	end
	return out
end

local function visibleParts(model: Model): { BasePart }
	local out = {}
	for _, p in model:GetDescendants() do
		if p:IsA("BasePart") and p.Transparency < 1 then
			table.insert(out, p)
		end
	end
	return out
end

-- Bursts a whole model into bricks, part by part, and removes it.
local function shatter(model: Model, def, power: number, budgetScale: number)
	local colors = palette(def)
	for _, p in visibleParts(model) do
		local volume = p.Size.X * p.Size.Y * p.Size.Z
		local n = math.clamp(math.floor(volume * 2.2 * budgetScale), 2, 26)
		Fx.bricks(p.Position, colors, n, power, math.clamp(def.Scale, 0.8, 1.6))
	end
	local cf = model:GetPivot()
	Fx.poof(cf.Position, 3.2 * def.Scale)
	model:Destroy()
end

local function headOf(model: Model): BasePart?
	return model:FindFirstChild("Head") :: BasePart?
end

-- ---------------------------------------------------------------- styles

local function styleBonk(view, pos: Vector3, budget: number)
	local model, def = view.model, view.def
	local head = headOf(model)
	local neck = model:FindFirstChild("Neck", true)
	Fx.flash(model, nil, 0.08)
	Fx.text(pos + Vector3.new(0, 5 * def.Scale, 0), "BONK!", Color3.fromRGB(255, 230, 60))
	Juice.sound("Bonk", pos, 1.15 / def.Scale)
	if head and neck then
		neck:Destroy()
		head.Parent = Fx.folder
		Juice.sound("Boing", pos, 1.25 / def.Scale)
		local away = -(view.dir or Vector3.zAxis)
		local side = Vector3.new(-away.Z, 0, away.X) * Fx.rand(-6, 6)
		fly(head, away * Fx.rand(9, 14) + side + Vector3.new(0, Fx.rand(30, 38), 0),
			Fx.randomUnit() * Fx.rand(10, 18), {
				bounce = 0.55,
				life = 1.5,
				onBounce = function(f)
					Juice.sound("Boing", f.pos, 1.4 + f.bounces * 0.15, 0.6)
					Fx.poof(f.pos, 1.4)
					if f.bounces >= 2 then
						f.life = 0.01
					end
				end,
				onDone = function(f)
					Fx.bricks(f.pos, { def.Colors.Cream, def.Colors.Fur, def.Colors.Fur }, math.floor(10 * budget), 26, def.Scale)
					Fx.text(f.pos + Vector3.new(0, 2, 0), "POP!", Color3.fromRGB(255, 255, 255), 0.8)
					Juice.sound("Pop", f.pos, 1.3)
					f.part:Destroy()
				end,
			})
	end
	-- body wobbles for a beat, then crumbles
	task.delay(0.12, function()
		if model.Parent then
			shatter(model, def, 22, budget)
		end
	end)
end

local function styleWhack(view, pos: Vector3, budget: number)
	local model, def = view.model, view.def
	local root = model.PrimaryPart
	Fx.flash(model, nil, 0.08)
	Fx.text(pos + Vector3.new(0, 5 * def.Scale, 0), "WHACK!", Color3.fromRGB(255, 140, 40))
	Juice.sound("Chop", pos, 1.1 / def.Scale)
	Juice.sound("Squeak", pos, Fx.rand(1.1, 1.4))
	if not root then
		shatter(model, def, 30, budget)
		return
	end
	local side = Fx.randomUnit()
	side = Vector3.new(side.X, 0, side.Z).Unit
	fly(root, side * Fx.rand(18, 26) + Vector3.new(0, Fx.rand(22, 30), 0), Vector3.new(side.Z, 0, -side.X) * 14, {
		floor = view.rootHeight * 0.4,
		bounce = 0.35,
		life = 0.75,
		onBounce = function(f)
			Juice.sound("Thud", f.pos, 1.2)
			Fx.poof(f.pos, 2.4)
		end,
		onDone = function(_f)
			shatter(model, def, 30, budget)
			Juice.sound("Pop", root.Position, 1.1)
		end,
	})
end

local function stylePop(view, pos: Vector3, budget: number)
	local model, def = view.model, view.def
	Fx.flash(model, nil, 0.1)
	-- squash... stretch... POP
	local base = def.Scale
	local t0 = os.clock()
	local conn
	conn = RunService.RenderStepped:Connect(function()
		local a = (os.clock() - t0) / 0.09
		if not model.Parent then
			conn:Disconnect()
			return
		end
		if a >= 1 then
			conn:Disconnect()
			local center = model:GetPivot().Position
			shatter(model, def, 28, budget)
			Fx.text(center + Vector3.new(0, 3 * base, 0), "POP!", Color3.fromRGB(255, 255, 255))
			Fx.confetti(center, math.floor(6 * budget))
			Juice.sound("Pop", center, 1.25 / base)
			return
		end
		pcall(function()
			model:ScaleTo(base * (1 + 0.32 * math.sin(a * math.pi * 0.5)))
		end)
	end)
end

local function styleLaunch(view, pos: Vector3, budget: number)
	local model, def = view.model, view.def
	local root = model.PrimaryPart
	Fx.flash(model, Color3.fromRGB(255, 200, 120), 0.1)
	Juice.sound("Whee", pos, Fx.rand(1.2, 1.5))
	if not root then
		shatter(model, def, 40, budget)
		return
	end
	local out = Fx.randomUnit()
	out = Vector3.new(out.X, 0, out.Z).Unit
	fly(root, out * Fx.rand(10, 16) + Vector3.new(0, Fx.rand(48, 58), 0), Fx.randomUnit() * 16, {
		life = 0.75,
		trail = true,
		onDone = function(_f)
			local at = root.Position
			shatter(model, def, 34, budget)
			-- twinkle in the sky
			local star = Fx.part({ Size = Vector3.new(0.4, 0.4, 0.1), Position = at, Color = Color3.fromRGB(255, 255, 220),
				Material = Enum.Material.Neon })
			Fx.tween(star, 0.15, { Size = Vector3.new(3, 3, 0.1) }, Enum.EasingStyle.Back)
			task.delay(0.15, function()
				Fx.tween(star, 0.25, { Size = Vector3.zero, Transparency = 1 })
			end)
			game:GetService("Debris"):AddItem(star, 0.45)
			Juice.sound("Pop", at, 1.6, 0.8)
		end,
	})
end

local function styleCaught(view, pos: Vector3, budget: number)
	local model, def = view.model, view.def
	Fx.text(pos + Vector3.new(0, 4 * def.Scale, 0), "CAUGHT!", Color3.fromRGB(120, 230, 255))
	Juice.sound("Squeak", pos, Fx.rand(1.3, 1.6))
	local base = def.Scale
	local t0 = os.clock()
	local root = model.PrimaryPart
	local startCf = root and root.CFrame
	local conn
	conn = RunService.RenderStepped:Connect(function()
		local a = (os.clock() - t0) / 0.35
		if not model.Parent then
			conn:Disconnect()
			return
		end
		if a >= 1 then
			conn:Disconnect()
			local at = model:GetPivot().Position
			Fx.poof(at, 2.5, Color3.fromRGB(220, 250, 255))
			Fx.sparks(at, Color3.fromRGB(120, 230, 255), 10, 5)
			Juice.sound("Pop", at, 1.5)
			model:Destroy()
			return
		end
		pcall(function()
			model:ScaleTo(base * (1 - a * 0.9))
		end)
		if root and startCf then
			root.CFrame = startCf * CFrame.Angles(0, a * 9, 0)
		end
	end)
	local _ = budget
end

local function styleBoss(view, pos: Vector3, def)
	local model = view.model
	Juice.callout("BOSS DOWN!", Color3.fromRGB(255, 210, 40), 2)
	Juice.sound("BossDown")
	Juice.sound("Roar", pos, 0.7)
	Juice.shake(0.7)
	Juice.punch(12)
	local parts = visibleParts(model)
	for i = 1, 7 do
		task.delay(i * 0.18, function()
			if not model.Parent then
				return
			end
			Fx.flash(model, if i % 2 == 0 then Color3.new(1, 1, 1) else Color3.fromRGB(255, 120, 60), 0.12)
			local p = parts[math.random(1, #parts)]
			local at = p.Position + Fx.randomUnit() * 1.5
			Fx.explosion(at, 3.5)
			Fx.bricks(at, palette(def), 14, 30, 1.3)
			Juice.sound("Boom", at, Fx.rand(0.8, 1.1))
			Juice.shake(0.35)
		end)
	end
	task.delay(1.45, function()
		if not model.Parent then
			return
		end
		local at = model:GetPivot().Position
		Fx.explosion(at, 9)
		Fx.ring(Vector3.new(at.X, 0.3, at.Z), 34, Color3.fromRGB(255, 220, 90), 0.6, 0.5)
		shatter(model, def, 48, 3)
		Fx.confetti(at + Vector3.new(0, 4, 0), 90)
		Juice.sound("Boom", at, 0.6, 1.2)
		Juice.shake(1)
		Juice.punch(16)
	end)
end

-- ---------------------------------------------------------------- dispatch

local STYLE = {
	Punch = styleBonk,
	Chop = styleWhack,
	Pebble = stylePop,
	Bullet = stylePop,
	Taunt = stylePop,
	Grenade = styleLaunch,
	Net = styleCaught,
}

function KillFx.play(deaths: { any })
	-- many deaths in one frame: keep it fun but cap the brick count
	local budget = math.clamp(1.2 - #deaths * 0.06, 0.35, 1)
	for _, d in deaths do
		local id, typeName, kind, pos, reward, overkill = d[1], d[2], d[3], d[4], d[5], d[6]
		local def = EnemyDefs[typeName]
		if not def then
			continue
		end
		local view = EnemyView.release(id)
		Juice.kill(def.Boss == true)
		Juice.coins(pos + Vector3.new(0, 2, 0), math.floor(2 + reward / 4), reward)
		Juice.shake(if def.Boss then 0 else 0.06 * def.Scale, pos)
		if not view then
			Fx.bricks(pos + Vector3.new(0, 2, 0), palette(def), 10, 25)
			continue
		end
		if def.Boss then
			styleBoss(view, pos, def)
			continue
		end
		local style = STYLE[kind] or stylePop
		-- big overkills sometimes get the full launch treatment
		if style == stylePop and overkill and overkill > 20 and math.random() < 0.35 then
			style = styleLaunch
		end
		-- a short hit-stop: the monkey freezes for a beat before it goes
		task.delay(0.035, style, view, view.root and view.root.Position or pos, budget)
	end
end

return KillFx
