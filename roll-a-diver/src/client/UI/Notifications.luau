--[[
	Toasts (bottom of the screen) and big announcements (top of the screen).
]]

local TweenService = game:GetService("TweenService")

local Kit = require(script.Parent.Kit)
local Theme = require(script.Parent.Theme)

local Notifications = {}

local KIND_COLORS: { [string]: Color3 } = {
	Info = Color3.fromRGB(60, 110, 200),
	Success = Color3.fromRGB(50, 170, 80),
	Danger = Color3.fromRGB(200, 50, 60),
	New = Color3.fromRGB(220, 160, 30),
	Chest = Color3.fromRGB(150, 95, 50),
	Error = Color3.fromRGB(170, 60, 60),
}

local toastHolder: Frame
local announceHolder: Frame
local announceQueue: { { text: string, color: Color3 } } = {}
local announcing = false

function Notifications.mount(root: Instance)
	toastHolder = Kit.new("Frame", {
		Name = "Toasts",
		AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.new(0.5, 0, 1, -16),
		Size = UDim2.fromOffset(460, 260),
		BackgroundTransparency = 1,
		Parent = root,
	})
	Kit.new("UIListLayout", {
		VerticalAlignment = Enum.VerticalAlignment.Bottom,
		HorizontalAlignment = Enum.HorizontalAlignment.Center,
		Padding = UDim.new(0, 6),
		SortOrder = Enum.SortOrder.LayoutOrder,
		Parent = toastHolder,
	})
	announceHolder = Kit.new("Frame", {
		Name = "Announcements",
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 150),
		Size = UDim2.fromOffset(760, 54),
		BackgroundTransparency = 1,
		Parent = root,
	})
end

local order = 0
local liveToasts: { [number]: boolean } = {} -- keyed by LayoutOrder

function Notifications.toast(text: string, kind: string?)
	if not toastHolder then
		return
	end
	order += 1
	local color = KIND_COLORS[kind or "Info"] or KIND_COLORS.Info
	local frame = Kit.new("Frame", {
		Size = UDim2.fromOffset(440, 38),
		BackgroundColor3 = color,
		BackgroundTransparency = 0.1,
		LayoutOrder = order,
		Parent = toastHolder,
	}, { Kit.corner(10), Kit.stroke(2) })
	local id = order
	liveToasts[id] = true
	Kit.text({
		Text = text,
		Size = UDim2.new(1, -16, 1, -8),
		Position = UDim2.fromOffset(8, 4),
		MaxTextSize = 22,
		Parent = frame,
	})
	-- keep at most 5 toasts
	local toasts = {}
	for _, child in toastHolder:GetChildren() do
		if child:IsA("Frame") then
			table.insert(toasts, child)
		end
	end
	table.sort(toasts, function(a, b)
		return a.LayoutOrder < b.LayoutOrder
	end)
	while #toasts > 5 do
		local oldest = table.remove(toasts, 1)
		if oldest then
			liveToasts[oldest.LayoutOrder] = nil
			oldest:Destroy()
		end
	end
	task.delay(3.5, function()
		if liveToasts[id] then
			liveToasts[id] = nil
			local tween = TweenService:Create(frame, TweenInfo.new(0.4), { BackgroundTransparency = 1 })
			tween:Play()
			for _, descendant in frame:GetDescendants() do
				if descendant:IsA("TextLabel") then
					TweenService:Create(descendant, TweenInfo.new(0.4), { TextTransparency = 1 }):Play()
				elseif descendant:IsA("UIStroke") then
					TweenService:Create(descendant, TweenInfo.new(0.4), { Transparency = 1 }):Play()
				end
			end
			tween.Completed:Wait()
			frame:Destroy()
		end
	end)
end

local function showNextAnnouncement()
	if announcing or #announceQueue == 0 then
		return
	end
	announcing = true
	local item = table.remove(announceQueue, 1)
	assert(item)
	local label = Kit.text({
		Text = item.text,
		Size = UDim2.fromScale(1, 1),
		TextColor3 = item.color,
		StrokeThickness = 3,
		MaxTextSize = 34,
		Parent = announceHolder,
	})
	local scale = Kit.new("UIScale", { Scale = 0.5, Parent = label })
	TweenService:Create(scale, TweenInfo.new(0.35, Enum.EasingStyle.Back), { Scale = 1 }):Play()
	task.delay(4, function()
		TweenService:Create(label, TweenInfo.new(0.4), { TextTransparency = 1 }):Play()
		task.wait(0.4)
		label:Destroy()
		announcing = false
		showNextAnnouncement()
	end)
end

function Notifications.announce(text: string, color: Color3?)
	table.insert(announceQueue, { text = text, color = color or Theme.Gold })
	while #announceQueue > 6 do
		table.remove(announceQueue, 1)
	end
	showNextAnnouncement()
end

return Notifications
