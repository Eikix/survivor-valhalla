#[cfg(test)]
mod test_battle_actions {
    use starknet::{ContractAddress, contract_address_const, testing, get_block_timestamp};
    use dojo::world::{WorldStorage};
    use dojo::model::{ModelStorage};
    
    use survivor_valhalla::models::{PlayerEnergy, Battle};
    use survivor_valhalla::systems::beast_actions::{IBeastActionsDispatcher, IBeastActionsDispatcherTrait};
    use survivor_valhalla::systems::battle_actions::{IBattleActionsDispatcher, IBattleActionsDispatcherTrait};
    use survivor_valhalla::tests::test_world::{setup_world, deploy_beast_actions, deploy_battle_actions};
    
    const PLAYER1: felt252 = 'PLAYER1';
    const PLAYER2: felt252 = 'PLAYER2';
    const BEAST1_ID: u256 = 1;
    const BEAST2_ID: u256 = 2;

    fn setup_battle_test() -> (WorldStorage, IBeastActionsDispatcher, IBattleActionsDispatcher, ContractAddress, ContractAddress) {
        let mut world = setup_world();
        let beast_actions = deploy_beast_actions(world);
        let battle_actions = deploy_battle_actions(world);
        
        let player1 = contract_address_const::<PLAYER1>();
        let player2 = contract_address_const::<PLAYER2>();
        
        // Set a non-zero timestamp for tests
        testing::set_block_timestamp(1000);
        
        // Setup lineups for both players
        testing::set_contract_address(player1);
        beast_actions.register(BEAST1_ID, 0, 0, 0, 0);
        
        testing::set_contract_address(player2);
        beast_actions.register(BEAST2_ID, 0, 0, 0, 0);
        
        // Reset to player1 as default
        testing::set_contract_address(player1);
        
        (world, beast_actions, battle_actions, player1, player2)
    }

    #[test]
    fn test_battle_success() {
        let (mut world, _, battle_actions, player1, player2) = setup_battle_test();
        
        // Battle player2
        battle_actions.battle(player2);
        
        // Check energy was consumed
        let energy: PlayerEnergy = world.read_model(player1);
        assert(energy.energy == 4, 'Energy should be 4 after battle');
        
        // Check battle was recorded
        let battle: Battle = world.read_model(1_u32);
        assert(battle.attacker == player1, 'Attacker mismatch');
        assert(battle.defender == player2, 'Defender mismatch');
        assert(battle.winner == player1 || battle.winner == player2, 'Winner must be set');
        assert(battle.timestamp > 0, 'Timestamp must be set');
    }

    #[test]
    fn test_multiple_battles_consume_energy() {
        let (mut world, _, battle_actions, player1, player2) = setup_battle_test();
        
        // Battle 5 times
        let mut i: u32 = 0;
        loop {
            if i >= 5 {
                break;
            }
            battle_actions.battle(player2);
            i += 1;
        };
        
        // Check all energy consumed
        let energy: PlayerEnergy = world.read_model(player1);
        assert(energy.energy == 0, 'All energy should be consumed');
    }

    #[test]
    #[should_panic(expected: ('Not enough energy', 'ENTRYPOINT_FAILED'))]
    fn test_battle_without_energy_fails() {
        let (world, _, battle_actions, player1, player2) = setup_battle_test();
        
        // Consume all energy
        let mut i: u32 = 0;
        loop {
            if i >= 5 {
                break;
            }
            battle_actions.battle(player2);
            i += 1;
        };
        
        // Try to battle without energy
        battle_actions.battle(player2);
    }

    #[test]
    #[should_panic(expected: ('Cannot battle yourself', 'ENTRYPOINT_FAILED'))]
    fn test_battle_self_fails() {
        let (_, _, battle_actions, player1, _) = setup_battle_test();
        
        // Try to battle self
        battle_actions.battle(player1);
    }

    #[test]
    #[should_panic(expected: ('No lineup registered', 'ENTRYPOINT_FAILED'))]
    fn test_battle_without_lineup_fails() {
        let (world, _, battle_actions, _, _) = setup_battle_test();
        
        // New player without lineup
        let player3 = contract_address_const::<'PLAYER3'>();
        testing::set_contract_address(player3);
        
        // Try to battle
        battle_actions.battle(contract_address_const::<PLAYER2>());
    }

    #[test]
    #[should_panic(expected: ('Defender has no lineup', 'ENTRYPOINT_FAILED'))]
    fn test_battle_defender_without_lineup_fails() {
        let (_, _, battle_actions, _, _) = setup_battle_test();
        
        // Try to battle player without lineup
        let player3 = contract_address_const::<'PLAYER3'>();
        battle_actions.battle(player3);
    }

    #[test]
    fn test_energy_refill_after_24_hours() {
        let (mut world, _, battle_actions, player1, player2) = setup_battle_test();
        
        // Use all energy
        let mut i: u32 = 0;
        loop {
            if i >= 5 {
                break;
            }
            battle_actions.battle(player2);
            i += 1;
        };
        
        // Fast forward 24 hours (86400 seconds)
        let current_time = get_block_timestamp();
        testing::set_block_timestamp(current_time + 86400);
        
        // Battle again - should work because energy refilled
        battle_actions.battle(player2);
        
        // Check energy was refilled and one used
        let energy: PlayerEnergy = world.read_model(player1);
        assert(energy.energy == 4, 'Should have 4 energy');
    }
}