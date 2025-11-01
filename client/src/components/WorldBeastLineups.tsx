// src/components/WorldBeastLineups.tsx
import { motion } from "framer-motion";
import { type BeastLineup } from "../bindings/typescript/models.gen";

type BeastLineupWithId = BeastLineup & { entityId: string };

export function WorldBeastLineups(props: {
  lineups: BeastLineupWithId[];
  beastImages: Record<string, string>;
}) {
  const lineupsArray = props.lineups.filter((lineup) => lineup !== undefined);
  const { beastImages } = props;

  console.log("[WorldBeastLineups] Lineups:", lineupsArray);
  console.log("[WorldBeastLineups] Beast images map:", beastImages);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
      className="mb-16"
    >
      <h2 className="text-center text-xl font-bold text-emerald-400 mb-6 tracking-wider uppercase">
        World's Beast Lineups
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
                <div className="text-emerald-300/70 font-mono text-xs text-center">
                  {lineup.player?.slice(0, 6)}...{lineup.player?.slice(-4)}
                </div>
                <div className="grid grid-cols-5 gap-2">
                    {[1, 2, 3, 4, 5].map((pos) => {
                      const beastId =
                        lineup[`beast${pos}_id` as keyof typeof lineup];
                      const hasBeast = beastId && Number(beastId) > 0;
                      // Convert to number first, then to string for consistent lookup
                      const lookupKey = hasBeast ? String(Number(beastId)) : "";
                      const imageUrl = hasBeast
                        ? beastImages[lookupKey]
                        : null;
                      if (hasBeast && !imageUrl) {
                        console.log(`[WorldBeastLineups] Missing image for beast. Raw ID: ${beastId}, Type: ${typeof beastId}, Lookup key: ${lookupKey}, Available keys:`, Object.keys(beastImages));
                      }
                      return (
                        <div
                          key={pos}
                          className={`aspect-square border-2 rounded flex items-center justify-center text-xs overflow-hidden ${
                            hasBeast
                              ? "border-emerald-500/50 bg-emerald-500/10"
                              : "border-emerald-500/20 bg-emerald-950/20"
                          }`}
                        >
                          {hasBeast && imageUrl ? (
                            <img
                              src={imageUrl}
                              alt={`Beast ${beastId}`}
                              className="w-full h-full object-cover"
                              title={`Token ID: ${beastId}`}
                            />
                          ) : hasBeast ? (
                            <span
                              className="text-emerald-400 text-[8px]"
                              title={`Token ID: ${beastId} (image not available)`}
                            >
                              #{String(beastId).slice(-4)}
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
            No bases found in the world
          </p>
        </div>
      )}
    </motion.div>
  );
}
