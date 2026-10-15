--!strict
-- Monkey routes as polylines measured in studs. Server and clients both turn an enemy's
-- "progress along its path" into a position with these functions, so they always agree.

local PathUtil = {}

export type Path = {
	name: string,
	points: { Vector3 },
	cum: { number }, -- distance from the start to each point
	length: number,
}

function PathUtil.new(name: string, points: { Vector3 }): Path
	local cum = { 0 }
	for i = 2, #points do
		cum[i] = cum[i - 1] + (points[i] - points[i - 1]).Magnitude
	end
	return { name = name, points = points, cum = cum, length = cum[#cum] }
end

-- Position and travel direction (unit vector, flat) at `distance` along the path.
function PathUtil.sample(path: Path, distance: number): (Vector3, Vector3)
	local pts, cum = path.points, path.cum
	local d = math.clamp(distance, 0, path.length)
	local i = 1
	-- paths are short (< 12 points), a linear scan is fastest
	while i < #pts - 1 and cum[i + 1] < d do
		i += 1
	end
	local a, b = pts[i], pts[i + 1]
	local segLen = cum[i + 1] - cum[i]
	local t = if segLen > 0 then (d - cum[i]) / segLen else 0
	local dir = b - a
	local flat = Vector3.new(dir.X, 0, dir.Z)
	if flat.Magnitude < 1e-3 then
		flat = Vector3.new(0, 0, -1)
	end
	return a:Lerp(b, t), flat.Unit
end

-- Position with a sideways lane offset so crowds spread across the trail.
function PathUtil.sampleLane(path: Path, distance: number, lane: number): (Vector3, Vector3)
	local pos, dir = PathUtil.sample(path, distance)
	local right = Vector3.new(-dir.Z, 0, dir.X)
	return pos + right * lane, dir
end

-- Flat distance from `pos` to the nearest segment of any path (placement checks).
function PathUtil.distanceToPaths(paths: { [string]: Path }, pos: Vector3): number
	local best = math.huge
	local p = Vector3.new(pos.X, 0, pos.Z)
	for _, path in paths do
		local pts = path.points
		for i = 1, #pts - 1 do
			local a = Vector3.new(pts[i].X, 0, pts[i].Z)
			local b = Vector3.new(pts[i + 1].X, 0, pts[i + 1].Z)
			local ab = b - a
			local len2 = ab:Dot(ab)
			local t = if len2 > 0 then math.clamp((p - a):Dot(ab) / len2, 0, 1) else 0
			best = math.min(best, (a + ab * t - p).Magnitude)
		end
	end
	return best
end

-- All map paths, built once from MapData.
function PathUtil.fromMapData(mapData: any): { [string]: Path }
	local out = {}
	for name, points in mapData.Paths do
		out[name] = PathUtil.new(name, points)
	end
	return out
end

return PathUtil
