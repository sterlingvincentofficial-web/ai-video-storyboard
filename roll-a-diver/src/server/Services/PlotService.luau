--[[
	Builds the six player plots (dock, dive slots, vault pedestals, sign) and assigns them to players.
]]

local Players = game:GetService("Players")
local Workspace = game:GetService("Workspace")

local Server = script.Parent.Parent
local Services = require(Server.Registry)
local Layout = require(Server.Layout)
local GameConfig = require(game:GetService("ReplicatedStorage").Shared.Config.Game)

local PlotService = {}

export type SlotParts = {
	pad: Part,
	board: Part,
	home: CFrame,
	entry: Vector3,
	lockLabel: TextLabel,
}

export type PedestalParts = {
	base: Part,
	top: CFrame,
	pad: Part,
	gui: BillboardGui,
	nameLabel: TextLabel,
	incomeLabel: TextLabel,
	collectLabel: TextLabel,
}

export type Plot = {
	index: number,
	cframe: CFrame,
	model: Model,
	divers: Folder,
	treasures: Folder,
	slots: { SlotParts },
	pedestals: { PedestalParts },
	signLabel: TextLabel,
	owner: Player?,
}

local plots: { Plot } = {}
local plotByPlayer: { [Player]: Plot } = {}

local WOOD = Color3.fromRGB(160, 110, 65)
local WOOD_DARK = Color3.fromRGB(115, 75, 45)
local SLOT_OPEN = Color3.fromRGB(60, 200, 220)
local SLOT_LOCKED = Color3.fromRGB(70, 70, 80)
local PAD_ON = Color3.fromRGB(70, 230, 90)
local PAD_LOCKED = Color3.fromRGB(80, 80, 90)

local function part(parent: Instance, props: { [string]: any }): Part
	local p = Instance.new("Part")
	p.Anchored = true
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	for key, value in props do
		(p :: any)[key] = value
	end
	p.Parent = parent
	return p
end

local function label(parent: Instance, props: { [string]: any }): TextLabel
	local l = Instance.new("TextLabel")
	l.BackgroundTransparency = 1
	l.Font = Enum.Font.FredokaOne
	l.TextScaled = true
	l.TextColor3 = Color3.new(1, 1, 1)
	for key, value in props do
		(l :: any)[key] = value
	end
	local stroke = Instance.new("UIStroke")
	stroke.Thickness = 2
	stroke.Parent = l
	l.Parent = parent
	return l
end

