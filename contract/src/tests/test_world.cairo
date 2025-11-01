use dojo::world::{WorldStorage, WorldStorageTrait, world};
use dojo_cairo_test::{
    ContractDefTrait, NamespaceDef, TestResource, WorldStorageTestTrait,
    spawn_test_world
};
use survivor_valhalla::models::{
    m_BeastLineup, m_Beast, m_PlayerEnergy, m_Battle
};
use survivor_valhalla::systems::beast_actions::{
    IBeastActionsDispatcher, beast_actions
};
use survivor_valhalla::systems::battle_actions::{
    IBattleActionsDispatcher, battle_actions
};
use survivor_valhalla::systems::energy_actions::{
    IEnergyActionsDispatcher, energy_actions
};

pub fn setup_world() -> WorldStorage {
    let ndef = NamespaceDef {
        namespace: "survivor_valhalla",
        resources: [
            // Models
            TestResource::Model(m_BeastLineup::TEST_CLASS_HASH),
            TestResource::Model(m_Beast::TEST_CLASS_HASH),
            TestResource::Model(m_PlayerEnergy::TEST_CLASS_HASH),
            TestResource::Model(m_Battle::TEST_CLASS_HASH),
            // Events
            TestResource::Event(beast_actions::e_BeastLineupRegistered::TEST_CLASS_HASH),
            TestResource::Event(beast_actions::e_BeastSwapped::TEST_CLASS_HASH),
            TestResource::Event(battle_actions::e_BattleCompleted::TEST_CLASS_HASH),
            TestResource::Event(battle_actions::e_EnergyConsumed::TEST_CLASS_HASH),
            // Contracts
            TestResource::Contract(beast_actions::TEST_CLASS_HASH),
            TestResource::Contract(battle_actions::TEST_CLASS_HASH),
            TestResource::Contract(energy_actions::TEST_CLASS_HASH),
        ].span(),
    };

    let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());
    
    let contracts = [
        ContractDefTrait::new(@"survivor_valhalla", @"beast_actions")
            .with_writer_of([dojo::utils::bytearray_hash(@"survivor_valhalla")].span()),
        ContractDefTrait::new(@"survivor_valhalla", @"battle_actions")
            .with_writer_of([dojo::utils::bytearray_hash(@"survivor_valhalla")].span()),
        ContractDefTrait::new(@"survivor_valhalla", @"energy_actions")
            .with_writer_of([dojo::utils::bytearray_hash(@"survivor_valhalla")].span()),
    ].span();
    
    world.sync_perms_and_inits(contracts);
    
    world
}

pub fn deploy_beast_actions(world: WorldStorage) -> IBeastActionsDispatcher {
    let (contract_address, _) = world.dns(@"beast_actions").unwrap();
    IBeastActionsDispatcher { contract_address }
}

pub fn deploy_battle_actions(world: WorldStorage) -> IBattleActionsDispatcher {
    let (contract_address, _) = world.dns(@"battle_actions").unwrap();
    IBattleActionsDispatcher { contract_address }
}

pub fn deploy_energy_actions(world: WorldStorage) -> IEnergyActionsDispatcher {
    let (contract_address, _) = world.dns(@"energy_actions").unwrap();
    IEnergyActionsDispatcher { contract_address }
}

// Original tests preserved below for backward compatibility
#[cfg(test)]
mod tests {
    use super::*;
    use dojo::model::ModelStorage;
    use survivor_valhalla::models::BeastLineup;
    use survivor_valhalla::systems::beast_actions::IBeastActionsDispatcherTrait;
    use starknet::testing::set_contract_address;
    use starknet::ContractAddress;

    #[test]
    fn test_register_beast_lineup() {
        let caller: ContractAddress = 0x1337.try_into().unwrap();
        let world = setup_world();
        let beast_actions_system = deploy_beast_actions(world);

        // Set the contract address (which becomes the caller)
        set_contract_address(caller);

        // Register a beast lineup
        beast_actions_system.register(1_u256, 2_u256, 3_u256, 4_u256, 5_u256);
        
        // Read the lineup from world
        let lineup: BeastLineup = world.read_model(caller);
        
        // Assert all beasts are registered correctly
        assert(lineup.beast1_id == 1_u256, 'Beast 1 not registered');
        assert(lineup.beast2_id == 2_u256, 'Beast 2 not registered');
        assert(lineup.beast3_id == 3_u256, 'Beast 3 not registered');
        assert(lineup.beast4_id == 4_u256, 'Beast 4 not registered');
        assert(lineup.beast5_id == 5_u256, 'Beast 5 not registered');
    }

    #[test]
    fn test_swap_beast() {
        let caller: ContractAddress = 0x1337.try_into().unwrap();
        let world = setup_world();
        let beast_actions_system = deploy_beast_actions(world);

        // Set the contract address (which becomes the caller)
        set_contract_address(caller);

        // Register initial lineup
        beast_actions_system.register(10_u256, 20_u256, 30_u256, 40_u256, 50_u256);
        
        // Swap beast at position 2 (0-indexed)
        beast_actions_system.swap(2_u8, 99_u256);
        
        // Read the updated lineup
        let lineup: BeastLineup = world.read_model(caller);
        
        // Assert the swap worked
        assert(lineup.beast1_id == 10_u256, 'Beast 1 changed unexpectedly');
        assert(lineup.beast2_id == 20_u256, 'Beast 2 changed unexpectedly');
        assert(lineup.beast3_id == 99_u256, 'Beast 3 not swapped');
        assert(lineup.beast4_id == 40_u256, 'Beast 4 changed unexpectedly');
        assert(lineup.beast5_id == 50_u256, 'Beast 5 changed unexpectedly');
    }

