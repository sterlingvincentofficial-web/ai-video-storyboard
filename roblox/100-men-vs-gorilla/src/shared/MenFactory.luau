--!strict
-- Builds the placeable men as real Roblox avatars (HumanoidDescription -> R15 model),
-- dressed from Units.luau and fitted with gear meshes from assets/men/MenGear.fbx.

local CollectionService = game:GetService("CollectionService")
local Players = game:GetService("Players")

local GearData = require(script.Parent.RigData.MenGear)
local Units = require(script.Parent.Units)

local MenFactory = {}

MenFactory.TAG = "Man"

-- Roblox's own R15 idle animation, so the men breathe instead of standing frozen.
local IDLE_ANIMATION = "rbxassetid://507766388"

local function weldTo(part: BasePart, target: BasePart)
	part.Anchored = false
	part.CanCollide = false
	part.CanQuery = false
	part.Massless = true
	local weld = Instance.new("WeldConstraint")
	weld.Part0 = target
	weld.Part1 = part
	weld.Parent = part
end

local function addHeadband(model: Model, gear: Instance?, color: Color3, flip: boolean)
	local head = model:FindFirstChild("Head") :: BasePart?
	local source = gear and gear:FindFirstChild("Headband", true)
	if not (head and source and source:IsA("BasePart")) then
		return
	end
	local data = GearData.Headband
	-- scale the ring to wrap the head, then sit it across the forehead
	local scale = head.Size.X * 1.04 / data.RingDiameter
	local band = source:Clone() :: BasePart
	band.Name = "Headband"
	band.Color = color
	band.Size = data.Size * scale
	local turn = if flip then CFrame.Angles(0, math.pi, 0) else CFrame.identity
	local ring = head.CFrame * CFrame.new(0, head.Size.Y * 0.16, 0)
	band.CFrame = ring * turn * CFrame.new(-data.RingCenter * scale)
	band.Parent = model
	weldTo(band, head)
end

local function addHandWraps(model: Model, gear: Instance?, color: Color3)
	local source = gear and gear:FindFirstChild("HandWrap", true)
	for _, handName in { "LeftHand", "RightHand" } do
		local hand = model:FindFirstChild(handName) :: BasePart?
		if not hand then
			continue
		end
		local wrap: BasePart
		if source and source:IsA("BasePart") then
			wrap = source:Clone() :: BasePart
		else
			local block = Instance.new("Part") -- no imported gear yet: plain block wraps
			block.TopSurface = Enum.SurfaceType.Smooth
			block.BottomSurface = Enum.SurfaceType.Smooth
			wrap = block
		end
		wrap.Name = handName .. "Wrap"
		wrap.Color = color
		wrap.Size = hand.Size * Vector3.new(1.15, 0.85, 1.15)
		wrap.CFrame = hand.CFrame
		wrap.Parent = model
		weldTo(wrap, hand)
	end
end

local function dress(model: Model, look: Units.Look)
	if look.ShirtTemplate then
		local shirt = Instance.new("Shirt")
		shirt.ShirtTemplate = `rbxassetid://{look.ShirtTemplate}`
		shirt.Parent = model
	end
	if look.PantsTemplate then
		local pants = Instance.new("Pants")
		pants.PantsTemplate = `rbxassetid://{look.PantsTemplate}`
		pants.Parent = model
	end
end

-- gear: the imported MenGear model (or nil). flip: same answer MonkeyRig.needsFlip gave for the
-- import, since both FBX files come out of the same Blender export settings.
function MenFactory.build(unitId: string, level: number, gear: Instance?, flip: boolean?): Model
	local unit = (Units :: any)[unitId]
	assert(unit, `Unknown unit "{unitId}"`)
	local def = unit.Levels[level]
	assert(def, `{unitId} has no level {level}`)
	local look: Units.Look = def.Look

	local desc = Instance.new("HumanoidDescription")
	desc.HeadColor = look.Skin
	desc.LeftArmColor = look.Skin
	desc.RightArmColor = look.Skin
	-- with a template the cloth covers these; without one the colors fake the outfit
	desc.TorsoColor = if look.ShirtTemplate then look.Skin else look.ShirtColor
	desc.LeftLegColor = if look.PantsTemplate then look.Skin else look.PantsColor
	desc.RightLegColor = desc.LeftLegColor

	local model = Players:CreateHumanoidModelFromDescription(desc, Enum.HumanoidRigType.R15)
	model.Name = `{unitId}_L{level}`
	dress(model, look)
	for _, item in look.Gear do
		if item == "Headband" then
			addHeadband(model, gear, look.HeadbandColor or Color3.new(1, 0, 0), flip == true)
		elseif item == "HandWraps" then
			addHandWraps(model, gear, look.WrapColor or Color3.new(1, 1, 1))
		end
	end

	local humanoid = model:FindFirstChildOfClass("Humanoid") :: Humanoid
	humanoid.DisplayDistanceType = Enum.HumanoidDisplayDistanceType.None
	humanoid.HealthDisplayType = Enum.HumanoidHealthDisplayType.AlwaysOff
	model:SetAttribute("Unit", unitId)
	model:SetAttribute("Level", level)
	CollectionService:AddTag(model, MenFactory.TAG)
	return model
end

function MenFactory.playIdle(model: Model)
	local humanoid = model:FindFirstChildOfClass("Humanoid")
	if not humanoid then
		return
	end
	local animator = humanoid:FindFirstChildOfClass("Animator") or Instance.new("Animator", humanoid)
	local anim = Instance.new("Animation")
	anim.AnimationId = IDLE_ANIMATION
	local ok, track = pcall(function()
		return (animator :: Animator):LoadAnimation(anim)
	end)
	if ok and track then
		track.Looped = true
		track:Play()
	end
end

return MenFactory
