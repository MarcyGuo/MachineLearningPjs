# Charlotte Apartment Screening — as of 2026-08-30 (v5, app-based tracker + self-editable fields)

**Pipeline last ran: 2026-08-29**

## Known infra issue (8/30): Artifact reads blocked in this specific pipeline session — likely just stale, not a real config problem
Confirmed via manual test: an Artifact `action:"read"` on the tracker URL failed in this pipeline's cloud session with a network-allowlist error on `*.frame.claudeusercontent.com` (permission check itself passes fine — it's a network block, not an access issue). Marcy checked her "Default" cloud environment's settings and **`*.frame.claudeusercontent.com` (and the staging variant) are already in Allowed domains** — so the config is correct. Re-tested the read after confirming this and it *still* failed identically in this same session. Most likely explanation: this particular session was already running before/when the domain was added, and per the environment-settings dialog itself ("Changes to your environment will apply to new sessions"), a running session doesn't pick up allowlist changes retroactively — only a fresh session does. Consistent with this: a completely separate Claude Code session read the same artifact with zero errors. **Action for next real cycle:** if Step 1b fails again with this same error in a fresh scheduled firing (not this stale session), that would mean the settings genuinely aren't taking effect and needs escalating; if it succeeds, this was just session staleness and nothing further to do.

## Mobile tracker app (8/29, v2 restructure same day; UI updates 8/30)
Live app: https://claude.ai/code/artifact/98ef095b-fd59-4610-a449-34f7ee300265 — mobile-friendly Claude Artifact, property-grouped, search/filter, expandable units. Restructured (same day) per Marcy's in-app comments: property-level info (bonus amenities, walk/gym/rating, research notes) shown once per property instead of duplicated per unit; unit-level shows only unit-specific tags (In-unit W/D, Den, Balcony, Large Closet/Storage). All bonus/tag fields are self-editable by tapping (cycles Yes/No/Unclear, marked "已修改" when overridden) — e.g. she can correct Free Parking or Package Locker status herself after touring. Separate free-text note areas at both property level ("我的楼盘笔记") and unit level ("After Visit"), editable and saved via the artifact's own publish capability (a sticky "保存修改" bar appears when anything is dirty). "Luxer Locker" was generalized to "Package/Locker" (any locker counts, not just Luxer-brand) per her request. A "Den" tag exists now (self-fillable during tours) — no dedicated research pass has been done to populate it yet, that's still deferred as she asked.

**UI updates (8/30), per further in-app comments/requests:**
- **Hide/block**: each unit has a "不再考虑，隐藏此户型" toggle (reversible) so units she's reviewed and rejected drop out of the default view.
- **Collapsed by default**: each property's unit list is collapsed until the property row is tapped — only the property header shows by default.
- **Star/favorite**: each unit row has a ☆/★ toggle.
- **Toured**: each property has a "已看房"/"标记为已看房" toggle (property-level, since touring happens per building); shown as a badge on the collapsed property row.
- **Filter bar rebuilt**: four independent, combinable filter dimensions replace the old single-purpose toggle buttons — 状态 (全部/PASS/FAIL), 隐藏 (未隐藏/全部/已隐藏), 看房 (全部/已看房/未看房), 收藏 (全部/已收藏/未收藏).
- `hidden` and `favorite` (unit-level) and `toured` (property-level) are self-edit fields, preserved by the merge pipeline exactly like bonus/tag overrides and notes (never touched by fresh research).

