--[[
	Builds the shared world at server start: ocean terrain, the dark trenches under every plot,
	lighting, decorative islands and the harbor spawn.
]]

local Lighting = game:GetService("Lighting")
local Workspace = game:GetService("Workspace")

local Layout = require(script.Parent.Parent.Layout)

local WorldBuilder = {}

local DEFAULT_LIGHTING = {
	ClockTime = 14,
	Brightness = 2.4,
	Ambient = Color3.fromRGB(110, 120, 140),
	OutdoorAmbient = Color3.fromRGB(140, 150, 170),
	AtmosphereColor = Color3.fromRGB(200, 225, 255),
	AtmosphereDecay = Color3.fromRGB(100, 150, 200),
}

local function part(props: { [string]: any }): Part
	local p = Instance.new("Part")
	p.Anchored = true
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	for key, value in props do
		(p :: any)[key] = value
	end
	return p
end

local function buildTerrain()
	local terrain = Workspace.Terrain
	terrain:Clear()
	terrain.WaterColor = Color3.fromRGB(16, 78, 105)
	terrain.WaterTransparency = 0.3
	terrain.WaterReflectance = 0.35
	terrain.WaterWaveSize = 0.12
	terrain.WaterWaveSpeed = 8

	local floorTop = Layout.SeaFloor
	-- ocean and sea floor
	terrain:FillBlock(CFrame.new(0, floorTop / 2, 0), Vector3.new(960, -floorTop, 760), Enum.Material.Water)
	terrain:FillBlock(CFrame.new(0, floorTop - 6, 0), Vector3.new(960, 12, 760), Enum.Material.Sand)

	-- a trench under every plot: rock walls, then a water column carved through the floor
	local trenchHeight = floorTop - Layout.TrenchBottom
	for _, plotCFrame in Layout.Plots do
		local centre = plotCFrame * CFrame.new(0, 0, Layout.TrenchCenterZ)
		local size = Layout.TrenchSize
		terrain:FillBlock(
			CFrame.new(centre.Position.X, (floorTop - 12 + Layout.TrenchBottom - 12) / 2, centre.Position.Z),
			Vector3.new(size.X + 16, trenchHeight + 12, size.Z + 16),
			Enum.Material.Slate
		)
		terrain:FillBlock(
			CFrame.new(centre.Position.X, (floorTop + Layout.TrenchBottom) / 2, centre.Position.Z),
			Vector3.new(size.X, trenchHeight, size.Z),
			Enum.Material.Water
		)
	end

	-- decorative islands around the edge of the map
	local islands = {
		Vector3.new(-400, -18, -300),
		Vector3.new(390, -20, -310),
		Vector3.new(410, -16, 290),
		Vector3.new(-120, -22, 330),
		Vector3.new(170, -24, -340),
		Vector3.new(430, -20, 0),
	}
	for index, position in islands do
		local radius = 36 + (index % 3) * 8
		terrain:FillBall(position, radius, Enum.Material.Sand)
		terrain:FillBall(position + Vector3.new(0, 6, 0), radius * 0.7, Enum.Material.Grass)
	end
end

local function palmTree(parent: Instance, base: Vector3)
	local trunkHeight = 18
	for i = 0, 5 do
		local p = part({
			Name = "Trunk",
			Size = Vector3.new(1.6, trunkHeight / 6 + 0.3, 1.6),
			CFrame = CFrame.new(base + Vector3.new(i * 0.4, i * trunkHeight / 6 + 1.5, 0))
				* CFrame.Angles(0, 0, math.rad(-8)),
			Color = Color3.fromRGB(140, 100, 60),
			Material = Enum.Material.Wood,
		})
		p.Parent = parent
	end
	local top = base + Vector3.new(2.4, trunkHeight + 1, 0)
	for i = 0, 5 do
		local angle = i * 60
		local leaf = part({
			Name = "Leaf",
			Size = Vector3.new(1.2, 0.4, 9),
			CFrame = CFrame.new(top)
				* CFrame.Angles(0, math.rad(angle), 0)
				* CFrame.new(0, -1, -4)
				* CFrame.Angles(math.rad(-20), 0, 0),
			Color = Color3.fromRGB(60, 170, 70),
			Material = Enum.Material.Grass,
			CanCollide = false,
		})
		leaf.Parent = parent
	end
end

