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
        assert(lineup.beast1_id == 0, 'Beast 1 should be 0');
        assert(lineup.beast2_id == 0, 'Beast 2 should be 0');
        assert(lineup.beast3_id == 0, 'Beast 3 should be 0');
        assert(lineup.beast4_id == 0, 'Beast 4 should be 0');
        assert(lineup.beast5_id == 0, 'Beast 5 should be 0');

        // Check energy was initialized
        let energy: PlayerEnergy = world.read_model(player1);
        assert(energy.energy == 5, 'Should have 5 energy');
        assert(energy.last_refill_time > 0, 'Should have refill time set');
    }

    #[test]
    fn test_register_partial_lineup() {
        let (mut world, beast_actions, player1) = setup_test();

        // Register with some beasts
        beast_actions.register(BEAST1_ID, BEAST2_ID, 0, 0, 0);

        // Check lineup
        let lineup: BeastLineup = world.read_model(player1);
        assert(lineup.beast1_id == BEAST1_ID, 'Beast 1 mismatch');
        assert(lineup.beast2_id == BEAST2_ID, 'Beast 2 mismatch');
        assert(lineup.beast3_id == 0, 'Beast 3 should be 0');
    }

    #[test]
    fn test_register_full_lineup() {
        let (mut world, beast_actions, player1) = setup_test();

        // Register full lineup
        beast_actions.register(BEAST1_ID, BEAST2_ID, BEAST3_ID, BEAST4_ID, BEAST5_ID);

        // Check all beasts are registered
        let lineup: BeastLineup = world.read_model(player1);
        assert(lineup.beast1_id == BEAST1_ID, 'Beast 1 mismatch');
        assert(lineup.beast2_id == BEAST2_ID, 'Beast 2 mismatch');
        assert(lineup.beast3_id == BEAST3_ID, 'Beast 3 mismatch');
        assert(lineup.beast4_id == BEAST4_ID, 'Beast 4 mismatch');
        assert(lineup.beast5_id == BEAST5_ID, 'Beast 5 mismatch');
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
        assert(lineup.beast1_id == BEAST1_ID, 'Beast 1 unchanged');
        assert(lineup.beast2_id == BEAST2_ID, 'Beast 2 unchanged');
        assert(lineup.beast3_id == new_beast_id, 'Beast 3 should be swapped');
        assert(lineup.beast4_id == BEAST4_ID, 'Beast 4 unchanged');
        assert(lineup.beast5_id == BEAST5_ID, 'Beast 5 unchanged');
    }

    #[test]
    #[should_panic(expected: ('Cannot swap to empty', 'ENTRYPOINT_FAILED'))]
    fn test_swap_to_empty_fails() {
        let (_world, beast_actions, _player1) = setup_test();

        // Register lineup first
        beast_actions.register(BEAST1_ID, 0, 0, 0, 0);

        // Try to swap to empty (0)
        beast_actions.swap(0, 0);
    }

    #[test]
    #[should_panic(expected: ('Invalid position', 'ENTRYPOINT_FAILED'))]
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
        assert(energy.energy == 5, 'Should have 5 energy');
        let first_refill_time = energy.last_refill_time;

        // Second registration doesn't reset energy
        testing::set_contract_address(player1);
        beast_actions.register(BEAST1_ID, BEAST2_ID, 0, 0, 0);

        let energy_after: PlayerEnergy = world.read_model(player1);
        assert(energy_after.energy == 5, 'Energy unchanged');
        assert(energy_after.last_refill_time == first_refill_time, 'Refill time unchanged');
    }
}
