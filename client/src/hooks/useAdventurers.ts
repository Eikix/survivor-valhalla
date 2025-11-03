import { useQuery } from "@tanstack/react-query";
import { addAddressPadding } from "starknet";
import { TORII_URL } from "../App";

export type Adventurer = {
  id: number;
  adventurer_id: number;
  owner: string;
  health: number;
  level: number;
  strength: number;
  dexterity: number;
  vitality: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
  luck: number;
  xp: number;
  gold: number;
  name?: string;
  image?: string;
  // Combat stats
  combatHealth?: number;
  weaponPower?: number;
  weaponType?: number;
};

/**
 * Default constants for the Loot Survivor contract
 * This is the mainnet address for Loot Survivor adventurers
 */
const LOOT_SURVIVOR_CONTRACT =
  "0x036017E69D21D6D8c13E266EaBB73ef1f1D02722D86BDcAbe5f168f8e549d3cD";

const getAdventurerCollection = async (
  accountAddress: string,
  toriiUrl: string = TORII_URL,
  lootSurvivorContract: string = LOOT_SURVIVOR_CONTRACT,
): Promise<Adventurer[]> => {
  // First query: Get token IDs owned by the account
  // Use exact balance check like in beast query
  let tokenBalancesQuery = `
    SELECT token_id, balance
    FROM token_balances
    WHERE account_address = '${addAddressPadding(accountAddress.toLowerCase())}' 
      AND contract_address = '${addAddressPadding(lootSurvivorContract.toLowerCase())}'
      AND balance = '0x0000000000000000000000000000000000000000000000000000000000000001'
    LIMIT 10000
  `;

  // First, get the owned token IDs
  const tokenBalancesUrl = `${toriiUrl}/sql?query=${encodeURIComponent(tokenBalancesQuery)}`;

  try {
    const tokenBalancesResponse = await fetch(tokenBalancesUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!tokenBalancesResponse.ok) {
      console.error("[useAdventurers] Token balances fetch failed:", {
        status: tokenBalancesResponse.status,
        statusText: tokenBalancesResponse.statusText,
        url: tokenBalancesUrl,
      });
      throw new Error(
        `Failed to fetch token balances: ${tokenBalancesResponse.status} ${tokenBalancesResponse.statusText}`,
      );
    }

    const tokenBalances = await tokenBalancesResponse.json();
    console.log("[useAdventurers] Token balances:", tokenBalances);

    if (!tokenBalances || tokenBalances.length === 0) {
      console.log("[useAdventurers] No adventurers owned by this account");
      return [];
    }

    // Extract token IDs
    const tokenIds = tokenBalances
      .map((tb: any) => `'${tb.token_id}'`)
      .join(",");

    // Second query: Get token details for owned tokens
    let tokensQuery = `
      SELECT *
      FROM tokens
      WHERE id IN (${tokenIds})
        AND metadata IS NOT NULL
      LIMIT 1000
    `;

    const tokensUrl = `${toriiUrl}/sql?query=${encodeURIComponent(tokensQuery)}`;

    const tokensResponse = await fetch(tokensUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!tokensResponse.ok) {
      console.error("[useAdventurers] Tokens fetch failed:", {
        status: tokensResponse.status,
        statusText: tokensResponse.statusText,
        url: tokensUrl,
      });
      throw new Error(
        `Failed to fetch tokens: ${tokensResponse.status} ${tokensResponse.statusText}`,
      );
    }

    let data = await tokensResponse.json();

    console.log("[useAdventurers] Raw tokens data:", data);
    console.log("[useAdventurers] Tokens data length:", data.length);
    if (data.length > 0) {
      console.log("[useAdventurers] First token:", data[0]);
    }

    // Helper function to safely convert to number
    const toNumber = (val: any): number => {
      if (val == null || val === "") return 0;
      // Handle "?" values from Loot Survivor
      if (val === "?") return 0;
      if (typeof val === "string") {
        // Handle hex strings
        if (val.startsWith("0x")) {
          return parseInt(val, 16);
        }
        return parseInt(val, 10);
      }
      const num = Number(val);
      return isNaN(num) ? 0 : num;
    };

    // Helper function to extract attribute value by trait name
    const getAttributeValue = (attributes: any[], trait: string): string => {
      if (!Array.isArray(attributes)) return "";
      const attr = attributes.find((a: any) => a.trait === trait);
      return attr?.value || "";
    };

    let adventurers: Adventurer[] = data
      .filter((row: any) => row.token_id)
      .filter((row: any) => {
        // Pre-filter to only include dead adventurers
        try {
          if (row.metadata) {
            const metadata = JSON.parse(row.metadata);
            const attributes = metadata.attributes || [];
            const gameOverAttr = attributes.find(
              (a: any) => a.trait === "Game Over",
            );
            return gameOverAttr?.value === "True";
          }
        } catch (e) {
          console.error("Failed to parse metadata for filtering:", e);
        }
        return false;
      })
      .map((row: any, index: number) => {
        // Parse metadata JSON which contains attributes array
        let metadata = null;
        let attributes = [];
        try {
          if (row.metadata) {
            metadata = JSON.parse(row.metadata);
            attributes = metadata.attributes || [];
          }
        } catch (e) {
          console.error("Failed to parse metadata:", e);
        }

        // Extract adventurer ID from token_id (hex string)
        const adventurerId = toNumber(row.token_id);

        const playerName = getAttributeValue(attributes, "Player Name");
        const health = toNumber(getAttributeValue(attributes, "Health"));

        // Create name from player name or adventurer ID
        // Avoid redundant names like "Adventurer's Adventurer"
        const name =
          playerName && playerName.toLowerCase() !== "adventurer"
            ? `${playerName}'s Adventurer`
            : `Adventurer #${adventurerId}`;

        // Extract image from metadata
        const image = metadata?.image || generateAdventurerImage(adventurerId);

        let adventurer: Adventurer = {
          id: index,
          adventurer_id: adventurerId,
          owner: accountAddress,
          health: health,
          level: toNumber(getAttributeValue(attributes, "Level")),
          strength: toNumber(getAttributeValue(attributes, "Strength")),
          dexterity: toNumber(getAttributeValue(attributes, "Dexterity")),
          vitality: toNumber(getAttributeValue(attributes, "Vitality")),
          intelligence: toNumber(getAttributeValue(attributes, "Intelligence")),
          wisdom: toNumber(getAttributeValue(attributes, "Wisdom")),
          charisma: toNumber(getAttributeValue(attributes, "Charisma")),
          luck: toNumber(getAttributeValue(attributes, "Luck")),
          xp: toNumber(getAttributeValue(attributes, "XP")),
          gold: toNumber(getAttributeValue(attributes, "Gold")),
          name: name,
          image: image,
        };

        return adventurer;
      });

    console.log("[useAdventurers] Parsed adventurers:", adventurers);

    return adventurers;
  } catch (error) {
    console.error("[useAdventurers] Error fetching adventurers:", error);
    throw error;
  }
};

