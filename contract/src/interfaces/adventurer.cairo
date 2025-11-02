use core::num::traits::Sqrt;
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

// Item structure matching Death Mountain
#[derive(Copy, Drop, Serde)]
pub struct Item {
    pub id: u8,
    pub xp: u16,
}

// Death Mountain greatness implementation for Item
#[generate_trait]
pub impl ItemImpl of ItemTrait {
    fn get_greatness(self: Item) -> u8 {
        const MAX_GREATNESS: u8 = 20;
        if self.xp == 0 {
            1
        } else {
            let level = self.xp.sqrt();
            if (level > MAX_GREATNESS) {
                MAX_GREATNESS
            } else {
                level
            }
        }
    }
}

// Equipment structure matching Death Mountain
#[derive(Copy, Drop, Serde)]
pub struct Equipment {
    pub weapon: Item,
    pub chest: Item,
    pub head: Item,
    pub waist: Item,
    pub foot: Item,
    pub hand: Item,
    pub neck: Item,
    pub ring: Item,
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

// Death Mountain loot structure
#[derive(Copy, Drop, Serde)]
pub struct Loot {
    pub id: u8,
    pub tier: u8, // 1=T1, 2=T2, 3=T3, 4=T4, 5=T5
    pub item_type: u8, // 1=Magic, 2=Blade, 3=Bludgeon, 4=Necklace, 5=Ring
    pub slot: u8 // 1=Weapon, 2=Chest, 3=Head, etc.
}

// Death Mountain loot systems interface
#[starknet::interface]
pub trait ILootSystems<TState> {
    fn get_item(self: @TState, item: u8) -> Loot;
}
