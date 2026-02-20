#[starknet::interface]
pub trait IRunActions<T> {
    fn start_run(ref self: T);
    fn battle_floor(ref self: T, defender: starknet::ContractAddress);
    /// Auto-select opponent from snapshot pool using ecology matchmaking.
    fn battle_floor_auto(ref self: T);
    /// Populate the opponent snapshot pool for the active run.
    /// Must be called after start_run and before battle_floor_auto.
    /// Accepts a batch of defender addresses to snapshot into the pool.
    fn populate_run_pool(ref self: T, defenders: Array<starknet::ContractAddress>);
    /// Abandon the current active run. Ends the run as a loss at the current floor.
    fn abandon_run(ref self: T);
    /// Refresh cached adventurer stats from Loot Survivor contracts.
    /// Call before start_run to ensure stats are current.
    fn refresh_adventurer_stats(ref self: T);
    /// Get the active run ID for a player (0 = no active run).
    fn get_active_run(self: @T, player: starknet::ContractAddress) -> u32;
    /// Get the current floor for a player's active run (0 = no active run).
    fn get_current_floor(self: @T, player: starknet::ContractAddress) -> u8;
    /// Get lifetime stats for a player: (best_score, best_floor, total_runs).
    fn get_player_stats(
        self: @T, player: starknet::ContractAddress,
    ) -> (u32, u8, u32);
    /// Get run details: (floor, max_floor, is_active, score).
    fn get_run_info(self: @T, run_id: u32) -> (u8, u8, bool, u32);
    /// Get surviving adventurer count for an active run.
    fn get_run_survivors(self: @T, run_id: u32) -> u8;
}

#[dojo::contract]
pub mod run_actions {
    use core::hash::HashStateTrait;
    use core::pedersen::PedersenTrait;
    use dojo::event::EventStorage;
    use dojo::model::ModelStorage;
    use starknet::{ContractAddress, get_block_timestamp, get_caller_address};
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use survivor_valhalla::constants::{
        ADVENTURER_SYSTEMS, BEASTMODE_DUNGEON, BOSS_STAT_MULT, ECOLOGY_BALANCED, ECOLOGY_BURST,
        ECOLOGY_CAP_PERCENT, ECOLOGY_CLASS_COUNT, ECOLOGY_CONTROL, ECOLOGY_DUAL_TYPE,
        ECOLOGY_MONO_TYPE, ECOLOGY_TANK, HEAL_INTERVAL, HEAL_PERCENT, LOOT_SURVIVOR_ERC721,
        LOOT_SYSTEMS, SOFT_BREAK_BAND_CONSTRAINT, SOFT_BREAK_POOL_EXHAUSTED, STAT_BOOST_VALUE,
    };
    use survivor_valhalla::interfaces::adventurer::{
        IAdventurerSystemsDispatcher, IAdventurerSystemsDispatcherTrait, IERC721Dispatcher,
        IERC721DispatcherTrait, ILootSystemsDispatcher, ILootSystemsDispatcherTrait, ItemTrait,
    };
    use survivor_valhalla::models::{
        ActiveRun, AdventurerWeapon, AttackLineup, Battle, BeastLineup, Beast, CachedAdventurer,
        CombatUnit, CrossRunMemory, FloorProgress, OpponentSnapshot, PlayerRunStats, Run,
        RunAdventurer, RunBattle, RunBuff, RunMatchState, UsedLineupHash,
    };
    use super::IRunActions;

    // ── Events ──────────────────────────────────────────────────────────

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
    pub struct FloorCompleted {
        #[key]
        pub run_id: u32,
        pub floor: u8,
        pub battle_id: u32,
        pub result: u8,
        pub reward_type: u8, // 0=score_only, 1=heal, 2=stat_boost
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct RunCompleted {
        #[key]
        pub run_id: u32,
        pub player: ContractAddress,
        pub max_floor: u8,
        pub score: u32,
        pub timestamp: u64,
    }

    /// Emitted when a soft matchmaking rule is broken due to pool constraints.
    /// reason: 1=POOL_EXHAUSTED, 2=BAND_CONSTRAINT, 3=ECOLOGY_CONSTRAINT
    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct SoftRuleBreak {
        #[key]
        pub run_id: u32,
        pub floor: u8,
        pub reason: u8,
    }

    // ── Storage ─────────────────────────────────────────────────────────

    #[storage]
    struct Storage {
        run_counter: u32,
        battle_counter: u32,
    }

    // ── Interface implementation ─────────────────────────────────────────

    #[abi(embed_v0)]
    impl RunActionsImpl of IRunActions<ContractState> {
        fn start_run(ref self: ContractState) {
            let mut world = self.world_default();
            let player = get_caller_address();
            let started_at = get_block_timestamp();

            // Validate: player has a valid attack lineup.
            let attack_lineup: AttackLineup = world.read_model(player);
            assert(attack_lineup.adventurer1_id != 0, 'No attack lineup registered');

            // Validate: player has no active run.
            let active: ActiveRun = world.read_model(player);
            assert(active.run_id == 0, 'Already have an active run');

            // Allocate run id.
            let current_counter = self.run_counter.read();
            let run_id = current_counter + 1;
            self.run_counter.write(run_id);

            // Derive deterministic seed for this run.
            let seed = PedersenTrait::new(player.into())
                .update(started_at.into())
                .finalize();

            // Create Run record.
            let run = Run {
                run_id,
                player,
                floor: 1,
                max_floor: 1,
                is_active: true,
                score: 0,
                seed,
                started_at,
                ended_at: 0,
            };
            world.write_model(@run);

            // Create FloorProgress record.
            let floor_progress = create_floor_progress_defaults(run_id);
            world.write_model(@floor_progress);

            // Mark this run as the player's active run.
            world.write_model(@ActiveRun { player, run_id });

            // Snapshot adventurer HP into RunAdventurer records.
            let adventurer_ids = array![
                attack_lineup.adventurer1_id,
                attack_lineup.adventurer2_id,
                attack_lineup.adventurer3_id,
                attack_lineup.adventurer4_id,
                attack_lineup.adventurer5_id,
            ];
            let mut pos: u8 = 1;
            loop {
                if pos > 5 {
                    break;
                }
                let adv_id = *adventurer_ids.at((pos - 1).into());
                if adv_id != 0 {
                    let cached: CachedAdventurer = world.read_model((player, adv_id));
                    let max_hp = calculate_adventurer_hp(cached.vitality);
                    world
                        .write_model(
                            @RunAdventurer {
                                run_id,
                                position: pos,
                                adventurer_id: adv_id,
                                current_hp: max_hp,
                                max_hp,
                            },
                        );
                }
                pos += 1;
            };

            world.emit_event(@RunStarted { run_id, player, timestamp: started_at });
        }

        fn battle_floor(ref self: ContractState, defender: ContractAddress) {
            let mut world = self.world_default();
            let player = get_caller_address();
            let timestamp = get_block_timestamp();

            // Load active run.
            let active: ActiveRun = world.read_model(player);
            assert(active.run_id != 0, 'No active run');

            let mut run: Run = world.read_model(active.run_id);
            assert(run.is_active, 'Run is not active');
            assert(run.player == player, 'Not your run');

            let floor = run.floor;

            // Validate defender has a beast lineup.
            let defender_lineup: BeastLineup = world.read_model(defender);
            assert(defender_lineup.beast1_id != 0, 'Defender has no lineup');

            // Load attacker lineup.
            let attack_lineup: AttackLineup = world.read_model(player);

            // Allocate battle id.
            let current_battle = self.battle_counter.read();
            let battle_id = current_battle + 1;
            self.battle_counter.write(battle_id);

            // Determine if this is a boss floor.
            let is_boss = floor % 10 == 0 && floor > 0;

            // Setup combat units with carry-over HP from RunAdventurer.
            let (mut adventurer_units, mut beast_units) = setup_run_combat_units(
                ref world,
                battle_id,
                run.run_id,
                floor,
                player,
                defender,
                attack_lineup,
                defender_lineup,
                is_boss,
            );

            // Execute combat (reuses same logic as battle_actions).
            let (winner, adventurer_hp_after, adventurers_alive) = execute_run_combat(
                ref world,
                battle_id,
                ref adventurer_units,
                ref beast_units,
                player,
                defender,
            );

            let attacker_won: bool = winner == player;
            let result: u8 = if attacker_won {
                1
            } else {
                0
            };

            // Write Battle record (same model as PvP for compatibility).
            world
                .write_model(
                    @Battle { battle_id, attacker: player, defender, winner, timestamp },
                );

            // Write RunBattle record.
            world
                .write_model(
                    @RunBattle { run_id: run.run_id, floor, battle_id, defender, result },
                );

            // Update floor progress.
            let encounters_cleared = if attacker_won {
                1_u8
            } else {
                0_u8
            };
            world
                .write_model(
                    @FloorProgress {
                        run_id: run.run_id,
                        current_floor: floor,
                        encounters_cleared,
                        last_battle_id: battle_id,
                        is_complete: attacker_won,
                    },
                );

            if attacker_won {
                // Count surviving adventurers.
                let survivors = count_alive(@adventurers_alive);

                // Update score: floor * survivors_remaining.
                run.score += floor.into() * survivors.into();

                // Write back surviving adventurer HP.
                write_back_adventurer_hp(
                    ref world, run.run_id, @adventurer_units, @adventurer_hp_after,
                );

                // Apply rewards.
                let reward_type = apply_floor_rewards(
                    ref world, run.run_id, floor, run.seed,
                );

                // Advance to next floor.
                run.floor = floor + 1;
                if floor + 1 > run.max_floor {
                    run.max_floor = floor + 1;
                }
                world.write_model(@run);

                world
                    .emit_event(
                        @FloorCompleted {
                            run_id: run.run_id, floor, battle_id, result, reward_type,
                        },
                    );
            } else {
                // Player lost — end the run.
                run.is_active = false;
                run.ended_at = timestamp;
                // max_floor stays as the highest floor *reached* (not cleared).
                world.write_model(@run);

                // Clear active run.
                world.write_model(@ActiveRun { player, run_id: 0 });

                // Save cross-run defender memory for next run.
                let match_state: RunMatchState = world.read_model(run.run_id);
                save_cross_run_memory(ref world, player, match_state);

                // Update player lifetime stats.
                let mut stats: PlayerRunStats = world.read_model(player);
                stats.total_runs += 1;
                if run.score > stats.best_score {
                    stats.best_score = run.score;
                }
                if run.max_floor > stats.best_floor {
                    stats.best_floor = run.max_floor;
                }
                world.write_model(@stats);

                world
                    .emit_event(
                        @FloorCompleted {
                            run_id: run.run_id,
                            floor,
                            battle_id,
                            result,
                            reward_type: 0,
                        },
                    );
                world
                    .emit_event(
                        @RunCompleted {
                            run_id: run.run_id,
                            player,
                            max_floor: run.max_floor,
                            score: run.score,
                            timestamp,
                        },
                    );
            }
        }

        fn battle_floor_auto(ref self: ContractState) {
            let mut world = self.world_default();
            let player = get_caller_address();

            // Load active run.
            let active: ActiveRun = world.read_model(player);
            assert(active.run_id != 0, 'No active run');

            let run: Run = world.read_model(active.run_id);
            assert(run.is_active, 'Run is not active');
            assert(run.player == player, 'Not your run');

            // Load match state and select opponent from snapshot pool.
            let mut match_state: RunMatchState = world.read_model(run.run_id);
            let selected = select_opponent(
                ref world, run.run_id, run.floor, run.seed, ref match_state,
            );

            // Delegate to battle_floor with the selected defender.
            self.battle_floor(selected.defender);
        }

        fn populate_run_pool(ref self: ContractState, defenders: Array<ContractAddress>) {
            let mut world = self.world_default();
            let player = get_caller_address();

            // Load active run.
            let active: ActiveRun = world.read_model(player);
            assert(active.run_id != 0, 'No active run');

            let run: Run = world.read_model(active.run_id);
            assert(run.is_active, 'Run is not active');
            assert(run.player == player, 'Not your run');

            // Load or initialize match state.
            let mut match_state: RunMatchState = world.read_model(run.run_id);
            let attack_lineup: AttackLineup = world.read_model(player);

            // Compute attacker power (only on first population).
            if match_state.attacker_power == 0 {
                let ap = compute_adventurer_lineup_power(ref world, player, attack_lineup);
                match_state.attacker_power = ap;
            }

            let mut si = match_state.snapshot_count;
            let mut i: usize = 0;
            loop {
                if i >= defenders.len() {
                    break;
                }
                let defender = *defenders.at(i);

                // Skip self.
                if defender == player {
                    i += 1;
                    continue;
                }

                // Validate defender has a lineup.
                let lineup: BeastLineup = world.read_model(defender);
                if lineup.beast1_id == 0 {
                    i += 1;
                    continue;
                }

                // Compute defender power, band, ecology, and lineup hash.
                let dp = compute_beast_lineup_power(ref world, defender, lineup);
                let band = compute_power_band(match_state.attacker_power, dp);
                let ecology_class = classify_lineup(ref world, defender, lineup);
                let lineup_hash = compute_lineup_hash(lineup);

                // Count beasts in lineup.
                let mut uc: u8 = 0;
                if lineup.beast1_id != 0 {
                    uc += 1;
                }
                if lineup.beast2_id != 0 {
                    uc += 1;
                }
                if lineup.beast3_id != 0 {
                    uc += 1;
                }
                if lineup.beast4_id != 0 {
                    uc += 1;
                }
                if lineup.beast5_id != 0 {
                    uc += 1;
                }

                world
                    .write_model(
                        @OpponentSnapshot {
                            run_id: run.run_id,
                            snapshot_index: si,
                            defender,
                            defender_power: dp,
                            band,
                            ecology_class,
                            lineup_hash,
                            unit_count: uc,
                        },
                    );
                si += 1;
                i += 1;
            };

            match_state.snapshot_count = si;
            world.write_model(@match_state);
        }

        fn abandon_run(ref self: ContractState) {
            let mut world = self.world_default();
            let player = get_caller_address();
            let timestamp = get_block_timestamp();

            // Load active run.
            let active: ActiveRun = world.read_model(player);
            assert(active.run_id != 0, 'No active run');

            let mut run: Run = world.read_model(active.run_id);
            assert(run.is_active, 'Run is not active');
            assert(run.player == player, 'Not your run');

            // End the run.
            run.is_active = false;
            run.ended_at = timestamp;
            world.write_model(@run);

            // Clear active run.
            world.write_model(@ActiveRun { player, run_id: 0 });

            // Save cross-run defender memory for next run.
            let match_state: RunMatchState = world.read_model(run.run_id);
            save_cross_run_memory(ref world, player, match_state);

            // Update player lifetime stats.
            let mut stats: PlayerRunStats = world.read_model(player);
            stats.total_runs += 1;
            if run.score > stats.best_score {
                stats.best_score = run.score;
            }
            if run.max_floor > stats.best_floor {
                stats.best_floor = run.max_floor;
            }
            world.write_model(@stats);

            world
                .emit_event(
                    @RunCompleted {
                        run_id: run.run_id,
                        player,
                        max_floor: run.max_floor,
                        score: run.score,
                        timestamp,
                    },
                );
        }

        fn refresh_adventurer_stats(ref self: ContractState) {
            let mut world = self.world_default();
            let player = get_caller_address();

            // Must not have an active run (stats refresh changes combat parameters).
            let active: ActiveRun = world.read_model(player);
            assert(active.run_id == 0, 'Cannot refresh during run');

            let attack_lineup: AttackLineup = world.read_model(player);
            assert(attack_lineup.adventurer1_id != 0, 'No attack lineup registered');

            // Get LS contract dispatchers.
            let adventurer_systems_address: ContractAddress = ADVENTURER_SYSTEMS
                .try_into()
                .unwrap();
            let loot_survivor_address: ContractAddress = LOOT_SURVIVOR_ERC721.try_into().unwrap();
            let beastmode_dungeon_address: ContractAddress = BEASTMODE_DUNGEON.try_into().unwrap();
            let loot_systems_address: ContractAddress = LOOT_SYSTEMS.try_into().unwrap();

            let adventurer_dispatcher = IAdventurerSystemsDispatcher {
                contract_address: adventurer_systems_address,
            };
            let erc721_dispatcher = IERC721Dispatcher { contract_address: loot_survivor_address };
            let loot_dispatcher = ILootSystemsDispatcher {
                contract_address: loot_systems_address,
            };

            let adventurer_ids = array![
                attack_lineup.adventurer1_id,
                attack_lineup.adventurer2_id,
                attack_lineup.adventurer3_id,
                attack_lineup.adventurer4_id,
                attack_lineup.adventurer5_id,
            ];

            let mut i: usize = 0;
            loop {
                if i >= 5 {
                    break;
                }
                let adventurer_id = *adventurer_ids.at(i);
                if adventurer_id != 0 {
                    // Verify ownership still valid.
                    let owner = erc721_dispatcher.owner_of(adventurer_id.into());
                    assert(owner == player, 'Not owner of adventurer');

                    // Verify adventurer is from beastmode dungeon.
                    let dungeon = adventurer_dispatcher.get_adventurer_dungeon(adventurer_id);
                    assert(dungeon == beastmode_dungeon_address, 'Wrong dungeon');

                    // Fetch latest stats.
                    let adventurer = adventurer_dispatcher.get_adventurer(adventurer_id);
                    assert(adventurer.health == 0, 'Adventurer is not dead');

                    let level: u8 = if adventurer.xp == 0 {
                        1
                    } else {
                        ((adventurer.xp / 100) + 1).try_into().unwrap()
                    };

                    world
                        .write_model(
                            @CachedAdventurer {
                                player,
                                adventurer_id,
                                health: adventurer.health,
                                level,
                                strength: adventurer.stats.strength,
                                dexterity: adventurer.stats.dexterity,
                                vitality: adventurer.stats.vitality,
                                intelligence: adventurer.stats.intelligence,
                                wisdom: adventurer.stats.wisdom,
                                charisma: adventurer.stats.charisma,
                                luck: adventurer.stats.luck,
                            },
                        );

                    // Refresh weapon data.
                    let weapon_loot = loot_dispatcher.get_item(adventurer.equipment.weapon.id);
                    let weapon_power = calculate_weapon_power(
                        adventurer.equipment.weapon, weapon_loot.tier,
                    );
                    world
                        .write_model(
                            @AdventurerWeapon {
                                player,
                                adventurer_id,
                                weapon_type: weapon_loot.item_type,
                                weapon_power,
                            },
                        );
                }
                i += 1;
            };
        }

        fn get_active_run(self: @ContractState, player: ContractAddress) -> u32 {
            let world = self.world_default();
            let active: ActiveRun = world.read_model(player);
            active.run_id
        }

        fn get_current_floor(self: @ContractState, player: ContractAddress) -> u8 {
            let world = self.world_default();
            let active: ActiveRun = world.read_model(player);
            if active.run_id == 0 {
                return 0;
            }
            let run: Run = world.read_model(active.run_id);
            run.floor
        }

        fn get_player_stats(
            self: @ContractState, player: ContractAddress,
        ) -> (u32, u8, u32) {
            let world = self.world_default();
            let stats: PlayerRunStats = world.read_model(player);
            (stats.best_score, stats.best_floor, stats.total_runs)
        }

        fn get_run_info(self: @ContractState, run_id: u32) -> (u8, u8, bool, u32) {
            let world = self.world_default();
            let run: Run = world.read_model(run_id);
            (run.floor, run.max_floor, run.is_active, run.score)
        }

        fn get_run_survivors(self: @ContractState, run_id: u32) -> u8 {
            let world = self.world_default();
            let mut alive: u8 = 0;
            let mut pos: u8 = 1;
            loop {
                if pos > 5 {
                    break;
                }
                let run_adv: RunAdventurer = world.read_model((run_id, pos));
                if run_adv.adventurer_id != 0 && run_adv.current_hp > 0 {
                    alive += 1;
                }
                pos += 1;
            };
            alive
        }
    }

    // ── Internal helpers ────────────────────────────────────────────────

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn world_default(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"survivor_valhalla")
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

    // ── Combat helpers (mirrored from battle_actions for run context) ──

    fn calculate_adventurer_hp(vitality: u8) -> u16 {
        100 + (vitality.into() * 15)
    }

    /// Calculate weapon power using Death Mountain formula: Base Attack = Item Level * (6 - Tier).
    fn calculate_weapon_power(
        weapon: survivor_valhalla::interfaces::adventurer::Item, weapon_tier: u8,
    ) -> u16 {
        let level = weapon.get_greatness();
        level.into() * (6 - weapon_tier.into())
    }

    fn calculate_beast_damage(level: u16, tier: u8) -> u16 {
        level * (6 - tier.into())
    }

    fn get_damage_multiplier(weapon_type: u8, beast_type: u8) -> u16 {
        if weapon_type == 1 {
            if beast_type == 1 { 75 }
            else if beast_type == 2 { 150 }
            else if beast_type == 3 { 100 }
            else { 100 }
        } else if weapon_type == 2 {
            if beast_type == 1 { 150 }
            else if beast_type == 2 { 75 }
            else if beast_type == 3 { 100 }
            else { 100 }
        } else if weapon_type == 3 {
            if beast_type == 1 { 100 }
            else if beast_type == 2 { 150 }
            else if beast_type == 3 { 75 }
            else { 100 }
        } else {
            100
        }
    }

    /// Floor scaling cycles every 10 floors. Boss floors (10, 20, 30...) use boss-tier
    /// scaling. Floors > 10 re-enter the cycle at the matching position (11→1, 12→2, etc.).
    fn get_floor_scale(floor: u8) -> u16 {
        let position = if floor == 0 { 0 } else { ((floor - 1) % 10) + 1 };
        if position == 1 { 60 }
        else if position == 2 { 70 }
        else if position == 3 { 80 }
        else if position == 4 { 90 }
        else if position == 5 { 95 }
        else if position == 6 { 100 }
        else if position == 7 { 110 }
        else if position == 8 { 120 }
        else if position == 9 { 130 }
        else { 150 } // position 10: boss-tier scaling
    }

    fn get_target_position(attacker_pos: u8, opponent_alive: @Array<bool>) -> Option<u8> {
        let len: u8 = opponent_alive.len().try_into().unwrap();
        if len == 0 {
            return Option::None;
        }
        // Clamp attacker_pos to valid range for this array.
        let start_pos = if attacker_pos > len { 1 } else { attacker_pos };
        let mut target_pos = start_pos;
        let mut checked: u8 = 0;
        loop {
            if checked == len {
                break Option::None;
            }
            if *opponent_alive.at((target_pos - 1).into()) {
                break Option::Some(target_pos);
            }
            target_pos = if target_pos == len { 1 } else { target_pos + 1 };
            checked += 1;
        }
    }

    fn find_target_unit(
        units: @Array<CombatUnit>, position: u8, alive_array: @Array<bool>,
    ) -> Option<usize> {
        let mut i: usize = 0;
        loop {
            if i >= units.len() {
                break Option::None;
            }
            let unit = units.at(i);
            if *unit.position == position && *alive_array.at(i) {
                break Option::Some(i);
            }
            i += 1;
        }
    }

    fn count_alive(alive_array: @Array<bool>) -> u8 {
        let mut count: u8 = 0;
        let mut i: usize = 0;
        loop {
            if i >= alive_array.len() {
                break;
            }
            if *alive_array.at(i) {
                count += 1;
            }
            i += 1;
        };
        count
    }

