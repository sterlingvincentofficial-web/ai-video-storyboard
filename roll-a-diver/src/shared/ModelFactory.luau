--[[
	Builds every model in the game out of plain parts, so the place needs no uploaded assets.
	Used by the server (world models) and the client (viewport previews in the UI).

	All returned models are anchored, non-colliding and have a PrimaryPart named "Root"
	at the model's base (feet for divers, centre for treasures and chests).
]]

local Config = script.Parent.Config
local Divers = require(Config.Divers)
local Treasures = require(Config.Treasures)
local Conditions = require(Config.Conditions)
local Zones = require(Config.Zones)
local Rarities = require(Config.Rarities)

local ModelFactory = {}

local FACE_TEXTURE = "rbxasset://textures/face.png"

type PartProps = {
	name: string?,
	size: Vector3,
	cframe: CFrame,
	color: Color3,
	material: Enum.Material?,
	shape: Enum.PartType?,
	transparency: number?,
	reflectance: number?,
	ellipsoid: boolean?, -- stretched sphere (Ball parts are always perfectly round)
}

local function makePart(model: Model, root: BasePart, props: PartProps): Part
	local part = Instance.new("Part")
	part.Name = props.name or "Part"
	part.Anchored = true
	part.CanCollide = false
	part.CanQuery = false
	part.CanTouch = false
	part.CastShadow = false
	part.TopSurface = Enum.SurfaceType.Smooth
	part.BottomSurface = Enum.SurfaceType.Smooth
	part.Shape = props.shape or Enum.PartType.Block
	part.Size = props.size
	part.Color = props.color
	part.Material = props.material or Enum.Material.SmoothPlastic
	part.Transparency = props.transparency or 0
	part.Reflectance = props.reflectance or 0
	part.CFrame = root.CFrame * props.cframe
	if props.ellipsoid then
		local mesh = Instance.new("SpecialMesh")
		mesh.MeshType = Enum.MeshType.Sphere
		mesh.Parent = part
	end
	part.Parent = model
	return part
end

local function newModel(name: string, rootSize: Vector3?): (Model, Part)
	local model = Instance.new("Model")
	model.Name = name
	local root = Instance.new("Part")
	root.Name = "Root"
	root.Anchored = true
	root.CanCollide = false
	root.CanQuery = false
	root.CanTouch = false
	root.Transparency = 1
	root.Size = rootSize or Vector3.new(1, 1, 1)
	root.CFrame = CFrame.new()
	root.Parent = model
	model.PrimaryPart = root
	return model, root
end

local function cf(x: number, y: number, z: number, rx: number?, ry: number?, rz: number?): CFrame
	return CFrame.new(x, y, z) * CFrame.Angles(math.rad(rx or 0), math.rad(ry or 0), math.rad(rz or 0))
end

-- Divers ---------------------------------------------------------------------------------------

local GLASS = Color3.fromRGB(140, 220, 255)
local BRASS = Color3.fromRGB(200, 150, 60)
local GOLD = Color3.fromRGB(255, 205, 60)
local DARK = Color3.fromRGB(30, 30, 35)

