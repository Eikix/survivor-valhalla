#[starknet::contract]
pub mod MockBeasts {
    use starknet::ContractAddress;
    use survivor_valhalla::interfaces::{IBeasts, Beast};
    use starknet::storage::{StoragePointerWriteAccess, StoragePointerReadAccess};
    use starknet::storage::{Map, StoragePathEntry};

    #[storage]
    struct Storage {
        owners: Map<u256, ContractAddress>,
        balances: Map<ContractAddress, u256>,
    }

    #[abi(embed_v0)]
    impl MockBeastsImpl of IBeasts<ContractState> {
        fn owner_of(self: @ContractState, token_id: u256) -> ContractAddress {
            self.owners.entry(token_id).read()
        }

        fn balance_of(self: @ContractState, account: ContractAddress) -> u256 {
            self.balances.entry(account).read()
        }

        fn get_beast(self: @ContractState, token_id: u256) -> Beast {
            Beast {
                id: 1,
                level: 10,
                health: 100,
                armor_type: 1,
                armor_tier: 2,
                weapon_type: 3,
                weapon_tier: 2,
                special_1: 1,
                special_2: 2,
                special_3: 3,
            }
        }
    }

    #[generate_trait]
    pub impl InternalImpl of InternalTrait {
        fn mint_to(ref self: ContractState, to: ContractAddress, token_id: u256) {
            self.owners.entry(token_id).write(to);
            let current_balance = self.balances.entry(to).read();
            self.balances.entry(to).write(current_balance + 1);
        }
    }
}