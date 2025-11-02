// src/components/WorldAdventurerLineups.tsx
import { motion } from "framer-motion";
import { type AttackLineup } from "../bindings/typescript/models.gen";
import { AddressDisplay } from "./AddressDisplay";

type AttackLineupWithId = AttackLineup & { entityId: string };

export function WorldAdventurerLineups(props: {
  lineups: AttackLineupWithId[];
  adventurerImages: Record<string, string>;
}) {
  const lineupsArray = props.lineups.filter((lineup) => lineup !== undefined);
  const { adventurerImages } = props;

  console.log("[WorldAdventurerLineups] Lineups:", lineupsArray);
  console.log("[WorldAdventurerLineups] Adventurer images map:", adventurerImages);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
      className="mb-16"
    >
      <h2 className="text-center text-xl font-bold text-emerald-400 mb-6 tracking-wider uppercase">
        World's Attack Forces
      </h2>
      {lineupsArray.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {lineupsArray.map((lineup) => (
            <motion.div
              key={lineup.entityId}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="border border-emerald-500/20 bg-emerald-950/10 p-6"
            >
              <div className="space-y-4">
                <div className="text-emerald-300/70 text-xs text-center">
                  <AddressDisplay address={lineup.player} />
                </div>
                <div className="grid grid-cols-5 gap-2">
                    {[1, 2, 3, 4, 5].map((pos) => {
                      const adventurerId =
                        lineup[`adventurer${pos}_id` as keyof typeof lineup];
                      const hasAdventurer = adventurerId && Number(adventurerId) > 0;
                      // Convert to number first, then to string for consistent lookup
                      const lookupKey = hasAdventurer ? String(Number(adventurerId)) : "";
                      const imageUrl = hasAdventurer
                        ? adventurerImages[lookupKey]
                        : null;
                      if (hasAdventurer && !imageUrl) {
                        console.log(`[WorldAdventurerLineups] Missing image for adventurer. Raw ID: ${adventurerId}, Type: ${typeof adventurerId}, Lookup key: ${lookupKey}, Available keys:`, Object.keys(adventurerImages));
                      }
                      return (
                        <div
                          key={pos}
                          className={`aspect-square border-2 rounded flex items-center justify-center text-xs overflow-hidden ${
                            hasAdventurer
                              ? "border-emerald-500/50 bg-emerald-500/10"
                              : "border-emerald-500/20 bg-emerald-950/20"
                          }`}
                        >
                          {hasAdventurer && imageUrl ? (
                            <img
                              src={imageUrl}
                              alt={`Adventurer ${adventurerId}`}
                              className="w-full h-full object-cover"
                              title={`Adventurer ID: ${adventurerId}`}
                            />
                          ) : hasAdventurer ? (
                            <span
                              className="text-emerald-400 text-[8px]"
                              title={`Adventurer ID: ${adventurerId} (image not available)`}
                            >
                              #{String(adventurerId).slice(-4)}
                            </span>
                          ) : (
                            <span className="text-emerald-200/30">—</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="border border-emerald-500/30 bg-emerald-950/20 p-8 text-center">
          <p className="text-emerald-200/60 text-sm tracking-wide uppercase">
            No attack forces found in the world
          </p>
        </div>
      )}
    </motion.div>
  );
}
