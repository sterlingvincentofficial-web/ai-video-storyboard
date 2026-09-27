--[[
	Top panel: global leaderboards (all servers), published by the server as a JSON attribute.
]]

local HttpService = game:GetService("HttpService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage.Shared
local Format = require(Shared.Util.Format)

local UI = script.Parent.Parent
local Kit = require(UI.Kit)
local Theme = require(UI.Theme)

local Panel = {
	title = "🏆 Top Divers",
	color = Theme.Gold,
}

local columns: { [string]: ScrollingFrame } = {}
local lastRaw = ""

local ORDER = { "Earned", "Rebirths" }
local TITLES = { Earned = "💰 Top Earners", Rebirths = "♻ Top Rebirths" }

function Panel.build(content: Frame)
	for index, id in ORDER do
		local column = Kit.new("Frame", {
			Position = UDim2.new((index - 1) * 0.5, if index == 1 then 0 else 6, 0, 0),
			Size = UDim2.new(0.5, -6, 1, 0),
			BackgroundColor3 = Theme.CardDark,
			Parent = content,
		}, { Kit.corner(12), Kit.stroke(2) })
		Kit.text({
			Text = TITLES[id],
			Position = UDim2.fromOffset(10, 6),
			Size = UDim2.new(1, -20, 0, 32),
			TextColor3 = Theme.Gold,
			MaxTextSize = 28,
			Parent = column,
		})
		local body = Kit.new("Frame", {
			Position = UDim2.fromOffset(0, 44),
			Size = UDim2.new(1, 0, 1, -44),
			BackgroundTransparency = 1,
			Parent = column,
		})
		columns[id] = Kit.list(body, 4)
	end
end

function Panel.refresh()
	local raw = ReplicatedStorage:GetAttribute("Leaderboards")
	if type(raw) ~= "string" or raw == lastRaw then
		return
	end
	lastRaw = raw
	local ok, payload = pcall(HttpService.JSONDecode, HttpService, raw)
	if not ok or type(payload) ~= "table" then
		return
	end
	for _, id in ORDER do
		local list = columns[id]
		Kit.clear(list)
		local board = payload[id]
		local entries = if board then board.entries else {}
		if #entries == 0 then
			Kit.text({
				Text = "No scores yet. Be the first!",
				Size = UDim2.new(1, -12, 0, 30),
				TextColor3 = Theme.SubText,
				MaxTextSize = 20,
				Parent = list,
			})
		end
		for rank, entry in entries do
			local value = if id == "Earned" then Format.money(entry.value) else Format.number(entry.value)
			local row = Kit.new("Frame", {
				Size = UDim2.new(1, -12, 0, 34),
				BackgroundColor3 = if rank <= 3 then Theme.Card else Theme.Panel,
				LayoutOrder = rank,
				Parent = list,
			}, { Kit.corner(8) })
			local medal = if rank == 1
				then "🥇"
				elseif rank == 2 then "🥈"
				elseif rank == 3 then "🥉"
				else "#" .. rank
			Kit.text({
				Text = medal .. "  " .. tostring(entry.name),
				Position = UDim2.fromOffset(8, 3),
				Size = UDim2.new(0.62, -8, 1, -6),
				TextXAlignment = Enum.TextXAlignment.Left,
				MaxTextSize = 20,
				Parent = row,
			})
			Kit.text({
				Text = value,
				Position = UDim2.new(0.62, 0, 0, 3),
				Size = UDim2.new(0.38, -8, 1, -6),
				TextXAlignment = Enum.TextXAlignment.Right,
				TextColor3 = Theme.Money,
				MaxTextSize = 20,
				Parent = row,
			})
		end
	end
end

function Panel.onClose() end

return Panel
