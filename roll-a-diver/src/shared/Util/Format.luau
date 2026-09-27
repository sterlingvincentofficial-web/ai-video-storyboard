--[[
	Number and text formatting for UI.
]]

local Format = {}

local SUFFIXES = { "", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc" }

-- 1234 -> "1.23K", 12 -> "12", 0.5 -> "0.5"
function Format.number(value: number): string
	if value ~= value then
		return "0"
	end
	local negative = value < 0
	value = math.abs(value)
	local text
	if value < 1000 then
		if value < 10 and value ~= math.floor(value) then
			text = string.format("%.1f", value)
		else
			text = tostring(math.floor(value))
		end
	else
		local tier = math.min(math.floor(math.log10(value) / 3), #SUFFIXES - 1)
		local scaled = value / 10 ^ (tier * 3)
		if scaled >= 100 then
			text = string.format("%d", math.floor(scaled))
		elseif scaled >= 10 then
			text = string.format("%.1f", math.floor(scaled * 10) / 10)
		else
			text = string.format("%.2f", math.floor(scaled * 100) / 100)
		end
		text = text:gsub("%.?0+$", "") .. SUFFIXES[tier + 1]
	end
	return if negative then "-" .. text else text
end

function Format.money(value: number): string
	return "$" .. Format.number(value)
end

function Format.perSecond(value: number): string
	return "$" .. Format.number(value) .. "/s"
end

-- "1 in 1.2K"
function Format.odds(odds: number): string
	return "1 in " .. Format.number(math.floor(odds + 0.5))
end

-- 125 -> "2m 5s", 3700 -> "1h 1m"
function Format.duration(seconds: number): string
	seconds = math.max(0, math.floor(seconds))
	local hours = math.floor(seconds / 3600)
	local minutes = math.floor((seconds % 3600) / 60)
	local secs = seconds % 60
	if hours > 0 then
		return string.format("%dh %dm", hours, minutes)
	elseif minutes > 0 then
		return string.format("%dm %ds", minutes, secs)
	end
	return string.format("%ds", secs)
end

-- 1234 -> "-1,234m"
function Format.depth(metres: number): string
	local whole = tostring(math.floor(metres))
	local withCommas = whole:reverse():gsub("(%d%d%d)", "%1,"):reverse():gsub("^,", "")
	return "-" .. withCommas .. "m"
end

function Format.multiplier(value: number): string
	if value == math.floor(value) then
		return "x" .. tostring(value)
	end
	return "x" .. string.format("%.2f", value):gsub("0+$", "")
end

return Format
