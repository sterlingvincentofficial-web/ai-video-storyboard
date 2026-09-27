--[[
	Minimal Rojo-style module loader for Lune.

	Lets pure modules that use `require(script.Parent.X)` run outside Roblox:
	every Instance path is mapped onto the matching file or folder under a root directory.
]]

local fs = require("@lune/fs")
local luau = require("@lune/luau")
local roblox = require("@lune/roblox")

local Loader = {}

local baseEnv = getfenv(1)
local moduleCache: { [string]: any } = {}

-- Lune's fs calls can yield, which is not allowed inside metamethods,
-- so the whole tree is scanned up front.
local dirs: { [string]: boolean } = {}
local files: { [string]: string } = {}

local function scan(path: string)
	dirs[path] = true
	for _, name in fs.readDir(path) do
		local child = path .. "/" .. name
		if fs.isDir(child) then
			scan(child)
		elseif name:match("%.luau$") then
			files[child] = fs.readFile(child)
		end
	end
end

local NodeMeta = {}

local function makeNode(path: string, parent: any)
	return setmetatable({ __path = path, __parent = parent }, NodeMeta)
end

NodeMeta.__index = function(node, key)
	if key == "Parent" then
		return rawget(node, "__parent")
	elseif key == "Name" then
		local path = rawget(node, "__path")
		return (path:match("([^/]+)$") or path):gsub("%.luau$", "")
	end
	local base = rawget(node, "__path"):gsub("%.luau$", "")
	local dir = base
	-- A module file's children live in a folder of the same name; a folder's children are inside it.
	if dirs[dir .. "/" .. key] then
		return makeNode(dir .. "/" .. key, node)
	elseif files[dir .. "/" .. key .. ".luau"] then
		return makeNode(dir .. "/" .. key .. ".luau", node)
	end
	error(("%s is not a valid member of %s"):format(tostring(key), base), 2)
end

NodeMeta.__tostring = function(node)
	return "Node(" .. rawget(node, "__path") .. ")"
end

local function loadModule(node)
	local path = rawget(node, "__path")
	local file = path
	if dirs[path] then
		file = path .. "/init.luau"
	end
	if moduleCache[file] ~= nil then
		return moduleCache[file]
	end
	local source = files[file]
	assert(source, "No module at " .. file)
	local env = setmetatable({
		script = node,
		require = function(target)
			if type(target) == "table" and getmetatable(target) == NodeMeta then
				return loadModule(target)
			end
			return require(target)
		end,
		Color3 = roblox.Color3,
		Vector3 = roblox.Vector3,
	}, { __index = baseEnv })
	local chunk = luau.load(source, { debugName = file, environment = env })
	local result = chunk()
	moduleCache[file] = result
	return result
end

-- Returns a node for the given folder, e.g. Loader.root("src/shared")
function Loader.root(path: string)
	scan(path)
	return makeNode(path, nil)
end

function Loader.require(node)
	return loadModule(node)
end

return Loader