local function buildHelmet(model: Model, root: Part, helmet: string, suit: Color3, accent: Color3)
	local headY = 4.6
	if helmet == "Mask" then
		makePart(model, root, {
			name = "Goggles",
			size = Vector3.new(1.3, 0.45, 0.25),
			cframe = cf(0, headY + 0.15, -0.6),
			color = GLASS,
			material = Enum.Material.Glass,
			transparency = 0.2,
		})
		makePart(
			model,
			root,
			{ name = "Snorkel", size = Vector3.new(0.2, 1.3, 0.2), cframe = cf(0.7, headY + 0.6, -0.2), color = accent }
		)
	elseif helmet == "Scuba" then
		makePart(model, root, {
			name = "Mask",
			size = Vector3.new(1.35, 0.7, 0.25),
			cframe = cf(0, headY + 0.1, -0.62),
			color = GLASS,
			material = Enum.Material.Glass,
			transparency = 0.15,
		})
		makePart(
			model,
			root,
			{ name = "MaskRim", size = Vector3.new(1.45, 0.8, 0.15), cframe = cf(0, headY + 0.1, -0.52), color = DARK }
		)
		makePart(model, root, {
			name = "Regulator",
			size = Vector3.new(0.4, 0.4, 0.4),
			cframe = cf(0, headY - 0.45, -0.7),
			color = accent,
		})
		makePart(
			model,
			root,
			{ name = "Hood", size = Vector3.new(1.3, 0.5, 1.3), cframe = cf(0, headY + 0.6, 0), color = suit }
		)
	elseif helmet == "Brass" then
		makePart(model, root, {
			name = "Helmet",
			shape = Enum.PartType.Ball,
			size = Vector3.new(2.3, 2.3, 2.3),
			cframe = cf(0, headY, 0),
			color = BRASS,
			material = Enum.Material.Metal,
			reflectance = 0.1,
		})
		makePart(model, root, {
			name = "Faceplate",
			shape = Enum.PartType.Cylinder,
			size = Vector3.new(0.3, 1.2, 1.2),
			cframe = cf(0, headY, -1.05, 0, 90, 0),
			color = GLASS,
			material = Enum.Material.Glass,
			transparency = 0.25,
		})
		makePart(model, root, {
			name = "Collar",
			size = Vector3.new(2.2, 0.35, 1.8),
			cframe = cf(0, headY - 1.1, 0),
			color = BRASS,
			material = Enum.Material.Metal,
		})
		for _, x in { -0.8, 0.8 } do
			makePart(model, root, {
				name = "Porthole",
				shape = Enum.PartType.Cylinder,
				size = Vector3.new(0.2, 0.6, 0.6),
				cframe = cf(x, headY, -0.6, 0, 90 + x * 50, 0),
				color = GLASS,
				material = Enum.Material.Glass,
				transparency = 0.3,
			})
		end
	elseif helmet == "Pirate" then
		makePart(
			model,
			root,
			{ name = "Brim", size = Vector3.new(2, 0.2, 1.5), cframe = cf(0, headY + 0.65, 0), color = DARK }
		)
		makePart(
			model,
			root,
			{ name = "Hat", size = Vector3.new(1.3, 0.6, 1.2), cframe = cf(0, headY + 1.05, 0), color = DARK }
		)
		makePart(
			model,
			root,
			{ name = "Band", size = Vector3.new(1.35, 0.15, 1.25), cframe = cf(0, headY + 0.85, 0), color = accent }
		)
		makePart(model, root, {
			name = "Mask",
			size = Vector3.new(1.3, 0.4, 0.2),
			cframe = cf(0, headY + 0.15, -0.62),
			color = GLASS,
			material = Enum.Material.Glass,
			transparency = 0.2,
		})
	elseif helmet == "Crown" then
		makePart(model, root, {
			name = "CrownBand",
			size = Vector3.new(1.4, 0.35, 1.4),
			cframe = cf(0, headY + 0.75, 0),
			color = GOLD,
			material = Enum.Material.Metal,
			reflectance = 0.2,
		})
		for i = 0, 3 do
			local angle = i * 90
			local x, z = math.sin(math.rad(angle)) * 0.55, math.cos(math.rad(angle)) * 0.55
			makePart(model, root, {
				name = "Spike",
				size = Vector3.new(0.3, 0.6, 0.3),
				cframe = cf(x, headY + 1.2, z, 0, angle, 0),
				color = GOLD,
				material = Enum.Material.Metal,
			})
		end
		makePart(model, root, {
			name = "Jewel",
			size = Vector3.new(0.3, 0.3, 0.1),
			cframe = cf(0, headY + 0.75, -0.72),
			color = accent,
			material = Enum.Material.Neon,
		})
	elseif helmet == "Ghost" then
		makePart(model, root, {
			name = "Eyes",
			size = Vector3.new(1, 0.25, 0.1),
			cframe = cf(0, headY + 0.1, -0.62),
			color = accent,
			material = Enum.Material.Neon,
		})
		makePart(model, root, {
			name = "Tricorn",
			size = Vector3.new(2, 0.5, 1.6),
			cframe = cf(0, headY + 0.85, 0),
			color = DARK,
			transparency = 0.3,
		})
	elseif helmet == "Fin" then
		makePart(model, root, {
			name = "Fin",
			shape = Enum.PartType.Wedge,
			size = Vector3.new(0.2, 1, 1.2),
			cframe = cf(0, headY + 1.05, 0.1),
			color = accent,
		})
		makePart(model, root, {
			name = "Mask",
			size = Vector3.new(1.3, 0.4, 0.2),
			cframe = cf(0, headY + 0.15, -0.62),
			color = GLASS,
			material = Enum.Material.Glass,
			transparency = 0.2,
		})
	elseif helmet == "Knight" then
		makePart(model, root, {
			name = "Helm",
			size = Vector3.new(1.5, 1.5, 1.5),
			cframe = cf(0, headY, 0),
			color = suit,
			material = Enum.Material.Metal,
			reflectance = 0.1,
		})
		makePart(model, root, {
			name = "Visor",
			size = Vector3.new(1.2, 0.18, 0.1),
			cframe = cf(0, headY + 0.1, -0.76),
			color = accent,
			material = Enum.Material.Neon,
		})
		makePart(
			model,
			root,
			{ name = "Crest", size = Vector3.new(0.2, 0.6, 1.3), cframe = cf(0, headY + 1, 0), color = accent }
		)
	end
end

