#[starknet::interface]
pub trait IBattleActions<T> {
    fn battle(ref self: T, defender: starknet::ContractAddress);
    fn set_attack_lineup(ref self: T, adventurer1_id: u64, adventurer2_id: u64, adventurer3_id: u64, adventurer4_id: u64, adventurer5_id: u64);
}

#[dojo::contract]
pub mod battle_actions {
    use dojo::event::EventStorage;
    use dojo::model::ModelStorage;
    use survivor_valhalla::models::{BeastLineup, PlayerEnergy, Battle, AttackLineup, CachedAdventurer, Beast};
    use survivor_valhalla::interfaces::adventurer::{IAdventurerSystemsDispatcher, IAdventurerSystemsDispatcherTrait, IERC721Dispatcher, IERC721DispatcherTrait};
    use survivor_valhalla::constants::BEASTMODE_CONTRACT;
    use starknet::{ContractAddress, get_caller_address, get_block_timestamp};
    use survivor_valhalla::systems::combat::simulate_battle;
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
            
            // Load attacker's adventurers
            let mut adventurers: Array<CachedAdventurer> = ArrayTrait::new();
            adventurers.append(world.read_model((attacker, attack_lineup.adventurer1_id)));
            adventurers.append(world.read_model((attacker, attack_lineup.adventurer2_id)));
            adventurers.append(world.read_model((attacker, attack_lineup.adventurer3_id)));
            adventurers.append(world.read_model((attacker, attack_lineup.adventurer4_id)));
            adventurers.append(world.read_model((attacker, attack_lineup.adventurer5_id)));
            
            // Load defender's beasts
            let mut beasts: Array<Beast> = ArrayTrait::new();
            if defender_lineup.beast1_id != 0 {
                beasts.append(world.read_model((defender, 1_u8)));
            }
            if defender_lineup.beast2_id != 0 {
                beasts.append(world.read_model((defender, 2_u8)));
            }
            if defender_lineup.beast3_id != 0 {
                beasts.append(world.read_model((defender, 3_u8)));
            }
            if defender_lineup.beast4_id != 0 {
                beasts.append(world.read_model((defender, 4_u8)));
            }
            if defender_lineup.beast5_id != 0 {
                beasts.append(world.read_model((defender, 5_u8)));
            }
            
            // Run the battle simulation
            let attacker_won = simulate_battle(adventurers, beasts);
            let winner = if attacker_won { attacker } else { defender };
            
            // Create battle record
            let battle_id = 1; // TODO: Implement proper ID generation
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
            
            // Get Death Mountain contract dispatcher
            let beastmode_address: ContractAddress = BEASTMODE_CONTRACT.try_into().unwrap();
            let adventurer_dispatcher = IAdventurerSystemsDispatcher { contract_address: beastmode_address };
            let erc721_dispatcher = IERC721Dispatcher { contract_address: beastmode_address };
            
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
                    assert(dungeon == beastmode_address, 'Wrong dungeon');
                    
                    // Get adventurer data
                    let adventurer = adventurer_dispatcher.get_adventurer(adventurer_id);
                    assert(adventurer.health > 0, 'Adventurer is dead');
                    
                    // Calculate level from XP (roughly following Death Mountain logic)
                    let level = if adventurer.xp == 0 { 1 } else { ((adventurer.xp / 100) + 1).try_into().unwrap() };
                    
                    // Cache adventurer stats and equipment
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
                        weapon_id: adventurer.equipment.weapon,
                        chest_id: adventurer.equipment.chest,
                        head_id: adventurer.equipment.head,
                        waist_id: adventurer.equipment.waist,
                        foot_id: adventurer.equipment.foot,
                        hand_id: adventurer.equipment.hand,
                        neck_id: adventurer.equipment.neck,
                        ring_id: adventurer.equipment.ring,
                    };
                    world.write_model(@cached);
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
}