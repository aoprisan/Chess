# Adventure Mode — Single Player Map Design

A single-player "journey" mode for Kiddie Chess. The player picks a hero, then travels
along a winding path on an illustrated world map. Along the path they hit **obstacles**
(light puzzle/flavor interactions) and **rival heroes** — the other 5 characters from the
hero roster. Walking into a rival starts a challenge, which is the existing **V2 Lane
Combat game vs AI**. Beat all rivals to finish the journey.

---

## 1. Player Experience

### Flow

1. **Pick a hero** — existing hero selection screen, same 6 heroes. The chosen hero
   becomes the map avatar; the other 5 heroes become the rivals placed along the path.
2. **World map** — a vertically scrolling illustrated map with a hand-drawn dotted path
   connecting ~12–15 nodes across 3 biomes.
3. **Tap the next node to move** — the hero avatar hops along the path (simple tween
   animation). Only the next unlocked node is tappable.
4. **Node resolves** based on its type (see Node Types).
5. **Rival encounter** — a popup shows the rival ("Panda blocks your path! Challenge?")
   with **Fight** / **Not yet** buttons. Fight launches the existing lane combat screen
   vs AI. Win → node cleared, path continues, stars awarded. Lose → stay on the map,
   retry any time (no lives system — kid-friendly).
6. **Finish** — beat the final rival (boss) to complete the journey. Victory screen with
   confetti and total stars.

### Map Structure (v2: a maze graph, 3 biomes)

The map is a **maze, not a line**: nodes form a graph with branching routes,
junctions, and dead ends. The player taps any *connected* node to walk there
(free backtracking included). One rule creates the puzzle: an uncleared event
node (obstacle / rival / treasure) blocks passage onward — standing on it, you
can only retreat the way you came until you clear it. Each biome is a small
maze: two alternative routes that fork and rejoin, plus dead-end spurs hiding
treasure — some guarded by **optional rival fights** (skippable, but they pay
stars). Chokepoint rivals still gate each biome transition, and the boss gates
the finish. Current journey: 29 nodes, 5 rivals (2 optional), 5 treasures, all
7 obstacles.

The map is one tall scrollable image, bottom → top, split into 3 biomes that match where
the heroes "live":

| Biome | Theme | Rivals encountered |
|-------|-------|--------------------|
| **1. Sunny Meadow** (bottom) | grassy hills, flowers, a stream | Gnom (first fight, easy), Panda |
| **2. Whispering Forest** (middle) | big doodle trees, mushrooms, rope bridge | Sloth, Unicorn |
| **3. Frosty Peaks** (top) | snow, ice, mountain summit | Snowman, **Yeti (final boss)** |