local function buildHarbor()
	local folder = Instance.new("Folder")
	folder.Name = "Harbor"
	folder.Parent = Workspace

	local origin = Layout.Harbor
	local deck = part({
		Name = "HarborDeck",
		Size = Vector3.new(44, 2, 34),
		CFrame = origin * CFrame.new(0, Layout.DeckTop - 1, 0),
		Color = Color3.fromRGB(150, 105, 65),
		Material = Enum.Material.WoodPlanks,
	})
	deck.Parent = folder

	local spawn = Instance.new("SpawnLocation")
	spawn.Name = "HarborSpawn"
	spawn.Anchored = true
	spawn.Size = Vector3.new(8, 1, 8)
	spawn.CFrame = origin * CFrame.new(0, Layout.DeckTop + 0.5, 0)
	spawn.Color = Color3.fromRGB(60, 200, 230)
	spawn.Material = Enum.Material.SmoothPlastic
	spawn.Neutral = true
	spawn.Duration = 0
	spawn.Parent = folder

	local sign = part({
		Name = "Sign",
		Size = Vector3.new(30, 10, 1),
		CFrame = origin * CFrame.new(0, Layout.DeckTop + 9, -16),
		Color = Color3.fromRGB(40, 60, 110),
		Material = Enum.Material.SmoothPlastic,
	})
	sign.Parent = folder
	local gui = Instance.new("SurfaceGui")
	gui.Face = Enum.NormalId.Back
	gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	gui.PixelsPerStud = 30
	gui.Parent = sign
	local label = Instance.new("TextLabel")
	label.Size = UDim2.fromScale(1, 1)
	label.BackgroundTransparency = 1
	label.Text = "ROLL A DIVER"
	label.TextScaled = true
	label.Font = Enum.Font.FredokaOne
	label.TextColor3 = Color3.fromRGB(255, 230, 90)
	label.Parent = gui
	local stroke = Instance.new("UIStroke")
	stroke.Thickness = 4
	stroke.Parent = label

	for _, offset in { Vector3.new(-18, 0, -12), Vector3.new(18, 0, -12) } do
		palmTree(folder, (origin * CFrame.new(offset)).Position + Vector3.new(0, Layout.DeckTop, 0))
	end
end

function WorldBuilder.SetLighting(mode: "Day" | "BloodMoon")
	local atmosphere: Atmosphere = Lighting:FindFirstChildOfClass("Atmosphere") or Instance.new("Atmosphere")
	atmosphere.Parent = Lighting
	local found = Lighting:FindFirstChild("EventTint")
	local correction: ColorCorrectionEffect = if found and found:IsA("ColorCorrectionEffect")
		then found
		else Instance.new("ColorCorrectionEffect")
	correction.Name = "EventTint"
	correction.Parent = Lighting
	if mode == "BloodMoon" then
		Lighting.ClockTime = 0
		Lighting.Brightness = 1.5
		Lighting.Ambient = Color3.fromRGB(120, 40, 50)
		Lighting.OutdoorAmbient = Color3.fromRGB(150, 50, 60)
		atmosphere.Color = Color3.fromRGB(255, 90, 90)
		atmosphere.Decay = Color3.fromRGB(120, 20, 30)
		correction.TintColor = Color3.fromRGB(255, 200, 200)
	else
		Lighting.ClockTime = DEFAULT_LIGHTING.ClockTime
		Lighting.Brightness = DEFAULT_LIGHTING.Brightness
		Lighting.Ambient = DEFAULT_LIGHTING.Ambient
		Lighting.OutdoorAmbient = DEFAULT_LIGHTING.OutdoorAmbient
		atmosphere.Color = DEFAULT_LIGHTING.AtmosphereColor
		atmosphere.Decay = DEFAULT_LIGHTING.AtmosphereDecay
		correction.TintColor = Color3.new(1, 1, 1)
	end
	atmosphere.Density = 0.3
	atmosphere.Offset = 0.2
	atmosphere.Haze = 1
	atmosphere.Glare = 0
end

function WorldBuilder.Init()
	Lighting.GlobalShadows = true
	Lighting.EnvironmentDiffuseScale = 0.5
	Lighting.EnvironmentSpecularScale = 0.5
	WorldBuilder.SetLighting("Day")
	buildTerrain()
	buildHarbor()
end

return WorldBuilder
