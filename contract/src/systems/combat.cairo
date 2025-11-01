use survivor_valhalla::models::{Beast, CachedAdventurer};
use survivor_valhalla::constants::{BEAST_TYPE_MAGICAL, BEAST_TYPE_HUNTER, BEAST_TYPE_BRUTE};

pub const ITEM_TYPE_MAGIC_OR_CLOTH: u8 = 0;
pub const ITEM_TYPE_BLADE_OR_HIDE: u8 = 1; 
pub const ITEM_TYPE_BLUDGEON_OR_METAL: u8 = 2;
pub const ITEM_TYPE_NECKLACE: u8 = 3;
pub const ITEM_TYPE_RING: u8 = 4;

#[derive(Copy, Drop)]
pub struct CombatResult {
    pub winner_is_attacker: bool,
    pub attacker_damage_dealt: u16,
    pub defender_damage_dealt: u16,
}

fn get_weapon_type(weapon_id: u8) -> u8 {
    if weapon_id == 0 {
        return ITEM_TYPE_MAGIC_OR_CLOTH;
    }
    
    if weapon_id <= 6 {
        ITEM_TYPE_MAGIC_OR_CLOTH
    } else if weapon_id <= 12 {
        ITEM_TYPE_BLADE_OR_HIDE
    } else {
        ITEM_TYPE_BLUDGEON_OR_METAL
    }
}

fn get_armor_type(armor_id: u8) -> u8 {
    if armor_id == 0 {
        return ITEM_TYPE_MAGIC_OR_CLOTH;
    }
    
    if armor_id <= 5 {
        ITEM_TYPE_MAGIC_OR_CLOTH
    } else if armor_id <= 10 {
        ITEM_TYPE_BLADE_OR_HIDE
    } else {
        ITEM_TYPE_BLUDGEON_OR_METAL
    }
}

fn get_type_effectiveness(weapon_type: u8, armor_type: u8) -> u16 {
    if weapon_type == ITEM_TYPE_MAGIC_OR_CLOTH && armor_type == ITEM_TYPE_BLADE_OR_HIDE {
        150
    } else if weapon_type == ITEM_TYPE_BLADE_OR_HIDE && armor_type == ITEM_TYPE_BLUDGEON_OR_METAL {
        150
    } else if weapon_type == ITEM_TYPE_BLUDGEON_OR_METAL && armor_type == ITEM_TYPE_MAGIC_OR_CLOTH {
        150
    } else if weapon_type == armor_type {
        100
    } else {
        75
    }
}

fn calculate_damage(attacker_stats: @CachedAdventurer, defender_armor_type: u8, is_crit: bool) -> u16 {
    let weapon_type = get_weapon_type(*attacker_stats.weapon_id);
    let type_modifier = get_type_effectiveness(weapon_type, defender_armor_type);
    
    let base_damage = (*attacker_stats.strength).into() * 10;
    
    let damage = (base_damage * type_modifier) / 100;
    
    if is_crit {
        damage * 2
    } else {
        damage
    }
}

pub fn adventurer_vs_beast(adventurer: @CachedAdventurer, beast: @Beast) -> CombatResult {
    let mut adventurer_hp: u16 = *adventurer.health;
    let mut beast_hp: u16 = *beast.health;
    let mut total_damage_by_adventurer: u16 = 0;
    let mut total_damage_by_beast: u16 = 0;
    
    let beast_armor_type = if *beast.beast_type == BEAST_TYPE_MAGICAL {
        ITEM_TYPE_MAGIC_OR_CLOTH
    } else if *beast.beast_type == BEAST_TYPE_HUNTER {
        ITEM_TYPE_BLADE_OR_HIDE
    } else {
        ITEM_TYPE_BLUDGEON_OR_METAL
    };
    
    let adventurer_armor_type = get_armor_type(*adventurer.chest_id);
    
    let mut round: u8 = 0;
    loop {
        round += 1;
        
        let adventurer_crit = round % 5 == 0;
        let adventurer_damage = calculate_damage(adventurer, beast_armor_type, adventurer_crit);
        
        if adventurer_damage >= beast_hp {
            total_damage_by_adventurer += beast_hp;
            beast_hp = 0;
            break;
        }
        
        beast_hp -= adventurer_damage;
        total_damage_by_adventurer += adventurer_damage;
        
        let beast_damage = (*beast.tier).into() * 15;
        let beast_type_bonus = if *beast.beast_type == BEAST_TYPE_BRUTE { 20 } else { 10 };
        let total_beast_damage = beast_damage + beast_type_bonus;
        
        if total_beast_damage >= adventurer_hp {
            total_damage_by_beast += adventurer_hp;
            adventurer_hp = 0;
            break;
        }
        
        adventurer_hp -= total_beast_damage;
        total_damage_by_beast += total_beast_damage;
        
        if round > 100 {
            break;
        }
    };
    
    CombatResult {
        winner_is_attacker: beast_hp == 0,
        attacker_damage_dealt: total_damage_by_adventurer,
        defender_damage_dealt: total_damage_by_beast,
    }
}

pub fn simulate_battle(adventurers: Array<CachedAdventurer>, beasts: Array<Beast>) -> bool {
    let mut alive_adventurers: Array<CachedAdventurer> = ArrayTrait::new();
    let mut alive_beasts: Array<Beast> = ArrayTrait::new();
    
    let mut i: u32 = 0;
    loop {
        if i >= adventurers.len() {
            break;
        }
        let adventurer = *adventurers.at(i);
        if adventurer.adventurer_id != 0 {
            alive_adventurers.append(adventurer);
        }
        i += 1;
    };
    
    i = 0;
    loop {
        if i >= beasts.len() {
            break;
        }
        let beast = *beasts.at(i);
        if beast.token_id != 0 {
            alive_beasts.append(beast);
        }
        i += 1;
    };
    
    let mut adventurer_index: u32 = 0;
    let mut beast_index: u32 = 0;
    
    loop {
        if adventurer_index >= alive_adventurers.len() || beast_index >= alive_beasts.len() {
            break;
        }
        
        let adventurer = *alive_adventurers.at(adventurer_index);
        let beast = *alive_beasts.at(beast_index);
        
        let result = adventurer_vs_beast(@adventurer, @beast);
        
        if result.winner_is_attacker {
            beast_index += 1;
        } else {
            adventurer_index += 1;
        }
    };
    
    adventurer_index < alive_adventurers.len() && beast_index >= alive_beasts.len()
}