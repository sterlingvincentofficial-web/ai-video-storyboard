--[[
	Small helpers for building UI in code: instances, text, buttons, panels, grids and viewports.
]]

local TweenService = game:GetService("TweenService")

local Theme = require(script.Parent.Theme)
local Sounds = require(script.Parent.Parent.Sounds)

local Kit = {}

-- Creates an instance, applies properties and parents children.
function Kit.new(className: string, props: { [string]: any }?, children: { any }?): any
	local instance = Instance.new(className)
	local parent = nil
	local properties: { [string]: any } = props or {}
	local childList: { any } = children or {}
	for key, value in properties do
		if key == "Parent" then
			parent = value
		else
			(instance :: any)[key] = value
		end
	end
	for _, child in childList do
		child.Parent = instance
	end
	if parent then
		instance.Parent = parent
	end
	return instance
end

function Kit.corner(radius: number?): any
	return Kit.new("UICorner", { CornerRadius = UDim.new(0, radius or 12) })
end

function Kit.stroke(thickness: number?, color: Color3?): any
	return Kit.new("UIStroke", {
		Thickness = thickness or 2,
		Color = color or Theme.Stroke,
		ApplyStrokeMode = Enum.ApplyStrokeMode.Border,
	})
end

function Kit.padding(pixels: number): UIPadding
	local p = UDim.new(0, pixels)
	return Kit.new("UIPadding", { PaddingTop = p, PaddingBottom = p, PaddingLeft = p, PaddingRight = p })
end

-- Outlined cartoon text.
function Kit.text(props: { [string]: any }): TextLabel
	local label = Kit.new("TextLabel", {
		BackgroundTransparency = 1,
		Font = Theme.Font,
		TextColor3 = Theme.Text,
		TextScaled = true,
		Text = "",
	})
	for key, value in props do
		-- StrokeThickness / MaxTextSize are helper options, not TextLabel properties
		if key ~= "Parent" and key ~= "StrokeThickness" and key ~= "MaxTextSize" then
			(label :: any)[key] = value
		end
	end
	Kit.new("UIStroke", { Thickness = props.StrokeThickness or 2, Color = Theme.Stroke, Parent = label })
	if props.TextScaled ~= false then
		Kit.new("UITextSizeConstraint", { MaxTextSize = props.MaxTextSize or 40, Parent = label })
	end
	label.Parent = props.Parent
	return label
end

-- Rainbow / special gradient for Divine and Secret items.
function Kit.rainbow(target: GuiObject | UIStroke)
	return Kit.new("UIGradient", {
		Color = ColorSequence.new({
			ColorSequenceKeypoint.new(0, Color3.fromRGB(255, 90, 90)),
			ColorSequenceKeypoint.new(0.25, Color3.fromRGB(255, 220, 80)),
			ColorSequenceKeypoint.new(0.5, Color3.fromRGB(90, 255, 140)),
			ColorSequenceKeypoint.new(0.75, Color3.fromRGB(90, 170, 255)),
			ColorSequenceKeypoint.new(1, Color3.fromRGB(220, 90, 255)),
		}),
		Parent = target,
	})
end

export type ButtonProps = {
	Text: string,
	Color: Color3?,
	Size: UDim2?,
	Position: UDim2?,
	AnchorPoint: Vector2?,
	LayoutOrder: number?,
	Parent: Instance?,
	OnClick: (() -> ())?,
	TextColor: Color3?,
	ZIndex: number?,
}

function Kit.button(props: ButtonProps): TextButton
	local color = props.Color or Theme.Green
	local button = Kit.new("TextButton", {
		Size = props.Size or UDim2.fromOffset(120, 40),
		Position = props.Position or UDim2.new(),
		AnchorPoint = props.AnchorPoint or Vector2.zero,
		BackgroundColor3 = color,
		AutoButtonColor = true,
		Text = "",
		LayoutOrder = props.LayoutOrder or 0,
		ZIndex = props.ZIndex or 1,
	}, { Kit.corner(10), Kit.stroke(3) })
	Kit.new("UIGradient", {
		Color = ColorSequence.new(Color3.new(1, 1, 1), Color3.fromRGB(200, 200, 200)),
		Rotation = 90,
		Parent = button,
	})
	Kit.text({
		Name = "Label",
		Text = props.Text,
		Size = UDim2.fromScale(0.9, 0.8),
		Position = UDim2.fromScale(0.05, 0.1),
		TextColor3 = props.TextColor or Theme.Text,
		ZIndex = (props.ZIndex or 1) + 1,
		Parent = button,
	})
	local scale = Kit.new("UIScale", { Parent = button })
	button.MouseButton1Down:Connect(function()
		TweenService:Create(scale, TweenInfo.new(0.06), { Scale = 0.92 }):Play()
	end)
	button.MouseButton1Up:Connect(function()
		TweenService:Create(scale, TweenInfo.new(0.1), { Scale = 1 }):Play()
	end)
	button.MouseLeave:Connect(function()
		scale.Scale = 1
	end)
	if props.OnClick then
		local onClick = props.OnClick
		button.Activated:Connect(function()
			Sounds.play("Click", 0.3)
			onClick()
		end)
	end
	button.Parent = props.Parent
	return button
