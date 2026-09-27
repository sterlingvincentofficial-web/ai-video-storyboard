--[[
	Client entry point.
]]

local Players = game:GetService("Players")

local State = require(script.Parent.State)
local App = require(script.Parent.UI.App)
local DiverAnimator = require(script.Parent.Controllers.DiverAnimator)
local WorldFx = require(script.Parent.Controllers.WorldFx)
local ChatTags = require(script.Parent.Controllers.ChatTags)
local TutorialGuide = require(script.Parent.Controllers.TutorialGuide)

State.start()
App.start()
DiverAnimator.start()
WorldFx.start()
ChatTags.start()
TutorialGuide.start()

local player = Players.LocalPlayer
if not player:GetAttribute("Ready") then
	player:GetAttributeChangedSignal("Ready"):Wait()
end
