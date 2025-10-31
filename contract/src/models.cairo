use starknet::ContractAddress;

#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct BeastLineup {
    #[key]
    pub player: ContractAddress,
    pub beast1_id: u256,
    pub beast2_id: u256,
    pub beast3_id: u256,
    pub beast4_id: u256,
    pub beast5_id: u256,
}