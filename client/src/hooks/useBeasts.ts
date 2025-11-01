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

  // Helper to convert BigNumberish to number
  const toNumber = (id: string | number | bigint): number => {
    if (typeof id === "number") return id;
    if (typeof id === "bigint") return Number(id);
    if (typeof id === "string") {
      // Handle hex strings
      if (id.startsWith("0x")) {
        return parseInt(id, 16);
      }
      return parseInt(id, 10);
    }
    return 0;
  };

  // Convert all token IDs to numbers and filter out zeros
  const validTokenIds = tokenIds.map(toNumber).filter((id) => id > 0);

  if (validTokenIds.length === 0) return {};

  // Use token_attributes table (this worked for 6/10 tokens before)
  // Match by trait_value where trait_name = 'Token ID'
  const contractAddressHex = addAddressPadding(BEASTS_CONTRACT.toLowerCase());

  const tokenIdConditions = validTokenIds
    .map((id) => {
      console.log(`[getBeastLineupImages] Token ${id} -> searching for trait_value = '${id}'`);
      return `ta.trait_value = '${id}'`;
    })
    .join(" OR ");

  const q = `
    SELECT DISTINCT
      ta.token_id,
      json_extract(t.metadata, '$.image') as image
    FROM token_attributes ta
    LEFT JOIN tokens t ON ta.token_id = t.id
    WHERE ta.trait_name = 'Token ID'
      AND (${tokenIdConditions})
      AND t.contract_address = '${contractAddressHex}'
  `;

  const url = `${toriiUrl}/sql?query=${encodeURIComponent(q)}`;

  try {
    console.log("[getBeastLineupImages] Fetching images for token IDs:", validTokenIds);
    console.log("[getBeastLineupImages] Query:", q);
    console.log("[getBeastLineupImages] Total tokens requested:", validTokenIds.length);

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
    console.log("[getBeastLineupImages] Raw response:", data);
    console.log(`[getBeastLineupImages] Received ${data.length} results out of ${validTokenIds.length} requested tokens`);

    // Convert array to map of token_id -> image
    // The token_id in response is a composite key: contract_address + token_id
    // We need to extract just the token_id part (last 64 chars) and convert to decimal
    const imageMap: Record<string, string> = {};

    // Build a reverse lookup: for each validTokenId, find its corresponding row
    validTokenIds.forEach((decimalId) => {
      const row = data.find((r: any) => {
        if (!r.token_id) return false;

        // The token_id is formatted as: contract_address (66 chars with 0x) + token_id (64 chars)
        // Total length should be 130 chars (0x + 64 + 64)
        // Extract the last 64 characters (the actual token ID)
        const fullHex = r.token_id;
        console.log(`[getBeastLineupImages] Parsing token_id from DB: ${fullHex}`);

        // Remove '0x' prefix, skip contract address (64 chars), get token ID (last 64 chars)
        const hexWithoutPrefix = fullHex.slice(2); // Remove '0x'
        const tokenIdHex = hexWithoutPrefix.slice(-64); // Get last 64 chars (the token ID)
        const rowTokenId = parseInt(tokenIdHex, 16);

        console.log(`[getBeastLineupImages] Extracted token ID: 0x${tokenIdHex} -> ${rowTokenId}, comparing to ${decimalId}`);
        return rowTokenId === decimalId;
      });

      if (row && row.image) {
        console.log(`[getBeastLineupImages] ✓ Mapping token ${decimalId} -> image found`);
        imageMap[String(decimalId)] = row.image;
      } else {
        console.log(`[getBeastLineupImages] ✗ No image found for token ${decimalId}`);
      }
    });

    const foundCount = Object.keys(imageMap).length;
    const missingTokens = validTokenIds.filter(id => !imageMap[String(id)]);

    console.log("[getBeastLineupImages] Final image map:", imageMap);
    console.log(`[getBeastLineupImages] Summary: ${foundCount}/${validTokenIds.length} images found`);
    if (missingTokens.length > 0) {
      console.warn(`[getBeastLineupImages] Missing tokens (not in database):`, missingTokens);
    }
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
