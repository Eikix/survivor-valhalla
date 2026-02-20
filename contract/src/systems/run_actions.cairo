#[starknet::interface]
pub trait IRunActions<T> {
    fn start_run(ref self: T);
    fn register_opponent(ref self: T, defender: starknet::ContractAddress, lineup_hash: felt252);
    fn draw_next_opponent(ref self: T, run_id: u32) -> starknet::ContractAddress;
    fn get_opponent_pool_size(self: @T) -> u32;
}

#[dojo::contract]
pub mod run_actions {
    use dojo::event::EventStorage;
    use dojo::model::ModelStorage;
    use starknet::{ContractAddress, contract_address_const, get_block_timestamp, get_caller_address};
    use survivor_valhalla::models::{FloorProgress, Run, RunOpponent};
    use super::IRunActions;

    use starknet::storage::{
        Map, StoragePathEntry, StoragePointerReadAccess, StoragePointerWriteAccess,
    };

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct RunStarted {
        #[key]
        pub run_id: u32,
        #[key]
        pub player: ContractAddress,
        pub timestamp: u64,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct OpponentRegistered {
        #[key]
        pub defender: ContractAddress,
        pub lineup_hash: felt252,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct OpponentSelected {
        #[key]
        pub run_id: u32,
        pub floor: u8,
        pub defender: ContractAddress,
        pub lineup_hash: felt252,
    }

    #[storage]
    struct Storage {
        run_counter: u32,
        opponent_pool_count: u32,
        opponent_pool: Map<u32, OpponentCandidate>,
        run_opponent_pool_count: Map<u32, u32>,
        run_opponent_pool: Map<(u32, u32), OpponentCandidate>,
    }

    #[derive(Copy, Drop, Serde, starknet::Store)]
    pub struct OpponentCandidate {
        pub defender: ContractAddress,
        pub lineup_hash: felt252,
    }

    const DEFENDER_COOLDOWN_WINDOW: u32 = 3;

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
            snapshot_run_opponent_pool(ref self, run_id, player);

            world.write_model(@run);
            world.write_model(@floor_progress);
            world.emit_event(@RunStarted { run_id, player, timestamp: started_at });
        }

        fn register_opponent(ref self: ContractState, defender: ContractAddress, lineup_hash: felt252) {
            assert(defender != contract_address_const::<0>(), 'Defender cannot be zero');

            let current_count = self.opponent_pool_count.read();
            let mut idx: u32 = 1;
            loop {
                if idx > current_count {
                    break;
                }

                let existing = self.opponent_pool.entry(idx).read();
                if existing.lineup_hash == lineup_hash {
                    return;
                }

                idx += 1;
            };

            let new_count = current_count + 1;
            self.opponent_pool_count.write(new_count);
            self.opponent_pool.entry(new_count).write(OpponentCandidate { defender, lineup_hash });
            let mut world = self.world_default();
            world.emit_event(@OpponentRegistered { defender, lineup_hash });
        }

        fn draw_next_opponent(ref self: ContractState, run_id: u32) -> ContractAddress {
            let mut world = self.world_default();

            let run: Run = world.read_model(run_id);
            assert(run.run_id != 0, 'Run not found');
            assert(run.is_active, 'Run is not active');

            let mut floor_progress: FloorProgress = world.read_model(run_id);
            let pool = load_run_pool(@self, run_id);

            assert(pool.len() > 0, 'Opponent pool is empty');

            let used_hashes = load_used_lineup_hashes(@world, run_id, floor_progress.encounters_cleared);
            let defender_history = load_defender_history(@world, run_id, floor_progress.encounters_cleared);
            let selected =
                select_next_opponent(@pool, @used_hashes, @defender_history).expect('No eligible opponent');

            let floor = floor_progress.encounters_cleared + 1;
            world
                .write_model(
                    @RunOpponent {
                        run_id, floor, defender: selected.defender, lineup_hash: selected.lineup_hash,
                    },
                );
            floor_progress.encounters_cleared = floor;
            floor_progress.current_floor = floor + 1;
            world.write_model(@floor_progress);

            world.emit_event(
                @OpponentSelected {
                    run_id, floor, defender: selected.defender, lineup_hash: selected.lineup_hash,
                },
            );

            selected.defender
        }

        fn get_opponent_pool_size(self: @ContractState) -> u32 {
            self.opponent_pool_count.read()
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

    fn snapshot_run_opponent_pool(ref self: ContractState, run_id: u32, player: ContractAddress) {
        let pool = load_pool(@self, player);
        assert(pool.len() > 0, 'No valid opponent pool');
        self.run_opponent_pool_count.entry(run_id).write(pool.len().try_into().unwrap());

        let mut idx: usize = 0;
        let pool_size = pool.len();
        loop {
            if idx >= pool_size {
                break;
            }

            let storage_idx: u32 = (idx + 1).try_into().unwrap();
            self.run_opponent_pool.entry((run_id, storage_idx)).write(*pool.at(idx));
            idx += 1;
        };
    }

    fn load_pool(self: @ContractState, player: ContractAddress) -> Array<OpponentCandidate> {
        let mut candidates = array![];
        let total = self.opponent_pool_count.read();
        let mut idx: u32 = 1;

        loop {
            if idx > total {
                break;
            }

            candidates.append(self.opponent_pool.entry(idx).read());
            idx += 1;
        };

        build_opponent_pool(player, @candidates)
    }

    fn load_run_pool(self: @ContractState, run_id: u32) -> Array<OpponentCandidate> {
        let mut pool = array![];
        let total = self.run_opponent_pool_count.entry(run_id).read();
        let mut idx: u32 = 1;

        loop {
            if idx > total {
                break;
            }

            pool.append(self.run_opponent_pool.entry((run_id, idx)).read());
            idx += 1;
        };

        pool
    }

    fn load_used_lineup_hashes(world: @dojo::world::WorldStorage, run_id: u32, encounters_cleared: u8) -> Array<felt252> {
        let mut used_hashes = array![];
        let mut floor: u8 = 1;

        loop {
            if floor > encounters_cleared {
                break;
            }

            let encounter: RunOpponent = world.read_model((run_id, floor));
            if encounter.defender != contract_address_const::<0>() {
                used_hashes.append(encounter.lineup_hash);
            }

            floor += 1;
        };

        used_hashes
    }

    fn load_defender_history(
        world: @dojo::world::WorldStorage, run_id: u32, encounters_cleared: u8,
    ) -> Array<ContractAddress> {
        let mut history = array![];
        let mut floor: u8 = 1;

        loop {
            if floor > encounters_cleared {
                break;
            }

            let encounter: RunOpponent = world.read_model((run_id, floor));
            if encounter.defender != contract_address_const::<0>() {
                history.append(encounter.defender);
            }

            floor += 1;
        };

        history
    }

    fn build_opponent_pool(
        player: ContractAddress, candidates: @Array<OpponentCandidate>,
    ) -> Array<OpponentCandidate> {
        let mut pool = array![];
        let mut i: usize = 0;
        let candidate_count = candidates.len();

        loop {
            if i >= candidate_count {
                break;
            }

            let candidate = *candidates.at(i);
            if candidate.defender != player && candidate.defender != contract_address_const::<0>()
                && !candidate_hash_exists(@pool, candidate.lineup_hash) {
                pool.append(candidate);
            }

            i += 1;
        };

        pool
    }

    fn select_next_opponent(
        pool: @Array<OpponentCandidate>,
        used_lineup_hashes: @Array<felt252>,
        defender_history: @Array<ContractAddress>,
    ) -> Option<OpponentCandidate> {
        let mut i: usize = 0;
        let pool_size = pool.len();

        loop {
            if i >= pool_size {
                break Option::None;
            }

            let candidate = *pool.at(i);
            let lineup_unused = !hash_exists(used_lineup_hashes, candidate.lineup_hash);
            let defender_off_cooldown =
                !is_defender_on_cooldown(defender_history, candidate.defender, DEFENDER_COOLDOWN_WINDOW);
            if lineup_unused && defender_off_cooldown {
                break Option::Some(candidate);
            }

            i += 1;
        }
    }

    fn candidate_hash_exists(pool: @Array<OpponentCandidate>, lineup_hash: felt252) -> bool {
        let mut i: usize = 0;
        let pool_size = pool.len();

        loop {
            if i >= pool_size {
                break false;
            }

            if (*pool.at(i)).lineup_hash == lineup_hash {
                break true;
            }

            i += 1;
        }
    }

    fn hash_exists(values: @Array<felt252>, value: felt252) -> bool {
        let mut i: usize = 0;
        let value_count = values.len();

        loop {
            if i >= value_count {
                break false;
            }

            if *values.at(i) == value {
                break true;
            }

            i += 1;
        }
    }

    fn is_defender_on_cooldown(
        defender_history: @Array<ContractAddress>, defender: ContractAddress, window: u32,
    ) -> bool {
        let history_len = defender_history.len();
        if history_len == 0 || window == 0 {
            return false;
        }

        let window_usize: usize = window.try_into().unwrap();
        let check_count = if history_len < window_usize { history_len } else { window_usize };
        let mut offset: usize = 0;

        loop {
            if offset >= check_count {
                break false;
            }

            let history_idx = history_len - 1 - offset;
            if *defender_history.at(history_idx) == defender {
                break true;
            }

            offset += 1;
        }
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

        use super::{
            OpponentCandidate,
            build_opponent_pool,
            create_floor_progress_defaults,
            create_run_defaults,
            is_defender_on_cooldown,
            select_next_opponent,
        };

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

        #[test]
        fn test_build_opponent_pool_filters_invalid_and_duplicates() {
            let player = contract_address_const::<0xAA>();
            let defender1 = contract_address_const::<0xB1>();
            let defender2 = contract_address_const::<0xB2>();
            let zero = contract_address_const::<0x0>();

            let candidates = array![
                OpponentCandidate { defender: player, lineup_hash: 'SELF' },
                OpponentCandidate { defender: zero, lineup_hash: 'ZERO' },
                OpponentCandidate { defender: defender1, lineup_hash: 'H1' },
                OpponentCandidate { defender: defender2, lineup_hash: 'H2' },
                OpponentCandidate { defender: defender1, lineup_hash: 'H1' },
            ];

            let pool = build_opponent_pool(player, @candidates);

            assert(pool.len() == 2, 'Pool size mismatch');
            assert((*pool.at(0)).defender == defender1, 'First defender mismatch');
            assert((*pool.at(0)).lineup_hash == 'H1', 'First hash mismatch');
            assert((*pool.at(1)).defender == defender2, 'Second defender mismatch');
            assert((*pool.at(1)).lineup_hash == 'H2', 'Second hash mismatch');
        }

        #[test]
        fn test_select_next_opponent_skips_used_hash_and_recent_defender() {
            let defender1 = contract_address_const::<0xD1>();
            let defender2 = contract_address_const::<0xD2>();
            let defender3 = contract_address_const::<0xD3>();

            let pool = array![
                OpponentCandidate { defender: defender1, lineup_hash: 'USED_HASH' },
                OpponentCandidate { defender: defender2, lineup_hash: 'OK_BUT_COOLDOWN' },
                OpponentCandidate { defender: defender3, lineup_hash: 'NEXT_OK' },
            ];
            let used_hashes = array!['USED_HASH'];
            let defender_history = array![
                contract_address_const::<0xE1>(),
                contract_address_const::<0xE2>(),
                defender2,
            ];

            let selected = select_next_opponent(@pool, @used_hashes, @defender_history);
            assert(selected.is_some(), 'Expected opponent');
            let selected = selected.unwrap();
            assert(selected.defender == defender3, 'Wrong selected defender');
            assert(selected.lineup_hash == 'NEXT_OK', 'Wrong selected hash');
        }

        #[test]
        fn test_select_next_opponent_allows_defender_outside_cooldown_window() {
            let defender = contract_address_const::<0xF1>();
            let pool = array![OpponentCandidate { defender, lineup_hash: 'RETURN_OK' }];
            let used_hashes = array![];
            let defender_history = array![
                defender,
                contract_address_const::<0xF2>(),
                contract_address_const::<0xF3>(),
                contract_address_const::<0xF4>(),
            ];

            let selected = select_next_opponent(@pool, @used_hashes, @defender_history);
            assert(selected.is_some(), 'Expected outside cooldown');
            assert(selected.unwrap().defender == defender, 'Wrong defender selected');
        }

        #[test]
        fn test_select_next_opponent_returns_none_when_exhausted() {
            let defender1 = contract_address_const::<0xC1>();
            let defender2 = contract_address_const::<0xC2>();
            let pool = array![
                OpponentCandidate { defender: defender1, lineup_hash: 'HASH1' },
                OpponentCandidate { defender: defender2, lineup_hash: 'HASH2' },
            ];
            let used_hashes = array!['HASH1', 'HASH2'];
            let defender_history = array![];

            let selected = select_next_opponent(@pool, @used_hashes, @defender_history);
            assert(selected.is_none(), 'Expected no eligible opponent');
        }

        #[test]
        fn test_defender_cooldown_window_is_inclusive_of_last_three_encounters() {
            let defender = contract_address_const::<0x91>();
            let defender_history = array![
                contract_address_const::<0x11>(),
                contract_address_const::<0x22>(),
                defender,
                contract_address_const::<0x33>(),
                contract_address_const::<0x44>(),
            ];

            let on_cooldown = is_defender_on_cooldown(@defender_history, defender, 3);
            assert(on_cooldown, 'Defender should be cooldown');
        }

        #[test]
        fn test_defender_cooldown_window_expires_after_three_encounters() {
            let defender = contract_address_const::<0x92>();
            let defender_history = array![
                defender,
                contract_address_const::<0x21>(),
                contract_address_const::<0x31>(),
                contract_address_const::<0x41>(),
            ];

            let on_cooldown = is_defender_on_cooldown(@defender_history, defender, 3);
            assert(!on_cooldown, 'Defender should be off cooldown');
        }
    }
}
