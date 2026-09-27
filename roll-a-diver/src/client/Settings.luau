--[[
	Client settings (sound, low graphics, hide other docks). Loaded from save data on the
	first sync, changed from the Settings panel, read by the sound and effects code.
]]

local Shared = game:GetService("ReplicatedStorage").Shared
local Signal = require(Shared.Util.Signal)

local Settings = {}

Settings.Changed = Signal.new()

local current = { sfx = true, lowGraphics = false, hideOthers = false }
local loaded = false

function Settings.get(): { [string]: boolean }
	return table.clone(current)
end

function Settings.is(key: string): boolean
	return current[key] == true
end

function Settings.apply(values: { [string]: any })
	for key in current do
		if type(values[key]) == "boolean" then
			current[key] = values[key]
		end
	end
	Settings.Changed:Fire(Settings.get())
end

-- Called with every state sync; only the first one loads the saved settings.
function Settings.load(data: { [string]: any }?)
	if loaded or not data or type(data.settings) ~= "table" then
		return
	end
	loaded = true
	Settings.apply(data.settings)
end

return Settings
