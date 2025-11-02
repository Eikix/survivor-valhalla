import { useMemo } from "react";
import { useModels } from "@dojoengine/sdk/react";
import { ModelsMapping } from "../bindings/typescript/models.gen";

export type AdventurerWeaponData = {
  adventurer_id: number;
  weapon_type: number;
  weapon_power: number;
};

/**
 * Hook to fetch all adventurer weapons and create a mapping
 * Returns a map of adventurer_id -> weapon data
 */
export const useAdventurerWeapons = (): Record<
  number,
  AdventurerWeaponData
> | null => {
  const allWeapons = useModels(ModelsMapping.AdventurerWeapon);

  const weaponMap = useMemo(() => {
    if (!Array.isArray(allWeapons)) return null;

    const map: Record<number, AdventurerWeaponData> = {};

    allWeapons.forEach((weaponObj: any) => {
      const entityId = Object.keys(weaponObj)[0];
      const weapon = weaponObj[entityId];

      if (!weapon) return;

      const adventurerId = Number(weapon.adventurer_id || 0);
      if (adventurerId > 0) {
        map[adventurerId] = {
          adventurer_id: adventurerId,
          weapon_type: Number(weapon.weapon_type || 0),
          weapon_power: Number(weapon.weapon_power || 0),
        };
      }
    });

    return map;
  }, [allWeapons]);

  return weaponMap;
};

/**
 * Get weapon type name from weapon type enum value
 * 1 = Blade_or_Hide (swords, blades)
 * 2 = Bludgeon_or_Metal (clubs, hammers, metal weapons)
 * 3 = Magic_or_Cloth (wands, books, magic)
 */
export const getWeaponTypeName = (weaponType: number): string => {
  const weaponTypes: Record<number, string> = {
    0: "None",
    1: "Blade/Hide",
    2: "Bludgeon/Metal",
    3: "Magic/Cloth",
  };
  return weaponTypes[weaponType] || "Unknown";
};

/**
 * Get weapon type icon/emoji from weapon type enum value
 * 1 = Blade_or_Hide (swords, blades) - ⚔️
 * 2 = Bludgeon_or_Metal (clubs, hammers, metal weapons) - 🔨
 * 3 = Magic_or_Cloth (wands, books, magic) - 🔮
 */
export const getWeaponTypeIcon = (weaponType: number): string => {
  const weaponIcons: Record<number, string> = {
    0: "?",
    1: "⚔️", // Blade_or_Hide
    2: "🔨", // Bludgeon_or_Metal
    3: "🔮", // Magic_or_Cloth
  };
  return weaponIcons[weaponType] || "?";
};

/**
 * Get armor type icon/emoji from weapon type enum value (for beasts)
 * 1 = Blade_or_Hide -> Hide armor - 🦴
 * 2 = Bludgeon_or_Metal -> Metal armor - 🛡️
 * 3 = Magic_or_Cloth -> Cloth armor - 👘
 */
export const getArmorTypeIcon = (weaponType: number): string => {
  const armorIcons: Record<number, string> = {
    0: "?",
    1: "🦴", // Hide armor
    2: "🛡️", // Metal armor
    3: "👘", // Cloth armor
  };
  return armorIcons[weaponType] || "?";
};
