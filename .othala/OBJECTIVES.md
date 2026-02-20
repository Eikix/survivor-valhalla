# Survivor Valhalla Objectives (v1)

## Product objective
Evolve Survivor Valhalla from async autobattler into an async roguelike autobattler where PvE difficulty is generated from player-created lineups.

## Core constraints
- Meta-progression source is Loot Survivor assets/ownership (no separate SV meta system initially).
- Runs should feel variable even with same player lineup.
- Fast iteration mode: merge workflow.

## Milestones
1. Define run lifecycle spec (start, floor, reward, death, reset).
2. Define opponent sampling/matchmaking spec (power bands + anti-repeat + run snapshot).
3. Define Loot Survivor integration interface.
4. Implement first UI/UX pass for run clarity.
5. Add/expand automated tests (especially end-to-end run simulation checks).

## Othala operation notes
- Run daemon in merge mode for this repo.
- Keep one ongoing task lane for test coverage improvements.
- Escalate blockers to Telegram if missing design input.
