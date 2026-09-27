--[[
	World layout. Everything is positioned relative to a plot CFrame whose local +Z
	points from the dock toward the open channel in the middle of the map.
]]

local Layout = {}

Layout.WaterLevel = 0
Layout.SeaFloor = -40
Layout.TrenchBottom = -340
Layout.DeckTop = 4

-- Six plots: three on each side of a central channel, facing each other.
Layout.Plots = {} :: { CFrame }
for _, x in { -160, 0, 160 } do
	table.insert(Layout.Plots, CFrame.new(x, 0, -120))
	table.insert(Layout.Plots, CFrame.new(x, 0, 120) * CFrame.Angles(0, math.pi, 0))
end

-- Deck (local space)
Layout.DeckCenter = CFrame.new(0, Layout.DeckTop - 1, -12)
Layout.DeckSize = Vector3.new(130, 2, 64)
Layout.DeckFrontZ = 20

-- Trench box (local space, x/z footprint)
Layout.TrenchCenterZ = 46
Layout.TrenchSize = Vector3.new(128, 0, 48)

-- Spawn point on the deck
Layout.Spawn = CFrame.new(0, Layout.DeckTop + 3, 0)

-- Kraken rises in the middle of the channel
Layout.KrakenPosition = Vector3.new(0, -14, 0)

-- Harbor (fallback spawn)
Layout.Harbor = CFrame.new(-290, 0, 0)

local SLOT_COUNT = 10
local SLOT_SPACING = 11

function Layout.slotX(slot: number): number
	return -((SLOT_COUNT - 1) * SLOT_SPACING) / 2 + (slot - 1) * SLOT_SPACING
end

-- Where a diver stands, facing the trench.
function Layout.slotHome(slot: number): CFrame
	local x = Layout.slotX(slot)
	return CFrame.lookAt(Vector3.new(x, Layout.DeckTop + 0.1, 14), Vector3.new(x, Layout.DeckTop + 0.1, 30))
end

-- Where a diver hits the water.
function Layout.slotEntry(slot: number): Vector3
	return Vector3.new(Layout.slotX(slot), Layout.WaterLevel, 32)
end

-- Pedestals: two rows of eight in the vault at the back of the deck.
function Layout.pedestalPosition(index: number): Vector3
	local row = if index <= 8 then 0 else 1
	local column = (index - 1) % 8
	local x = -42 + column * 12
	local z = if row == 0 then -20 else -36
	return Vector3.new(x, Layout.DeckTop, z)
end

return Layout
