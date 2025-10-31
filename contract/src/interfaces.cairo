use starknet::ContractAddress;

#[starknet::interface]
pub trait IBeasts<TContractState> {
    fn owner_of(self: @TContractState, token_id: u256) -> ContractAddress;
    fn balance_of(self: @TContractState, account: ContractAddress) -> u256;
    fn get_beast(self: @TContractState, token_id: u256) -> Beast;
}

#[derive(Copy, Drop, Serde)]
pub struct Beast {
    pub id: u8,
    pub level: u16,
    pub health: u16,
    pub armor_type: u8,
    pub armor_tier: u8,
    pub weapon_type: u8,
    pub weapon_tier: u8,
    pub special_1: u8,
    pub special_2: u8,
    pub special_3: u8,
}