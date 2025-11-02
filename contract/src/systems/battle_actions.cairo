#[starknet::interface]
pub trait IBattleActions<T> {
    fn battle(ref self: T, defender: starknet::ContractAddress);
    fn set_attack_lineup(ref self: T, adventurer1_id: u64, adventurer2_id: u64, adventurer3_id: u64, adventurer4_id: u64, adventurer5_id: u64);
}

#[dojo::contract]
pub mod battle_actions {
    use dojo::event::EventStorage;
    use dojo::model::ModelStorage;
    use survivor_valhalla::models::{BeastLineup, PlayerEnergy, Battle, AttackLineup, CachedAdventurer};
    use survivor_valhalla::interfaces::adventurer::{IAdventurerSystemsDispatcher, IAdventurerSystemsDispatcherTrait, IERC721Dispatcher, IERC721DispatcherTrait};
    use survivor_valhalla::constants::{LOOT_SURVIVOR_ERC721, ADVENTURER_SYSTEMS, BEASTMODE_DUNGEON};
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
            
            // Simple battle simulation (50/50 for now)
            // TODO: Implement actual battle logic based on beast stats
            let battle_seed: u256 = current_time.into() + Into::<ContractAddress, felt252>::into(attacker).into() + Into::<ContractAddress, felt252>::into(defender).into();
            let winner = if battle_seed % 2 == 0 { attacker } else { defender };
            
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
            
            // Get contract dispatchers
            let loot_survivor_address: ContractAddress = LOOT_SURVIVOR_ERC721.try_into().unwrap();
            let adventurer_systems_address: ContractAddress = ADVENTURER_SYSTEMS.try_into().unwrap();
            let beastmode_dungeon_address: ContractAddress = BEASTMODE_DUNGEON.try_into().unwrap();
            
            let adventurer_dispatcher = IAdventurerSystemsDispatcher { contract_address: adventurer_systems_address };
            let erc721_dispatcher = IERC721Dispatcher { contract_address: loot_survivor_address };
            
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