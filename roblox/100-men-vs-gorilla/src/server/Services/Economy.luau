--!strict
-- Co-op cash: every kill pays everyone in the server, so friends never fight over last hits.
-- Cash lives in leaderstats (shows on the player list) and the Cash attribute (drives the HUD).

local Players = game:GetService("Players")

local Economy = {}

Economy.START_CASH = 450

local function stat(player: Player): IntValue?
	local ls = player:FindFirstChild("leaderstats")
	return ls and ls:FindFirstChild("Cash") :: IntValue?
end

function Economy.setup(player: Player)
	local ls = Instance.new("Folder")
	ls.Name = "leaderstats"
	local cash = Instance.new("IntValue")
	cash.Name = "Cash"
	cash.Value = Economy.START_CASH
	cash.Parent = ls
	ls.Parent = player
	player:SetAttribute("Cash", Economy.START_CASH)
	player:SetAttribute("Units", 0)
end

function Economy.get(player: Player): number
	return player:GetAttribute("Cash") or 0
end

function Economy.add(player: Player, amount: number)
	local new = math.max(0, math.floor(Economy.get(player) + amount + 0.5))
	player:SetAttribute("Cash", new)
	local s = stat(player)
	if s then
		s.Value = new
	end
end

function Economy.spend(player: Player, amount: number): boolean
	if Economy.get(player) < amount then
		return false
	end
	Economy.add(player, -amount)
	return true
end

function Economy.addAll(amount: number)
	for _, p in Players:GetPlayers() do
		Economy.add(p, amount)
	end
end

function Economy.resetAll()
	for _, p in Players:GetPlayers() do
		Economy.add(p, Economy.START_CASH - Economy.get(p))
		p:SetAttribute("Units", 0)
	end
end

return Economy
