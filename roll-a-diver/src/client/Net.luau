--[[
	Calls server actions. Net.try shows the error as a toast when the action fails.
]]

local Shared = game:GetService("ReplicatedStorage").Shared
local Remotes = require(Shared.Remotes)

local Net = {}

Net.onError = nil :: ((string) -> ())?

function Net.action(name: string, ...: any): { [string]: any }
	local remote = Remotes.func("Action")
	local ok, response = pcall(remote.InvokeServer, remote, name, ...)
	if not ok or type(response) ~= "table" then
		return { ok = false, err = "Connection problem, try again" }
	end
	return response
end

function Net.try(name: string, ...: any): { [string]: any }
	local response = Net.action(name, ...)
	if not response.ok and response.err and Net.onError then
		Net.onError(response.err)
	end
	return response
end

return Net