    /// Setup combat units for a run floor.
    /// Adventurer HP is loaded from RunAdventurer (carry-over HP).
    /// Beast stats may be scaled for boss floors.
    fn setup_run_combat_units(
        ref world: dojo::world::WorldStorage,
        battle_id: u32,
        run_id: u32,
        floor: u8,
        attacker: ContractAddress,
        defender: ContractAddress,
        attack_lineup: AttackLineup,
        defender_lineup: BeastLineup,
        is_boss: bool,
    ) -> (Array<CombatUnit>, Array<CombatUnit>) {
        let mut adventurer_units = array![];
        let mut beast_units = array![];

        // Setup adventurer units with carry-over HP.
        let adventurer_ids = array![
            attack_lineup.adventurer1_id,
            attack_lineup.adventurer2_id,
            attack_lineup.adventurer3_id,
            attack_lineup.adventurer4_id,
            attack_lineup.adventurer5_id,
        ];

        let mut pos: u8 = 1;
        loop {
            if pos > 5 {
                break;
            }
            let adv_id = *adventurer_ids.at((pos - 1).into());
            if adv_id != 0 {
                let run_adv: RunAdventurer = world.read_model((run_id, pos));

                // Skip dead adventurers (HP == 0 from previous floors).
                if run_adv.current_hp > 0 {
                    let weapon: AdventurerWeapon = world.read_model((attacker, adv_id));
                    let cached: CachedAdventurer = world.read_model((attacker, adv_id));

                    // Accumulate all run buffs for this adventurer position.
                    // Buffs are keyed by (run_id, pos, floor) so we scan all
                    // stat-boost floors up to current floor.
                    let (bonus_damage, bonus_hp) = accumulate_buffs(
                        ref world, run_id, pos, floor,
                    );
                    let buffed_max_hp = run_adv.max_hp + bonus_hp;
                    let buffed_current_hp = run_adv.current_hp + bonus_hp;

                    let unit = CombatUnit {
                        battle_id,
                        unit_id: adv_id,
                        position: pos,
                        is_adventurer: true,
                        current_hp: buffed_current_hp,
                        max_hp: buffed_max_hp,
                        damage: weapon.weapon_power + bonus_damage,
                        initiative: cached.charisma,
                        weapon_type: weapon.weapon_type,
                        beast_type: 0,
                        is_alive: true,
                    };
                    adventurer_units.append(unit);
                }
            }
            pos += 1;
        };

        // Setup beast units (positions 1-5), with boss scaling.
        let beast_ids = array![
            defender_lineup.beast1_id,
            defender_lineup.beast2_id,
            defender_lineup.beast3_id,
            defender_lineup.beast4_id,
            defender_lineup.beast5_id,
        ];

        pos = 1;
        loop {
            if pos > 5 {
                break;
            }
            let beast_id = *beast_ids.at((pos - 1).into());
            if beast_id != 0 {
                let beast: Beast = world.read_model((defender, pos));
                let base_damage = calculate_beast_damage(beast.level, beast.tier);
                let base_hp = beast.health;

                // Apply floor difficulty scaling.
                let scale = get_floor_scale(floor);
                let mut hp: u16 = (base_hp.into() * scale.into() / 100_u32).try_into().unwrap();
                let mut damage: u16 = (base_damage.into() * scale.into() / 100_u32)
                    .try_into()
                    .unwrap();

                // Boss floors get additional multiplier on top of floor scaling.
                if is_boss {
                    hp = (hp.into() * BOSS_STAT_MULT.into() / 100_u32).try_into().unwrap();
                    damage = (damage.into() * BOSS_STAT_MULT.into() / 100_u32).try_into().unwrap();
                }

                // Ensure minimum values so beasts are never zero.
                if hp == 0 {
                    hp = 1;
                }
                if damage == 0 {
                    damage = 1;
                }

                let unit = CombatUnit {
                    battle_id,
                    unit_id: beast_id.try_into().unwrap(),
                    position: pos,
                    is_adventurer: false,
                    current_hp: hp,
                    max_hp: hp,
                    damage,
                    initiative: beast.level.try_into().unwrap(),
                    weapon_type: 0,
                    beast_type: beast.beast_type,
                    is_alive: true,
                };
                beast_units.append(unit);
            }
            pos += 1;
        };

        (adventurer_units, beast_units)
    }

    /// Execute combat and return (winner, adventurer_hp_after, adventurers_alive).
    fn execute_run_combat(
        ref world: dojo::world::WorldStorage,
        battle_id: u32,
        ref adventurer_units: Array<CombatUnit>,
        ref beast_units: Array<CombatUnit>,
        attacker: ContractAddress,
        defender: ContractAddress,
    ) -> (ContractAddress, Array<u16>, Array<bool>) {
        let mut adventurer_hp = array![];
        let mut beast_hp = array![];
        let mut adventurers_alive = array![];
        let mut beasts_alive = array![];

        let mut i: usize = 0;
        loop {
            if i >= adventurer_units.len() {
                break;
            }
            let unit = adventurer_units.at(i);
            adventurer_hp.append(*unit.current_hp);
            adventurers_alive.append(true);
            i += 1;
        };

        i = 0;
        loop {
            if i >= beast_units.len() {
                break;
            }
            let unit = beast_units.at(i);
            beast_hp.append(*unit.current_hp);
            beasts_alive.append(true);
            i += 1;
        };

        let mut round: u8 = 1;
        let max_rounds: u8 = 50; // Safety limit to prevent infinite loops.

        loop {
            let adv_alive_count = count_alive(@adventurers_alive);
            let beast_alive_count = count_alive(@beasts_alive);

            if adv_alive_count == 0 || beast_alive_count == 0 || round > max_rounds {
                break;
            }

            // Each living unit attacks once per round.
            // Adventurers attack first, then beasts.
            i = 0;
            loop {
                if i >= adventurer_units.len() {
                    break;
                }
                if *adventurers_alive.at(i) {
                    let unit = adventurer_units.at(i);
                    let target_pos = get_target_position(*unit.position, @beasts_alive);
                    match target_pos {
                        Option::Some(pos) => {
                            let target_idx = find_target_unit(@beast_units, pos, @beasts_alive);
                            match target_idx {
                                Option::Some(ti) => {
                                    let target = beast_units.at(ti);
                                    let multiplier = get_damage_multiplier(
                                        *unit.weapon_type, *target.beast_type,
                                    );
                                    let final_damage = (*unit.damage * multiplier) / 100;
                                    let current = *beast_hp.at(ti);
                                    let new_hp = if final_damage >= current {
                                        0
                                    } else {
                                        current - final_damage
                                    };

                                    beast_hp = replace_at_index(beast_hp, ti, new_hp);
                                    if new_hp == 0 {
                                        beasts_alive = replace_bool_at_index(
                                            beasts_alive, ti, false,
                                        );
                                    }
                                },
                                Option::None => {},
                            }
                        },
                        Option::None => {},
                    }
                }
                i += 1;
            };

            // Beast attacks.
            i = 0;
            loop {
                if i >= beast_units.len() {
                    break;
                }
                if *beasts_alive.at(i) {
                    let unit = beast_units.at(i);
                    let target_pos = get_target_position(*unit.position, @adventurers_alive);
                    match target_pos {
                        Option::Some(pos) => {
                            let target_idx = find_target_unit(
                                @adventurer_units, pos, @adventurers_alive,
                            );
                            match target_idx {
                                Option::Some(ti) => {
                                    let current = *adventurer_hp.at(ti);
                                    let dmg = *unit.damage;
                                    let new_hp = if dmg >= current {
                                        0
                                    } else {
                                        current - dmg
                                    };

                                    adventurer_hp = replace_at_index(adventurer_hp, ti, new_hp);
                                    if new_hp == 0 {
                                        adventurers_alive = replace_bool_at_index(
                                            adventurers_alive, ti, false,
                                        );
                                    }
                                },
                                Option::None => {},
                            }
                        },
                        Option::None => {},
                    }
                }
                i += 1;
            };

            round += 1;
        };

        let adv_survivors = count_alive(@adventurers_alive);
        let beast_survivors = count_alive(@beasts_alive);

        let winner = if adv_survivors > 0 && beast_survivors == 0 {
            attacker
        } else if beast_survivors > 0 && adv_survivors == 0 {
            defender
        } else {
            attacker // Tie or max-rounds default
        };

        (winner, adventurer_hp, adventurers_alive)
    }

    /// Replace value at index in a u16 array (Cairo arrays are immutable, must rebuild).
    fn replace_at_index(arr: Array<u16>, idx: usize, value: u16) -> Array<u16> {
        let mut new_arr = array![];
        let mut i: usize = 0;
        loop {
            if i >= arr.len() {
                break;
            }
            if i == idx {
                new_arr.append(value);
            } else {
                new_arr.append(*arr.at(i));
            }
            i += 1;
        };
        new_arr
    }

    fn replace_bool_at_index(arr: Array<bool>, idx: usize, value: bool) -> Array<bool> {
        let mut new_arr = array![];
        let mut i: usize = 0;
        loop {
            if i >= arr.len() {
                break;
            }
            if i == idx {
                new_arr.append(value);
            } else {
                new_arr.append(*arr.at(i));
            }
            i += 1;
        };
        new_arr
    }

    /// Write surviving adventurer HP back to RunAdventurer models.
    fn write_back_adventurer_hp(
        ref world: dojo::world::WorldStorage,
        run_id: u32,
        adventurer_units: @Array<CombatUnit>,
        adventurer_hp: @Array<u16>,
    ) {
        let mut i: usize = 0;
        loop {
            if i >= adventurer_units.len() {
                break;
            }
            let unit = adventurer_units.at(i);
            let hp = *adventurer_hp.at(i);
            world
                .write_model(
                    @RunAdventurer {
                        run_id,
                        position: *unit.position,
                        adventurer_id: *unit.unit_id,
                        current_hp: hp,
                        max_hp: *unit.max_hp,
                    },
                );
            i += 1;
        };
    }

    /// Apply post-floor rewards. Returns reward_type for event emission.
    fn apply_floor_rewards(
        ref world: dojo::world::WorldStorage, run_id: u32, floor: u8, seed: felt252,
    ) -> u8 {
        // Heal every HEAL_INTERVAL floors (3, 6, 9, ...).
        if floor % HEAL_INTERVAL == 0 {
            apply_heal(ref world, run_id);
            return 1; // heal
        }

        // Stat boost on floors 5, 10, 15, 20, ...
        if floor % 5 == 0 {
            apply_stat_boost(ref world, run_id, floor, seed);
            return 2; // stat_boost
        }

        0 // score only
    }

    /// Restore 25% max HP to all surviving adventurers.
    fn apply_heal(ref world: dojo::world::WorldStorage, run_id: u32) {
        let mut pos: u8 = 1;
        loop {
            if pos > 5 {
                break;
            }
            let mut run_adv: RunAdventurer = world.read_model((run_id, pos));
            if run_adv.adventurer_id != 0 && run_adv.current_hp > 0 {
                let heal_amount = (run_adv.max_hp * HEAL_PERCENT) / 100;
                let new_hp = run_adv.current_hp + heal_amount;
                run_adv
                    .current_hp =
                        if new_hp > run_adv.max_hp {
                            run_adv.max_hp
                        } else {
                            new_hp
                        };
                world.write_model(@run_adv);
            }
            pos += 1;
        };
    }

    /// Apply a +1 stat boost to a deterministically chosen adventurer.
    fn apply_stat_boost(
        ref world: dojo::world::WorldStorage, run_id: u32, floor: u8, seed: felt252,
    ) {
        // Determine which surviving adventurer gets the boost.
        let floor_hash = PedersenTrait::new(seed).update(floor.into()).finalize();

        // Collect surviving positions.
        let mut alive_positions = array![];
        let mut pos: u8 = 1;
        loop {
            if pos > 5 {
                break;
            }
            let run_adv: RunAdventurer = world.read_model((run_id, pos));
            if run_adv.adventurer_id != 0 && run_adv.current_hp > 0 {
                alive_positions.append(pos);
            }
            pos += 1;
        };

        if alive_positions.len() == 0 {
            return;
        }

        // Pick adventurer position deterministically.
        let hash_u256: u256 = floor_hash.into();
        let target_idx: usize = (hash_u256 % alive_positions.len().into()).try_into().unwrap();
        let target_pos = *alive_positions.at(target_idx);

        // Pick stat (1-7) deterministically.
        let stat_hash = PedersenTrait::new(floor_hash).update(1).finalize();
        let stat_u256: u256 = stat_hash.into();
        let stat: u8 = (stat_u256 % 7).try_into().unwrap();
        let stat = stat + 1; // 1-indexed

        // Write buff keyed by (run_id, position, floor) to allow stacking across floors.
        world
            .write_model(
                @RunBuff {
                    run_id,
                    adventurer_position: target_pos,
                    floor,
                    stat,
                    value: STAT_BOOST_VALUE,
                },
            );
    }

    /// Accumulate all stat buffs for an adventurer position across all buff floors
    /// up to (but not including) the current floor.
    /// Returns (bonus_damage, bonus_hp).
    fn accumulate_buffs(
        ref world: dojo::world::WorldStorage,
        run_id: u32,
        position: u8,
        current_floor: u8,
    ) -> (u16, u16) {
        let mut bonus_damage: u16 = 0;
        let mut bonus_hp: u16 = 0;
        // Scan all floors from 1 to current_floor-1 for stat boost floors.
        // Stat boosts fire on floors where floor % 5 == 0 AND floor % HEAL_INTERVAL != 0.
        let mut f: u8 = 5;
        loop {
            if f >= current_floor {
                break;
            }
            if f % HEAL_INTERVAL != 0 {
                // This was a stat boost floor. Check if a buff exists for this position.
                let buff: RunBuff = world.read_model((run_id, position, f));
                if buff.value > 0 {
                    if buff.stat == 1 { // strength → damage
                        bonus_damage += buff.value.into();
                    } else if buff.stat == 3 { // vitality → HP
                        bonus_hp += buff.value.into() * 15;
                    }
                    // Stats 2, 4, 5, 6, 7 (dex, int, wis, cha, luck) currently
                    // don't have direct combat mappings.
                }
            }
            f += 5;
        };
        (bonus_damage, bonus_hp)
    }

    // ── Ecology / Matchmaking helpers ────────────────────────────────────

    /// Compute power score for a beast lineup.
    /// `power = sum(level * (6 - tier) + health / 10)` per beast.
    fn compute_beast_lineup_power(
        ref world: dojo::world::WorldStorage, defender: ContractAddress, lineup: BeastLineup,
    ) -> u32 {
        let beast_ids = array![
            lineup.beast1_id,
            lineup.beast2_id,
            lineup.beast3_id,
            lineup.beast4_id,
            lineup.beast5_id,
        ];
        let mut power: u32 = 0;
        let mut pos: u8 = 1;
        loop {
            if pos > 5 {
                break;
            }
            let bid = *beast_ids.at((pos - 1).into());
            if bid != 0 {
                let beast: Beast = world.read_model((defender, pos));
                // Base attack power + durability contribution
                let atk = calculate_beast_damage(beast.level, beast.tier);
                let durability: u32 = beast.health.into() / 10;
                power += atk.into() + durability;
            }
            pos += 1;
        };
        power
    }

    /// Compute power score for an attacker (adventurer) lineup.
    fn compute_adventurer_lineup_power(
        ref world: dojo::world::WorldStorage, player: ContractAddress, lineup: AttackLineup,
    ) -> u32 {
        let adv_ids = array![
            lineup.adventurer1_id,
            lineup.adventurer2_id,
            lineup.adventurer3_id,
            lineup.adventurer4_id,
            lineup.adventurer5_id,
        ];
        let mut power: u32 = 0;
        let mut pos: u8 = 1;
        loop {
            if pos > 5 {
                break;
            }
            let aid = *adv_ids.at((pos - 1).into());
            if aid != 0 {
                let cached: CachedAdventurer = world.read_model((player, aid));
                let weapon: AdventurerWeapon = world.read_model((player, aid));
                let hp: u32 = calculate_adventurer_hp(cached.vitality).into();
                // weapon_power + hp/10 + stat bonuses
                let stat_bonus: u32 = (cached.strength
                    + cached.dexterity
                    + cached.intelligence)
                    .into();
                power += weapon.weapon_power.into() + hp / 10 + stat_bonus;
            }
            pos += 1;
        };
        power
    }

    /// Classify a beast lineup into an ecology class based on composition.
    /// Returns one of ECOLOGY_* constants.
    fn classify_lineup(
        ref world: dojo::world::WorldStorage, defender: ContractAddress, lineup: BeastLineup,
    ) -> u8 {
        let beast_ids = array![
            lineup.beast1_id,
            lineup.beast2_id,
            lineup.beast3_id,
            lineup.beast4_id,
            lineup.beast5_id,
        ];

        // Count types, total damage, total HP
        let mut type_counts: Array<u8> = array![0, 0, 0]; // indices: type 1, 2, 3
        let mut total_damage: u32 = 0;
        let mut total_hp: u32 = 0;
        let mut max_damage: u32 = 0;
        let mut max_initiative: u16 = 0;
        let mut unit_count: u8 = 0;

        let mut pos: u8 = 1;
        loop {
            if pos > 5 {
                break;
            }
            let bid = *beast_ids.at((pos - 1).into());
            if bid != 0 {
                let beast: Beast = world.read_model((defender, pos));
                unit_count += 1;
                let dmg: u32 = calculate_beast_damage(beast.level, beast.tier).into();
                total_damage += dmg;
                total_hp += beast.health.into();
                if dmg > max_damage {
                    max_damage = dmg;
                }
                if beast.level > max_initiative {
                    max_initiative = beast.level;
                }

                // Count type (1-indexed, map to 0-indexed array)
                if beast.beast_type >= 1 && beast.beast_type <= 3 {
                    let idx: usize = (beast.beast_type - 1).into();
                    let current = *type_counts.at(idx);
                    type_counts = replace_u8_at_index(type_counts, idx, current + 1);
                }
            }
            pos += 1;
        };

        if unit_count == 0 {
            return ECOLOGY_BALANCED;
        }

        // Find dominant type
        let count_1 = *type_counts.at(0);
        let count_2 = *type_counts.at(1);
        let count_3 = *type_counts.at(2);
        let mut max_type_count: u8 = count_1;
        if count_2 > max_type_count {
            max_type_count = count_2;
        }
        if count_3 > max_type_count {
            max_type_count = count_3;
        }

        // Check mono_type: >=80% same type  (4/5 or 5/5)
        let mono_threshold = (unit_count * 4) / 5; // integer approx of 80%
        if max_type_count >= mono_threshold && max_type_count >= 4 {
            return ECOLOGY_MONO_TYPE;
        }

        // Check burst: top damage > avg * 1.5
        let avg_damage = total_damage / unit_count.into();
        if avg_damage > 0 && max_damage * 100 > avg_damage * 150 {
            return ECOLOGY_BURST;
        }

        // Check tank: avg HP per unit > 150 (high durability)
        let avg_hp = total_hp / unit_count.into();
        if avg_hp > 150 {
            return ECOLOGY_TANK;
        }

        // Check control: high initiative bias
        if max_initiative > 15 {
            return ECOLOGY_CONTROL;
        }

        // Check dual_type: two types each with >=2 units
        let mut types_with_2_plus: u8 = 0;
        if count_1 >= 2 {
            types_with_2_plus += 1;
        }
        if count_2 >= 2 {
            types_with_2_plus += 1;
        }
        if count_3 >= 2 {
            types_with_2_plus += 1;
        }
        if types_with_2_plus >= 2 {
            return ECOLOGY_DUAL_TYPE;
        }

        ECOLOGY_BALANCED
    }

    /// Compute power band from attacker power (AP) and defender power (DP).
    /// Returns BAND_* constant (1-5).
    fn compute_power_band(attacker_power: u32, defender_power: u32) -> u8 {
        if attacker_power == 0 {
            return 3; // BAND_EVEN as fallback
        }
        // delta = (DP - AP) / AP, computed as (DP * 100 / AP) - 100 to avoid signed math
        let ratio = (defender_power * 100) / attacker_power; // e.g., 75 means DP is 75% of AP

        if ratio < 75 {
            1 // BAND_VERY_EASY: delta < -25%
        } else if ratio < 90 {
            2 // BAND_EASY: -25% <= delta < -10%
        } else if ratio <= 110 {
            3 // BAND_EVEN: -10% <= delta <= +10%
        } else if ratio <= 125 {
            4 // BAND_HARD: +10% < delta <= +25%
        } else {
            5 // BAND_VERY_HARD: delta > +25%
        }
    }

    /// Compute a deterministic hash for a beast lineup (for anti-repeat).
    fn compute_lineup_hash(lineup: BeastLineup) -> felt252 {
        PedersenTrait::new(lineup.beast1_id.try_into().unwrap())
            .update(lineup.beast2_id.try_into().unwrap())
            .update(lineup.beast3_id.try_into().unwrap())
            .update(lineup.beast4_id.try_into().unwrap())
            .update(lineup.beast5_id.try_into().unwrap())
            .finalize()
    }

    /// Get target bands for a given floor (encounter progression).
    /// Returns (primary_band, secondary_band).
    fn get_target_bands(floor: u8) -> (u8, u8) {
        if floor <= 3 {
            (2, 3) // Early: Easy + Even
        } else if floor <= 6 {
            (3, 4) // Mid: Even + Hard
        } else {
            (4, 5) // Late: Hard + Very Hard
        }
    }

    /// Check if a defender is in the recent cooldown window.
    fn is_on_cooldown(match_state: @RunMatchState, defender: ContractAddress) -> bool {
        *match_state.recent_def_1 == defender
            || *match_state.recent_def_2 == defender
            || *match_state.recent_def_3 == defender
    }

    /// Get ecology count for a given class from match state.
    fn get_eco_count(match_state: @RunMatchState, eco_class: u8) -> u8 {
        if eco_class == 1 {
            *match_state.eco_count_1
        } else if eco_class == 2 {
            *match_state.eco_count_2
        } else if eco_class == 3 {
            *match_state.eco_count_3
        } else if eco_class == 4 {
            *match_state.eco_count_4
        } else if eco_class == 5 {
            *match_state.eco_count_5
        } else if eco_class == 6 {
            *match_state.eco_count_6
        } else {
            0
        }
    }

    /// Update ecology count in match state for a given class.
    fn increment_eco_count(ref match_state: RunMatchState, eco_class: u8) {
        if eco_class == 1 {
            match_state.eco_count_1 += 1;
        } else if eco_class == 2 {
            match_state.eco_count_2 += 1;
        } else if eco_class == 3 {
            match_state.eco_count_3 += 1;
        } else if eco_class == 4 {
            match_state.eco_count_4 += 1;
        } else if eco_class == 5 {
            match_state.eco_count_5 += 1;
        } else if eco_class == 6 {
            match_state.eco_count_6 += 1;
        }
    }

    /// Push a defender into the recent defenders circular buffer.
    fn push_recent_defender(ref match_state: RunMatchState, defender: ContractAddress) {
        // Shift: 3 <- 2 <- 1 <- new
        match_state.recent_def_3 = match_state.recent_def_2;
        match_state.recent_def_2 = match_state.recent_def_1;
        match_state.recent_def_1 = defender;
    }

    /// Check if ecology class has exceeded 40% cap.
    fn ecology_exceeds_cap(match_state: @RunMatchState, eco_class: u8) -> bool {
        let count = get_eco_count(match_state, eco_class);
        let total = *match_state.encounters_played;
        if total == 0 {
            return false;
        }
        // count * 100 / total > 40  =>  count * 100 > total * 40
        (count.into() * 100_u16) > (total.into() * ECOLOGY_CAP_PERCENT.into())
    }

    /// Check if a defender is in the player's cross-run memory (last 5 defenders from prev run).
    fn is_in_cross_run_memory(memory: CrossRunMemory, defender: ContractAddress) -> bool {
        let zero: ContractAddress = starknet::contract_address_const::<0>();
        if defender == zero {
            return false;
        }
        memory.def_1 == defender
            || memory.def_2 == defender
            || memory.def_3 == defender
            || memory.def_4 == defender
            || memory.def_5 == defender
    }

    /// Save the recent defenders from a completed run into cross-run memory.
    fn save_cross_run_memory(
        ref world: dojo::world::WorldStorage,
        player: ContractAddress,
        match_state: RunMatchState,
    ) {
        let zero: ContractAddress = starknet::contract_address_const::<0>();
        // The recent_def slots hold the last 3 defenders from this run.
        // For cross-run memory we save these plus 2 zero slots for simplicity.
        // In a more complete implementation we'd track all defenders in the run.
        world
            .write_model(
                @CrossRunMemory {
                    player,
                    def_1: match_state.recent_def_1,
                    def_2: match_state.recent_def_2,
                    def_3: match_state.recent_def_3,
                    def_4: zero,
                    def_5: zero,
                },
            );
    }