If the player's chosen hero is one of the rivals, that slot is backfilled by the next
hero in a fixed order (so there are always 5 fights; e.g. choose Yeti → final boss is
Snowman and the Frosty Peaks gets only one mid-fight, or substitute a "Shadow" mirror
match of the player's own hero — recommended: **mirror match as final boss** when the
player picked Yeti, it's a fun "face yourself" moment).

### Node Types

| Node | Icon on map | What happens |
|------|------------|--------------|
| **Start** | flag | Journey begins here |
| **Path node** | paw-print / dot | Just a step; hero hops to it (keeps the map feeling like a journey) |
| **Obstacle** | the obstacle sprite itself | A one-tap flavor interaction (see below) |
| **Rival** | rival hero standing on the path | Challenge popup → lane combat vs AI |
| **Treasure** | wooden chest | Tap to open → small reward (stars, cosmetic sticker) |
| **Finish** | castle / summit banner | Final boss fight, then victory screen |

### Obstacles (v1: flavor + one tap, no fail state)

Obstacles make the map feel alive without adding frustration for kids. Each is a short
animated interaction — tap it, a fun thing happens, path opens:

| Obstacle | Biome | Interaction |
|----------|-------|-------------|
| **Fallen log** | Meadow | Tap 3 times to push it aside (it wobbles each tap) |
| **River + raft** | Meadow | Tap the raft, hero floats across |
| **Sleeping bear cub** | Forest | Tap to gently wake it; it yawns and wanders off |
| **Tangled vines** | Forest | Swipe to brush them aside |
| **Rope bridge** | Forest | Tap to cross, planks wobble |
| **Snowball boulder** | Peaks | Tap to roll it off the path |
| **Ice patch** | Peaks | Hero comically slides across automatically |

Future hook (v2): obstacles could cost/award a one-time perk for the next fight.

### Difficulty & Rewards

- Fights reuse the existing lane-combat AI. Difficulty ramps by encounter index:
  fights 1–2 easy, 3–4 medium, 5 (boss) hard.
- **Stars**: 1–3 stars per fight based on lanes won margin (win 3-0 → 3 stars,
  3-1 → 2 stars, 3-2 → 1 star). Stars shown on cleared rival nodes, total on map header.
- Replay any cleared rival node to improve stars.

---

## 2. Technical Design

### Client (Flutter)

New files:

- `client/lib/models/adventure_map.dart` — map definition: list of nodes
  `{id, type, position(x,y), biome, rivalHeroType?, obstacleType?, nextNodeId}`.
  Loaded from a JSON asset `client/assets/maps/journey_1.json` so maps are data, not code.
- `client/lib/models/adventure_progress.dart` — `{mapId, heroType, currentNodeId,
  clearedNodes: {nodeId: stars}}`. Persisted locally via `shared_preferences`
  (server sync later).
- `client/lib/screens/adventure_map_screen.dart` — `SingleChildScrollView` (or Flame
  camera) over a tall `Stack`: background image + positioned node widgets + dotted
  path painter (`CustomPainter`) + animated hero avatar (`AnimatedPositioned`).
- `client/lib/widgets/adventure_node.dart` — renders a node by type/state
  (locked / current / cleared+stars).
- `client/lib/widgets/encounter_popup.dart` — rival challenge dialog.
- `client/lib/services/adventure_service.dart` — `ChangeNotifier`: loads map JSON,
  owns progress, exposes `moveToNode()`, `recordFightResult(stars)`.

Integration points:

- Main menu: add an **Adventure** button alongside existing modes.
- Fight launch: navigate to the existing combat screen in solo/AI mode with
  `(playerHero, rivalHero, difficulty)`; on game end, pop back to the map with the
  result. The lane game already supports AI games, so no server changes are required
  for v1 — adventure state stays client-side.

### Server

None required for v1 (AI games already work; progress is local). v2: persist progress
per account, leaderboard for total stars.

---

## 3. Gemini ("Nano Banana") Art Prompts

Every prompt below is standalone — copy/paste one at a time. They all share the same
style anchor so the set stays consistent.

> **Style anchor (already embedded in each prompt):** cute hand-drawn doodle cartoon
> style, kid-friendly, thick playful outlines, soft shading, warm earthy palette of
> cream #F5E6D3, warm brown #8D6E63, dark cocoa #5D4037 with soft pastel accents.

**Tips for asset generation:** for sprites, the prompts ask for a *plain solid white
background* so you can cut them out easily; generate at the largest size offered and
downscale. For the map backgrounds, generate each biome separately at the same width so
they stack vertically.

### 3.1 Map Backgrounds (3 prompts — stack vertically: meadow bottom, peaks top)

**Prompt M1 — Sunny Meadow (bottom of map):**
> A tall vertical game world map background of a sunny meadow, in a cute hand-drawn
> doodle cartoon style for a children's game. Rolling grassy hills, scattered daisies
> and tulips, a small stream along one edge, fluffy round bushes, a few ladybugs and
> butterflies. Keep the middle of the image open and uncluttered — soft plain grass
> with only small subtle details — because game paths and markers will be drawn on
> top; put the larger decorations near the left and right edges. Thick playful
> outlines, soft shading, warm earthy palette of cream #F5E6D3, warm brown #8D6E63,
> dark cocoa #5D4037 with soft green and pastel accents. Top-down three-quarter view,
> no path, no characters, no text. Portrait orientation 9:16.

**Prompt M2 — Whispering Forest (middle of map):**
> A tall vertical game world map background of a friendly forest, in a cute hand-drawn
> doodle cartoon style for a children's game. Big round doodle trees with smiling
> knot-hole faces, oversized spotted mushrooms, glowing fireflies, mossy stones. Keep
> the middle of the image open and uncluttered — a soft forest-floor clearing with
> only small subtle details — because game paths and markers will be drawn on top;
> put the trees and larger decorations near the left and right edges. The bottom edge
> transitions from sunny meadow grass; the top edge begins to show light frost. Thick
> playful outlines, soft shading, warm earthy palette of cream #F5E6D3, warm brown
> #8D6E63, dark cocoa #5D4037 with deep green and amber accents. Top-down
> three-quarter view, no path, no characters, no text. Portrait orientation 9:16.

**Prompt M3 — Frosty Peaks (top of map):**
> A tall vertical game world map background of snowy mountain peaks, in a cute
> hand-drawn doodle cartoon style for a children's game. Soft rounded snow drifts, pine
> trees dusted with snow, sparkling ice, a cozy wooden signpost, and near the very top
> a small open summit plateau — the final destination. Keep the middle of the image
> open and uncluttered — smooth snow with only small subtle details — because game
> paths and markers will be drawn on top; put the larger decorations near the left and
> right edges. The bottom edge transitions from forest. Thick playful outlines, soft
> shading, warm earthy palette of cream #F5E6D3, warm brown #8D6E63, dark cocoa
> #5D4037 with icy blue and white accents. Top-down three-quarter view, no path, no
> characters, no text. Portrait orientation 9:16.

### 3.2 Map Avatars — full-body hero tokens (6 prompts)

These are the small full-body versions used both as the player's walking avatar and as
rivals standing on the path. (The existing portrait art is for cards/selection; the map
needs full-body standing poses.)

**Prompt H1 — Sloth:**
> A cute full-body cartoon sloth character standing upright on two legs, for a
> children's game world map. Sleepy happy smile, half-closed eyes, shaggy tan-brown fur,
> tiny backpack. Hand-drawn doodle style, thick playful outlines, soft shading, warm
> earthy palette of cream #F5E6D3, warm brown #8D6E63, dark cocoa #5D4037. Front-facing
> standing pose, full body visible, isolated on a plain solid white background, no
> shadow, no text. Square 1:1.

**Prompt H2 — Panda:**
> A cute full-body cartoon panda character standing upright on two legs, for a
> children's game world map. Big friendly grin, round belly, classic black and white
> fur with warm-toned shading, holding a bamboo walking stick. Hand-drawn doodle style,
> thick playful outlines, soft shading, accents from a warm earthy palette of cream
> #F5E6D3, warm brown #8D6E63, dark cocoa #5D4037. Front-facing standing pose, full body
> visible, isolated on a plain solid white background, no shadow, no text. Square 1:1.

**Prompt H3 — Unicorn:**
> A cute full-body cartoon unicorn character standing upright on two legs, for a
> children's game world map. Cheerful sparkly eyes, white coat, pastel rainbow mane and
> tail, small golden horn, tiny star sparkles around it. Hand-drawn doodle style, thick
> playful outlines, soft shading, accents from a warm earthy palette of cream #F5E6D3,
> warm brown #8D6E63, dark cocoa #5D4037 plus soft pastels. Front-facing standing pose,
> full body visible, isolated on a plain solid white background, no shadow, no text.
> Square 1:1.

**Prompt H4 — Snowman:**
> A cute full-body cartoon snowman character, for a children's game world map. Three
> round snowballs, carrot nose, coal-button smile, cozy striped scarf in warm brown and
> cream, stick arms with mittens. Hand-drawn doodle style, thick playful outlines, soft
> shading, accents from a warm earthy palette of cream #F5E6D3, warm brown #8D6E63,
> dark cocoa #5D4037 with icy blue highlights. Front-facing standing pose, full body
> visible, isolated on a plain solid white background, no shadow, no text. Square 1:1.

**Prompt H5 — Gnom:**
> A cute full-body cartoon garden gnome character, for a children's game world map.
> Mischievous wink, big red pointy hat drooping at the tip, fluffy white beard, tiny
> brown boots, holding a small wooden shovel. Hand-drawn doodle style, thick playful
> outlines, soft shading, warm earthy palette of cream #F5E6D3, warm brown #8D6E63,
> dark cocoa #5D4037 with a red hat accent. Front-facing standing pose, full body
> visible, isolated on a plain solid white background, no shadow, no text. Square 1:1.

**Prompt H6 — Yeti:**
> A cute full-body cartoon yeti character standing upright, for a children's game world
> map. Big fuzzy white-blue fur, huge friendly smile with one snaggle tooth, large round
> feet, arms raised in a playful "rawr" pose. Hand-drawn doodle style, thick playful
> outlines, soft shading, accents from a warm earthy palette of cream #F5E6D3, warm
> brown #8D6E63, dark cocoa #5D4037 with icy blue highlights. Front-facing standing
> pose, full body visible, isolated on a plain solid white background, no shadow, no
> text. Square 1:1.

### 3.3 Path & Node Markers (4 prompts)

**Prompt N1 — Path step dots (sprite sheet):**
> A set of 6 small hand-drawn path marker doodles for a children's game world map,
> arranged in a grid: a paw print, a round pebble dot, a tiny daisy, a small leaf, a
> snowflake, and a star. Thick playful outlines, soft shading, warm earthy palette of
> cream #F5E6D3, warm brown #8D6E63, dark cocoa #5D4037. Each doodle separated with
> clear spacing, isolated on a plain solid white background, no text. Square 1:1.

**Prompt N2 — Locked node:**
> A single cute cartoon padlock doodle made of wood with a brass clasp, slightly tilted,
> for a children's game world map locked level marker. Hand-drawn doodle style, thick
> playful outlines, soft shading, warm earthy palette of cream #F5E6D3, warm brown
> #8D6E63, dark cocoa #5D4037. Isolated on a plain solid white background, no text.
> Square 1:1.

**Prompt N3 — Cleared node star badge:**
> A cute hand-drawn wooden circular badge with three golden stars across the top, for a
> children's game world map completed-level marker. Doodle cartoon style, thick playful
> outlines, soft shading, warm earthy palette of cream #F5E6D3, warm brown #8D6E63,
> dark cocoa #5D4037 with golden yellow stars. Isolated on a plain solid white
> background, no text. Square 1:1.

**Prompt N4 — Current node pulse ring:**
> A simple hand-drawn dashed circle ring marker, like a crayon doodle, used to highlight
> the current level on a children's game world map. Warm golden yellow with a soft outer
> glow, thick playful dashed outline. Isolated on a plain solid white background, no
> text. Square 1:1.

### 3.4 Obstacles (7 prompts)

**Prompt O1 — Fallen log:**
> A cute cartoon fallen tree log lying across a dirt path, with a smiling knot-hole face
> and a tiny mushroom growing on top, for a children's game world map obstacle.
> Hand-drawn doodle style, thick playful outlines, soft shading, warm earthy palette of
> cream #F5E6D3, warm brown #8D6E63, dark cocoa #5D4037. Isolated on a plain solid
> white background, no text. Landscape 4:3.

**Prompt O2 — River raft:**
> A cute cartoon wooden raft made of tied logs with a small flag, floating on a doodle
> stream with wavy water lines, for a children's game world map obstacle. Hand-drawn
> doodle style, thick playful outlines, soft shading, warm earthy palette of cream
> #F5E6D3, warm brown #8D6E63, dark cocoa #5D4037 with soft blue water. Isolated on a
> plain solid white background, no text. Landscape 4:3.

**Prompt O3 — Sleeping bear cub:**
> A cute cartoon bear cub curled up asleep in the middle of a path, with a tiny "zzz"
> bubble, for a children's game world map obstacle. Hand-drawn doodle style, thick
> playful outlines, soft shading, warm earthy palette of cream #F5E6D3, warm brown
> #8D6E63, dark cocoa #5D4037. Isolated on a plain solid white background, no other
> text besides the zzz. Square 1:1.

**Prompt O4 — Tangled vines:**
> A cute cartoon tangle of leafy green vines with curly tendrils and a few pink flowers,
> forming a loose curtain blocking a path, for a children's game world map obstacle.
> Hand-drawn doodle style, thick playful outlines, soft shading, deep green with accents
> from a warm earthy palette of cream #F5E6D3, warm brown #8D6E63, dark cocoa #5D4037.
> Isolated on a plain solid white background, no text. Portrait 3:4.

**Prompt O5 — Rope bridge:**
> A cute cartoon wooden rope bridge with slightly crooked planks and rope handrails,
> seen from a three-quarter top-down view, for a children's game world map obstacle.
> Hand-drawn doodle style, thick playful outlines, soft shading, warm earthy palette of
> cream #F5E6D3, warm brown #8D6E63, dark cocoa #5D4037. Isolated on a plain solid
> white background, no text. Landscape 4:3.

**Prompt O6 — Snowball boulder:**
> A cute giant cartoon snowball boulder with a surprised doodle face, sitting in the
> middle of a snowy path, for a children's game world map obstacle. Hand-drawn doodle
> style, thick playful outlines, soft shading, white and icy blue with accents from a
> warm earthy palette of cream #F5E6D3, warm brown #8D6E63, dark cocoa #5D4037.
> Isolated on a plain solid white background, no text. Square 1:1.

**Prompt O7 — Ice patch:**
> A cute cartoon patch of slippery ice on a path, shiny pale blue with sparkle doodles
> and tiny crack lines, slightly oval shaped, for a children's game world map obstacle.
> Hand-drawn doodle style, thick playful outlines, soft shading, icy blue with accents
> from a warm earthy palette of cream #F5E6D3, warm brown #8D6E63, dark cocoa #5D4037.
> Isolated on a plain solid white background, no text. Landscape 4:3.

### 3.5 Map Props & UI (5 prompts)

**Prompt P1 — Start flag:**
> A cute cartoon wooden flagpole with a cheerful cream-and-brown pennant flag waving,
> planted in a small grass mound, marking the start of a journey on a children's game
> world map. Hand-drawn doodle style, thick playful outlines, soft shading, warm earthy
> palette of cream #F5E6D3, warm brown #8D6E63, dark cocoa #5D4037. Isolated on a plain
> solid white background, no text. Square 1:1.

**Prompt P2 — Treasure chest (closed + open pair):**
> Two cute cartoon wooden treasure chests side by side: one closed, one open and
> overflowing with golden stars, for a children's game world map. Hand-drawn doodle
> style, thick playful outlines, soft shading, warm earthy palette of cream #F5E6D3,
> warm brown #8D6E63, dark cocoa #5D4037 with golden yellow stars. Clear spacing
> between the two chests, isolated on a plain solid white background, no text.
> Landscape 4:3.

**Prompt P3 — Summit banner (finish):**
> A cute cartoon festive finish banner strung between two wooden poles on a snowy
> mountain summit, with bunting triangles in cream, brown, and pastel colors, for the
> final destination of a children's game world map. Hand-drawn doodle style, thick
> playful outlines, soft shading, warm earthy palette of cream #F5E6D3, warm brown
> #8D6E63, dark cocoa #5D4037. Isolated on a plain solid white background, no text.
> Landscape 4:3.

**Prompt P4 — Encounter popup frame:**
> A blank rounded-rectangle parchment panel with hand-drawn doodle borders, wooden
> corner pegs, and a small rope bow at the top, used as a dialog frame in a children's
> game. The center is empty cream parchment ready for text. Thick playful outlines,
> soft shading, warm earthy palette of cream #F5E6D3, warm brown #8D6E63, dark cocoa
> #5D4037. Isolated on a plain solid white background, no text. Portrait 3:4.

**Prompt P5 — VS clash badge:**
> A cute cartoon "versus" clash badge: two crossed wooden swords behind a round wooden
> shield with a star burst, used when two characters challenge each other in a
> children's game. Hand-drawn doodle style, thick playful outlines, soft shading, warm
> earthy palette of cream #F5E6D3, warm brown #8D6E63, dark cocoa #5D4037 with a golden
> star burst. Isolated on a plain solid white background, no text. Square 1:1.

---

## 4. Asset Checklist

**The mode is implemented and playable with placeholder visuals.** Drop each
generated PNG into `client/assets/images/adventure/` using the EXACT filename
below and the placeholders are replaced automatically (no code changes needed) —
the widgets try the asset first and fall back to placeholders only if it is
missing. Hot-restart the app after adding files.

### Wired into the app (drop these in)

| Asset | Prompt | Filename in `client/assets/images/adventure/` |
|-------|--------|-----------------------------------------------|
| Meadow map background | M1 | `bg_meadow.png` |
| Forest map background | M2 | `bg_forest.png` |
| Peaks map background | M3 | `bg_peaks.png` |
| Sloth token | H1 | `token_sloth.png` |
| Panda token | H2 | `token_panda.png` |
| Unicorn token | H3 | `token_unicorn.png` |
| Snowman token | H4 | `token_snowman.png` |
| Gnom token | H5 | `token_gnom.png` |
| Yeti token | H6 | `token_yeti.png` |
| Fallen log | O1 | `obstacle_fallen_log.png` |
| River raft | O2 | `obstacle_river_raft.png` |
| Sleeping bear cub | O3 | `obstacle_sleeping_cub.png` |
| Tangled vines | O4 | `obstacle_tangled_vines.png` |
| Rope bridge | O5 | `obstacle_rope_bridge.png` |
| Snowball boulder | O6 | `obstacle_snowball.png` |
| Ice patch | O7 | `obstacle_ice_patch.png` |
| Start flag | P1 | `prop_flag.png` |
| Treasure chest closed / open | P2 | `prop_chest_closed.png` + `prop_chest_open.png` (crop the generated pair into two files) |
| Summit banner | P3 | `prop_banner.png` |
| VS badge | P5 | `ui_vs.png` |

Tokens, obstacles, and props are drawn over the map, so trim/remove the white
background (export with transparency) for best results. Backgrounds are
stretched to cover one third of the map each (`BoxFit.cover`).

### Not wired yet (optional, generate later)

Path dots (N1), locked node (N2), star badge (N3), current-node ring (N4), and
the popup frame (P4) are currently drawn programmatically (painted dots, lock
icon, star icons, pulsing ring, cream panel). Generate them later if you want
the hand-drawn versions.

## 5. Implementation Status

Implemented (June 2026), client-only, no server changes:

- `client/lib/models/adventure.dart` — node/map/progress models (graph with
  `connections` edges, visited-set progress)
- `client/assets/maps/journey_1.json` — the 29-node maze (3 biomes, 5 rivals
  of which 2 optional treasure-guards, 7 obstacles, 5 treasure chests)
- `client/lib/services/adventure_service.dart` — journey state + persistence
  (SharedPreferences), graph movement rules (uncleared nodes block passage,
  retreat always allowed), rival assignment, difficulty ramp, star totals
- `client/lib/screens/adventure_map_screen.dart` — scrollable map, dashed path
  painter, animated hero avatar, header (stars / start over), victory overlay
- `client/lib/widgets/adventure_node.dart` — node rendering with art-or-placeholder
- `client/lib/widgets/encounter_popup.dart` — rival challenge, obstacle, and
  treasure popups
- `CombatScreen` gained an `onGameEnd` callback + configurable exit button label
- Main menu **Adventure** button (resumes a saved journey or starts hero pick)
- `GameMode.adventure` in the hero selection screen
- Tests: `client/test/models/adventure_test.dart`
