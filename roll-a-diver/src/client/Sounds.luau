--[[
	UI sounds using Roblox's built-in sound files (no uploads needed).
	Swap the ids for your own audio later.
]]

local SoundService = game:GetService("SoundService")

local Settings = require(script.Parent.Settings)

local Sounds = {}

local IDS = {
	Click = "rbxasset://sounds/button.wav",
	Coin = "rbxasset://sounds/electronicpingshort.wav",
	Reveal = "rbxasset://sounds/electronicpingshort.wav",
}

local cache: { [string]: Sound } = {}

function Sounds.play(name: string, volume: number?, pitch: number?)
	local id = IDS[name]
	if not id or not Settings.is("sfx") then
		return
	end
	local sound: Sound = cache[name] or Instance.new("Sound")
	if not cache[name] then
		sound.SoundId = id
		sound.Parent = SoundService
		cache[name] = sound
	end
	sound.Volume = volume or 0.5
	sound.PlaybackSpeed = pitch or 1
	SoundService:PlayLocalSound(sound)
end

return Sounds