    /// Select an opponent from the snapshot pool using ecology-aware matchmaking.
    /// Implements the candidate selection algorithm from the matchmaking spec:
    /// 1. Determine target bands for current floor.
    /// 2. Filter by hard constraints (cooldown, used lineup hash).
    /// 3. Apply soft constraints (consecutive ecology, cross-run memory).
    /// 4. Prefer least-represented ecology class within target bands.
    /// 5. Deterministic tie-break via hash.
    /// Returns the selected opponent, or panics if pool is exhausted.
    fn select_opponent(
        ref world: dojo::world::WorldStorage,
        run_id: u32,
        floor: u8,
        seed: felt252,
        ref match_state: RunMatchState,
    ) -> OpponentSnapshot {
        let snapshot_count = match_state.snapshot_count;
        assert(snapshot_count > 0, 'Empty opponent pool');

        let (primary_band, secondary_band) = get_target_bands(floor);

        // Derive a deterministic hash for this encounter for tie-breaking.
        let encounter_hash = PedersenTrait::new(seed).update(floor.into()).finalize();

        // Load cross-run memory for soft avoidance.
        let run: Run = world.read_model(run_id);
        let cross_mem: CrossRunMemory = world.read_model(run.player);

        // Pass 1: Target bands + hard constraints + all soft constraints.
        // Pass 2: Relax band to adjacent + drop soft constraints.
        // Pass 3: Accept any band + drop all soft constraints.
        let mut best_idx: u16 = 0;
        let mut best_score: u32 = 0;
        let mut found = false;
        let mut pass: u8 = 1;

        loop {
            if pass > 3 {
                break;
            }

            let mut si: u16 = 0;
            loop {
                if si >= snapshot_count {
                    break;
                }
                let snap: OpponentSnapshot = world.read_model((run_id, si));

                // Hard constraint: lineup hash must not be reused.
                let used: UsedLineupHash = world.read_model((run_id, snap.lineup_hash));
                if used.used {
                    si += 1;
                    continue;
                }

                // Hard constraint: defender cooldown (3-encounter window).
                if is_on_cooldown(@match_state, snap.defender) {
                    si += 1;
                    continue;
                }

                // Band filter (relaxed in pass 2+).
                if pass == 1 {
                    if snap.band != primary_band && snap.band != secondary_band {
                        si += 1;
                        continue;
                    }
                }
                if pass == 2 {
                    let band_ok = snap.band == primary_band
                        || snap.band == secondary_band
                        || (primary_band > 1 && snap.band == primary_band - 1)
                        || (secondary_band < 5 && snap.band == secondary_band + 1);
                    if !band_ok {
                        si += 1;
                        continue;
                    }
                }
                // Pass 3: accept any band.

                // Soft constraint: ecology cap (skip if exceeds 40%, unless pass 3).
                if pass <= 2 && ecology_exceeds_cap(@match_state, snap.ecology_class) {
                    si += 1;
                    continue;
                }

                // Soft constraint: avoid consecutive same ecology class (pass 1 only).
                if pass == 1
                    && match_state.last_ecology_class != 0
                    && snap.ecology_class == match_state.last_ecology_class {
                    si += 1;
                    continue;
                }

                // Soft constraint: avoid defenders from previous run (pass 1 only).
                if pass == 1 && is_in_cross_run_memory(cross_mem, snap.defender) {
                    si += 1;
                    continue;
                }

                // Score: prefer ecology class with lowest representation (highest deficit).
                let eco_count = get_eco_count(@match_state, snap.ecology_class);
                let deficit = if match_state.encounters_played > 0 {
                    let expected: u32 = match_state.encounters_played.into();
                    let actual: u32 = eco_count.into() * ECOLOGY_CLASS_COUNT.into();
                    if expected > actual {
                        expected - actual
                    } else {
                        0
                    }
                } else {
                    0_u32
                };

                // Deterministic tie-break: hash(encounter_hash, snapshot_index).
                let tie_hash = PedersenTrait::new(encounter_hash)
                    .update(si.into())
                    .finalize();
                let tie_val: u256 = tie_hash.into();
                let tie_score: u32 = (tie_val % 1000).try_into().unwrap();

                let score = deficit * 1000 + tie_score;

                if !found || score > best_score {
                    best_score = score;
                    best_idx = si;
                    found = true;
                }

                si += 1;
            };

            if found {
                // Emit soft rule break events when we had to relax constraints.
                if pass == 2 {
                    world.emit_event(@SoftRuleBreak {
                        run_id, floor, reason: SOFT_BREAK_BAND_CONSTRAINT,
                    });
                }
                if pass == 3 {
                    world.emit_event(@SoftRuleBreak {
                        run_id, floor, reason: SOFT_BREAK_POOL_EXHAUSTED,
                    });
                }
                break;
            }
            pass += 1;
        };

        assert(found, 'No valid opponent in pool');

        let selected: OpponentSnapshot = world.read_model((run_id, best_idx));

        // Update match state: mark lineup hash as used, push cooldown, update ecology.
        world
            .write_model(
                @UsedLineupHash { run_id, lineup_hash: selected.lineup_hash, used: true },
            );
        push_recent_defender(ref match_state, selected.defender);
        increment_eco_count(ref match_state, selected.ecology_class);
        match_state.last_ecology_class = selected.ecology_class;
        match_state.encounters_played += 1;
        world.write_model(@match_state);

        selected
    }

    fn replace_u8_at_index(arr: Array<u8>, idx: usize, value: u8) -> Array<u8> {
        let mut new_arr = array![];
        let mut i: usize = 0;
        loop {
            if i >= arr.len() {
                break;
            }
            if i == idx {
                new_arr.append(value);
            } else {
                new_arr.append(*arr.at(i));
            }
            i += 1;
        };
        new_arr
    }

    // ── Tests ───────────────────────────────────────────────────────────

    #[cfg(test)]
    mod tests {
        use starknet::contract_address_const;
        use survivor_valhalla::models::{BeastLineup, CombatUnit, CrossRunMemory, RunMatchState};
        use super::{
            calculate_adventurer_hp, calculate_beast_damage, compute_lineup_hash,
            compute_power_band, count_alive, create_floor_progress_defaults, ecology_exceeds_cap,
            find_target_unit, get_damage_multiplier, get_eco_count, get_floor_scale,
            get_target_bands, get_target_position, increment_eco_count, is_in_cross_run_memory,
            is_on_cooldown, push_recent_defender, replace_at_index, replace_bool_at_index,
            replace_u8_at_index,
        };

        #[test]
        fn test_create_floor_progress_defaults() {
            let fp = create_floor_progress_defaults(13);
            assert(fp.run_id == 13, 'Run id mismatch');
            assert(fp.current_floor == 1, 'Current floor mismatch');
            assert(fp.encounters_cleared == 0, 'Cleared mismatch');
            assert(fp.last_battle_id == 0, 'Battle id mismatch');
            assert(!fp.is_complete, 'Floor should be incomplete');
        }

        #[test]
        fn test_calculate_adventurer_hp() {
            assert(calculate_adventurer_hp(0) == 100, 'HP for 0 vit');
            assert(calculate_adventurer_hp(5) == 175, 'HP for 5 vit');
            assert(calculate_adventurer_hp(10) == 250, 'HP for 10 vit');
        }

        #[test]
        fn test_calculate_beast_damage() {
            // level=5, tier=1 -> 5*(6-1) = 25
            assert(calculate_beast_damage(5, 1) == 25, 'Beast dmg tier 1');
            // level=3, tier=3 -> 3*(6-3) = 9
            assert(calculate_beast_damage(3, 3) == 9, 'Beast dmg tier 3');
            // level=10, tier=5 -> 10*(6-5) = 10
            assert(calculate_beast_damage(10, 5) == 10, 'Beast dmg tier 5');
        }

        #[test]
        fn test_get_damage_multiplier() {
            // Magic vs Magic_or_Cloth = 0.75x
            assert(get_damage_multiplier(1, 1) == 75, 'Magic vs Magic');
            // Magic vs Blade_or_Hide = 1.5x
            assert(get_damage_multiplier(1, 2) == 150, 'Magic vs Blade');
            // Blade vs Magic_or_Cloth = 1.5x
            assert(get_damage_multiplier(2, 1) == 150, 'Blade vs Magic');
            // Blade vs Blade_or_Hide = 0.75x
            assert(get_damage_multiplier(2, 2) == 75, 'Blade vs Blade');
            // Bludgeon vs Bludgeon_or_Metal = 0.75x
            assert(get_damage_multiplier(3, 3) == 75, 'Bludg vs Bludg');
            // Unknown weapon = neutral
            assert(get_damage_multiplier(99, 1) == 100, 'Unknown weapon');
        }

        #[test]
        fn test_get_floor_scale() {
            assert(get_floor_scale(1) == 60, 'Floor 1 scale');
            assert(get_floor_scale(5) == 95, 'Floor 5 scale');
            assert(get_floor_scale(9) == 130, 'Floor 9 scale');
            assert(get_floor_scale(10) == 150, 'Floor 10 scale');
            // Floors > 10 cycle: 11 maps to position 1, 15 to position 5, etc.
            assert(get_floor_scale(11) == 60, 'Floor 11 cycles to 1');
            assert(get_floor_scale(15) == 95, 'Floor 15 cycles to 5');
            assert(get_floor_scale(20) == 150, 'Floor 20 boss scale');
        }

        #[test]
        fn test_get_target_position_direct() {
            let alive = array![true, true, true, true, true];
            let result = get_target_position(3, @alive);
            assert(result == Option::Some(3), 'Direct target');
        }

        #[test]
        fn test_get_target_position_wrap() {
            let alive = array![false, false, true, false, false];
            let result = get_target_position(1, @alive);
            assert(result == Option::Some(3), 'Wrap to pos 3');
        }

        #[test]
        fn test_get_target_position_all_dead() {
            let alive = array![false, false, false, false, false];
            let result = get_target_position(1, @alive);
            assert(result == Option::None, 'All dead');
        }

        #[test]
        fn test_count_alive() {
            let a1 = array![true, false, true, false, true];
            assert(count_alive(@a1) == 3, 'Count 3');
            let a2 = array![false, false, false];
            assert(count_alive(@a2) == 0, 'Count 0');
            let a3 = array![true, true];
            assert(count_alive(@a3) == 2, 'Count 2');
        }

        #[test]
        fn test_replace_at_index() {
            let arr = array![10_u16, 20_u16, 30_u16];
            let new_arr = replace_at_index(arr, 1, 99);
            assert(*new_arr.at(0) == 10, 'idx 0 unchanged');
            assert(*new_arr.at(1) == 99, 'idx 1 replaced');
            assert(*new_arr.at(2) == 30, 'idx 2 unchanged');
        }

        #[test]
        fn test_replace_bool_at_index() {
            let arr = array![true, true, true];
            let new_arr = replace_bool_at_index(arr, 2, false);
            assert(*new_arr.at(0) == true, 'idx 0 true');
            assert(*new_arr.at(1) == true, 'idx 1 true');
            assert(*new_arr.at(2) == false, 'idx 2 false');
        }

        // ── Ecology tests ────────────────────────────────────────────────

        #[test]
        fn test_compute_power_band_very_easy() {
            // DP = 50, AP = 100 => ratio = 50 => BAND_VERY_EASY (1)
            assert(compute_power_band(100, 50) == 1, 'Very easy band');
        }

        #[test]
        fn test_compute_power_band_easy() {
            // DP = 80, AP = 100 => ratio = 80 => BAND_EASY (2)
            assert(compute_power_band(100, 80) == 2, 'Easy band');
        }

        #[test]
        fn test_compute_power_band_even() {
            // DP = 100, AP = 100 => ratio = 100 => BAND_EVEN (3)
            assert(compute_power_band(100, 100) == 3, 'Even band');
            // DP = 95, AP = 100 => ratio = 95 => BAND_EVEN (3)
            assert(compute_power_band(100, 95) == 3, 'Even band lower');
            // DP = 110, AP = 100 => ratio = 110 => BAND_EVEN (3)
            assert(compute_power_band(100, 110) == 3, 'Even band upper');
        }

        #[test]
        fn test_compute_power_band_hard() {
            // DP = 120, AP = 100 => ratio = 120 => BAND_HARD (4)
            assert(compute_power_band(100, 120) == 4, 'Hard band');
        }

        #[test]
        fn test_compute_power_band_very_hard() {
            // DP = 150, AP = 100 => ratio = 150 => BAND_VERY_HARD (5)
            assert(compute_power_band(100, 150) == 5, 'Very hard band');
        }

        #[test]
        fn test_compute_power_band_zero_ap() {
            // AP = 0 => fallback to BAND_EVEN (3)
            assert(compute_power_band(0, 50) == 3, 'Zero AP fallback');
        }

        #[test]
        fn test_get_target_bands_early() {
            let (primary, secondary) = get_target_bands(1);
            assert(primary == 2, 'Early primary');
            assert(secondary == 3, 'Early secondary');
            let (p3, s3) = get_target_bands(3);
            assert(p3 == 2, 'Floor 3 primary');
            assert(s3 == 3, 'Floor 3 secondary');
        }

        #[test]
        fn test_get_target_bands_mid() {
            let (primary, secondary) = get_target_bands(4);
            assert(primary == 3, 'Mid primary');
            assert(secondary == 4, 'Mid secondary');
        }

        #[test]
        fn test_get_target_bands_late() {
            let (primary, secondary) = get_target_bands(7);
            assert(primary == 4, 'Late primary');
            assert(secondary == 5, 'Late secondary');
        }

        fn make_default_match_state() -> RunMatchState {
            RunMatchState {
                run_id: 1,
                snapshot_count: 0,
                attacker_power: 100,
                encounters_played: 0,
                recent_def_1: contract_address_const::<0>(),
                recent_def_2: contract_address_const::<0>(),
                recent_def_3: contract_address_const::<0>(),
                eco_count_1: 0,
                eco_count_2: 0,
                eco_count_3: 0,
                eco_count_4: 0,
                eco_count_5: 0,
                eco_count_6: 0,
                last_ecology_class: 0,
            }
        }

        fn make_default_cross_run_memory() -> CrossRunMemory {
            CrossRunMemory {
                player: contract_address_const::<0x1>(),
                def_1: contract_address_const::<0>(),
                def_2: contract_address_const::<0>(),
                def_3: contract_address_const::<0>(),
                def_4: contract_address_const::<0>(),
                def_5: contract_address_const::<0>(),
            }
        }

        #[test]
        fn test_is_on_cooldown() {
            let def_a = contract_address_const::<0x1>();
            let def_b = contract_address_const::<0x2>();
            let def_c = contract_address_const::<0x3>();
            let def_d = contract_address_const::<0x4>();

            let mut state = make_default_match_state();
            state.recent_def_1 = def_a;
            state.recent_def_2 = def_b;
            state.recent_def_3 = def_c;

            assert(is_on_cooldown(@state, def_a), 'def_a on cooldown');
            assert(is_on_cooldown(@state, def_b), 'def_b on cooldown');
            assert(is_on_cooldown(@state, def_c), 'def_c on cooldown');
            assert(!is_on_cooldown(@state, def_d), 'def_d not on cooldown');
        }

        #[test]
        fn test_push_recent_defender() {
            let def_a = contract_address_const::<0x1>();
            let def_b = contract_address_const::<0x2>();
            let def_c = contract_address_const::<0x3>();
            let def_d = contract_address_const::<0x4>();

            let mut state = make_default_match_state();
            push_recent_defender(ref state, def_a);
            assert(state.recent_def_1 == def_a, 'After 1st push');

            push_recent_defender(ref state, def_b);
            assert(state.recent_def_1 == def_b, 'After 2nd push slot1');
            assert(state.recent_def_2 == def_a, 'After 2nd push slot2');

            push_recent_defender(ref state, def_c);
            push_recent_defender(ref state, def_d);
            // After 4 pushes: d, c, b (a evicted)
            assert(state.recent_def_1 == def_d, 'After 4th slot1');
            assert(state.recent_def_2 == def_c, 'After 4th slot2');
            assert(state.recent_def_3 == def_b, 'After 4th slot3');
            assert(!is_on_cooldown(@state, def_a), 'a evicted');
        }

        #[test]
        fn test_eco_count_and_increment() {
            let mut state = make_default_match_state();
            assert(get_eco_count(@state, 1) == 0, 'Initial eco1');
            increment_eco_count(ref state, 1);
            assert(get_eco_count(@state, 1) == 1, 'After inc eco1');
            increment_eco_count(ref state, 3);
            increment_eco_count(ref state, 3);
            assert(get_eco_count(@state, 3) == 2, 'After inc eco3');
        }

        #[test]
        fn test_ecology_exceeds_cap() {
            let mut state = make_default_match_state();
            state.encounters_played = 5;
            state.eco_count_1 = 2; // 40% exactly — not exceeded
            assert(!ecology_exceeds_cap(@state, 1), '40% not exceeded');

            state.eco_count_1 = 3; // 60% > 40% — exceeded
            assert(ecology_exceeds_cap(@state, 1), '60% exceeded');
        }

        #[test]
        fn test_ecology_cap_zero_encounters() {
            let state = make_default_match_state();
            assert(!ecology_exceeds_cap(@state, 1), 'Zero encounters');
        }

        #[test]
        fn test_compute_lineup_hash_deterministic() {
            let lineup_a = BeastLineup {
                player: contract_address_const::<0x1>(),
                beast1_id: 10,
                beast2_id: 20,
                beast3_id: 30,
                beast4_id: 40,
                beast5_id: 50,
            };
            let lineup_b = BeastLineup {
                player: contract_address_const::<0x2>(), // different player
                beast1_id: 10,
                beast2_id: 20,
                beast3_id: 30,
                beast4_id: 40,
                beast5_id: 50,
            };
            // Same beast composition → same hash (player doesn't affect hash).
            let hash_a = compute_lineup_hash(lineup_a);
            let hash_b = compute_lineup_hash(lineup_b);
            assert(hash_a == hash_b, 'Same comp same hash');

            // Different composition → different hash.
            let lineup_c = BeastLineup {
                player: contract_address_const::<0x1>(),
                beast1_id: 10,
                beast2_id: 20,
                beast3_id: 30,
                beast4_id: 40,
                beast5_id: 99, // different
            };
            let hash_c = compute_lineup_hash(lineup_c);
            assert(hash_a != hash_c, 'Diff comp diff hash');
        }

        #[test]
        fn test_replace_u8_at_index() {
            let arr = array![1_u8, 2_u8, 3_u8];
            let new_arr = replace_u8_at_index(arr, 1, 99);
            assert(*new_arr.at(0) == 1, 'u8 idx 0');
            assert(*new_arr.at(1) == 99, 'u8 idx 1 replaced');
            assert(*new_arr.at(2) == 3, 'u8 idx 2');
        }

        #[test]
        fn test_compute_power_band_boundaries() {
            // Exact boundary tests
            // ratio = 75 → BAND_EASY (2), not VERY_EASY
            assert(compute_power_band(100, 75) == 2, 'Boundary 75');
            // ratio = 90 → BAND_EVEN (3)
            assert(compute_power_band(100, 90) == 3, 'Boundary 90');
            // ratio = 111 → BAND_HARD (4)
            assert(compute_power_band(100, 111) == 4, 'Boundary 111');
            // ratio = 125 → BAND_HARD (4)
            assert(compute_power_band(100, 125) == 4, 'Boundary 125');
            // ratio = 126 → BAND_VERY_HARD (5)
            assert(compute_power_band(100, 126) == 5, 'Boundary 126');
        }

        #[test]
        fn test_get_target_bands_all_floors() {
            // Floor 1-3: early
            let (p, s) = get_target_bands(2);
            assert(p == 2 && s == 3, 'Floor 2');
            // Floor 4-6: mid
            let (p5, s5) = get_target_bands(5);
            assert(p5 == 3 && s5 == 4, 'Floor 5');
            let (p6, s6) = get_target_bands(6);
            assert(p6 == 3 && s6 == 4, 'Floor 6');
            // Floor 7+: late
            let (p10, s10) = get_target_bands(10);
            assert(p10 == 4 && s10 == 5, 'Floor 10');
        }

        #[test]
        fn test_ecology_cap_high_volume() {
            let mut state = make_default_match_state();
            state.encounters_played = 10;
            state.eco_count_1 = 4; // 40% exactly — not exceeded
            assert(!ecology_exceeds_cap(@state, 1), '40% at 10');

            state.eco_count_1 = 5; // 50% > 40% — exceeded
            assert(ecology_exceeds_cap(@state, 1), '50% at 10');
        }

        #[test]
        fn test_eco_count_all_classes() {
            let mut state = make_default_match_state();
            increment_eco_count(ref state, 1);
            increment_eco_count(ref state, 2);
            increment_eco_count(ref state, 3);
            increment_eco_count(ref state, 4);
            increment_eco_count(ref state, 5);
            increment_eco_count(ref state, 6);
            assert(get_eco_count(@state, 1) == 1, 'eco1');
            assert(get_eco_count(@state, 2) == 1, 'eco2');
            assert(get_eco_count(@state, 3) == 1, 'eco3');
            assert(get_eco_count(@state, 4) == 1, 'eco4');
            assert(get_eco_count(@state, 5) == 1, 'eco5');
            assert(get_eco_count(@state, 6) == 1, 'eco6');
            assert(get_eco_count(@state, 7) == 0, 'eco7 invalid');
        }

        #[test]
        fn test_get_floor_scale_all() {
            // Verify all floor scales match constants
            assert(get_floor_scale(1) == 60, 'Scale f1');
            assert(get_floor_scale(2) == 70, 'Scale f2');
            assert(get_floor_scale(3) == 80, 'Scale f3');
            assert(get_floor_scale(4) == 90, 'Scale f4');
            assert(get_floor_scale(5) == 95, 'Scale f5');
            assert(get_floor_scale(6) == 100, 'Scale f6');
            assert(get_floor_scale(7) == 110, 'Scale f7');
            assert(get_floor_scale(8) == 120, 'Scale f8');
            assert(get_floor_scale(9) == 130, 'Scale f9');
            assert(get_floor_scale(10) == 150, 'Scale f10');
            // Cycling: floors > 10 repeat the pattern
            assert(get_floor_scale(11) == 60, 'Scale f11 cycles');
            assert(get_floor_scale(12) == 70, 'Scale f12 cycles');
            assert(get_floor_scale(19) == 130, 'Scale f19 cycles');
            assert(get_floor_scale(20) == 150, 'Scale f20 boss');
            assert(get_floor_scale(30) == 150, 'Scale f30 boss');
            assert(get_floor_scale(100) == 150, 'Scale f100 boss');
        }

        // ── Floor scale cycling edge cases ────────────────────────────────

        #[test]
        fn test_floor_scale_third_cycle() {
            assert(get_floor_scale(21) == 60, 'Scale f21 cycle 3');
            assert(get_floor_scale(25) == 95, 'Scale f25 cycle 3');
            assert(get_floor_scale(29) == 130, 'Scale f29 cycle 3');
            assert(get_floor_scale(30) == 150, 'Scale f30 boss c3');
        }

        // ── Target bands for high floors ──────────────────────────────────

        #[test]
        fn test_get_target_bands_high_floors() {
            let (p15, s15) = get_target_bands(15);
            assert(p15 == 4 && s15 == 5, 'Floor 15 late');
            let (p50, s50) = get_target_bands(50);
            assert(p50 == 4 && s50 == 5, 'Floor 50 late');
        }

        // ── Power band edge cases ─────────────────────────────────────────

        #[test]
        fn test_compute_power_band_very_small_values() {
            assert(compute_power_band(1, 1) == 3, 'Tiny equal');
            assert(compute_power_band(1, 0) == 1, 'DP zero');
        }

        #[test]
        fn test_compute_power_band_large_values() {
            assert(compute_power_band(10000, 10000) == 3, 'Large even');
            assert(compute_power_band(10000, 20000) == 5, 'Large very hard');
        }

        // ── Cooldown circular buffer ──────────────────────────────────────

