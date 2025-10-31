#[starknet::interface]
pub trait IBeastActions<T> {
    fn register(ref self: T, beast1_id: u256, beast2_id: u256, beast3_id: u256, beast4_id: u256, beast5_id: u256);
    fn swap(ref self: T, position: u8, new_beast_id: u256);
}

#[dojo::contract]
pub mod beast_actions {
    use dojo::event::EventStorage;
    use dojo::model::ModelStorage;
    use dojo_starter::models::BeastLineup;
    use starknet::{ContractAddress, get_caller_address};
    use super::IBeastActions;

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct BeastLineupRegistered {
        #[key]
        pub player: ContractAddress,
        pub beast1_id: u256,
        pub beast2_id: u256,
        pub beast3_id: u256,
        pub beast4_id: u256,
        pub beast5_id: u256,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct BeastSwapped {
        #[key]
        pub player: ContractAddress,
        pub position: u8,
        pub new_beast_id: u256,
    }

    #[abi(embed_v0)]
    impl BeastActionsImpl of IBeastActions<ContractState> {
        fn register(ref self: ContractState, beast1_id: u256, beast2_id: u256, beast3_id: u256, beast4_id: u256, beast5_id: u256) {
            let mut world = self.world_default();
            let player = get_caller_address();
            
            let lineup = BeastLineup {
                player,
                beast1_id,
                beast2_id,
                beast3_id,
                beast4_id,
                beast5_id,
            };
            
            world.write_model(@lineup);
            world.emit_event(@BeastLineupRegistered { 
                player,
                beast1_id,
                beast2_id,
                beast3_id,
                beast4_id,
                beast5_id,
            });
        }

        fn swap(ref self: ContractState, position: u8, new_beast_id: u256) {
            let mut world = self.world_default();
            let player = get_caller_address();
            
            let mut lineup: BeastLineup = world.read_model(player);
            
            if position == 0 {
                lineup.beast1_id = new_beast_id;
            } else if position == 1 {
                lineup.beast2_id = new_beast_id;
            } else if position == 2 {
                lineup.beast3_id = new_beast_id;
            } else if position == 3 {
                lineup.beast4_id = new_beast_id;
            } else if position == 4 {
                lineup.beast5_id = new_beast_id;
            } else {
                panic!("Invalid position: must be between 0 and 4");
            }
            
            world.write_model(@lineup);
            world.emit_event(@BeastSwapped { player, position, new_beast_id });
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        /// Use the default namespace "dojo_starter". This function is handy since the ByteArray
        /// can't be const.
        fn world_default(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"dojo_starter")
        }
    }
}