// Generate a placeholder image for adventurers
// In a real implementation, you might fetch actual NFT images
const generateAdventurerImage = (adventurerId: number): string => {
  // Use a deterministic avatar service with the adventurer ID as seed
  return `https://api.dicebear.com/7.x/pixel-art/svg?seed=${adventurerId}&backgroundColor=1a1a1a&size=128`;
};

export const useAdventurers = (
  accountAddress: string | undefined,
  options?: {
    toriiUrl?: string;
    lootSurvivorContract?: string;
    enabled?: boolean;
  },
) => {
  return useQuery({
    queryKey: [
      "adventurers",
      accountAddress,
      options?.toriiUrl,
      options?.lootSurvivorContract,
    ],
    queryFn: () => {
      if (!accountAddress) {
        throw new Error("Account address is required");
      }
      return getAdventurerCollection(
        accountAddress,
        options?.toriiUrl,
        options?.lootSurvivorContract,
      );
    },
    enabled: options?.enabled ?? !!accountAddress,
    staleTime: 100000, // Consider data fresh for 100 seconds
  });
};

/**
 * Fetch adventurer images by adventurer IDs
 * Returns a map of adventurer_id -> image URL
 */
const getAdventurerLineupImages = async (
  adventurerIds: (string | number | bigint)[],
): Promise<Record<string, string>> => {
  if (adventurerIds.length === 0) return {};

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

  // Convert all adventurer IDs to numbers and filter out zeros
  const validAdventurerIds = adventurerIds.map(toNumber).filter((id) => id > 0);

  if (validAdventurerIds.length === 0) return {};

  // For now, generate placeholder images
  // In a real implementation, you'd query the actual NFT metadata
  const imageMap: Record<string, string> = {};

  validAdventurerIds.forEach((id) => {
    imageMap[String(id)] = generateAdventurerImage(id);
  });

  return imageMap;
};

/**
 * Hook to fetch adventurer images for lineup display
 */
export const useAdventurerLineupImages = (
  adventurerIds: (string | number | bigint)[],
  options?: {
    toriiUrl?: string;
    enabled?: boolean;
  },
) => {
  return useQuery({
    queryKey: [
      "adventurerLineupImages",
      adventurerIds.join(","),
      options?.toriiUrl,
    ],
    queryFn: () => getAdventurerLineupImages(adventurerIds),
    enabled: options?.enabled ?? adventurerIds.length > 0,
    staleTime: 100000, // Consider data fresh for 100 seconds
  });
};
