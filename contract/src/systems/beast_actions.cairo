#[starknet::interface]
pub trait IBeastActions<T> {
    fn register(
        ref self: T,
        beast1_id: u256,
        beast2_id: u256,
        beast3_id: u256,
        beast4_id: u256,
        beast5_id: u256,
    );
    fn swap(ref self: T, position: u8, new_beast_id: u256);
}

#[dojo::contract]
pub mod beast_actions {
    use beasts_nft::interfaces::{IBeastsDispatcher, IBeastsDispatcherTrait};
    use beasts_nft::pack::PackableBeast;
    use dojo::event::EventStorage;
    use dojo::model::ModelStorage;
    use openzeppelin_token::erc721::interface::{IERC721Dispatcher, IERC721DispatcherTrait};
    use starknet::{ContractAddress, get_block_timestamp, get_caller_address};
    use survivor_valhalla::models::{Beast, BeastLineup, PlayerEnergy};
    use super::IBeastActions;

    #[cfg(not(test))]
    const BEASTS_CONTRACT: felt252 =
        0x046dA8955829ADF2bDa310099A0063451923f02E648cF25A1203aac6335CF0e4;

    #[cfg(test)]
    const BEASTS_CONTRACT: felt252 = 0x0; // For tests, we'll skip verification

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
        fn register(
            ref self: ContractState,
            beast1_id: u256,
            beast2_id: u256,
            beast3_id: u256,
            beast4_id: u256,
            beast5_id: u256,
        ) {
            let mut world = self.world_default();
            let player = get_caller_address();

            // Verify ownership and fetch beast details
            if BEASTS_CONTRACT != 0x0 {
                let beasts_contract: ContractAddress = BEASTS_CONTRACT.try_into().unwrap();
                let beasts_dispatcher = IBeastsDispatcher { contract_address: beasts_contract };
                let erc721_dispatcher = IERC721Dispatcher { contract_address: beasts_contract };

                // Store beast 1
                if beast1_id != 0 {
                    assert(erc721_dispatcher.owner_of(beast1_id) == player, 'Not owner of beast 1');
                    let beast_data: PackableBeast = beasts_dispatcher.get_beast(beast1_id);
                    let beast = Beast {
                        player,
                        position: 0,
                        token_id: beast1_id,
                        beast_id: beast_data.id,
                        level: beast_data.level,
                        health: beast_data.health,
                        beast_type: 0,
                        tier: 0,
                    };
                    world.write_model(@beast);
                }

                // Store beast 2
                if beast2_id != 0 {
                    assert(erc721_dispatcher.owner_of(beast2_id) == player, 'Not owner of beast 2');
                    let beast_data: PackableBeast = beasts_dispatcher.get_beast(beast2_id);
                    let beast = Beast {
                        player,
                        position: 1,
                        token_id: beast2_id,
                        beast_id: beast_data.id,
                        level: beast_data.level,
                        health: beast_data.health,
                        beast_type: 0,
                        tier: 0,
                    };
                    world.write_model(@beast);
                }

                // Store beast 3
                if beast3_id != 0 {
                    assert(erc721_dispatcher.owner_of(beast3_id) == player, 'Not owner of beast 3');
                    let beast_data: PackableBeast = beasts_dispatcher.get_beast(beast3_id);
                    let beast = Beast {
                        player,
                        position: 2,
                        token_id: beast3_id,
                        beast_id: beast_data.id,
                        level: beast_data.level,
                        health: beast_data.health,
                        beast_type: 0,
                        tier: 0,
                    };
                    world.write_model(@beast);
                }

                // Store beast 4
                if beast4_id != 0 {
                    assert(erc721_dispatcher.owner_of(beast4_id) == player, 'Not owner of beast 4');
                    let beast_data: PackableBeast = beasts_dispatcher.get_beast(beast4_id);
                    let beast = Beast {
                        player,
                        position: 3,
                        token_id: beast4_id,
                        beast_id: beast_data.id,
                        level: beast_data.level,
                        health: beast_data.health,
                        beast_type: 0,
                        tier: 0,
                    };
                    world.write_model(@beast);
                }

                // Store beast 5
                if beast5_id != 0 {
                    assert(erc721_dispatcher.owner_of(beast5_id) == player, 'Not owner of beast 5');
                    let beast_data: PackableBeast = beasts_dispatcher.get_beast(beast5_id);
                    let beast = Beast {
                        player,
                        position: 4,
                        token_id: beast5_id,
                        beast_id: beast_data.id,
                        level: beast_data.level,
                        health: beast_data.health,
                        beast_type: 0,
                        tier: 0,
                    };
                    world.write_model(@beast);
                }
            }

            // Initialize player energy if first time
            let mut energy: PlayerEnergy = world.read_model(player);
            if energy.energy == 0 && energy.last_refill_time == 0 {
                energy =
                    PlayerEnergy { player, energy: 5, last_refill_time: get_block_timestamp() };
                world.write_model(@energy);
            }

            let lineup = BeastLineup {
                player, beast1_id, beast2_id, beast3_id, beast4_id, beast5_id,
            };

            world.write_model(@lineup);
            world
                .emit_event(
                    @BeastLineupRegistered {
                        player, beast1_id, beast2_id, beast3_id, beast4_id, beast5_id,
                    },
                );
        }

        fn swap(ref self: ContractState, position: u8, new_beast_id: u256) {
            let mut world = self.world_default();
            let player = get_caller_address();

            // Cannot swap to empty (0)
            assert(new_beast_id != 0, 'Cannot swap to empty');
            assert(position <= 4, 'Invalid position');

            // Verify ownership and update beast details
            if BEASTS_CONTRACT != 0x0 {
                let beasts_contract: ContractAddress = BEASTS_CONTRACT.try_into().unwrap();
                let beasts_dispatcher = IBeastsDispatcher { contract_address: beasts_contract };
                let erc721_dispatcher = IERC721Dispatcher { contract_address: beasts_contract };
                assert(erc721_dispatcher.owner_of(new_beast_id) == player, 'Not owner of beast');

                // Fetch and store new beast details
                let beast_data: PackableBeast = beasts_dispatcher.get_beast(new_beast_id);
                let beast = Beast {
                    player,
                    position,
                    token_id: new_beast_id,
                    beast_id: beast_data.id,
                    level: beast_data.level,
                    health: beast_data.health,
                    beast_type: 0, // TODO: Determine from beast_id
                    tier: 0 // TODO: Determine from beast_id
                };
                world.write_model(@beast);
            }

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
            }

            world.write_model(@lineup);
            world.emit_event(@BeastSwapped { player, position, new_beast_id });
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        /// Use the default namespace "survivor_valhalla". This function is handy since the
        /// ByteArray can't be const.
        fn world_default(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"survivor_valhalla")
        }
    }
}
