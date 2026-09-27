--[[
	Server entry point: loads every service into the registry, then runs Init (setup) and Start (loops/events).
]]

local Services = require(script.Parent.Registry)
local folder = script.Parent.Services

-- Init order matters: the world and plots exist before players load.
local ORDER = {
	"WorldBuilder",
	"PlotService",
	"DataService",
	"EconomyService",
	"AnalyticsService",
	"RewardService",
	"LeaderboardService",
	"MarketService",
	"AnnouncementService",
	"EventService",
	"KrakenService",
	"VaultService",
	"ChestService",
	"DiverService",
	"RollService",
	"UpgradeService",
	"RebirthService",
	"ActionService",
	"AdminService",
	"SelfTest",
	"PlayerService",
}

for _, name in ORDER do
	Services[name] = (require :: any)(folder:WaitForChild(name))
end

-- Each service starts in isolation: one failing optional system (e.g. leaderboards when
-- DataStores are down) must never stop players from loading in.
local function run(phase: string, name: string, fn: () -> ())
	local ok, err = pcall(fn :: any)
	if not ok then
		warn(("[Roll a Diver] %s.%s failed: %s"):format(name, phase, tostring(err)))
	end
end

for _, name in ORDER do
	local service = Services[name]
	if service.Init then
		run("Init", name, service.Init)
	end
end

for _, name in ORDER do
	local service = Services[name]
	if service.Start then
		run("Start", name, service.Start)
	end
end

print("[Roll a Diver] server ready")
