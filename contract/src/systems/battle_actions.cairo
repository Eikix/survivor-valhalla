#[starknet::interface]
pub trait IBattleActions<T> {
    fn battle(ref self: T, defender: starknet::ContractAddress);
}

#[dojo::contract]
pub mod battle_actions {
    use dojo::event::EventStorage;
    use dojo::model::ModelStorage;
    use survivor_valhalla::models::{BeastLineup, PlayerEnergy, Battle};
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
            
            // Check attacker has a lineup
            let attacker_lineup: BeastLineup = world.read_model(attacker);
            assert(attacker_lineup.beast1_id != 0, 'No lineup registered');
            
            // Check defender has a lineup
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