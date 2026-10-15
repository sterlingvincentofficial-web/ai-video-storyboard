--!strict
-- Style-test scene: rigs the imported Monkey mesh, spawns a few wandering monkeys and
-- level 1 Brawlers on the platform. Delete once the real wave system exists.
--
-- Setup in Studio (once): File > Import 3D, pick assets/monkey/Monkey.fbx, then assets/men/MenGear.fbx.
-- Leave the imported models where they land (Workspace) or drop them in ReplicatedStorage.Assets.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local MonkeyRig = require(Shared:WaitForChild("MonkeyRig"))
local MenFactory = require(Shared:WaitForChild("MenFactory"))

local assets = ReplicatedStorage:WaitForChild("Assets")

-- Only needed if the monkey imports without its texture (shows up flat gray): upload
-- assets/monkey/MonkeyAtlas.png and put "rbxassetid://<id>" here.
local MONKEY_TEXTURE_ID: string? = nil

-- Move freshly imported models out of the Workspace so they don't sit in the scene.
local function collect(name: string, marker: string): Instance?
	for _, container in { assets, workspace } do
		for _, d in container:GetDescendants() do
			if d:IsA("Model") and d.Name == name and d:FindFirstChild(marker, true) then
				d.Parent = assets
				return d
			end
		end
	end
	return nil
end

local monkeyMesh = collect("Monkey", "Tail") :: Model?
local menGear = collect("MenGear", "Headband")

local stage = Instance.new("Folder")
stage.Name = "Showcase"
stage.Parent = workspace

local flip = false
if monkeyMesh then
	flip = MonkeyRig.needsFlip(monkeyMesh)
	local spots = { Vector3.new(-4, 0, 4), Vector3.new(-1, 0, 8), Vector3.new(-7, 0, 9) }
	for i, pos in spots do
		local monkey = MonkeyRig.build(monkeyMesh, MONKEY_TEXTURE_ID)
		monkey.Name = `Monkey{i}`
		MonkeyRig.place(monkey, CFrame.lookAt(pos, Vector3.new(0, 0, 20)))
		monkey.Parent = stage
		-- wander around the beach so the walk cycle shows
		task.spawn(function()
			local humanoid = monkey:FindFirstChildOfClass("Humanoid") :: Humanoid
			while monkey.Parent do
				humanoid:MoveTo(pos + Vector3.new(math.random(-6, 6), 0, math.random(-5, 5)))
				task.wait(2 + math.random() * 3)
			end
		end)
	end
else
	warn("[Showcase] No Monkey mesh found. Import assets/monkey/Monkey.fbx (File > Import 3D) and press Play again.")
end
if not menGear then
	warn("[Showcase] MenGear.fbx not imported yet: Brawlers get plain wraps and no headband.")
end

for i, pos in { Vector3.new(4, 0, 5), Vector3.new(7.5, 0, 7.5) } do
	local man = MenFactory.build("Brawler", 1, menGear, flip)
	man.Name = `Brawler_L1_{i}`
	man:PivotTo(CFrame.lookAt(pos + Vector3.new(0, 3, 0), Vector3.new(-2, 3, 6)))
	man.Parent = stage
	MenFactory.playIdle(man)
end
