--[[
	Global leaderboards (all servers) for total cash earned and rebirths.
	Scores are written to OrderedDataStores every few minutes and on leave; the top 10 are
	read every minute, shown on boards in the world and published for the client UI.
]]

local DataStoreService = game:GetService("DataStoreService")
local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage.Shared
local Format = require(Shared.Util.Format)

local Server = script.Parent.Parent
local Services = require(Server.Registry)
local Layout = require(Server.Layout)

local LeaderboardService = {}

local BOARDS = {
	{ id = "Earned", title = "💰 Top Earners", store = "RollADiver_TopEarned_v1", field = "totalEarned" },
	{ id = "Rebirths", title = "♻ Top Rebirths", store = "RollADiver_TopRebirths_v1", field = "rebirths" },
}
local TOP_COUNT = 10
local WRITE_INTERVAL = 180
local READ_INTERVAL = 60
local MAX_SCORE = 2 ^ 53

type Entry = { name: string, value: number }

local stores: { [string]: OrderedDataStore } = {}
local tops: { [string]: { Entry } } = {}
local lastWrite: { [Player]: number } = {}
local nameCache: { [number]: string } = {}
local boardLabels: { [string]: { TextLabel } } = {}

local function scoreFor(data, field: string): number
	return math.clamp(math.floor(data[field] or 0), 0, MAX_SCORE)
end

function LeaderboardService.Write(player: Player)
	local data = Services.DataService.Get(player)
	if not data or not Services.DataService.IsSaving(player) then
		return
	end
	lastWrite[player] = os.clock()
	for _, board in BOARDS do
		local store = stores[board.id]
		if store then
			local score = scoreFor(data, board.field)
			pcall(function()
				store:SetAsync("u_" .. player.UserId, score)
			end)
		end
	end
end

local function nameOf(userId: number): string
	if nameCache[userId] then
		return nameCache[userId]
	end
	local ok, name = pcall(function()
		return Players:GetNameFromUserIdAsync(userId)
	end)
	local result = if ok and name then name else "Player"
	nameCache[userId] = result
	return result
end

local function publish()
	local payload = {}
	for _, board in BOARDS do
		payload[board.id] = { title = board.title, entries = tops[board.id] or {} }
	end
	ReplicatedStorage:SetAttribute("Leaderboards", HttpService:JSONEncode(payload))
	for _, board in BOARDS do
		local labels = boardLabels[board.id]
		local entries = tops[board.id] or {}
		if labels then
			for rank, label in labels do
				local entry = entries[rank]
				if entry then
					local value = if board.id == "Earned" then Format.money(entry.value) else Format.number(entry.value)
					label.Text = ("#%d  %s  %s"):format(rank, entry.name, value)
				else
					label.Text = ("#%d  ---"):format(rank)
				end
			end
		end
	end
end

local function read()
	for _, board in BOARDS do
		local store = stores[board.id]
		if store then
			local ok, pages = pcall(function()
				return store:GetSortedAsync(false, TOP_COUNT)
			end)
			if ok and pages then
				local entries = {}
				for _, item in pages:GetCurrentPage() do
					local userId = tonumber(string.sub(item.key, 3))
					if userId then
						table.insert(entries, { name = nameOf(userId), value = item.value })
					end
				end
				tops[board.id] = entries
			end
		end
	end
	publish()
end

local function buildBoard(board: { id: string, title: string }, cframe: CFrame)
	local part = Instance.new("Part")
	part.Name = board.id .. "Leaderboard"
	part.Anchored = true
	part.Size = Vector3.new(26, 32, 1)
	part.CFrame = cframe
	part.Color = Color3.fromRGB(30, 45, 85)
	part.Material = Enum.Material.SmoothPlastic
	part.Parent = Workspace
	local post = Instance.new("Part")
	post.Name = "BoardPost"
	post.Anchored = true
	post.Size = Vector3.new(3, 60, 3)
	post.CFrame = cframe * CFrame.new(0, -30, 1)
	post.Color = Color3.fromRGB(115, 75, 45)
	post.Material = Enum.Material.Wood
	post.Parent = part
	local gui = Instance.new("SurfaceGui")
	gui.Face = Enum.NormalId.Front
	gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	gui.PixelsPerStud = 25
	gui.Parent = part
	local list = Instance.new("UIListLayout")
	list.Padding = UDim.new(0, 4)
	list.SortOrder = Enum.SortOrder.LayoutOrder
	list.Parent = gui
	local function label(text: string, order: number, height: number, color: Color3): TextLabel
		local l = Instance.new("TextLabel")
		l.BackgroundTransparency = 1
		l.Size = UDim2.new(1, -20, 0, height)
		l.Font = Enum.Font.FredokaOne
		l.TextScaled = true
		l.Text = text
		l.TextColor3 = color
		l.LayoutOrder = order
		local stroke = Instance.new("UIStroke")
		stroke.Thickness = 2
		stroke.Parent = l
		l.Parent = gui
		return l
	end
	label(board.title, 0, 50, Color3.fromRGB(255, 220, 90))
	local labels = {}
	for rank = 1, TOP_COUNT do
		labels[rank] = label(
			("#%d  ---"):format(rank),
			rank,
			36,
			if rank <= 3 then Color3.fromRGB(255, 240, 180) else Color3.new(1, 1, 1)
		)
	end
	boardLabels[board.id] = labels
end

function LeaderboardService.Init()
	for _, board in BOARDS do
		local ok, store = pcall(function()
			return DataStoreService:GetOrderedDataStore(board.store)
		end)
		if ok then
			stores[board.id] = store
		end
	end
	-- one board at each end of the channel, facing the docks
	for index, board in BOARDS do
		local side = if index == 1 then -1 else 1
		local position = Vector3.new(side * 250, Layout.DeckTop + 22, 0)
		buildBoard(board, CFrame.lookAt(position, Vector3.new(0, position.Y, 0)))
	end
	publish()
end

function LeaderboardService.Start()
	task.spawn(function()
		task.wait(5)
		while true do
			read()
			for _, player in Players:GetPlayers() do
				if os.clock() - (lastWrite[player] or 0) >= WRITE_INTERVAL then
					task.spawn(LeaderboardService.Write, player)
				end
			end
			task.wait(READ_INTERVAL)
		end
	end)
	Players.PlayerRemoving:Connect(function(player)
		lastWrite[player] = nil
	end)
end

return LeaderboardService
