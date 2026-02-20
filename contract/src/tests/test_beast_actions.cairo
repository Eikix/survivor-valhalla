#[cfg(test)]
mod test_beast_actions {
    use dojo::model::ModelStorage;
    use dojo::world::WorldStorage;
    use starknet::{ContractAddress, contract_address_const, testing};
    use survivor_valhalla::models::{BeastLineup, PlayerEnergy};
    use survivor_valhalla::systems::beast_actions::{
        IBeastActionsDispatcher, IBeastActionsDispatcherTrait,
    };
    use survivor_valhalla::tests::test_world::{deploy_beast_actions, setup_world};

    const PLAYER1: felt252 = 'PLAYER1';
    const BEAST1_ID: u256 = 1;
    const BEAST2_ID: u256 = 2;
    const BEAST3_ID: u256 = 3;
    const BEAST4_ID: u256 = 4;
    const BEAST5_ID: u256 = 5;

    fn setup_test() -> (WorldStorage, IBeastActionsDispatcher, ContractAddress) {
        let mut world = setup_world();
        let beast_actions = deploy_beast_actions(world);
        let player1 = contract_address_const::<PLAYER1>();

        // Set a non-zero timestamp for tests
        testing::set_block_timestamp(1000);

        // Set caller for tests
        testing::set_contract_address(player1);

        (world, beast_actions, player1)
    }

    #[test]
    fn test_register_empty_lineup() {
        let (mut world, beast_actions, player1) = setup_test();

        // Register with all empty slots (0s)
        beast_actions.register(0, 0, 0, 0, 0);

        // Check lineup was saved
        let lineup: BeastLineup = world.read_model(player1);
        assert(lineup.beast1_id == 0, 'T_B1_ZERO');
        assert(lineup.beast2_id == 0, 'T_B2_ZERO');
        assert(lineup.beast3_id == 0, 'T_B3_ZERO');
        assert(lineup.beast4_id == 0, 'T_B4_ZERO');
        assert(lineup.beast5_id == 0, 'T_B5_ZERO');

        // Check energy was initialized
        let energy: PlayerEnergy = world.read_model(player1);
        assert(energy.energy == 5, 'T_ENERGY_5');
        assert(energy.last_refill_time > 0, 'T_REFILL_SET');
    }

    #[test]
    fn test_register_partial_lineup() {
        let (mut world, beast_actions, player1) = setup_test();

        // Register with some beasts
        beast_actions.register(BEAST1_ID, BEAST2_ID, 0, 0, 0);

        // Check lineup
        let lineup: BeastLineup = world.read_model(player1);
        assert(lineup.beast1_id == BEAST1_ID, 'T_B1_MATCH');
        assert(lineup.beast2_id == BEAST2_ID, 'T_B2_MATCH');
        assert(lineup.beast3_id == 0, 'T_B3_ZERO');
    }

    #[test]
    fn test_register_full_lineup() {
        let (mut world, beast_actions, player1) = setup_test();

        // Register full lineup
        beast_actions.register(BEAST1_ID, BEAST2_ID, BEAST3_ID, BEAST4_ID, BEAST5_ID);

        // Check all beasts are registered
        let lineup: BeastLineup = world.read_model(player1);
        assert(lineup.beast1_id == BEAST1_ID, 'T_B1_MATCH');
        assert(lineup.beast2_id == BEAST2_ID, 'T_B2_MATCH');
        assert(lineup.beast3_id == BEAST3_ID, 'T_B3_MATCH');
        assert(lineup.beast4_id == BEAST4_ID, 'T_B4_MATCH');
        assert(lineup.beast5_id == BEAST5_ID, 'T_B5_MATCH');
    }

    #[test]
    fn test_swap_beast() {
        let (mut world, beast_actions, player1) = setup_test();

        // Register initial lineup
        beast_actions.register(BEAST1_ID, BEAST2_ID, BEAST3_ID, BEAST4_ID, BEAST5_ID);

        // Swap beast at position 2 (third slot)
        let new_beast_id = 10;
        beast_actions.swap(2, new_beast_id);

        // Check swap worked
        let lineup: BeastLineup = world.read_model(player1);
        assert(lineup.beast1_id == BEAST1_ID, 'T_B1_SAME');
        assert(lineup.beast2_id == BEAST2_ID, 'T_B2_SAME');
        assert(lineup.beast3_id == new_beast_id, 'T_B3_SWAP');
        assert(lineup.beast4_id == BEAST4_ID, 'T_B4_SAME');
        assert(lineup.beast5_id == BEAST5_ID, 'T_B5_SAME');
    }

    #[test]
    #[should_panic(expected: ('E_SWP_EMP', 'ENTRYPOINT_FAILED'))]
    fn test_swap_to_empty_fails() {
        let (_world, beast_actions, _player1) = setup_test();

        // Register lineup first
        beast_actions.register(BEAST1_ID, 0, 0, 0, 0);

        // Try to swap to empty (0)
        beast_actions.swap(0, 0);
    }

    #[test]
    #[should_panic(expected: ('E_SWP_POS', 'ENTRYPOINT_FAILED'))]
    fn test_swap_invalid_position_fails() {
        let (_world, beast_actions, _player1) = setup_test();

        // Register lineup first
        beast_actions.register(BEAST1_ID, 0, 0, 0, 0);

        // Try to swap at invalid position
        beast_actions.swap(5, BEAST2_ID); // Position must be 0-4
    }

    #[test]
    fn test_energy_initialization() {
        let (mut world, beast_actions, player1) = setup_test();

        // First registration initializes energy
        beast_actions.register(BEAST1_ID, 0, 0, 0, 0);

        let energy: PlayerEnergy = world.read_model(player1);
        assert(energy.energy == 5, 'T_ENERGY_5');
        let first_refill_time = energy.last_refill_time;

        // Second registration doesn't reset energy
        testing::set_contract_address(player1);
        beast_actions.register(BEAST1_ID, BEAST2_ID, 0, 0, 0);

        let energy_after: PlayerEnergy = world.read_model(player1);
        assert(energy_after.energy == 5, 'T_ENERGY_SAME');
        assert(energy_after.last_refill_time == first_refill_time, 'T_REFILL_SAME');
    }
}