function ModelFactory.diver(diverId: string): Model
	local diver = Divers.ById[diverId]
	assert(diver, "Unknown diver " .. tostring(diverId))
	local look = diver.look
	local model, root = newModel(diver.name, Vector3.new(2, 0.2, 2))
	local isGhost = look.helmet == "Ghost"
	local suitMaterial = if isGhost then Enum.Material.Neon else Enum.Material.SmoothPlastic
	local ghostAlpha = if isGhost then 0.35 else 0

	-- body (the model faces -Z, the Roblox "front")
	for _, x in { -0.5, 0.5 } do
		makePart(model, root, {
			name = "Leg",
			size = Vector3.new(0.9, 2, 0.9),
			cframe = cf(x, 1.1, 0),
			color = look.suit,
			material = suitMaterial,
			transparency = ghostAlpha,
		})
		makePart(model, root, {
			name = "Flipper",
			size = Vector3.new(1, 0.2, 1.8),
			cframe = cf(x, 0.1, -0.45),
			color = look.accent,
			transparency = ghostAlpha,
		})
	end
	makePart(model, root, {
		name = "Torso",
		size = Vector3.new(2, 2, 1),
		cframe = cf(0, 3, 0),
		color = look.suit,
		material = suitMaterial,
		transparency = ghostAlpha,
	})
	makePart(model, root, {
		name = "Belt",
		size = Vector3.new(2.05, 0.3, 1.05),
		cframe = cf(0, 2.2, 0),
		color = look.accent,
		transparency = ghostAlpha,
	})
	for _, x in { -1.45, 1.45 } do
		makePart(model, root, {
			name = "Arm",
			size = Vector3.new(0.85, 2, 0.85),
			cframe = cf(x, 3, 0),
			color = look.suit,
			material = suitMaterial,
			transparency = ghostAlpha,
		})
		makePart(model, root, {
			name = "Hand",
			size = Vector3.new(0.8, 0.5, 0.8),
			cframe = cf(x, 1.8, 0),
			color = look.skin,
			transparency = ghostAlpha,
		})
	end
	local needsTank = look.helmet ~= "Mask"
		and look.helmet ~= "Fin"
		and look.helmet ~= "Crown"
		and look.helmet ~= "Ghost"
	if needsTank then
		makePart(model, root, {
			name = "Tank",
			shape = Enum.PartType.Cylinder,
			size = Vector3.new(1.9, 0.9, 0.9),
			cframe = cf(0, 3.1, 0.85, 0, 0, 90),
			color = look.accent,
			material = Enum.Material.Metal,
		})
	end
	local head = makePart(model, root, {
		name = "Head",
		size = Vector3.new(1.2, 1.2, 1.2),
		cframe = cf(0, 4.6, 0),
		color = look.skin,
		material = suitMaterial,
		transparency = ghostAlpha,
	})
	local face = Instance.new("Decal")
	face.Name = "Face"
	face.Texture = FACE_TEXTURE
	face.Face = Enum.NormalId.Front
	face.Transparency = ghostAlpha
	face.Parent = head
	buildHelmet(model, root, look.helmet, look.suit, look.accent)

	-- lights and bubbles are switched on by the client while underwater
	local lamp = Instance.new("Attachment")
	lamp.Name = "Lamp"
	lamp.CFrame = CFrame.new(0, 0, -0.6)
	lamp.Parent = head
	local spot = Instance.new("SpotLight")
	spot.Name = "Flashlight"
	spot.Brightness = 4
	spot.Range = 45
	spot.Angle = 55
	spot.Face = Enum.NormalId.Front
	spot.Color = Color3.fromRGB(255, 245, 220)
	spot.Shadows = false
	spot.Enabled = false
	spot.Parent = head
	local glow = Instance.new("PointLight")
	glow.Name = "Glow"
	glow.Range = 18
	glow.Brightness = 0
	glow.Enabled = false
	glow.Parent = root
	local bubbles = Instance.new("ParticleEmitter")
	bubbles.Name = "Bubbles"
	bubbles.Enabled = false
	bubbles.Rate = 6
	bubbles.Lifetime = NumberRange.new(1.2, 2)
	bubbles.Speed = NumberRange.new(4, 7)
	bubbles.SpreadAngle = Vector2.new(15, 15)
	bubbles.Size = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.25), NumberSequenceKeypoint.new(1, 0.5) })
	bubbles.Transparency = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.2), NumberSequenceKeypoint.new(1, 1) })
	bubbles.Color = ColorSequence.new(Color3.fromRGB(210, 245, 255))
	bubbles.LightEmission = 0.5
	bubbles.EmissionDirection = Enum.NormalId.Top
	bubbles.Parent = head

	-- tier glow ring under divers of Legendary and above
	local rarity = Rarities.ById[diver.tier]
	if rarity.rank >= 5 then
		makePart(model, root, {
			name = "Aura",
			shape = Enum.PartType.Cylinder,
			size = Vector3.new(0.1, 3.2, 3.2),
			cframe = cf(0, 0.05, 0, 0, 0, 90),
			color = rarity.color,
			material = Enum.Material.Neon,
			transparency = 0.45,
		})
	end

	model:SetAttribute("DiverId", diverId)
	return model
