#[cfg(test)]
mod test_integration {
    use starknet::{ContractAddress, contract_address_const, testing, get_block_timestamp};
    use dojo::world::{WorldStorage};
    use dojo::model::{ModelStorage};
    
    use survivor_valhalla::models::{BeastLineup, Battle};
    use survivor_valhalla::systems::beast_actions::{IBeastActionsDispatcher, IBeastActionsDispatcherTrait};
    use survivor_valhalla::systems::battle_actions::{IBattleActionsDispatcher, IBattleActionsDispatcherTrait};
    use survivor_valhalla::systems::energy_actions::{IEnergyActionsDispatcher, IEnergyActionsDispatcherTrait};
    use survivor_valhalla::tests::test_world::{setup_world, deploy_beast_actions, deploy_battle_actions, deploy_energy_actions};
    
    const PLAYER1: felt252 = 'PLAYER1';
    const PLAYER2: felt252 = 'PLAYER2';
    const PLAYER3: felt252 = 'PLAYER3';

    struct GameSetup {
        world: WorldStorage,
        beast_actions: IBeastActionsDispatcher,
        battle_actions: IBattleActionsDispatcher,
        energy_actions: IEnergyActionsDispatcher,
        player1: ContractAddress,
        player2: ContractAddress,
        player3: ContractAddress,
    }

    fn setup_game() -> GameSetup {
        let mut world = setup_world();
        let beast_actions = deploy_beast_actions(world);
        let battle_actions = deploy_battle_actions(world);
        let energy_actions = deploy_energy_actions(world);
        
        let player1 = contract_address_const::<PLAYER1>();
        let player2 = contract_address_const::<PLAYER2>();
        let player3 = contract_address_const::<PLAYER3>();
        
        // Set initial timestamp
        testing::set_block_timestamp(1000);
        
        GameSetup {
            world,
            beast_actions,
            battle_actions,
            energy_actions,
            player1,
            player2,
            player3,
        }
    }

    #[test]
    fn test_full_game_flow() {
        let mut game = setup_game();
        
        // Player 1 registers team
        testing::set_contract_address(game.player1);
        game.beast_actions.register(1, 2, 3, 0, 0);
        
        // Player 2 registers team
        testing::set_contract_address(game.player2);
        game.beast_actions.register(4, 5, 6, 7, 8);
        
        // Player 3 registers team
        testing::set_contract_address(game.player3);
        game.beast_actions.register(9, 10, 0, 0, 0);
        
        // Player 1 battles Player 2
        testing::set_contract_address(game.player1);
        game.battle_actions.battle(game.player2);
        
        // Check battle was recorded
        let battle1: Battle = game.world.read_model(1_u32);
        assert(battle1.attacker == game.player1, 'Wrong attacker');
        assert(battle1.defender == game.player2, 'Wrong defender');
        
        // Player 2 battles Player 3
        testing::set_contract_address(game.player2);
        game.battle_actions.battle(game.player3);
        
        // Player 3 battles Player 1 (revenge!)
        testing::set_contract_address(game.player3);
        game.battle_actions.battle(game.player1);
        
        // Check energy consumption
        let p1_energy = game.energy_actions.get_energy(game.player1);
        let p2_energy = game.energy_actions.get_energy(game.player2);
        let p3_energy = game.energy_actions.get_energy(game.player3);
        
        assert(p1_energy == 4, 'Player 1 should have 4 energy');
        assert(p2_energy == 4, 'Player 2 should have 4 energy');
        assert(p3_energy == 4, 'Player 3 should have 4 energy');
    }

    #[test]
    fn test_tournament_scenario() {
        let mut game = setup_game();
        
        // Setup players
        testing::set_contract_address(game.player1);
        game.beast_actions.register(1, 2, 3, 4, 5);
        
        testing::set_contract_address(game.player2);
        game.beast_actions.register(6, 7, 8, 9, 10);
        
        testing::set_contract_address(game.player3);
        game.beast_actions.register(11, 12, 13, 14, 15);
        
        // Round robin tournament - each player battles others
        testing::set_contract_address(game.player1);
        game.battle_actions.battle(game.player2);
        game.battle_actions.battle(game.player3);
        
        testing::set_contract_address(game.player2);
        game.battle_actions.battle(game.player1);
        game.battle_actions.battle(game.player3);
        
        testing::set_contract_address(game.player3);
        game.battle_actions.battle(game.player1);
        
        // Player 3 has used 1 energy
        let p3_energy = game.energy_actions.get_energy(game.player3);
        assert(p3_energy == 4, 'P3 should have 4 energy');
        
        // Try one more battle - should fail due to lack of energy for player 2
        testing::set_contract_address(game.player2);
        game.battle_actions.battle(game.player1); // This is their 3rd battle
        let p2_energy = game.energy_actions.get_energy(game.player2);
        assert(p2_energy == 2, 'P2 should have 2 energy');
    }

    #[test]
    fn test_lineup_updates_during_gameplay() {
        let mut game = setup_game();
        
        // Initial setup
        testing::set_contract_address(game.player1);
        game.beast_actions.register(1, 2, 3, 4, 5);
        
        testing::set_contract_address(game.player2);
        game.beast_actions.register(6, 7, 8, 9, 10);
        
        // Player 1 battles
        testing::set_contract_address(game.player1);
        game.battle_actions.battle(game.player2);
        
        // Player 1 swaps a beast mid-game
        game.beast_actions.swap(2, 20); // Replace beast at position 2
        
        // Battle again with new lineup
        game.battle_actions.battle(game.player2);
        
        // Verify swap
        let lineup: BeastLineup = game.world.read_model(game.player1);
        assert(lineup.beast3_id == 20, 'Beast should be swapped');
        
        // Check battles happened
        let battle1: Battle = game.world.read_model(1_u32);
        assert(battle1.attacker == game.player1, 'First battle recorded');
    }

    #[test]
    fn test_energy_management_over_days() {
        let mut game = setup_game();
        
        // Setup players
        testing::set_contract_address(game.player1);
        game.beast_actions.register(1, 2, 3, 4, 5);
        
        testing::set_contract_address(game.player2);
        game.beast_actions.register(6, 7, 8, 9, 10);
        
        // Day 1: Use all energy
        testing::set_contract_address(game.player1);
        let mut i: u32 = 0;
        loop {
            if i >= 5 {
                break;
            }
            game.battle_actions.battle(game.player2);
            i += 1;
        };
        
        // Check no energy left
        assert(game.energy_actions.get_energy(game.player1) == 0, 'All energy used');
        
        // Fast forward to next day
        let current_time = get_block_timestamp();
        testing::set_block_timestamp(current_time + 86400);
        
        // Day 2: Energy refilled
        assert(game.energy_actions.get_energy(game.player1) == 5, 'Energy refilled');
        
        // Can battle again
        game.battle_actions.battle(game.player2);
        assert(game.energy_actions.get_energy(game.player1) == 4, 'Energy consumed');
    }
}