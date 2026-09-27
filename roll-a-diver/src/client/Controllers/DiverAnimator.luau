--[[
	Animates every diver model locally from the attributes the server sets:
	Phase, PhaseStart, PhaseDuration, Home, Entry, DepthStuds, DepthMeters, GlowColor.

	Down:    jump off the diving board with a forward flip, then sink head-first into the dark
	Bottom:  search around with the flashlight
	Grabbed: struggle just under the surface while the Kraken holds on
	Up:      rise with the chest's glow getting brighter, then hop back onto the dock
]]

local CollectionService = game:GetService("CollectionService")
local RunService = game:GetService("RunService")
local Workspace = game:GetService("Workspace")

local Players = game:GetService("Players")

local Shared = game:GetService("ReplicatedStorage").Shared
local Format = require(Shared.Util.Format)

local Settings = require(script.Parent.Parent.Settings)

local DiverAnimator = {}

local JUMP_SHARE = 0.18
local CLIMB_SHARE = 0.12
local FAR_DISTANCE = 260
local BLEND_TIME = 0.35

type Tracked = {
	model: Model,
	lastPhase: string?,
	fromDepth: number,
	lastCFrame: CFrame?,
	blendFrom: CFrame?,
	blendStart: number,
	lastStatus: string,
	frame: number,
}

local tracked: { [Model]: Tracked } = {}

local function easeInOut(t: number): number
	return if t < 0.5 then 2 * t * t else 1 - (-2 * t + 2) ^ 2 / 2
end

local function easeOut(t: number): number
	return 1 - (1 - t) ^ 3
end

local function setStatus(entry: Tracked, text: string)
	if entry.lastStatus == text then
		return
	end
	entry.lastStatus = text
	local tag = entry.model:FindFirstChild("Tag")
	local status = tag and tag:FindFirstChild("Status")
	if status and status:IsA("TextLabel") then
		status.Text = text
	end
end

local function setLights(model: Model, underwater: boolean, glowColor: Color3?, glowStrength: number)
	local head = model:FindFirstChild("Head")
	local root = model.PrimaryPart
	if head then
		local flashlight = head:FindFirstChild("Flashlight") :: SpotLight?
		if flashlight then
			flashlight.Enabled = underwater
			flashlight.Face = Enum.NormalId.Top
		end
		local bubbles = head:FindFirstChild("Bubbles") :: ParticleEmitter?
		if bubbles then
			bubbles.Enabled = underwater and not Settings.is("lowGraphics")
		end
	end
	if root then
		local glow = root:FindFirstChild("Glow") :: PointLight?
		if glow then
			glow.Enabled = glowColor ~= nil and glowStrength > 0 and not Settings.is("lowGraphics")
			if glowColor then
				glow.Color = glowColor
				glow.Brightness = 1 + glowStrength * 6
				glow.Range = 10 + glowStrength * 18
			end
		end
	end
end

