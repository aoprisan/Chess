# Character Portrait Prompts (Neon City Fixers)

One file per Fixer. Each file has a STYLE section (shared art direction) and a
PROMPT section (the character) — **paste the whole file content into Gemini as
a single prompt**.

Save each generated image as a square PNG into
`web/public/assets/images/characters/` using the name below. The app picks the
file up automatically (no code change); until a file exists, the in-app
procedural neon avatar (`web/src/ui/BotAvatar.tsx`) renders instead. The
distinguishing features in each prompt intentionally match that procedural
avatar, so dropped-in art keeps each character recognizable.

Tips:
- Keep the whole set in one Gemini chat so the style stays consistent.
- Ask for a square image; the UI renders portraits in rounded square tiles.
- Each character's neon accent color is part of its identity in-game
  (rosters, buttons, map nodes) — keep it dominant in the art.

| Prompt file | Output asset | Character |
|-------------|--------------|-----------|
| `bitzy.txt` | `bitzy.png` | Bitzy — Code Cadet |
| `pixel.txt` | `pixel.png` | Pixel — Patch Artist |
| `cache.txt` | `cache.png` | Cache — Memory Keeper |
| `sparky.txt` | `sparky.png` | Sparky — Power Tech |
| `momo.txt` | `momo.png` | Momo — Safety Officer |
| `popcorn.txt` | `popcorn.png` | Popcorn — Trap Tinkerer |
| `reverb.txt` | `reverb.png` | Reverb — Echo Engineer |
| `forky.txt` | `forky.png` | Forky — Fork Fixer |
| `swipe.txt` | `swipe.png` | Swipe — Data Courier |
| `scatterbug.txt` | `scatterbug.png` | Scatterbug — Messy Mover |
| `recruta.txt` | `recruta.png` | Recruta — Friend Maker |
| `static.txt` | `static.png` | Static — Cloak Master |
| `warp.txt` | `warp.png` | Warp — Gate Guard |
| `twinsy.txt` | `twinsy.png` | Twinsy — Clone Chief |
| `sparkplug.txt` | `sparkplug.png` | Sparkplug — Shock Smith |
| `beacon.txt` | `beacon.png` | Beacon — Signal Scout |
| `shuffle.txt` | `shuffle.png` | Shuffle — Line Juggler |
| `vex.txt` | `vex.png` | Vex — Surge Captain |
| `sponge.txt` | `sponge.png` | Sponge — Backup Boss |
| `payback.txt` | `payback.png` | Payback — Counter Chief |
| `gamba.txt` | `gamba.png` | Gamba — Deal Broker |
| `magnet.txt` | `magnet.png` | Magnet — Catch Commander |
| `nullo.txt` | `nullo.png` | Nullo — Firewall Warden |
