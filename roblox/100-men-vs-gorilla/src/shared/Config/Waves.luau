--!strict
-- Wave recipes. Waves 1-100 are generated from a budget that grows each wave; new monkey
-- types unlock as you go, and every 10th wave is a gorilla boss with an escort.

export type Group = { Type: string, Count: number, Gap: number, Path: string? }
export type Wave = { Number: number, Groups: { Group }, HealthMult: number, Boss: string? }

local Waves = {}

Waves.Total = 100
Waves.Intermission = 8 -- seconds between waves
Waves.FirstDelay = 12

-- type -> { unlock wave, budget cost per monkey }
local POOL = {
	{ "Monkey", 1, 1 },
	{ "Speedy", 3, 1.4 },
	{ "Baby", 5, 0.45 },
	{ "Chucker", 7, 2 },
	{ "Brute", 9, 5 },
	{ "Ninja", 12, 2.5 },
}

local BOSSES = { [10] = "Silverback", [20] = "RockThrower", [30] = "Berserker", [40] = "Alpha", [100] = "Titan" }
local BOSS_CYCLE = { "Silverback", "RockThrower", "Berserker", "Alpha" }
local PATHS = { "North", "West", "East" }

function Waves.get(n: number): Wave
	local rng = Random.new(n * 7919)
	local groups: { Group } = {}
	local budget = 6 + n * 3.2 + (n ^ 1.35)
	local unlocked = {}
	for _, entry in POOL do
		if n >= entry[2] then
			table.insert(unlocked, entry)
		end
	end
	-- the newest unlock gets a showcase group the wave it appears
	for _, entry in POOL do
		if n == entry[2] and n > 1 then
			table.insert(groups, { Type = entry[1], Count = 6, Gap = 0.5, Path = PATHS[rng:NextInteger(1, 3)] })
			budget -= 6 * entry[3]
		end
	end
	local paths = math.clamp(1 + math.floor(n / 4), 1, 3)
	while budget > 0 do
		local entry = unlocked[rng:NextInteger(1, #unlocked)]
		local count = if entry[1] == "Baby" then rng:NextInteger(8, 14) else rng:NextInteger(3, 8)
		table.insert(groups, {
			Type = entry[1],
			Count = count,
			Gap = if entry[1] == "Baby" then 0.18 else rng:NextNumber(0.35, 0.8),
			Path = PATHS[rng:NextInteger(1, paths)],
		})
		budget -= count * entry[3]
	end
	local boss = BOSSES[n] or (if n % 10 == 0 then BOSS_CYCLE[(n // 10 - 1) % 4 + 1] else nil)
	return {
		Number = n,
		Groups = groups,
		HealthMult = 1.045 ^ (n - 1),
		Boss = boss,
	}
end

return Waves
