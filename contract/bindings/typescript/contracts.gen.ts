import { DojoProvider, DojoCall } from "@dojoengine/core";
import { Account, AccountInterface, BigNumberish, CairoOption, CairoCustomEnum } from "starknet";
import * as models from "./models.gen";

export function setupWorld(provider: DojoProvider) {

	const build_battle_actions_battle_calldata = (defender: string): DojoCall => {
		return {
			contractName: "battle_actions",
			entrypoint: "battle",
			calldata: [defender],
		};
	};

	const battle_actions_battle = async (snAccount: Account | AccountInterface, defender: string) => {
		try {
			return await provider.execute(
				snAccount,
				build_battle_actions_battle_calldata(defender),
				"survivor_valhalla",
			);
		} catch (error) {
			console.error(error);
			throw error;
		}
	};

	const build_battle_actions_setAttackLineup_calldata = (adventurer1Id: BigNumberish, adventurer2Id: BigNumberish, adventurer3Id: BigNumberish, adventurer4Id: BigNumberish, adventurer5Id: BigNumberish): DojoCall => {
		return {
			contractName: "battle_actions",
			entrypoint: "set_attack_lineup",
			calldata: [adventurer1Id, adventurer2Id, adventurer3Id, adventurer4Id, adventurer5Id],
		};
	};

	const battle_actions_setAttackLineup = async (snAccount: Account | AccountInterface, adventurer1Id: BigNumberish, adventurer2Id: BigNumberish, adventurer3Id: BigNumberish, adventurer4Id: BigNumberish, adventurer5Id: BigNumberish) => {
		try {
			return await provider.execute(
				snAccount,
				build_battle_actions_setAttackLineup_calldata(adventurer1Id, adventurer2Id, adventurer3Id, adventurer4Id, adventurer5Id),
				"survivor_valhalla",
			);
		} catch (error) {
			console.error(error);
			throw error;
		}
	};

	const build_beast_actions_register_calldata = (beast1Id: BigNumberish, beast2Id: BigNumberish, beast3Id: BigNumberish, beast4Id: BigNumberish, beast5Id: BigNumberish): DojoCall => {
		return {
			contractName: "beast_actions",
			entrypoint: "register",
			calldata: [beast1Id, beast2Id, beast3Id, beast4Id, beast5Id],
		};
	};

	const beast_actions_register = async (snAccount: Account | AccountInterface, beast1Id: BigNumberish, beast2Id: BigNumberish, beast3Id: BigNumberish, beast4Id: BigNumberish, beast5Id: BigNumberish) => {
		try {
			return await provider.execute(
				snAccount,
				build_beast_actions_register_calldata(beast1Id, beast2Id, beast3Id, beast4Id, beast5Id),
				"survivor_valhalla",
			);
		} catch (error) {
			console.error(error);
			throw error;
		}
	};

	const build_beast_actions_swap_calldata = (position: BigNumberish, newBeastId: BigNumberish): DojoCall => {
		return {
			contractName: "beast_actions",
			entrypoint: "swap",
			calldata: [position, newBeastId],
		};
	};

	const beast_actions_swap = async (snAccount: Account | AccountInterface, position: BigNumberish, newBeastId: BigNumberish) => {
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

	const build_energy_actions_getEnergy_calldata = (player: string): DojoCall => {
		return {
			contractName: "energy_actions",
			entrypoint: "get_energy",
			calldata: [player],
		};
	};

	const energy_actions_getEnergy = async (player: string) => {
		try {
			return await provider.call("survivor_valhalla", build_energy_actions_getEnergy_calldata(player));
		} catch (error) {
			console.error(error);
			throw error;
		}
	};



	return {
		battle_actions: {
			battle: battle_actions_battle,
			buildBattleCalldata: build_battle_actions_battle_calldata,
			setAttackLineup: battle_actions_setAttackLineup,
			buildSetAttackLineupCalldata: build_battle_actions_setAttackLineup_calldata,
		},
		beast_actions: {
			register: beast_actions_register,
			buildRegisterCalldata: build_beast_actions_register_calldata,
			swap: beast_actions_swap,
			buildSwapCalldata: build_beast_actions_swap_calldata,
		},
		energy_actions: {
			getEnergy: energy_actions_getEnergy,
			buildGetEnergyCalldata: build_energy_actions_getEnergy_calldata,
		},
	};
}