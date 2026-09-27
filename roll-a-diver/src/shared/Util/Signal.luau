--[[
	Tiny signal implementation (Connect / Once / Fire / Wait).
]]

export type Connection = { Disconnect: (self: Connection) -> () }

local Signal = {}
Signal.__index = Signal

function Signal.new(): any
	return setmetatable({ _handlers = {} :: { [any]: (...any) -> () } }, Signal)
end

function Signal:Connect(handler: (...any) -> ())
	local key = {}
	self._handlers[key] = handler
	return {
		Disconnect = function()
			self._handlers[key] = nil
		end,
	}
end

function Signal:Once(handler: (...any) -> ())
	local connection
	connection = self:Connect(function(...)
		connection.Disconnect()
		handler(...)
	end)
	return connection
end

function Signal:Fire(...)
	for _, handler in self._handlers do
		task.spawn(handler, ...)
	end
end

function Signal:Wait()
	local thread = coroutine.running()
	self:Once(function(...)
		task.spawn(thread, ...)
	end)
	return coroutine.yield()
end

return Signal
