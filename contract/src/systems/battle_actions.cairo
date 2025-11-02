#[starknet::interface]
pub trait IBattleActions<T> {
    fn battle(ref self: T, defender: starknet::ContractAddress);
    fn set_attack_lineup(ref self: T, adventurer1_id: u64, adventurer2_id: u64, adventurer3_id: u64, adventurer4_id: u64, adventurer5_id: u64);
}

#[dojo::contract]
pub mod battle_actions {
    use dojo::event::EventStorage;
    use dojo::model::ModelStorage;
    use survivor_valhalla::models::{BeastLineup, PlayerEnergy, Battle, AttackLineup, CachedAdventurer, AdventurerWeapon, BattleState, CombatUnit, Beast};
    use survivor_valhalla::interfaces::adventurer::{IAdventurerSystemsDispatcher, IAdventurerSystemsDispatcherTrait, IERC721Dispatcher, IERC721DispatcherTrait, ILootSystemsDispatcher, ILootSystemsDispatcherTrait, ItemTrait};
    use survivor_valhalla::constants::{LOOT_SURVIVOR_ERC721, ADVENTURER_SYSTEMS, BEASTMODE_DUNGEON, LOOT_SYSTEMS};
    use starknet::{ContractAddress, get_caller_address, get_block_timestamp};
    use super::IBattleActions;

