#[cfg(test)]
mod test_energy_actions {
    use starknet::{ContractAddress, contract_address_const, testing, get_block_timestamp};
    use dojo::world::{WorldStorage};
    use dojo::model::{ModelStorage};
    
    use survivor_valhalla::models::{PlayerEnergy};
    use survivor_valhalla::systems::energy_actions::{IEnergyActionsDispatcher, IEnergyActionsDispatcherTrait};
    use survivor_valhalla::systems::beast_actions::{IBeastActionsDispatcher, IBeastActionsDispatcherTrait};
    use survivor_valhalla::systems::battle_actions::{IBattleActionsDispatcher, IBattleActionsDispatcherTrait};
    use survivor_valhalla::tests::test_world::{setup_world, deploy_energy_actions, deploy_beast_actions, deploy_battle_actions};
    
    const PLAYER1: felt252 = 'PLAYER1';

    fn setup_energy_test() -> (WorldStorage, IEnergyActionsDispatcher, IBeastActionsDispatcher, ContractAddress) {
        let mut world = setup_world();
        let energy_actions = deploy_energy_actions(world);
        let beast_actions = deploy_beast_actions(world);
        let player1 = contract_address_const::<PLAYER1>();
        
        testing::set_contract_address(player1);
        testing::set_block_timestamp(1000);
        
        (world, energy_actions, beast_actions, player1)
    }

    #[test]
    fn test_get_energy_uninitialized_player() {
        let (_world, energy_actions, _beast_actions, player1) = setup_energy_test();
        
        // New player should have max energy
        let energy = energy_actions.get_energy(player1);
        assert(energy == 5, 'Should have 5 energy');
    }

    #[test]
    fn test_get_energy_initialized_player() {
        let (mut world, energy_actions, beast_actions, player1) = setup_energy_test();
        
        // Initialize player through beast registration (sets energy to 5)
        beast_actions.register(1, 0, 0, 0, 0);
        
        // Manually consume some energy to test
        // We'll use battle_actions in a real scenario, but for this test
        // we'll check that the initial energy is correct
        let energy = energy_actions.get_energy(player1);
        assert(energy == 5, 'Should have max energy');
    }

    #[test]
    fn test_get_energy_after_refill_time() {
        let (mut world, energy_actions, beast_actions, player1) = setup_energy_test();
        
        // Initialize player with beast registration
        beast_actions.register(1, 0, 0, 0, 0);
        
        // We need battle_actions to consume energy, so let's deploy it
        let battle_actions = deploy_battle_actions(world);
        
        // Setup player 2 for battles
        let player2 = contract_address_const::<'PLAYER2'>();
        testing::set_contract_address(player2);
        beast_actions.register(2, 0, 0, 0, 0);
        
        // Back to player1 - use all energy
        testing::set_contract_address(player1);
        let mut i: u32 = 0;
        loop {
            if i >= 5 {
                break;
            }
            battle_actions.battle(player2);
            i += 1;
        };
        
        // Fast forward 24 hours
        let current_time = get_block_timestamp();
        testing::set_block_timestamp(current_time + 86400);
        
        // Should return max energy after refill
        let energy = energy_actions.get_energy(player1);
        assert(energy == 5, 'Should have max energy');
    }

    #[test]
    fn test_get_energy_before_refill_time() {
        let (mut world, energy_actions, beast_actions, player1) = setup_energy_test();
        
        // Initialize player
        beast_actions.register(1, 0, 0, 0, 0);
        
        // Setup battle system
        let battle_actions = deploy_battle_actions(world);
        
        // Setup player 2
        let player2 = contract_address_const::<'PLAYER2'>();
        testing::set_contract_address(player2);
        beast_actions.register(2, 0, 0, 0, 0);
        
        // Use 3 energy (leaving 2)
        testing::set_contract_address(player1);
        let mut i: u32 = 0;
        loop {
            if i >= 3 {
                break;
            }
            battle_actions.battle(player2);
            i += 1;
        };
        
        // Fast forward 12 hours (not enough for refill)
        let current_time = get_block_timestamp();
        testing::set_block_timestamp(current_time + 43200); // 12 hours
        
        // Should still return stored energy
        let energy = energy_actions.get_energy(player1);
        assert(energy == 2, 'Should have 2 energy');
    }

    #[test]
    fn test_multiple_players_energy() {
        let (mut world, energy_actions, beast_actions, player1) = setup_energy_test();
        let player2 = contract_address_const::<'PLAYER2'>();
        
        // Initialize both players
        beast_actions.register(1, 0, 0, 0, 0);
        
        testing::set_contract_address(player2);
        beast_actions.register(2, 0, 0, 0, 0);
        
        // Setup battle system
        let battle_actions = deploy_battle_actions(world);
        
        // Player1 uses 3 energy (has 2 left)
        testing::set_contract_address(player1);
        let mut i: u32 = 0;
        loop {
            if i >= 3 {
                break;
            }
            battle_actions.battle(player2);
            i += 1;
        };
        
        // Player2 uses 1 energy (has 4 left)
        testing::set_contract_address(player2);
        battle_actions.battle(player1);
        
        // Check each player has correct energy
        assert(energy_actions.get_energy(player1) == 2, 'Player 1 energy mismatch');
        assert(energy_actions.get_energy(player2) == 4, 'Player 2 energy mismatch');
    }
}