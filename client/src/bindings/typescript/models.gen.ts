// @ts-nocheck
import type { SchemaType as ISchemaType } from "@dojoengine/sdk";

import { BigNumberish } from "starknet";

// Type definition for `survivor_valhalla::models::BeastLineup` struct
export interface BeastLineup {
  player: string;
  beast1_id: BigNumberish;
  beast2_id: BigNumberish;
  beast3_id: BigNumberish;
  beast4_id: BigNumberish;
  beast5_id: BigNumberish;
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

// Type definition for `survivor_valhalla::models::AttackLineup` struct
export interface AttackLineup {
  player: string;
  adventurer1_id: BigNumberish;
  adventurer2_id: BigNumberish;
  adventurer3_id: BigNumberish;
  adventurer4_id: BigNumberish;
  adventurer5_id: BigNumberish;
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

export interface SchemaType extends ISchemaType {
  survivor_valhalla: {
    BeastLineup: BeastLineup;
    BeastLineupRegistered: BeastLineupRegistered;
    BeastSwapped: BeastSwapped;
    AttackLineup: AttackLineup;
    CachedAdventurer: CachedAdventurer;
  };
}
export const schema: SchemaType = {
  survivor_valhalla: {
    BeastLineup: {
      player: "",
      beast1_id: 0,
      beast2_id: 0,
      beast3_id: 0,
      beast4_id: 0,
      beast5_id: 0,
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
    AttackLineup: {
      player: "",
      adventurer1_id: 0,
      adventurer2_id: 0,
      adventurer3_id: 0,
      adventurer4_id: 0,
      adventurer5_id: 0,
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
  },
};
export enum ModelsMapping {
  BeastLineup = "survivor_valhalla-BeastLineup",
  BeastLineupRegistered = "survivor_valhalla-BeastLineupRegistered",
  BeastSwapped = "survivor_valhalla-BeastSwapped",
  AttackLineup = "survivor_valhalla-AttackLineup",
  CachedAdventurer = "survivor_valhalla-CachedAdventurer",
}
