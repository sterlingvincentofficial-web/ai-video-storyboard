# Marketing art

Upload these on the Creator Dashboard (your experience → Places/Experience → Basic Info / Thumbnails).

| File | Use |
|---|---|
| `final/icon.jpg` | Game icon (512x512). `icon_alt.jpg`, `icon_alt2.jpg` are alternates. |
| `final/thumb_1_temple.jpg` … `thumb_7_stomp.jpg` | Thumbnails (1920x1080). Suggested order: 1 temple, 2 charge, 3 bananas, 4 waves, 5 upgrade, 6 squad, 7 stomp. |
| `final/logo.png` | Transparent logo (brick letters). Upload it as an image (Studio Asset Manager), then paste its image id (not a Decal id) into `src/shared/Config/Brand.luau` (`Logo`) and the intro's title card slams it in instead of the text title. `logo_alt.png` is the flat-type version. |

`refs/` holds renders of the real game (army, monkeys, bosses, map, gameplay) that the art used as
references, so it shows what's actually in the game. The art was generated with Higgsfield
(GPT Image 2.5, high quality, 2K); the full-size originals are in the Higgsfield library.
