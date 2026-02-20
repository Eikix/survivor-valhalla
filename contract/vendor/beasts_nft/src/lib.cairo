use core::integer::u256;

pub mod pack {
    #[derive(Copy, Drop, Serde)]
    pub struct PackableBeast {
        pub id: u8,
        pub level: u16,
        pub health: u16,
    }
}

pub mod interfaces {
    use core::integer::u256;
    use beasts_nft::pack::PackableBeast;

    #[starknet::interface]
    pub trait IBeasts<T> {
        fn get_beast(self: @T, token_id: u256) -> PackableBeast;
    }
}

#[starknet::contract]
pub mod beasts_nft {
    use core::integer::u256;
    use beasts_nft::pack::PackableBeast;

    #[storage]
    struct Storage {}

    #[external(v0)]
    fn get_beast(self: @ContractState, _token_id: u256) -> PackableBeast {
        PackableBeast { id: 0, level: 0, health: 0 }
    }
}
