# Roguelike Run Lifecycle

Design spec for the run system that turns Survivor Valhalla from a standalone PvP autobattler into an async roguelike autobattler.

## Definitions

| Term | Meaning |
|------|---------|
| **Run** | A single roguelike attempt: player starts at floor 1 and climbs until death or victory. |
| **Floor** | One battle within a run. Player fights a defender lineup sampled from the world pool. |
| **World Pool** | All registered beast lineups. Each serves as a potential floor opponent. |
| **Power Rating** | Scalar derived from a lineup's stats, used for matchmaking difficulty bands. |

---

## 1. Starting a Run

### Trigger
Player calls `start_run()` with their attack lineup already set.

### Preconditions
- Player has a valid `AttackLineup` (at least one adventurer).
- Player has no active (in-progress) run.
- Player has sufficient energy (1 energy to start; energy system already exists but is disabled).

### On-chain state created

```
Run {
    run_id: u32          // auto-increment
    player: ContractAddress
    floor: u8            // starts at 1
    max_floor: u8        // highest floor reached (equals floor while alive)
    is_active: bool      // true while run is in progress
    adventurer_hp: Array<u16>  // carry-over HP per adventurer (initialized to max)
    seed: felt252        // deterministic RNG seed (hash of player + block timestamp)
    started_at: u64
    ended_at: u64        // 0 while active
}
```

### Initialization logic
1. Snapshot the player's `AttackLineup` and cached adventurer stats into the `Run`. This prevents mid-run lineup swaps.
2. Set each adventurer's carry-over HP to their max HP (`100 + vitality * 15`).
3. Derive `seed` from `pedersen(player, block_timestamp)` for deterministic opponent sampling.

---

## 2. Floor Progression

### Flow per floor

```
[start_run] -> floor 1 -> [battle] -> win? -> [apply_reward] -> floor 2 -> ...
                                        |
                                        no -> [end_run (death)]
```

### Opponent selection (`advance_floor` / internal)
1. Compute player power rating from their lineup stats.
2. Define a difficulty band: `target_power = player_power * floor_scaling(floor)`.
3. Sample a defender `BeastLineup` from the world pool within the band.
4. Anti-repeat: exclude any lineup the player already faced in this run (tracked in `RunHistory`).
5. Selection is deterministic using the run `seed + floor` so results are reproducible.

### Floor scaling

| Floor | Power multiplier | Intent |
|-------|----------------:|--------|
| 1-3   | 0.6 - 0.8 | Warm-up, almost guaranteed wins |
| 4-6   | 0.9 - 1.0 | Fair fights |
| 7-9   | 1.1 - 1.3 | Hard, requires good lineup |
| 10    | 1.5 | Boss floor (see below) |

Multipliers are applied to `target_power` when filtering the world pool. If no lineup exists in the band, widen by +/- 20% until a match is found.

### Boss floors
Every 10th floor is a boss floor. Boss floors apply a stat buff to the sampled beast lineup:
- Beast HP and damage multiplied by 1.25x.
- Handled in `setup_combat_units` when `floor % 10 == 0`.

### Carry-over HP
Adventurers do **not** heal between floors. Their `current_hp` at end-of-battle carries into the next floor. This is the core roguelike tension: attrition across fights.

### Battle execution
Reuses the existing `execute_combat` system unchanged. The only difference:
- Adventurer HP is initialized from `Run.adventurer_hp` instead of max HP.
- After battle, surviving adventurer HP is written back to `Run.adventurer_hp`.

### On-chain state per floor

```
RunBattle {
    run_id: u32          // key
    floor: u8            // key
    battle_id: u32       // links to existing Battle model
    defender: ContractAddress
    result: u8           // 0=loss, 1=win
}
```

---

## 3. Rewards

Rewards are granted after each won floor. No separate claim step.

### Reward types

