-- Game feel: sounds with pitch variety, trauma-based camera shake, FOV punches, the kill combo
-- with escalating callouts, and coins that fly from a kill into the cash counter.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local SoundService = game:GetService("SoundService")
local TweenService = game:GetService("TweenService")

local Sounds = require(ReplicatedStorage:WaitForChild("Shared"):WaitForChild("Sounds"))
local Fx = require(script.Parent.Fx)

local Juice = {}

local camera = workspace.CurrentCamera
local player = Players.LocalPlayer

-- ---------------------------------------------------------------- sound

local lastPlayed: { [string]: number } = {}
local playingCount: { [string]: number } = {}
local MAX_SAME = 5

-- Plays a named sound (Sounds.luau). pos makes it 3D. pitch scales speed (1 = normal).
function Juice.sound(name: string, pos: Vector3?, pitch: number?, volume: number?)
	local def = Sounds[name]
	if not def then
		return
	end
	local t = os.clock()
	if (playingCount[name] or 0) >= MAX_SAME or t - (lastPlayed[name] or 0) < 0.025 then
		return -- stops 40 pops in one frame turning into a wall of noise
	end
	lastPlayed[name] = t
	playingCount[name] = (playingCount[name] or 0) + 1
	local s = Instance.new("Sound")
	s.SoundId = if def.Id then `rbxassetid://{def.Id}` else def.Fallback
	s.Volume = def.Volume * (volume or 1)
	s.PlaybackSpeed = (pitch or 1) * Fx.rand(0.94, 1.06)
	if pos then
		local holder = Fx.part({ Size = Vector3.one * 0.1, Position = pos, Transparency = 1 })
		s.RollOffMinDistance = 20
		s.RollOffMaxDistance = 260
		s.Parent = holder
		task.delay(4, function()
			holder:Destroy()
		end)
	else
		s.Parent = SoundService
	end
	s:Play()
	s.Ended:Once(function()
		playingCount[name] = math.max(0, (playingCount[name] or 1) - 1)
		if s.Parent == SoundService then
			s:Destroy()
		end
	end)
	task.delay(4, function()
		if s.Parent then
			playingCount[name] = math.max(0, (playingCount[name] or 1) - 1)
			s:Destroy()
		end
	end)
end

-- ---------------------------------------------------------------- camera shake + punch

local trauma = 0
local seed = math.random() * 100

-- Adds shake (0..1). Hits near the camera count more than far ones.
function Juice.shake(amount: number, at: Vector3?)
	if at then
		local d = (camera.CFrame.Position - at).Magnitude
		amount *= math.clamp(1.4 - d / 120, 0.15, 1)
	end
	trauma = math.min(1, trauma + amount)
end

local fovKick = 0
Juice.baseFov = 70 -- the intro cutscene drives this; the kick is added on top
function Juice.punch(amount: number)
	fovKick = math.max(fovKick, amount)
end

RunService:BindToRenderStep("JuiceCamera", Enum.RenderPriority.Camera.Value + 1, function(dt)
	if trauma > 0 then
		local s = trauma * trauma
		local t = os.clock() * 22
		local rx = math.noise(seed, t) * 0.035 * s
		local ry = math.noise(seed + 10, t) * 0.035 * s
		local rz = math.noise(seed + 20, t) * 0.05 * s
		camera.CFrame *= CFrame.Angles(rx, ry, rz)
		trauma = math.max(0, trauma - dt * 1.6)
	end
	if fovKick > 0.01 then
		camera.FieldOfView = Juice.baseFov + fovKick
		fovKick *= math.exp(-dt * 9)
	elseif camera.FieldOfView ~= Juice.baseFov then
		camera.FieldOfView = Juice.baseFov
	end
end)

-- ---------------------------------------------------------------- HUD hooks (set by Hud)

Juice.cashScreenPos = function(): Vector2
	local vp = camera.ViewportSize
	return Vector2.new(vp.X / 2, vp.Y - 70)
end
Juice.onCoinArrive = function(_amount: number) end

-- ---------------------------------------------------------------- coins

-- Gold studded coins burst out of a kill, hang for a beat, then fly into the cash counter.
function Juice.coins(pos: Vector3, count: number, reward: number)
	count = math.clamp(count, 1, 14)
	local per = reward / count
	for i = 1, count do
		local coin = Fx.part({
			Shape = Enum.PartType.Cylinder,
			Size = Vector3.new(0.18, 0.75, 0.75),
			Color = Color3.fromRGB(255, 200, 40),
			Material = Enum.Material.Neon,
			CFrame = CFrame.new(pos),
		})
		local burst = pos + Vector3.new(Fx.rand(-2.5, 2.5), Fx.rand(2, 4.5), Fx.rand(-2.5, 2.5))
		Fx.tween(coin, 0.28, { Position = burst }, Enum.EasingStyle.Quad)
		task.delay(0.28 + i * 0.03, function()
			local start = coin.Position
			local t0 = os.clock()
			local dur = 0.42
			local conn
			conn = RunService.RenderStepped:Connect(function()
				local a = math.min(1, (os.clock() - t0) / dur)
				local sp = Juice.cashScreenPos()
				local ray = camera:ViewportPointToRay(sp.X, sp.Y)
				local target = ray.Origin + ray.Direction * 4
				local e = a * a
				coin.CFrame = CFrame.new(start:Lerp(target, e)) * CFrame.Angles(0, os.clock() * 20, math.pi / 2)
				coin.Size = Vector3.new(0.18, 0.75, 0.75) * (1 - e * 0.6)
				if a >= 1 then
					conn:Disconnect()
					coin:Destroy()
					Juice.sound("Coin", nil, 1 + i * 0.04, 0.6)
					Juice.onCoinArrive(per)
				end
			end)
		end)
	end
