import type { SchemaType as ISchemaType } from "@dojoengine/sdk";

import { BigNumberish } from 'starknet';

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

// Type definition for `survivor_valhalla::systems::battle_actions::battle_actions::EnergyConsumed` struct
export interface EnergyConsumed {
	player: string;
	energy_remaining: BigNumberish;
	timestamp: BigNumberish;
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
		AttackLineup: AttackLineup,
		Battle: Battle,
		Beast: Beast,
		BeastLineup: BeastLineup,
		CachedAdventurer: CachedAdventurer,
		PlayerEnergy: PlayerEnergy,
		BattleCompleted: BattleCompleted,
		EnergyConsumed: EnergyConsumed,
		BeastLineupRegistered: BeastLineupRegistered,
		BeastSwapped: BeastSwapped,
	},
}
export const schema: SchemaType = {
	survivor_valhalla: {
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
		EnergyConsumed: {
			player: "",
			energy_remaining: 0,
			timestamp: 0,
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
	AttackLineup = 'survivor_valhalla-AttackLineup',
	Battle = 'survivor_valhalla-Battle',
	Beast = 'survivor_valhalla-Beast',
	BeastLineup = 'survivor_valhalla-BeastLineup',
	CachedAdventurer = 'survivor_valhalla-CachedAdventurer',
	PlayerEnergy = 'survivor_valhalla-PlayerEnergy',
	BattleCompleted = 'survivor_valhalla-BattleCompleted',
	EnergyConsumed = 'survivor_valhalla-EnergyConsumed',
	BeastLineupRegistered = 'survivor_valhalla-BeastLineupRegistered',
	BeastSwapped = 'survivor_valhalla-BeastSwapped',
}