--[[
	Adds a [VIP] tag in front of chat messages from VIP pass owners.
]]

local Players = game:GetService("Players")
local TextChatService = game:GetService("TextChatService")

local ChatTags = {}

function ChatTags.start()
	if TextChatService.ChatVersion ~= Enum.ChatVersion.TextChatService then
		return
	end
	TextChatService.OnIncomingMessage = function(message: TextChatMessage): any
		local source = message.TextSource
		local player = source and Players:GetPlayerByUserId(source.UserId)
		if player and player:GetAttribute("VIP") then
			local properties = Instance.new("TextChatMessageProperties")
			properties.PrefixText = "<font color='#FFD24A'>[VIP]</font> " .. message.PrefixText
			return properties
		end
		return nil
	end
end

return ChatTags
