-- Background music: crossfades between the calm, battle and boss loops as the game phase changes,
-- and plays a stinger on victory and game over. The loops come from tools/sfx/make_music.py;
-- until their IDs are pasted into Sounds.luau the game simply has no music.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local SoundService = game:GetService("SoundService")
local TweenService = game:GetService("TweenService")

local Sounds = require(ReplicatedStorage:WaitForChild("Shared"):WaitForChild("Sounds"))

local Music = {}

local state = ReplicatedStorage:WaitForChild("GameState")
local FADE = TweenInfo.new(1.2, Enum.EasingStyle.Sine)

type Track = { sound: Sound, volume: number }

local function make(name: string, looped: boolean): Track?
	local def = Sounds[name]
	if not (def and def.Id) then
		return nil
	end
	local s = Instance.new("Sound")
	s.Name = name
	s.SoundId = `rbxassetid://{def.Id}`
	s.Looped = looped
	s.Volume = 0
	s.Parent = SoundService
	return { sound = s, volume = def.Volume }
end

local loops: { [string]: Track? } = {
	Calm = make("MusicCalm", true),
	Battle = make("MusicBattle", true),
	Boss = make("MusicBoss", true),
}
local stingers: { [string]: Track? } = {
	Victory = make("MusicVictory", false),
	GameOver = make("MusicGameOver", false),
}

Music.enabled = true
local suppressed = false -- this player's own intro is playing (it has its own sound)
local current: string? = nil

-- Which loop fits the moment (nil = silence: intros have their own sound, game over and
-- victory their stingers).
local function wanted(): string?
	if not Music.enabled or suppressed then
		return nil
	end
	local phase = state:GetAttribute("Phase")
	if phase == "Intro" or phase == "GameOver" or phase == "Victory" then
		return nil
	elseif phase == "Wave" then
		return if (state:GetAttribute("Boss") or "") ~= "" then "Boss" else "Battle"
	end
	return "Calm" -- Intermission
end

local function fadeTo(name: string?)
	if name == current then
		return
	end
	current = name
	for key, track in loops do
		if not track then
			continue
		end
		local on = key == name
		if on and not track.sound.IsPlaying then
			track.sound.TimePosition = 0
			track.sound:Play()
		end
		local tween = TweenService:Create(track.sound, FADE, { Volume = if on then track.volume else 0 })
		tween:Play()
		if not on then
			tween.Completed:Once(function(playback: Enum.PlaybackState)
				-- a newer fade cancelling this one also fires Completed: only stop a finished fade-out
				if playback == Enum.PlaybackState.Completed and current ~= key then
					track.sound:Stop()
				end
			end)
		end
	end
end

local function refresh()
	fadeTo(wanted())
end

function Music.stinger(name: string)
	local track = stingers[name]
	if track and Music.enabled then
		track.sound.Volume = track.volume
		track.sound.TimePosition = 0
		track.sound:Play()
	end
end

function Music.setEnabled(on: boolean)
	Music.enabled = on
	if not on then
		for _, track in stingers do
			if track then
				track.sound:Stop()
			end
		end
	end
	refresh()
end

-- The intro cutscene silences the music while it plays (also for players who join mid-game).
function Music.setSuppressed(on: boolean)
	suppressed = on
	refresh()
end

function Music.hasMusic(): boolean
	return next(loops) ~= nil
end

function Music.gameEvent(kind: string)
	if kind == "Victory" then
		Music.stinger("Victory")
	elseif kind == "GameOver" then
		Music.stinger("GameOver")
	end
end

state:GetAttributeChangedSignal("Phase"):Connect(refresh)
state:GetAttributeChangedSignal("Boss"):Connect(refresh)
refresh()

return Music
