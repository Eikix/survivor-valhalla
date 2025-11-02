// Mock Death Mountain adventurer contract for testing
#[starknet::contract]
pub mod MockAdventurer {
    use starknet::ContractAddress;
    use starknet::storage::{
        Map, StoragePathEntry, StoragePointerReadAccess, StoragePointerWriteAccess,
    };
    use survivor_valhalla::interfaces::adventurer::{Adventurer, Equipment, Stats};

    #[storage]
    struct Storage {
        adventurer_owners: Map<u256, ContractAddress>,
        adventurer_dungeons: Map<u64, ContractAddress>,
        // Store adventurer stats separately for simplicity
        adventurer_health: Map<u64, u16>,
        adventurer_level: Map<u64, u8>,
    }

    #[abi(embed_v0)]
    impl MockAdventurerImpl of survivor_valhalla::interfaces::adventurer::IAdventurerSystems<
        ContractState,
    > {
        fn get_adventurer(self: @ContractState, adventurer_id: u64) -> Adventurer {
            let health = self.adventurer_health.entry(adventurer_id).read();

            // Return a default test adventurer with stored health or default
            Adventurer {
                health: if health == 0 {
                    100
                } else {
                    health
                },
                xp: 500,
                gold: 50,
                beast_health: 0,
                stat_upgrades_available: 0,
                stats: Stats {
                    strength: 10,
                    dexterity: 8,
                    vitality: 12,
                    intelligence: 6,
                    wisdom: 5,
                    charisma: 7,
                    luck: 9,
                },
                equipment: Equipment {
                    weapon: 1, chest: 2, head: 3, waist: 4, foot: 5, hand: 6, neck: 7, ring: 8,
                },
                item_specials_seed: 123,
                action_count: 42,
            }
        }

        fn get_adventurer_dungeon(self: @ContractState, adventurer_id: u64) -> ContractAddress {
            self.adventurer_dungeons.entry(adventurer_id).read()
        }
    }

    #[abi(embed_v0)]
    impl MockERC721Impl of survivor_valhalla::interfaces::adventurer::IERC721<ContractState> {
        fn owner_of(self: @ContractState, token_id: u256) -> ContractAddress {
            self.adventurer_owners.entry(token_id).read()
        }
    }

    #[generate_trait]
    pub impl InternalImpl of InternalTrait {
        fn mint_adventurer(
            ref self: ContractState,
            owner: ContractAddress,
            adventurer_id: u64,
            dungeon: ContractAddress,
        ) {
            self.adventurer_owners.entry(adventurer_id.into()).write(owner);
            self.adventurer_dungeons.entry(adventurer_id).write(dungeon);
            self
                .adventurer_health
                .entry(adventurer_id)
                .write(100 + (adventurer_id * 10).try_into().unwrap());
            self
                .adventurer_level
                .entry(adventurer_id)
                .write((adventurer_id % 20 + 1).try_into().unwrap());
        }

        fn set_adventurer_health(ref self: ContractState, adventurer_id: u64, health: u16) {
            self.adventurer_health.entry(adventurer_id).write(health);
        }
    }
}
