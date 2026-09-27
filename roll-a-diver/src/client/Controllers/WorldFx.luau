--[[
	Local world effects: spinning pedestal treasures, glitch flicker, tentacle sway,
	chest pops when divers surface and floating "+$" text when collecting.
]]

local CollectionService = game:GetService("CollectionService")
local Debris = game:GetService("Debris")
local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")
local Workspace = game:GetService("Workspace")

local Shared = game:GetService("ReplicatedStorage").Shared
local Format = require(Shared.Util.Format)
local ModelFactory = require(Shared.ModelFactory)
local Remotes = require(Shared.Remotes)
local Zones = require(Shared.Config.Zones)

local Sounds = require(script.Parent.Parent.Sounds)

local WorldFx = {}

type Spinner = { model: Model, base: CFrame, angle: number, glitch: boolean }

local spinners: { [Model]: Spinner } = {}
local tentacles: { [Model]: CFrame } = {}

local GLITCH_COLORS = {
	Color3.fromRGB(255, 40, 200),
	Color3.fromRGB(40, 255, 240),
	Color3.fromRGB(255, 255, 255),
	Color3.fromRGB(120, 40, 255),
}

local function floatingText(position: Vector3, text: string, color: Color3)
	local anchor = Instance.new("Part")
	anchor.Anchored = true
	anchor.CanCollide = false
	anchor.CanQuery = false
	anchor.CanTouch = false
	anchor.Transparency = 1
	anchor.Size = Vector3.new(0.2, 0.2, 0.2)
	anchor.CFrame = CFrame.new(position + Vector3.new(0, 3, 0))
	anchor.Parent = Workspace
	local gui = Instance.new("BillboardGui")
	gui.Size = UDim2.fromOffset(200, 50)
	gui.AlwaysOnTop = true
	gui.Parent = anchor
	local label = Instance.new("TextLabel")
	label.Size = UDim2.fromScale(1, 1)
	label.BackgroundTransparency = 1
	label.Font = Enum.Font.FredokaOne
	label.TextScaled = true
	label.Text = text
	label.TextColor3 = color
	local stroke = Instance.new("UIStroke")
	stroke.Thickness = 3
	stroke.Parent = label
	label.Parent = gui
	TweenService
		:Create(anchor, TweenInfo.new(1.4, Enum.EasingStyle.Quad), { CFrame = anchor.CFrame + Vector3.new(0, 6, 0) })
		:Play()
	TweenService:Create(label, TweenInfo.new(1.4), { TextTransparency = 1 }):Play()
	TweenService:Create(stroke, TweenInfo.new(1.4), { Transparency = 1 }):Play()
	Debris:AddItem(anchor, 1.5)
end

local function chestPop(diver: Instance?, chestId: string, count: number, glow: Color3?)
	-- the diver model can be gone by the time the event arrives
	if typeof(diver) ~= "Instance" or not diver:IsA("Model") then
		return
	end
	local home = diver:GetAttribute("Home")
	if typeof(home) ~= "CFrame" then
		return
	end
	local camera = Workspace.CurrentCamera
	if camera and (camera.CFrame.Position - home.Position).Magnitude > 200 then
		return
	end
	local chest = Zones.ChestById[chestId]
	if not chest then
		return
	end
	local model = ModelFactory.chest(chestId)
	local start = home * CFrame.new(0, 7, 0)
	model:PivotTo(start)
	model.Parent = Workspace
	local value = Instance.new("NumberValue")
	value.Changed:Connect(function(alpha)
		model:PivotTo(start * CFrame.new(0, alpha * 5, 0) * CFrame.Angles(0, alpha * math.pi * 2, 0))
	end)
	TweenService:Create(value, TweenInfo.new(1.1, Enum.EasingStyle.Quad), { Value = 1 }):Play()
	Debris:AddItem(model, 1.2)
	Debris:AddItem(value, 1.2)
	local text = "+" .. (if count > 1 then count .. "x " else "") .. chest.name
	floatingText(start.Position, text, glow or chest.glow)
end

local function addSpinner(model: Instance)
	if model:IsA("Model") then
		spinners[model] = {
			model = model,
			base = model:GetPivot(),
			angle = math.random() * math.pi * 2,
			glitch = model:GetAttribute("Glitch") == true,
		}
	end
end

local function addTentacle(model: Instance)
	if model:IsA("Model") then
		tentacles[model] = model:GetPivot()
	end
end

function WorldFx.start()
	for _, model in CollectionService:GetTagged("SpinTreasure") do
		addSpinner(model)
	end
	CollectionService:GetInstanceAddedSignal("SpinTreasure"):Connect(addSpinner)
	CollectionService:GetInstanceRemovedSignal("SpinTreasure"):Connect(function(model)
		spinners[model :: Model] = nil
	end)
	for _, model in CollectionService:GetTagged("Tentacle") do
		addTentacle(model)
	end
	CollectionService:GetInstanceAddedSignal("Tentacle"):Connect(addTentacle)
	CollectionService:GetInstanceRemovedSignal("Tentacle"):Connect(function(model)
		tentacles[model :: Model] = nil
	end)

	local glitchTimer = 0
	RunService.RenderStepped:Connect(function(dt)
		local t = os.clock()
		glitchTimer += dt
		local flicker = glitchTimer > 0.12
		if flicker then
			glitchTimer = 0
		end
		for model, spinner in spinners do
			if model.Parent == nil then
				spinners[model] = nil
				continue
			end
			spinner.angle += dt * 1.2
			model:PivotTo(
				spinner.base
					* CFrame.new(0, math.sin(t * 2 + spinner.angle) * 0.25, 0)
					* CFrame.Angles(0, spinner.angle, 0)
			)
			if spinner.glitch and flicker then
				for _, part in model:GetDescendants() do
					if part:IsA("BasePart") and part.Transparency < 1 then
						part.Color = GLITCH_COLORS[math.random(1, #GLITCH_COLORS)]
					end
				end
			end
		end
		for model, base in tentacles do
			if model.Parent == nil then
				tentacles[model] = nil
				continue
			end
			model:PivotTo(base * CFrame.Angles(math.sin(t * 3) * 0.25, 0, math.cos(t * 2.4) * 0.3))
		end
	end)

	Remotes.event("DiveFx").OnClientEvent:Connect(chestPop)
	Remotes.event("CollectFx").OnClientEvent:Connect(function(position: Vector3, amount: number)
		floatingText(position, "+" .. Format.money(amount), Color3.fromRGB(120, 255, 130))
		Sounds.play("Coin", 0.5, 1 + math.random() * 0.2)
	end)
end

return WorldFx