| Reward | When | Effect |
|--------|------|--------|
| **Heal** | Every 3 floors (3, 6, 9...) | Restore 25% max HP to all surviving adventurers |
| **Stat boost** | Random on floors 5, 10 | +1 to a random stat for one adventurer (run-scoped, not permanent) |
| **Score** | Every floor | `floor * survivors_remaining` added to run score |

### Implementation
- Heal: update `Run.adventurer_hp` entries, capped at max HP.
- Stat boost: stored in a `RunBuff` model, applied during `setup_combat_units`.
- Score: stored on `Run` model, used for leaderboard.

```
RunBuff {
    run_id: u32
    adventurer_position: u8
    stat: u8             // enum: 1=str, 2=dex, 3=vit, 4=int, 5=wis, 6=cha, 7=luck
    value: u8            // amount added
}
```

### Reward selection
Deterministic from `pedersen(seed, floor)`. No player choice to keep it async-friendly.

---

## 4. Death and Run End

### Death trigger
The run ends when the player **loses** a floor battle (all adventurers defeated).

### On death
1. Set `Run.is_active = false`.
2. Set `Run.ended_at = block_timestamp`.
3. Emit `RunCompleted { run_id, player, max_floor, score, timestamp }`.
4. No permanent penalty. Adventurers and lineups are unchanged (they are already dead Loot Survivor adventurers).

### No run-abandon
Players cannot voluntarily end a run early. They must either win or die. This simplifies state and prevents gaming the system.

---

## 5. Reset Semantics

### What resets between runs
- Floor counter (back to 1)
- Adventurer carry-over HP (back to max)
- All `RunBuff` entries (run-scoped boosts are discarded)
- Run seed (new seed from new timestamp)
- Opponent history (can face same lineups again)

### What persists between runs
- Attack lineup (adventurers) - player can swap between runs
- Beast lineup (defense) - remains in world pool for others
- Player energy (decremented on run start)
- Historical run records for leaderboard / stats
- Player's best score and max floor (for profile display)

### Starting a new run
Player simply calls `start_run()` again after a death. No cooldown beyond energy cost.

---

## 6. New Models Summary

| Model | Keys | Purpose |
|-------|------|---------|
| `Run` | `run_id` | Core run state, carry-over HP, active flag |
| `RunBattle` | `run_id, floor` | Per-floor battle record |
| `RunBuff` | `run_id, adventurer_position` | Temporary stat boosts |
| `PlayerRunStats` | `player` | Best score, best floor, total runs |

### New system: `run_actions`

| Function | Description |
|----------|-------------|
| `start_run()` | Creates Run, snapshots lineup, initializes HP |
| `battle_floor()` | Samples opponent, runs battle, applies rewards or death |

### Events

| Event | Fields |
|-------|--------|
| `RunStarted` | run_id, player, timestamp |
| `FloorCompleted` | run_id, floor, battle_id, result, reward_type |
| `RunCompleted` | run_id, player, max_floor, score, timestamp |

---

## 7. Migration Path

This system layers on top of existing contracts. No breaking changes required.

1. Add new models (`Run`, `RunBattle`, `RunBuff`, `PlayerRunStats`).
2. Add `run_actions` system alongside existing `battle_actions`.
3. `run_actions.battle_floor()` calls into the existing combat engine internally.
4. Existing direct PvP via `battle_actions.battle()` can remain for testing/casual play.
5. Frontend adds a "Run" mode alongside the existing battle UI.

### Dependency on existing systems
- `battle_actions`: combat execution (reused as-is).
- `beast_actions`: world pool of defender lineups (read-only).
- `energy_actions`: energy gating (re-enable for runs).

---

## 8. Open Questions

- **Max floor cap?** Infinite or capped at e.g. 20? Infinite is simpler but may need a difficulty ceiling.
- **Multiplayer leaderboard scope?** Per-season or all-time? Seasons add complexity but prevent stale leaderboards.
- **Opponent sampling fairness:** If world pool is small (<20 lineups), difficulty banding may not work well. Fallback: allow re-fights with stat scaling.