**Pipeline now writes directly to this app** (decided 8/29) — the old "generate a new Google Sheet each cycle, copy-paste" workflow is retired. The pipeline reads the artifact's live HTML, runs it headlessly via jsdom to extract current state (including Marcy's self-edits) into `window.__APP_DATA__`, merges freshly-researched availability into it (preserving her overrides/notes — a unit she's personally annotated is never silently deleted even if it goes off-market, just marked unavailable), rebuilds the page, and republishes to the same artifact URL. Also now searches every cycle for genuinely NEW qualifying properties near her LYNX corridor, not just the originally-tracked list (per her instruction "不要偷懒只搜索已经记录的公寓").

## 2026-09-13: property-level "不再考虑此公寓" (hide whole property)
Added a property-level `hidden` self-edit field (boolean), alongside the existing unit-level `hidden`. A new button in each property's expanded info panel — "不再考虑，隐藏此楼盘" / "取消隐藏，重新追踪此楼盘" (reversible) — lets Marcy drop an entire building out of the default view in one tap instead of hiding every unit in it individually. A hidden property is excluded whenever the existing 隐藏 filter chip is set to 未隐藏 (the default), shown (all its units, not just previously-hidden ones) when set to 已隐藏, and unaffected when set to 全部. The summary line's unit/PASS/hidden counts now treat a hidden property's units as hidden too. Same self-edit semantics as `toured`: `merge_lib.merge()` carries `hidden` forward untouched via `setdefault`, defaulting to `False` for both existing and brand-new properties, so a future research cycle never un-hides a property Marcy blocked, and never needs `researched` payloads to know about it. Data shape below updated accordingly. Rolled out by directly extracting the live artifact's current state, rebuilding with the new `boot.js`, and republishing — no research/merge cycle was run for this change.

## 2026-08-30: detached from Claude Project, moved into this git repo
The 4 helper files + this doc used to live in the Claude Project "Moving Plan" and were read/written via `Projects.project_read`/`project_write`. A rebuilt scheduled trigger (recreated 2026-08-30 after the original was deleted while debugging the Artifact-read network-allowlist issue above) came back with a warning that it carries no MCP connectors, so `Projects.*` calls were a risk. To remove that dependency entirely, everything was moved into the `MachineLearningPjs` git repo (branch `claude/artifact-read-test-mcml2c`), under `charlotte-apartment-tracker/`:
- `charlotte-apartment-tracker/apt-tracker-boot.js`
- `charlotte-apartment-tracker/apt-tracker-merge_lib.py`
- `charlotte-apartment-tracker/apt-tracker-extract_data.js`
- `charlotte-apartment-tracker/apt-tracker-rebuild_content.py`
- `charlotte-apartment-tracker/charlotte-apartment-screening.md` (this file)

The pipeline now reads/writes these via plain filesystem access in its cloud environment's git checkout (`git pull`/`git commit`/`git push` against this branch) instead of `Projects.project_read`/`project_write`. No MCP connector is required anymore.

Four helper files the pipeline depends on are stored alongside this doc (kept in sync with the live app — update these together if the app's data schema or boot.js changes again):
- `apt-tracker-boot.js` — the app's full client-side source (single `boot(DATA)` function; the page bootstraps as `(function boot(DATA){...})(DATA_JSON)` and self-regenerates via `boot.toString()` on every save).
- `apt-tracker-merge_lib.py` — merge logic (current state + freshly researched data → new state), schema documented in its docstring.
- `apt-tracker-extract_data.js` — headless jsdom extraction script (`node extract_data.js in.html out.json`).
- `apt-tracker-rebuild_content.py` — reassembles the Artifact-tool-ready content from boot.js + data JSON.

Data shape: `{updatedAt, properties: [{name, url, address, station, walkMin, walkRating, year, ageOk, gRating, gReviews, bonus: {parking/locker/gym/wifi/trash: {v, o}}, notes, myNote, toured, hidden, units: [{id, unit, sqft, sqftOk, price, priceOk, overall, source, tags: {wd/den/balcony/closet: {v, o}}, afterVisit, hidden, favorite}]}]}`. `v` = research-derived value, `o` = Marcy's override (null = none, override wins when set). `toured`/`hidden` (property-level bool, `hidden` added 2026-09-13) and `hidden`/`favorite` (unit-level bool) are pure self-edit fields with no research equivalent. PASS/FAIL/REVIEW is still computed from research (`v`) fields only, not her overrides, to keep it predictable.

## Context
- Current apt: 2120 Dunavant St. Lease ends **2027-06-19**; 60-day notice required, so decide/notify by roughly **2027-04-20**.
- Reason for moving: not renewing due to building quality/management issues at current place.
- Criteria: ≥735 sqft, ≤$2,000/mo, in-unit W/D required, gym required, building age ≤10 yrs (built 2016+), walk to LYNX station ≤15 min (ideally ≤10), home station within 6-7 stops of 3rd St/Convention Center (her office station). Property-level bonus: free parking (free unreserved parking counts, even if reserved/premium spots cost extra), package/locker, good gym, wifi covered, trash valet. Unit-level tags (informational): in-unit W/D, den, balcony, large closet/storage.

## Update (8/29): Free parking definition clarified
Marcy clarified that "免费车位" (free parking) as a bonus criterion is satisfied by **free unreserved parking**, even if reserved/premium parking costs extra. This changed two properties' Free Parking status from Partial/No to Yes:
- **Solis LoSo** (all 6 floorplans): unreserved parking is free, reserved is $75/mo → now **Yes**.
- **Camden LoSo** (all 4 floorplans): 1 free parking pass included per unit, extra passes $50/mo → now **Yes**.

While updating this, found and fixed a formula bug: the Bonus Count column was using an exact-match COUNTIF("Yes") that failed to count any bonus cell with descriptive text (e.g. "Yes - FREE assigned covered parking", "Yes (24hr +yoga/spin)"), silently undercounting bonus amenities for several properties even before this parking change (MAA LoSo, The Sloan at LoSo were also affected). Fixed to count any cell starting with "Yes". Post-fix Bonus Counts: Solis LoSo 4/6, Camden LoSo 3/6, MAA LoSo 4/6, The Sloan at LoSo 4/6 (all up from what was showing before, out of 6 bonus items at the time; the app now uses 5 property-level bonus items since Closet moved to a unit-level tag). Camden LoSo's Overall Screen still shows REVIEW (not PASS) — that's separate and correct, driven by its in-unit W/D being "select units only," not by parking.

## Source & methodology
Original 11 candidates came from Marcy's Google Sheet. A second pass (8/29) searched apartments.com transit listings near every LYNX station in her range and added 13 more properties with qualifying floorplans (36 rows total, all South End/LoSo/NoDa). A third pass (8/29, same day) used the in-app browser to pull real Google-review counts and cross-platform complaint text (Yelp, ApartmentRatings, Realpage, Reddit, RentCafe, TikTok) for all 24 properties, since apartments.com's own review counts undersample badly (e.g. Mercury Noda: 28 on apartments.com vs 286 on Google). Full detail in `Marcy_Apartment_Screening.xlsx` (sent to her), Screening tab — Rating/# Reviews columns are now Google's numbers, Notes column carries the complaint findings.

**Caveat on the complaint text:** several "negative review" snippets Google's search surfaced turned out to be identical, word-for-word, across unrelated properties (a "poop/weed smoking" complaint appeared under Mercury Noda, Elan LoSo, and MAA LoSo; a "poor management, zero accountability" line appeared under both Maddox South End and Sorella NC; an "elevators are gross" line appeared under both Bradham at New Bern and Cullman House). These read as search-snippet mixups/misattribution, not genuine property-specific reviews, and are called out as such in the notes rather than held against those properties. Exact review dates weren't reliably extractable at scale (Google Maps' individual review list needs sign-in to browse fully); where a specific date or "X months ago" was available it's included.

Starting 8/29, a biweekly automated refresh pipeline re-checks live availability/pricing across all tracked properties AND searches for new qualifying ones (see "Pipeline run log" below for each cycle's diff). It does NOT re-scrape reviews/complaints each cycle unless something looks materially changed — Google Rating, # Reviews, and the bonus-amenity fields are carried forward from the most recent research pass unless a property has no prior data to carry from.

## Two new red flags found this pass (would have been missed on ratings alone)

- **Alexan LoSo** — a TikTok titled "Concerns Over Building Design at Alexan LoSo Apartments" (157K+ views, ~6 months old) describes "recent design issues...serious concerns among residents." Combined with Yelp/RentCafe/ApartmentRatings complaints about unresponsive leasing staff and "lack of basic services and accountability," recommend deprioritizing despite decent floorplans (A6 757sqft $1894, A7 753sqft $1844) and a 6-min walk to Scaleybark.
- **Solis LoSo** — appears to have been **rebranded to "The Yancey"** at the same address (Reddit mentions a recent ownership/management change). A TikTok titled "Why You Should Avoid Solis LoSo" (124K+ views, ~6 months old) describes ongoing problems through the poster's lease. Combined with every floorplan still showing "Call for Rent" (no confirmed price), recommend confirming the current name/ownership directly before pursuing this one — note its Bonus Count/parking status was just upgraded to Yes, but the rebrand/ownership question is unresolved and matters more. **Confirmed 8/29 pipeline run**: solisloso.com now 302-redirects to yanceyloso.com; new site pricing found and populated (see run log).

## Other important corrections from this pass

- **Levels at LoSo**: apartments.com's own listing says it "does not offer in-unit laundry or shared facilities" — directly contradicting the property's own site, which advertises in-suite W/D. Since in-unit W/D is a hard requirement, verify this with leasing before touring.
- **One NoDa Park**: earlier flagged as "only 1 review, too new to trust" — corrected, ApartmentRatings shows 4.5★ across 333 reviews. Confidence upgraded.
- **Mercury Noda**: confirmed the Yelp "closed" listing from the first pass is stale — Google shows the business active (hours confirmed 6 weeks ago), and it now shows 4.5★ across 286 Google reviews.
- **Camden Gallery**: came back very strong across every platform checked (Google 4.5/137, ApartmentRatings 4.7/16, Yelp 4.3/28, Birdeye 4.6/164) with literally no complaints found anywhere — best-reviewed property in the whole search. Still 2 sqft under the 735 min and no confirmed price for the A5.4 unit.

## Original 11 — updated screening result

**PASS — worth room-touring:** Mercury Noda (4.5★/286, only 1 unit left); One NoDa Park (4.4★/99, upgraded confidence, but Reddit flags no hallway cameras); Southerly LoSo (4.6★/97, SafeButler flags "higher-crime area" — a generic LoSo-wide flag, not unique to this property); Selene at Southline (4.6★/219, Yelp outlier says "worst complex I've resided in," ApartmentRatings notes morning train noise); The Penrose (4.3★/220, RentCafe Oct-2025 review: "management became very difficult to work with" after signing); Levels at LoSo (4.5★/40, **but verify in-unit W/D before touring**, walk 14min).

**Borderline:** Camden Gallery (now the strongest-reviewed property overall, just 2sqft short + no price found); Maddox South End ($1.75/mo over budget on the quoted term, Yelp outlier re: parking/walls/management).

**FAIL:** The Winston (685sqft, Wanderlog complaint about warped walls/floor); Mosaic South End (built 2010, RentCafe confirms "very old" pool/gym/appliances); Fountains Southend (fails size+age, ApartmentRatings/Yelp consistently flag management and back-gate security issues).

## New candidates (8/29) — updated

**Still strong:** 30Six NoDa (Google 4.2/218, Realpage 4.6/819 — largest, most consistent sample of anything found); MAA LoSo (Google 4.4/257, free assigned covered parking, but RentCafe flags entry doors not locking properly); NoDa Wandry (Google 4.0/183, candid own-site review about parking gates not working, 2-min walk — best in the search); Cullman House (Google 4.9/66 — best rating of anything found, no reliable complaints); Bradham at New Bern (Realpage 4.7/756, 3-min walk); Sorella NC (Google 4.8/56); The Sloan at LoSo (ApartmentRatings 4.6/267, free surface lot parking).

**Downgrade to caution:** Alexan LoSo, Solis LoSo/The Yancey (see red flags above; Solis's free parking status is now Yes but doesn't offset the rebrand/ownership concern).

**Upgraded on parking (this pass):** Camden LoSo now counts as free parking (Yes) — still Overall Screen = REVIEW due to in-unit W/D being select-units-only.

**Unchanged assessment:** Elan LoSo, Madison LoSo (still under construction), 5Line.

## Open items for next pass
- Verify Levels at LoSo actually has in-unit W/D.
- Call Camden Gallery for A5.4 pricing; call Solis LoSo/The Yancey to confirm current name/ownership/pricing.
- Confirm Selene's parking cost ("$20 parking spot" wording still ambiguous).
- Confirm Camden LoSo's in-unit W/D availability (which units qualify) before treating it as a clean PASS.
- Suggested room-tour order by strength: 30Six NoDa → Mercury Noda → Cullman House → MAA LoSo → Southerly LoSo → NoDa Wandry (if 1B opens up) → One NoDa Park → Camden Gallery (pending price) → Bradham at New Bern → Selene → Penrose.
- Den research pass (populate the app's Den tag) — explicitly deferred by Marcy until after the app itself was working well.

## Pipeline run log

- **2026-08-30** (detached from Claude Project — see section above): moved the 4 helper files + this doc from the "Moving Plan" Claude Project into this git repo so the scheduled trigger no longer needs `Projects.*`/MCP connector access. No research/merge/publish run performed as part of this change.
- **2026-08-30** (second manual connectivity re-test, same stale session): After Marcy confirmed `*.frame.claudeusercontent.com` was already in her cloud environment's Allowed domains (screenshot reviewed), re-ran the Artifact read in this same session — failed identically. Concluded this is very likely session staleness (env settings apply to new sessions only, per the settings dialog's own text), not a misconfiguration. No data changed.
- **2026-08-30** (first manual connectivity test, not a real cycle — no research/merge/publish run): Marcy asked to verify the app is readable via the Artifact tool. Read failed in this cloud pipeline session with a network-allowlist error (`*.frame.claudeusercontent.com` blocked; permission check itself passed). A parallel read from a separate Claude Code environment succeeded with no error, confirming the artifact itself is fine and the issue is this cloud sandbox's network allowlist. `Pipeline last ran` intentionally left at 2026-08-29.
- **2026-08-29** (first automated run, Sheet-based — since retired): Re-checked live availability across all 24 tracked properties (WebFetch, apartments.com fallback where a site was JS-only). All 24 sites reachable. **101 qualifying floorplans currently available** (up from 56 previously tracked). 57 PASS, 39 FAIL, 5 REVIEW. 66 newly-available floorplans, 20 previously-tracked floorplans no longer available (mostly floorplan-code renumbering at Camden LoSo, 30Six NoDa and 5Line rather than genuine unavailability). **Confirmed rebrand: Solis LoSo → The Yancey** (solisloso.com redirects to yanceyloso.com). **NoDa Wandry: 0 qualifying units this cycle** (only remaining floorplan, 1A at 675sqft, is under the 735sqft threshold). Notable price drops: Alexan LoSo A6/A7 down ~$130-180/mo. Notable price jumps: 5Line's larger units pushed over $2,000-2,050 and were excluded. (This cycle delivered a Google Sheet link for manual copy-paste — that mechanism was replaced later the same day by the direct-to-app pipeline described above; no further cycles will produce a Sheet.)
