use starknet::ContractAddress;

// Stats structure matching Death Mountain
#[derive(Copy, Drop, Serde)]
pub struct Stats {
    pub strength: u8,
    pub dexterity: u8,
    pub vitality: u8,
    pub intelligence: u8,
    pub wisdom: u8,
    pub charisma: u8,
    pub luck: u8,
}

// Simplified Equipment for our needs
#[derive(Copy, Drop, Serde)]
pub struct Equipment {
    pub weapon: u8,
    pub chest: u8,
    pub head: u8,
    pub waist: u8,
    pub foot: u8,
    pub hand: u8,
    pub neck: u8,
    pub ring: u8,
}

// Adventurer structure matching Death Mountain
#[derive(Copy, Drop, Serde)]
pub struct Adventurer {
    pub health: u16,
    pub xp: u16,
    pub gold: u16,
    pub beast_health: u16,
    pub stat_upgrades_available: u8,
    pub stats: Stats,
    pub equipment: Equipment,
    pub item_specials_seed: u16,
    pub action_count: u16,
}

// Interface for Death Mountain adventurer systems
#[starknet::interface]
pub trait IAdventurerSystems<TState> {
    fn get_adventurer(self: @TState, adventurer_id: u64) -> Adventurer;
    fn get_adventurer_dungeon(self: @TState, adventurer_id: u64) -> ContractAddress;
}

// ERC721 interface for ownership checks
#[starknet::interface]
pub trait IERC721<TState> {
    fn owner_of(self: @TState, token_id: u256) -> ContractAddress;
}