end

-- Treasures ------------------------------------------------------------------------------------

type Builder = (model: Model, root: Part, color: Color3, material: Enum.Material) -> ()

local function ring(
	model: Model,
	root: Part,
	color: Color3,
	material: Enum.Material,
	radius: number,
	segments: number,
	thickness: number
)
	for i = 0, segments - 1 do
		local angle = i * 360 / segments
		local x = math.sin(math.rad(angle)) * radius
		local y = math.cos(math.rad(angle)) * radius
		local length = 2 * math.pi * radius / segments + 0.05
		makePart(model, root, {
			name = "Ring",
			size = Vector3.new(length, thickness, thickness),
			cframe = cf(x, y, 0, 0, 0, -angle),
			color = color,
			material = material,
		})
	end
end

local SHAPES: { [string]: Builder } = {
	Coin = function(model, root, color, material)
		makePart(model, root, {
			name = "Coin",
			shape = Enum.PartType.Cylinder,
			size = Vector3.new(0.35, 2.2, 2.2),
			cframe = cf(0, 0, 0, 0, 90, 0),
			color = color,
			material = material,
		})
		makePart(model, root, {
			name = "Emblem",
			shape = Enum.PartType.Cylinder,
			size = Vector3.new(0.4, 1.3, 1.3),
			cframe = cf(0, 0, 0, 0, 90, 0),
			color = color:Lerp(Color3.new(1, 1, 1), 0.25),
			material = material,
		})
	end,
	Gem = function(model, root, color, material)
		makePart(model, root, {
			name = "Gem",
			size = Vector3.new(1.5, 1.5, 1.5),
			cframe = cf(0, 0, 0, 45, 0, 45),
			color = color,
			material = Enum.Material.Glass,
			transparency = 0.15,
		})
		makePart(model, root, {
			name = "Core",
			size = Vector3.new(0.8, 0.8, 0.8),
			cframe = cf(0, 0, 0, 45, 0, 45),
			color = color,
			material = if material == Enum.Material.SmoothPlastic then Enum.Material.Neon else material,
		})
	end,
	Orb = function(model, root, color, material)
		makePart(model, root, {
			name = "Orb",
			shape = Enum.PartType.Ball,
			size = Vector3.new(2, 2, 2),
			cframe = CFrame.new(),
			color = color,
			material = material,
		})
		makePart(model, root, {
			name = "Shine",
			shape = Enum.PartType.Ball,
			size = Vector3.new(0.5, 0.5, 0.5),
			cframe = cf(-0.45, 0.45, -0.6),
			color = Color3.new(1, 1, 1),
			material = Enum.Material.Neon,
			transparency = 0.3,
		})
	end,
	Shell = function(model, root, color, material)
		local shell = makePart(model, root, {
			name = "Shell",
			shape = Enum.PartType.Ball,
			size = Vector3.new(2.2, 2.2, 2.2),
			cframe = CFrame.new(),
			color = color,
			material = material,
		})
		local mesh = Instance.new("SpecialMesh")
		mesh.MeshType = Enum.MeshType.Sphere
		mesh.Scale = Vector3.new(1, 0.55, 0.85)
		mesh.Parent = shell
		for i = -2, 2 do
			makePart(model, root, {
				name = "Ridge",
				size = Vector3.new(0.12, 0.2, 1.8),
				cframe = cf(i * 0.35, 0.55, 0, 0, i * 12, 0),
				color = color:Lerp(Color3.new(1, 1, 1), 0.35),
				material = material,
			})
		end
	end,
	Bottle = function(model, root, color, material)
		makePart(model, root, {
			name = "Body",
			shape = Enum.PartType.Cylinder,
			size = Vector3.new(1.8, 1.1, 1.1),
			cframe = cf(0, -0.3, 0, 0, 0, 90),
			color = color,
			material = Enum.Material.Glass,
			transparency = 0.3,
		})
		makePart(model, root, {
			name = "Neck",
			shape = Enum.PartType.Cylinder,
			size = Vector3.new(0.6, 0.45, 0.45),
			cframe = cf(0, 0.85, 0, 0, 0, 90),
			color = color,
			material = Enum.Material.Glass,
			transparency = 0.3,
		})
		makePart(model, root, {
			name = "Cork",
			size = Vector3.new(0.4, 0.35, 0.4),
			cframe = cf(0, 1.25, 0),
			color = Color3.fromRGB(170, 120, 70),
		})
		makePart(model, root, {
			name = "Scroll",
			shape = Enum.PartType.Cylinder,
			size = Vector3.new(1.1, 0.5, 0.5),
			cframe = cf(0, -0.3, 0, 0, 0, 90),
			color = Color3.fromRGB(240, 225, 180),
			material = material,
		})
	end,
	Star = function(model, root, color, material)
		for i = 0, 4 do
			local angle = i * 72
			local x = math.sin(math.rad(angle)) * 0.6
			local y = math.cos(math.rad(angle)) * 0.6
			makePart(model, root, {
				name = "Arm",
				size = Vector3.new(0.55, 1.35, 0.35),
				cframe = cf(x, y, 0, 0, 0, -angle),
				color = color,
				material = material,
			})
		end
		makePart(model, root, {
			name = "Centre",
			shape = Enum.PartType.Cylinder,
			size = Vector3.new(0.4, 0.9, 0.9),
			cframe = cf(0, 0, 0, 0, 90, 0),
			color = color,
			material = material,
		})
	end,
	Anchor = function(model, root, color, material)
		makePart(model, root, {
			name = "Shaft",
			size = Vector3.new(0.35, 2.4, 0.35),
			cframe = CFrame.new(),
			color = color,
			material = material,
		})
		makePart(model, root, {
			name = "Stock",
			size = Vector3.new(1.6, 0.3, 0.3),
			cframe = cf(0, 0.8, 0),
			color = color,
			material = material,
		})
		makePart(model, root, {
			name = "Eye",
			shape = Enum.PartType.Cylinder,
			size = Vector3.new(0.2, 0.6, 0.6),
			cframe = cf(0, 1.35, 0, 0, 90, 0),
			color = color,
			material = material,
		})
		for _, side in { -1, 1 } do
			makePart(model, root, {
				name = "Fluke",
				size = Vector3.new(0.3, 1.1, 0.3),
				cframe = cf(side * 0.45, -1, 0, 0, 0, side * 50),
				color = color,
				material = material,
			})
		end
	end,
	Crown = function(model, root, color, material)
		for i = 0, 7 do
			local angle = i * 45
			local x = math.sin(math.rad(angle)) * 0.8
			local z = math.cos(math.rad(angle)) * 0.8
			makePart(model, root, {
				name = "Band",
				size = Vector3.new(0.7, 0.6, 0.22),
				cframe = cf(x, -0.3, z, 0, angle, 0),
				color = color,
				material = material,
			})
			if i % 2 == 0 then
				makePart(model, root, {
					name = "Point",
					size = Vector3.new(0.25, 0.7, 0.25),
					cframe = cf(x, 0.3, z, 0, angle, 0),
					color = color,
					material = material,
				})
			end
		end
		makePart(model, root, {
			name = "Jewel",
			shape = Enum.PartType.Ball,
			size = Vector3.new(0.45, 0.45, 0.45),
			cframe = cf(0, -0.3, -0.9),
			color = Color3.fromRGB(255, 60, 90),
			material = Enum.Material.Neon,
		})
	end,
	Sword = function(model, root, color, material)
		makePart(model, root, {
			name = "Blade",
			size = Vector3.new(0.5, 2.3, 0.18),
			cframe = cf(0, 0.5, 0),
			color = color,
			material = Enum.Material.Metal,
			reflectance = 0.15,
		})
		makePart(model, root, {
			name = "Guard",
			size = Vector3.new(1.3, 0.25, 0.35),
			cframe = cf(0, -0.7, 0),
			color = GOLD,
			material = Enum.Material.Metal,
		})
		makePart(model, root, {
			name = "Grip",
			size = Vector3.new(0.28, 0.7, 0.28),
			cframe = cf(0, -1.15, 0),
			color = Color3.fromRGB(90, 55, 30),
		})
		makePart(model, root, {
			name = "Pommel",
			shape = Enum.PartType.Ball,
			size = Vector3.new(0.4, 0.4, 0.4),
			cframe = cf(0, -1.55, 0),
			color = GOLD,
			material = Enum.Material.Metal,
		})
		local _ = material
	end,
	Block = function(model, root, color, material)
		makePart(model, root, {
			name = "Block",
			size = Vector3.new(2, 1.3, 0.35),
			cframe = CFrame.new(),
			color = color,
			material = material,
		})
		makePart(model, root, {
			name = "Detail",
			size = Vector3.new(1.4, 0.15, 0.4),
			cframe = cf(0, 0.25, 0),
			color = color:Lerp(Color3.new(0, 0, 0), 0.3),
			material = material,
		})
		makePart(model, root, {
			name = "Detail",
			size = Vector3.new(1.1, 0.15, 0.4),
			cframe = cf(0, -0.15, 0),
			color = color:Lerp(Color3.new(0, 0, 0), 0.3),
			material = material,
		})
	end,
	Ring = function(model, root, color, material)
		ring(model, root, color, material, 0.9, 12, 0.3)
		makePart(model, root, {
			name = "Face",
			shape = Enum.PartType.Cylinder,
			size = Vector3.new(0.15, 1.5, 1.5),
			cframe = cf(0, 0, 0, 0, 90, 0),
			color = color:Lerp(Color3.new(1, 1, 1), 0.5),
			material = material,
		})
		makePart(model, root, {
			name = "Needle",
			size = Vector3.new(0.12, 0.9, 0.2),
			cframe = cf(0, 0.1, -0.1, 0, 0, 30),
			color = Color3.fromRGB(220, 40, 40),
			material = Enum.Material.Neon,
		})
	end,
	Skull = function(model, root, color, material)
		makePart(model, root, {
			name = "Cranium",
			shape = Enum.PartType.Ball,
			size = Vector3.new(1.9, 1.9, 1.9),
			cframe = cf(0, 0.2, 0),
			color = color,
			material = material,
		})
		makePart(model, root, {
			name = "Jaw",
			size = Vector3.new(1.1, 0.55, 0.9),
			cframe = cf(0, -0.75, -0.25),
			color = color,
			material = material,
		})
		for _, x in { -0.4, 0.4 } do
			makePart(model, root, {
				name = "Socket",
				shape = Enum.PartType.Ball,
				size = Vector3.new(0.5, 0.5, 0.5),
				cframe = cf(x, 0.15, -0.75),
				color = Color3.new(0, 0, 0),
			})
		end
	end,
	Trident = function(model, root, color, material)
		makePart(model, root, {
			name = "Shaft",
			size = Vector3.new(0.25, 3, 0.25),
			cframe = cf(0, -0.3, 0),
			color = color,
			material = Enum.Material.Metal,
			reflectance = 0.1,
		})
		makePart(model, root, {
			name = "Bar",
			size = Vector3.new(1.3, 0.22, 0.25),
			cframe = cf(0, 1.1, 0),
			color = color,
			material = Enum.Material.Metal,
		})
		for _, x in { -0.55, 0, 0.55 } do
			makePart(model, root, {
				name = "Prong",
				size = Vector3.new(0.2, 0.9, 0.2),
				cframe = cf(x, 1.6, 0),
				color = color,
				material = Enum.Material.Metal,
			})
		end
		local _ = material
	end,
	Helmet = function(model, root, color, material)
		makePart(model, root, {
			name = "Dome",
			shape = Enum.PartType.Ball,
			size = Vector3.new(2, 2, 2),
			cframe = CFrame.new(),
			color = color,
			material = Enum.Material.Metal,
			reflectance = 0.1,
		})
		makePart(model, root, {
			name = "Window",
			shape = Enum.PartType.Cylinder,
			size = Vector3.new(0.25, 1.1, 1.1),
			cframe = cf(0, 0, -0.9, 0, 90, 0),
			color = GLASS,
			material = Enum.Material.Glass,
			transparency = 0.25,
		})
		makePart(model, root, {
			name = "Crest",
			size = Vector3.new(0.2, 0.5, 1.6),
			cframe = cf(0, 1, 0),
			color = color:Lerp(Color3.new(1, 1, 1), 0.3),
			material = material,
		})
	end,
	Duck = function(model, root, color, material)
		local body = makePart(model, root, {
			name = "Body",
			shape = Enum.PartType.Ball,
			size = Vector3.new(2, 2, 2),
			cframe = cf(0, -0.3, 0.1),
			color = color,
			material = material,
		})
		local mesh = Instance.new("SpecialMesh")
		mesh.MeshType = Enum.MeshType.Sphere
		mesh.Scale = Vector3.new(0.9, 0.65, 1)
		mesh.Parent = body
		makePart(model, root, {
			name = "Head",
			shape = Enum.PartType.Ball,
			size = Vector3.new(1.1, 1.1, 1.1),
			cframe = cf(0, 0.55, -0.45),
			color = color,
			material = material,
		})
		makePart(model, root, {
			name = "Beak",
			size = Vector3.new(0.5, 0.2, 0.5),
			cframe = cf(0, 0.45, -1.05),
			color = Color3.fromRGB(255, 130, 30),
		})
	end,
	Hat = function(model, root, color, material)
		makePart(model, root, {
			name = "Brim",
			shape = Enum.PartType.Cylinder,
			size = Vector3.new(0.2, 2.4, 2.4),
			cframe = cf(0, -0.4, 0, 0, 0, 90),
			color = color,
			material = material,
		})
		makePart(model, root, {
			name = "Top",
			size = Vector3.new(1.4, 1, 1.3),
			cframe = cf(0, 0.2, 0),
			color = color,
			material = material,
		})
		makePart(model, root, {
			name = "Skull",
			size = Vector3.new(0.5, 0.5, 0.1),
			cframe = cf(0, 0.2, -0.66),
			color = Color3.new(1, 1, 1),
		})
	end,
	Bell = function(model, root, color, material)
		makePart(model, root, {
			name = "Mouth",
			shape = Enum.PartType.Cylinder,
			size = Vector3.new(0.4, 2, 2),
			cframe = cf(0, -0.7, 0, 0, 0, 90),
			color = color,
			material = Enum.Material.Metal,
		})
		makePart(model, root, {
			name = "Body",
			shape = Enum.PartType.Cylinder,
			size = Vector3.new(1.3, 1.5, 1.5),
			cframe = cf(0, 0.1, 0, 0, 0, 90),
			color = color,
			material = Enum.Material.Metal,
		})
		makePart(model, root, {
			name = "Top",
			shape = Enum.PartType.Ball,
			size = Vector3.new(1.2, 1.2, 1.2),
			cframe = cf(0, 0.8, 0),
			color = color,
			material = Enum.Material.Metal,
		})
		local _ = material
	end,
}

