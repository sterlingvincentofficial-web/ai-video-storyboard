--[[
	Service registry. Main.server fills it before any service starts,
	so services can reach each other at runtime (never at require time) without circular requires.
]]

return {} :: { [string]: any }
