--!strict
-- Placeable men. Each level is a full look: body colors, clothing templates and gear.
-- ShirtTemplate/PantsTemplate: upload assets/men/*.png in Studio (Asset Manager > Bulk Import),
-- then paste the image IDs here. Until then the body colors stand in for the outfit.

export type Look = {
	Skin: Color3,
	ShirtColor: Color3, -- fallback torso color when there is no shirt template
	PantsColor: Color3, -- fallback leg color when there is no pants template
	ShirtTemplate: number?,
	PantsTemplate: number?,
	Gear: { string }, -- names from MenFactory.GEAR
	HeadbandColor: Color3?,
	WrapColor: Color3?,
}

export type Level = {
	Cost: number,
	Damage: number,
	Range: number,
	Cooldown: number,
	Look: Look,
}

local SKIN = Color3.fromRGB(234, 184, 146)

local Units = {
	Brawler = {
		DisplayName = "Brawler",
		Levels = {
			[1] = {
				Cost = 100,
				Damage = 12,
				Range = 6,
				Cooldown = 0.8,
				Look = {
					Skin = SKIN,
					ShirtColor = Color3.fromRGB(240, 240, 234),
					PantsColor = Color3.fromRGB(46, 78, 132),
					ShirtTemplate = nil, -- Brawler_Shirt.png
					PantsTemplate = nil, -- Brawler_Pants.png
					Gear = { "Headband", "HandWraps" },
					HeadbandColor = Color3.fromRGB(205, 35, 35),
					WrapColor = Color3.fromRGB(235, 232, 220),
				},
			},
		},
	},
}

return Units
