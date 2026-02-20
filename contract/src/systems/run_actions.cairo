#[starknet::interface]
pub trait IRunActions<T> {
    fn start_run(ref self: T);
}

#[dojo::contract]
pub mod run_actions {
    use dojo::event::EventStorage;
    use dojo::model::ModelStorage;
    use starknet::{ContractAddress, get_block_timestamp, get_caller_address};
    use survivor_valhalla::models::{FloorProgress, Run};
    use super::IRunActions;

    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct RunStarted {
        #[key]
        pub run_id: u32,
        #[key]
        pub player: ContractAddress,
        pub timestamp: u64,
    }

    #[storage]
    struct Storage {
        run_counter: u32,
    }

    #[abi(embed_v0)]
    impl RunActionsImpl of IRunActions<ContractState> {
        fn start_run(ref self: ContractState) {
            let mut world = self.world_default();
            let player = get_caller_address();
            let started_at = get_block_timestamp();

            // TODO(chat-1771559960154): Validate player has a usable attack lineup snapshot.
            // TODO(chat-1771559960154): Validate player has no active run.
            // TODO(chat-1771559960154): Validate and deduct energy cost to start.
            run_start_validation_hooks(player);

            let current_counter = self.run_counter.read();
            let run_id = current_counter + 1;
            self.run_counter.write(run_id);

            let run = create_run_defaults(run_id, player, started_at);
            let floor_progress = create_floor_progress_defaults(run_id);

            world.write_model(@run);
            world.write_model(@floor_progress);
            world.emit_event(@RunStarted { run_id, player, timestamp: started_at });
        }
    }

    fn create_run_defaults(run_id: u32, player: ContractAddress, started_at: u64) -> Run {
        Run {
            run_id,
            player,
            floor: 1,
            max_floor: 1,
            is_active: true,
            started_at,
            ended_at: 0,
        }
    }

    fn create_floor_progress_defaults(run_id: u32) -> FloorProgress {
        FloorProgress {
            run_id,
            current_floor: 1,
            encounters_cleared: 0,
            last_battle_id: 0,
            is_complete: false,
        }
    }

    fn run_start_validation_hooks(_player: ContractAddress) {
        // TODO(chat-1771559960154): Implement start_run validation checks.
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn world_default(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"survivor_valhalla")
        }
    }

    #[cfg(test)]
    mod tests {
        use starknet::contract_address_const;

        use super::{create_floor_progress_defaults, create_run_defaults};

        #[test]
        fn test_create_run_defaults() {
            let player = contract_address_const::<0x1337>();
            let run = create_run_defaults(9, player, 777);

            assert(run.run_id == 9, 'Run id mismatch');
            assert(run.player == player, 'Run player mismatch');
            assert(run.floor == 1, 'Run floor mismatch');
            assert(run.max_floor == 1, 'Run max floor mismatch');
            assert(run.is_active, 'Run should be active');
            assert(run.started_at == 777, 'Run started_at mismatch');
            assert(run.ended_at == 0, 'Run ended_at mismatch');
        }

        #[test]
        fn test_create_floor_progress_defaults() {
            let floor_progress = create_floor_progress_defaults(13);

            assert(floor_progress.run_id == 13, 'Run id mismatch');
            assert(floor_progress.current_floor == 1, 'Current floor mismatch');
            assert(floor_progress.encounters_cleared == 0, 'Cleared mismatch');
            assert(floor_progress.last_battle_id == 0, 'Battle id mismatch');
            assert(!floor_progress.is_complete, 'Floor should be incomplete');
        }
    }
}