local function buildPlot(index: number, plotCFrame: CFrame): Plot
	local model = Instance.new("Model")
	model.Name = "Plot" .. index
	model:SetAttribute("PlotIndex", index)

	local function at(localCFrame: CFrame): CFrame
		return plotCFrame * localCFrame
	end

	-- deck and supports
	local deck = part(model, {
		Name = "Deck",
		Size = Layout.DeckSize,
		CFrame = at(Layout.DeckCenter),
		Color = WOOD,
		Material = Enum.Material.WoodPlanks,
	})
	model.PrimaryPart = deck
	for _, x in { -60, -30, 0, 30, 60 } do
		for _, z in { -40, -12, 16 } do
			part(model, {
				Name = "Pillar",
				Shape = Enum.PartType.Cylinder,
				Size = Vector3.new(30, 2.4, 2.4),
				CFrame = at(CFrame.new(x, Layout.DeckTop - 16, z) * CFrame.Angles(0, 0, math.rad(90))),
				Color = WOOD_DARK,
				Material = Enum.Material.Wood,
			})
		end
	end
	-- side and back railings
	for _, x in { -64.5, 64.5 } do
		part(model, {
			Name = "Rail",
			Size = Vector3.new(1, 3, 64),
			CFrame = at(CFrame.new(x, Layout.DeckTop + 1.5, -12)),
			Color = WOOD_DARK,
			Material = Enum.Material.Wood,
		})
	end
	part(model, {
		Name = "Rail",
		Size = Vector3.new(130, 3, 1),
		CFrame = at(CFrame.new(0, Layout.DeckTop + 1.5, -43.5)),
		Color = WOOD_DARK,
		Material = Enum.Material.Wood,
	})

	-- owner sign
	local sign = part(model, {
		Name = "Sign",
		Size = Vector3.new(44, 11, 1),
		CFrame = at(CFrame.new(0, Layout.DeckTop + 10, -45) * CFrame.Angles(0, math.pi, 0)),
		Color = Color3.fromRGB(35, 55, 100),
		Material = Enum.Material.SmoothPlastic,
	})
	for _, x in { -20, 20 } do
		part(model, {
			Name = "SignPost",
			Size = Vector3.new(1.5, 12, 1.5),
			CFrame = at(CFrame.new(x, Layout.DeckTop + 5, -45)),
			Color = WOOD_DARK,
			Material = Enum.Material.Wood,
		})
	end
	local signGui = Instance.new("SurfaceGui")
	signGui.Face = Enum.NormalId.Front
	signGui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	signGui.PixelsPerStud = 25
	signGui.Parent = sign
	local signLabel = label(signGui, {
		Size = UDim2.fromScale(0.94, 0.8),
		Position = UDim2.fromScale(0.03, 0.1),
		Text = "Empty Dock",
		TextColor3 = Color3.fromRGB(255, 230, 90),
	})

	-- dive slots
	local slots: { SlotParts } = {}
	for slot = 1, GameConfig.MaxDiveSlots do
		local home = Layout.slotHome(slot)
		local x = home.Position.X
		local pad = part(model, {
			Name = "SlotPad" .. slot,
			Size = Vector3.new(8, 0.3, 7),
			CFrame = at(CFrame.new(x, Layout.DeckTop + 0.15, 14)),
			Color = SLOT_LOCKED,
			Material = Enum.Material.SmoothPlastic,
		})
		local board = part(model, {
			Name = "DivingBoard" .. slot,
			Size = Vector3.new(3, 0.5, 10),
			CFrame = at(CFrame.new(x, Layout.DeckTop + 0.5, 24)),
			Color = Color3.fromRGB(235, 235, 240),
			Material = Enum.Material.SmoothPlastic,
			CanCollide = false,
		})
		local lockGui = Instance.new("BillboardGui")
		lockGui.Size = UDim2.fromOffset(120, 36)
		lockGui.StudsOffset = Vector3.new(0, 3, 0)
		lockGui.MaxDistance = 70
		lockGui.AlwaysOnTop = false
		lockGui.Parent = pad
		local lockLabel = label(lockGui, {
			Size = UDim2.fromScale(1, 1),
			Text = "🔒 Upgrade",
			TextColor3 = Color3.fromRGB(200, 200, 210),
		})
		table.insert(slots, {
			pad = pad,
			board = board,
			home = plotCFrame * home,
			entry = (plotCFrame * CFrame.new(Layout.slotEntry(slot))).Position,
			lockLabel = lockLabel,
		})
	end

	-- vault pedestals
	local pedestals: { PedestalParts } = {}
	for i = 1, GameConfig.MaxPedestals do
		local pos = Layout.pedestalPosition(i)
		local base = part(model, {
			Name = "Pedestal" .. i,
			Shape = Enum.PartType.Cylinder,
			Size = Vector3.new(3, 4.5, 4.5),
			CFrame = at(CFrame.new(pos + Vector3.new(0, 1.5, 0)) * CFrame.Angles(0, 0, math.rad(90))),
			Color = PAD_LOCKED,
			Material = Enum.Material.Marble,
		})
		local pad = part(model, {
			Name = "CollectPad" .. i,
			Size = Vector3.new(5, 0.3, 3),
			CFrame = at(CFrame.new(pos + Vector3.new(0, 0.15, 5))),
			Color = PAD_LOCKED,
			Material = Enum.Material.Neon,
		})
		local gui = Instance.new("BillboardGui")
		gui.Size = UDim2.fromOffset(170, 78)
		gui.StudsOffset = Vector3.new(0, 7.5, 0)
		gui.MaxDistance = 60
		gui.Parent = base
		local nameLabel = label(gui, { Size = UDim2.fromScale(1, 0.34), Text = "" })
		local incomeLabel = label(gui, {
			Size = UDim2.fromScale(1, 0.3),
			Position = UDim2.fromScale(0, 0.34),
			Text = "",
			TextColor3 = Color3.fromRGB(120, 255, 140),
		})
		local collectLabel = label(gui, {
			Size = UDim2.fromScale(1, 0.34),
			Position = UDim2.fromScale(0, 0.66),
			Text = "",
			TextColor3 = Color3.fromRGB(255, 230, 90),
		})
		pad.Touched:Connect(function(hit)
			local character = hit.Parent
			local player = character and Players:GetPlayerFromCharacter(character)
			local plot = plots[index]
			if player and plot and plot.owner == player then
				-- touches can be faked by exploiters, so the character must really be at the pad
				local root = character and character:FindFirstChild("HumanoidRootPart")
				if root and root:IsA("BasePart") and (root.CFrame.Position - pad.CFrame.Position).Magnitude <= 14 then
					Services.VaultService.CollectPedestal(player, i)
				end
			end
		end)
		table.insert(pedestals, {
			base = base,
			top = plotCFrame * CFrame.new(pos + Vector3.new(0, 5.4, 0)),
			pad = pad,
			gui = gui,
			nameLabel = nameLabel,
			incomeLabel = incomeLabel,
			collectLabel = collectLabel,
		})
	end

	local divers = Instance.new("Folder")
	divers.Name = "Divers"
	divers.Parent = model
	local treasures = Instance.new("Folder")
	treasures.Name = "Treasures"
	treasures.Parent = model

	model.Parent = Workspace:FindFirstChild("Plots")

	return {
		index = index,
		cframe = plotCFrame,
		model = model,
		divers = divers,
		treasures = treasures,
		slots = slots,
		pedestals = pedestals,
		signLabel = signLabel,
		owner = nil,
	}
