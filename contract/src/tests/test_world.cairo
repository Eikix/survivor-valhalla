#[cfg(test)]
mod tests {
    use dojo::model::ModelStorage;
    use dojo::world::{WorldStorageTrait, world};
    use dojo_cairo_test::{
        ContractDef, ContractDefTrait, NamespaceDef, TestResource, WorldStorageTestTrait,
        spawn_test_world
    };
    use starknet::testing::set_contract_address;
    use survivor_valhalla::models::{BeastLineup, m_BeastLineup};
    use survivor_valhalla::systems::beast_actions::{
        IBeastActionsDispatcher, IBeastActionsDispatcherTrait, beast_actions
    };
    use starknet::ContractAddress;

    fn namespace_def() -> NamespaceDef {
        let ndef = NamespaceDef {
            namespace: "survivor_valhalla",
            resources: [
                TestResource::Model(m_BeastLineup::TEST_CLASS_HASH),
                TestResource::Event(beast_actions::e_BeastLineupRegistered::TEST_CLASS_HASH),
                TestResource::Event(beast_actions::e_BeastSwapped::TEST_CLASS_HASH),
                TestResource::Contract(beast_actions::TEST_CLASS_HASH),
            ]
                .span(),
        };

        ndef
    }

    fn contract_defs() -> Span<ContractDef> {
        [
            ContractDefTrait::new(@"survivor_valhalla", @"beast_actions")
                .with_writer_of([dojo::utils::bytearray_hash(@"survivor_valhalla")].span())
        ]
            .span()
    }

    #[test]
    fn test_register_beast_lineup() {
        let caller: ContractAddress = 0x1337.try_into().unwrap();

        let ndef = namespace_def();
        let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());
        world.sync_perms_and_inits(contract_defs());

        let (contract_address, _) = world.dns(@"beast_actions").unwrap();
        let beast_actions_system = IBeastActionsDispatcher { contract_address };

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

        let ndef = namespace_def();
        let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());
        world.sync_perms_and_inits(contract_defs());

        let (contract_address, _) = world.dns(@"beast_actions").unwrap();
        let beast_actions_system = IBeastActionsDispatcher { contract_address };

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

        let ndef = namespace_def();
        let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());
        world.sync_perms_and_inits(contract_defs());

        let (contract_address, _) = world.dns(@"beast_actions").unwrap();
        let beast_actions_system = IBeastActionsDispatcher { contract_address };

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

        let ndef = namespace_def();
        let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());
        world.sync_perms_and_inits(contract_defs());

        let (contract_address, _) = world.dns(@"beast_actions").unwrap();
        let beast_actions_system = IBeastActionsDispatcher { contract_address };

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

        let ndef = namespace_def();
        let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());
        world.sync_perms_and_inits(contract_defs());

        let (contract_address, _) = world.dns(@"beast_actions").unwrap();
        let beast_actions_system = IBeastActionsDispatcher { contract_address };

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
}