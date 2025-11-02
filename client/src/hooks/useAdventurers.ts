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
  // Query all adventurers owned by the account
  // Join token_balances with tokens table to get owned adventurer NFTs
  let q = `
SELECT *
FROM tokens
WHERE contract_address = '0x036017e69d21d6d8c13e266eabb73ef1f1d02722d86bdcabe5f168f8e549d3cd'
LIMIT 10;
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
      console.error("[useAdventurers] Fetch failed:", {
        status: sql.status,
        statusText: sql.statusText,
        url,
      });
      throw new Error(
        `Failed to fetch adventurers: ${sql.status} ${sql.statusText}`,
      );
    }

    let data = await sql.json();

    console.log("[useAdventurers] Raw data:", data);
    console.log("[useAdventurers] Data length:", data.length);
    if (data.length > 0) {
      console.log("[useAdventurers] First row:", data[0]);
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
        const gameOver = getAttributeValue(attributes, "Game Over") === "True";
        const health = toNumber(getAttributeValue(attributes, "Health"));
        
        // Create name from player name or adventurer ID
        const name = playerName ? `${playerName}'s Adventurer` : `Adventurer #${adventurerId}`;
        
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
    queryKey: ["adventurerLineupImages", adventurerIds.join(","), options?.toriiUrl],
    queryFn: () => getAdventurerLineupImages(adventurerIds),
    enabled: options?.enabled ?? adventurerIds.length > 0,
    staleTime: 100000, // Consider data fresh for 100 seconds
  });
};