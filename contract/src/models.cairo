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
    pub round: u8,              // Current round (1-3)
    pub turn: u8,               // Current turn in round
    pub attacker_wins: u8,      // Rounds won by attacker
    pub defender_wins: u8,      // Rounds won by defender
    pub is_complete: bool,
}

#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct CombatUnit {
    #[key]
    pub battle_id: u32,
    #[key]
    pub unit_id: u64,           // adventurer_id or beast_id
    pub position: u8,           // 1-5 lineup position
    pub is_adventurer: bool,
    pub current_hp: u16,
    pub max_hp: u16,
    pub damage: u16,
    pub initiative: u8,
    pub weapon_type: u8,        // For adventurers (1=Magic, 2=Blade, 3=Bludgeon)
    pub beast_type: u8,         // For beasts (1=Magic_or_Cloth, 2=Blade_or_Hide, 3=Bludgeon_or_Metal)
    pub is_alive: bool,
}