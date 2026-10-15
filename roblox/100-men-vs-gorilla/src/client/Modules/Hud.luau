-- The HUD: wave pill + countdown, Banana Stash health, boss bar, cash counter, army count,
-- the unit hotbar with a placement ghost, and the tap-a-man panel for upgrading/selling.
-- Styled after the reference game: flat mint boxes, near-black number boxes, square cards.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")
local UserInputService = game:GetService("UserInputService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local EnemyDefs = require(Shared.Config.Enemies)
local MapData = require(Shared.MapData)
local Net = require(Shared.Net)
local PathUtil = require(Shared.PathUtil)
local Units = require(Shared.Config.Units)
local Fx = require(script.Parent.Fx)
local Juice = require(script.Parent.Juice)
local Music = require(script.Parent.Music)

local Hud = {}

local player = Players.LocalPlayer
local camera = workspace.CurrentCamera
local state = ReplicatedStorage:WaitForChild("GameState")
local unitsFolder = workspace:WaitForChild("Units")
local PATHS = PathUtil.fromMapData(MapData)

-- Colours sampled from the reference game's HUD: flat mint boxes with a light rim, near-black
-- boxes with mint numbers, an orange $ tile, a segmented green health bar, square cards.
local MINT = Color3.fromRGB(96, 244, 151)
local MINT_RIM = Color3.fromRGB(139, 250, 175)
local INK = Color3.fromRGB(5, 20, 13)
local NOTCH = Color3.fromRGB(20, 32, 22)
local ORANGE = Color3.fromRGB(229, 171, 66)
local GOLD = Color3.fromRGB(255, 214, 64)
local RED = Color3.fromRGB(255, 84, 64)
local WHITE = Color3.new(1, 1, 1)
local GREEN = MINT
local FONT = Enum.Font.GothamBlack
local FONT_UI = Enum.Font.GothamBold

local gui = Instance.new("ScreenGui")
gui.Name = "Hud"
gui.ResetOnSpawn = false
gui.IgnoreGuiInset = true
gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
gui.Parent = player:WaitForChild("PlayerGui")

local function make(class: string, props: { [string]: any }): any
	local inst = Instance.new(class)
	if inst:IsA("GuiObject") then
		inst.BorderSizePixel = 0
	end
	for k, v in props do
		if k ~= "Parent" then
			(inst :: any)[k] = v
		end
	end
	inst.Parent = props.Parent
	return inst
end

-- Everything sits in one root scaled to the screen, laid out for 1280x720 (so a phone gets the
-- same proportions as the reference instead of oversized boxes).
local root = make("Frame", { Size = UDim2.fromScale(1, 1), Position = UDim2.fromScale(0.5, 0.5), AnchorPoint = Vector2.new(0.5, 0.5),
	BackgroundTransparency = 1, Parent = gui })
local rootScale = make("UIScale", { Parent = root })
local function fitToScreen()
	local v = camera.ViewportSize
	local s = math.clamp(math.min(v.X / 1280, v.Y / 720), 0.55, 1.6)
	rootScale.Scale = s
	root.Size = UDim2.fromScale(1 / s, 1 / s)
end
camera:GetPropertyChangedSignal("ViewportSize"):Connect(fitToScreen)
fitToScreen()

-- a box's light rim (or any border colour)
local function rim(parent: Instance, color: Color3?, thickness: number?): UIStroke
	return make("UIStroke", { Thickness = thickness or 2, Color = color or MINT_RIM,
		ApplyStrokeMode = Enum.ApplyStrokeMode.Border, Parent = parent })
end

-- a dark outline around text (captions over the world)
local function outline(label: Instance, thickness: number?): UIStroke
	return make("UIStroke", { Thickness = thickness or 1.5, Color = INK, Parent = label })
end

-- A centred horizontal row; its boxes size themselves to their text.
local function row(pos: UDim2, height: number, padding: number?): Frame
	local f = make("Frame", { Size = UDim2.new(1, 0, 0, height), Position = pos, BackgroundTransparency = 1, Parent = root })
	make("UIListLayout", { FillDirection = Enum.FillDirection.Horizontal, HorizontalAlignment = Enum.HorizontalAlignment.Center,
		VerticalAlignment = Enum.VerticalAlignment.Center, Padding = UDim.new(0, padding or 0),
		SortOrder = Enum.SortOrder.LayoutOrder, Parent = f })
	return f
end

-- A text box that grows to fit its text; minWidth keeps short labels from shrinking.
local function chip(parent: Instance, text: string, bg: Color3, fg: Color3, textSize: number, height: number,
	order: number, minWidth: number?): TextLabel
	local l = make("TextLabel", { AutomaticSize = Enum.AutomaticSize.X, Size = UDim2.fromOffset(minWidth or 0, height),
		BackgroundColor3 = bg, Text = text, Font = FONT, TextSize = textSize, TextColor3 = fg, LayoutOrder = order, Parent = parent })
	make("UIPadding", { PaddingLeft = UDim.new(0, 14), PaddingRight = UDim.new(0, 14), Parent = l })
	return l
end

-- The reference's health bar: black frame, glossy green fill, dark notches every segment.
local function segmentBar(size: UDim2, pos: UDim2, top: Color3, bottom: Color3, segments: number): (Frame, Frame, UIStroke)
	local frame = make("Frame", { Size = size, Position = pos, AnchorPoint = Vector2.new(0.5, 0), BackgroundColor3 = NOTCH, Parent = root })
	local border = rim(frame, INK, 3)
	local fill = make("Frame", { Size = UDim2.fromScale(1, 1), BackgroundColor3 = WHITE, Parent = frame })
	make("UIGradient", { Rotation = 90, Color = ColorSequence.new(top, bottom), Parent = fill })
	for i = 1, segments - 1 do
		make("Frame", { Size = UDim2.new(0, 3, 0.55, 0), Position = UDim2.fromScale(i / segments, 0), AnchorPoint = Vector2.new(0.5, 0),
			BackgroundColor3 = NOTCH, ZIndex = 2, Parent = frame })
	end
	return frame, fill, border
end

-- small white caption above a box, like the reference's "UPGRADES" / "ABILITIES"
local function caption(parent: Instance, text: string, width: number): TextLabel
	local l = make("TextLabel", { Size = UDim2.fromOffset(width, 16), Position = UDim2.fromOffset(0, -20), BackgroundTransparency = 1,
		Text = text, Font = FONT_UI, TextSize = 14, TextColor3 = WHITE, TextXAlignment = Enum.TextXAlignment.Left, Parent = parent })
	outline(l, 1.5)
	return l
end

-- ---------------------------------------------------------------- top: wave, objective, stash, boss

local waveRow = row(UDim2.fromOffset(0, 8), 48)
local wavePill = chip(waveRow, "GET READY", MINT, INK, 34, 48, 1, 210)
rim(wavePill)

local objRow = row(UDim2.fromOffset(0, 70), 50)
local objLabel = chip(objRow, "", MINT, INK, 30, 50, 1)
rim(objLabel)
local objCount = chip(objRow, "", INK, MINT, 30, 50, 2, 90)

local stashFrame, stashFill, stashBorder = segmentBar(UDim2.fromOffset(300, 24), UDim2.new(0.5, 0, 0, 146),
	Color3.fromRGB(133, 216, 117), Color3.fromRGB(33, 165, 3), 10)
caption(stashFrame, "BANANA STASH", 300)

local bossFrame, bossFill = segmentBar(UDim2.fromOffset(460, 26), UDim2.new(0.5, 0, 0, 200),
	Color3.fromRGB(255, 132, 108), Color3.fromRGB(186, 24, 18), 20)
bossFrame.Visible = false
local bossName = caption(bossFrame, "", 460)
bossName.TextSize = 18
bossName.Font = FONT

-- ---------------------------------------------------------------- bottom: cash, men, hotbar

local cashRow = row(UDim2.new(0, 0, 1, -166), 46, 12)
local cashFrame = make("Frame", { AutomaticSize = Enum.AutomaticSize.X, Size = UDim2.fromOffset(0, 46), BackgroundTransparency = 1,
	LayoutOrder = 1, Parent = cashRow })
make("UIListLayout", { FillDirection = Enum.FillDirection.Horizontal, SortOrder = Enum.SortOrder.LayoutOrder, Parent = cashFrame })
local dollar = make("TextLabel", { Size = UDim2.fromOffset(42, 46), BackgroundColor3 = ORANGE, Text = "$", Font = FONT, TextSize = 34,
	TextColor3 = INK, LayoutOrder = 1, Parent = cashFrame })
local cashLabel = chip(cashFrame, "0", INK, WHITE, 32, 46, 2, 60)
local cashScale = make("UIScale", { Parent = cashFrame })
local menFrame = make("Frame", { AutomaticSize = Enum.AutomaticSize.X, Size = UDim2.fromOffset(0, 34), BackgroundTransparency = 1,
	LayoutOrder = 2, Parent = cashRow })
make("UIListLayout", { FillDirection = Enum.FillDirection.Horizontal, VerticalAlignment = Enum.VerticalAlignment.Center,
	SortOrder = Enum.SortOrder.LayoutOrder, Parent = menFrame })
chip(menFrame, "MEN", MINT, INK, 20, 34, 1)
local menLabel = chip(menFrame, "0/100", INK, MINT, 20, 34, 2)

Juice.cashScreenPos = function(): Vector2
	local p, s = dollar.AbsolutePosition, dollar.AbsoluteSize
	return Vector2.new(p.X + s.X / 2, p.Y + s.Y / 2)
end
Juice.onCoinArrive = function(_amount: number)
	cashScale.Scale = 1.18
	TweenService:Create(cashScale, TweenInfo.new(0.15, Enum.EasingStyle.Back), { Scale = 1 }):Play()
end

local toast = make("TextLabel", { Size = UDim2.fromOffset(520, 26), Position = UDim2.new(0.5, 0, 1, -204),
	AnchorPoint = Vector2.new(0.5, 0), BackgroundTransparency = 1, Text = "", Font = FONT_UI, TextSize = 22,
	TextColor3 = RED, TextTransparency = 1, Parent = root })
local toastStroke = outline(toast, 2)
toastStroke.Transparency = 1
local function showToast(text: string, color: Color3?)
	toast.Text = text
	toast.TextColor3 = color or RED
	toast.TextTransparency = 0
	toastStroke.Transparency = 0
	local token = {}
	Hud._toast = token
	task.delay(1.4, function()
		if Hud._toast == token then
			TweenService:Create(toast, TweenInfo.new(0.3), { TextTransparency = 1 }):Play()
			TweenService:Create(toastStroke, TweenInfo.new(0.3), { Transparency = 1 }):Play()
		end
	end)
end
Hud.toast = showToast

-- music on/off (left, under Roblox's top-bar buttons: clear of the player list and the mobile
-- thumbstick and jump button; M on a keyboard). Only shown once the music has been uploaded.
local musicButton = make("TextButton", { Size = UDim2.fromOffset(118, 34), Position = UDim2.fromOffset(16, 110),
	BackgroundColor3 = MINT, Text = "MUSIC ON", Font = FONT, TextSize = 18,
	TextColor3 = INK, Visible = Music.hasMusic(), Parent = root })
rim(musicButton)
local function toggleMusic()
	Music.setEnabled(not Music.enabled)
	musicButton.Text = if Music.enabled then "MUSIC ON" else "MUSIC OFF"
	musicButton.BackgroundColor3 = if Music.enabled then MINT else INK
	musicButton.TextColor3 = if Music.enabled then INK else MINT
	Juice.sound("Ui")
end
musicButton.Activated:Connect(toggleMusic)

-- hotbar: one card per unit, like the reference's item cards (index badge, portrait, price, name strip)
local order = {}
for id, def in Units do
	table.insert(order, { id = id, def = def })
end
table.sort(order, function(a, b)
	return a.def.Order < b.def.Order
end)

local CARD_W, CARD_H = 84, 106
local bar = row(UDim2.new(0, 0, 1, -(CARD_H + 10)), CARD_H, 8)
local slots: { [string]: { button: TextButton, rim: UIStroke, cost: TextLabel, price: number } } = {}
local selected: string? = nil

local function setSelected(id: string?)
	selected = id
	for sid, slot in slots do
		local on = sid == id
		slot.rim.Color = if on then GOLD else MINT_RIM
		slot.rim.Thickness = if on then 4 else 2
		slot.button.BackgroundColor3 = if on then Color3.fromRGB(150, 252, 186) else MINT
	end
	Hud.onSelectUnit(id)
end

-- The unit's own figure as the card picture, once the server has built the army rigs.
local function fillPortrait(vp: ViewportFrame, unitId: string, fallback: TextLabel)
	local rigs = ReplicatedStorage:WaitForChild("MenRigs", 20)
	local template = rigs and rigs:WaitForChild(`{unitId}_L1`, 10)
	if not template then
		return
	end
	local model = template:Clone()
	model.Parent = vp
	local h = model:GetAttribute("Height") or 6
	local cam = make("Camera", { FieldOfView = 30, Parent = vp })
	cam.CFrame = CFrame.lookAt(Vector3.new(h * 0.42, h * 0.72, -h * 1.45), Vector3.new(0, h * 0.56, 0))
	vp.CurrentCamera = cam
	fallback.Visible = false
end

for i, entry in order do
	local b = make("TextButton", { Size = UDim2.fromOffset(CARD_W, CARD_H), BackgroundColor3 = MINT, Text = "", AutoButtonColor = true,
		LayoutOrder = i, Parent = bar })
	local border = rim(b, MINT_RIM, 2)
	local vp = make("ViewportFrame", { Size = UDim2.fromOffset(CARD_W, CARD_H - 20), BackgroundTransparency = 1,
		Ambient = Color3.fromRGB(190, 196, 192), LightColor = WHITE, LightDirection = Vector3.new(0.4, -1, 0.8), Parent = b })
	local fallback = make("TextLabel", { Size = UDim2.new(1, -8, 0, 40), Position = UDim2.fromOffset(4, 24), BackgroundTransparency = 1,
		Text = string.upper(entry.def.DisplayName), Font = FONT, TextScaled = true, TextWrapped = true, TextColor3 = INK, Parent = b })
	make("UITextSizeConstraint", { MaxTextSize = 18, Parent = fallback })
	make("TextLabel", { Size = UDim2.fromOffset(22, 22), Position = UDim2.fromOffset(4, 4), BackgroundColor3 = INK,
		Text = tostring(i), Font = FONT, TextSize = 16, TextColor3 = WHITE, ZIndex = 3, Parent = b })
	local cost = make("TextLabel", { Size = UDim2.new(1, -8, 0, 20), Position = UDim2.new(0, 5, 1, -42), BackgroundTransparency = 1,
		Text = `${entry.def.Levels[1].Cost}`, Font = FONT, TextSize = 19, TextColor3 = ORANGE,
		TextXAlignment = Enum.TextXAlignment.Left, ZIndex = 3, Parent = b })
	outline(cost, 1.5)
	local strip = make("TextLabel", { Size = UDim2.new(1, 0, 0, 20), Position = UDim2.new(0, 0, 1, -20), BackgroundColor3 = INK,
		Text = string.upper(entry.def.DisplayName), Font = FONT_UI, TextScaled = true, TextColor3 = WHITE, ZIndex = 3, Parent = b })
	make("UIPadding", { PaddingLeft = UDim.new(0, 4), PaddingRight = UDim.new(0, 4), PaddingTop = UDim.new(0, 3),
		PaddingBottom = UDim.new(0, 3), Parent = strip })
	make("UITextSizeConstraint", { MaxTextSize = 13, Parent = strip })
	task.spawn(fillPortrait, vp, entry.id, fallback)
	b.Activated:Connect(function()
		Juice.sound("Ui")
		setSelected(if selected == entry.id then nil else entry.id)
	end)
	slots[entry.id] = { button = b, rim = border, cost = cost, price = entry.def.Levels[1].Cost }
end

local shownCash = 0
RunService.RenderStepped:Connect(function(dt)
	local actual = player:GetAttribute("Cash") or 0
	shownCash += (actual - shownCash) * math.min(1, dt * 8)
	if math.abs(actual - shownCash) < 0.5 then
		shownCash = actual
	end
	cashLabel.Text = tostring(math.floor(shownCash + 0.5))
	menLabel.Text = `{player:GetAttribute("Units") or 0}/100`
	for _, slot in slots do
		slot.cost.TextColor3 = if actual >= slot.price then ORANGE else RED
	end
end)

-- ---------------------------------------------------------------- placement ghost

local ghostRing = Fx.part({ Shape = Enum.PartType.Cylinder, Size = Vector3.new(0.15, 2, 2), Material = Enum.Material.Neon,
	Transparency = 0.6 })
local ghostBody = Fx.part({ Size = Vector3.new(2, 5, 1.2), Transparency = 0.45, Material = Enum.Material.Neon })
ghostRing.Parent = nil -- shown only while placing (Fx.part parents to ClientFx by default)
ghostBody.Parent = nil
local ghostPos: Vector3? = nil
local ghostOk = false

local raycastParams = RaycastParams.new()
raycastParams.FilterType = Enum.RaycastFilterType.Include

local function mapRoot(): Instance
	return workspace:FindFirstChild("Map") or workspace
end

-- A tap's position excludes the top-bar inset (ScreenPointToRay); the mouse location includes it.
local function screenRay(screen: Vector2?): Ray
	if screen then
		return camera:ScreenPointToRay(screen.X, screen.Y)
	end
	local p = UserInputService:GetMouseLocation()
	return camera:ViewportPointToRay(p.X, p.Y)
end

local function pointerRay(screen: Vector2?): RaycastResult?
	local ray = screenRay(screen)
	raycastParams.FilterDescendantsInstances = { mapRoot() }
	return workspace:Raycast(ray.Origin, ray.Direction * 600, raycastParams)
end

local function localProblem(pos: Vector3, hit: RaycastResult?): string?
	local area = MapData.BuildArea
	if pos.X < area.Min.X or pos.X > area.Max.X or pos.Z < area.Min.Z or pos.Z > area.Max.Z then
		return "Out of bounds"
	end
	if not hit or not (hit.Instance.Name:match("^Sand%d") or hit.Instance.Name:match("^Plaza%d")) or math.abs(hit.Position.Y) > 0.6 then
		return "Can't stand there"
	end
	if PathUtil.distanceToPaths(PATHS, pos) < MapData.PathWidth / 2 + 1 then
		return "Too close to the path"
	end
	local base = Vector3.new(MapData.Base.X, 0, MapData.Base.Z)
	if (Vector3.new(pos.X, 0, pos.Z) - base).Magnitude < 5 then
		return "That's the Banana Stash"
	end
	for _, m in unitsFolder:GetChildren() do
		if m:IsA("Model") then
			local p = m:GetPivot().Position
			if (Vector3.new(p.X, 0, p.Z) - Vector3.new(pos.X, 0, pos.Z)).Magnitude < 2.8 then
				return "Too close to another man"
			end
		end
	end
	return nil
end

local function updateGhost(screen: Vector2?)
	if not selected then
		return
	end
	local hit = pointerRay(screen)
	if not hit then
		ghostPos = nil
		ghostRing.Parent = nil
		ghostBody.Parent = nil
		return
	end
	local pos = Vector3.new(hit.Position.X, 0, hit.Position.Z)
	ghostPos = pos
	ghostOk = localProblem(pos, hit) == nil
	local range = Units[selected].Levels[1].Range
	local color = if ghostOk then Color3.fromRGB(120, 255, 120) else Color3.fromRGB(255, 80, 80)
	ghostRing.Color = color
	ghostBody.Color = color
	ghostRing.Size = Vector3.new(0.15, range * 2, range * 2)
	ghostRing.CFrame = CFrame.new(pos + Vector3.new(0, 0.15, 0)) * CFrame.Angles(0, 0, math.pi / 2)
	ghostBody.CFrame = CFrame.new(pos + Vector3.new(0, 2.6, 0))
	ghostRing.Parent = Fx.folder
	ghostBody.Parent = Fx.folder
end

Hud.onSelectUnit = function(id: string?)
	if not id then
		ghostRing.Parent = nil
		ghostBody.Parent = nil
	else
		Hud.closePanel()
		updateGhost()
	end
end

local function tryPlace(screen: Vector2?)
	updateGhost(screen)
	if not (selected and ghostPos) then
		return
	end
	local unitId = selected
	local ok, msg = Net.func("PlaceUnit"):InvokeServer(unitId, ghostPos)
	if not ok then
		Juice.sound("Deny")
		showToast(msg or "Can't place there")
	end
end

-- ---------------------------------------------------------------- unit panel

local panel = make("Frame", { Size = UDim2.fromOffset(260, 232), Position = UDim2.new(1, -16, 0.5, 0),
	AnchorPoint = Vector2.new(1, 0.5), BackgroundColor3 = INK, BackgroundTransparency = 0.08, Visible = false, Parent = root })
rim(panel, MINT, 2)
caption(panel, "UPGRADES", 260)
local panelTitle = make("TextLabel", { Size = UDim2.new(1, 0, 0, 40), BackgroundColor3 = MINT, Font = FONT, TextScaled = true,
	TextColor3 = INK, Text = "", Parent = panel })
make("UIPadding", { PaddingLeft = UDim.new(0, 10), PaddingRight = UDim.new(0, 10), PaddingTop = UDim.new(0, 7),
	PaddingBottom = UDim.new(0, 7), Parent = panelTitle })
local panelInfo = make("TextLabel", { Size = UDim2.new(1, -24, 0, 74), Position = UDim2.fromOffset(12, 50), BackgroundTransparency = 1,
	Font = FONT_UI, TextSize = 16, TextWrapped = true, TextColor3 = WHITE, TextXAlignment = Enum.TextXAlignment.Left,
	TextYAlignment = Enum.TextYAlignment.Top, Text = "", Parent = panel })
local upButton = make("TextButton", { Size = UDim2.new(1, -24, 0, 42), Position = UDim2.fromOffset(12, 130),
	BackgroundColor3 = MINT, Font = FONT, TextSize = 22, TextColor3 = INK, Text = "UPGRADE", Parent = panel })
rim(upButton)
local sellButton = make("TextButton", { Size = UDim2.new(1, -24, 0, 36), Position = UDim2.fromOffset(12, 182),
	BackgroundColor3 = ORANGE, Font = FONT, TextSize = 20, TextColor3 = INK, Text = "SELL", Parent = panel })
local panelRing = Fx.part({ Shape = Enum.PartType.Cylinder, Size = Vector3.new(0.15, 2, 2), Material = Enum.Material.Neon,
	Color = Color3.fromRGB(255, 220, 80), Transparency = 0.65 })
panelRing.Parent = nil -- shown while a man's panel is open
local panelUid: number? = nil

local function refreshPanel()
	local model = panelUid and unitsFolder:FindFirstChild(tostring(panelUid))
	if not model then
		panel.Visible = false
		panelRing.Parent = nil
		return
	end
	local unitId, level = model:GetAttribute("Unit"), model:GetAttribute("Level")
	local def = Units[unitId]
	local cur = def.Levels[level]
	local nxt = def.Levels[level + 1]
	panelTitle.Text = string.upper(`{def.DisplayName}  LV {level}`)
	local stats = if cur.Damage > 0 then `DMG {cur.Damage}  RANGE {cur.Range}\n` else ""
	panelInfo.Text = stats .. def.Blurb
	upButton.Text = if nxt then `UPGRADE  ${nxt.Cost}` else "MAX LEVEL"
	upButton.BackgroundColor3 = if nxt then MINT else Color3.fromRGB(70, 80, 75)
	upButton.TextColor3 = if nxt then INK else WHITE
	local spent = 0
	for i = 1, level do
		spent += def.Levels[i].Cost
	end
	sellButton.Text = `SELL  +${math.floor(spent * 0.6)}`
	local pos = model:GetPivot().Position
	panelRing.Size = Vector3.new(0.15, cur.Range * 2, cur.Range * 2)
	panelRing.CFrame = CFrame.new(pos.X, 0.15, pos.Z) * CFrame.Angles(0, 0, math.pi / 2)
	panelRing.Parent = Fx.folder
	panel.Visible = true
end

function Hud.closePanel()
	panelUid = nil
	panel.Visible = false
	panelRing.Parent = nil
end

local function openPanel(uid: number)
	panelUid = uid
	refreshPanel()
end

upButton.Activated:Connect(function()
	if not panelUid then
		return
	end
	local ok, msg = Net.func("UpgradeUnit"):InvokeServer(panelUid)
	if not ok then
		Juice.sound("Deny")
		showToast(msg or "Can't upgrade")
	end
	task.wait(0.15)
	refreshPanel()
end)
sellButton.Activated:Connect(function()
	if not panelUid then
		return
	end
	local uid = panelUid
	Hud.closePanel()
	Net.func("SellUnit"):InvokeServer(uid)
end)

local function unitUnder(screen: Vector2?): number?
	local ray = screenRay(screen)
	local params = RaycastParams.new()
	params.FilterType = Enum.RaycastFilterType.Include
	params.FilterDescendantsInstances = { unitsFolder }
	local hit = workspace:Raycast(ray.Origin, ray.Direction * 600, params)
	local model = hit and hit.Instance:FindFirstAncestorOfClass("Model")
	while model and model.Parent ~= unitsFolder do
		model = model:FindFirstAncestorOfClass("Model")
	end
	return model and model:GetAttribute("Uid")
end

-- ---------------------------------------------------------------- input

UserInputService.InputChanged:Connect(function(input)
	if selected and gui.Enabled and input.UserInputType == Enum.UserInputType.MouseMovement then
		updateGhost()
	end
end)

UserInputService.InputBegan:Connect(function(input, processed)
	if processed or not gui.Enabled then -- the intro hides the HUD: no placing men mid-cutscene
		return
	end
	if input.UserInputType == Enum.UserInputType.Keyboard then
		local n = input.KeyCode.Value - Enum.KeyCode.One.Value + 1
		if n >= 1 and n <= #order then
			setSelected(if selected == order[n].id then nil else order[n].id)
		elseif input.KeyCode == Enum.KeyCode.Q or input.KeyCode == Enum.KeyCode.Escape then
			setSelected(nil)
			Hud.closePanel()
		elseif input.KeyCode == Enum.KeyCode.M and musicButton.Visible then
			toggleMusic()
		end
		return
	end
	local isClick = input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch
	if not isClick then
		if input.UserInputType == Enum.UserInputType.MouseButton2 then
			setSelected(nil)
		end
		return
	end
	local screen = if input.UserInputType == Enum.UserInputType.Touch then Vector2.new(input.Position.X, input.Position.Y) else nil
	if selected then
		tryPlace(screen)
	else
		local uid = unitUnder(screen)
		if uid then
			Juice.sound("Ui")
			openPanel(uid)
		else
			Hud.closePanel()
		end
	end
end)

-- ---------------------------------------------------------------- state + events

local bossId: number? = nil
RunService.RenderStepped:Connect(function()
	local phase = state:GetAttribute("Phase")
	local wave = state:GetAttribute("Wave") or 0
	local total = state:GetAttribute("TotalWaves") or 100
	if phase == "Intro" then
		wavePill.Text = "GET READY"
		objLabel.Text, objCount.Text = "THE SQUAD IS LANDING", "..."
	elseif phase == "Intermission" then
		local left = math.max(0, math.ceil((state:GetAttribute("NextWaveAt") or 0) - workspace:GetServerTimeNow()))
		wavePill.Text = if wave == 0 then "GET READY" else `WAVE {wave} CLEAR`
		objLabel.Text, objCount.Text = "NEXT WAVE IN", tostring(left)
	elseif phase == "Wave" then
		wavePill.Text = `WAVE {wave}`
		objLabel.Text, objCount.Text = "SURVIVE WAVES", `{math.max(0, wave - 1)} / {total}`
	elseif phase == "GameOver" then
		wavePill.Text = "GAME OVER"
		objLabel.Text, objCount.Text = "RESTARTING", "..."
	elseif phase == "Victory" then
		wavePill.Text = "VICTORY!"
		objLabel.Text, objCount.Text = "100 MEN BEAT THE GORILLA", "100 / 100"
	end
	local hp, maxHp = state:GetAttribute("BaseHp") or 0, state:GetAttribute("BaseMaxHp") or 1
	stashFill.Size = UDim2.fromScale(math.clamp(hp / maxHp, 0, 1), 1)
	-- boss bar
	if bossId then
		local cfg = ReplicatedStorage.Enemies:FindFirstChild(tostring(bossId))
		if cfg then
			bossFill.Size = UDim2.fromScale(math.clamp((cfg:GetAttribute("Hp") or 0) / (cfg:GetAttribute("MaxHp") or 1), 0, 1), 1)
		else
			bossId = nil
			bossFrame.Visible = false
		end
	end
	if panelUid then
		refreshPanel()
	end
end)

local function watchBoss(cfg: Instance)
	local def = EnemyDefs[cfg:GetAttribute("Type") or ""]
	if def and def.Boss then
		bossId = tonumber(cfg.Name)
		bossName.Text = string.upper(def.DisplayName)
		bossFrame.Visible = true
	end
end
local enemiesFolder = ReplicatedStorage:WaitForChild("Enemies")
enemiesFolder.ChildAdded:Connect(watchBoss)
for _, cfg in enemiesFolder:GetChildren() do -- joined mid-boss
	watchBoss(cfg)
end

-- ---------------------------------------------------------------- intro hand-off

-- The intro cutscene hides the HUD while it plays.
function Hud.setVisible(on: boolean)
	gui.Enabled = on
end

-- After the intro: the HUD pops in, the goal is called out, and a marker shows where to put
-- the first man until one has been placed.
local TUTORIAL_SPOT = Vector3.new(13, 0, 22)
function Hud.introFinished()
	local pop = make("UIScale", { Scale = 0.6, Parent = wavePill })
	TweenService:Create(pop, TweenInfo.new(0.35, Enum.EasingStyle.Back), { Scale = 1 }):Play()
	Juice.callout("PROTECT THE BANANA STASH!", Color3.fromRGB(255, 214, 40), 2.2)
	Juice.sound("Horn")
	if (player:GetAttribute("Units") or 0) > 0 then
		return
	end
	local anchor = Fx.part({ Size = Vector3.new(0.2, 0.2, 0.2), Position = TUTORIAL_SPOT + Vector3.new(0, 6, 0), Transparency = 1 })
	local bb = make("BillboardGui", { Size = UDim2.fromScale(10, 4), AlwaysOnTop = true, LightInfluence = 0, Adornee = anchor,
		Parent = anchor })
	local label = make("TextLabel", { Size = UDim2.fromScale(1, 0.5), BackgroundColor3 = MINT, Font = FONT, TextScaled = true,
		Text = "PLACE A BRAWLER HERE", TextColor3 = INK, ZIndex = 2, Parent = bb })
	make("UIPadding", { PaddingLeft = UDim.new(0.05, 0), PaddingRight = UDim.new(0.05, 0), PaddingTop = UDim.new(0.1, 0),
		PaddingBottom = UDim.new(0.1, 0), Parent = label })
	rim(label)
	local arrow = make("Frame", { Size = UDim2.fromScale(0.13, 0.33), Position = UDim2.fromScale(0.5, 0.5), AnchorPoint = Vector2.new(0.5, 0.5),
		SizeConstraint = Enum.SizeConstraint.RelativeYY, Rotation = 45, BackgroundColor3 = MINT, Parent = bb })
	rim(arrow)
	showToast("Press 1 (or tap BRAWLER), then click the marker", GREEN)
	local t0 = os.clock()
	local nextRing = 0
	local conn
	conn = RunService.RenderStepped:Connect(function()
		local t = os.clock() - t0
		if (player:GetAttribute("Units") or 0) > 0 or t > 40 then
			conn:Disconnect()
			anchor:Destroy()
			return
		end
		anchor.Position = TUTORIAL_SPOT + Vector3.new(0, 6 + math.abs(math.sin(t * 4)) * 1.2, 0)
		if t >= nextRing then
			nextRing = t + 0.9
			Fx.ring(TUTORIAL_SPOT + Vector3.new(0, 0.3, 0), 4, GREEN, 0.8, 0.25)
		end
	end)
end

function Hud.gameEvent(kind: string, a: any, b: any)
	if kind == "WaveStart" then
		Juice.callout(`WAVE {a}`, GREEN, 1.2)
		Juice.sound("Horn")
	elseif kind == "WaveClear" then
		Juice.callout("WAVE CLEARED!", GOLD, 1.4)
		showToast(`+${b} wave bonus`, GREEN)
		Fx.confetti(camera.CFrame.Position + camera.CFrame.LookVector * 14 + Vector3.new(0, 4, 0), 30)
	elseif kind == "BossIncoming" then
		Juice.callout(`{b} IS COMING`, Color3.fromRGB(255, 60, 40), 2.2)
		Juice.sound("Roar", nil, 0.8)
		Juice.shake(0.6)
	elseif kind == "BaseHit" then
		stashBorder.Color = RED
		task.delay(0.08, function()
			stashBorder.Color = INK
		end)
	elseif kind == "GameOver" then
		Juice.callout("THE MONKEYS GOT THE BANANAS", Color3.fromRGB(255, 80, 60), 4)
		Juice.shake(0.8)
	elseif kind == "Victory" then
		Juice.callout("VICTORY!", Color3.fromRGB(255, 220, 80), 5)
	end
end

return Hud
