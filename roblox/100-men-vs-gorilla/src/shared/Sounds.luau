--!strict
-- Every sound the game plays. Upload the matching file from assets/sfx (Asset Manager > Bulk
-- Import), paste its ID into `Id`. Until then the built-in Roblox sound in `Fallback` plays.

export type SoundDef = { Id: number?, Fallback: string, Volume: number }

local Sounds: { [string]: SoundDef } = {
	Pop = { Id = nil, Fallback = "rbxasset://sounds/electronicpingshort.wav", Volume = 0.55 }, -- pop.wav
	Bonk = { Id = nil, Fallback = "rbxasset://sounds/collide.wav", Volume = 0.7 }, -- bonk.wav
	Boing = { Id = nil, Fallback = "rbxasset://sounds/action_jump.mp3", Volume = 0.6 }, -- boing.wav
	Hit = { Id = nil, Fallback = "rbxasset://sounds/collide.wav", Volume = 0.35 }, -- hit.wav
	Clank = { Id = nil, Fallback = "rbxasset://sounds/collide.wav", Volume = 0.5 }, -- clank.wav
	Swing = { Id = nil, Fallback = "rbxasset://sounds/swordslash.wav", Volume = 0.45 }, -- swing.wav
	Chop = { Id = nil, Fallback = "rbxasset://sounds/swordslash.wav", Volume = 0.6 }, -- chop.wav
	Sling = { Id = nil, Fallback = "rbxasset://sounds/swordlunge.wav", Volume = 0.4 }, -- sling.wav
	Shot = { Id = nil, Fallback = "rbxasset://sounds/Rocket shot.wav", Volume = 0.45 }, -- shot.wav
	Throw = { Id = nil, Fallback = "rbxasset://sounds/swordlunge.wav", Volume = 0.5 }, -- throw.wav
	Boom = { Id = nil, Fallback = "rbxasset://sounds/collide.wav", Volume = 0.9 }, -- boom.wav
	NetShot = { Id = nil, Fallback = "rbxasset://sounds/swordlunge.wav", Volume = 0.5 }, -- net.wav
	Coin = { Id = nil, Fallback = "rbxasset://sounds/electronicpingshort.wav", Volume = 0.35 }, -- coin.wav
	Combo = { Id = nil, Fallback = "rbxasset://sounds/electronicpingshort.wav", Volume = 0.55 }, -- combo.wav
	Squeak = { Id = nil, Fallback = "rbxasset://sounds/action_jump.mp3", Volume = 0.5 }, -- squeak.wav
	Whee = { Id = nil, Fallback = "rbxasset://sounds/action_falling.mp3", Volume = 0.5 }, -- whee.wav
	Thud = { Id = nil, Fallback = "rbxasset://sounds/action_jump_land.mp3", Volume = 0.6 }, -- thud.wav
	Roar = { Id = nil, Fallback = "rbxasset://sounds/action_falling.mp3", Volume = 0.9 }, -- roar.wav
	Slam = { Id = nil, Fallback = "rbxasset://sounds/collide.wav", Volume = 1 }, -- slam.wav
	Place = { Id = nil, Fallback = "rbxasset://sounds/action_jump_land.mp3", Volume = 0.6 }, -- place.wav
	LevelUp = { Id = nil, Fallback = "rbxasset://sounds/victory.wav", Volume = 0.5 }, -- levelup.wav
	Horn = { Id = nil, Fallback = "rbxasset://sounds/victory.wav", Volume = 0.6 }, -- horn.wav
	Heal = { Id = nil, Fallback = "rbxasset://sounds/electronicpingshort.wav", Volume = 0.4 }, -- heal.wav
	Rally = { Id = nil, Fallback = "rbxasset://sounds/victory.wav", Volume = 0.45 }, -- rally.wav
	Ui = { Id = nil, Fallback = "rbxasset://sounds/button.wav", Volume = 0.5 }, -- ui.wav
	Deny = { Id = nil, Fallback = "rbxasset://sounds/clickfast.wav", Volume = 0.5 }, -- deny.wav
	BossDown = { Id = nil, Fallback = "rbxasset://sounds/victory.wav", Volume = 1 }, -- bossdown.wav
}

return Sounds
