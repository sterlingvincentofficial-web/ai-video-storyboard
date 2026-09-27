--[[
	Roblox Analytics: the new-player funnel, economy sources/sinks and a few custom events,
	so after launch the Creator Dashboard shows where players drop off.
	Every call is wrapped in pcall; analytics must never break gameplay.
]]

local RobloxAnalytics = game:GetService("AnalyticsService")

local Services = require(script.Parent.Parent.Registry)

local AnalyticsService = {}

-- Onboarding funnel steps, in order. Each is logged once per player (tracked in save data).
AnalyticsService.Funnel = {
	"Joined",
	"FirstDive",
	"FirstChestOpened",
	"FirstCollect",
	"FirstRoll",
	"FirstUpgrade",
	"FirstRebirth",
}

local function safe(fn: () -> ())
	local ok, err = pcall(fn :: any)
	if not ok then
		-- analytics can be unavailable in Studio; ignore quietly
		local _ = err
	end
end

function AnalyticsService.Log(player: Player, eventName: string, label: string?)
	safe(function()
		local fields = if label then { CustomField01 = label } else nil;
		(RobloxAnalytics :: any):LogCustomEvent(player, eventName, 1, fields)
	end)
end

-- Logs a funnel step once per player, in order.
function AnalyticsService.Step(player: Player, stepName: string)
	local data = Services.DataService.Get(player)
	if not data then
		return
	end
	local step = table.find(AnalyticsService.Funnel, stepName)
	if not step or data.funnel[stepName] then
		return
	end
	data.funnel[stepName] = true
	safe(function()
		(RobloxAnalytics :: any):LogOnboardingFunnelStepEvent(player, step, stepName)
	end)
end

-- Economy: `amount` of cash gained (source) or spent (sink) for `reason`.
function AnalyticsService.Economy(player: Player, isSource: boolean, amount: number, reason: string)
	local data = Services.DataService.Get(player)
	if not data or amount <= 0 then
		return
	end
	safe(function()
		(RobloxAnalytics :: any):LogEconomyEvent(
			player,
			if isSource then Enum.AnalyticsEconomyFlowType.Source else Enum.AnalyticsEconomyFlowType.Sink,
			"Cash",
			math.floor(amount),
			math.floor(data.cash),
			reason
		)
	end)
end

return AnalyticsService