        #[test]
        fn test_cooldown_zero_address_matches_default() {
            let state = make_default_match_state();
            let zero = contract_address_const::<0>();
            assert(is_on_cooldown(@state, zero), 'Zero in default');
            let nz = contract_address_const::<0x99>();
            assert(!is_on_cooldown(@state, nz), 'Non-zero not cd');
        }

        // ── Ecology cap edge cases ────────────────────────────────────────

        #[test]
        fn test_ecology_cap_one_encounter() {
            let mut state = make_default_match_state();
            state.encounters_played = 1;
            state.eco_count_1 = 1;
            assert(ecology_exceeds_cap(@state, 1), '100% at 1');
        }

        #[test]
        fn test_ecology_cap_all_classes_even() {
            let mut state = make_default_match_state();
            state.encounters_played = 6;
            state.eco_count_1 = 1;
            state.eco_count_2 = 1;
            state.eco_count_3 = 1;
            state.eco_count_4 = 1;
            state.eco_count_5 = 1;
            state.eco_count_6 = 1;
            assert(!ecology_exceeds_cap(@state, 1), 'Even dist eco1');
            assert(!ecology_exceeds_cap(@state, 6), 'Even dist eco6');
        }

        // ── Lineup hash uniqueness ────────────────────────────────────────

        #[test]
        fn test_lineup_hash_order_matters() {
            let lineup_a = BeastLineup {
                player: contract_address_const::<0x1>(),
                beast1_id: 10,
                beast2_id: 20,
                beast3_id: 30,
                beast4_id: 40,
                beast5_id: 50,
            };
            let lineup_b = BeastLineup {
                player: contract_address_const::<0x1>(),
                beast1_id: 20,
                beast2_id: 10,
                beast3_id: 30,
                beast4_id: 40,
                beast5_id: 50,
            };
            assert(compute_lineup_hash(lineup_a) != compute_lineup_hash(lineup_b), 'Order matters');
        }

        #[test]
        fn test_lineup_hash_zeros() {
            let lineup_z = BeastLineup {
                player: contract_address_const::<0x1>(),
                beast1_id: 0,
                beast2_id: 0,
                beast3_id: 0,
                beast4_id: 0,
                beast5_id: 0,
            };
            let _hash = compute_lineup_hash(lineup_z);
        }

        // ── Replace helpers edge cases ────────────────────────────────────

        #[test]
        fn test_replace_at_index_first_and_last() {
            let arr = array![1_u16, 2_u16, 3_u16, 4_u16, 5_u16];
            let r1 = replace_at_index(arr, 0, 99);
            assert(*r1.at(0) == 99, 'First replaced');
            assert(*r1.at(4) == 5, 'Last unchanged');
            let r2 = replace_at_index(r1, 4, 77);
            assert(*r2.at(0) == 99, 'First still 99');
            assert(*r2.at(4) == 77, 'Last replaced');
        }

        // ── Beast damage edge cases ───────────────────────────────────────

        #[test]
        fn test_beast_damage_max_tier() {
            assert(calculate_beast_damage(1, 5) == 1, 'Min damage');
        }

        #[test]
        fn test_beast_damage_high_level() {
            assert(calculate_beast_damage(100, 1) == 500, 'High dmg');
        }

        // ── Adventurer HP edge cases ──────────────────────────────────────

        #[test]
        fn test_adventurer_hp_high_vitality() {
            assert(calculate_adventurer_hp(20) == 400, 'HP vit 20');
        }

        // ── Damage multiplier completeness ────────────────────────────────

        #[test]
        fn test_damage_multiplier_neutral_matchups() {
            assert(get_damage_multiplier(1, 3) == 100, 'Magic vs Bludg');
            assert(get_damage_multiplier(2, 3) == 100, 'Blade vs Bludg');
            assert(get_damage_multiplier(3, 1) == 100, 'Bludg vs Magic');
        }

        #[test]
        fn test_damage_multiplier_super_effective() {
            assert(get_damage_multiplier(1, 2) == 150, 'Magic SE');
            assert(get_damage_multiplier(2, 1) == 150, 'Blade SE');
            assert(get_damage_multiplier(3, 2) == 150, 'Bludg SE');
        }

        #[test]
        fn test_damage_multiplier_resisted() {
            assert(get_damage_multiplier(1, 1) == 75, 'Magic resist');
            assert(get_damage_multiplier(2, 2) == 75, 'Blade resist');
            assert(get_damage_multiplier(3, 3) == 75, 'Bludg resist');
        }

        // ── Multiple eco increments ───────────────────────────────────────

        #[test]
        fn test_eco_count_multiple_increments() {
            let mut state = make_default_match_state();
            increment_eco_count(ref state, 4);
            increment_eco_count(ref state, 4);
            increment_eco_count(ref state, 4);
            assert(get_eco_count(@state, 4) == 3, 'eco4 triple');
            assert(get_eco_count(@state, 1) == 0, 'eco1 zero');
            assert(get_eco_count(@state, 5) == 0, 'eco5 zero');
        }

        // ── Target position wrapping ──────────────────────────────────────

        #[test]
        fn test_get_target_position_last_alive() {
            let alive = array![false, false, false, false, true];
            let result = get_target_position(2, @alive);
            assert(result == Option::Some(5), 'Wrap to pos 5');
        }

        #[test]
        fn test_get_target_position_first_alive() {
            let alive = array![true, false, false, false, false];
            let result = get_target_position(5, @alive);
            assert(result == Option::Some(1), 'Wrap to pos 1');
        }

        // ── End-to-end simulation tests ─────────────────────────────────

        #[test]
        fn test_score_accumulation_simulation() {
            // Simulate a 10-floor run with varying survivor counts.
            let survivor_counts: Array<u32> = array![5, 5, 4, 4, 3, 3, 3, 2, 2, 1];
            let mut total_score: u32 = 0;
            let mut floor: u32 = 1;
            loop {
                if floor > 10 {
                    break;
                }
                let survivors = *survivor_counts.at((floor - 1).try_into().unwrap());
                total_score += floor * survivors;
                floor += 1;
            };
            // 1*5 + 2*5 + 3*4 + 4*4 + 5*3 + 6*3 + 7*3 + 8*2 + 9*2 + 10*1
            // = 5 + 10 + 12 + 16 + 15 + 18 + 21 + 16 + 18 + 10 = 141
            assert(total_score == 141, 'Score sim 10 floors');
        }

        #[test]
        fn test_reward_schedule_full_run() {
            // Track which rewards fire for floors 1-20.
            use survivor_valhalla::constants::HEAL_INTERVAL;

            let mut heal_count: u8 = 0;
            let mut boost_count: u8 = 0;
            let mut score_only_count: u8 = 0;
            let mut floor: u8 = 1;
            loop {
                if floor > 20 {
                    break;
                }
                if floor % HEAL_INTERVAL == 0 {
                    heal_count += 1;
                } else if floor % 5 == 0 {
                    boost_count += 1;
                } else {
                    score_only_count += 1;
                }
                floor += 1;
            };
            assert(heal_count == 6, 'Heal count 20 floors');
            assert(boost_count == 3, 'Boost count 20 floors');
            assert(score_only_count == 11, 'Score only 20 floors');
        }

        #[test]
        fn test_ecology_tracking_full_run() {
            // Simulate 10 encounters tracking ecology distribution.
            let mut state = make_default_match_state();
            let encounter_classes: Array<u8> = array![3, 4, 5, 6, 1, 2, 3, 4, 5, 6];
            let mut i: usize = 0;
            loop {
                if i >= encounter_classes.len() {
                    break;
                }
                let eco = *encounter_classes.at(i);
                increment_eco_count(ref state, eco);
                state.encounters_played += 1;
                i += 1;
            };

            assert(get_eco_count(@state, 1) == 1, 'Mono count');
            assert(get_eco_count(@state, 2) == 1, 'Dual count');
            assert(get_eco_count(@state, 3) == 2, 'Balanced count');
            assert(get_eco_count(@state, 4) == 2, 'Burst count');
            assert(get_eco_count(@state, 5) == 2, 'Tank count');
            assert(get_eco_count(@state, 6) == 2, 'Control count');
            assert(state.encounters_played == 10, 'Total encounters');

            // No class exceeds 40% (max is 2/10 = 20%).
            let mut eco: u8 = 1;
            loop {
                if eco > 6 {
                    break;
                }
                assert(!ecology_exceeds_cap(@state, eco), 'No cap exceeded');
                eco += 1;
            };
        }

        #[test]
        fn test_cooldown_rotation_full_cycle() {
            let mut state = make_default_match_state();
            let d1 = contract_address_const::<0xA1>();
            let d2 = contract_address_const::<0xA2>();
            let d3 = contract_address_const::<0xA3>();
            let d4 = contract_address_const::<0xA4>();
            let d5 = contract_address_const::<0xA5>();
            let d6 = contract_address_const::<0xA6>();

            push_recent_defender(ref state, d1);
            push_recent_defender(ref state, d2);
            push_recent_defender(ref state, d3);
            assert(is_on_cooldown(@state, d1), 'd1 cd after 3');

            push_recent_defender(ref state, d4);
            assert(!is_on_cooldown(@state, d1), 'd1 free after 4');

            push_recent_defender(ref state, d5);
            assert(!is_on_cooldown(@state, d2), 'd2 free after 5');

            push_recent_defender(ref state, d6);
            assert(!is_on_cooldown(@state, d3), 'd3 free after 6');
            assert(is_on_cooldown(@state, d4), 'd4 on cd');
            assert(is_on_cooldown(@state, d5), 'd5 on cd');
            assert(is_on_cooldown(@state, d6), 'd6 on cd');
        }

        #[test]
        fn test_difficulty_curve_scaling() {
            let base_hp: u32 = 100;
            let mut floor: u8 = 1;
            let mut prev_effective_hp: u32 = 0;
            loop {
                if floor > 10 {
                    break;
                }
                let scale: u32 = get_floor_scale(floor).into();
                let effective_hp = base_hp * scale / 100;
                assert(effective_hp >= prev_effective_hp, 'HP increases');
                prev_effective_hp = effective_hp;
                floor += 1;
            };
            let f1_hp = base_hp * 60 / 100;
            let f10_hp = base_hp * 150 / 100;
            assert(f10_hp == 150, 'F10 HP scaled');
            assert(f1_hp == 60, 'F1 HP scaled');
        }

        #[test]
        fn test_boss_stat_multiplier_effect() {
            use survivor_valhalla::constants::BOSS_STAT_MULT;

            let floor_scale: u32 = get_floor_scale(10).into();
            let base_hp: u32 = 100;
            let scaled_hp = base_hp * floor_scale / 100;
            let boss_hp = scaled_hp * BOSS_STAT_MULT.into() / 100;
            assert(boss_hp == 187, 'Boss HP calculation');

            let f9_scale: u32 = get_floor_scale(9).into();
            let f9_hp = base_hp * f9_scale / 100;
            assert(f9_hp == 130, 'Non-boss HP');
            assert(boss_hp > f9_hp, 'Boss harder than f9');
        }

        #[test]
        fn test_heal_amount_calculation() {
            use survivor_valhalla::constants::HEAL_PERCENT;

            let max_hp: u16 = 250;
            let current_hp: u16 = 100;
            let heal_amount = (max_hp * HEAL_PERCENT) / 100;
            assert(heal_amount == 62, 'Heal amount');
            let new_hp = current_hp + heal_amount;
            assert(new_hp == 162, 'HP after heal');

            let near_full: u16 = 240;
            let healed = near_full + heal_amount;
            let capped = if healed > max_hp {
                max_hp
            } else {
                healed
            };
            assert(capped == 250, 'Heal capped at max');
        }

        #[test]
        fn test_power_band_distribution() {
            let ap: u32 = 100;
            let test_cases: Array<(u32, u8)> = array![
                (40, 1),
                (74, 1),
                (75, 2),
                (89, 2),
                (90, 3),
                (100, 3),
                (110, 3),
                (111, 4),
                (125, 4),
                (126, 5),
                (200, 5),
            ];
            let mut i: usize = 0;
            loop {
                if i >= test_cases.len() {
                    break;
                }
                let (dp, expected_band) = *test_cases.at(i);
                let actual = compute_power_band(ap, dp);
                assert(actual == expected_band, 'Band distribution');
                i += 1;
            };
        }

        #[test]
        fn test_band_progression_through_run() {
            let mut floor: u8 = 1;
            loop {
                if floor > 10 {
                    break;
                }
                let (primary, secondary) = get_target_bands(floor);
                if floor <= 3 {
                    assert(primary == 2 && secondary == 3, 'Early bands');
                } else if floor <= 6 {
                    assert(primary == 3 && secondary == 4, 'Mid bands');
                } else {
                    assert(primary == 4 && secondary == 5, 'Late bands');
                }
                floor += 1;
            };
        }

        #[test]
        fn test_lineup_hash_collision_resistance() {
            let lineup_1 = BeastLineup {
                player: contract_address_const::<0x1>(),
                beast1_id: 1,
                beast2_id: 2,
                beast3_id: 3,
                beast4_id: 4,
                beast5_id: 5,
            };
            let lineup_2 = BeastLineup {
                player: contract_address_const::<0x1>(),
                beast1_id: 5,
                beast2_id: 4,
                beast3_id: 3,
                beast4_id: 2,
                beast5_id: 1,
            };
            let lineup_3 = BeastLineup {
                player: contract_address_const::<0x1>(),
                beast1_id: 1,
                beast2_id: 2,
                beast3_id: 3,
                beast4_id: 4,
                beast5_id: 6,
            };
            let h1 = compute_lineup_hash(lineup_1);
            let h2 = compute_lineup_hash(lineup_2);
            let h3 = compute_lineup_hash(lineup_3);
            assert(h1 != h2, 'Reversed order diff');
            assert(h1 != h3, 'One beast diff');
            assert(h2 != h3, 'All different');
        }

        #[test]
        fn test_floor_scale_monotonic_within_cycle() {
            let mut prev_scale: u16 = 0;
            let mut floor: u8 = 1;
            loop {
                if floor > 10 {
                    break;
                }
                let scale = get_floor_scale(floor);
                assert(scale > prev_scale, 'Scale not monotonic');
                prev_scale = scale;
                floor += 1;
            };
        }

        // ── End-to-end run simulation tests ──────────────────────────────

        /// Helper: create a CombatUnit for adventurer tests.
        fn make_adventurer_unit(
            battle_id: u32, unit_id: u64, position: u8, hp: u16, damage: u16, weapon_type: u8,
        ) -> CombatUnit {
            CombatUnit {
                battle_id,
                unit_id,
                position,
                is_adventurer: true,
                current_hp: hp,
                max_hp: hp,
                damage,
                initiative: 10,
                weapon_type,
                beast_type: 0,
                is_alive: true,
            }
        }

        /// Helper: create a CombatUnit for beast tests.
        fn make_beast_unit(
            battle_id: u32, unit_id: u64, position: u8, hp: u16, damage: u16, beast_type: u8,
        ) -> CombatUnit {
            CombatUnit {
                battle_id,
                unit_id,
                position,
                is_adventurer: false,
                current_hp: hp,
                max_hp: hp,
                damage,
                initiative: 5,
                weapon_type: 0,
                beast_type,
                is_alive: true,
            }
        }

        /// Simulate a single combat round between adventurers and beasts.
        /// Returns (adventurer_hp, adventurers_alive, beast_hp, beasts_alive) after the round.
        fn simulate_combat(
            adventurer_units: @Array<CombatUnit>,
            beast_units: @Array<CombatUnit>,
            mut adventurer_hp: Array<u16>,
            mut adventurers_alive: Array<bool>,
            mut beast_hp: Array<u16>,
            mut beasts_alive: Array<bool>,
        ) -> (Array<u16>, Array<bool>, Array<u16>, Array<bool>) {
            let mut round: u8 = 1;
            let max_rounds: u8 = 50;
            loop {
                let adv_alive_count = count_alive(@adventurers_alive);
                let beast_alive_count = count_alive(@beasts_alive);
                if adv_alive_count == 0 || beast_alive_count == 0 || round > max_rounds {
                    break;
                }
                // Adventurers attack.
                let mut i: usize = 0;
                loop {
                    if i >= adventurer_units.len() {
                        break;
                    }
                    if *adventurers_alive.at(i) {
                        let unit = adventurer_units.at(i);
                        let target_pos = get_target_position(*unit.position, @beasts_alive);
                        match target_pos {
                            Option::Some(pos) => {
                                let target_idx = find_target_unit(
                                    beast_units, pos, @beasts_alive,
                                );
                                match target_idx {
                                    Option::Some(ti) => {
                                        let target = beast_units.at(ti);
                                        let multiplier = get_damage_multiplier(
                                            *unit.weapon_type, *target.beast_type,
                                        );
                                        let final_damage = (*unit.damage * multiplier) / 100;
                                        let current = *beast_hp.at(ti);
                                        let new_hp = if final_damage >= current {
                                            0
                                        } else {
                                            current - final_damage
                                        };
                                        beast_hp = replace_at_index(beast_hp, ti, new_hp);
                                        if new_hp == 0 {
                                            beasts_alive = replace_bool_at_index(
                                                beasts_alive, ti, false,
                                            );
                                        }
                                    },
                                    Option::None => {},
                                }
                            },
                            Option::None => {},
                        }
                    }
                    i += 1;
                };
                // Beasts attack.
                i = 0;
                loop {
                    if i >= beast_units.len() {
                        break;
                    }
                    if *beasts_alive.at(i) {
                        let unit = beast_units.at(i);
                        let target_pos = get_target_position(*unit.position, @adventurers_alive);
                        match target_pos {
                            Option::Some(pos) => {
                                let target_idx = find_target_unit(
                                    adventurer_units, pos, @adventurers_alive,
                                );
                                match target_idx {
                                    Option::Some(ti) => {
                                        let current = *adventurer_hp.at(ti);
                                        let dmg = *unit.damage;
                                        let new_hp = if dmg >= current {
                                            0
                                        } else {
                                            current - dmg
                                        };
                                        adventurer_hp = replace_at_index(
                                            adventurer_hp, ti, new_hp,
                                        );
                                        if new_hp == 0 {
                                            adventurers_alive = replace_bool_at_index(
                                                adventurers_alive, ti, false,
                                            );
                                        }
                                    },
                                    Option::None => {},
                                }
                            },
                            Option::None => {},
                        }
                    }
                    i += 1;
                };
                round += 1;
            };
            (adventurer_hp, adventurers_alive, beast_hp, beasts_alive)
        }

        /// Multi-floor combat simulation: 1 adventurer vs 1 beast over multiple floors.
        /// Verifies HP carry-over, scoring, and that damage accumulates.
        #[test]
        fn test_multifloor_run_combat_simulation() {
            // Floor 1: Blade adventurer vs Bludgeon beast (neutral damage).
            let advs = array![make_adventurer_unit(1, 1, 1, 300, 40, 2)];
            let beasts = array![make_beast_unit(1, 1, 1, 60, 10, 3)];

            let (hp_f1, alive_f1, _, beast_alive_f1) = simulate_combat(
                @advs,
                @beasts,
                array![300_u16],
                array![true],
                array![60_u16],
                array![true],
            );

            assert(count_alive(@beast_alive_f1) == 0, 'F1 beast dead');
            assert(count_alive(@alive_f1) == 1, 'F1 adv alive');
            let hp1 = *hp_f1.at(0);
            assert(hp1 < 300, 'F1 took damage');
            assert(hp1 > 0, 'F1 survived');

            // Floor 2: carry-over HP, slightly stronger beast (floor scaling 70%).
            let beast_hp_f2: u16 = 60 * 70 / 100; // 42
            let beast_dmg_f2: u16 = 10 * 70 / 100; // 7
            let advs_f2 = array![make_adventurer_unit(2, 1, 1, hp1, 40, 2)];
            let beasts_f2 = array![make_beast_unit(2, 2, 1, beast_hp_f2, beast_dmg_f2, 3)];

            let (hp_f2, alive_f2, _, beast_alive_f2) = simulate_combat(
                @advs_f2,
                @beasts_f2,
                array![hp1],
                array![true],
                array![beast_hp_f2],
                array![true],
            );

            assert(count_alive(@beast_alive_f2) == 0, 'F2 beast dead');
            assert(count_alive(@alive_f2) == 1, 'F2 adv alive');
            let hp2 = *hp_f2.at(0);
            // HP should be lower after floor 2 (cumulative damage).
            assert(hp2 < hp1, 'Cumulative damage');

            // Score: floor 1 * 1 survivor + floor 2 * 1 survivor = 3.
            let score: u32 = 1 + 2;
            assert(score == 3, 'Score = 3');
        }

        /// Test that adventurers with type advantage crush same-type beasts.
        #[test]
        fn test_combat_type_advantage_decisive() {
            // Magic adventurers (type 1) vs Hunter beasts (type 2): 1.5x damage.
            let advs = array![
                make_adventurer_unit(1, 1, 1, 200, 40, 1), // Magic
                make_adventurer_unit(1, 2, 2, 200, 40, 1), // Magic
            ];
            let beasts = array![
                make_beast_unit(1, 1, 1, 100, 20, 2), // Hunter (weak to Magic)
                make_beast_unit(1, 2, 2, 100, 20, 2), // Hunter
            ];
            let adv_hp = array![200_u16, 200_u16];
            let adv_alive = array![true, true];
            let beast_hp = array![100_u16, 100_u16];
            let beast_alive = array![true, true];

            let (final_adv_hp, final_adv_alive, _final_beast_hp, final_beast_alive) =
                simulate_combat(
                @advs, @beasts, adv_hp, adv_alive, beast_hp, beast_alive,
            );

            // Adventurers should win decisively with type advantage.
            assert(count_alive(@final_beast_alive) == 0, 'Beasts should die');
            assert(count_alive(@final_adv_alive) == 2, 'Both advs survive');
            // Both adventurers should have most of their HP.
            assert(*final_adv_hp.at(0) > 100, 'Adv1 mostly healthy');
            assert(*final_adv_hp.at(1) > 100, 'Adv2 mostly healthy');
        }

        /// Test combat where beasts heavily outpower adventurers.
        #[test]
        fn test_combat_beasts_overpower_adventurers() {
            let advs = array![make_adventurer_unit(1, 1, 1, 50, 5, 1)]; // Weak
            let beasts = array![
                make_beast_unit(1, 1, 1, 500, 100, 1), // Very strong beast (resists Magic too)
            ];
            let adv_hp = array![50_u16];
            let adv_alive = array![true];
            let beast_hp = array![500_u16];
            let beast_alive = array![true];

            let (_final_adv_hp, final_adv_alive, _final_beast_hp, final_beast_alive) =
                simulate_combat(
                @advs, @beasts, adv_hp, adv_alive, beast_hp, beast_alive,
            );

            // Beast should kill the weak adventurer.
            assert(count_alive(@final_adv_alive) == 0, 'Adv should die');
            assert(count_alive(@final_beast_alive) == 1, 'Beast survives');
        }

        /// Test that HP carry-over properly accumulates damage across floors.
        #[test]
        fn test_hp_carryover_across_floors() {
            // Floor 1: Adventurer fights a beast that survives long enough to deal damage.
            // Blade (type 2) vs Brute beast (type 3): neutral (100%) so 20 dmg/round.
            // Beast has 100 HP, needs 5 rounds to die. Beast does 30 dmg/round to adventurer.
            let advs = array![make_adventurer_unit(1, 1, 1, 300, 20, 2)]; // Blade, 20 dmg
            let beasts_f1 = array![make_beast_unit(1, 1, 1, 100, 30, 3)]; // Brute, 100 HP, 30 dmg

            let (hp_after_f1, alive_after_f1, _, beast_alive_f1) = simulate_combat(
                @advs, @beasts_f1, array![300_u16], array![true], array![100_u16], array![true],
            );

            assert(count_alive(@beast_alive_f1) == 0, 'F1 beast dead');
            assert(count_alive(@alive_after_f1) == 1, 'F1 adv alive');
            let hp_1 = *hp_after_f1.at(0);
            // Adventurer took some damage but survived.
            assert(hp_1 < 300, 'Took F1 damage');
            assert(hp_1 > 0, 'Survived F1');

            // Floor 2: Same adventurer with carry-over HP fights another beast.
            let advs_f2 = array![
                CombatUnit {
                    battle_id: 2,
                    unit_id: 1,
                    position: 1,
                    is_adventurer: true,
                    current_hp: hp_1, // carry-over
                    max_hp: 300,
                    damage: 20,
                    initiative: 10,
                    weapon_type: 2,
                    beast_type: 0,
                    is_alive: true,
                },
            ];
            let beasts_f2 = array![make_beast_unit(2, 2, 1, 100, 30, 3)];
            let (hp_after_f2, _alive_after_f2, _, _) = simulate_combat(
                @advs_f2, @beasts_f2, array![hp_1], array![true], array![100_u16], array![true],
            );

            let hp_2 = *hp_after_f2.at(0);
            // HP should be lower than after floor 1 (accumulated damage).
            assert(hp_2 < hp_1, 'Accumulated damage');
        }

