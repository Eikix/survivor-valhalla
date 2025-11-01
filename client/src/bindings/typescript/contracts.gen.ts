// @ts-nocheck
import { DojoProvider, DojoCall } from "@dojoengine/core";
import {
  Account,
  AccountInterface,
  BigNumberish,
  CairoOption,
  CairoCustomEnum,
} from "starknet";
import * as models from "./models.gen";

export function setupWorld(provider: DojoProvider) {
  const build_beast_actions_register_calldata = (
    beast1Id: BigNumberish,
    beast2Id: BigNumberish,
    beast3Id: BigNumberish,
    beast4Id: BigNumberish,
    beast5Id: BigNumberish,
  ): DojoCall => {
    return {
      contractName: "beast_actions",
      entrypoint: "register",
      calldata: [beast1Id, beast2Id, beast3Id, beast4Id, beast5Id],
    };
  };

  const beast_actions_register = async (
    snAccount: Account | AccountInterface,
    beast1Id: BigNumberish,
    beast2Id: BigNumberish,
    beast3Id: BigNumberish,
    beast4Id: BigNumberish,
    beast5Id: BigNumberish,
  ) => {
    try {
      return await provider.execute(
        snAccount,
        build_beast_actions_register_calldata(
          beast1Id,
          beast2Id,
          beast3Id,
          beast4Id,
          beast5Id,
        ),
        "survivor_valhalla",
      );
    } catch (error) {
      console.error(error);
      throw error;
    }
  };

  const build_beast_actions_swap_calldata = (
    position: BigNumberish,
    newBeastId: BigNumberish,
  ): DojoCall => {
    return {
      contractName: "beast_actions",
      entrypoint: "swap",
      calldata: [position, newBeastId],
    };
  };

  const beast_actions_swap = async (
    snAccount: Account | AccountInterface,
    position: BigNumberish,
    newBeastId: BigNumberish,
  ) => {
    try {
      return await provider.execute(
        snAccount,
        build_beast_actions_swap_calldata(position, newBeastId),
        "survivor_valhalla",
      );
    } catch (error) {
      console.error(error);
      throw error;
    }
  };

  return {
    beast_actions: {
      register: beast_actions_register,
      buildRegisterCalldata: build_beast_actions_register_calldata,
      swap: beast_actions_swap,
      buildSwapCalldata: build_beast_actions_swap_calldata,
    },
  };
}
