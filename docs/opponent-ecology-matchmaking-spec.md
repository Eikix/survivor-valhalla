# Opponent Ecology Matchmaking Spec

## Goal
Define deterministic PvE opponent selection where opponents are sourced from player defense lineups, while ensuring:
- fair challenge progression with power bands,
- diversity across encountered opponent archetypes (ecology),
- reduced repetition through anti-repeat rules,
- run integrity via per-run snapshots.

## Scope
- Applies to PvE run generation and encounter sequencing.
- Opponents are AI-controlled snapshots of player-submitted defense lineups.
- Does not change combat resolution rules.

## Definitions
- `Attacker Power (AP)`: combat power score of the attacker lineup at run start.
- `Defender Power (DP)`: combat power score of a candidate defense lineup snapshot.
- `Band`: relative power bucket between `DP` and `AP`.
- `Ecology Class`: lineup archetype derived from composition traits.
- `Run Snapshot`: immutable set of eligible defender records captured when the run starts.

## Power Score
Each lineup MUST produce a single comparable power score:

`power = sum(unit_base_power + level_weight + tier_weight + weapon_weight + trait_weight) + lineup_bonus`

Implementation details for weights can evolve, but the score MUST be:
- deterministic from snapshot data,
- monotonic with stronger units,
- stable for the full run.

## Power Bands
Bands are relative to attacker power (`delta = (DP - AP) / AP`):
- `B-2` (Very Easy): `delta < -0.25`
- `B-1` (Easy): `-0.25 <= delta < -0.10`
- `B0` (Even): `-0.10 <= delta <= +0.10`
- `B+1` (Hard): `+0.10 < delta <= +0.25`
- `B+2` (Very Hard): `delta > +0.25`

Encounter targets SHOULD follow progression:
1. Early encounters prefer `B-1` and `B0`
2. Mid encounters prefer `B0` and `B+1`
3. Late encounters prefer `B+1` and `B+2`

If no valid candidate exists in target bands, expansion order MUST be:
`B0 -> adjacent band -> next adjacent -> any band`

## Opponent Ecology
Each defender snapshot MUST be assigned one ecology class. Recommended baseline classes:
- `mono_type` (>=80% same type),
- `dual_type` (two dominant types),
- `balanced` (no dominant type),
- `burst` (high damage concentration),
- `tank` (high durability concentration),
- `control` (high initiative/control bias).

Rules:
- The run generator MUST track ecology class counts selected so far.
- Next encounter SHOULD prioritize the least-represented eligible class in the target band.
- No ecology class may exceed 40% of encounters in a run unless forced by pool exhaustion.

## Anti-Repeat Rules
Hard rules (MUST):
- Do not select the same `defender_player_id` again within the next 3 encounters.
- Do not select the same `lineup_hash` more than once per run.

Soft rules (SHOULD, break only on exhaustion):
- Avoid same ecology class in consecutive encounters.
- Avoid selecting defenders seen in the player’s previous run (cross-run memory of last 5 defenders).

When soft rules are broken, the system MUST log the reason:
- `POOL_EXHAUSTED`,
- `BAND_CONSTRAINT`,
- `ECOLOGY_CONSTRAINT`.

## Per-Run Snapshot Strategy
At run start, the system MUST materialize an immutable snapshot:
- `run_id`,
- `snapshot_at` timestamp,
- attacker lineup snapshot and `AP`,
- all eligible defender snapshots with `DP`, `band`, `ecology_class`, `lineup_hash`,
- seed for deterministic tie-breaking.

During the run:
- Matchmaking MUST use snapshot records only.
- Live changes to player lineups MUST NOT affect current run encounters.
- If a defender account is deleted/invalid mid-run, fallback picks from remaining snapshot pool.

## Candidate Selection Algorithm
For each encounter `i`:
1. Determine target band set for encounter index.
2. Filter snapshot pool by:
   - not already used lineup hash,
   - defender cooldown constraint,
   - target bands (with expansion if needed).
3. Partition by ecology class and compute representation deficit.
4. Choose class with highest deficit.
5. Tie-break deterministically by `hash(run_seed, encounter_index, defender_player_id, lineup_hash)`.
6. Persist selected opponent and update repeat/ecology counters.

## Data Requirements
Snapshot record fields:
- `defender_player_id`
- `lineup_hash`
- `unit_count`
- `composition_features` (type histogram, damage profile, durability profile, initiative profile)
- `defender_power`
- `band`
- `ecology_class`

Run state fields:
- `selected_lineup_hashes[]`
- `recent_defenders_queue` (size 3)
- `ecology_counts`
- `soft_rule_break_events[]`

## Failure Handling
- If pool cannot satisfy hard rules after full band expansion, run creation MUST fail with `NO_VALID_OPPONENT_POOL`.
- If pool can satisfy hard rules but not soft rules, proceed and log soft-rule break reason.

## Acceptance Criteria
- Same run seed + same snapshot input always yields identical opponent sequence.
- No duplicate lineup hash within a run.
- Defender repeat distance is at least 3 encounters.
- Ecology distribution respects 40% cap unless logged pool exhaustion.
- Mid-run lineup edits outside the run do not change generated opponents.