local function update(entry: Tracked, now: number)
	local model = entry.model
	local home = model:GetAttribute("Home")
	local entryPoint = model:GetAttribute("Entry")
	local phase = model:GetAttribute("Phase")
	local start = model:GetAttribute("PhaseStart")
	local duration = model:GetAttribute("PhaseDuration")
	if typeof(home) ~= "CFrame" or typeof(entryPoint) ~= "Vector3" or type(phase) ~= "string" then
		return
	end
	if type(start) ~= "number" or type(duration) ~= "number" then
		return
	end

	-- an idle diver that has finished blending is standing still: nothing to do
	if phase == "Idle" and entry.lastPhase == "Idle" and entry.blendFrom == nil and entry.lastCFrame ~= nil then
		setStatus(entry, "Resting")
		return
	end

	if phase ~= entry.lastPhase then
		-- rise from wherever the diver really is (e.g. an Oxygen Tank cut the dive short)
		local studs: number = (model:GetAttribute("DepthStuds") :: number?) or 20
		local last = entry.lastCFrame
		entry.fromDepth = if last then math.clamp(entryPoint.Y - last.Position.Y, 0, studs) else studs
		-- and blend from the last drawn pose so phase changes never snap
		entry.blendFrom = if entry.lastPhase ~= nil then last else nil
		entry.blendStart = now
		entry.lastPhase = phase
	end

	local p = math.clamp((now - start) / math.max(duration, 0.01), 0, 1)
	local depthStuds: number = (model:GetAttribute("DepthStuds") :: number?) or 20
	local depthMeters: number = (model:GetAttribute("DepthMeters") :: number?) or 0
	local rotation = home - home.Position
	local forward = home.LookVector
	local bottom = entryPoint + Vector3.new(0, -depthStuds, 0) + forward * 6

	local position: Vector3
	local pitch = 0
	local glowStrength = 0
	local glowColor = model:GetAttribute("GlowColor")

	if phase == "Down" then
		if p < JUMP_SHARE then
			local s = p / JUMP_SHARE
			position = home.Position:Lerp(entryPoint, s) + Vector3.new(0, 6 * math.sin(math.pi * s), 0)
			pitch = -180 * s
		else
			local s = easeInOut((p - JUMP_SHARE) / (1 - JUMP_SHARE))
			position = entryPoint:Lerp(bottom, s)
			pitch = -180
		end
		setStatus(entry, "⬇ " .. Format.depth(depthMeters * math.max(0, (p - JUMP_SHARE) / (1 - JUMP_SHARE))))
	elseif phase == "Bottom" then
		position = bottom + Vector3.new(math.sin(now * 1.7) * 1.5, math.sin(now * 2.3) * 0.5, 0)
		pitch = -120 + math.sin(now * 2) * 15
		setStatus(entry, "🔦 Searching " .. Format.depth(depthMeters))
	elseif phase == "Grabbed" then
		position = entryPoint + Vector3.new(math.sin(now * 25) * 0.6, -3 + math.sin(now * 9) * 0.8, 0)
		pitch = math.sin(now * 12) * 30
		setStatus(entry, "🦑 GRABBED!")
	elseif phase == "Up" then
		local from = entryPoint + Vector3.new(0, -entry.fromDepth, 0) + forward * 6
		local climbStart = 1 - CLIMB_SHARE
		if p < climbStart then
			local s = easeOut(p / climbStart)
			position = from:Lerp(entryPoint, s)
			glowStrength = s
			local metres = depthMeters * (entry.fromDepth / math.max(depthStuds, 1))
			setStatus(entry, "⬆ " .. Format.depth(metres * (1 - s)))
		else
			local s = (p - climbStart) / CLIMB_SHARE
			position = entryPoint:Lerp(home.Position, s) + Vector3.new(0, 5 * math.sin(math.pi * s), 0)
			glowStrength = 1
			setStatus(entry, "Surfacing!")
		end
	else
		position = home.Position
		setStatus(entry, "Resting")
	end

	local target = CFrame.new(position) * rotation * CFrame.Angles(math.rad(pitch), 0, 0)
	local blendFrom = entry.blendFrom
	if blendFrom then
		local alpha = (now - entry.blendStart) / BLEND_TIME
		if alpha < 1 then
			target = blendFrom:Lerp(target, easeOut(alpha))
		else
			entry.blendFrom = nil
		end
	end
	entry.lastCFrame = target
	model:PivotTo(target)
	setLights(model, position.Y < -1, if typeof(glowColor) == "Color3" then glowColor else nil, glowStrength)
end

local function isMine(model: Model): boolean
	local player = Players.LocalPlayer
	return player ~= nil and model:GetAttribute("OwnerId") == player.UserId
end

-- "Hide other docks": other players' divers are made invisible locally and not animated.
local function setHidden(model: Model, hidden: boolean)
	for _, descendant in model:GetDescendants() do
		if descendant:IsA("BasePart") then
			descendant.LocalTransparencyModifier = if hidden then 1 else 0
		elseif descendant:IsA("BillboardGui") then
			descendant.Enabled = not hidden
		elseif hidden and (descendant:IsA("Light") or descendant:IsA("ParticleEmitter")) then
			(descendant :: any).Enabled = false
		end
	end
end

local function shouldHide(model: Model): boolean
	return Settings.is("hideOthers") and not isMine(model)
end

local function track(model: Instance)
	if model:IsA("Model") then
		tracked[model] = {
			model = model,
			lastPhase = nil,
			fromDepth = 20,
			lastCFrame = nil,
			blendFrom = nil,
			blendStart = 0,
			lastStatus = "",
			frame = math.random(0, 9),
		}
	end
end

function DiverAnimator.start()
	Settings.Changed:Connect(function()
		for model in tracked do
			setHidden(model, shouldHide(model))
		end
	end)
	for _, model in CollectionService:GetTagged("Diver") do
		track(model)
	end
	CollectionService:GetInstanceAddedSignal("Diver"):Connect(track)
	CollectionService:GetInstanceRemovedSignal("Diver"):Connect(function(model)
		tracked[model :: Model] = nil
	end)

	RunService.RenderStepped:Connect(function()
		local now = Workspace:GetServerTimeNow()
		local camera = Workspace.CurrentCamera
		local cameraPosition = if camera then camera.CFrame.Position else Vector3.zero
		for model, entry in tracked do
			if model.Parent == nil then
				tracked[model] = nil
				continue
			end
			entry.frame += 1
			-- far away divers update less often
			local home = model:GetAttribute("Home")
			local far = typeof(home) == "CFrame" and (home.Position - cameraPosition).Magnitude > FAR_DISTANCE
			if shouldHide(model) then
				if entry.frame % 30 == 0 then
					setHidden(model, true)
				end
			elseif not far or entry.frame % 10 == 0 then
				update(entry, now)
			end
		end
	end)
end

return DiverAnimator
