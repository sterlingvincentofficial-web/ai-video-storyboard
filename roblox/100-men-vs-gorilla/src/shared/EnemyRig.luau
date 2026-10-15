--!strict
-- Turns the imported enemy meshes (assets/enemies/Enemies.fbx: MeshParts named <Variant>_<Part>)
-- into rigged templates: a root part + Motor6D joints, laid out from RigData/Enemies so the
-- result never depends on the importer's unit scale or placement.
--
-- The server builds one template per variant into ReplicatedStorage.Rigs at startup;
-- clients clone those for every monkey they draw (enemies are client-rendered).

local RigData = require(script.Parent.RigData.Enemies)

local EnemyRig = {}

local JOINTS = {
	Torso = { "Root", "RootJoint" },
	Head = { "Torso", "Neck" },
	LeftArm = { "Torso", "Left Shoulder" },
	RightArm = { "Torso", "Right Shoulder" },
	LeftLeg = { "Torso", "Left Hip" },
	RightLeg = { "Torso", "Right Hip" },
}

-- Finds the imported model (anywhere under the given containers) by its FrontMarker + Monkey_Torso.
function EnemyRig.findImport(containers: { Instance }): Model?
	for _, c in containers do
		for _, d in c:GetDescendants() do
			if d:IsA("Model") and d:FindFirstChild("FrontMarker", true) and d:FindFirstChild("Monkey_Torso", true) then
				return d
			end
		end
	end
	return nil
end

-- The importer may bring the file in facing +Z (backwards for Roblox). FrontMarker sits in front of
-- the first variant's feet, so if it lands behind that torso every part needs a half turn.
function EnemyRig.needsFlip(import: Model): boolean
	local marker = import:FindFirstChild("FrontMarker", true) :: BasePart
	local torso = import:FindFirstChild("Monkey_Torso", true) :: BasePart
	return (marker.Position.Z - torso.Position.Z) > 0.05
end

-- Builds the rigged template for one variant. Root sits at torso height; feet at Y = 0.
function EnemyRig.build(import: Model, variant: string, flip: boolean): Model
	local data = RigData[variant]
	assert(data, `No rig data for {variant}`)
	local turn = if flip then CFrame.Angles(0, math.pi, 0) else CFrame.identity
	local torsoPivot = data.Parts.Torso.Pivot

	local model = Instance.new("Model")
	model.Name = variant
	local root = Instance.new("Part")
	root.Name = "Root"
	root.Size = Vector3.new(1, 1, 1)
	root.Transparency = 1
	root.Anchored = true
	root.CanCollide = false
	root.CanQuery = false
	root.CanTouch = false
	root.CFrame = CFrame.new(torsoPivot)
	root.Parent = model
	model.PrimaryPart = root

	local parts: { [string]: BasePart } = { Root = root }
	for name, pd in data.Parts do
		local source = import:FindFirstChild(`{variant}_{name}`, true)
		assert(source and source:IsA("BasePart"), `Imported enemies are missing {variant}_{name}`)
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
		motor.Parent = p0
	end
	model:SetAttribute("RootHeight", torsoPivot.Y)
	model:SetAttribute("Height", data.Height)
	return model
end

-- Stand-in rig built from plain blocks (sizes from RigData, colors from Config) so the game is
-- playable before Enemies.fbx has been imported.
function EnemyRig.buildFallback(variant: string, colors: { Fur: Color3, Cream: Color3 }): Model
	local data = RigData[variant]
	local fake = Instance.new("Model")
	for name, pd in data.Parts do
		local p = Instance.new("Part")
		p.Name = `{variant}_{name}`
		p.Size = pd.Size
		p.Position = pd.Center
		p.Color = if name == "Head" then colors.Cream else colors.Fur
		p.TopSurface = Enum.SurfaceType.Smooth
		p.BottomSurface = Enum.SurfaceType.Smooth
		p.Parent = fake
	end
	local model = EnemyRig.build(fake, variant, false)
	fake:Destroy()
	return model
end

-- Builds every variant into a folder of templates.
function EnemyRig.buildAll(import: Model, into: Instance)
	local flip = EnemyRig.needsFlip(import)
	for variant in RigData do
		local ok, result = pcall(EnemyRig.build, import, variant, flip)
		if ok then
			result.Parent = into
		else
			warn(`[EnemyRig] {variant}: {result}`)
		end
	end
	return flip
end

return EnemyRig