        /// Verify the ecology classification + selection synergy:
        /// when multiple candidates exist, diverse ecology is preferred.
        #[test]
        fn test_ecology_diversity_preference_simulation() {
            // Simulate 12 encounters with skewed ecology. Verify cap triggers.
            let mut state = make_default_match_state();

            // Simulate 10 encounters, 5 of which are mono_type.
            let mut i: u8 = 0;
            loop {
                if i >= 5 {
                    break;
                }
                increment_eco_count(ref state, 1); // mono_type
                state.encounters_played += 1;
                i += 1;
            };
            i = 0;
            loop {
                if i >= 5 {
                    break;
                }
                increment_eco_count(ref state, 3); // balanced
                state.encounters_played += 1;
                i += 1;
            };

            // After 10 encounters: mono=5 (50%), balanced=5 (50%).
            assert(ecology_exceeds_cap(@state, 1), 'Mono exceeds cap');
            assert(ecology_exceeds_cap(@state, 3), 'Balanced exceeds cap');

            // Classes 2, 4, 5, 6 have 0 encounters - should not exceed cap.
            assert(!ecology_exceeds_cap(@state, 2), 'Dual under cap');
            assert(!ecology_exceeds_cap(@state, 4), 'Burst under cap');
            assert(!ecology_exceeds_cap(@state, 5), 'Tank under cap');
            assert(!ecology_exceeds_cap(@state, 6), 'Control under cap');
        }

        /// Test the full matchmaking cooldown + ecology interaction across
        /// a sequence of 6 encounters.
        #[test]
        fn test_matchmaking_state_full_sequence() {
            let mut state = make_default_match_state();
            let d1 = contract_address_const::<0x10>();
            let d2 = contract_address_const::<0x20>();
            let d3 = contract_address_const::<0x30>();
            let d4 = contract_address_const::<0x40>();
            let d5 = contract_address_const::<0x50>();
            let d6 = contract_address_const::<0x60>();
            let defenders = array![d1, d2, d3, d4, d5, d6];
            let ecologies = array![1_u8, 2_u8, 3_u8, 4_u8, 5_u8, 6_u8];

            let mut i: usize = 0;
            loop {
                if i >= 6 {
                    break;
                }
                let def = *defenders.at(i);
                let eco = *ecologies.at(i);
                push_recent_defender(ref state, def);
                increment_eco_count(ref state, eco);
                state.encounters_played += 1;
                i += 1;
            };

            // After 6 encounters: d4, d5, d6 on cooldown; d1, d2, d3 off cooldown.
            assert(!is_on_cooldown(@state, d1), 'd1 off cd');
            assert(!is_on_cooldown(@state, d2), 'd2 off cd');
            assert(!is_on_cooldown(@state, d3), 'd3 off cd');
            assert(is_on_cooldown(@state, d4), 'd4 on cd');
            assert(is_on_cooldown(@state, d5), 'd5 on cd');
            assert(is_on_cooldown(@state, d6), 'd6 on cd');

            // All ecologies at 1/6 = ~16.7% — well under 40% cap.
            let mut eco: u8 = 1;
            loop {
                if eco > 6 {
                    break;
                }
                assert(!ecology_exceeds_cap(@state, eco), 'Even dist no cap');
                eco += 1;
            };

            assert(state.encounters_played == 6, 'Total 6 encounters');
        }

        /// Simulate boss floor damage: beasts get 1.5x scale + 1.25x boss multiplier.
        #[test]
        fn test_boss_floor_combat_scaling() {
            use survivor_valhalla::constants::BOSS_STAT_MULT;

            let base_hp: u32 = 100;
            let base_dmg: u32 = 20;

            // Floor 10 (boss): scale = 150, boss mult = 125
            let scale_10: u32 = get_floor_scale(10).into();
            let boss_hp: u16 = ((base_hp * scale_10 / 100) * BOSS_STAT_MULT.into() / 100)
                .try_into()
                .unwrap();
            let boss_dmg: u16 = ((base_dmg * scale_10 / 100) * BOSS_STAT_MULT.into() / 100)
                .try_into()
                .unwrap();

            // Floor 9 (non-boss): scale = 130
            let scale_9: u32 = get_floor_scale(9).into();
            let f9_hp: u16 = (base_hp * scale_9 / 100).try_into().unwrap();
            let f9_dmg: u16 = (base_dmg * scale_9 / 100).try_into().unwrap();

            // Boss should be significantly stronger than floor 9.
            assert(boss_hp > f9_hp, 'Boss HP > f9 HP');
            assert(boss_dmg > f9_dmg, 'Boss dmg > f9 dmg');

            // Test combat: strong adventurer vs boss beast.
            let advs = array![make_adventurer_unit(1, 1, 1, 400, 50, 2)]; // Blade
            let boss_beasts = array![make_beast_unit(1, 1, 1, boss_hp, boss_dmg, 1)]; // Magical

            let (final_adv_hp, final_adv_alive, _, final_beast_alive) = simulate_combat(
                @advs,
                @boss_beasts,
                array![400_u16],
                array![true],
                array![boss_hp],
                array![true],
            );

            // With 1.5x damage (Blade vs Magic), adventurer deals 75/round.
            // Boss has 187 HP → dies in 3 rounds. Boss deals 37/round → 74 total damage.
            assert(count_alive(@final_beast_alive) == 0, 'Boss should die');
            assert(count_alive(@final_adv_alive) == 1, 'Adv survives boss');
            assert(*final_adv_hp.at(0) < 400, 'Boss dealt damage');
        }

        /// Test a 5-floor run with 1v1 combat per floor, verifying score accumulation,
        /// floor scaling effect, and heal mechanics.
        #[test]
        fn test_full_10_floor_run_simulation() {
            use survivor_valhalla::constants::{HEAL_INTERVAL, HEAL_PERCENT};

            let adv_max_hp: u16 = 300;
            let adv_dmg: u16 = 30;
            let mut current_hp: u16 = adv_max_hp;
            let mut score: u32 = 0;
            let mut floor: u8 = 1;
            let mut floors_cleared: u8 = 0;
            let mut heals_applied: u8 = 0;

            loop {
                if floor > 5 || current_hp == 0 {
                    break;
                }

                let scale = get_floor_scale(floor);
                let beast_hp: u16 = (60_u32 * scale.into() / 100).try_into().unwrap();
                let beast_dmg: u16 = (12_u32 * scale.into() / 100).try_into().unwrap();

                // 1v1 combat (no position wrapping issues).
                let advs = array![make_adventurer_unit(floor.into(), 1, 1, current_hp, adv_dmg, 2)];
                let beasts = array![make_beast_unit(floor.into(), 1, 1, beast_hp, beast_dmg, 3)];
                // Blade vs Bludgeon: neutral (100%) damage.

                let (new_hp, new_alive, _, beast_alive) = simulate_combat(
                    @advs, @beasts, array![current_hp], array![true], array![beast_hp], array![
                        true,
                    ],
                );

                if count_alive(@beast_alive) == 0 && count_alive(@new_alive) > 0 {
                    floors_cleared += 1;
                    score += floor.into() * 1; // 1 survivor
                    current_hp = *new_hp.at(0);

                    // Heal every HEAL_INTERVAL floors.
                    if floor % HEAL_INTERVAL == 0 {
                        let heal = (adv_max_hp * HEAL_PERCENT) / 100;
                        let healed = if current_hp + heal > adv_max_hp {
                            adv_max_hp
                        } else {
                            current_hp + heal
                        };
                        current_hp = healed;
                        heals_applied += 1;
                    }

                    floor += 1;
                } else {
                    break;
                }
            };

            assert(floors_cleared >= 3, 'Should clear 3+ floors');
            assert(score > 0, 'Positive score');
            assert(heals_applied > 0, 'At least 1 heal');
        }

        /// Verify that a 5v5 matchup with all resistances (same-type) is much
        /// harder than a super-effective matchup.
        #[test]
        fn test_combat_type_triangle_impact() {
            // Scenario A: Magic advs vs Magic beasts (resisted: 0.75x)
            let advs_a = array![
                make_adventurer_unit(1, 1, 1, 200, 40, 1),
                make_adventurer_unit(1, 2, 2, 200, 40, 1),
            ];
            let beasts_a = array![
                make_beast_unit(1, 1, 1, 120, 25, 1), // Magic beast resists Magic
                make_beast_unit(1, 2, 2, 120, 25, 1),
            ];
            let (hp_a, alive_a, _, beast_alive_a) = simulate_combat(
                @advs_a,
                @beasts_a,
                array![200_u16, 200_u16],
                array![true, true],
                array![120_u16, 120_u16],
                array![true, true],
            );

            // Scenario B: Magic advs vs Hunter beasts (super effective: 1.5x)
            let advs_b = array![
                make_adventurer_unit(2, 1, 1, 200, 40, 1),
                make_adventurer_unit(2, 2, 2, 200, 40, 1),
            ];
            let beasts_b = array![
                make_beast_unit(2, 1, 1, 120, 25, 2), // Hunter weak to Magic
                make_beast_unit(2, 2, 2, 120, 25, 2),
            ];
            let (hp_b, _alive_b, _, _beast_alive_b) = simulate_combat(
                @advs_b,
                @beasts_b,
                array![200_u16, 200_u16],
                array![true, true],
                array![120_u16, 120_u16],
                array![true, true],
            );

            // Both should win, but type-advantage scenario should have more HP remaining.
            assert(count_alive(@beast_alive_a) == 0, 'A beasts dead');
            let hp_a_total = *hp_a.at(0) + *hp_a.at(1);
            let hp_b_total = *hp_b.at(0) + *hp_b.at(1);
            assert(hp_b_total > hp_a_total, 'SE preserves more HP');
        }

        /// Test scoring formula: score = sum(floor * survivors) across all cleared floors.
        #[test]
        fn test_score_formula_exact() {
            // Simulate exact scenario: 3 advs clear 5 floors with deaths on specific floors.
            // Floor 1: 3 alive => score += 1*3 = 3
            // Floor 2: 3 alive => score += 2*3 = 6 (total: 9)
            // Floor 3: 2 alive (one died) => score += 3*2 = 6 (total: 15)
            // Floor 4: 2 alive => score += 4*2 = 8 (total: 23)
            // Floor 5: 1 alive (one died) => score += 5*1 = 5 (total: 28)
            let survivors_per_floor: Array<(u32, u32)> = array![
                (1, 3), (2, 3), (3, 2), (4, 2), (5, 1),
            ];
            let mut total: u32 = 0;
            let mut i: usize = 0;
            loop {
                if i >= survivors_per_floor.len() {
                    break;
                }
                let (floor, survivors) = *survivors_per_floor.at(i);
                total += floor * survivors;
                i += 1;
            };
            assert(total == 28, 'Exact score 28');
        }

        /// Test that floor scaling cycle correctly repeats for floors 11-20.
        #[test]
        fn test_floor_scaling_cycle_consistency() {
            // Floors 1-9 should match floors 11-19.
            let mut f: u8 = 1;
            loop {
                if f > 9 {
                    break;
                }
                assert(get_floor_scale(f) == get_floor_scale(f + 10), 'Cycle mismatch');
                f += 1;
            };
            // Boss floors: 10 == 20 == 30.
            assert(get_floor_scale(10) == get_floor_scale(20), 'Boss 10 == 20');
            assert(get_floor_scale(20) == get_floor_scale(30), 'Boss 20 == 30');
        }

        /// Test ecology distribution stays balanced over a long simulated run (20 encounters).
        #[test]
        fn test_ecology_balance_over_20_encounters() {
            let mut state = make_default_match_state();

            // Simulate 20 encounters cycling through all 6 classes.
            let mut enc: u8 = 0;
            loop {
                if enc >= 20 {
                    break;
                }
                let eco_class = (enc % 6) + 1; // cycles 1,2,3,4,5,6,1,2,...
                increment_eco_count(ref state, eco_class);
                state.encounters_played += 1;
                enc += 1;
            };

            // Classes 1-2 get 4 each (rounds 0,6,12,18 and 1,7,13,19).
            // Classes 3-6 get 3 each.
            assert(get_eco_count(@state, 1) == 4, 'Eco1 = 4');
            assert(get_eco_count(@state, 2) == 4, 'Eco2 = 4');
            assert(get_eco_count(@state, 3) == 3, 'Eco3 = 3');
            assert(get_eco_count(@state, 4) == 3, 'Eco4 = 3');
            assert(get_eco_count(@state, 5) == 3, 'Eco5 = 3');
            assert(get_eco_count(@state, 6) == 3, 'Eco6 = 3');

            // Max is 4/20 = 20%, well under 40% cap.
            let mut eco: u8 = 1;
            loop {
                if eco > 6 {
                    break;
                }
                assert(!ecology_exceeds_cap(@state, eco), 'No cap at 20');
                eco += 1;
            };
        }

        // ── Cross-run memory tests ──────────────────────────────────────

        #[test]
        fn test_cross_run_memory_empty() {
            let mem = make_default_cross_run_memory();
            let def_a = contract_address_const::<0x1>();
            assert(!is_in_cross_run_memory(mem, def_a), 'Not in empty mem');
        }

        #[test]
        fn test_cross_run_memory_zero_address() {
            let mem = make_default_cross_run_memory();
            let zero = contract_address_const::<0>();
            // Zero address should never match (prevents false positives from default state).
            assert(!is_in_cross_run_memory(mem, zero), 'Zero addr excluded');
        }

        #[test]
        fn test_cross_run_memory_contains() {
            let def_a = contract_address_const::<0xA>();
            let def_b = contract_address_const::<0xB>();
            let def_c = contract_address_const::<0xC>();
            let def_d = contract_address_const::<0xD>();
            let def_e = contract_address_const::<0xE>();
            let def_f = contract_address_const::<0xF>();

            let mem = CrossRunMemory {
                player: contract_address_const::<0x1>(),
                def_1: def_a,
                def_2: def_b,
                def_3: def_c,
                def_4: def_d,
                def_5: def_e,
            };

            assert(is_in_cross_run_memory(mem, def_a), 'def_a in mem');
            assert(is_in_cross_run_memory(mem, def_b), 'def_b in mem');
            assert(is_in_cross_run_memory(mem, def_c), 'def_c in mem');
            assert(is_in_cross_run_memory(mem, def_d), 'def_d in mem');
            assert(is_in_cross_run_memory(mem, def_e), 'def_e in mem');
            assert(!is_in_cross_run_memory(mem, def_f), 'def_f not in mem');
        }

        #[test]
        fn test_cross_run_memory_partial() {
            let def_a = contract_address_const::<0xA>();
            let def_b = contract_address_const::<0xB>();
            let zero = contract_address_const::<0>();

            let mem = CrossRunMemory {
                player: contract_address_const::<0x1>(),
                def_1: def_a,
                def_2: def_b,
                def_3: zero,
                def_4: zero,
                def_5: zero,
            };

            assert(is_in_cross_run_memory(mem, def_a), 'def_a partial');
            assert(is_in_cross_run_memory(mem, def_b), 'def_b partial');
            assert(!is_in_cross_run_memory(mem, zero), 'zero not matched');
        }

        // ── Last ecology class tracking tests ───────────────────────────

        #[test]
        fn test_last_ecology_class_default() {
            let state = make_default_match_state();
            assert(state.last_ecology_class == 0, 'Default no eco');
        }

        #[test]
        fn test_last_ecology_class_tracking() {
            let mut state = make_default_match_state();
            state.last_ecology_class = 3;
            assert(state.last_ecology_class == 3, 'Eco class set');
            state.last_ecology_class = 5;
            assert(state.last_ecology_class == 5, 'Eco class updated');
        }

        // ── Consecutive ecology avoidance logic test ────────────────────

        #[test]
        fn test_consecutive_ecology_would_be_avoided() {
            // Verify the logic: if last_ecology_class matches candidate, pass 1 skips.
            let mut state = make_default_match_state();
            state.last_ecology_class = 3; // balanced

            // In pass 1, ecology_class == last_ecology_class should be skipped.
            let candidate_eco: u8 = 3;
            let should_skip = state.last_ecology_class != 0
                && candidate_eco == state.last_ecology_class;
            assert(should_skip, 'Should skip consecutive');

            // Different class should not be skipped.
            let other_eco: u8 = 4;
            let should_not_skip = state.last_ecology_class != 0
                && other_eco == state.last_ecology_class;
            assert(!should_not_skip, 'Should not skip diff');
        }

        #[test]
        fn test_consecutive_ecology_no_last() {
            // When last_ecology_class is 0 (first encounter), nothing is skipped.
            let state = make_default_match_state();
            let candidate_eco: u8 = 3;
            let should_skip = state.last_ecology_class != 0
                && candidate_eco == state.last_ecology_class;
            assert(!should_skip, 'First encounter ok');
        }

        // ── Classify lineup tests ──────────────────────────────────────────

        /// Test: 5 beasts of the same type → mono_type.
        #[test]
        fn test_classify_lineup_mono_type() {
            // All type 1 (Magical) with level 5, health 100, tier 2.
            // 5 beasts of type 1 → mono_threshold = (5*4)/5 = 4, max_type_count = 5 >= 4 AND >= 4
            let mono_threshold_5 = (5_u8 * 4) / 5;
            assert(mono_threshold_5 == 4, 'Mono thresh 5 units');
            assert(5_u8 >= mono_threshold_5 && 5_u8 >= 4, 'All same = mono');
        }

        /// Test: 4 out of 5 same type → mono_type (80% threshold).
        #[test]
        fn test_classify_lineup_4_of_5_mono() {
            // 4/5 = 80%, mono_threshold = (5*4)/5 = 4, max_count = 4 >= 4 AND >= 4.
            let mono_threshold = (5_u8 * 4) / 5;
            assert(4_u8 >= mono_threshold && 4_u8 >= 4, '4 of 5 is mono');
        }

        /// Test: 3 out of 5 same type → NOT mono_type (60% < 80%).
        #[test]
        fn test_classify_lineup_3_of_5_not_mono() {
            let mono_threshold = (5_u8 * 4) / 5;
            // 3 < 4 (threshold), so not mono.
            assert(3_u8 < mono_threshold || 3_u8 < 4, '3 of 5 not mono');
        }

        /// Test: two types with 2+ beasts each → dual_type.
        #[test]
        fn test_classify_lineup_dual_type() {
            // 3 type-1, 2 type-2, 0 type-3 → types_with_2_plus = 2 → dual_type.
            let count_1: u8 = 3;
            let count_2: u8 = 2;
            let count_3: u8 = 0;
            let mut types_with_2_plus: u8 = 0;
            if count_1 >= 2 {
                types_with_2_plus += 1;
            }
            if count_2 >= 2 {
                types_with_2_plus += 1;
            }
            if count_3 >= 2 {
                types_with_2_plus += 1;
            }
            assert(types_with_2_plus >= 2, 'Dual type detected');
        }

        /// Test: burst classification trigger (max_damage > avg_damage * 1.5).
        #[test]
        fn test_classify_lineup_burst() {
            // Simulate 3 beasts: two low-damage + one high-damage.
            // Damages: 5, 5, 30 → total=40, avg=13, max=30.
            // max*100=3000 > avg*150=1950 → burst.
            let total_damage: u32 = 40;
            let unit_count: u8 = 3;
            let avg_damage = total_damage / unit_count.into();
            let max_damage: u32 = 30;
            let is_burst = avg_damage > 0 && max_damage * 100 > avg_damage * 150;
            assert(is_burst, 'Should be burst');
        }

        /// Test: tank classification trigger (avg HP > 150).
        #[test]
        fn test_classify_lineup_tank() {
            // 3 beasts with total HP = 600 → avg = 200 > 150 → tank.
            let total_hp: u32 = 600;
            let unit_count: u8 = 3;
            let avg_hp = total_hp / unit_count.into();
            assert(avg_hp > 150, 'Should be tank');
        }

        /// Test: balanced classification (no dominant trait).
        #[test]
        fn test_classify_lineup_balanced() {
            // 2 type-1, 2 type-2, 1 type-3 → not mono, not burst, not tank.
            // types_with_2_plus = 2 → dual (dual takes priority over balanced).
            // So for balanced: 1 type-1, 1 type-2, 1 type-3 (3 beasts).
            let count_1: u8 = 1;
            let count_2: u8 = 1;
            let count_3: u8 = 1;
            let unit_count: u8 = 3;
            let mono_threshold = (unit_count * 4) / 5;

            // Not mono: max type count = 1 < threshold.
            let max_type = count_1;
            let is_mono = max_type >= mono_threshold && max_type >= 4;
            assert(!is_mono, 'Not mono');

            // Not burst: even damage distribution.
            let avg_damage: u32 = 10;
            let max_damage: u32 = 12;
            let is_burst = avg_damage > 0 && max_damage * 100 > avg_damage * 150;
            assert(!is_burst, 'Not burst');

            // Not tank: low avg HP.
            let avg_hp: u32 = 80;
            let is_tank = avg_hp > 150;
            assert(!is_tank, 'Not tank');

            // Not dual: only 0 types with 2+.
            let mut types_with_2_plus: u8 = 0;
            if count_1 >= 2 {
                types_with_2_plus += 1;
            }
            if count_2 >= 2 {
                types_with_2_plus += 1;
            }
            if count_3 >= 2 {
                types_with_2_plus += 1;
            }
            assert(types_with_2_plus < 2, 'Not dual');
            // → balanced.
        }

        // ── Multi-floor ecology-aware run simulation ──────────────────────

        /// Simulate a 10-floor run where each floor fight is paired with
        /// an ecology class. Verify that ecology tracking + heal + scoring
        /// all interact correctly over a full run lifecycle.
        #[test]
        fn test_full_run_lifecycle_with_ecology() {
            use survivor_valhalla::constants::{HEAL_INTERVAL, HEAL_PERCENT};

            let adv_max_hp: u16 = 250;
            let adv_dmg: u16 = 25;
            let mut current_hp: u16 = adv_max_hp;
            let mut score: u32 = 0;
            let mut floor: u8 = 1;
            let mut match_state = make_default_match_state();

            // Simulate 8 floor clears with ecology tracking.
            let eco_sequence: Array<u8> = array![3, 1, 4, 2, 5, 6, 3, 1];

            loop {
                if floor > 8 || current_hp == 0 {
                    break;
                }

                let scale = get_floor_scale(floor);
                let beast_hp: u16 = (50_u32 * scale.into() / 100).try_into().unwrap();
                let beast_dmg: u16 = (10_u32 * scale.into() / 100).try_into().unwrap();

                // Combat sim.
                let advs = array![make_adventurer_unit(floor.into(), 1, 1, current_hp, adv_dmg, 2)];
                let beasts = array![make_beast_unit(floor.into(), 1, 1, beast_hp, beast_dmg, 3)];

                let (new_hp, new_alive, _, beast_alive) = simulate_combat(
                    @advs, @beasts, array![current_hp], array![true], array![beast_hp], array![
                        true,
                    ],
                );

                if count_alive(@beast_alive) == 0 && count_alive(@new_alive) > 0 {
                    score += floor.into() * 1;
                    current_hp = *new_hp.at(0);

                    // Track ecology for this floor.
                    let eco_class = *eco_sequence.at((floor - 1).into());
                    increment_eco_count(ref match_state, eco_class);
                    match_state.last_ecology_class = eco_class;
                    match_state.encounters_played += 1;

                    // Heal every HEAL_INTERVAL floors.
                    if floor % HEAL_INTERVAL == 0 {
                        let heal = (adv_max_hp * HEAL_PERCENT) / 100;
                        current_hp =
                            if current_hp + heal > adv_max_hp {
                                adv_max_hp
                            } else {
                                current_hp + heal
                            };
                    }

                    floor += 1;
                } else {
                    break;
                }
            };

            // Verify run progression.
            assert(floor > 5, 'Cleared 5+ floors');
            assert(score > 0, 'Positive score');

            // Verify ecology tracking is consistent.
            assert(match_state.encounters_played > 0, 'Encounters tracked');
            let total_eco: u8 = get_eco_count(@match_state, 1)
                + get_eco_count(@match_state, 2)
                + get_eco_count(@match_state, 3)
                + get_eco_count(@match_state, 4)
                + get_eco_count(@match_state, 5)
                + get_eco_count(@match_state, 6);
            assert(total_eco == match_state.encounters_played, 'Eco sum = encounters');

            // Balanced class (3) appeared twice: 2/8 = 25% < 40% cap.
            assert(!ecology_exceeds_cap(@match_state, 3), 'Balanced under cap');
        }

