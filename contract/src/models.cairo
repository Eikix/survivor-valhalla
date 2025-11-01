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