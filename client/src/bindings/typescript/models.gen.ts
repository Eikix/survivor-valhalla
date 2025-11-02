// @ts-nocheck
import type { SchemaType as ISchemaType } from "@dojoengine/sdk";

import { BigNumberish } from 'starknet';

// Type definition for `survivor_valhalla::models::AdventurerWeapon` struct
export interface AdventurerWeapon {
	player: string;
	adventurer_id: BigNumberish;
	weapon_type: BigNumberish;
	weapon_power: BigNumberish;
}

// Type definition for `survivor_valhalla::models::AttackLineup` struct
export interface AttackLineup {
	player: string;
	adventurer1_id: BigNumberish;
	adventurer2_id: BigNumberish;
	adventurer3_id: BigNumberish;
	adventurer4_id: BigNumberish;
	adventurer5_id: BigNumberish;
}

// Type definition for `survivor_valhalla::models::Battle` struct
export interface Battle {
	battle_id: BigNumberish;
	attacker: string;
	defender: string;
	winner: string;
	timestamp: BigNumberish;
}

// Type definition for `survivor_valhalla::models::BattleState` struct
export interface BattleState {
	battle_id: BigNumberish;
	attacker: string;
	defender: string;
	round: BigNumberish;
	turn: BigNumberish;
	attacker_wins: BigNumberish;
	defender_wins: BigNumberish;
	is_complete: boolean;
}

// Type definition for `survivor_valhalla::models::Beast` struct
export interface Beast {
	player: string;
	position: BigNumberish;
	token_id: BigNumberish;
	beast_id: BigNumberish;
	level: BigNumberish;
	health: BigNumberish;
	beast_type: BigNumberish;
	tier: BigNumberish;
}

// Type definition for `survivor_valhalla::models::BeastLineup` struct
export interface BeastLineup {
	player: string;
	beast1_id: BigNumberish;
	beast2_id: BigNumberish;
	beast3_id: BigNumberish;
	beast4_id: BigNumberish;
	beast5_id: BigNumberish;
}

// Type definition for `survivor_valhalla::models::CachedAdventurer` struct
export interface CachedAdventurer {
	player: string;
	adventurer_id: BigNumberish;
	health: BigNumberish;
	level: BigNumberish;
	strength: BigNumberish;
	dexterity: BigNumberish;
	vitality: BigNumberish;
	intelligence: BigNumberish;
	wisdom: BigNumberish;
	charisma: BigNumberish;
	luck: BigNumberish;
}

// Type definition for `survivor_valhalla::models::CombatUnit` struct
export interface CombatUnit {
	battle_id: BigNumberish;
	unit_id: BigNumberish;
	position: BigNumberish;
	is_adventurer: boolean;
	current_hp: BigNumberish;
	max_hp: BigNumberish;
	damage: BigNumberish;
	initiative: BigNumberish;
	weapon_type: BigNumberish;
	beast_type: BigNumberish;
	is_alive: boolean;
}

// Type definition for `survivor_valhalla::models::PlayerEnergy` struct
export interface PlayerEnergy {
	player: string;
	energy: BigNumberish;
	last_refill_time: BigNumberish;
}

// Type definition for `survivor_valhalla::systems::battle_actions::battle_actions::BattleCompleted` struct
export interface BattleCompleted {
	battle_id: BigNumberish;
	attacker: string;
	defender: string;
	winner: string;
	timestamp: BigNumberish;
}

// Type definition for `survivor_valhalla::systems::battle_actions::battle_actions::DamageDealt` struct
export interface DamageDealt {
	battle_id: BigNumberish;
	round: BigNumberish;
	attacker_id: BigNumberish;
	target_id: BigNumberish;
	damage: BigNumberish;
	type_multiplier: BigNumberish;
}

// Type definition for `survivor_valhalla::systems::battle_actions::battle_actions::EnergyConsumed` struct
export interface EnergyConsumed {
	player: string;
	energy_remaining: BigNumberish;
	timestamp: BigNumberish;
}

// Type definition for `survivor_valhalla::systems::battle_actions::battle_actions::RoundCompleted` struct
export interface RoundCompleted {
	battle_id: BigNumberish;
	round: BigNumberish;
	winner: string;
	attacker_survivors: BigNumberish;
	defender_survivors: BigNumberish;
}

// Type definition for `survivor_valhalla::systems::battle_actions::battle_actions::UnitDefeated` struct
export interface UnitDefeated {
	battle_id: BigNumberish;
	round: BigNumberish;
	unit_id: BigNumberish;
	is_adventurer: boolean;
	position: BigNumberish;
}

// Type definition for `survivor_valhalla::systems::beast_actions::beast_actions::BeastLineupRegistered` struct
export interface BeastLineupRegistered {
	player: string;
	beast1_id: BigNumberish;
	beast2_id: BigNumberish;
	beast3_id: BigNumberish;
	beast4_id: BigNumberish;
	beast5_id: BigNumberish;
}