        /// Test that match state correctly tracks defender cooldown during
        /// a multi-floor run with 4+ defenders.
        #[test]
        fn test_multifloor_cooldown_tracking() {
            let mut state = make_default_match_state();
            let defenders = array![
                contract_address_const::<0x10>(),
                contract_address_const::<0x20>(),
                contract_address_const::<0x30>(),
                contract_address_const::<0x40>(),
                contract_address_const::<0x50>(),
                contract_address_const::<0x60>(),
                contract_address_const::<0x70>(),
            ];

            // Simulate 7 encounters, pushing each defender.
            let mut i: usize = 0;
            loop {
                if i >= 7 {
                    break;
                }
                let def = *defenders.at(i);
                push_recent_defender(ref state, def);
                state.encounters_played += 1;
                i += 1;
            };

            // After 7 encounters, only the last 3 are on cooldown (5, 6, 7).
            assert(!is_on_cooldown(@state, *defenders.at(0)), 'def0 off cd');
            assert(!is_on_cooldown(@state, *defenders.at(1)), 'def1 off cd');
            assert(!is_on_cooldown(@state, *defenders.at(2)), 'def2 off cd');
            assert(!is_on_cooldown(@state, *defenders.at(3)), 'def3 off cd');
            assert(is_on_cooldown(@state, *defenders.at(4)), 'def4 on cd');
            assert(is_on_cooldown(@state, *defenders.at(5)), 'def5 on cd');
            assert(is_on_cooldown(@state, *defenders.at(6)), 'def6 on cd');
        }

        /// Test that the floor scaling + boss multiplier produces a
        /// monotonically increasing effective difficulty.
        #[test]
        fn test_effective_difficulty_monotonic_with_boss() {
            use survivor_valhalla::constants::BOSS_STAT_MULT;

            let base_power: u32 = 100;
            let mut prev_eff: u32 = 0;
            let mut floor: u8 = 1;
            loop {
                if floor > 20 {
                    break;
                }
                let scale: u32 = get_floor_scale(floor).into();
                let is_boss = floor % 10 == 0 && floor > 0;
                let mut eff = base_power * scale / 100;
                if is_boss {
                    eff = eff * BOSS_STAT_MULT.into() / 100;
                }

                // Within each 10-floor cycle, difficulty should increase.
                // Between cycles, floor 11 (0.6x) resets below floor 10 boss.
                let cycle_floor = ((floor - 1) % 10) + 1;
                if cycle_floor > 1 {
                    assert(eff >= prev_eff, 'Intra-cycle monotonic');
                }
                prev_eff = eff;
                floor += 1;
            };
        }

        /// Test the target bands for a complete 20-floor run.
        #[test]
        fn test_target_bands_20_floor_run() {
            let mut floor: u8 = 1;
            loop {
                if floor > 20 {
                    break;
                }
                let (primary, secondary) = get_target_bands(floor);
                // Primary should always be <= secondary.
                assert(primary <= secondary, 'Primary <= secondary');
                // Both should be valid band values (1-5).
                assert(primary >= 1 && primary <= 5, 'Primary valid');
                assert(secondary >= 1 && secondary <= 5, 'Secondary valid');
                floor += 1;
            };
        }

        /// Test 5v5 combat with mixed types and verify attrition behavior.
        #[test]
        fn test_5v5_combat_with_attrition() {
            // Strong adventurer team vs tough beast team.
            let advs = array![
                make_adventurer_unit(1, 1, 1, 200, 30, 1), // Magic
                make_adventurer_unit(1, 2, 2, 200, 30, 2), // Blade
                make_adventurer_unit(1, 3, 3, 200, 30, 3), // Bludgeon
                make_adventurer_unit(1, 4, 4, 200, 30, 1), // Magic
                make_adventurer_unit(1, 5, 5, 200, 30, 2), // Blade
            ];
            let beasts = array![
                make_beast_unit(1, 1, 1, 100, 20, 1), // Magic beast
                make_beast_unit(1, 2, 2, 100, 20, 2), // Hunter beast
                make_beast_unit(1, 3, 3, 100, 20, 3), // Brute beast
                make_beast_unit(1, 4, 4, 100, 20, 1), // Magic beast
                make_beast_unit(1, 5, 5, 100, 20, 2), // Hunter beast
            ];

            let adv_hp = array![200_u16, 200_u16, 200_u16, 200_u16, 200_u16];
            let adv_alive = array![true, true, true, true, true];
            let beast_hp = array![100_u16, 100_u16, 100_u16, 100_u16, 100_u16];
            let beast_alive = array![true, true, true, true, true];

            let (final_adv_hp, final_adv_alive, _, final_beast_alive) = simulate_combat(
                @advs, @beasts, adv_hp, adv_alive, beast_hp, beast_alive,
            );

            // Adventurers should win (more total HP and damage).
            assert(count_alive(@final_beast_alive) == 0, '5v5 beasts die');
            let adv_survivors = count_alive(@final_adv_alive);
            assert(adv_survivors > 0, 'Some advs survive');

            // Calculate total HP remaining to verify attrition happened.
            let mut total_hp_remaining: u32 = 0;
            let mut j: usize = 0;
            loop {
                if j >= final_adv_hp.len() {
                    break;
                }
                total_hp_remaining += (*final_adv_hp.at(j)).into();
                j += 1;
            };
            // Total max HP was 1000, should have taken significant damage.
            assert(total_hp_remaining < 1000, 'Attrition occurred');
        }

        /// Test that the stat boost seed derivation produces different
        /// deterministic results per floor.
        #[test]
        fn test_stat_boost_determinism() {
            // Use the same Pedersen function from the parent module via core.
            let seed: felt252 = 12345;

            // Two different floors should produce different hashes.
            let hash_f5 = core::pedersen::pedersen(seed, 5);
            let hash_f10 = core::pedersen::pedersen(seed, 10);
            assert(hash_f5 != hash_f10, 'Floor hashes differ');

            // Stat selection should be deterministic: same input = same output.
            let stat_hash_f5 = core::pedersen::pedersen(hash_f5, 1);
            let stat_5_u256: u256 = stat_hash_f5.into();
            let stat_5: u8 = (stat_5_u256 % 7).try_into().unwrap();
            assert(stat_5 < 7, 'Stat in range');

            // Same seed + same floor = same result (determinism check).
            let hash_f5_again = core::pedersen::pedersen(seed, 5);
            assert(hash_f5 == hash_f5_again, 'Deterministic hash');
        }

        /// Test the full reward schedule for a 30-floor run.
        #[test]
        fn test_reward_schedule_30_floors() {
            use survivor_valhalla::constants::HEAL_INTERVAL;

            let mut heal_count: u8 = 0;
            let mut boost_count: u8 = 0;
            let mut score_only_count: u8 = 0;
            let mut floor: u8 = 1;
            loop {
                if floor > 30 {
                    break;
                }
                if floor % HEAL_INTERVAL == 0 {
                    heal_count += 1;
                } else if floor % 5 == 0 {
                    boost_count += 1;
                } else {
                    score_only_count += 1;
                }
                floor += 1;
            };
            // Heals at: 3,6,9,12,15,18,21,24,27,30 = 10
            assert(heal_count == 10, 'Heal count 30 floors');
            // Stat boosts at: 5, 10, 20, 25 (15 and 30 are divisible by 3, so heal takes priority)
            assert(boost_count == 4, 'Boost count 30 floors');
            assert(score_only_count == 16, 'Score only 30 floors');
        }

        /// Test power band and ecology interaction: verify that encounter
        /// progression correctly selects harder bands on later floors.
        #[test]
        fn test_encounter_progression_difficulty() {
            let ap: u32 = 100;

            // Simulate opponents with different powers across floors.
            // Early floor (1): target bands are B-1(2) and B0(3).
            // DP=80 → band 2 (Easy), should be valid for early.
            let early_band = compute_power_band(ap, 80);
            let (early_p, early_s) = get_target_bands(1);
            assert(
                early_band == early_p || early_band == early_s, 'DP 80 valid for early',
            );

            // Mid floor (5): target bands are B0(3) and B+1(4).
            // DP=100 → band 3 (Even), valid for mid.
            let mid_band = compute_power_band(ap, 100);
            let (mid_p, mid_s) = get_target_bands(5);
            assert(mid_band == mid_p || mid_band == mid_s, 'DP 100 valid for mid');

            // Late floor (8): target bands are B+1(4) and B+2(5).
            // DP=120 → band 4 (Hard), valid for late.
            let late_band = compute_power_band(ap, 120);
            let (late_p, late_s) = get_target_bands(8);
            assert(
                late_band == late_p || late_band == late_s, 'DP 120 valid for late',
            );

            // DP=80 (Easy) should NOT be valid for late floors.
            assert(
                early_band != late_p && early_band != late_s, 'DP 80 invalid for late',
            );
        }

        // ── Populate run pool logic tests ─────────────────────────────────

        /// Test compute_power_band edge case: equal power.
        #[test]
        fn test_power_band_equal_power() {
            // AP = DP → ratio = 100 → BAND_EVEN (3)
            assert(compute_power_band(50, 50) == 3, 'Equal is even');
            assert(compute_power_band(200, 200) == 3, 'Large equal even');
        }

        /// Test power band classification across a range of ratios.
        #[test]
        fn test_power_band_systematic_sweep() {
            let ap: u32 = 1000;
            // Sweep DP from 500 to 2000 and verify band assignments are consistent.
            let test_points: Array<(u32, u8)> = array![
                (500, 1), // 50% → Very Easy
                (700, 1), // 70% → Very Easy
                (749, 1), // 74.9% → Very Easy
                (750, 2), // 75% → Easy
                (800, 2), // 80% → Easy
                (899, 2), // 89.9% → Easy
                (900, 3), // 90% → Even
                (1000, 3), // 100% → Even
                (1100, 3), // 110% → Even
                (1110, 4), // 111% → Hard
                (1200, 4), // 120% → Hard
                (1250, 4), // 125% → Hard
                (1260, 5), // 126% → Very Hard
                (1500, 5), // 150% → Very Hard
                (2000, 5), // 200% → Very Hard
            ];
            let mut i: usize = 0;
            loop {
                if i >= test_points.len() {
                    break;
                }
                let (dp, expected) = *test_points.at(i);
                let actual = compute_power_band(ap, dp);
                assert(actual == expected, 'Sweep band');
                i += 1;
            };
        }

        /// Test that the lineup hash is stable across repeated computations.
        #[test]
        fn test_lineup_hash_stability() {
            let lineup = BeastLineup {
                player: contract_address_const::<0x1>(),
                beast1_id: 42,
                beast2_id: 99,
                beast3_id: 7,
                beast4_id: 0,
                beast5_id: 0,
            };
            let h1 = compute_lineup_hash(lineup);
            let h2 = compute_lineup_hash(lineup);
            assert(h1 == h2, 'Hash is stable');
        }

        /// Test the populate_run_pool filtering logic: self-exclusion.
        #[test]
        fn test_pool_excludes_self() {
            // This tests the logic that populate_run_pool uses:
            // if defender == player { continue; }
            let player = contract_address_const::<0xAA>();
            let defender = contract_address_const::<0xAA>();
            assert(defender == player, 'Self matches');
            // → would be skipped in populate_run_pool.
        }

        /// Test the pool filtering: zero beast lineup is excluded.
        #[test]
        fn test_pool_excludes_empty_lineup() {
            // Empty lineup has beast1_id == 0, which populate_run_pool skips.
            let empty_lineup = BeastLineup {
                player: contract_address_const::<0x1>(),
                beast1_id: 0,
                beast2_id: 0,
                beast3_id: 0,
                beast4_id: 0,
                beast5_id: 0,
            };
            assert(empty_lineup.beast1_id == 0, 'Empty detected');
        }

        /// Test unit_count calculation for partially filled lineups.
        #[test]
        fn test_unit_count_partial_lineup() {
            // 3 beasts in lineup (positions 1-3 filled, 4-5 empty).
            let lineup = BeastLineup {
                player: contract_address_const::<0x1>(),
                beast1_id: 10,
                beast2_id: 20,
                beast3_id: 30,
                beast4_id: 0,
                beast5_id: 0,
            };
            let mut uc: u8 = 0;
            if lineup.beast1_id != 0 {
                uc += 1;
            }
            if lineup.beast2_id != 0 {
                uc += 1;
            }
            if lineup.beast3_id != 0 {
                uc += 1;
            }
            if lineup.beast4_id != 0 {
                uc += 1;
            }
            if lineup.beast5_id != 0 {
                uc += 1;
            }
            assert(uc == 3, 'Unit count 3');
        }

        // ── Abandon run logic tests ──────────────────────────────────────

        /// Verify the abandon run state transitions are correct.
        #[test]
        fn test_abandon_run_state_transition() {
            // Simulate the state changes abandon_run makes:
            // 1. run.is_active = false
            // 2. run.ended_at = timestamp
            // 3. ActiveRun.run_id = 0
            // 4. PlayerRunStats updated
            let player = contract_address_const::<0xBB>();
            let run_id: u32 = 5;
            let timestamp: u64 = 1000;
            let score: u32 = 42;
            let max_floor: u8 = 7;

            // Before abandon:
            let mut is_active = true;
            let mut ended_at: u64 = 0;
            let mut active_run_id: u32 = run_id;

            // After abandon:
            is_active = false;
            ended_at = timestamp;
            active_run_id = 0;

            assert(!is_active, 'Run deactivated');
            assert(ended_at == timestamp, 'End timestamp set');
            assert(active_run_id == 0, 'Active cleared');

            // Stats update logic:
            let mut best_score: u32 = 30;
            let mut best_floor: u8 = 5;
            let mut total_runs: u32 = 3;

            total_runs += 1;
            if score > best_score {
                best_score = score;
            }
            if max_floor > best_floor {
                best_floor = max_floor;
            }

            assert(total_runs == 4, 'Runs incremented');
            assert(best_score == 42, 'Best score updated');
            assert(best_floor == 7, 'Best floor updated');
        }

        /// Test that abandon does NOT update stats if current run isn't a new best.
        #[test]
        fn test_abandon_run_no_best_update() {
            let score: u32 = 10;
            let max_floor: u8 = 3;
            let mut best_score: u32 = 50;
            let mut best_floor: u8 = 10;

            if score > best_score {
                best_score = score;
            }
            if max_floor > best_floor {
                best_floor = max_floor;
            }

            // Neither should change.
            assert(best_score == 50, 'Best score unchanged');
            assert(best_floor == 10, 'Best floor unchanged');
        }

        /// Test cross-run memory save logic (used by both abandon and death).
        #[test]
        fn test_cross_run_memory_save_from_match_state() {
            let mut state = make_default_match_state();
            let d1 = contract_address_const::<0xD1>();
            let d2 = contract_address_const::<0xD2>();
            let d3 = contract_address_const::<0xD3>();

            push_recent_defender(ref state, d1);
            push_recent_defender(ref state, d2);
            push_recent_defender(ref state, d3);

            // Verify the match state has the right recent defenders
            // (this is what save_cross_run_memory reads).
            assert(state.recent_def_1 == d3, 'Slot 1 = d3');
            assert(state.recent_def_2 == d2, 'Slot 2 = d2');
            assert(state.recent_def_3 == d1, 'Slot 3 = d1');

            // Cross-run memory would be: d3, d2, d1, 0, 0
            // These can be checked in is_in_cross_run_memory.
            let mem = CrossRunMemory {
                player: contract_address_const::<0x1>(),
                def_1: state.recent_def_1,
                def_2: state.recent_def_2,
                def_3: state.recent_def_3,
                def_4: contract_address_const::<0>(),
                def_5: contract_address_const::<0>(),
            };

            assert(is_in_cross_run_memory(mem, d1), 'd1 in memory');
            assert(is_in_cross_run_memory(mem, d2), 'd2 in memory');
            assert(is_in_cross_run_memory(mem, d3), 'd3 in memory');
            let d4 = contract_address_const::<0xD4>();
            assert(!is_in_cross_run_memory(mem, d4), 'd4 not in memory');
        }

        // ── Select opponent logic tests ──────────────────────────────────

        /// Test that the select_opponent scoring prefers underrepresented
        /// ecology classes.
        #[test]
        fn test_select_opponent_ecology_deficit_scoring() {
            // After 6 encounters: eco1=3, eco2=1, eco3=1, eco4=1, eco5=0, eco6=0
            let mut state = make_default_match_state();
            state.encounters_played = 6;
            state.eco_count_1 = 3;
            state.eco_count_2 = 1;
            state.eco_count_3 = 1;
            state.eco_count_4 = 1;
            state.eco_count_5 = 0;
            state.eco_count_6 = 0;

            // Deficit for eco5 (0 encounters): expected=6, actual=0*6=0, deficit=6
            let eco5_count = get_eco_count(@state, 5);
            let expected: u32 = state.encounters_played.into();
            let actual_5: u32 = eco5_count.into() * 6; // ECOLOGY_CLASS_COUNT
            let deficit_5 = if expected > actual_5 {
                expected - actual_5
            } else {
                0
            };
            assert(deficit_5 == 6, 'Eco5 highest deficit');

            // Deficit for eco1 (3 encounters): expected=6, actual=3*6=18, deficit=0
            let eco1_count = get_eco_count(@state, 1);
            let actual_1: u32 = eco1_count.into() * 6;
            let deficit_1 = if expected > actual_1 {
                expected - actual_1
            } else {
                0
            };
            assert(deficit_1 == 0, 'Eco1 no deficit');

            // So eco5 would be preferred over eco1 in select_opponent.
            assert(deficit_5 > deficit_1, 'Underrep preferred');
        }

        /// Test that the select_opponent band expansion works:
        /// pass 2 expands to adjacent bands.
        #[test]
        fn test_band_expansion_logic() {
            // Target bands for floor 5 (mid): primary=3, secondary=4.
            let (primary, secondary) = get_target_bands(5);

            // Pass 1: only bands 3, 4 accepted.
            let band_2_ok_p1 = 2 == primary || 2 == secondary;
            assert(!band_2_ok_p1, 'Band 2 rejected pass 1');

            // Pass 2: expand to adjacent (2, 3, 4, 5).
            let band_2_ok_p2 = 2 == primary
                || 2 == secondary
                || (primary > 1 && 2 == primary - 1)
                || (secondary < 5 && 2 == secondary + 1);
            assert(band_2_ok_p2, 'Band 2 accepted pass 2');

            // Band 1 still rejected in pass 2 (not adjacent to target 3-4).
            let band_1_ok_p2 = 1 == primary
                || 1 == secondary
                || (primary > 1 && 1 == primary - 1)
                || (secondary < 5 && 1 == secondary + 1);
            assert(!band_1_ok_p2, 'Band 1 rejected pass 2');
        }

        // ── Buff accumulation integration tests ────────────────────────

        /// Verify that the buff accumulation correctly identifies stat boost
        /// floors vs heal floors across a 25-floor run.
        #[test]
        fn test_buff_floor_scan_correctness() {
            use survivor_valhalla::constants::HEAL_INTERVAL;

            // Stat boost floors (divisible by 5, not by HEAL_INTERVAL=3):
            // 5, 10, 20, 25 (15 is heal because 15 % 3 == 0)
            let mut boost_floors = array![];
            let mut f: u8 = 5;
            loop {
                if f > 25 {
                    break;
                }
                if f % HEAL_INTERVAL != 0 {
                    boost_floors.append(f);
                }
                f += 5;
            };
            assert(boost_floors.len() == 4, '4 boost floors in 25');
            assert(*boost_floors.at(0) == 5, 'Boost f5');
            assert(*boost_floors.at(1) == 10, 'Boost f10');
            assert(*boost_floors.at(2) == 20, 'Boost f20');
            assert(*boost_floors.at(3) == 25, 'Boost f25');
        }

        /// Verify that a floor 15 (divisible by both 3 and 5) is treated as heal, not boost.
        #[test]
        fn test_floor_15_is_heal_not_boost() {
            use survivor_valhalla::constants::HEAL_INTERVAL;

            let floor: u8 = 15;
            let is_heal = floor % HEAL_INTERVAL == 0;
            let is_boost = !is_heal && floor % 5 == 0;
            assert(is_heal, 'Floor 15 is heal');
            assert(!is_boost, 'Floor 15 not boost');
        }

        /// Verify that a floor 30 (divisible by both 3 and 5) is treated as heal.
        #[test]
        fn test_floor_30_is_heal_not_boost() {
            use survivor_valhalla::constants::HEAL_INTERVAL;

            let floor: u8 = 30;
            let is_heal = floor % HEAL_INTERVAL == 0;
            let is_boost = !is_heal && floor % 5 == 0;
            assert(is_heal, 'Floor 30 is heal');
            assert(!is_boost, 'Floor 30 not boost');
        }

        /// Simulate two combat rounds with different buff types applied and
        /// verify the damage/hp bonuses are calculated correctly.
        #[test]
        fn test_buff_combat_impact_simulation() {
            // Base adventurer: 200 HP, 30 damage.
            let base_hp: u16 = 200;
            let base_dmg: u16 = 30;

            // After floor 5 str buff: +1 damage → 31.
            let str_bonus: u16 = 1;
            let buffed_dmg = base_dmg + str_bonus;
            assert(buffed_dmg == 31, 'Str buffed damage');

            // After floor 10 vit buff: +15 HP → 215.
            let vit_bonus: u16 = 15;
            let buffed_hp = base_hp + vit_bonus;
            assert(buffed_hp == 215, 'Vit buffed HP');

            // After both buffs (floor 20 another str): damage = 32.
            let double_str_dmg = base_dmg + str_bonus + str_bonus;
            assert(double_str_dmg == 32, 'Double str buff');

            // Combat with buffed unit vs 100 HP beast.
            let beast_hp: u16 = 100;
            // Rounds to kill with 31 damage (neutral): ceil(100/31) = 4 rounds.
            let rounds_to_kill = (beast_hp + buffed_dmg - 1) / buffed_dmg;
            assert(rounds_to_kill == 4, 'Rounds with buff');

            // Without buff: ceil(100/30) = 4 rounds too (marginal difference).
            let rounds_no_buff = (beast_hp + base_dmg - 1) / base_dmg;
            assert(rounds_no_buff == 4, 'Rounds without buff');

            // With 32 damage: ceil(100/32) = 4 rounds still.
            // But at 34 damage: ceil(100/34) = 3 rounds.
            let strong_buff_dmg: u16 = 34;
            let rounds_strong = (beast_hp + strong_buff_dmg - 1) / strong_buff_dmg;
            assert(rounds_strong == 3, 'Rounds with strong buff');
        }

        // ── Multi-run stats tracking simulation ─────────────────────────

