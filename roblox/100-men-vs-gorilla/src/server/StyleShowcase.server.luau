-- Style-test scene only: gives the showcase models a little life (idle bob + campfire flicker).
-- Delete once real unit/enemy animations exist.

local TweenService = game:GetService("TweenService")

local styleTest = workspace:WaitForChild("StyleTest")

local function idleBob(model: Model, height: number, period: number)
	local base = model:GetPivot()
	local offset = Instance.new("CFrameValue")
	offset.Value = base
	offset.Changed:Connect(function(cf)
		model:PivotTo(cf)
	end)
	TweenService:Create(
		offset,
		TweenInfo.new(period / 2, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut, -1, true),
		{ Value = base * CFrame.new(0, height, 0) }
	):Play()
end

idleBob(styleTest:WaitForChild("Monkey"), 0.35, 0.8)
idleBob(styleTest:WaitForChild("Brawler_L1"), 0.12, 1.4)

local platform = styleTest:WaitForChild("StylePlatform")
local flame = platform:WaitForChild("Flame") :: BasePart
local light = Instance.new("PointLight")
light.Color = flame.Color
light.Range = 14
light.Brightness = 2
light.Parent = flame

task.spawn(function()
	local baseSize = flame.Size
	while true do
		local s = 0.85 + math.random() * 0.3
		flame.Size = Vector3.new(baseSize.X, baseSize.Y * s, baseSize.Z)
		light.Brightness = 1.6 + math.random() * 0.8
		task.wait(0.12)
	end
end)
