-- The HUD: wave pill + countdown, Banana Stash health, boss bar, cash counter, army count,
-- the unit hotbar with a placement ghost, and the tap-a-man panel for upgrading/selling.
-- Green pills with black text, chunky outlines: matching the game's toy look.

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

local Hud = {}

local player = Players.LocalPlayer
local camera = workspace.CurrentCamera
local state = ReplicatedStorage:WaitForChild("GameState")
local unitsFolder = workspace:WaitForChild("Units")
local PATHS = PathUtil.fromMapData(MapData)

local GREEN = Color3.fromRGB(120, 240, 150)
local INK = Color3.fromRGB(16, 18, 16)
local FONT = Enum.Font.LuckiestGuy
local FONT_UI = Enum.Font.FredokaOne

local gui = Instance.new("ScreenGui")
gui.Name = "Hud"
gui.ResetOnSpawn = false
gui.IgnoreGuiInset = true
gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
gui.Parent = player:WaitForChild("PlayerGui")

local function make(class: string, props: { [string]: any }): any
	local inst = Instance.new(class)
	for k, v in props do
		if k ~= "Parent" then
			(inst :: any)[k] = v
		end
	end
	inst.Parent = props.Parent
	return inst
end

local function stroke(parent: Instance, thickness: number?, color: Color3?)
	return make("UIStroke", { Thickness = thickness or 3, Color = color or INK, Parent = parent })
end

local function pill(parent: Instance, text: string, size: UDim2, pos: UDim2, bg: Color3?): TextLabel
	local label = make("TextLabel", {
		Size = size, Position = pos, AnchorPoint = Vector2.new(0.5, 0), BackgroundColor3 = bg or GREEN,
		Text = text, Font = FONT, TextScaled = true, TextColor3 = INK, Parent = parent,
	})
	make("UICorner", { CornerRadius = UDim.new(0, 6), Parent = label })
	make("UIPadding", { PaddingLeft = UDim.new(0, 10), PaddingRight = UDim.new(0, 10), PaddingTop = UDim.new(0, 4),
		PaddingBottom = UDim.new(0, 4), Parent = label })
	local s = stroke(label, 3)
	s.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
	return label
end

-- ---------------------------------------------------------------- top: wave, stash, boss

local wavePill = pill(gui, "GET READY", UDim2.fromOffset(240, 46), UDim2.new(0.5, 0, 0, 10))
local subPill = pill(gui, "", UDim2.fromOffset(300, 30), UDim2.new(0.5, 0, 0, 62), Color3.fromRGB(30, 34, 30))
subPill.TextColor3 = GREEN

local stashFrame = make("Frame", { Size = UDim2.fromOffset(300, 26), Position = UDim2.new(0.5, 0, 0, 100),
	AnchorPoint = Vector2.new(0.5, 0), BackgroundColor3 = Color3.fromRGB(30, 30, 30), Parent = gui })
stroke(stashFrame, 3)
make("UICorner", { CornerRadius = UDim.new(0, 6), Parent = stashFrame })
local stashFill = make("Frame", { Size = UDim2.fromScale(1, 1), BackgroundColor3 = Color3.fromRGB(255, 214, 40),
	BorderSizePixel = 0, Parent = stashFrame })
make("UICorner", { CornerRadius = UDim.new(0, 6), Parent = stashFill })
make("TextLabel", { Size = UDim2.fromScale(1, 1), BackgroundTransparency = 1, Text = "BANANA STASH", Font = FONT,
	TextScaled = true, TextColor3 = INK, ZIndex = 2, Parent = stashFrame })

local bossFrame = make("Frame", { Size = UDim2.fromOffset(460, 34), Position = UDim2.new(0.5, 0, 0, 136),
	AnchorPoint = Vector2.new(0.5, 0), BackgroundColor3 = Color3.fromRGB(30, 10, 10), Visible = false, Parent = gui })
stroke(bossFrame, 3)
local bossFill = make("Frame", { Size = UDim2.fromScale(1, 1), BackgroundColor3 = Color3.fromRGB(230, 40, 40),
	BorderSizePixel = 0, Parent = bossFrame })
local bossName = make("TextLabel", { Size = UDim2.fromScale(1, 1), BackgroundTransparency = 1, Text = "", Font = FONT,
	TextScaled = true, TextColor3 = Color3.new(1, 1, 1), ZIndex = 2, Parent = bossFrame })
