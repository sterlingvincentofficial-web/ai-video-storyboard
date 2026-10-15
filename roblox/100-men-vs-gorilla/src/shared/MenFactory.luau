--!strict
-- Builds the army as real Roblox avatars (HumanoidDescription -> R15) dressed per unit level:
-- body colors (or Shirt/Pants templates), a hat, held gear and rank badges, all gear meshes
-- coming from the imported MenGear.fbx and fitted with RigData/Gear anchors.
-- Server only (CreateHumanoidModelFromDescription is server-side).

local CollectionService = game:GetService("CollectionService")
local Players = game:GetService("Players")

local Gear = require(script.Parent.RigData.Gear)
local Units = require(script.Parent.Config.Units)

local MenFactory = {}

MenFactory.TAG = "Man"

-- Roblox's own R15 idle animation, so the men breathe instead of standing frozen.
local IDLE_ANIMATION = "rbxassetid://507766388"
local HEAD_WIDTH = 1.24 -- the head size the hats were modelled for (2 x 0.62)

-- How each held item sits in the hand (see HOLD). Carried items (medkit, grenade) hang as-is.
local HOLD = {
	-- modelled pointing forward: turned to lie along the forearm
	RifleStock = CFrame.Angles(-math.pi / 2, 0, 0), RifleBarrel = CFrame.Angles(-math.pi / 2, 0, 0),
	NetGun = CFrame.Angles(-math.pi / 2, 0, 0), NetGunMuzzle = CFrame.Angles(-math.pi / 2, 0, 0),
	Megaphone = CFrame.Angles(-math.pi / 2, 0, 0),
	-- modelled upright: fork up / banana up when the arm is held out
	Slingshot = CFrame.Angles(-math.pi / 2, 0, 0), BigBanana = CFrame.Angles(-math.pi / 2, 0, 0),
	-- modelled upright: flipped end-over-end so it extends the arm, edge facing the swing
	AxeHandle = CFrame.Angles(math.pi, 0, 0), AxeHead = CFrame.Angles(math.pi, 0, 0),
}

-- Held items that read too small at gameplay distance.
local HELD_SCALE = { Slingshot = 1.7 }

local gearModel: Instance? = nil
local gearFlip = false

-- Finds the imported MenGear model and works out whether the importer turned it around.
function MenFactory.setGear(containers: { Instance }): boolean
	for _, c in containers do
		for _, d in c:GetDescendants() do
			if d:IsA("Model") and d:FindFirstChild("GearFront", true) and d:FindFirstChild("Headband", true) then
				gearModel = d
				local front = d:FindFirstChild("GearFront", true) :: BasePart
				local back = d:FindFirstChild("GearBack", true) :: BasePart
				gearFlip = front.Position.Z > back.Position.Z
				return true
			end
		end
	end
	return false
end

function MenFactory.gear(): Instance?
	return gearModel
end

local function weldTo(part: BasePart, target: BasePart)
	part.Anchored = false
	part.CanCollide = false
	part.CanQuery = false
	part.CanTouch = false
	part.Massless = true
	local weld = Instance.new("WeldConstraint")
	weld.Part0 = target
	weld.Part1 = part
	weld.Parent = part
end

-- Clones a gear mesh and places it so its anchor lands on `anchorCFrame`.
local function placeGear(name: string, anchorCFrame: CFrame, scale: number, color: Color3, parent: Instance,
	attachTo: BasePart): BasePart?
	local data = Gear[name]
	local source = gearModel and gearModel:FindFirstChild(name, true)
	if not (data and source and source:IsA("BasePart")) then
		return nil
	end
	local part = source:Clone() :: BasePart
	part.Name = name
	part.Color = color
	if part:IsA("MeshPart") then
		part.TextureID = ""
	end
	part.Material = Enum.Material.SmoothPlastic
	part.Size = data.Size * scale
	local turn = if gearFlip then CFrame.Angles(0, math.pi, 0) else CFrame.identity
	-- bounds center = anchor - Anchor (anchor is stored relative to the center)
	part.CFrame = anchorCFrame * CFrame.new(-data.Anchor * scale) * turn
	part.Parent = parent
	weldTo(part, attachTo)
	return part
end