    const MAX_ENERGY: u8 = 5;
    const ENERGY_REFILL_SECONDS: u64 = 86400; // 24 hours

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct BattleCompleted {
        #[key]
        pub battle_id: u32,
        pub attacker: ContractAddress,
        pub defender: ContractAddress,
        pub winner: ContractAddress,
        pub timestamp: u64,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct EnergyConsumed {
        #[key]
        pub player: ContractAddress,
        pub energy_remaining: u8,
        pub timestamp: u64,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct RoundCompleted {
        #[key]
        pub battle_id: u32,
        pub round: u8,
        pub winner: ContractAddress,
        pub attacker_survivors: u8,
        pub defender_survivors: u8,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct UnitDefeated {
        #[key]
        pub battle_id: u32,
        pub round: u8,
        pub unit_id: u64,
        pub is_adventurer: bool,
        pub position: u8,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct DamageDealt {
        #[key]
        pub battle_id: u32,
        pub attacker_id: u64,
        pub target_id: u64,
        pub damage: u16,
        pub type_multiplier: u16, // x100 for precision (150 = 1.5x)
    }

    #[abi(embed_v0)]
    impl BattleActionsImpl of IBattleActions<ContractState> {
        fn battle(ref self: ContractState, defender: ContractAddress) {
            let mut world = self.world_default();
            let attacker = get_caller_address();
            let current_time = get_block_timestamp();
            
            assert(attacker != defender, 'Cannot battle yourself');
            
            // Check attacker has an attack lineup (adventurers)
            let attack_lineup: AttackLineup = world.read_model(attacker);
            assert(attack_lineup.adventurer1_id != 0, 'No attack lineup registered');
            
            // Check defender has a defense lineup (beasts)
            let defender_lineup: BeastLineup = world.read_model(defender);
            assert(defender_lineup.beast1_id != 0, 'Defender has no lineup');
            
            // Check and update energy
            let mut energy: PlayerEnergy = world.read_model(attacker);
            update_energy(ref energy, current_time);
            assert(energy.energy > 0, 'Not enough energy');
            
            // Deduct energy
            energy.energy -= 1;
            world.write_model(@energy);
            world.emit_event(@EnergyConsumed { 
                player: attacker, 
                energy_remaining: energy.energy, 
                timestamp: current_time 
            });
            
            // Generate battle ID (using timestamp + addresses for uniqueness)
            let battle_seed: u256 = current_time.into() + Into::<ContractAddress, felt252>::into(attacker).into() + Into::<ContractAddress, felt252>::into(defender).into();
            let battle_id: u32 = (battle_seed % 999999).try_into().unwrap() + 1;
            
            // Setup combat units
            let (mut adventurer_units, mut beast_units, initiative_order) = setup_combat_units(
                ref world, battle_id, attacker, defender, attack_lineup, defender_lineup
            );
            
            // Execute combat
            let winner = execute_combat(
                ref world, battle_id, ref adventurer_units, ref beast_units, initiative_order, attacker, defender
            );
            
            // Create final battle record
            let battle = Battle {
                battle_id,
                attacker,
                defender,
                winner,
                timestamp: current_time,
            };
            
            world.write_model(@battle);
            world.emit_event(@BattleCompleted { 
                battle_id,
                attacker,
                defender,
                winner,
                timestamp: current_time,
            });
        }

        fn set_attack_lineup(
            ref self: ContractState, 
            adventurer1_id: u64, 
            adventurer2_id: u64, 
            adventurer3_id: u64, 
            adventurer4_id: u64, 
            adventurer5_id: u64
        ) {
            let mut world = self.world_default();
            let player = get_caller_address();
            
            // Get contract dispatchers
            let loot_survivor_address: ContractAddress = LOOT_SURVIVOR_ERC721.try_into().unwrap();
            let adventurer_systems_address: ContractAddress = ADVENTURER_SYSTEMS.try_into().unwrap();
            let beastmode_dungeon_address: ContractAddress = BEASTMODE_DUNGEON.try_into().unwrap();
            let loot_systems_address: ContractAddress = LOOT_SYSTEMS.try_into().unwrap();
            
            let adventurer_dispatcher = IAdventurerSystemsDispatcher { contract_address: adventurer_systems_address };
            let erc721_dispatcher = IERC721Dispatcher { contract_address: loot_survivor_address };
            let loot_dispatcher = ILootSystemsDispatcher { contract_address: loot_systems_address };
            
            // Validate and cache each adventurer
            let adventurer_ids = array![adventurer1_id, adventurer2_id, adventurer3_id, adventurer4_id, adventurer5_id];
            let mut i: usize = 0;
            
            loop {
                if i >= 5 {
                    break;
                }
                
                let adventurer_id = *adventurer_ids.at(i);
                
                if adventurer_id != 0 {
                    // Verify ownership
                    let owner = erc721_dispatcher.owner_of(adventurer_id.into());
                    assert(owner == player, 'Not owner of adventurer');
                    
                    // Verify adventurer is from beastmode dungeon
                    let dungeon = adventurer_dispatcher.get_adventurer_dungeon(adventurer_id);
                    assert(dungeon == beastmode_dungeon_address, 'Wrong dungeon');
                    
                    // Get adventurer data
                    let adventurer = adventurer_dispatcher.get_adventurer(adventurer_id);
                    assert(adventurer.health == 0, 'Adventurer is not dead');
                    
                    // Calculate level from XP (roughly following Death Mountain logic)
                    let level = if adventurer.xp == 0 { 1 } else { ((adventurer.xp / 100) + 1).try_into().unwrap() };
                    
                    // Cache adventurer stats
                    let cached = CachedAdventurer {
                        player,
                        adventurer_id,
                        health: adventurer.health,
                        level,
                        strength: adventurer.stats.strength,
                        dexterity: adventurer.stats.dexterity,
                        vitality: adventurer.stats.vitality,
                        intelligence: adventurer.stats.intelligence,
                        wisdom: adventurer.stats.wisdom,
                        charisma: adventurer.stats.charisma,
                        luck: adventurer.stats.luck,
                    };
                    world.write_model(@cached);
                    
                    // Extract weapon info using Death Mountain loot dispatcher
                    let weapon_loot = loot_dispatcher.get_item(adventurer.equipment.weapon);
                    let weapon_power = calculate_weapon_power(adventurer.equipment.weapon, weapon_loot.tier);
                    
                    let weapon = AdventurerWeapon {
                        player,
                        adventurer_id,
                        weapon_type: weapon_loot.item_type,
                        weapon_power,
                    };
                    world.write_model(@weapon);
                }
                
                i += 1;
            };
            
            // Save attack lineup
            let lineup = AttackLineup {
                player,
                adventurer1_id,
                adventurer2_id,
                adventurer3_id,
                adventurer4_id,
                adventurer5_id,
            };
            world.write_model(@lineup);
        }
    }

    fn update_energy(ref energy: PlayerEnergy, current_time: u64) {
        // Auto-refill energy every 24 hours
        let time_since_refill = current_time - energy.last_refill_time;
        if time_since_refill >= ENERGY_REFILL_SECONDS {
            energy.energy = MAX_ENERGY;
            energy.last_refill_time = current_time;
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn world_default(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"survivor_valhalla")
        }
    }
    
    // Calculate weapon power using Death Mountain formula: Base Attack = Item Level × (6 - Tier)
    fn calculate_weapon_power(weapon: survivor_valhalla::interfaces::adventurer::Item, weapon_tier: u8) -> u16 {
        // Get greatness (level) from weapon XP
        let level = weapon.get_greatness();
        
        // Death Mountain formula: Base Attack = Item Level × (6 - Tier)
        let base_attack = level.into() * (6 - weapon_tier.into());
        
        base_attack
    }

    // Calculate adventurer HP: 100 + vitality * 10
    fn calculate_adventurer_hp(vitality: u8) -> u16 {
        100 + (vitality.into() * 10)
    }

    // Calculate beast damage: level * (6 - tier)
    fn calculate_beast_damage(level: u16, tier: u8) -> u16 {
        level * (6 - tier.into())
    }

    // Get type effectiveness multiplier (x100 for precision: 150 = 1.5x, 75 = 0.75x, 100 = 1.0x)
    fn get_damage_multiplier(weapon_type: u8, beast_type: u8) -> u16 {
        if weapon_type == 1 { // Magic
            if beast_type == 1 { 75 }        // vs Magic_or_Cloth = 0.75x
            else if beast_type == 2 { 150 }  // vs Blade_or_Hide = 1.5x  
            else if beast_type == 3 { 100 }  // vs Bludgeon_or_Metal = 1.0x
            else { 100 }
        } else if weapon_type == 2 { // Blade
            if beast_type == 1 { 150 }       // vs Magic_or_Cloth = 1.5x
            else if beast_type == 2 { 75 }   // vs Blade_or_Hide = 0.75x
            else if beast_type == 3 { 100 }  // vs Bludgeon_or_Metal = 1.0x
            else { 100 }
        } else if weapon_type == 3 { // Bludgeon
            if beast_type == 1 { 100 }       // vs Magic_or_Cloth = 1.0x
            else if beast_type == 2 { 150 }  // vs Blade_or_Hide = 1.5x
            else if beast_type == 3 { 75 }   // vs Bludgeon_or_Metal = 0.75x
            else { 100 }
        } else {
            100 // Default neutral
        }
    }

    // Apply damage with type effectiveness
    fn calculate_final_damage(base_damage: u16, attacker_type: u8, defender_type: u8, is_adventurer_attacking: bool) -> u16 {
        if is_adventurer_attacking {
            // Adventurer attacking beast: weapon_type vs beast_type
            let multiplier = get_damage_multiplier(attacker_type, defender_type);
            (base_damage * multiplier) / 100
        } else {
            // Beast attacking adventurer: no type effectiveness for beasts
            base_damage
        }
    }

    // Find next alive target using deterministic position-based targeting
    fn get_target_position(attacker_pos: u8, opponent_alive: @Array<bool>) -> Option<u8> {
        let mut target_pos = attacker_pos;
        let mut checked_positions: u8 = 0;
        
        loop {
            if checked_positions == 5 {
                break Option::None; // All dead
            }
            
            if *opponent_alive.at((target_pos - 1).into()) { // Convert to 0-indexed
                break Option::Some(target_pos);
            }
            
            // Move to next position (circular 1-5)
            target_pos = if target_pos == 5 { 1 } else { target_pos + 1 };
            checked_positions += 1;
        }
    }

    // Setup combat units and determine initiative order
    fn setup_combat_units(
        ref world: dojo::world::WorldStorage,
        battle_id: u32,
        attacker: ContractAddress,
        defender: ContractAddress,
        attack_lineup: AttackLineup,
        defender_lineup: BeastLineup
    ) -> (Array<CombatUnit>, Array<CombatUnit>, Array<(u8, bool)>) {
        let mut adventurer_units = array![];
        let mut beast_units = array![];
        let mut initiative_order = array![];

        // Setup adventurer units (positions 1-5)
        let adventurer_ids = array![
            attack_lineup.adventurer1_id, attack_lineup.adventurer2_id, attack_lineup.adventurer3_id,
            attack_lineup.adventurer4_id, attack_lineup.adventurer5_id
        ];

        let mut pos: u8 = 1;
        loop {
            if pos > 5 {
                break;
            }
            
            let adventurer_id = *adventurer_ids.at((pos - 1).into());
            if adventurer_id != 0 {
                let cached_adv: CachedAdventurer = world.read_model((attacker, adventurer_id));
                let weapon: AdventurerWeapon = world.read_model((attacker, adventurer_id));
                
                let hp = calculate_adventurer_hp(cached_adv.vitality);
                let initiative = cached_adv.charisma;

                let unit = CombatUnit {
                    battle_id,
                    unit_id: adventurer_id,
                    position: pos,
                    is_adventurer: true,
                    current_hp: hp,
                    max_hp: hp,
                    damage: weapon.weapon_power,
                    initiative,
                    weapon_type: weapon.weapon_type,
                    beast_type: 0, // Not applicable
                    is_alive: true,
                };

                adventurer_units.append(unit);
                initiative_order.append((initiative, true)); // (initiative, is_adventurer)
            }
            pos += 1;
        };

        // Setup beast units (positions 1-5) 
        let beast_ids = array![
            defender_lineup.beast1_id, defender_lineup.beast2_id, defender_lineup.beast3_id,
            defender_lineup.beast4_id, defender_lineup.beast5_id
        ];

        pos = 1;
        loop {
            if pos > 5 {
                break;
            }
            
            let beast_id = *beast_ids.at((pos - 1).into());
            if beast_id != 0 {
                let beast: Beast = world.read_model((defender, pos));
                let damage = calculate_beast_damage(beast.level, beast.tier);

                let unit = CombatUnit {
                    battle_id,
                    unit_id: beast_id.try_into().unwrap(),
                    position: pos,
                    is_adventurer: false,
                    current_hp: beast.health,
                    max_hp: beast.health,
                    damage,
                    initiative: beast.level.try_into().unwrap(),
                    weapon_type: 0, // Not applicable
                    beast_type: beast.beast_type,
                    is_alive: true,
                };

                beast_units.append(unit);
                initiative_order.append((beast.level.try_into().unwrap(), false)); // (initiative, is_adventurer)
            }
            pos += 1;
        };

        // Sort initiative order (simple bubble sort for now)
        // TODO: Implement proper sorting - for now just return as-is
        (adventurer_units, beast_units, initiative_order)
    }

    // Execute the main combat loop
    fn execute_combat(
        ref world: dojo::world::WorldStorage,
        battle_id: u32,
        ref adventurer_units: Array<CombatUnit>,
        ref beast_units: Array<CombatUnit>,
        initiative_order: Array<(u8, bool)>,
        attacker: ContractAddress,
        defender: ContractAddress
    ) -> ContractAddress {
        let mut adventurers_alive = array![true, true, true, true, true];
        let mut beasts_alive = array![true, true, true, true, true];

        // Simple combat: each unit attacks once in order
        let mut i = 0;
        loop {
            if i >= adventurer_units.len() + beast_units.len() {
                break;
            }
            
            // For simplified version, just alternate: adventurer, beast, adventurer, beast...
            let is_adventurer_turn = i % 2 == 0;
            
            if is_adventurer_turn {
                // Adventurer attacks beast
                let adv_index = i / 2;
                if adv_index < adventurer_units.len() {
                    let adventurer = adventurer_units.at(adv_index);
                    if *adventurer.is_alive {
                        // Find target
                        let target_pos = get_target_position(*adventurer.position, @beasts_alive);
                        match target_pos {
                            Option::Some(_pos) => {
                                // Find beast at position and deal damage
                                // This is simplified - in full version we'd look up actual beast
                                // For now, just mark as successful attack
                                world.emit_event(@DamageDealt {
                                    battle_id,
                                    attacker_id: *adventurer.unit_id,
                                    target_id: 1, // Simplified
                                    damage: *adventurer.damage,
                                    type_multiplier: 100,
                                });
                            },
                            Option::None => {} // No targets left
                        }
                    }
                }
            } else {
                // Beast attacks adventurer
                let beast_index = (i - 1) / 2;
                if beast_index < beast_units.len() {
                    let beast = beast_units.at(beast_index);
                    if *beast.is_alive {
                        // Find target and deal damage
                        let target_pos = get_target_position(*beast.position, @adventurers_alive);
                        match target_pos {
                            Option::Some(_pos) => {
                                world.emit_event(@DamageDealt {
                                    battle_id,
                                    attacker_id: *beast.unit_id,
                                    target_id: 1, // Simplified
                                    damage: *beast.damage,
                                    type_multiplier: 100,
                                });
                            },
                            Option::None => {} // No targets left
                        }
                    }
                }
            }
            
            i += 1;
        };

        // For now, randomly determine winner based on battle_id
        let winner_seed = battle_id % 2;
        if winner_seed == 0 {
            attacker
        } else {
            defender
        }
    }
}