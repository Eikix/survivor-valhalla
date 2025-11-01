pub mod systems {
    pub mod beast_actions;
    pub mod battle_actions;
    pub mod energy_actions;
}

pub mod models;
pub mod interfaces;
pub mod constants;

pub mod tests {
    mod test_world;
    mod mock_beasts;
    mod test_beast_actions;
    mod test_battle_actions;
    mod test_energy_actions;
    mod test_integration;
}