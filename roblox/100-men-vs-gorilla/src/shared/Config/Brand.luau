--!strict
-- The game's logo. Upload marketing/final/logo.png as a Decal (Creator Dashboard or Studio's
-- Asset Manager), then paste its image id here; the intro's title card shows it instead of the
-- plain text title. Leave nil to keep the text.

return {
	Logo = nil :: number?, -- e.g. 1234567890
	LogoAspect = 1024 / 579, -- width / height of marketing/final/logo.png
}
