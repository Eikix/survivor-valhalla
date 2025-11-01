import { useQuery } from "@tanstack/react-query";
import { addAddressPadding } from "starknet";
import { TORII_URL } from "../App";

export type Beast = {
  id: number;
  name: string;
  prefix: string;
  suffix: string;
  power: number;
  tier: number;
  type: string;
  level: number;
  health: number;
  shiny: number;
  animated: number;
  token_id: number;
};

/**
 * Default constants for the beasts contract and torii url
 */
const BEASTS_CONTRACT =
  "0x046dA8955829ADF2bDa310099A0063451923f02E648cF25A1203aac6335CF0e4";

const getBeastCollection = async (
  accountAddress: string,
  toriiUrl: string = TORII_URL,
  beastsContract: string = BEASTS_CONTRACT,
): Promise<Beast[]> => {
  let q = `
    WITH tbf AS (
      SELECT tb.token_id, tb.account_address, tb.contract_address, tb.balance
      FROM token_balances tb
      WHERE tb.account_address = '${addAddressPadding(accountAddress.toLowerCase())}'
        AND tb.contract_address = '${addAddressPadding(beastsContract.toLowerCase())}'
        AND tb.balance = '0x0000000000000000000000000000000000000000000000000000000000000001'
      LIMIT 10000
    ),
    attrs AS (
      SELECT
        ta.token_id,
        MAX(CASE WHEN ta.trait_name='Beast'        THEN ta.trait_value END) AS "Beast",
        MAX(CASE WHEN ta.trait_name='Type'        THEN ta.trait_value END) AS "Type",
        MAX(CASE WHEN ta.trait_name='Prefix'      THEN ta.trait_value END) AS "Prefix",
        MAX(CASE WHEN ta.trait_name='Suffix'      THEN ta.trait_value END) AS "Suffix",
        MAX(CASE WHEN ta.trait_name='Token ID'    THEN ta.trait_value END) AS "Token ID",
        MAX(CASE WHEN ta.trait_name='Beast ID'    THEN ta.trait_value END) AS "Beast ID",
        MAX(CASE WHEN ta.trait_name='Tier'        THEN ta.trait_value END) AS "Tier",
        MAX(CASE WHEN ta.trait_name='Level'       THEN ta.trait_value END) AS "Level",
        MAX(CASE WHEN ta.trait_name='Health'      THEN ta.trait_value END) AS "Health",
        MAX(CASE WHEN ta.trait_name='Power'       THEN ta.trait_value END) AS "Power",
        MAX(CASE WHEN ta.trait_name='Shiny'      THEN ta.trait_value END) AS "Shiny",
        MAX(CASE WHEN ta.trait_name='Animated'   THEN ta.trait_value END) AS "Animated"
      FROM token_attributes AS ta
      JOIN tbf ON tbf.token_id = ta.token_id
      GROUP BY ta.token_id
    )
    SELECT
      a."Token ID",
      a."Beast ID",
      a."Beast",
      a."Type",
      a."Tier",
      a."Prefix",
      a."Suffix",
      a."Level",
      a."Health",
      a."Power",
      a."Shiny",
      a."Animated"
    FROM attrs a;
  `;

  const url = `${toriiUrl}/sql?query=${encodeURIComponent(q)}`;

  console.log("[useBeasts] Fetching beasts:", {
    accountAddress,
    toriiUrl,
    beastsContract,
    url,
  });

  try {
    const sql = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!sql.ok) {
      console.error("[useBeasts] Fetch failed:", {
        status: sql.status,
        statusText: sql.statusText,
        url,
      });
      throw new Error(
        `Failed to fetch beasts: ${sql.status} ${sql.statusText}`,
      );
    }

    let data = await sql.json();
    console.log("[useBeasts] Raw response data:", data);
    console.log("[useBeasts] Response count:", data?.length || 0);

    let beasts: Beast[] = data
      .filter((data: any) => data["Beast"])
      .map((data: any) => {
        let beast: Beast = {
          id: Number(data["Beast ID"]),
          token_id: Number(data["Token ID"]),
          name: data["Beast"].replace(" ", ""),
          level: Number(data["Level"]),
          health: Number(data["Health"]),
          prefix: data["Prefix"],
          suffix: data["Suffix"],
          power: Number(data["Power"]),
          tier: Number(data["Tier"]),
          type: data["Type"],
          shiny: Number(data["Shiny"]),
          animated: Number(data["Animated"]),
        };

        return beast;
      });

    console.log("[useBeasts] Processed beasts:", beasts);
    console.log("[useBeasts] Total beasts found:", beasts.length);

    return beasts;
  } catch (error) {
    console.error("[useBeasts] Error fetching beasts:", error);
    throw error;
  }
};

export const useBeasts = (
  accountAddress: string | undefined,
  options?: {
    toriiUrl?: string;
    beastsContract?: string;
    enabled?: boolean;
  },
) => {
  return useQuery({
    queryKey: [
      "beasts",
      accountAddress,
      options?.toriiUrl,
      options?.beastsContract,
    ],
    queryFn: () => {
      if (!accountAddress) {
        throw new Error("Account address is required");
      }
      return getBeastCollection(
        accountAddress,
        options?.toriiUrl,
        options?.beastsContract,
      );
    },
    enabled: options?.enabled ?? !!accountAddress,
    staleTime: 100000, // Consider data fresh for 100 seconds
  });
};
