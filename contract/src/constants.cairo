// Energy System
pub const MAX_ENERGY: u8 = 5;
pub const ENERGY_REFILL_SECONDS: u64 = 86400; // 24 hours

// Battle System
pub const MAX_BEASTS_PER_LINEUP: u8 = 5;

// Beast Types (matching Loot Survivor)
pub const BEAST_TYPE_MAGICAL: u8 = 1;
pub const BEAST_TYPE_HUNTER: u8 = 2;
pub const BEAST_TYPE_BRUTE: u8 = 3;

// Beast Tiers
pub const TIER_1: u8 = 1;
pub const TIER_2: u8 = 2;
pub const TIER_3: u8 = 3;
pub const TIER_4: u8 = 4;
pub const TIER_5: u8 = 5;

// Loot Survivor contracts (mainnet)
pub const LOOT_SURVIVOR_ERC721: felt252 =
    0x036017E69D21D6D8c13E266EaBB73ef1f1D02722D86BDcAbe5f168f8e549d3cD;
pub const ADVENTURER_SYSTEMS: felt252 =
    0x3fc7ecd6d577daa1ee855a9fa13a914d01acda06715c9fc74f1ee1a5e346a01;
pub const BEASTMODE_DUNGEON: felt252 =
    0xa67ef20b61a9846e1c82b411175e6ab167ea9f8632bd6c2091823c3629ec42;

// Death Mountain contracts
pub const LOOT_SYSTEMS: felt252 = 0x4c386505ce1cc0be91e7ae8727c9feec66692a92c851b01e7f764ea0143dbe4;

// Run System
pub const RUN_ENERGY_COST: u8 = 1;
pub const HEAL_INTERVAL: u8 = 3; // Heal every N floors
pub const HEAL_PERCENT: u16 = 25; // Restore 25% max HP
pub const STAT_BOOST_VALUE: u8 = 1; // +1 to a random stat

// Floor scaling multipliers (x100 for precision: 60 = 0.6x, 150 = 1.5x)
pub const FLOOR_SCALE_1: u16 = 60; // Floor 1: 0.6x
pub const FLOOR_SCALE_2: u16 = 70; // Floor 2: 0.7x
pub const FLOOR_SCALE_3: u16 = 80; // Floor 3: 0.8x
pub const FLOOR_SCALE_4: u16 = 90; // Floor 4: 0.9x
pub const FLOOR_SCALE_5: u16 = 95; // Floor 5: 0.95x
pub const FLOOR_SCALE_6: u16 = 100; // Floor 6: 1.0x
pub const FLOOR_SCALE_7: u16 = 110; // Floor 7: 1.1x
pub const FLOOR_SCALE_8: u16 = 120; // Floor 8: 1.2x
pub const FLOOR_SCALE_9: u16 = 130; // Floor 9: 1.3x
pub const FLOOR_SCALE_BOSS: u16 = 150; // Floor 10+: 1.5x
pub const BOSS_STAT_MULT: u16 = 125; // Boss HP/damage x1.25

// Ecology Classes
pub const ECOLOGY_MONO_TYPE: u8 = 1;
pub const ECOLOGY_DUAL_TYPE: u8 = 2;
pub const ECOLOGY_BALANCED: u8 = 3;
pub const ECOLOGY_BURST: u8 = 4;
pub const ECOLOGY_TANK: u8 = 5;
pub const ECOLOGY_CONTROL: u8 = 6;
pub const ECOLOGY_CLASS_COUNT: u8 = 6;

// Power Bands (relative to attacker power)
pub const BAND_VERY_EASY: u8 = 1; // delta < -25%
pub const BAND_EASY: u8 = 2; // -25% <= delta < -10%
pub const BAND_EVEN: u8 = 3; // -10% <= delta <= +10%
pub const BAND_HARD: u8 = 4; // +10% < delta <= +25%
pub const BAND_VERY_HARD: u8 = 5; // delta > +25%

// Ecology cap: no class may exceed 40% of encounters
pub const ECOLOGY_CAP_PERCENT: u8 = 40;

// Anti-repeat: same defender cooldown (encounters)
pub const DEFENDER_COOLDOWN: u8 = 3;

// Ecology thresholds (x100 for integer math)
pub const MONO_TYPE_THRESHOLD: u16 = 80; // >=80% same type = mono
pub const DUAL_TYPE_THRESHOLD: u16 = 60; // two types >= 60% combined = dual
pub const BURST_DAMAGE_THRESHOLD: u16 = 150; // avg damage > 1.5x median = burst
pub const TANK_HP_THRESHOLD: u16 = 150; // avg HP > 1.5x median = tank

// Cross-run defender memory size
pub const CROSS_RUN_MEMORY_SIZE: u8 = 5;

// Soft rule break reasons
pub const SOFT_BREAK_POOL_EXHAUSTED: u8 = 1;
pub const SOFT_BREAK_BAND_CONSTRAINT: u8 = 2;
pub const SOFT_BREAK_ECOLOGY_CONSTRAINT: u8 = 3;