local function applyCondition(model: Model, root: Part, conditionId: string?)
	local condition = conditionId and Conditions.ById[conditionId]
	if not condition or condition.effect == "None" then
		return
	end
	local effect = condition.effect
	for _, part in model:GetDescendants() do
		if part:IsA("BasePart") and part ~= root then
			if effect == "Shine" then
				part.Reflectance = math.max(part.Reflectance, 0.35)
			elseif effect == "Gold" then
				part.Color = part.Color:Lerp(GOLD, 0.8)
				part.Material = Enum.Material.Metal
				part.Reflectance = 0.25
			elseif effect == "Smoke" then
				part.Color = part.Color:Lerp(Color3.fromRGB(90, 20, 140), 0.55)
			elseif effect == "Crystal" then
				part.Color = part.Color:Lerp(condition.color, 0.6)
				part.Material = Enum.Material.Glass
				part.Transparency = math.max(part.Transparency, 0.3)
			elseif effect == "Ancient" then
				part.Color = part.Color:Lerp(Color3.fromRGB(110, 140, 90), 0.55)
				part.Material = Enum.Material.Slate
			elseif effect == "Glitch" then
				part.Material = Enum.Material.Neon
			end
		end
	end
	if effect == "Smoke" then
		local smoke = Instance.new("ParticleEmitter")
		smoke.Name = "CursedSmoke"
		smoke.Rate = 12
		smoke.Lifetime = NumberRange.new(1, 1.6)
		smoke.Speed = NumberRange.new(1, 2)
		smoke.SpreadAngle = Vector2.new(40, 40)
		smoke.Size = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.6), NumberSequenceKeypoint.new(1, 1.4) })
		smoke.Transparency =
			NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.4), NumberSequenceKeypoint.new(1, 1) })
		smoke.Color = ColorSequence.new(Color3.fromRGB(150, 60, 255))
		smoke.LightEmission = 0.3
		smoke.Parent = root
	end
	if effect == "Crystal" or effect == "Ancient" or effect == "Glitch" or effect == "Gold" then
		local light = Instance.new("PointLight")
		light.Color = condition.color
		light.Range = 8
		light.Brightness = 1.5
		light.Parent = root
	end
	if effect == "Glitch" or effect == "Crystal" then
		local sparkle = Instance.new("ParticleEmitter")
		sparkle.Name = "Sparkle"
		sparkle.Rate = 8
		sparkle.Lifetime = NumberRange.new(0.5, 1)
		sparkle.Speed = NumberRange.new(1, 3)
		sparkle.Size = NumberSequence.new(0.25)
		sparkle.Color = ColorSequence.new(condition.color)
		sparkle.LightEmission = 1
		sparkle.Parent = root
	end
	if effect == "Glitch" then
		model:SetAttribute("Glitch", true)
	end
