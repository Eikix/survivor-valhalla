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

export interface SchemaType extends ISchemaType {
  survivor_valhalla: {
    BeastLineup: BeastLineup;
    BeastLineupRegistered: BeastLineupRegistered;
    BeastSwapped: BeastSwapped;
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
  },
};
export enum ModelsMapping {
  BeastLineup = "survivor_valhalla-BeastLineup",
  BeastLineupRegistered = "survivor_valhalla-BeastLineupRegistered",
  BeastSwapped = "survivor_valhalla-BeastSwapped",
}
