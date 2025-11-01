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
  image: string;
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
      a."Animated",
      json_extract(t.metadata, '$.image') as image
    FROM attrs a
    LEFT JOIN tokens t ON a.token_id = t.id;
  `;

  const url = `${toriiUrl}/sql?query=${encodeURIComponent(q)}`;

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

    let beasts: Beast[] = data
      .filter((data: any) => data["Beast"])
      .map((data: any) => {
        // Helper function to safely convert to number
        const toNumber = (val: any): number => {
          if (val == null || val === "") return 0;
          const num = typeof val === "string" ? parseInt(val, 10) : Number(val);
          return isNaN(num) ? 0 : num;
        };

        let beast: Beast = {
          id: toNumber(data["Beast ID"]),
          token_id: toNumber(data["Token ID"]),
          name: data["Beast"]?.replace(" ", "") || "",
          level: toNumber(data["Level"]),
          health: toNumber(data["Health"]),
          prefix: data["Prefix"] || "",
          suffix: data["Suffix"] || "",
          power: toNumber(data["Power"]),
          tier: toNumber(data["Tier"]),
          type: data["Type"] || "",
          shiny: toNumber(data["Shiny"]),
          animated: toNumber(data["Animated"]),
          image: data["image"] || "",
        };

        return beast;
      });

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

/**
 * Fetch beast images by token IDs
 * Returns a map of token_id -> image URL
 */
const getBeastLineupImages = async (
  tokenIds: (string | number | bigint)[],
  toriiUrl: string = TORII_URL,
): Promise<Record<string, string>> => {
  if (tokenIds.length === 0) return {};

  // Convert all token IDs to numbers and filter out zeros
  const validTokenIds = tokenIds.map((id) => Number(id)).filter((id) => id > 0);

  if (validTokenIds.length === 0) return {};

  // Convert token IDs to hex format for the SQL query
  const tokenIdList = validTokenIds
    .map((id) => `'0x${id.toString(16)}'`)
    .join(",");
  const q = `
    SELECT
      t.id as token_id,
      json_extract(t.metadata, '$.image') as image
    FROM tokens t
    WHERE t.id IN (${tokenIdList})
  `;

  const url = `${toriiUrl}/sql?query=${encodeURIComponent(q)}`;

  try {
    const sql = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!sql.ok) {
      console.error("[getBeastLineupImages] Fetch failed:", {
        status: sql.status,
        statusText: sql.statusText,
        url,
      });
      throw new Error(
        `Failed to fetch beast images: ${sql.status} ${sql.statusText}`,
      );
    }

    const data = await sql.json();

    // Convert array to map of token_id -> image
    // Parse hex token_id from database and convert to decimal string for consistency
    const imageMap: Record<string, string> = {};
    data.forEach((row: any) => {
      if (row.token_id && row.image) {
        // Parse hex token_id (e.g., "0x1234" -> 4660)
        const tokenIdDecimal = parseInt(row.token_id, 16);
        imageMap[String(tokenIdDecimal)] = row.image;
      }
    });

    return imageMap;
  } catch (error) {
    console.error("[getBeastLineupImages] Error fetching images:", error);
    throw error;
  }
};

/**
 * Hook to fetch beast images for lineup display
 */
export const useBeastLineupImages = (
  tokenIds: (string | number | bigint)[],
  options?: {
    toriiUrl?: string;
    enabled?: boolean;
  },
) => {
  return useQuery({
    queryKey: ["beastLineupImages", tokenIds.join(","), options?.toriiUrl],
    queryFn: () => getBeastLineupImages(tokenIds, options?.toriiUrl),
    enabled: options?.enabled ?? tokenIds.length > 0,
    staleTime: 100000, // Consider data fresh for 100 seconds
  });
};
