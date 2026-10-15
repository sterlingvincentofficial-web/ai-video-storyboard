--!strict
-- The game's logo. Upload marketing/final/logo.png as an image (Studio: Asset Manager → Bulk
-- Import, or View → Asset Manager → Images) and paste its image id here; the intro's title card
-- then slams in the logo instead of the plain text title. Use the image id, not a Decal's id
-- (they differ). If the image hasn't loaded or is still in moderation, the text title shows.

return {
	Logo = nil :: number?, -- e.g. 1234567890
	LogoAspect = 1024 / 579, -- width / height of marketing/final/logo.png
}
