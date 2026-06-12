# Adventure Mode Art Prompts

One file per asset. Each file has a STYLE section (shared art direction) and a
PROMPT section (the subject) — **paste the whole file content into Gemini as a
single prompt**.

Save each generated image into `client/assets/images/adventure/` using the PNG
name below (same as the prompt file name). Trim/remove the white background
(export with transparency) for everything except the three `bg_*` backgrounds.
See `ADVENTURE_MODE_DESIGN.md` section 4 for details.

| Prompt file | Output asset | Notes |
|-------------|--------------|-------|
| `bg_meadow.txt` | `bg_meadow.png` | map background, keep as-is (no transparency) |
| `bg_forest.txt` | `bg_forest.png` | map background |
| `bg_peaks.txt` | `bg_peaks.png` | map background |
| `token_sloth.txt` | `token_sloth.png` | full-body map token |
| `token_panda.txt` | `token_panda.png` | full-body map token |
| `token_unicorn.txt` | `token_unicorn.png` | full-body map token |
| `token_snowman.txt` | `token_snowman.png` | full-body map token |
| `token_gnom.txt` | `token_gnom.png` | full-body map token |
| `token_yeti.txt` | `token_yeti.png` | full-body map token |
| `obstacle_fallen_log.txt` | `obstacle_fallen_log.png` | |
| `obstacle_river_raft.txt` | `obstacle_river_raft.png` | |
| `obstacle_sleeping_cub.txt` | `obstacle_sleeping_cub.png` | |
| `obstacle_tangled_vines.txt` | `obstacle_tangled_vines.png` | |
| `obstacle_rope_bridge.txt` | `obstacle_rope_bridge.png` | |
| `obstacle_snowball.txt` | `obstacle_snowball.png` | |
| `obstacle_ice_patch.txt` | `obstacle_ice_patch.png` | |
| `prop_flag.txt` | `prop_flag.png` | |
| `prop_chest.txt` | `prop_chest_closed.png` + `prop_chest_open.png` | generates a pair — crop into two files |
| `prop_banner.txt` | `prop_banner.png` | |
| `ui_vs.txt` | `ui_vs.png` | |
| `ui_popup.txt` | *(not wired yet)* | optional — popup frame is drawn in code today |
| `path_dots.txt` | *(not wired yet)* | optional sprite sheet |
| `node_locked.txt` | *(not wired yet)* | optional — lock icon drawn in code today |
| `node_cleared.txt` | *(not wired yet)* | optional — star badge drawn in code today |
| `node_current.txt` | *(not wired yet)* | optional — pulse ring drawn in code today |