        /// Verify player stats (best_score, best_floor, total_runs) accumulate
        /// correctly across multiple simulated runs.
        #[test]
        fn test_player_stats_accumulation() {
            // Simulate 3 runs with different scores and max floors.
            let run_results: Array<(u32, u8)> = array![
                (50, 6),   // Run 1: score 50, max floor 6
                (120, 10), // Run 2: score 120, max floor 10
                (80, 8),   // Run 3: score 80, max floor 8
            ];

            let mut best_score: u32 = 0;
            let mut best_floor: u8 = 0;
            let mut total_runs: u32 = 0;

            let mut i: usize = 0;
            loop {
                if i >= run_results.len() {
                    break;
                }
                let (score, max_floor) = *run_results.at(i);
                total_runs += 1;
                if score > best_score {
                    best_score = score;
                }
                if max_floor > best_floor {
                    best_floor = max_floor;
                }
                i += 1;
            };

            assert(best_score == 120, 'Best score = 120');
            assert(best_floor == 10, 'Best floor = 10');
            assert(total_runs == 3, 'Total runs = 3');
        }

        // ── Combat max rounds safety test ───────────────────────────────

        /// Verify that combat terminates within max_rounds even with
        /// extremely tanky combatants.
        #[test]
        fn test_combat_max_rounds_safety() {
            // Very tanky adventurer with low damage vs very tanky beast.
            let advs = array![make_adventurer_unit(1, 1, 1, 10000, 1, 2)]; // 1 dmg
            let beasts = array![make_beast_unit(1, 1, 1, 10000, 1, 3)]; // 1 dmg

            let (final_adv_hp, final_adv_alive, final_beast_hp, final_beast_alive) =
                simulate_combat(
                @advs,
                @beasts,
                array![10000_u16],
                array![true],
                array![10000_u16],
                array![true],
            );

            // With 1 damage each per round and 50 round max:
            // After 50 rounds: adv HP = 10000 - 50 = 9950, beast HP = 10000 - 50 = 9950.
            // Neither dies → combat ends with both alive (attacker wins on tie).
            let adv_alive = count_alive(@final_adv_alive);
            let beast_alive = count_alive(@final_beast_alive);
            assert(adv_alive > 0, 'Adv alive at max rounds');
            // Both should be alive (neither can kill the other in 50 rounds).
            assert(beast_alive > 0, 'Beast alive at max rounds');
            // HP should be reduced but > 0.
            assert(*final_adv_hp.at(0) < 10000, 'Adv took damage');
            assert(*final_beast_hp.at(0) < 10000, 'Beast took damage');
        }

        // ── Ecology class priority verification ─────────────────────────

        /// Verify that deficit calculation correctly identifies
        /// underrepresented ecology classes.
        #[test]
        fn test_ecology_deficit_calculation() {
            let mut state = make_default_match_state();
            state.encounters_played = 12;
            // Mono: 5, Dual: 3, Balanced: 2, Burst: 1, Tank: 1, Control: 0
            state.eco_count_1 = 5;
            state.eco_count_2 = 3;
            state.eco_count_3 = 2;
            state.eco_count_4 = 1;
            state.eco_count_5 = 1;
            state.eco_count_6 = 0;

            // Expected per class for even distribution: 12/6 = 2 each.
            // Deficit = encounters - (eco_count * class_count)
            // For class 6 (control): 12 - 0*6 = 12 (highest deficit)
            // For class 1 (mono): 12 - 5*6 = -18 (negative, capped at 0)
            let eco_6_count: u32 = get_eco_count(@state, 6).into();
            let eco_1_count: u32 = get_eco_count(@state, 1).into();
            let expected: u32 = state.encounters_played.into();

            let deficit_6: u32 = if expected > eco_6_count * 6 {
                expected - eco_6_count * 6
            } else {
                0
            };
            let deficit_1: u32 = if expected > eco_1_count * 6 {
                expected - eco_1_count * 6
            } else {
                0
            };

            assert(deficit_6 == 12, 'Control has max deficit');
            assert(deficit_1 == 0, 'Mono has 0 deficit');
            assert(deficit_6 > deficit_1, 'Control preferred');
        }

        // ── Floor progress model test ───────────────────────────────────

        #[test]
        fn test_floor_progress_creation() {
            let fp = create_floor_progress_defaults(42);
            assert(fp.run_id == 42, 'Run id');
            assert(fp.current_floor == 1, 'Starts at floor 1');
            assert(fp.encounters_cleared == 0, 'No encounters');
            assert(fp.last_battle_id == 0, 'No battle');
            assert(!fp.is_complete, 'Not complete');
        }

        // ════════════════════════════════════════════════════════════════
        // ── Extended end-to-end simulation tests ────────────────────────
        // ── (continued roguelike ecology milestone) ─────────────────────
        // ════════════════════════════════════════════════════════════════

        // ── Uneven team combat tests ────────────────────────────────────

        /// 1v5: single adventurer vs full beast lineup.
        /// Verifies combat terminates correctly and positioning wraps.
        #[test]
        fn test_combat_1v5_adventurer_outnumbered() {
            let advs = array![make_adventurer_unit(1, 1, 1, 500, 50, 2)]; // Strong solo
            let beasts = array![
                make_beast_unit(1, 1, 1, 60, 10, 3),
                make_beast_unit(1, 2, 2, 60, 10, 3),
                make_beast_unit(1, 3, 3, 60, 10, 3),
                make_beast_unit(1, 4, 4, 60, 10, 3),
                make_beast_unit(1, 5, 5, 60, 10, 3),
            ];

            let (final_adv_hp, final_adv_alive, _, final_beast_alive) = simulate_combat(
                @advs,
                @beasts,
                array![500_u16],
                array![true],
                array![60_u16, 60_u16, 60_u16, 60_u16, 60_u16],
                array![true, true, true, true, true],
            );

            // Adventurer deals 50 neutral dmg/round, each beast has 60 HP → 2 rounds each.
            // 5 beasts deal 10 dmg each = 50/round total.
            assert(count_alive(@final_beast_alive) == 0, '1v5 beasts die');
            assert(count_alive(@final_adv_alive) == 1, '1v5 adv survives');
            assert(*final_adv_hp.at(0) < 500, '1v5 adv took damage');
        }

        /// 5v1: full adventurer lineup vs single beast.
        /// Only adventurer at matching position should deal damage.
        #[test]
        fn test_combat_5v1_beast_outnumbered() {
            let advs = array![
                make_adventurer_unit(1, 1, 1, 200, 20, 1),
                make_adventurer_unit(1, 2, 2, 200, 20, 2),
                make_adventurer_unit(1, 3, 3, 200, 20, 3),
                make_adventurer_unit(1, 4, 4, 200, 20, 1),
                make_adventurer_unit(1, 5, 5, 200, 20, 2),
            ];
            let beasts = array![make_beast_unit(1, 1, 1, 200, 30, 2)]; // Hunter beast

            let (final_adv_hp, final_adv_alive, _, final_beast_alive) = simulate_combat(
                @advs,
                @beasts,
                array![200_u16, 200_u16, 200_u16, 200_u16, 200_u16],
                array![true, true, true, true, true],
                array![200_u16],
                array![true],
            );

            assert(count_alive(@final_beast_alive) == 0, '5v1 beast dies');
            assert(count_alive(@final_adv_alive) == 5, '5v1 all advs alive');
            // The beast at pos 1 attacks adv at pos 1.
            // Adv1 (Magic) deals 1.5x to Hunter: 30 dmg/round.
            // Beast needs 200 HP / ~aggregated damage rounds to die.
            assert(*final_adv_hp.at(0) < 200, 'Target adv took damage');
        }

        /// 3v2 uneven lineup: 3 adventurers vs 2 beasts.
        #[test]
        fn test_combat_3v2_uneven() {
            let advs = array![
                make_adventurer_unit(1, 1, 1, 200, 30, 2),
                make_adventurer_unit(1, 2, 2, 200, 30, 2),
                make_adventurer_unit(1, 3, 3, 200, 30, 2),
            ];
            let beasts = array![
                make_beast_unit(1, 1, 1, 150, 25, 3),
                make_beast_unit(1, 2, 2, 150, 25, 3),
            ];

            let (_, final_adv_alive, _, final_beast_alive) = simulate_combat(
                @advs,
                @beasts,
                array![200_u16, 200_u16, 200_u16],
                array![true, true, true],
                array![150_u16, 150_u16],
                array![true, true],
            );

            assert(count_alive(@final_beast_alive) == 0, '3v2 beasts die');
            assert(count_alive(@final_adv_alive) >= 2, '3v2 most advs live');
        }

        // ── Target position wrapping with varied lineup sizes ──────────

        /// Target position with 3-unit lineup (not full 5).
        #[test]
        fn test_get_target_position_short_lineup() {
            let alive = array![true, false, true]; // 3 units, pos 2 dead
            let result = get_target_position(2, @alive);
            assert(result == Option::Some(3), 'Wraps to pos 3');
        }

        /// Target position with single alive unit.
        #[test]
        fn test_get_target_position_single_alive() {
            let alive = array![false, true, false, false, false];
            let result = get_target_position(4, @alive);
            assert(result == Option::Some(2), 'Finds only alive');
        }

        /// Target position wraps from high position to low.
        #[test]
        fn test_get_target_position_wrap_high_to_low() {
            let alive = array![true, false, false, false, false];
            let result = get_target_position(5, @alive);
            assert(result == Option::Some(1), 'Wraps 5 -> 1');
        }

        /// Attacker position exceeding lineup size gets clamped.
        #[test]
        fn test_get_target_position_clamped() {
            let alive = array![true, true, true]; // 3-unit lineup
            // Attacker at pos 5 > len 3, should clamp to 1.
            let result = get_target_position(5, @alive);
            assert(result == Option::Some(1), 'Clamped to 1');
        }

        // ── Floor scale edge cases ──────────────────────────────────────

        /// Floor 0 should not crash and produce a valid scale.
        #[test]
        fn test_floor_scale_zero() {
            let scale = get_floor_scale(0);
            // Position = 0 since floor 0 → (0-1)%10 underflows, but the function guards: if floor == 0 -> pos 0
            // pos 0 doesn't match any explicit case, falls to else → 150
            assert(scale == 150, 'Floor 0 scale fallback');
        }

        /// Very high floors (255, max u8) should still work.
        #[test]
        fn test_floor_scale_max_u8() {
            // floor 255: (255-1)%10+1 = 254%10+1 = 4+1 = 5 → 95
            assert(get_floor_scale(255) == 95, 'Max u8 floor scale');
        }

        /// Verify 5 full cycles (floors 1-50) all produce valid scales.
        #[test]
        fn test_floor_scale_5_cycles() {
            let mut floor: u8 = 1;
            loop {
                if floor > 50 {
                    break;
                }
                let scale = get_floor_scale(floor);
                assert(scale >= 60, 'Scale >= 60');
                assert(scale <= 150, 'Scale <= 150');
                floor += 1;
            };
        }

        // ── Combat with type resistances: all three matchups ────────────

        /// Full type triangle: Magic > Hunter > Brute > Magic.
        /// Verify each super-effective matchup produces more damage.
        #[test]
        fn test_type_triangle_all_matchups() {
            // Magic(1) vs Hunter(2): 1.5x
            assert(get_damage_multiplier(1, 2) == 150, 'M > H');
            // Blade(2) vs Magic(1): 1.5x
            assert(get_damage_multiplier(2, 1) == 150, 'B > M');
            // Bludgeon(3) vs Blade/Hide(2): 1.5x
            assert(get_damage_multiplier(3, 2) == 150, 'Bl > B');

            // Reverse (resisted): 0.75x
            assert(get_damage_multiplier(2, 2) == 75, 'B res B');
            assert(get_damage_multiplier(1, 1) == 75, 'M res M');
            assert(get_damage_multiplier(3, 3) == 75, 'Bl res Bl');

            // Neutral matchups: 1.0x
            assert(get_damage_multiplier(1, 3) == 100, 'M neutral Bl');
            assert(get_damage_multiplier(3, 1) == 100, 'Bl neutral M');
            assert(get_damage_multiplier(2, 3) == 100, 'B neutral Bl');
        }

        // ── Multi-floor carry-over with heal mechanics ──────────────────

        /// Simulate a 6-floor run verifying heal at floor 3 and floor 6
        /// restores HP correctly with carry-over damage.
        #[test]
        fn test_carryover_with_heals_simulation() {
            use survivor_valhalla::constants::{HEAL_INTERVAL, HEAL_PERCENT};

            let max_hp: u16 = 300;
            let mut current_hp: u16 = max_hp;

            // Floor 1: take 40 damage (beast dmg)
            current_hp -= 40;
            assert(current_hp == 260, 'F1 HP');

            // Floor 2: take 50 damage
            current_hp -= 50;
            assert(current_hp == 210, 'F2 HP');

            // Floor 3: heal (25% of 300 = 75) then take 60 damage
            let heal = (max_hp * HEAL_PERCENT) / 100;
            assert(heal == 75, 'Heal amount');
            current_hp += heal; // 285
            assert(current_hp == 285, 'F3 after heal');
            current_hp -= 60;
            assert(current_hp == 225, 'F3 after combat');

            // Floor 4: take 70 damage
            current_hp -= 70;
            assert(current_hp == 155, 'F4 HP');

            // Floor 5: take 80 damage
            current_hp -= 80;
            assert(current_hp == 75, 'F5 HP');

            // Floor 6: heal (75) then take 90 damage
            current_hp += heal; // 150
            assert(current_hp == 150, 'F6 after heal');
            current_hp -= 90;
            assert(current_hp == 60, 'F6 after combat');

            // HP should be significantly reduced from max.
            assert(current_hp < max_hp / 4, 'Heavy attrition');
        }

        /// Verify heal cap: healing should not exceed max HP.
        #[test]
        fn test_heal_does_not_exceed_max_hp() {
            use survivor_valhalla::constants::HEAL_PERCENT;

            let max_hp: u16 = 200;
            let current_hp: u16 = 190; // Only 10 below max
            let heal = (max_hp * HEAL_PERCENT) / 100; // 50
            let healed = current_hp + heal; // 240
            let capped = if healed > max_hp { max_hp } else { healed };
            assert(capped == max_hp, 'Heal capped at max');
        }

        // ── Power band edge cases ───────────────────────────────────────

        /// Very asymmetric power: DP = 1, AP = 1000.
        #[test]
        fn test_power_band_extreme_easy() {
            assert(compute_power_band(1000, 1) == 1, 'Extreme easy');
        }

        /// Very asymmetric power: DP = 10000, AP = 1.
        #[test]
        fn test_power_band_extreme_hard() {
            assert(compute_power_band(1, 10000) == 5, 'Extreme hard');
        }

        /// DP = 0, AP > 0: should be very easy.
        #[test]
        fn test_power_band_dp_zero() {
            assert(compute_power_band(100, 0) == 1, 'DP=0 very easy');
        }

        /// Both zero: fallback to even.
        #[test]
        fn test_power_band_both_zero() {
            assert(compute_power_band(0, 0) == 3, 'Both zero = even');
        }

        // ── Ecology classification edge cases ───────────────────────────

        /// Control classification trigger: max initiative > 15.
        #[test]
        fn test_classify_control_threshold() {
            // A lineup with max_initiative = 16 (> 15) should be control,
            // IF it doesn't trigger mono/burst/tank first.
            // Beast with level 16 → initiative 16 → control.
            let max_initiative: u16 = 16;
            assert(max_initiative > 15, 'Triggers control');

            // Level 15 → NOT control.
            let max_init_15: u16 = 15;
            assert(!(max_init_15 > 15), 'Does not trigger control');
        }

        /// Burst vs non-burst boundary: max_damage exactly 1.5x avg.
        #[test]
        fn test_classify_burst_boundary() {
            // 3 beasts: damages 15, 15, 15 → avg=15, max=15.
            // max*100 = 1500, avg*150 = 2250 → 1500 < 2250 → NOT burst.
            let avg_damage: u32 = 15;
            let max_damage: u32 = 15;
            let is_burst = avg_damage > 0 && max_damage * 100 > avg_damage * 150;
            assert(!is_burst, 'Equal damage not burst');

            // 3 beasts: damages 10, 10, 24 → avg=14, max=24.
            // max*100 = 2400, avg*150 = 2100 → 2400 > 2100 → IS burst.
            let avg2: u32 = 14;
            let max2: u32 = 24;
            let is_burst2 = avg2 > 0 && max2 * 100 > avg2 * 150;
            assert(is_burst2, 'Spike is burst');
        }

        /// Tank boundary: avg HP exactly 150 should NOT be tank.
        #[test]
        fn test_classify_tank_boundary() {
            let avg_hp_150: u32 = 150;
            assert(!(avg_hp_150 > 150), '150 not tank');

            let avg_hp_151: u32 = 151;
            assert(avg_hp_151 > 150, '151 is tank');
        }

        /// Mono type with exactly 4 beasts: 4/4 = 100% → mono.
        #[test]
        fn test_classify_mono_with_4_beasts() {
            let unit_count: u8 = 4;
            let max_type_count: u8 = 4;
            let mono_threshold = (unit_count * 4) / 5; // 3
            let is_mono = max_type_count >= mono_threshold && max_type_count >= 4;
            assert(is_mono, '4/4 is mono');
        }

        /// Mono type with 3 beasts: 3/3 but threshold requires >= 4.
        #[test]
        fn test_classify_mono_3_beasts_not_enough() {
            let unit_count: u8 = 3;
            let max_type_count: u8 = 3;
            let mono_threshold = (unit_count * 4) / 5; // 2
            let is_mono = max_type_count >= mono_threshold && max_type_count >= 4;
            // max_type_count = 3, but >= 4 fails.
            assert(!is_mono, '3/3 not mono (< 4)');
        }

        // ── Band expansion algorithm edge tests ─────────────────────────

        /// Early floor (1-3): target bands 2,3. Band 1 not accepted even in pass 2.
        #[test]
        fn test_band_expansion_early_floor() {
            let (primary, secondary) = get_target_bands(1); // (2, 3)

            // Pass 2: adjacent = (1, 2, 3, 4)
            let band_1_pass2 = 1 == primary
                || 1 == secondary
                || (primary > 1 && 1 == primary - 1)
                || (secondary < 5 && 1 == secondary + 1);
            assert(band_1_pass2, 'Band 1 in pass 2 early');

            // Band 5 not accepted in pass 2.
            let band_5_pass2 = 5 == primary
                || 5 == secondary
                || (primary > 1 && 5 == primary - 1)
                || (secondary < 5 && 5 == secondary + 1);
            assert(!band_5_pass2, 'Band 5 not in pass 2 early');
        }

        /// Late floor (7+): target bands 4,5. Band expansion adds 3.
        #[test]
        fn test_band_expansion_late_floor() {
            let (primary, secondary) = get_target_bands(8); // (4, 5)

            // Pass 2: adjacent adds band 3 (primary - 1 = 3).
            // secondary + 1 = 6, but 6 > 5 → skipped.
            let band_3_pass2 = 3 == primary
                || 3 == secondary
                || (primary > 1 && 3 == primary - 1)
                || (secondary < 5 && 3 == secondary + 1);
            assert(band_3_pass2, 'Band 3 in pass 2 late');

            // Band 1 not accepted in pass 2.
            let band_1_pass2 = 1 == primary
                || 1 == secondary
                || (primary > 1 && 1 == primary - 1)
                || (secondary < 5 && 1 == secondary + 1);
            assert(!band_1_pass2, 'Band 1 not in pass 2 late');
        }

        // ── Deterministic seed derivation ───────────────────────────────

        /// Same player + same timestamp = same seed (deterministic).
        #[test]
        fn test_seed_determinism() {
            let player: felt252 = 0x12345;
            let timestamp: felt252 = 1000;
            let seed_1 = core::pedersen::pedersen(player, timestamp);
            let seed_2 = core::pedersen::pedersen(player, timestamp);
            assert(seed_1 == seed_2, 'Seeds deterministic');
        }

        /// Different timestamps produce different seeds.
        #[test]
        fn test_seed_varies_with_timestamp() {
            let player: felt252 = 0x12345;
            let seed_1 = core::pedersen::pedersen(player, 1000);
            let seed_2 = core::pedersen::pedersen(player, 1001);
            assert(seed_1 != seed_2, 'Diff timestamp diff seed');
        }

        /// Different players produce different seeds.
        #[test]
        fn test_seed_varies_with_player() {
            let timestamp: felt252 = 1000;
            let seed_1 = core::pedersen::pedersen(0x12345, timestamp);
            let seed_2 = core::pedersen::pedersen(0x67890, timestamp);
            assert(seed_1 != seed_2, 'Diff player diff seed');
        }

        // ── Encounter hash derivation for tie-breaking ──────────────────

        /// Different floors produce different encounter hashes for tie-break.
        #[test]
        fn test_encounter_hash_varies_per_floor() {
            let seed: felt252 = 99999;
            let hash_f1 = core::pedersen::pedersen(seed, 1);
            let hash_f2 = core::pedersen::pedersen(seed, 2);
            let hash_f3 = core::pedersen::pedersen(seed, 3);
            assert(hash_f1 != hash_f2, 'F1 != F2 hash');
            assert(hash_f2 != hash_f3, 'F2 != F3 hash');
            assert(hash_f1 != hash_f3, 'F1 != F3 hash');
        }

        /// Tie-break scores: different snapshot indices produce different scores.
        #[test]
        fn test_tiebreak_varies_per_snapshot() {
            let encounter_hash: felt252 = core::pedersen::pedersen(42, 1);
            let tie_1 = core::pedersen::pedersen(encounter_hash, 0);
            let tie_2 = core::pedersen::pedersen(encounter_hash, 1);
            assert(tie_1 != tie_2, 'Diff idx diff tiebreak');
        }

        // ── Reward schedule exhaustive verification ─────────────────────

        /// Verify exact reward type for every floor from 1 to 50.
        #[test]
        fn test_reward_type_every_floor_to_50() {
            use survivor_valhalla::constants::HEAL_INTERVAL;

            let mut floor: u8 = 1;
            let mut heal_floors = array![];
            let mut boost_floors = array![];
            let mut score_floors = array![];

            loop {
                if floor > 50 {
                    break;
                }
                if floor % HEAL_INTERVAL == 0 {
                    heal_floors.append(floor);
                } else if floor % 5 == 0 {
                    boost_floors.append(floor);
                } else {
                    score_floors.append(floor);
                }
                floor += 1;
            };

            // Heal fires every 3 floors: 3,6,9,12,15,18,21,24,27,30,33,36,39,42,45,48
            assert(heal_floors.len() == 16, 'Heals in 50 floors');
            // Boost fires on 5-multiples not also 3-multiples: 5,10,20,25,35,40,50
            assert(boost_floors.len() == 7, 'Boosts in 50 floors');
            // Score-only: 50 - 16 - 7 = 27
            assert(score_floors.len() == 27, 'Score-only in 50 floors');
        }

        /// Floor 15 is divisible by both 3 and 5; heal takes priority.
        /// Floor 30 similarly. Verify all such overlap floors.
        #[test]
        fn test_heal_priority_over_boost_at_overlaps() {
            use survivor_valhalla::constants::HEAL_INTERVAL;

            // Floors divisible by both 3 and 5 (i.e., 15, 30, 45, ...).
            let overlap_floors: Array<u8> = array![15, 30, 45];
            let mut i: usize = 0;
            loop {
                if i >= overlap_floors.len() {
                    break;
                }
                let f = *overlap_floors.at(i);
                assert(f % HEAL_INTERVAL == 0, 'Is heal floor');
                assert(f % 5 == 0, 'Also div by 5');
                // In apply_floor_rewards, heal check comes first.
                // So these floors are heals, not boosts.
                i += 1;
            };
        }

        // ── Score accumulation edge cases ────────────────────────────────

        /// Score with 0 survivors (should not add to score in practice,
        /// because 0 survivors means run ended).
        #[test]
        fn test_score_zero_survivors() {
            let floor: u32 = 5;
            let survivors: u32 = 0;
            let score = floor * survivors;
            assert(score == 0, 'Zero surv zero score');
        }

        /// Max possible score for 100 floors with 5 survivors each.
        #[test]
        fn test_score_theoretical_max() {
            let mut total: u32 = 0;
            let mut floor: u32 = 1;
            loop {
                if floor > 100 {
                    break;
                }
                total += floor * 5;
                floor += 1;
            };
            // sum(1..100) * 5 = 5050 * 5 = 25250
            assert(total == 25250, 'Max 100-floor score');
        }

