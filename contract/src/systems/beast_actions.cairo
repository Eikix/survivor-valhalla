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
    use beasts_nft::beast_definitions;
    use beasts_nft::interfaces::{IBeastsDispatcher, IBeastsDispatcherTrait};
    use beasts_nft::pack::PackableBeast;
    use dojo::event::EventStorage;
    use dojo::model::ModelStorage;
    use openzeppelin_token::erc721::interface::{IERC721Dispatcher, IERC721DispatcherTrait};
    use starknet::{ContractAddress, get_block_timestamp, get_caller_address};
    use survivor_valhalla::constants::{BEAST_TYPE_MAGICAL, BEAST_TYPE_HUNTER, BEAST_TYPE_BRUTE};
    use survivor_valhalla::models::{ActiveRun, Beast, BeastLineup, PlayerEnergy};
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

            // Cannot modify defense lineup during an active run (snapshot integrity).
            let active: ActiveRun = world.read_model(player);
            assert(active.run_id == 0, 'Cannot modify during run');

            // Verify ownership and fetch beast details
            if BEASTS_CONTRACT != 0x0 {
                let beasts_contract: ContractAddress = BEASTS_CONTRACT.try_into().unwrap();
                let beasts_dispatcher = IBeastsDispatcher { contract_address: beasts_contract };
                let erc721_dispatcher = IERC721Dispatcher { contract_address: beasts_contract };

                let ids = array![beast1_id, beast2_id, beast3_id, beast4_id, beast5_id];
                let mut pos: u8 = 0;
                loop {
                    if pos >= 5 {
                        break;
                    }
                    let token_id = *ids.at(pos.into());
                    if token_id != 0 {
                        assert(
                            erc721_dispatcher.owner_of(token_id) == player, 'Not owner of beast',
                        );
                        let beast_data: PackableBeast = beasts_dispatcher.get_beast(token_id);
                        let beast = make_beast(player, pos, token_id, beast_data);
                        world.write_model(@beast);
                    }
                    pos += 1;
                };
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

            // Cannot modify defense lineup during an active run (snapshot integrity).
            let active: ActiveRun = world.read_model(player);
            assert(active.run_id == 0, 'Cannot modify during run');

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
                let beast = make_beast(player, position, new_beast_id, beast_data);
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

    /// Derive numeric beast_type (1=Magical, 2=Hunter, 3=Brute) from beast species id (1-75).
    /// Uses the Loot Survivor beast taxonomy: ids 1-25 Magic, 26-50 Hunter, 51-75 Brute.
    fn derive_beast_type(beast_id: u8) -> u8 {
        if beast_id == 0 {
            return 0;
        }
        let type_felt = beast_definitions::get_type(beast_id);
        if type_felt == beast_definitions::TYPE_MAGIC {
            BEAST_TYPE_MAGICAL
        } else if type_felt == beast_definitions::TYPE_HUNTER {
            BEAST_TYPE_HUNTER
        } else {
            BEAST_TYPE_BRUTE
        }
    }

    /// Create a Beast model from on-chain PackableBeast data, deriving type and tier.
    fn make_beast(
        player: ContractAddress, position: u8, token_id: u256, beast_data: PackableBeast,
    ) -> Beast {
        Beast {
            player,
            position,
            token_id,
            beast_id: beast_data.id,
            level: beast_data.level,
            health: beast_data.health,
            beast_type: derive_beast_type(beast_data.id),
            tier: beast_definitions::get_tier(beast_data.id),
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

    #[cfg(test)]
    mod tests {
        use survivor_valhalla::constants::{BEAST_TYPE_MAGICAL, BEAST_TYPE_HUNTER, BEAST_TYPE_BRUTE};
        use super::derive_beast_type;

        #[test]
        fn test_derive_beast_type_magic() {
            // Beast ids 1-25 are Magic type
            assert(derive_beast_type(1) == BEAST_TYPE_MAGICAL, 'Beast 1 magic');
            assert(derive_beast_type(13) == BEAST_TYPE_MAGICAL, 'Beast 13 magic');
            assert(derive_beast_type(25) == BEAST_TYPE_MAGICAL, 'Beast 25 magic');
        }

        #[test]
        fn test_derive_beast_type_hunter() {
            // Beast ids 26-50 are Hunter type
            assert(derive_beast_type(26) == BEAST_TYPE_HUNTER, 'Beast 26 hunter');
            assert(derive_beast_type(38) == BEAST_TYPE_HUNTER, 'Beast 38 hunter');
            assert(derive_beast_type(50) == BEAST_TYPE_HUNTER, 'Beast 50 hunter');
        }

        #[test]
        fn test_derive_beast_type_brute() {
            // Beast ids 51-75 are Brute type
            assert(derive_beast_type(51) == BEAST_TYPE_BRUTE, 'Beast 51 brute');
            assert(derive_beast_type(63) == BEAST_TYPE_BRUTE, 'Beast 63 brute');
            assert(derive_beast_type(75) == BEAST_TYPE_BRUTE, 'Beast 75 brute');
        }

        #[test]
        fn test_derive_beast_type_zero() {
            assert(derive_beast_type(0) == 0, 'Beast 0 returns 0');
        }
    }
}
