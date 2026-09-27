--[[
	Draws the tutorial guide in the world: a glowing beam from the player to the target part
	on their own dock, plus a bouncing arrow above it.
]]

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local Workspace = game:GetService("Workspace")

local Client = script.Parent.Parent
local State = require(Client.State)
local Tutorial = require(Client.Tutorial)

local TutorialGuide = {}

local beam: Beam? = nil
local fromAttachment: Attachment? = nil
local arrow: BillboardGui? = nil
local anchor: Part? = nil

local function ownPlot(): Instance?
	local plotIndex = Players.LocalPlayer:GetAttribute("Plot")
	local plots = Workspace:FindFirstChild("Plots")
	if type(plotIndex) ~= "number" or not plots then
		return nil
	end
	return plots:FindFirstChild("Plot" .. plotIndex)
end

local function ensure()
	if anchor then
		return
	end
	local part = Instance.new("Part")
	part.Name = "TutorialTarget"
	part.Anchored = true
	part.CanCollide = false
	part.CanQuery = false
	part.CanTouch = false
	part.Transparency = 1
	part.Size = Vector3.new(0.5, 0.5, 0.5)
	part.Parent = Workspace
	anchor = part

	local target = Instance.new("Attachment")
	target.Parent = part

	local gui = Instance.new("BillboardGui")
	gui.Size = UDim2.fromOffset(80, 80)
	gui.StudsOffset = Vector3.new(0, 5, 0)
	gui.AlwaysOnTop = true
	gui.Parent = part
	local label = Instance.new("TextLabel")
	label.Size = UDim2.fromScale(1, 1)
	label.BackgroundTransparency = 1
	label.Font = Enum.Font.FredokaOne
	label.TextScaled = true
	label.Text = "⬇"
	label.TextColor3 = Color3.fromRGB(255, 220, 60)
	local stroke = Instance.new("UIStroke")
	stroke.Thickness = 4
	stroke.Parent = label
	label.Parent = gui
	arrow = gui

	local b = Instance.new("Beam")
	b.Attachment1 = target
	b.Color = ColorSequence.new(Color3.fromRGB(255, 220, 60))
	b.Transparency = NumberSequence.new(0.3)
	b.Width0 = 0.6
	b.Width1 = 0.6
	b.FaceCamera = true
	b.LightEmission = 1
	b.Segments = 12
	b.CurveSize0 = 4
	b.TextureSpeed = 2
	b.Parent = part
	beam = b
end

local function hide()
	if beam then
		beam.Enabled = false
	end
	if arrow then
		arrow.Enabled = false
	end
end

local function update()
	local step = Tutorial.step(State.data())
	local plot = ownPlot()
	local targetPart = if step and step.worldTarget and plot then plot:FindFirstChild(step.worldTarget, true) else nil
	local character = Players.LocalPlayer.Character
	local root = character and character:FindFirstChild("HumanoidRootPart")
	if not targetPart or not targetPart:IsA("BasePart") or not root then
		hide()
		return
	end
	ensure()
	assert(anchor and beam and arrow)
	anchor.CFrame = targetPart.CFrame + Vector3.new(0, 1, 0)
	if not fromAttachment or fromAttachment.Parent ~= root then
		if fromAttachment then
			fromAttachment:Destroy()
		end
		local attachment = Instance.new("Attachment")
		attachment.Name = "TutorialFrom"
		attachment.Parent = root
		fromAttachment = attachment
		beam.Attachment0 = attachment
	end
	beam.Enabled = true
	arrow.Enabled = true
	arrow.StudsOffset = Vector3.new(0, 5 + math.sin(os.clock() * 4) * 0.8, 0)
end

function TutorialGuide.start()
	local elapsed = 0
	RunService.Heartbeat:Connect(function(dt)
		elapsed += dt
		if elapsed >= 0.05 then
			elapsed = 0
			update()
		end
	end)
end

return TutorialGuide