end

function PlotService.Init()
	local folder = Instance.new("Folder")
	folder.Name = "Plots"
	folder.Parent = Workspace
	for index, plotCFrame in Layout.Plots do
		plots[index] = buildPlot(index, plotCFrame)
		PlotService.UpdateLocks(plots[index], 0, 0)
	end
end

function PlotService.Assign(player: Player): Plot?
	for _, plot in plots do
		if not plot.owner then
			plot.owner = player
			plotByPlayer[player] = plot
			plot.signLabel.Text = player.DisplayName .. "'s Dock"
			plot.model:SetAttribute("OwnerId", player.UserId)
			player:SetAttribute("Plot", plot.index)
			return plot
		end
	end
	return nil
end

function PlotService.Release(player: Player)
	local plot = plotByPlayer[player]
	if not plot then
		return
	end
	plotByPlayer[player] = nil
	plot.owner = nil
	plot.signLabel.Text = "Empty Dock"
	plot.model:SetAttribute("OwnerId", nil)
	plot.divers:ClearAllChildren()
	plot.treasures:ClearAllChildren()
	PlotService.UpdateLocks(plot, 0, 0)
	for _, pedestal in plot.pedestals do
		pedestal.nameLabel.Text = ""
		pedestal.incomeLabel.Text = ""
		pedestal.collectLabel.Text = ""
	end
end

function PlotService.Get(player: Player): Plot?
	return plotByPlayer[player]
end

function PlotService.SpawnCFrame(plot: Plot): CFrame
	return plot.cframe * Layout.Spawn
end

-- Colours the unlocked slots/pedestals and greys out the rest.
function PlotService.UpdateLocks(plot: Plot, slotCount: number, pedestalCount: number)
	for slot, parts in plot.slots do
		local open = slot <= slotCount
		parts.pad.Color = if open then SLOT_OPEN else SLOT_LOCKED
		parts.pad.Transparency = if open then 0 else 0.3
		parts.board.Transparency = if open then 0 else 0.6
		parts.lockLabel.Visible = not open and plot.owner ~= nil
	end
	for i, parts in plot.pedestals do
		local open = i <= pedestalCount
		parts.base.Color = if open then Color3.fromRGB(235, 235, 240) else PAD_LOCKED
		parts.base.Transparency = if open then 0 else 0.5
		parts.pad.Color = if open then PAD_ON else PAD_LOCKED
		parts.pad.Transparency = if open then 0.1 else 0.6
		if not open then
			parts.nameLabel.Text = if plot.owner then "🔒" else ""
			parts.incomeLabel.Text = ""
			parts.collectLabel.Text = ""
		end
	end
end

function PlotService.All(): { Plot }
	return plots
end

return PlotService