stroke(bossName, 2)

-- ---------------------------------------------------------------- bottom: cash, men, hotbar

local cashFrame = make("Frame", { Size = UDim2.fromOffset(190, 50), Position = UDim2.new(0.5, 0, 1, -150),
	AnchorPoint = Vector2.new(0.5, 0), BackgroundTransparency = 1, Parent = gui })
local dollar = make("TextLabel", { Size = UDim2.fromOffset(46, 50), BackgroundColor3 = Color3.fromRGB(236, 190, 110),
	Text = "$", Font = FONT, TextScaled = true, TextColor3 = INK, Parent = cashFrame })
stroke(dollar, 3).ApplyStrokeMode = Enum.ApplyStrokeMode.Border
local cashLabel = make("TextLabel", { Size = UDim2.new(1, -50, 1, 0), Position = UDim2.fromOffset(50, 0),
	BackgroundColor3 = Color3.fromRGB(20, 22, 20), Text = "0", Font = FONT, TextScaled = true, TextColor3 = Color3.new(1, 1, 1),
	TextXAlignment = Enum.TextXAlignment.Left, Parent = cashFrame })
stroke(cashLabel, 3).ApplyStrokeMode = Enum.ApplyStrokeMode.Border
make("UIPadding", { PaddingLeft = UDim.new(0, 8), Parent = cashLabel })
local cashScale = make("UIScale", { Parent = cashFrame })
local menLabel = make("TextLabel", { Size = UDim2.fromOffset(120, 28), Position = UDim2.new(0.5, 110, 1, -139),
	AnchorPoint = Vector2.new(0, 0), BackgroundTransparency = 1, Text = "MEN 0/100", Font = FONT, TextScaled = true,
	TextColor3 = GREEN, Parent = gui })
stroke(menLabel, 2)

Juice.cashScreenPos = function(): Vector2
	local p, s = cashFrame.AbsolutePosition, cashFrame.AbsoluteSize
	return Vector2.new(p.X + 23, p.Y + s.Y / 2)
end
Juice.onCoinArrive = function(_amount: number)
	cashScale.Scale = 1.18
	TweenService:Create(cashScale, TweenInfo.new(0.15, Enum.EasingStyle.Back), { Scale = 1 }):Play()
end

local shownCash = 0
RunService.RenderStepped:Connect(function(dt)
	local actual = player:GetAttribute("Cash") or 0
	shownCash += (actual - shownCash) * math.min(1, dt * 8)
	if math.abs(actual - shownCash) < 0.5 then
		shownCash = actual
	end
	cashLabel.Text = tostring(math.floor(shownCash + 0.5))
	menLabel.Text = `MEN {player:GetAttribute("Units") or 0}/100`
end)

local toast = make("TextLabel", { Size = UDim2.fromOffset(420, 34), Position = UDim2.new(0.5, 0, 1, -196),
	AnchorPoint = Vector2.new(0.5, 0), BackgroundTransparency = 1, Text = "", Font = FONT_UI, TextScaled = true,
	TextColor3 = Color3.fromRGB(255, 120, 100), TextTransparency = 1, Parent = gui })
local toastStroke = stroke(toast, 2)
toastStroke.Transparency = 1
local function showToast(text: string, color: Color3?)
	toast.Text = text
	toast.TextColor3 = color or Color3.fromRGB(255, 120, 100)
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

-- hotbar
local order = {}
for id, def in Units do
	table.insert(order, { id = id, def = def })
end
table.sort(order, function(a, b)
	return a.def.Order < b.def.Order
end)