end

-- ---------------------------------------------------------------- combo

local CALLOUTS = {
	{ 5, "MONKEY MASH!" },
	{ 10, "BANANA SPLIT!" },
	{ 20, "BARREL OF MONKEYS!" },
	{ 35, "APE-POCALYPSE!" },
	{ 50, "UNSTOPPABLE!" },
	{ 75, "MONKEY MELTDOWN!" },
	{ 100, "100 MEN STRONG!!" },
}
local COMBO_WINDOW = 1.6

local gui = Instance.new("ScreenGui")
gui.Name = "Juice"
gui.ResetOnSpawn = false
gui.IgnoreGuiInset = true
gui.DisplayOrder = 5
gui.Parent = player:WaitForChild("PlayerGui")

local comboLabel = Instance.new("TextLabel")
comboLabel.AnchorPoint = Vector2.new(1, 0.5)
comboLabel.Position = UDim2.new(1, -30, 0.42, 0)
comboLabel.Size = UDim2.fromOffset(260, 70)
comboLabel.BackgroundTransparency = 1
comboLabel.Font = Enum.Font.LuckiestGuy
comboLabel.TextScaled = true
comboLabel.TextColor3 = Color3.fromRGB(255, 230, 80)
comboLabel.TextXAlignment = Enum.TextXAlignment.Right
comboLabel.Visible = false
comboLabel.Rotation = -6
local comboStroke = Instance.new("UIStroke")
comboStroke.Thickness = 4
comboStroke.Parent = comboLabel
local comboScale = Instance.new("UIScale")
comboScale.Parent = comboLabel
comboLabel.Parent = gui

local comboBar = Instance.new("Frame")
comboBar.AnchorPoint = Vector2.new(1, 0)
comboBar.Position = UDim2.new(1, 0, 1, 2)
comboBar.Size = UDim2.new(1, 0, 0, 6)
comboBar.BackgroundColor3 = Color3.fromRGB(255, 230, 80)
comboBar.BorderSizePixel = 0
comboBar.Parent = comboLabel

local callout = Instance.new("TextLabel")
callout.AnchorPoint = Vector2.new(0.5, 0.5)
callout.Position = UDim2.fromScale(0.5, 0.3)
callout.Size = UDim2.fromOffset(700, 110)
callout.BackgroundTransparency = 1
callout.Font = Enum.Font.LuckiestGuy
callout.TextScaled = true
callout.TextColor3 = Color3.fromRGB(255, 120, 40)
callout.Visible = false
local calloutStroke = Instance.new("UIStroke")
calloutStroke.Thickness = 5
calloutStroke.Parent = callout
local calloutScale = Instance.new("UIScale")
calloutScale.Parent = callout
callout.Parent = gui

local combo = 0
local comboExpires = 0
local nextCallout = 1

-- Big center-screen shout (also used by the HUD for banners).
function Juice.callout(text: string, color: Color3?, hold: number?)
	callout.Text = text
	callout.TextColor3 = color or Color3.fromRGB(255, 120, 40)
	callout.Visible = true
	callout.TextTransparency = 0
	calloutStroke.Transparency = 0
	callout.Rotation = Fx.rand(-5, 5)
	calloutScale.Scale = 2.4
	TweenService:Create(calloutScale, TweenInfo.new(0.25, Enum.EasingStyle.Back), { Scale = 1 }):Play()
	local token = {}
	Juice._calloutToken = token
	task.delay(hold or 1.1, function()
		if Juice._calloutToken ~= token then
			return
		end
		TweenService:Create(callout, TweenInfo.new(0.3), { TextTransparency = 1 }):Play()
		TweenService:Create(calloutStroke, TweenInfo.new(0.3), { Transparency = 1 }):Play()
	end)
end

function Juice.kill(boss: boolean)
	local t = os.clock()
	if t > comboExpires then
		combo = 0
		nextCallout = 1
	end
	combo += if boss then 10 else 1
	comboExpires = t + COMBO_WINDOW
	if combo >= 2 then
		comboLabel.Visible = true
		comboLabel.Text = `x{combo} COMBO`
		local heat = math.clamp(combo / 50, 0, 1)
		comboLabel.TextColor3 = Color3.fromRGB(255, 230, 80):Lerp(Color3.fromRGB(255, 60, 40), heat)
		comboScale.Scale = 1.35 + math.min(combo, 40) * 0.01
		TweenService:Create(comboScale, TweenInfo.new(0.18, Enum.EasingStyle.Back), { Scale = 1 }):Play()
		Juice.sound("Combo", nil, 0.8 + math.min(combo, 40) * 0.025, 0.7)
	end
	local c = CALLOUTS[nextCallout]
	if c and combo >= c[1] then
		nextCallout += 1
		Juice.callout(c[2])
		Juice.shake(0.25)
		Juice.punch(4)
	end
end

RunService.RenderStepped:Connect(function()
	if comboLabel.Visible then
		local left = comboExpires - os.clock()
		if left <= 0 then
			comboLabel.Visible = false
			combo = 0
			nextCallout = 1
		else
			comboBar.Size = UDim2.new(left / COMBO_WINDOW, 0, 0, 6)
		end
	end
end)

return Juice