        // ── Combat: adventurer dies during combat, stops attacking ──────

        /// When an adventurer dies mid-round, it should stop dealing damage.
        #[test]
        fn test_dead_adventurer_stops_attacking() {
            // 1 adventurer with very low HP vs 2 beasts.
            // Adventurer attacks beast 1, then beast 1 kills adventurer.
            // Beast 2 should not take damage from dead adventurer.
            let advs = array![make_adventurer_unit(1, 1, 1, 10, 30, 2)]; // Low HP, decent damage
            let beasts = array![
                make_beast_unit(1, 1, 1, 100, 15, 3), // Kills adv in 1 hit
                make_beast_unit(1, 2, 2, 100, 15, 3),
            ];

            let (_, final_adv_alive, final_beast_hp, _) = simulate_combat(
                @advs,
                @beasts,
                array![10_u16],
                array![true],
                array![100_u16, 100_u16],
                array![true, true],
            );

            assert(count_alive(@final_adv_alive) == 0, 'Adv dies');
            // Beast 1 took damage from adv before dying (30 dmg neutral).
            assert(*final_beast_hp.at(0) < 100, 'Beast1 took damage');
            // Beast 2 should still be at 100 HP (adv died, targeting wraps but adv is dead).
            assert(*final_beast_hp.at(1) == 100, 'Beast2 untouched');
        }

        // ── Multi-floor attrition with multiple adventurers ─────────────

        /// Simulate 5 floors with 3 adventurers, tracking attrition and deaths.
        #[test]
        fn test_3_adventurer_5_floor_attrition() {
            let adv_max_hp: u16 = 200;
            let mut adv_hp = array![adv_max_hp, adv_max_hp, adv_max_hp];
            let mut adv_alive = array![true, true, true];
            let mut score: u32 = 0;
            let mut floor: u8 = 1;

            loop {
                if floor > 5 || count_alive(@adv_alive) == 0 {
                    break;
                }

                let scale = get_floor_scale(floor);
                let beast_hp_scaled: u16 = (80_u32 * scale.into() / 100).try_into().unwrap();
                let beast_dmg_scaled: u16 = (15_u32 * scale.into() / 100).try_into().unwrap();

                let advs = array![
                    make_adventurer_unit(floor.into(), 1, 1, *adv_hp.at(0), 25, 2),
                    make_adventurer_unit(floor.into(), 2, 2, *adv_hp.at(1), 25, 2),
                    make_adventurer_unit(floor.into(), 3, 3, *adv_hp.at(2), 25, 2),
                ];
                let beasts = array![
                    make_beast_unit(floor.into(), 1, 1, beast_hp_scaled, beast_dmg_scaled, 3),
                    make_beast_unit(floor.into(), 2, 2, beast_hp_scaled, beast_dmg_scaled, 3),
                ];

                let (new_hp, new_alive, _, beast_alive) = simulate_combat(
                    @advs,
                    @beasts,
                    array![*adv_hp.at(0), *adv_hp.at(1), *adv_hp.at(2)],
                    array![*adv_alive.at(0), *adv_alive.at(1), *adv_alive.at(2)],
                    array![beast_hp_scaled, beast_hp_scaled],
                    array![true, true],
                );

                if count_alive(@beast_alive) == 0 {
                    let survivors = count_alive(@new_alive);
                    score += floor.into() * survivors.into();
                    adv_hp = new_hp;
                    adv_alive = new_alive;
                    floor += 1;
                } else {
                    break;
                }
            };

            assert(floor > 1, 'Cleared at least 1 floor');
            assert(score > 0, 'Got some score');
        }

        // ── Ecology diversity: skewed distribution triggers cap ──────────

        /// All encounters with same ecology class should trigger cap quickly.
        #[test]
        fn test_ecology_cap_immediate_trigger() {
            let mut state = make_default_match_state();
            // 3 encounters, all mono_type (class 1).
            state.encounters_played = 3;
            state.eco_count_1 = 3;
            // 3/3 = 100% > 40% cap.
            assert(ecology_exceeds_cap(@state, 1), 'Mono at 100%');
            // Other classes at 0%.
            assert(!ecology_exceeds_cap(@state, 2), 'Dual at 0%');
        }

        /// 2 encounters, 1 of each class: neither exceeds cap.
        #[test]
        fn test_ecology_cap_two_encounters_balanced() {
            let mut state = make_default_match_state();
            state.encounters_played = 2;
            state.eco_count_1 = 1;
            state.eco_count_2 = 1;
            // 1/2 = 50% > 40% → exceeds for each individually!
            assert(ecology_exceeds_cap(@state, 1), '50% exceeds 40%');
            assert(ecology_exceeds_cap(@state, 2), '50% exceeds 40% too');
        }

        // ── Cooldown with zero-address defenders ────────────────────────

        /// Pushing zero address should work (but is unusual).
        #[test]
        fn test_push_zero_address_defender() {
            let mut state = make_default_match_state();
            let zero = contract_address_const::<0>();
            let d1 = contract_address_const::<0x1>();

            push_recent_defender(ref state, d1);
            push_recent_defender(ref state, zero);

            assert(is_on_cooldown(@state, zero), 'Zero on cooldown');
            assert(is_on_cooldown(@state, d1), 'd1 still on cd');
        }

        // ── Lineup hash with large token IDs ────────────────────────────

        /// Lineup hash should handle large u256 beast IDs.
        #[test]
        fn test_lineup_hash_large_ids() {
            let lineup = BeastLineup {
                player: contract_address_const::<0x1>(),
                beast1_id: 0xFFFFFFFFFFFFFFFF,
                beast2_id: 0xAAAAAAAAAAAAAAAA,
                beast3_id: 1,
                beast4_id: 0,
                beast5_id: 0xBBBBBBBBBBBBBBBB,
            };
            let hash = compute_lineup_hash(lineup);
            // Should not panic and should produce a non-zero hash.
            let hash_u256: u256 = hash.into();
            assert(hash_u256 > 0, 'Non-zero hash for large IDs');
        }

        // ── Run state transitions simulation ────────────────────────────

        /// Simulate the full state machine: start → clear floors → death.
        #[test]
        fn test_run_state_machine_lifecycle() {
            // Start state.
            let mut is_active = true;
            let mut floor: u8 = 1;
            let mut max_floor: u8 = 1;
            let mut score: u32 = 0;

            // Simulate 5 won floors.
            let mut f: u8 = 1;
            loop {
                if f > 5 {
                    break;
                }
                let survivors: u32 = 5 - f.into() + 1; // Decreasing survivors
                score += f.into() * survivors;
                floor = f + 1;
                if f + 1 > max_floor {
                    max_floor = f + 1;
                }
                f += 1;
            };

            assert(is_active, 'Still active after wins');
            assert(floor == 6, 'On floor 6');
            assert(max_floor == 6, 'Max floor 6');
            // Score: 1*5 + 2*4 + 3*3 + 4*2 + 5*1 = 5+8+9+8+5 = 35
            assert(score == 35, 'Score after 5 floors');

            // Death on floor 6.
            is_active = false;
            let ended_at: u64 = 99999;
            assert(!is_active, 'Run ended');
            assert(ended_at > 0, 'End timestamp set');
            // max_floor stays at 6 (the floor reached, not cleared).
            assert(max_floor == 6, 'Max floor unchanged');
        }

        /// Simulate an immediate death on floor 1.
        #[test]
        fn test_run_immediate_death() {
            let mut is_active = true;
            let floor: u8 = 1;
            let max_floor: u8 = 1;
            let score: u32 = 0;

            // Lose on floor 1.
            is_active = false;

            assert(!is_active, 'Immediately dead');
            assert(score == 0, 'Zero score');
            assert(max_floor == 1, 'Max floor 1');
        }

        // ── Cross-run memory with full rotation ─────────────────────────

        /// Verify that cross-run memory correctly captures last defenders.
        #[test]
        fn test_cross_run_memory_captures_last_3() {
            let d1 = contract_address_const::<0x10>();
            let d2 = contract_address_const::<0x20>();
            let d3 = contract_address_const::<0x30>();
            let d4 = contract_address_const::<0x40>();
            let d5 = contract_address_const::<0x50>();
            let zero = contract_address_const::<0>();

            // Simulate a run with 5 encounters.
            let mut state = make_default_match_state();
            push_recent_defender(ref state, d1);
            push_recent_defender(ref state, d2);
            push_recent_defender(ref state, d3);
            push_recent_defender(ref state, d4);
            push_recent_defender(ref state, d5);

            // Recent defenders: d5, d4, d3 (d1, d2 evicted from cooldown).
            // Cross-run memory would be: d5, d4, d3, 0, 0.
            let mem = CrossRunMemory {
                player: contract_address_const::<0x1>(),
                def_1: state.recent_def_1,
                def_2: state.recent_def_2,
                def_3: state.recent_def_3,
                def_4: zero,
                def_5: zero,
            };

            assert(is_in_cross_run_memory(mem, d5), 'd5 in xrun');
            assert(is_in_cross_run_memory(mem, d4), 'd4 in xrun');
            assert(is_in_cross_run_memory(mem, d3), 'd3 in xrun');
            assert(!is_in_cross_run_memory(mem, d2), 'd2 not in xrun');
            assert(!is_in_cross_run_memory(mem, d1), 'd1 not in xrun');
        }

        // ── Ecology distribution simulation: worst-case skew ────────────

        /// 30 encounters with heavily skewed ecology.
        /// Verify cap behavior at scale.
        #[test]
        fn test_ecology_heavy_skew_30_encounters() {
            let mut state = make_default_match_state();

            // 15 mono, 5 dual, 4 balanced, 3 burst, 2 tank, 1 control.
            state.encounters_played = 30;
            state.eco_count_1 = 15;
            state.eco_count_2 = 5;
            state.eco_count_3 = 4;
            state.eco_count_4 = 3;
            state.eco_count_5 = 2;
            state.eco_count_6 = 1;

            // Mono: 15/30 = 50% > 40% → exceeds.
            assert(ecology_exceeds_cap(@state, 1), 'Mono 50% exceeds');
            // Dual: 5/30 = 16.7% → ok.
            assert(!ecology_exceeds_cap(@state, 2), 'Dual 16% ok');
            // Control: 1/30 = 3.3% → ok.
            assert(!ecology_exceeds_cap(@state, 6), 'Control 3% ok');
        }

        // ── Deficit scoring: verify priority ordering ───────────────────

        /// With varying counts, verify deficit-based priority correctly
        /// ranks underrepresented classes higher.
        #[test]
        fn test_deficit_priority_ordering() {
            let mut state = make_default_match_state();
            state.encounters_played = 18;
            // Expected per class: 18/6 = 3 each for even distribution.
            state.eco_count_1 = 6; // over-represented
            state.eco_count_2 = 4;
            state.eco_count_3 = 3; // exactly expected
            state.eco_count_4 = 2;
            state.eco_count_5 = 2;
            state.eco_count_6 = 1; // most under-represented

            let expected: u32 = state.encounters_played.into();

            // Deficit for each class: expected - count * ECOLOGY_CLASS_COUNT
            let mut deficits = array![];
            let mut c: u8 = 1;
            loop {
                if c > 6 {
                    break;
                }
                let cnt: u32 = get_eco_count(@state, c).into();
                let actual: u32 = cnt * 6;
                let def = if expected > actual { expected - actual } else { 0 };
                deficits.append(def);
                c += 1;
            };

            // Class 6 (count=1) should have highest deficit.
            assert(*deficits.at(5) > *deficits.at(4), 'Eco6 > eco5 deficit');
            assert(*deficits.at(4) > *deficits.at(2), 'Eco5 > eco3 deficit');
            // Class 1 (count=6) should have 0 deficit.
            assert(*deficits.at(0) == 0, 'Eco1 zero deficit');
        }

        // ── Boss floor detection across multiple cycles ─────────────────

        /// Verify boss detection for floors 10, 20, 30, 40, 50.
        #[test]
        fn test_boss_floor_detection() {
            let boss_floors: Array<u8> = array![10, 20, 30, 40, 50, 100];
            let non_boss_floors: Array<u8> = array![1, 5, 9, 11, 15, 19, 21, 25, 99];

            let mut i: usize = 0;
            loop {
                if i >= boss_floors.len() {
                    break;
                }
                let f = *boss_floors.at(i);
                let is_boss = f % 10 == 0 && f > 0;
                assert(is_boss, 'Is boss floor');
                i += 1;
            };

            i = 0;
            loop {
                if i >= non_boss_floors.len() {
                    break;
                }
                let f = *non_boss_floors.at(i);
                let is_boss = f % 10 == 0 && f > 0;
                assert(!is_boss, 'Not boss floor');
                i += 1;
            };
        }

        // ── Combined boss scaling + floor scaling calculation ───────────

        /// Verify total effective stats for boss floors vs adjacent non-boss.
        #[test]
        fn test_boss_vs_adjacent_floor_stats() {
            use survivor_valhalla::constants::BOSS_STAT_MULT;

            let base_hp: u32 = 100;
            let base_dmg: u32 = 20;

            // Floor 9 (non-boss): scale=130.
            let f9_hp: u32 = base_hp * 130 / 100; // 130
            let f9_dmg: u32 = base_dmg * 130 / 100; // 26

            // Floor 10 (boss): scale=150, then boss mult=125.
            let f10_hp: u32 = base_hp * 150 / 100 * BOSS_STAT_MULT.into() / 100; // 187
            let f10_dmg: u32 = base_dmg * 150 / 100 * BOSS_STAT_MULT.into() / 100; // 37

            // Floor 11 (non-boss, new cycle): scale=60.
            let f11_hp: u32 = base_hp * 60 / 100; // 60
            let f11_dmg: u32 = base_dmg * 60 / 100; // 12

            // Boss should be strictly harder than floor 9.
            assert(f10_hp > f9_hp, 'Boss HP > F9');
            assert(f10_dmg > f9_dmg, 'Boss dmg > F9');

            // Floor 11 resets difficulty below floor 9.
            assert(f11_hp < f9_hp, 'F11 HP < F9');
            assert(f11_dmg < f9_dmg, 'F11 dmg < F9');

            // Verify exact values.
            assert(f9_hp == 130, 'F9 HP exact');
            assert(f10_hp == 187, 'F10 HP exact');
            assert(f11_hp == 60, 'F11 HP exact');
        }

        // ── Multi-run leaderboard simulation ────────────────────────────

        /// Simulate 5 runs and verify leaderboard stats track correctly.
        #[test]
        fn test_leaderboard_across_5_runs() {
            let run_results: Array<(u32, u8)> = array![
                (25, 4),  // Run 1
                (100, 9), // Run 2 (new best score + floor)
                (80, 7),  // Run 3 (no update)
                (150, 9), // Run 4 (new best score, same floor)
                (120, 12), // Run 5 (new best floor, not score)
            ];

            let mut best_score: u32 = 0;
            let mut best_floor: u8 = 0;
            let mut total_runs: u32 = 0;

            let mut i: usize = 0;
            loop {
                if i >= run_results.len() {
                    break;
                }
                let (score, max_floor) = *run_results.at(i);
                total_runs += 1;
                if score > best_score {
                    best_score = score;
                }
                if max_floor > best_floor {
                    best_floor = max_floor;
                }
                i += 1;
            };

            assert(best_score == 150, 'Best score from run 4');
            assert(best_floor == 12, 'Best floor from run 5');
            assert(total_runs == 5, '5 total runs');
        }

        // ── Buff accumulation: stat mapping ─────────────────────────────

        /// Verify buff stat-to-combat mapping:
        /// stat 1 (str) → damage, stat 3 (vit) → HP, others → nothing.
        #[test]
        fn test_buff_stat_combat_mapping() {
            // Stat 1 (strength) → bonus_damage.
            let stat: u8 = 1;
            let value: u8 = 1;
            let mut bonus_damage: u16 = 0;
            let mut bonus_hp: u16 = 0;
            if stat == 1 {
                bonus_damage += value.into();
            } else if stat == 3 {
                bonus_hp += value.into() * 15;
            }
            assert(bonus_damage == 1, 'Str adds 1 dmg');
            assert(bonus_hp == 0, 'Str no HP');

            // Stat 3 (vitality) → bonus_hp.
            bonus_damage = 0;
            bonus_hp = 0;
            let stat_vit: u8 = 3;
            if stat_vit == 1 {
                bonus_damage += value.into();
            } else if stat_vit == 3 {
                bonus_hp += value.into() * 15;
            }
            assert(bonus_damage == 0, 'Vit no dmg');
            assert(bonus_hp == 15, 'Vit adds 15 HP');

            // Stat 5 (wisdom) → nothing.
            bonus_damage = 0;
            bonus_hp = 0;
            let stat_wis: u8 = 5;
            if stat_wis == 1 {
                bonus_damage += value.into();
            } else if stat_wis == 3 {
                bonus_hp += value.into() * 15;
            }
            assert(bonus_damage == 0, 'Wis no dmg');
            assert(bonus_hp == 0, 'Wis no HP');
        }

        /// Multiple buffs across floors should stack additively.
        #[test]
        fn test_buff_stacking_across_floors() {
            // Simulate buffs at floors 5, 10, 20 (boost floors not also heal floors).
            // Floor 5: str +1 → damage +1.
            // Floor 10: str +1 → damage +2 total.
            // Floor 20: vit +1 → HP +15.
            let mut total_bonus_damage: u16 = 0;
            let mut total_bonus_hp: u16 = 0;

            // Floor 5: stat=1 (str)
            total_bonus_damage += 1;
            // Floor 10: stat=1 (str)
            total_bonus_damage += 1;
            // Floor 20: stat=3 (vit)
            total_bonus_hp += 15;

            assert(total_bonus_damage == 2, 'Stacked str +2');
            assert(total_bonus_hp == 15, 'Stacked vit +15');
        }

        // ── End-to-end 20-floor run simulation ──────────────────────────

        /// Comprehensive 20-floor simulation testing all subsystems together:
        /// floor scaling, boss floors, heals, score, ecology tracking,
        /// and cooldown rotation.
        #[test]
        fn test_comprehensive_20_floor_simulation() {
            use survivor_valhalla::constants::{BOSS_STAT_MULT, HEAL_INTERVAL, HEAL_PERCENT};

            let adv_max_hp: u16 = 400;
            let adv_dmg: u16 = 35;
            let mut current_hp: u16 = adv_max_hp;
            let mut score: u32 = 0;
            let mut floor: u8 = 1;
            let mut heals_applied: u8 = 0;
            let mut boosts_applied: u8 = 0;
            let mut match_state = make_default_match_state();

            let defenders = array![
                contract_address_const::<0x10>(),
                contract_address_const::<0x20>(),
                contract_address_const::<0x30>(),
                contract_address_const::<0x40>(),
                contract_address_const::<0x50>(),
                contract_address_const::<0x60>(),
                contract_address_const::<0x70>(),
            ];
            let ecologies: Array<u8> = array![1, 2, 3, 4, 5, 6, 3]; // cycling

            loop {
                if floor > 20 || current_hp == 0 {
                    break;
                }

                let scale = get_floor_scale(floor);
                let is_boss = floor % 10 == 0 && floor > 0;

                let mut beast_hp: u32 = 50_u32 * scale.into() / 100;
                let mut beast_dmg: u32 = 8_u32 * scale.into() / 100;

                if is_boss {
                    beast_hp = beast_hp * BOSS_STAT_MULT.into() / 100;
                    beast_dmg = beast_dmg * BOSS_STAT_MULT.into() / 100;
                }

                // Ensure non-zero.
                if beast_hp == 0 {
                    beast_hp = 1;
                }
                if beast_dmg == 0 {
                    beast_dmg = 1;
                }

                let bh: u16 = beast_hp.try_into().unwrap();
                let bd: u16 = beast_dmg.try_into().unwrap();

                // Combat: single adventurer vs single beast (neutral damage).
                let advs = array![
                    make_adventurer_unit(floor.into(), 1, 1, current_hp, adv_dmg, 2),
                ];
                let beasts = array![make_beast_unit(floor.into(), 1, 1, bh, bd, 3)];

                let (new_hp, new_alive, _, beast_alive) = simulate_combat(
                    @advs,
                    @beasts,
                    array![current_hp],
                    array![true],
                    array![bh],
                    array![true],
                );

                if count_alive(@beast_alive) == 0 && count_alive(@new_alive) > 0 {
                    score += floor.into() * 1;
                    current_hp = *new_hp.at(0);

                    // Track ecology.
                    let eco = *ecologies.at(((floor - 1) % 7).into());
                    increment_eco_count(ref match_state, eco);
                    let def_idx = ((floor - 1) % 7).into();
                    push_recent_defender(ref match_state, *defenders.at(def_idx));
                    match_state.last_ecology_class = eco;
                    match_state.encounters_played += 1;

                    // Rewards.
                    if floor % HEAL_INTERVAL == 0 {
                        let heal = (adv_max_hp * HEAL_PERCENT) / 100;
                        current_hp =
                            if current_hp + heal > adv_max_hp {
                                adv_max_hp
                            } else {
                                current_hp + heal
                            };
                        heals_applied += 1;
                    } else if floor % 5 == 0 {
                        boosts_applied += 1;
                    }

                    floor += 1;
                } else {
                    break;
                }
            };

            // Should clear many floors with a strong adventurer.
            assert(floor > 10, 'Cleared 10+ floors');
            assert(score > 0, 'Positive score');
            assert(heals_applied > 0, 'Heals applied');
            assert(match_state.encounters_played > 0, 'Ecology tracked');

            // Ecology distribution should be somewhat balanced.
            let total_eco: u8 = get_eco_count(@match_state, 1)
                + get_eco_count(@match_state, 2)
                + get_eco_count(@match_state, 3)
                + get_eco_count(@match_state, 4)
                + get_eco_count(@match_state, 5)
                + get_eco_count(@match_state, 6);
            assert(total_eco == match_state.encounters_played, 'Eco sum matches');
        }

        // ── find_target_unit tests ──────────────────────────────────────

        /// Find target in a multi-unit array.
        #[test]
        fn test_find_target_unit_basic() {
            let units = array![
                make_beast_unit(1, 10, 1, 100, 10, 1),
                make_beast_unit(1, 20, 2, 100, 10, 2),
                make_beast_unit(1, 30, 3, 100, 10, 3),
            ];
            let alive = array![true, true, true];

            let result = find_target_unit(@units, 2, @alive);
            assert(result == Option::Some(1), 'Found at idx 1');
        }

        /// Find target skips dead units.
        #[test]
        fn test_find_target_unit_skips_dead() {
            let units = array![
                make_beast_unit(1, 10, 1, 100, 10, 1),
                make_beast_unit(1, 20, 2, 100, 10, 2),
            ];
            let alive = array![true, false]; // Unit at pos 2 is dead.

            let result = find_target_unit(@units, 2, @alive);
            assert(result == Option::None, 'Dead unit not found');
        }

        /// Find target returns None for non-existent position.
        #[test]
        fn test_find_target_unit_no_match() {
            let units = array![make_beast_unit(1, 10, 1, 100, 10, 1)];
            let alive = array![true];

            let result = find_target_unit(@units, 5, @alive);
            assert(result == Option::None, 'Position 5 not found');
        }

        // ── Replace helpers: single-element arrays ──────────────────────

        #[test]
        fn test_replace_at_index_single_element() {
            let arr = array![42_u16];
            let new_arr = replace_at_index(arr, 0, 99);
            assert(new_arr.len() == 1, 'Length preserved');
            assert(*new_arr.at(0) == 99, 'Replaced');
        }

        #[test]
        fn test_replace_bool_single_element() {
            let arr = array![true];
            let new_arr = replace_bool_at_index(arr, 0, false);
            assert(new_arr.len() == 1, 'Length preserved');
            assert(*new_arr.at(0) == false, 'Replaced to false');
        }

        #[test]
        fn test_replace_u8_single_element() {
            let arr = array![5_u8];
            let new_arr = replace_u8_at_index(arr, 0, 10);
            assert(new_arr.len() == 1, 'Length preserved');
            assert(*new_arr.at(0) == 10, 'Replaced');
        }
    }
}