local bar = make("Frame", { Size = UDim2.fromOffset(#order * 86, 88), Position = UDim2.new(0.5, 0, 1, -94),
	AnchorPoint = Vector2.new(0.5, 0), BackgroundTransparency = 1, Parent = gui })
make("UIListLayout", { FillDirection = Enum.FillDirection.Horizontal, Padding = UDim.new(0, 6),
	HorizontalAlignment = Enum.HorizontalAlignment.Center, Parent = bar })
local slots = {}
local selected: string? = nil

local function setSelected(id: string?)
	selected = id
	for sid, b in slots do
		b.BackgroundColor3 = if sid == id then Color3.fromRGB(255, 220, 80) else GREEN
	end
	Hud.onSelectUnit(id)
end

for i, entry in order do
	local b = make("TextButton", { Size = UDim2.fromOffset(80, 86), BackgroundColor3 = GREEN, Text = "", AutoButtonColor = true,
		LayoutOrder = i, Parent = bar })
	make("UICorner", { CornerRadius = UDim.new(0, 8), Parent = b })
	stroke(b, 3).ApplyStrokeMode = Enum.ApplyStrokeMode.Border
	make("TextLabel", { Size = UDim2.new(1, -6, 0, 18), Position = UDim2.fromOffset(3, 3), BackgroundTransparency = 1,
		Text = tostring(i), Font = FONT, TextScaled = true, TextColor3 = INK, TextXAlignment = Enum.TextXAlignment.Left, Parent = b })
	make("TextLabel", { Size = UDim2.new(1, -6, 0, 34), Position = UDim2.fromOffset(3, 20), BackgroundTransparency = 1,
		Text = entry.def.DisplayName, Font = FONT_UI, TextScaled = true, TextColor3 = INK, TextWrapped = true, Parent = b })
	make("TextLabel", { Size = UDim2.new(1, -6, 0, 22), Position = UDim2.new(0, 3, 1, -26), BackgroundTransparency = 1,
		Text = `${entry.def.Levels[1].Cost}`, Font = FONT, TextScaled = true, TextColor3 = Color3.fromRGB(30, 90, 30), Parent = b })
	b.Activated:Connect(function()
		Juice.sound("Ui")
		setSelected(if selected == entry.id then nil else entry.id)
	end)
	slots[entry.id] = b
end

-- ---------------------------------------------------------------- placement ghost

local ghostRing = Fx.part({ Shape = Enum.PartType.Cylinder, Size = Vector3.new(0.15, 2, 2), Material = Enum.Material.Neon,
	Transparency = 0.6, Parent = nil })
local ghostBody = Fx.part({ Size = Vector3.new(2, 5, 1.2), Transparency = 0.45, Material = Enum.Material.Neon, Parent = nil })
local ghostPos: Vector3? = nil
local ghostOk = false

local raycastParams = RaycastParams.new()
raycastParams.FilterType = Enum.RaycastFilterType.Include

local function mapRoot(): Instance
	return workspace:FindFirstChild("Map") or workspace
end

local function pointerRay(screen: Vector2?): RaycastResult?
	local p = screen or UserInputService:GetMouseLocation()
	local ray = camera:ViewportPointToRay(p.X, p.Y)
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

local panel = make("Frame", { Size = UDim2.fromOffset(250, 210), Position = UDim2.new(1, -16, 0.5, 0),
	AnchorPoint = Vector2.new(1, 0.5), BackgroundColor3 = Color3.fromRGB(26, 30, 26), Visible = false, Parent = gui })
make("UICorner", { CornerRadius = UDim.new(0, 10), Parent = panel })
stroke(panel, 3, GREEN)
local panelTitle = make("TextLabel", { Size = UDim2.new(1, -20, 0, 34), Position = UDim2.fromOffset(10, 8), BackgroundTransparency = 1,
	Font = FONT, TextScaled = true, TextColor3 = GREEN, Text = "", Parent = panel })
local panelInfo = make("TextLabel", { Size = UDim2.new(1, -20, 0, 70), Position = UDim2.fromOffset(10, 44), BackgroundTransparency = 1,
	Font = FONT_UI, TextScaled = true, TextColor3 = Color3.new(1, 1, 1), TextXAlignment = Enum.TextXAlignment.Left,
	TextYAlignment = Enum.TextYAlignment.Top, Text = "", Parent = panel })
local upButton = make("TextButton", { Size = UDim2.new(1, -20, 0, 38), Position = UDim2.fromOffset(10, 120),
	BackgroundColor3 = GREEN, Font = FONT, TextScaled = true, TextColor3 = INK, Text = "UPGRADE", Parent = panel })
make("UICorner", { CornerRadius = UDim.new(0, 6), Parent = upButton })
local sellButton = make("TextButton", { Size = UDim2.new(1, -20, 0, 34), Position = UDim2.fromOffset(10, 166),
	BackgroundColor3 = Color3.fromRGB(240, 110, 90), Font = FONT, TextScaled = true, TextColor3 = INK, Text = "SELL", Parent = panel })
make("UICorner", { CornerRadius = UDim.new(0, 6), Parent = sellButton })
local panelRing = Fx.part({ Shape = Enum.PartType.Cylinder, Size = Vector3.new(0.15, 2, 2), Material = Enum.Material.Neon,
	Color = Color3.fromRGB(255, 220, 80), Transparency = 0.65, Parent = nil })
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
	panelTitle.Text = `{def.DisplayName}  LV{level}`
	local stats = if cur.Damage > 0 then `DMG {cur.Damage}  RANGE {cur.Range}\n` else ""
	panelInfo.Text = stats .. def.Blurb
	upButton.Text = if nxt then `UPGRADE  ${nxt.Cost}` else "MAX LEVEL"
	upButton.BackgroundColor3 = if nxt then GREEN else Color3.fromRGB(90, 90, 90)
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
	local p = screen or UserInputService:GetMouseLocation()
	local ray = camera:ViewportPointToRay(p.X, p.Y)
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
	if selected and input.UserInputType == Enum.UserInputType.MouseMovement then
		updateGhost()
	end
end)