end

function ModelFactory.treasure(treasureId: string, conditionId: string?): Model
	local treasure = Treasures.ById[treasureId]
	assert(treasure, "Unknown treasure " .. tostring(treasureId))
	local model, root = newModel(treasure.name)
	local material = Enum.Material.SmoothPlastic
	local rarity = Rarities.ById[treasure.rarity]
	if rarity.rank >= 6 then
		material = Enum.Material.Neon
	end
	local builder = SHAPES[treasure.shape] or SHAPES.Orb
	builder(model, root, treasure.color, material)
	applyCondition(model, root, conditionId)
	model:SetAttribute("TreasureId", treasureId)
	model:SetAttribute("Condition", conditionId or "Barnacled")
	return model
end

-- Chests --------------------------------------------------------------------------------------

function ModelFactory.chest(chestId: string): Model
	local chest = Zones.ChestById[chestId]
	assert(chest, "Unknown chest " .. tostring(chestId))
	local model, root = newModel(chest.name)
	local trim = chest.color:Lerp(GOLD, 0.6)
	makePart(model, root, {
		name = "Base",
		size = Vector3.new(2.4, 1.3, 1.6),
		cframe = cf(0, -0.25, 0),
		color = chest.color,
		material = Enum.Material.WoodPlanks,
	})
	local lid = makePart(model, root, {
		name = "Lid",
		shape = Enum.PartType.Cylinder,
		size = Vector3.new(2.4, 1.6, 1.6),
		cframe = cf(0, 0.4, 0),
		color = chest.color:Lerp(Color3.new(1, 1, 1), 0.1),
		material = Enum.Material.WoodPlanks,
	})
	local _ = lid
	for _, x in { -0.9, 0.9 } do
		makePart(model, root, {
			name = "Strap",
			size = Vector3.new(0.25, 1.4, 1.7),
			cframe = cf(x, -0.2, 0),
			color = trim,
			material = Enum.Material.Metal,
		})
	end
	makePart(model, root, {
		name = "Lock",
		size = Vector3.new(0.45, 0.55, 0.2),
		cframe = cf(0, 0.1, -0.85),
		color = trim,
		material = Enum.Material.Metal,
	})
	local light = Instance.new("PointLight")
	light.Name = "Glow"
	light.Color = chest.glow
	light.Range = 10
	light.Brightness = 2
	light.Parent = root
	model:SetAttribute("ChestId", chestId)
	return model
