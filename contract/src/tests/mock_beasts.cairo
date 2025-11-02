// Mock implementation for testing - simplified
#[starknet::contract]
pub mod MockBeasts {
    use starknet::ContractAddress;
    use starknet::storage::{
        Map, StoragePathEntry, StoragePointerReadAccess, StoragePointerWriteAccess,
    };

    #[storage]
    struct Storage {
        owners: Map<u256, ContractAddress>,
        balances: Map<ContractAddress, u256>,
    }

    #[generate_trait]
    pub impl InternalImpl of InternalTrait {
        fn mint_to(ref self: ContractState, to: ContractAddress, token_id: u256) {
            self.owners.entry(token_id).write(to);
            let current_balance = self.balances.entry(to).read();
            self.balances.entry(to).write(current_balance + 1);
        }

        fn get_owner(self: @ContractState, token_id: u256) -> ContractAddress {
            self.owners.entry(token_id).read()
        }
    }
}
