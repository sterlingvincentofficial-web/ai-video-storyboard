--!strict
-- Turns the imported army meshes (assets/men/Men.fbx: MeshParts named <Unit>_L<n>_<Part>) into
-- rigged templates, laid out from RigData/Men so the result never depends on the importer's
-- unit scale or placement. Joints carry R15 names (Root, Waist, Neck, Right/LeftShoulder,
-- Right/LeftElbow, Right/LeftHip, Right/LeftKnee) so UnitView's combat animations drive them.
--
-- The server builds one template per unit level into ReplicatedStorage.MenRigs at startup;
-- MenFactory clones them for every man placed.

local RigData = require(script.Parent.RigData.Men)

local MenRig = {}

local JOINTS = {
	LowerTorso = { "HumanoidRootPart", "Root" },
	UpperTorso = { "LowerTorso", "Waist" },
	Head = { "UpperTorso", "Neck" },
	RightUpperArm = { "UpperTorso", "RightShoulder" },
	RightLowerArm = { "RightUpperArm", "RightElbow" },
	LeftUpperArm = { "UpperTorso", "LeftShoulder" },
	LeftLowerArm = { "LeftUpperArm", "LeftElbow" },
	RightUpperLeg = { "LowerTorso", "RightHip" },
	RightLowerLeg = { "RightUpperLeg", "RightKnee" },
	LeftUpperLeg = { "LowerTorso", "LeftHip" },
	LeftLowerLeg = { "LeftUpperLeg", "LeftKnee" },
}

-- Finds the imported model (anywhere under the given containers) by its marker + a known mesh.
function MenRig.findImport(containers: { Instance }): Model?
	for _, c in containers do
		for _, d in c:GetDescendants() do
			if d:IsA("Model") and d:FindFirstChild("MenFrontMarker", true) and d:FindFirstChild("Brawler_L1_LowerTorso", true) then
				return d
			end
		end
	end
	return nil
end

-- The importer may bring the file in facing +Z. MenFrontMarker sits in front of the first
-- variant's feet, so if it lands behind that figure every part needs a half turn.
function MenRig.needsFlip(import: Model): boolean
	local marker = import:FindFirstChild("MenFrontMarker", true) :: BasePart
	local hips = import:FindFirstChild("Brawler_L1_LowerTorso", true) :: BasePart
	return (marker.Position.Z - hips.Position.Z) > 0.05
end

local function invisible(name: string, size: Vector3): Part
	local p = Instance.new("Part")
	p.Name = name
	p.Size = size
	p.Transparency = 1
	p.CanCollide = false
	p.CanQuery = false
	p.CanTouch = false
	p.Massless = true
	return p
end

-- Builds the rigged template for one variant ("Brawler_L2"). Feet at Y = 0, facing -Z.
function MenRig.build(import: Model, variant: string, flip: boolean): Model
	local data = RigData[variant]
	assert(data, `No rig data for {variant}`)
	local turn = if flip then CFrame.Angles(0, math.pi, 0) else CFrame.identity
	local rootPivot = data.Parts.LowerTorso.Pivot

	local model = Instance.new("Model")
	model.Name = variant
	local root = invisible("HumanoidRootPart", Vector3.new(1.6, 1.6, 1))
	root.Anchored = true
	root.CFrame = CFrame.new(rootPivot)
	root.Parent = model
	model.PrimaryPart = root

	local parts: { [string]: BasePart } = { HumanoidRootPart = root }
	for name, pd in data.Parts do
		local source = import:FindFirstChild(`{variant}_{name}`, true)
		assert(source and source:IsA("BasePart"), `Imported army is missing {variant}_{name}`)
		local part = source:Clone() :: BasePart
		part.Name = name
		part.Anchored = false
		part.CanCollide = false
		part.CanQuery = false
		part.CanTouch = false
		part.Massless = true
		part.CastShadow = true
		part.Size = pd.Size
		part.CFrame = CFrame.new(pd.Center) * turn
		part.Parent = model
		parts[name] = part
	end
	for name, joint in JOINTS do
		local p0, p1 = parts[joint[1]], parts[name]
		if not (p0 and p1) then
			continue
		end
		local pivot = CFrame.new(data.Parts[name].Pivot)
		local motor = Instance.new("Motor6D")
		motor.Name = joint[2]
		motor.Part0 = p0
		motor.Part1 = p1
		motor.C0 = p0.CFrame:Inverse() * pivot
		motor.C1 = p1.CFrame:Inverse() * pivot
		motor.Parent = p1
	end
	-- hand points (projectiles start here), welded to the forearms
	for _, side in { "Right", "Left" } do
		local grip = (data :: any)[side .. "Grip"] :: Vector3?
		local arm = parts[side .. "LowerArm"]
		if grip and arm then
			local hand = invisible(side .. "Hand", Vector3.new(0.4, 0.4, 0.4))
			hand.CFrame = CFrame.new(grip)
			local weld = Instance.new("Weld")
			weld.Part0 = arm
			weld.Part1 = hand
			weld.C0 = arm.CFrame:Inverse() * hand.CFrame
			weld.Parent = hand
			hand.Parent = model
		end
	end
	model:SetAttribute("RootHeight", rootPivot.Y)
	model:SetAttribute("Height", data.Height)
	model:SetAttribute("CustomRig", true)
	return model
end

-- Builds every variant into a folder of templates.
function MenRig.buildAll(import: Model, into: Instance): boolean
	local flip = MenRig.needsFlip(import)
	for variant in RigData do
		local ok, result = pcall(MenRig.build, import, variant, flip)
		if ok then
			result.Parent = into
		else
			warn(`[MenRig] {variant}: {result}`)
		end
	end
	return flip
end

return MenRig