end

-- Kraken -------------------------------------------------------------------------------------

local KRAKEN_SKIN = Color3.fromRGB(120, 40, 90)
local KRAKEN_SUCKER = Color3.fromRGB(240, 170, 190)

-- A single tentacle rising out of the water, `scale` 1 is ~12 studs tall.
function ModelFactory.tentacle(scale: number?): Model
	local s = scale or 1
	local model, root = newModel("Tentacle", Vector3.new(2 * s, 2 * s, 2 * s))
	local height = 0
	local offset = 0
	for i = 1, 7 do
		local radius = (2.2 - i * 0.25) * s
		local segmentHeight = 2 * s
		offset += math.sin(i * 0.7) * 0.5 * s
		makePart(model, root, {
			name = "Segment",
			ellipsoid = true,
			size = Vector3.new(radius, segmentHeight * 1.3, radius),
			cframe = cf(offset, height + segmentHeight / 2, 0, 0, 0, i * 6),
			color = KRAKEN_SKIN,
			material = Enum.Material.SmoothPlastic,
		})
		makePart(model, root, {
			name = "Sucker",
			shape = Enum.PartType.Ball,
			size = Vector3.new(radius * 0.35, radius * 0.35, radius * 0.35),
			cframe = cf(offset, height + segmentHeight / 2, -radius * 0.42),
			color = KRAKEN_SUCKER,
		})
		height += segmentHeight * 0.85
	end
	local hitbox = Instance.new("Part")
	hitbox.Name = "Hitbox"
	hitbox.Anchored = true
	hitbox.CanCollide = false
	hitbox.Transparency = 1
	hitbox.Size = Vector3.new(4 * s, height, 4 * s)
	hitbox.CFrame = root.CFrame * CFrame.new(0, height / 2, 0)
	hitbox.Parent = model
	return model