local function dress(model: Model, look: Units.Look)
	local head = model:FindFirstChild("Head") :: BasePart?
	local torso = model:FindFirstChild("UpperTorso") :: BasePart?
	local rHand = model:FindFirstChild("RightHand") :: BasePart?
	local lHand = model:FindFirstChild("LeftHand") :: BasePart?
	local folder = Instance.new("Folder")
	folder.Name = "Gear"
	folder.Parent = model

	if head and look.Hat then
		local s = head.Size.X / HEAD_WIDTH * 1.04
		placeGear(look.Hat, head.CFrame * CFrame.new(0, head.Size.Y / 2, 0), s, look.HatColor or Color3.new(1, 1, 1),
			folder, head)
		if look.Hat == "MedicCap" then
			placeGear("MedicCross", head.CFrame * CFrame.new(0, head.Size.Y / 2 + 0.2 * s, -0.62 * s), s,
				Color3.fromRGB(220, 40, 40), folder, head)
		elseif look.Hat == "BananaHat" then
			placeGear("BananaStem", head.CFrame * CFrame.new(0, head.Size.Y / 2 + 0.42 * s, 0), s,
				Color3.fromRGB(96, 66, 34), folder, head)
		elseif look.Hat == "OfficerCap" then
			placeGear("OfficerBadge", head.CFrame * CFrame.new(0, head.Size.Y / 2 + 0.05 * s, -0.68 * s), s,
				Color3.fromRGB(250, 196, 40), folder, head)
		end
	end
	local function hold(hand: BasePart?, items: { string }?, colors: { Color3 }?)
		if not (hand and items) then
			return
		end
		local grip = hand.CFrame * CFrame.new(0, -hand.Size.Y * 0.3, 0)
		for i, item in items do
			local rot = HOLD[item] or CFrame.identity
			placeGear(item, grip * rot, HELD_SCALE[item] or 1, (colors and colors[i]) or Color3.new(1, 1, 1), folder, hand)
		end
	end
	hold(rHand, look.Held, look.HeldColors)
	hold(lHand, look.LeftHeld, look.LeftHeldColors)
	if look.Wraps then
		for _, hand in { lHand, rHand } do
			if hand then
				local wrap = placeGear("HandWrap", hand.CFrame, 1, look.Wraps, folder, hand)
				if wrap then
					wrap.Size = hand.Size * Vector3.new(1.18, 0.9, 1.18)
					wrap.CFrame = hand.CFrame
				end
			end
		end
	end
	if torso and look.Badge then
		placeGear(look.Badge, torso.CFrame * CFrame.new(-torso.Size.X * 0.22, torso.Size.Y * 0.15, -torso.Size.Z / 2 - 0.03),
			1, look.BadgeColor or Color3.new(1, 1, 1), folder, torso)
	end
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
	if look.Aura and torso then
		local att = Instance.new("Attachment")
		att.Name = "AuraAttachment"
		att.Parent = torso
		local sparkle = Instance.new("ParticleEmitter")
		sparkle.Name = "Aura"
		sparkle.Texture = "rbxasset://textures/particles/sparkles_main.dds"
		sparkle.Color = ColorSequence.new(Color3.fromRGB(255, 220, 90))
		sparkle.LightEmission = 1
		sparkle.Size = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.5), NumberSequenceKeypoint.new(1, 0) })
		sparkle.Lifetime = NumberRange.new(0.6, 1)
		sparkle.Rate = 6
		sparkle.Speed = NumberRange.new(1, 2)
		sparkle.SpreadAngle = Vector2.new(180, 180)
		sparkle.Parent = att
	end
end

-- Builds a unit model at a level. Not parented; caller places it.
function MenFactory.build(unitId: string, level: number): Model
	local unit = Units[unitId]
	assert(unit, `Unknown unit "{unitId}"`)
	local def = unit.Levels[level]
	assert(def, `{unitId} has no level {level}`)
	local look = def.Look

	local desc = Instance.new("HumanoidDescription")
	desc.HeadColor = look.Skin
	desc.LeftArmColor = look.Skin
	desc.RightArmColor = look.Skin
	desc.TorsoColor = if look.ShirtTemplate then look.Skin else look.Shirt
	desc.LeftLegColor = if look.PantsTemplate then look.Skin else look.Pants
	desc.RightLegColor = desc.LeftLegColor
	local model = Players:CreateHumanoidModelFromDescription(desc, Enum.HumanoidRigType.R15)
	model.Name = `{unitId}_L{level}`
	dress(model, look)

	local humanoid = model:FindFirstChildOfClass("Humanoid") :: Humanoid
	humanoid.DisplayDistanceType = Enum.HumanoidDisplayDistanceType.None
	humanoid.HealthDisplayType = Enum.HumanoidHealthDisplayType.AlwaysOff
	humanoid.BreakJointsOnDeath = false
	humanoid:SetStateEnabled(Enum.HumanoidStateType.Dead, false)
	for _, p in model:GetDescendants() do
		if p:IsA("BasePart") then
			p.CanCollide = false
			p.CanTouch = false
		end
	end
	local root = model:FindFirstChild("HumanoidRootPart") :: BasePart
	root.Anchored = true
	root.CanQuery = true -- clicks/taps on the unit select it
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
	local animator = humanoid:FindFirstChildOfClass("Animator")
	if not animator then
		animator = Instance.new("Animator")
		animator.Parent = humanoid
	end
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
