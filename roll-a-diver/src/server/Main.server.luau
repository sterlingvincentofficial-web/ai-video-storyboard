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
	"PlayerService",
}

for _, name in ORDER do
	Services[name] = (require :: any)(folder:WaitForChild(name))
end

for _, name in ORDER do
	local service = Services[name]
	if service.Init then
		service.Init()
	end
end

for _, name in ORDER do
	local service = Services[name]
	if service.Start then
		service.Start()
	end
end

print("[Roll a Diver] server ready")
