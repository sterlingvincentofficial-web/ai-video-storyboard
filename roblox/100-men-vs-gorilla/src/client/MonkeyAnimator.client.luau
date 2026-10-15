--!strict
-- Procedural monkey animation (no uploaded animation assets needed): waddle walk, idle breathing,
-- swaying tail. Runs on each client against every model tagged "Monkey".

local CollectionService = game:GetService("CollectionService")
local RunService = game:GetService("RunService")

type State = {
	root: BasePart,
	motors: { [string]: Motor6D },
	phase: number,
	seed: number,
}

local monkeys: { [Model]: State } = {}

local function track(model: Instance)
	if not model:IsA("Model") then
		return
	end
	local root = model:WaitForChild("HumanoidRootPart", 5) :: BasePart?
	if not root then
		return
	end
	local motors = {}
	for _, d in model:GetDescendants() do
		if d:IsA("Motor6D") then
			motors[d.Name] = d
		end
	end
	monkeys[model] = { root = root, motors = motors, phase = 0, seed = math.random() * 100 }
end

for _, m in CollectionService:GetTagged("Monkey") do
	task.spawn(track, m)
end
CollectionService:GetInstanceAddedSignal("Monkey"):Connect(track)
CollectionService:GetInstanceRemovedSignal("Monkey"):Connect(function(m)
	monkeys[m :: Model] = nil
end)

local function set(motors: { [string]: Motor6D }, name: string, cf: CFrame)
	local m = motors[name]
	if m then
		m.Transform = cf
	end
end

RunService.PreSimulation:Connect(function(dt)
	local t = os.clock()
	for model, s in monkeys do
		if not model.Parent then
			monkeys[model] = nil
			continue
		end
		local v = s.root.AssemblyLinearVelocity
		local speed = Vector3.new(v.X, 0, v.Z).Magnitude
		local walk = math.clamp(speed / 8, 0, 1)
		s.phase += dt * (4 + speed * 0.9)
		local p = s.phase
		local swing = math.sin(p)
		local idle = math.sin(t * 2 + s.seed)

		-- waddle: body rocks side to side and bobs on each step
		set(s.motors, "RootJoint", CFrame.new(0, math.abs(swing) * 0.18 * walk + idle * 0.03 * (1 - walk), 0)
			* CFrame.Angles(0.12 * walk, 0, swing * 0.12 * walk))
		set(s.motors, "Left Hip", CFrame.Angles(swing * 0.7 * walk, 0, 0))
		set(s.motors, "Right Hip", CFrame.Angles(-swing * 0.7 * walk, 0, 0))
		-- long arms swing wide when walking, dangle and sway when idle
		set(s.motors, "Left Shoulder", CFrame.Angles(-swing * 0.9 * walk + idle * 0.06, 0, -0.15 * walk))
		set(s.motors, "Right Shoulder", CFrame.Angles(swing * 0.9 * walk - idle * 0.06, 0, 0.15 * walk))
		set(s.motors, "Neck", CFrame.Angles(-0.05 * walk, math.sin(t * 0.7 + s.seed) * 0.35 * (1 - walk), swing * 0.08 * walk))
		set(s.motors, "Tail", CFrame.Angles(math.sin(t * 1.6 + s.seed) * 0.12, math.sin(t * 2.2 + s.seed) * 0.35, 0))
	end
end)
