--[[
	Server-wide announcements for rare finds, plus optional cross-server announcements
	for the very rarest (Divine / Secret / Glitched) through MessagingService.
]]

local MessagingService = game:GetService("MessagingService")

local Shared = game:GetService("ReplicatedStorage").Shared
local GameConfig = require(Shared.Config.Game)
local Remotes = require(Shared.Remotes)

local AnnouncementService = {}

local TOPIC = "RollADiverAnnouncements"

function AnnouncementService.Announce(text: string, color: Color3, crossServer: boolean?)
	Remotes.event("Announce"):FireAllClients(text, color)
	if crossServer and GameConfig.CrossServerAnnouncements and game.JobId ~= "" then
		task.spawn(function()
			pcall(function()
				MessagingService:PublishAsync(TOPIC, {
					text = text,
					color = color:ToHex(),
					job = game.JobId,
				})
			end)
		end)
	end
end

function AnnouncementService.Start()
	if not GameConfig.CrossServerAnnouncements or game.JobId == "" then
		return
	end
	task.spawn(function()
		pcall(function()
			MessagingService:SubscribeAsync(TOPIC, function(message)
				local payload = message.Data
				if type(payload) ~= "table" or payload.job == game.JobId then
					return
				end
				local ok, color = pcall(Color3.fromHex, payload.color)
				Remotes.event("Announce")
					:FireAllClients("🌍 " .. tostring(payload.text), if ok then color else Color3.new(1, 1, 1))
			end)
		end)
	end)
end

return AnnouncementService