UserInputService.InputBegan:Connect(function(input, processed)
	if processed then
		return
	end
	if input.UserInputType == Enum.UserInputType.Keyboard then
		local n = input.KeyCode.Value - Enum.KeyCode.One.Value + 1
		if n >= 1 and n <= #order then
			setSelected(if selected == order[n].id then nil else order[n].id)
		elseif input.KeyCode == Enum.KeyCode.Q or input.KeyCode == Enum.KeyCode.Escape then
			setSelected(nil)
			Hud.closePanel()
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
	if phase == "Intermission" then
		local left = math.max(0, math.ceil((state:GetAttribute("NextWaveAt") or 0) - workspace:GetServerTimeNow()))
		wavePill.Text = if wave == 0 then "GET READY" else `WAVE {wave} CLEAR`
		subPill.Text = `NEXT WAVE IN {left}`
	elseif phase == "Wave" then
		wavePill.Text = `WAVE {wave}`
		subPill.Text = `SURVIVE WAVES {math.max(0, wave - 1)} / {total}`
	elseif phase == "GameOver" then
		wavePill.Text = "GAME OVER"
		subPill.Text = "RESTARTING..."
	elseif phase == "Victory" then
		wavePill.Text = "VICTORY!"
		subPill.Text = "100 MEN BEAT THE GORILLA"
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

ReplicatedStorage:WaitForChild("Enemies").ChildAdded:Connect(function(cfg)
	local def = EnemyDefs[cfg:GetAttribute("Type") or ""]
	if def and def.Boss then
		bossId = tonumber(cfg.Name)
		bossName.Text = def.DisplayName
		bossFrame.Visible = true
	end
end)

function Hud.gameEvent(kind: string, a: any, b: any)
	if kind == "WaveStart" then
		Juice.callout(`WAVE {a}`, GREEN, 1.2)
		Juice.sound("Horn")
	elseif kind == "WaveClear" then
		Juice.callout("WAVE CLEARED!", Color3.fromRGB(255, 220, 80), 1.4)
		showToast(`+${b} wave bonus`, GREEN)
		Fx.confetti(camera.CFrame.Position + camera.CFrame.LookVector * 14 + Vector3.new(0, 4, 0), 30)
	elseif kind == "BossIncoming" then
		Juice.callout(`{b} IS COMING`, Color3.fromRGB(255, 60, 40), 2.2)
		Juice.sound("Roar", nil, 0.8)
		Juice.shake(0.6)
	elseif kind == "BaseHit" then
		stashFrame.BackgroundColor3 = Color3.fromRGB(160, 20, 20)
		task.delay(0.08, function()
			stashFrame.BackgroundColor3 = Color3.fromRGB(30, 30, 30)
		end)
	elseif kind == "GameOver" then
		Juice.callout("THE MONKEYS GOT THE BANANAS", Color3.fromRGB(255, 80, 60), 4)
		Juice.shake(0.8)
	elseif kind == "Victory" then
		Juice.callout("VICTORY!", Color3.fromRGB(255, 220, 80), 5)
	end
end

return Hud
