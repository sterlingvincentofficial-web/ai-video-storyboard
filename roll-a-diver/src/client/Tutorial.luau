--[[
	New-player tutorial: works out the current step from the player's stats.
	Each step has the hint text, an optional world target (a part on the player's own dock)
	and an optional menu button to highlight.
]]

local Tutorial = {}

export type Step = {
	id: string,
	text: string,
	worldTarget: string?, -- name of a part inside the player's plot model
	menu: string?, -- menu entry id to pulse
}

function Tutorial.step(data: { [string]: any }?): Step?
	if not data then
		return nil
	end
	local stats = data.stats
	if stats.dives == 0 then
		return {
			id = "Dive",
			text = "Your diver is exploring the dark trench... watch them come back up!",
			worldTarget = "DivingBoard1",
		}
	elseif stats.chestsOpened == 0 and #data.chests > 0 then
		return { id = "Open", text = "Open your chest! Tap 📦 Chests", menu = "Chests" }
	elseif stats.collected == 0 then
		return {
			id = "Collect",
			text = "Walk onto the green pad in front of your treasure to collect cash",
			worldTarget = "CollectPad1",
		}
	elseif stats.rolls == 0 then
		return { id = "Roll", text = "Roll a new diver! Tap 🎲 Roll", menu = "Roll" }
	elseif data.upgrades.DiveSlots == 0 and data.upgrades.Pedestals == 0 then
		return { id = "Upgrade", text = "Buy an upgrade to grow your dock! Tap ⬆ Upgrade", menu = "Upgrades" }
	end
	return nil
end

return Tutorial