end

function ModelFactory.kraken(): Model
	local model, root = newModel("Kraken", Vector3.new(4, 4, 4))
	makePart(
		model,
		root,
		{ name = "Head", ellipsoid = true, size = Vector3.new(34, 40, 34), cframe = cf(0, 18, 0), color = KRAKEN_SKIN }
	)
	makePart(model, root, {
		name = "Mantle",
		ellipsoid = true,
		size = Vector3.new(26, 30, 26),
		cframe = cf(0, 36, 4),
		color = KRAKEN_SKIN:Lerp(Color3.new(0, 0, 0), 0.15),
	})
	for _, x in { -8, 8 } do
		makePart(model, root, {
			name = "Eye",
			shape = Enum.PartType.Ball,
			size = Vector3.new(9, 9, 9),
			cframe = cf(x, 22, -14),
			color = Color3.fromRGB(255, 220, 60),
			material = Enum.Material.Neon,
		})
		makePart(
			model,
			root,
			{ name = "Pupil", size = Vector3.new(1.5, 7, 1), cframe = cf(x, 22, -18.3), color = Color3.new(0, 0, 0) }
		)
	end
	for i = 0, 7 do
		local angle = i * 45
		local x = math.sin(math.rad(angle)) * 22
		local z = math.cos(math.rad(angle)) * 22
		local tentacle = ModelFactory.tentacle(2.4)
		tentacle:PivotTo(
			root.CFrame
				* CFrame.new(x, -4, z)
				* CFrame.Angles(0, math.rad(angle), math.rad(if i % 2 == 0 then 12 else -12))
		)
		for _, part in tentacle:GetChildren() do
			if part:IsA("BasePart") and part.Name ~= "Root" then
				part.Parent = model
			end
		end
		tentacle:Destroy()
	end
	return model
end

return ModelFactory
