--[[
	Codes, daily login streak, spin wheel and the group reward.
	All of them hand out rewards through RewardService.Grant.
]]

local Shared = game:GetService("ReplicatedStorage").Shared
local Formulas = require(Shared.Formulas)
local Format = require(Shared.Util.Format)
local Rewards = require(Shared.Config.Rewards)

local Services = require(script.Parent.Parent.Registry)

local RewardService = {}

local MAX_CODE_LENGTH = 32

local random = Random.new()
local function rand(): number
	return random:NextNumber()
end

-- Gives a reward table and returns a short human description of it.
function RewardService.Grant(player: Player, reward: Rewards.Reward): string
	local data = Services.DataService.Get(player)
	if not data then
		return ""
	end
	local parts = {}
	local cash = reward.cash or 0
	if reward.incomeMinutes then
		cash = math.max(cash, Services.VaultService.IncomePerSecond(player) * 60 * reward.incomeMinutes)
	end
	cash = math.floor(cash)
	if cash > 0 then
		Services.EconomyService.AddCash(player, cash, "Reward")
		table.insert(parts, "+" .. Format.money(cash))
	end
	if reward.potionMinutes then
		data.luckPotionEnds = math.max(data.luckPotionEnds, os.time()) + reward.potionMinutes * 60
		table.insert(parts, ("x2 Luck %dm"):format(reward.potionMinutes))
	end
	if reward.spins then
		data.spins.extra += reward.spins
		table.insert(parts, ("+%d spins"):format(reward.spins))
	end
	if reward.chests then
		local luck = Services.EconomyService.LuckMult(player) * 2
		Services.ChestService.GrantFromZone(player, Services.EconomyService.ZoneCap(player), reward.chests, luck)
		table.insert(parts, ("+%d chests"):format(reward.chests))
	end
	Services.DataService.MarkDirty(player)
	return table.concat(parts, ", ")
end

-- Codes --------------------------------------------------------------------------------------

function RewardService.RedeemCode(player: Player, rawCode: string): { [string]: any }
	local data = Services.DataService.Get(player)
	if not data then
		return { ok = false, err = "Still loading" }
	end
	local code = string.upper((string.gsub(rawCode, "%s", "")))
	if #code == 0 or #code > MAX_CODE_LENGTH then
		return { ok = false, err = "Enter a code" }
	end
	local entry = Rewards.Codes[code]
	if not entry then
		return { ok = false, err = "That code doesn't exist" }
	end
	if entry.expires and os.time() > entry.expires then
		return { ok = false, err = "That code has expired" }
	end
	if data.codes[code] then
		return { ok = false, err = "You already used that code" }
	end
	if entry.minRebirths and data.rebirths < entry.minRebirths then
		return { ok = false, err = ("Reach Rebirth %d to use this code"):format(entry.minRebirths) }
	end
	data.codes[code] = true
	local text = RewardService.Grant(player, entry.reward)
	Services.AnalyticsService.Log(player, "CodeRedeemed", code)
	return { ok = true, text = text }
end

-- Daily streak -------------------------------------------------------------------------------

function RewardService.DailyStatus(data: { [string]: any }): (boolean, number)
	return Formulas.dailyStreak(data.daily.lastDay, data.daily.streak, Formulas.dayNumber(os.time()))
end

function RewardService.ClaimDaily(player: Player): { [string]: any }
	local data = Services.DataService.Get(player)
	if not data then
		return { ok = false, err = "Still loading" }
	end
	local canClaim, streak = RewardService.DailyStatus(data)
	if not canClaim then
		return { ok = false, err = "Come back tomorrow for your next reward!" }
	end
	data.daily.lastDay = Formulas.dayNumber(os.time())
	data.daily.streak = streak
	local text = RewardService.Grant(player, Rewards.Daily[streak])
	Services.AnalyticsService.Log(player, "DailyClaimed", "Day" .. streak)
	return { ok = true, day = streak, text = text }
end

-- Spin wheel ---------------------------------------------------------------------------------

function RewardService.Spin(player: Player): { [string]: any }
	local data = Services.DataService.Get(player)
	if not data then
		return { ok = false, err = "Still loading" }
	end
	local now = os.time()
	local free = Formulas.freeSpinWait(data.spins.lastFree, now) == 0
	if free then
		data.spins.lastFree = now
	elseif data.spins.extra > 0 then
		data.spins.extra -= 1
	else
		return {
			ok = false,
			err = "No spins left. Next free spin in "
				.. Format.duration(Formulas.freeSpinWait(data.spins.lastFree, now)),
		}
	end
	local index = Formulas.pickWheelSegment(rand)
	local segment = Rewards.Wheel[index]
	local text = RewardService.Grant(player, segment.reward)
	data.stats.spins = (data.stats.spins or 0) + 1
	Services.AnalyticsService.Log(player, "WheelSpin", segment.id)
	if segment.id == "Jackpot" then
		Services.AnnouncementService.Announce(
			player.DisplayName .. " hit the JACKPOT on the wheel!",
			Color3.fromRGB(255, 200, 50),
			false
		)
	end
	return { ok = true, index = index, text = text }
end

-- Group reward -------------------------------------------------------------------------------

function RewardService.RefreshGroup(player: Player)
	if Rewards.GroupId == 0 then
		player:SetAttribute("InGroup", false)
		return
	end
	local ok, inGroup = pcall(function()
		return player:IsInGroup(Rewards.GroupId)
	end)
	player:SetAttribute("InGroup", ok and inGroup == true)
end

function RewardService.ClaimGroup(player: Player): { [string]: any }
	local data = Services.DataService.Get(player)
	if not data then
		return { ok = false, err = "Still loading" }
	end
	if Rewards.GroupId == 0 then
		return { ok = false, err = "Group rewards are coming soon" }
	end
	RewardService.RefreshGroup(player)
	if not player:GetAttribute("InGroup") then
		return { ok = false, err = "Join the group first, then press claim" }
	end
	if data.groupClaimed then
		return { ok = true, text = "Group luck bonus active!" }
	end
	data.groupClaimed = true
	local text = RewardService.Grant(player, Rewards.GroupJoinReward)
	return { ok = true, text = text }
end

function RewardService.OnPlayerReady(player: Player)
	RewardService.RefreshGroup(player)
end

return RewardService
