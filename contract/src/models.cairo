use starknet::ContractAddress;

#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct BeastLineup {
    #[key]
    pub player: ContractAddress,
    pub beast1_id: u256,
    pub beast2_id: u256,
    pub beast3_id: u256,
    pub beast4_id: u256,
    pub beast5_id: u256,
}

#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct Beast {
    #[key]
    pub player: ContractAddress,
    #[key]
    pub position: u8,
    pub token_id: u256,
    pub beast_id: u8,
    pub level: u16,
    pub health: u16,
    pub beast_type: u8,
    pub tier: u8,
}

#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct PlayerEnergy {
    #[key]
    pub player: ContractAddress,
    pub energy: u8,
    pub last_refill_time: u64,
}

#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct Battle {
    #[key]
    pub battle_id: u32,
    pub attacker: ContractAddress,
    pub defender: ContractAddress,
    pub winner: ContractAddress,
    pub timestamp: u64,
}

#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct AttackLineup {
    #[key]
    pub player: ContractAddress,
    pub adventurer1_id: u64,
    pub adventurer2_id: u64,
    pub adventurer3_id: u64,
    pub adventurer4_id: u64,
    pub adventurer5_id: u64,
}

#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct CachedAdventurer {
    #[key]
    pub player: ContractAddress,
    #[key]
    pub adventurer_id: u64,
    pub health: u16,
    pub level: u8,
    pub strength: u8,
    pub dexterity: u8,
    pub vitality: u8,
    pub intelligence: u8,
    pub wisdom: u8,
    pub charisma: u8,
    pub luck: u8,
}

#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct AdventurerWeapon {
    #[key]
    pub player: ContractAddress,
    #[key]
    pub adventurer_id: u64,
    pub weapon_type: u8, // 1=Magic, 2=Blade, 3=Bludgeon
    pub weapon_power: u16,
}

#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct BattleState {
    #[key]
    pub battle_id: u32,
    pub attacker: ContractAddress,
    pub defender: ContractAddress,
    pub round: u8, // Current round (1-3)
    pub turn: u8, // Current turn in round
    pub attacker_wins: u8, // Rounds won by attacker
    pub defender_wins: u8, // Rounds won by defender
    pub is_complete: bool,
}

#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct CombatUnit {
    #[key]
    pub battle_id: u32,
    #[key]
    pub unit_id: u64, // adventurer_id or beast_id
    pub position: u8, // 1-5 lineup position
    pub is_adventurer: bool,
    pub current_hp: u16,
    pub max_hp: u16,
    pub damage: u16,
    pub initiative: u8,
    pub weapon_type: u8, // For adventurers (1=Magic, 2=Blade, 3=Bludgeon)
    pub beast_type: u8, // For beasts (1=Magic_or_Cloth, 2=Blade_or_Hide, 3=Bludgeon_or_Metal)
    pub is_alive: bool,
}

#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct Run {
    #[key]
    pub run_id: u32,
    pub player: ContractAddress,
    pub floor: u8,
    pub max_floor: u8,
    pub is_active: bool,
    pub score: u32,
    pub seed: felt252,
    pub started_at: u64,
    pub ended_at: u64,
}

#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct FloorProgress {
    #[key]
    pub run_id: u32,
    pub current_floor: u8,
    pub encounters_cleared: u8,
    pub last_battle_id: u32,
    pub is_complete: bool,
}

/// Tracks which run a player currently has active (0 = no active run).
#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct ActiveRun {
    #[key]
    pub player: ContractAddress,
    pub run_id: u32,
}

/// Per-floor battle record within a run.
#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct RunBattle {
    #[key]
    pub run_id: u32,
    #[key]
    pub floor: u8,
    pub battle_id: u32,
    pub defender: ContractAddress,
    pub result: u8, // 0=loss, 1=win
}

/// Run-scoped stat boost applied to one adventurer.
/// Keyed by (run_id, adventurer_position, floor) to allow multiple buffs per adventurer.
#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct RunBuff {
    #[key]
    pub run_id: u32,
    #[key]
    pub adventurer_position: u8,
    #[key]
    pub floor: u8,
    pub stat: u8, // 1=str, 2=dex, 3=vit, 4=int, 5=wis, 6=cha, 7=luck
    pub value: u8,
}

/// Lifetime player run statistics.
#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct PlayerRunStats {
    #[key]
    pub player: ContractAddress,
    pub best_score: u32,
    pub best_floor: u8,
    pub total_runs: u32,
}

/// Snapshot of adventurer HP carried across floors within a run.
#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct RunAdventurer {
    #[key]
    pub run_id: u32,
    #[key]
    pub position: u8, // 1-5
    pub adventurer_id: u64,
    pub current_hp: u16,
    pub max_hp: u16,
}

/// Snapshot of a defender lineup captured at run start for deterministic matchmaking.
#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct OpponentSnapshot {
    #[key]
    pub run_id: u32,
    #[key]
    pub snapshot_index: u16, // index within this run's snapshot pool
    pub defender: ContractAddress,
    pub defender_power: u32,
    pub band: u8, // power band relative to attacker (1-5)
    pub ecology_class: u8, // lineup archetype (1-6)
    pub lineup_hash: felt252, // deterministic hash of beast composition
    pub unit_count: u8, // number of beasts in lineup
}

/// Per-run matchmaking state tracking anti-repeat and ecology counts.
#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct RunMatchState {
    #[key]
    pub run_id: u32,
    pub snapshot_count: u16, // total snapshots in pool
    pub attacker_power: u32,
    pub encounters_played: u8,
    // Recent defenders for cooldown (circular buffer of last 3)
    pub recent_def_1: ContractAddress,
    pub recent_def_2: ContractAddress,
    pub recent_def_3: ContractAddress,
    // Ecology class encounter counts
    pub eco_count_1: u8, // mono_type
    pub eco_count_2: u8, // dual_type
    pub eco_count_3: u8, // balanced
    pub eco_count_4: u8, // burst
    pub eco_count_5: u8, // tank
    pub eco_count_6: u8, // control
    // Last ecology class selected (for consecutive avoidance, 0 = none)
    pub last_ecology_class: u8,
}

/// Tracks which lineup hashes have been used in a run (one entry per used hash).
#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct UsedLineupHash {
    #[key]
    pub run_id: u32,
    #[key]
    pub lineup_hash: felt252,
    pub used: bool,
}

/// Cross-run defender memory: stores the last 5 defenders faced across runs.
/// Persists between runs to avoid facing the same opponents repeatedly.
#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct CrossRunMemory {
    #[key]
    pub player: ContractAddress,
    pub def_1: ContractAddress,
    pub def_2: ContractAddress,
    pub def_3: ContractAddress,
    pub def_4: ContractAddress,
    pub def_5: ContractAddress,
}
