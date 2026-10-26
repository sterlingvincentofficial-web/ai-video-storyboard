# IP and Roblox-Policy Boundaries for a Roblox Game Inspired by a Viral Indie Game

> Not legal advice. US-law focus, current as of late October 2026.
> **Method note:** WebFetch and curl via the proxy were both blocked for every target host tried (create.roblox.com, gamerant.com, gamesbeat.com: DNS failures or proxy `connect_rejected` 403). **Everything below comes from search-engine result summaries, not full-page reads.** Quotes and figures are as summarized by the search tool; check key claims against the live pages before publishing.

## Copyright/trademark basics: what can and cannot be taken (mechanics vs. expression)

### Takeaway
In US law, game rules and mechanics are not copyrightable ideas. The protected parts are the expression: art, audio, code, characters, specific visual presentation (playfield dimensions, piece shapes, "look and feel") and sometimes trade dress. Clones that copy both the mechanics and the visual expression lose (Tetris v. Xio; Triple Town v. Yeti Town). Clones that copy only the mechanics and re-skin them with a different theme and art can win (DaVinci v. Ziko). Titles and logos are a separate trademark risk.

### Cited Findings
- **Idea/expression:** "While the 'idea' of a falling-blocks puzzle game cannot be protected under copyright law, the expression of that idea can be." Code, characters, sounds and artwork are separately protectable layers. — [Stones Law, "Cloning video games is copyright infringement"](https://www.stoneslaw.net/cloning-video-games-is-copyright-infringement)
- **Tetris Holding v. Xio Interactive (D.N.J. 2012, 863 F. Supp. 2d 394):** Judge Wolfson applied the Abstraction-Filtration-Comparison test and found that the audio-visual expression is protectable even though the rules are not. That expression includes the style, shape, color and movement of the pieces and the dimensions of the playing field. Xio's clone *Mino* copied the playfield dimensions and block shapes. The court rejected Xio's "we only copied the unprotected rules" defense, along with its merger and scènes à faire arguments, and found **trade dress infringement** as well. — [Wikipedia: Tetris Holding v. Xio](https://en.wikipedia.org/wiki/Tetris_Holding,_LLC_v._Xio_Interactive,_Inc.); [Federal Bar Assn. IP Insight Oct/Nov 2012](https://www.fedbar.org/wp-content/uploads/2012/10/ipinsight-octnov2012-pdf-1.pdf); [Lexplug case brief](https://www.lexplug.com/casebrief/tetris_holding_llc_v_xio_interactive_inc__67ccea0d6345e7e6b35af50d)
- **On trade dress in Tetris:** the court held that "many of the design choices in Tetris are not related to function." — [Swlaw / Game Developer coverage via search summary](https://www.swlaw.com/publication/intellectual-property-issues-for-game-developers-and-operators-part-1-trademarks-101-names-logos-trade-dress-and-protecting-a-brand-before-launch/)
- **Commentary on abstraction:** the "critical fight" in clone cases is over the level of abstraction at which the mechanics are described. Once the plaintiff persuaded the court to define the unprotectable rules at a very high level, its win was "almost assured." — [Federal Bar Assn. IP Insight](https://www.fedbar.org/wp-content/uploads/2012/10/ipinsight-octnov2012-pdf-1.pdf)
- **Spry Fox v. Lolapps/6waves (W.D. Wash. 2012), Triple Town vs. Yeti Town:** A Seattle federal judge denied 6waves' motion to dismiss. The court said mechanics get little protection but the clone's style and expression were too similar. The court analogized Triple Town's gameplay hierarchy to a movie plot. The case settled in October 2012 on confidential financial terms, but Spry Fox took ownership of the Yeti Town IP and the game disappeared from the App Store. Attorney Jack Schecter: "When the court squarely rejected that argument, 6Waves didn't have a whole lot to fall back on." — [Pocket Gamer](https://www.pocketgamer.com/news/6waves-settles-with-spry-fox-in-yeti-town-triple-town-clone-debate/); [MCV/UK](https://mcvuk.com/development-news/triple-town-cloning-suit-settled/); [Wikipedia: Spry Fox v. Lolapps](https://en.wikipedia.org/wiki/Spry_Fox,_LLC_v._Lolapps,_Inc.); [Pocket Gamer: Yeti Town disappears](https://www.pocketgamer.com/articles/045754/r/)
- **DaVinci Editrice v. Ziko Games (S.D. Tex. 2016, 183 F. Supp. 3d 820), Bang! card game:** The games had identical mechanics but different art and theme, and the court found no infringement. Its reasoning: "Unlike a book or movie plot, the rules and procedures, including the winning conditions, that make up a card-game system of play do not themselves produce the artistic or literary content that is the hallmark of protectable expression." The court distinguished Triple Town and compared character interactions to basketball. — [TechRaptor](https://techraptor.net/content/game-mechanics-arent-protected-copyright-according-texas-court-ruling); [MCV/UK](https://www.mcvuk.com/development-news/game-mechanics-cannot-be-protected-by-copyright/); [Legal Moves Law Firm](https://legalmoveslawfirm.com/cloned-tabletop-game-copyright-law/)
- **Tetris vs. DaVinci contrast:** both clones took a preexisting game's rules wholesale. The Tetris clone "also took the visual aesthetic and was likely infringing," while the Bang! clone "re-skinned the game's rules with a new theme and escaped liability." — [Franklin, Kane & Kubinski Games Law Summit Journal (2017)](https://fkks.com/uploads/news/Games-Law-Summit-Journal_Issue-1_2017.04.27_KANE.pdf)
- **Procedural note:** sources differ on whether the DaVinci ruling was a summary judgment or an earlier denial of a preliminary injunction. Mallesons reports the injunction was denied because a jury could reasonably find the games not substantially similar. — [Mallesons Pulse](https://pulse.mallesons.com/?p=7539)
- **Trade dress basics:** trade dress is the overall appearance of a game. Unlike copyright, it arises from use, and for product design the plaintiff generally must show acquired distinctiveness (secondary meaning). It can protect non-copyrightable identifying elements. — [UIC Review of IP Law](https://repository.law.uic.edu/ripl/vol17/iss1/5)
- **Titles/trademarks:** run a clearance search before naming. A conflict can force a retitle or redesign, and a conflicting mark may not be registrable or enforceable. — [Snell & Wilmer, IP Issues for Game Developers Pt. 1](https://www.swlaw.com/publication/intellectual-property-issues-for-game-developers-and-operators-part-1-trademarks-101-names-logos-trade-dress-and-protecting-a-brand-before-launch/); [Vondran Legal, top trademark problems for studios](https://www.vondranlegal.com/top-10-trademark-problems-every-video-game-studio-should-avoid)
- **Other clone suits:** Big Duck Games sued over a Flow Free clone, claiming both copyright and trademark infringement. Wizards of the Coast alleged that Hex cloned Magic: The Gathering (copyright, patent, trade dress). — [Legal Moves Law Firm](https://legalmoveslawfirm.com/new-lawsuits-mobile-game-clones/)
- **Tetris's other clone war:** see Game Developer's piece on Blockles. — [Game Developer](https://www.gamedeveloper.com/game-platforms/exclusive-i-tetris-i-legal-clone-war-versus-i-blockles-i-)

### Inferences
- **Fairly safe to take:** a core loop or genre (e.g., "punch walls to escape," "co-op climbing," "scavenge and sell loot"), win conditions, progression concepts and generic UI conventions.
- **High risk:** the same or a confusingly similar title or logo, copied or traced art, models, sounds, music or code, and a near-identical screen layout and visual style (Tetris-style "look and feel"). Copied distinctive characters, story or level layouts that work like a "plot" (the Triple Town reasoning) are also risky.
- Level layouts were not directly addressed in the cases found. Under the Tetris and Triple Town reasoning, a specific, creative arrangement copied wholesale could count as expression, while generic layouts would likely be filtered out as scènes à faire. This is an inference, not a holding.
- These are district-court rulings, so they are persuasive rather than binding nationwide.

### Gaps
- Primary opinion texts were not read (fetch was blocked). The citations come from secondary summaries.
- No US case found specifically about copying level layouts or music in a game clone. Music is ordinary copyright territory and almost certainly infringing if copied, but no game-clone-specific source was found.
- Non-US notes not researched in depth. Unfair-competition laws, such as in Japan and the EU, may differ.

## Roblox's policies: Terms of Use, Community Standards, DMCA/Rights Manager, penalties, and 2025–2026 changes

### Takeaway
Roblox bans unauthorized use of others' IP and removes infringing content when a rights holder reports it. Rights holders, including those with no Roblox presence, file through Rights Manager or DMCA notices. Roblox does not proactively police experience-level clones: enforcement is complaint-driven. Penalties escalate from takedown and account warnings to permanent termination under a repeat-infringer policy, and Roblox reserves the right to terminate even after a single strike in egregious cases. The biggest 2025–2026 change is the License Manager and Licenses catalog (July 2025, self-serve November 2025), which gives creators a legitimate way to license IP.

### Cited Findings
- **Rules of Conduct:** listed IP violations include "using another developer's code to create your experience without their permission," using another artist's media without permission, and using a brand's logo or designs without permission. — [Roblox Rules of Conduct](https://en.help.roblox.com/hc/en-us/articles/203313410-Roblox-Rules-of-Conduct)
- **IP Guidelines:** Roblox "prohibits the unauthorized use of intellectual property" and removes violating content. It may suspend or terminate repeat or serious offenders. A notice can be filed against content that copies protected expression **"even if it has been modified, including by AI tools."** Specificity about the copied elements helps review. Knowingly false notices or counter-notices are illegal under DMCA §512(f). — [Roblox Creator Hub: IP guidelines](https://create.roblox.com/docs/production/publishing/ip-guidelines)
- **Rights Manager (launched March 2024):** rights holders or authorized representatives can report unauthorized use, **even if they have no Roblox presence**. Filers register and verify their identity, and an authorized representative needs a signed letter on company letterhead. A request can't be edited while under review, and a rejected request can be refiled with more information. — [Roblox docs: Rights Manager](https://create.roblox.com/docs/production/publishing/rights-manager); [DevForum: Introducing Rights Manager](https://devforum.roblox.com/t/introducing-rights-manager/2880717)
- **Only rights holders can report infringement.** Roblox says "only the rights holder can report content that infringes on their intellectual property rights." — summarized in [Windows Central](https://www.windowscentral.com/gaming/how-roblox-theft-is-becoming-a-big-problem) / Roblox docs
- **DMCA process:**
  - After a valid claim, an experience is taken down or disabled, and Roblox generally won't reopen it without the owner's permission unless a counter-notice is filed.
  - After a valid counter-notice, Roblox "will generally restore your content within 10-14 business days, unless we are informed that a lawsuit was filed."
  - Roblox issues a warning on the account.
  - Roblox must adopt and reasonably implement a policy for terminating repeat infringers "in appropriate circumstances."
  - Sources: [Roblox DMCA guidelines](https://create.roblox.com/docs/production/publishing/dmca-guidelines); [videogamelaw substack: Roblox's DMCA process](https://videogamelaw.substack.com/p/robloxs-dmca-process)
- **Repeat-infringer terminations:** a Roblox staff DevForum answer says terminations under this policy are permanent, with an appeal process for mistakes. Roblox may terminate after a single strike in "egregious cases of willful infringement," which it expects to be rare. A DevForum post says the old three-strike system was dropped and that the policy sits in ToU §2(e), changed July 10, 2019 (not verified against the current ToU). — [DevForum: Answers to your recent questions regarding our DMCA policy](https://devforum.roblox.com/t/answers-to-your-recent-questions/256614)
- **Conflicting claim:** a third-party site claims Roblox uses a "three strikes" rule and takes down infringing games within about 24 hours. This is low-authority and conflicts with the DevForum account. — [iota.msp.org (low reliability)](https://iota.msp.org/is-copyright-infringement-in-roblox-games-against-the-tos-a-comprehensive-guide)
- **Developer anecdotes on enforcement quality:**
  - A developer's account was removed right after a DMCA strike, with no undefined "repeat infringer" threshold explained. — [DevForum](https://devforum.roblox.com/t/roblox-moderation-needs-a-fix/3294194)
  - Two simultaneous notices on one asset were counted as separate strikes. — [DevForum](https://devforum.roblox.com/t/dmca-strikes-stacking-on-the-same-asset/4099893)
  - Complaints of false or competitor DMCAs going through without verification. — [DevForum: False DMCA takedown](https://devforum.roblox.com/t/false-dmca-takedown-against-my-game-%E2%80%94-a-wake-up-call-for-roblox-and-developers/4013020); [DevForum: DMCA system has a giant flaw](https://devforum.roblox.com/t/dmca-system-has-a-giant-flaw/3933795)
  - A filer's own game was deleted instead of the infringer's. — [DevForum](https://devforum.roblox.com/t/dmca-report-we-filed-got-our-own-game-deleted-instead-of-the-infringing-one/4539824)
- **Third-party view:** review quality is inconsistent and appeal responses are often boilerplate. — [RoWatcher developer survival guide (opinion)](https://rowatcher.com/news/roblox-content-moderation-a-developer-s-survival-guide)
- **License Manager / Licenses catalog:**
  - Launched July 15, 2025 with Netflix, Lionsgate, Sega and Kodansha. — [Roblox newsroom July 2025](https://about.roblox.com/newsroom/2025/07/roblox-launches-new-licensing-platform-for-experiences); [Roblox IR](https://ir.roblox.com/news/news-details/2025/Roblox-Announces-New-Licensing-Platform-For-Experiences/default.aspx); [DevForum: Licenses Catalog](https://devforum.roblox.com/t/introducing-the-licenses-catalog-for-game-changing-ip-partnerships/3816457)
  - Made self-serve in November 2025, so "any eligible IP holder… brands with registered IP" can offer IP. IP holders register IP, set license terms and scan for usage. The revenue share is typically **10–25%** and is collected automatically. Creators apply in the catalog, or licenses can be offered directly to existing experiences. — [Roblox newsroom Nov 2025: Self-Serve IP Licensing](https://about.roblox.com/newsroom/2025/11/roblox-self-serve-ip-licensing); [TheWrap](https://www.thewrap.com/roblox-opens-ip-license-manager-creators-partners/); [DevForum: License Manager](https://devforum.roblox.com/t/introducing-the-license-manager-and-catalog-for-popular-ips-and-creative-works/3669845)
- **Roblox's 2026 SEC filings** cite the self-serve License Manager as a way to limit IP-infringement exposure. — [Roblox 10-Q Q2 FY2026](https://www.sec.gov/Archives/edgar/data/0001315098/000162828026051082/rblx-20260630.htm); [10-Q Q1 FY2026](https://www.sec.gov/Archives/edgar/data/0001315098/000162828026028904/rblx-20260331.htm)
- **2026 Marketplace change (avatar items, not experiences):** Roblox removed 3D Marketplace items whose meshes, textures or animation data were overly similar to earlier uploads and added checks against copies. — [DevForum: Protecting Original 3D Items on Marketplace](https://devforum.roblox.com/t/protecting-original-3d-items-on-marketplace/4820200)
- **Generative AI:** Roblox has said some AI-generated elements of an experience may not be protectable on their own. — [DevForum: Protecting IP When Using Generative AI](https://devforum.roblox.com/t/protecting-intellectual-property-when-using-generative-ai/2881851)

### Inferences
- **Practical risk:** a Roblox clone of an indie game stays up unless the indie dev, or their publisher or agent, files. The trigger is therefore the original dev's attention and willingness to file. Viral visibility raises both.
- Because filers don't need a Roblox account, a Steam-only dev can still take an experience down.
- If a takedown happens, the whole experience, with its revenue and player base, can vanish, and a strike lands on the account. With unclear repeat-infringer thresholds and reports of stacked strikes, one dispute can endanger an entire creator account and its other games.
- The License Manager makes "I couldn't get a license" a weaker excuse. It only helps, though, if the indie dev has listed their IP.

### Gaps
- No official Roblox data found on average takedown turnaround or how many strikes trigger termination.
- No 2026 Roblox policy change specific to experience-level clones or AI clones was found.
- The current ToU text was not read directly (fetch blocked).

## Real examples of indie IP clones and disputes on Roblox, including "Escape the Walls" (Oct 2026)

### Takeaway
Fast clones of viral indie games are a recurring pattern on Roblox, often AI-assisted and often using the same or a near-identical name: Escape the Walls, PEAK, R.E.P.O., Lethal Company and Find the Needle. Coverage mostly records reputational backlash: indie devs publicly calling clones "slop," and debate over whether to show unreleased games publicly. Confirmed Roblox takedowns are rare. No verified takedown reports were found for Lethal Company, Doors, Pressure or Frontier.

### Cited Findings
- **Escape the Walls (Pandorio Games, London-based, historically mobile):**
  - Gameplay first shown October 14, 2026: punch through walls, break blocks, clear rubble, escape a prison-like chamber. — [Game Rant](https://gamerant.com/escape-the-walls-roblox-clones/); [Quest Board.JP](https://quest-board.jp/en/quests/escape-the-walls/)
  - A Roblox game called "Escape-the-Wall" reportedly appeared October 15, the day after the reveal. Other clones with near-identical names followed, all before the Steam page went live for wishlisting on October 18. — [Game Rant](https://gamerant.com/escape-the-walls-roblox-clones/); [Ralify](https://ralify.net/stories/viral-indie-game-escape-the-walls-faces-immediate-roblox-copycat/)
  - The original video drew about 5.18M views by one report and about 4.5M as of October 16 by another. — [Game Rant](https://gamerant.com/escape-the-walls-roblox-clones/); [Pirat_Nation on X](https://x.com/Pirat_Nation/status/2111744108431569191)
  - Some clone creators said they used AI assistants such as Claude to build their clones. They argued the concept is common and "plagiarism" is an exaggeration. — [Game Rant](https://gamerant.com/escape-the-walls-roblox-clones/); [pixmofu](https://pixmofu.com/articles/escape-the-walls-roblox-clone-claude); [Game Spark via Yahoo! Japan](https://news.yahoo.co.jp/articles/154aad980dc59896f171ad902f8ff34fdbb1cf0a)
  - **Pandorio's response:** Game Rant and Ralify say Pandorio has made no official comment. A Japanese report (pixmofu) says the dev replied "good game" to a clone maker's post. **Unverified, and it conflicts with the "no comment" framing.** — [Ralify](https://ralify.net/stories/viral-indie-game-escape-the-walls-faces-immediate-roblox-copycat/); [pixmofu](https://pixmofu.com/articles/escape-the-walls-roblox-clone-claude)
  - **Fallout:** debate, especially in Japan, over whether to publish ideas or footage before release ("アイデア公開すべきではない," i.e. "ideas shouldn't be made public"). Reports say indie devs are scaling back public tests over fear of AI imitation. — [Game Spark/Yahoo! Japan](https://news.yahoo.co.jp/articles/154aad980dc59896f171ad902f8ff34fdbb1cf0a); [note.com (dala47)](https://note.com/dala47/n/n197f05bd1a88?hl=en); [Player.One: Indie devs afraid of AI cloning, refuse to share demos](https://player.one/indie-devs-are-afraid-ai-cloning-their-games-refuse-share-demos-online-164297)
  - Escape the Walls' Steam page lists the game as coming soon. — [Steam](https://store.steampowered.com/app/5450560/Escape_the_Walls/)
  - **Backlash target:** in the coverage found, it is mostly aimed at the clone makers and at AI-assisted copying, and was not directed at Pandorio.
- **PEAK (Aggro Crab / Landfall), 2025:** the devs said they'd rather players pirate PEAK than play "Cliff," which they called a "microtransaction Roblox slop ripoff," and Landfall endorsed the post. Cliff reportedly passed 6M visits in about two weeks, and another PEAK-like clone, CLIMB, hit 13.9M visits. — [PC Gamer](https://www.pcgamer.com/games/action/peak-dev-would-rather-you-pirate-peak-than-play-a-microtransaction-roblox-slop-ripoff/); [80.lv](https://80.lv/articles/peak-devs-pirate-our-game-don-t-play-the-roblox-ripoff); [Newsweek](https://www.newsweek.com/entertainment/video-games/peak-developers-say-theyd-rather-you-pirate-it-play-roblox-slop-ripoff-2109059); [CBR](https://www.cbr.com/peak-roblox-rip-off-plagiarism/); [Windows Central](https://www.windowscentral.com/gaming/how-roblox-theft-is-becoming-a-big-problem)
- **R.E.P.O. → "E.R.P.O.":** a near-identical name and loop. It went live about a month after the Steam launch and reportedly reached 52M lifetime visits. No R.E.P.O. dev reaction was found. — [Max Power Gaming](https://www.maxpowergaming.co/post/the-copycat-effect-how-r-e-p-o-became-a-viral-hit-on-roblox)
- **Lethal Company → "Deadly Company":** a free Roblox experience "totally inspired by" Lethal Company that reportedly drew more than 5M players. Zeekerss was formerly a Roblox creator, and no statement from him was found. — [LevelUp](https://www.levelup.com/noticias/lethal-company-tiene-un-clon-gratuito-en-roblox-como-jugarlo/); [Wikipedia: Zeekerss](https://en.wikipedia.org/wiki/Zeekerss)
- **Windows Central:** clones of viral indie games have racked up millions of plays and sometimes outperformed the originals. Roblox "only tends to act if a DMCA takedown is filed." — [Windows Central](https://www.windowscentral.com/gaming/how-roblox-theft-is-becoming-a-big-problem)
- **Plagiarism Today (Sept 17, 2026), "The Attack of the Roblox Clones":**
  - Dozens of copies of *Find the Needle* appeared on Roblox and Fortnite, some before the original launched, and some with large player numbers and revenue.
  - Clones often reuse the same name. Lethal Company, Exit 8 and Buckshot Roulette were cited as also cloned.
  - The article suggests trademark as a possible lever but concludes that indie devs can likely do little to prevent cloning.
  - Source: [Plagiarism Today](https://www.plagiarismtoday.com/2026/09/17/the-attack-of-the-roblox-clones/)
- **Roblox-native IP clashes (adjacent):** a Roblox "Steal a Brainrot" developer sued a Fortnite creator over an alleged clone (copyright in gameplay and art). — [Outlook Respawn](https://respawn.outlookindia.com/gaming/gaming-news/roblox-brainrot-dev-sues-fortnite-creator-over-alleged-clone); [Wikipedia: Steal a Brainrot](https://en.wikipedia.org/wiki/Steal_a_Brainrot)
- **Roblox as plaintiff over IP:** Roblox's trademark and copyright suit against WowWee over "MyAvastars" dolls; some claims were trimmed and others cleared for trial. — [Bloomberg Law](https://news.bloomberglaw.com/ip-law/roblox-myavstar-trademark-copyright-suit-slated-for-trial); [Courthouse News](https://www.courthousenews.com/roblox-copyright-claims-over-knockoff-avatar-dolls-cleared-for-trial/)

### Inferences
- **Reputation risk is real and immediate:** indie devs with large audiences (PEAK) can steer press and community sentiment against a clone within days. Being labeled "slop" or "AI ripoff" can stick to a studio name.
- **Legal risk is lower in practice** (few filings found) but tail-heavy: a single valid Rights Manager or DMCA claim removes the experience. Names matching the original ("Escape-the-Wall," "E.R.P.O.") are the most obviously actionable element, under both trademark and Roblox's rules.
- Launching a lookalike before the original even ships is the scenario most likely to draw outrage.

### Gaps
- **No reliable reports found** of Roblox takedowns over Lethal Company, Doors, Pressure or "Frontier," or of specific indie-vs-Roblox DMCA outcomes with public details.
- No confirmed case of Pandorio filing a takedown, and no confirmed statement from them.
- Whether Find the Needle's dev holds a trademark was not determined.

## Official licensing routes and approaching the original developer

### Takeaway
Official Roblox adaptations of Steam indie games now exist. Bombanana! (September/October 2026) is reported as the first Steam-native party game with an official Roblox version, built by a Roblox studio in partnership with the original dev and publisher. Roblox's License Manager gives a standard-terms path, but only for IP the holder has listed. For most indie games, direct outreach (co-dev, revenue share, or licensed adaptation) is the realistic route and is increasingly common.

### Cited Findings
- **Bombanana! (Lefto Studio dev, TARK Games publisher, Türkiye):**
  - Launched on Steam September 2, 2026 and sold over 1M copies in 10 days. — [GamesBeat](https://gamesbeat.com/turkiyes-indie-pc-scene-breaks-out-as-bombanana-sells-one-million-copies-in-10-days/)
  - The official Roblox adaptation was developed by FXFX Studio "in direct partnership with Lefto Studio and TARK Games," with the original IP owners and dev team taking part. It was built for Roblox rather than ported. — [GamesBeat](https://gamesbeat.com/steam-hit-bombanana-becomes-first-steam-native-party-game-with-an-official-roblox-adaptation/)
  - TARK's co-founder said they didn't want Roblox to be "just a box to be ticked or a classic port." — [GamesBeat](https://gamesbeat.com/?p=336135)
  - The Roblox version had 13M+ visits and 50K favorites per GamesBeat (company figures, unverified), and later 15M+ visits and 80K+ favorites per Mobidictum. — [GamesBeat](https://gamesbeat.com/steam-hit-bombanana-becomes-first-steam-native-party-game-with-an-official-roblox-adaptation/); [Mobidictum](https://mobidictum.com/?p=409945)
  - Financial terms were not disclosed.
- **Licensed-IP precedent on Roblox:** Gamefam's *Sonic Speed Simulator*, made in partnership with Sega of America. — [Wikipedia: Sonic Speed Simulator](https://en.wikipedia.org/wiki/Sonic_Speed_Simulator); [Wikipedia: Gamefam](https://en.wikipedia.org/wiki/Gamefam)
- **License Manager mechanics:** see the Roblox policies section above. Standard terms, typically a 10–25% revenue share collected automatically, apply-in-catalog, and self-serve for "any eligible IP holder… brands with registered IP." — [Roblox newsroom Nov 2025](https://about.roblox.com/newsroom/2025/11/roblox-self-serve-ip-licensing)
- **Industry framing:** Roblox adaptations are turning Steam indie hits into free-to-play competitors, and Roblox enforcement still requires someone to spot the game and file. — [Player.One](https://www.player.one/roblox-adaptations-are-turning-steams-biggest-indie-hits-free-play-competitors-163898)

### Inferences
- **Outreach is viable and has a real precedent (Bombanana!).** Indie devs facing clone floods have an incentive to bless one official version that captures the Roblox audience. A pitch could include:
  - revenue share
  - credit and a link to the Steam page
  - IP owner approval rights
  - a "built for Roblox" redesign
- The License Manager's "registered IP" eligibility suggests that small indie devs without trademark registrations may not be able to list. Direct contracts would then be the route. This is an inference from the wording.
- Even if outreach fails, documented good-faith contact and a clearly differentiated design reduce backlash.

### Gaps
- No public deal terms (revenue split, minimum guarantees) for any Steam-to-Roblox indie adaptation.
- No other confirmed official Steam-indie → Roblox adaptations beyond Bombanana! were found in these searches.
- Unclear whether any indie Steam games are listed in the Roblox Licenses catalog.

## Best-practice checklist for differentiating (to stay legally safe and avoid backlash)

### Takeaway
Take the idea and leave the expression. Change everything that carries a creative signature (name, art, audio, characters, UI layout, level design, theme) and add mechanics of your own. Credit inspiration honestly, avoid launching while the original is unreleased, and consider asking for a license. These steps follow the DaVinci "re-skin" logic and Roblox's own rules, and they address the reasons PEAK's and Escape the Walls' clones drew fire.

### Cited Findings
- The re-skin with a new theme in DaVinci "escaped liability," while the Tetris clone that kept the visual aesthetic was "likely infringing." — [FKKS Games Law Journal](https://fkks.com/uploads/news/Games-Law-Summit-Journal_Issue-1_2017.04.27_KANE.pdf)
- Trademark clearance searches before naming avoid forced retitles. — [Snell & Wilmer](https://www.swlaw.com/publication/intellectual-property-issues-for-game-developers-and-operators-part-1-trademarks-101-names-logos-trade-dress-and-protecting-a-brand-before-launch/)
- Roblox prohibits using another developer's code, art or media, or a brand's logo or designs, without permission. — [Roblox Rules of Conduct](https://en.help.roblox.com/hc/en-us/articles/203313410-Roblox-Rules-of-Conduct)
- Modifying copied expression, including with AI tools, does not escape a notice. — [Roblox IP guidelines](https://create.roblox.com/docs/production/publishing/ip-guidelines)
- Toolbox assets are owned by the uploader, and using them doesn't give you ownership. — [DevForum: How do I know if my game is infringing](https://devforum.roblox.com/t/how-do-i-know-if-my-game-is-infringing-copyright/4159433)
- Backlash drivers in the reported cases: microtransaction-heavy clones (PEAK), same or similar names (E.R.P.O., Escape-the-Wall), shipping before the original launched (Escape the Walls, Find the Needle), and AI-assisted speed-copying. — [PC Gamer](https://www.pcgamer.com/games/action/peak-dev-would-rather-you-pirate-peak-than-play-a-microtransaction-roblox-slop-ripoff/); [Plagiarism Today](https://www.plagiarismtoday.com/2026/09/17/the-attack-of-the-roblox-clones/); [Game Rant](https://gamerant.com/escape-the-walls-roblox-clones/)

### Inferences (proposed checklist, synthesized from the cases above)
1. **Name:** pick a distinct name that doesn't play on the original's title (no anagram, misspelling or "-like"), and run a USPTO/TESS search. Don't use the original's name in the title, icon or thumbnail text, or as a search keyword.
2. **Theme/setting:** use a new fiction. Prison walls become, for example, a dig-to-treasure, vault heist or underwater theme, the way Bang! was re-themed in DaVinci.
3. **Art/audio:** make all original assets: models, textures, icons, SFX and music. Don't trace or AI-reproduce the original's look, and don't use unvetted Toolbox assets that may themselves be ripped.
4. **UI/look-and-feel:** use a different HUD layout, color palette, fonts, camera framing and arena or playfield proportions. This avoids Tetris-style "look and feel" and trade-dress claims.
5. **Levels/characters/story:** design your own levels and progression arcs. Don't reproduce a distinctive character, mascot or narrative hierarchy (the Triple Town reasoning).
6. **Mechanics:** keep the core loop but add meaningful new systems: co-op or PvP, Roblox-native social or trading features, new progression and new win conditions.
7. **Code:** write your own. Never decompile, port or copy the original's code.
8. **Timing:** avoid launching before the original ships. In the Escape the Walls case, shipping a day after the reveal is what drove the outrage.
9. **Credit:** a short "inspired by X (go play it on Steam)" note can generate goodwill. **Caveat:** it is not a legal defense, and it should not use the original's logo or art. No source was found that tests whether crediting reduces legal risk.
10. **Monetization optics:** aggressive microtransactions on a near-copy fueled the PEAK "slop" backlash.
11. **Ask first:** check the Roblox Licenses catalog, then email the dev offering a licensed or co-branded version (the Bombanana! model). Keep records of good-faith contact.
12. **Account hygiene:** consider publishing riskier projects under a separate group or account. A strike can threaten the whole account under the repeat-infringer policy.
13. **If you get a claim:** file a counter-notice only if you're confident. Knowingly false counter-notices are illegal under §512(f), and restoration takes about 10–14 business days without a lawsuit.

### Gaps
- No empirical data on whether crediting the inspiration reduces takedown or backlash risk.
- No Roblox guidance found defining how "similar" an experience must be to count as infringing. Roblox defers to the DMCA/legal standard.
