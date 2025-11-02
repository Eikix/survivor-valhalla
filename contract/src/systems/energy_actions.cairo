#[starknet::interface]
pub trait IEnergyActions<T> {
    fn get_energy(self: @T, player: starknet::ContractAddress) -> u8;
}

#[dojo::contract]
pub mod energy_actions {
    use dojo::model::ModelStorage;
    use starknet::{ContractAddress, get_block_timestamp};
    use survivor_valhalla::models::PlayerEnergy;
    use super::IEnergyActions;

    const MAX_ENERGY: u8 = 5;
    const ENERGY_REFILL_SECONDS: u64 = 86400; // 24 hours

    #[abi(embed_v0)]
    impl EnergyActionsImpl of IEnergyActions<ContractState> {
        fn get_energy(self: @ContractState, player: ContractAddress) -> u8 {
            let world = self.world_default();
            let mut energy: PlayerEnergy = world.read_model(player);

            // If player has no energy record, return max energy
            if energy.last_refill_time == 0 {
                return MAX_ENERGY;
            }

            // Check if energy should be refilled
            let current_time = get_block_timestamp();
            let time_since_refill = current_time - energy.last_refill_time;

            if time_since_refill >= ENERGY_REFILL_SECONDS {
                MAX_ENERGY
            } else {
                energy.energy
            }
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn world_default(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"survivor_valhalla")
        }
    }
}