end

function Kit.setButton(button: TextButton, text: string?, color: Color3?)
	local label = button:FindFirstChild("Label") :: TextLabel?
	if label and text then
		label.Text = text
	end
	if color then
		button.BackgroundColor3 = color
	end
end

-- Scrolling grid that grows with its content.
function Kit.grid(parent: Instance, cellSize: UDim2, padding: number?): ScrollingFrame
	local frame = Kit.new("ScrollingFrame", {
		Size = UDim2.fromScale(1, 1),
		BackgroundTransparency = 1,
		BorderSizePixel = 0,
		ScrollBarThickness = 8,
		ScrollBarImageColor3 = Theme.SubText,
		AutomaticCanvasSize = Enum.AutomaticSize.Y,
		CanvasSize = UDim2.new(),
		ScrollingDirection = Enum.ScrollingDirection.Y,
		Parent = parent,
	})
	Kit.new("UIGridLayout", {
		CellSize = cellSize,
		CellPadding = UDim2.fromOffset(padding or 8, padding or 8),
		SortOrder = Enum.SortOrder.LayoutOrder,
		HorizontalAlignment = Enum.HorizontalAlignment.Center,
		Parent = frame,
	})
	Kit.padding(6).Parent = frame
	return frame
end

function Kit.list(parent: Instance, padding: number?, horizontal: boolean?): ScrollingFrame
	local frame = Kit.new("ScrollingFrame", {
		Size = UDim2.fromScale(1, 1),
		BackgroundTransparency = 1,
		BorderSizePixel = 0,
		ScrollBarThickness = 8,
		ScrollBarImageColor3 = Theme.SubText,
		AutomaticCanvasSize = if horizontal then Enum.AutomaticSize.X else Enum.AutomaticSize.Y,
		CanvasSize = UDim2.new(),
		ScrollingDirection = if horizontal then Enum.ScrollingDirection.X else Enum.ScrollingDirection.Y,
		Parent = parent,
	})
	Kit.new("UIListLayout", {
		Padding = UDim.new(0, padding or 8),
		SortOrder = Enum.SortOrder.LayoutOrder,
		FillDirection = if horizontal then Enum.FillDirection.Horizontal else Enum.FillDirection.Vertical,
		HorizontalAlignment = Enum.HorizontalAlignment.Center,
		Parent = frame,
	})
	Kit.padding(6).Parent = frame
	return frame
end

-- Shows a model in a ViewportFrame, framed to fit.
function Kit.viewport(parent: Instance, model: Model, props: { [string]: any }?): ViewportFrame
	local viewport = Kit.new("ViewportFrame", {
		BackgroundTransparency = 1,
		Size = UDim2.fromScale(1, 1),
		Ambient = Color3.fromRGB(200, 200, 210),
		LightColor = Color3.fromRGB(255, 255, 255),
		LightDirection = Vector3.new(-1, -1, -1),
	})
	local properties: { [string]: any } = props or {}
	for key, value in properties do
		(viewport :: any)[key] = value
	end
	local camera = Instance.new("Camera")
	camera.FieldOfView = 40
	camera.Parent = viewport
	viewport.CurrentCamera = camera
	model:PivotTo(CFrame.new())
	model.Parent = viewport
	local _, size = model:GetBoundingBox()
	local radius = math.max(size.X, size.Y, size.Z) * 0.5
	local distance = radius / math.tan(math.rad(camera.FieldOfView / 2)) * 1.25
	local centre = model:GetBoundingBox().Position
	camera.CFrame = CFrame.lookAt(centre + Vector3.new(distance * 0.35, distance * 0.25, -distance), centre)
	viewport.Parent = parent
	return viewport
end

function Kit.clear(container: Instance)
	for _, child in container:GetChildren() do
		if child:IsA("GuiObject") then
			child:Destroy()
		end
	end
end

return Kit