    #[test]
    fn test_multiple_swaps() {
        let caller: ContractAddress = 0x1337.try_into().unwrap();
        let world = setup_world();
        let beast_actions_system = deploy_beast_actions(world);

        // Set the contract address (which becomes the caller)
        set_contract_address(caller);

        // Register initial lineup
        beast_actions_system.register(1_u256, 2_u256, 3_u256, 4_u256, 5_u256);
        
        // Perform multiple swaps (0-indexed)
        beast_actions_system.swap(0_u8, 100_u256);
        beast_actions_system.swap(4_u8, 500_u256);
        beast_actions_system.swap(1_u8, 200_u256);
        
        // Read the final lineup
        let lineup: BeastLineup = world.read_model(caller);
        
        // Assert all swaps worked
        assert(lineup.beast1_id == 100_u256, 'Beast 1 swap failed');
        assert(lineup.beast2_id == 200_u256, 'Beast 2 swap failed');
        assert(lineup.beast3_id == 3_u256, 'Beast 3 changed unexpectedly');
        assert(lineup.beast4_id == 4_u256, 'Beast 4 changed unexpectedly');
        assert(lineup.beast5_id == 500_u256, 'Beast 5 swap failed');
    }

    #[test]
    #[should_panic]
    fn test_swap_invalid_position() {
        let caller: ContractAddress = 0x1337.try_into().unwrap();
        let world = setup_world();
        let beast_actions_system = deploy_beast_actions(world);

        // Set the contract address (which becomes the caller)
        set_contract_address(caller);

        // Register initial lineup
        beast_actions_system.register(1_u256, 2_u256, 3_u256, 4_u256, 5_u256);
        
        // Try to swap at invalid position
        beast_actions_system.swap(5_u8, 999_u256);
    }

    #[test]
    fn test_overwrite_lineup() {
        let caller: ContractAddress = 0x1337.try_into().unwrap();
        let world = setup_world();
        let beast_actions_system = deploy_beast_actions(world);

        // Set the contract address (which becomes the caller)
        set_contract_address(caller);

        // Register first lineup
        beast_actions_system.register(1_u256, 2_u256, 3_u256, 4_u256, 5_u256);
        
        // Register new lineup (overwrites the first)
        beast_actions_system.register(10_u256, 20_u256, 30_u256, 40_u256, 50_u256);
        
        // Read the lineup
        let lineup: BeastLineup = world.read_model(caller);
        
        // Assert new lineup is stored
        assert(lineup.beast1_id == 10_u256, 'Beast 1 not overwritten');
        assert(lineup.beast2_id == 20_u256, 'Beast 2 not overwritten');
        assert(lineup.beast3_id == 30_u256, 'Beast 3 not overwritten');
        assert(lineup.beast4_id == 40_u256, 'Beast 4 not overwritten');
        assert(lineup.beast5_id == 50_u256, 'Beast 5 not overwritten');
    }

    #[test]
    fn test_register_empty_lineup() {
        let caller: ContractAddress = 0x1337.try_into().unwrap();
        let world = setup_world();
        let beast_actions_system = deploy_beast_actions(world);

        // Set the contract address (which becomes the caller)
        set_contract_address(caller);

        // Register empty lineup (all beasts are 0)
        beast_actions_system.register(0_u256, 0_u256, 0_u256, 0_u256, 0_u256);
        
        // Read the lineup from world
        let lineup: BeastLineup = world.read_model(caller);
        
        // Assert all beasts are empty
        assert(lineup.beast1_id == 0_u256, 'Beast 1 not empty');
        assert(lineup.beast2_id == 0_u256, 'Beast 2 not empty');
        assert(lineup.beast3_id == 0_u256, 'Beast 3 not empty');
        assert(lineup.beast4_id == 0_u256, 'Beast 4 not empty');
        assert(lineup.beast5_id == 0_u256, 'Beast 5 not empty');
    }

    #[test]
    fn test_register_partial_lineup() {
        let caller: ContractAddress = 0x1337.try_into().unwrap();
        let world = setup_world();
        let beast_actions_system = deploy_beast_actions(world);

        // Set the contract address (which becomes the caller)
        set_contract_address(caller);

        // Register partial lineup (only 2 beasts)
        beast_actions_system.register(10_u256, 20_u256, 0_u256, 0_u256, 0_u256);
        
        // Read the lineup from world
        let lineup: BeastLineup = world.read_model(caller);
        
        // Assert lineup contains correct beasts
        assert(lineup.beast1_id == 10_u256, 'Beast 1 incorrect');
        assert(lineup.beast2_id == 20_u256, 'Beast 2 incorrect');
        assert(lineup.beast3_id == 0_u256, 'Beast 3 not empty');
        assert(lineup.beast4_id == 0_u256, 'Beast 4 not empty');
        assert(lineup.beast5_id == 0_u256, 'Beast 5 not empty');
    }

    #[test]
    #[should_panic(expected: ('Cannot swap to empty', 'ENTRYPOINT_FAILED'))]
    fn test_swap_to_empty_fails() {
        let caller: ContractAddress = 0x1337.try_into().unwrap();
        let world = setup_world();
        let beast_actions_system = deploy_beast_actions(world);

        // Set the contract address (which becomes the caller)
        set_contract_address(caller);

        // Register lineup with some beasts
        beast_actions_system.register(10_u256, 20_u256, 30_u256, 0_u256, 0_u256);
        
        // Try to swap position 1 to empty (0) - this should panic
        beast_actions_system.swap(1_u8, 0_u256);
    }
}