// Type definition for `survivor_valhalla::systems::beast_actions::beast_actions::BeastSwapped` struct
export interface BeastSwapped {
	player: string;
	position: BigNumberish;
	new_beast_id: BigNumberish;
}

export interface SchemaType extends ISchemaType {
	survivor_valhalla: {
		AdventurerWeapon: AdventurerWeapon,
		AttackLineup: AttackLineup,
		Battle: Battle,
		BattleState: BattleState,
		Beast: Beast,
		BeastLineup: BeastLineup,
		CachedAdventurer: CachedAdventurer,
		CombatUnit: CombatUnit,
		PlayerEnergy: PlayerEnergy,
		BattleCompleted: BattleCompleted,
		DamageDealt: DamageDealt,
		EnergyConsumed: EnergyConsumed,
		RoundCompleted: RoundCompleted,
		UnitDefeated: UnitDefeated,
		BeastLineupRegistered: BeastLineupRegistered,
		BeastSwapped: BeastSwapped,
	},
}
export const schema: SchemaType = {
	survivor_valhalla: {
		AdventurerWeapon: {
			player: "",
			adventurer_id: 0,
			weapon_type: 0,
			weapon_power: 0,
		},
		AttackLineup: {
			player: "",
			adventurer1_id: 0,
			adventurer2_id: 0,
			adventurer3_id: 0,
			adventurer4_id: 0,
			adventurer5_id: 0,
		},
		Battle: {
			battle_id: 0,
			attacker: "",
			defender: "",
			winner: "",
			timestamp: 0,
		},
		BattleState: {
			battle_id: 0,
			attacker: "",
			defender: "",
			round: 0,
			turn: 0,
			attacker_wins: 0,
			defender_wins: 0,
			is_complete: false,
		},
		Beast: {
			player: "",
			position: 0,
		token_id: 0,
			beast_id: 0,
			level: 0,
			health: 0,
			beast_type: 0,
			tier: 0,
		},
		BeastLineup: {
			player: "",
		beast1_id: 0,
		beast2_id: 0,
		beast3_id: 0,
		beast4_id: 0,
		beast5_id: 0,
		},
		CachedAdventurer: {
			player: "",
			adventurer_id: 0,
			health: 0,
			level: 0,
			strength: 0,
			dexterity: 0,
			vitality: 0,
			intelligence: 0,
			wisdom: 0,
			charisma: 0,
			luck: 0,
		},
		CombatUnit: {
			battle_id: 0,
			unit_id: 0,
			position: 0,
			is_adventurer: false,
			current_hp: 0,
			max_hp: 0,
			damage: 0,
			initiative: 0,
			weapon_type: 0,
			beast_type: 0,
			is_alive: false,
		},
		PlayerEnergy: {
			player: "",
			energy: 0,
			last_refill_time: 0,
		},
		BattleCompleted: {
			battle_id: 0,
			attacker: "",
			defender: "",
			winner: "",
			timestamp: 0,
		},
		DamageDealt: {
			battle_id: 0,
			round: 0,
			attacker_id: 0,
			target_id: 0,
			damage: 0,
			type_multiplier: 0,
		},
		EnergyConsumed: {
			player: "",
			energy_remaining: 0,
			timestamp: 0,
		},
		RoundCompleted: {
			battle_id: 0,
			round: 0,
			winner: "",
			attacker_survivors: 0,
			defender_survivors: 0,
		},
		UnitDefeated: {
			battle_id: 0,
			round: 0,
			unit_id: 0,
			is_adventurer: false,
			position: 0,
		},
		BeastLineupRegistered: {
			player: "",
		beast1_id: 0,
		beast2_id: 0,
		beast3_id: 0,
		beast4_id: 0,
		beast5_id: 0,
		},
		BeastSwapped: {
			player: "",
			position: 0,
		new_beast_id: 0,
		},
	},
};
export enum ModelsMapping {
	AdventurerWeapon = 'survivor_valhalla-AdventurerWeapon',
	AttackLineup = 'survivor_valhalla-AttackLineup',
	Battle = 'survivor_valhalla-Battle',
	BattleState = 'survivor_valhalla-BattleState',
	Beast = 'survivor_valhalla-Beast',
	BeastLineup = 'survivor_valhalla-BeastLineup',
	CachedAdventurer = 'survivor_valhalla-CachedAdventurer',
	CombatUnit = 'survivor_valhalla-CombatUnit',
	PlayerEnergy = 'survivor_valhalla-PlayerEnergy',
	BattleCompleted = 'survivor_valhalla-BattleCompleted',
	DamageDealt = 'survivor_valhalla-DamageDealt',
	EnergyConsumed = 'survivor_valhalla-EnergyConsumed',
	RoundCompleted = 'survivor_valhalla-RoundCompleted',
	UnitDefeated = 'survivor_valhalla-UnitDefeated',
	BeastLineupRegistered = 'survivor_valhalla-BeastLineupRegistered',
	BeastSwapped = 'survivor_valhalla-BeastSwapped',
}
