// src/components/WorldBeastLineups.tsx
import { motion } from "framer-motion";
import { useEntityQuery, useModels } from "@dojoengine/sdk/react";
import { ToriiQueryBuilder } from "@dojoengine/sdk";
import { ModelsMapping } from "../bindings/typescript/models.gen";

export function WorldBeastLineups() {
  console.log("[WorldBeastLineups] Component rendering");

  // Subscribe to all entities - data automatically goes into the Zustand store
  useEntityQuery(new ToriiQueryBuilder().includeHashedKeys());
  console.log("[WorldBeastLineups] Entity query initialized");

  // Get all BeastLineup models from the store (filtered by model type)
  const beastLineups = useModels(ModelsMapping.BeastLineup);
  console.log("[WorldBeastLineups] Raw beastLineups from store:", beastLineups);
  console.log(
    "[WorldBeastLineups] Number of entries:",
    Object.keys(beastLineups).length,
  );

  // Convert to array format for easier rendering
  const lineupsArray = Object.entries(beastLineups)
    .filter(
      (entry): entry is [string, NonNullable<(typeof entry)[1]>] =>
        entry[1] !== undefined,
    )
    .map(([entityId, entity]) => ({
      entityId,
      player: entity.models.survivor_valhalla.BeastLineup?.player,
      beast1_id: entity.models.survivor_valhalla.BeastLineup?.beast1_id,
      beast2_id: entity.models.survivor_valhalla.BeastLineup?.beast2_id,
      beast3_id: entity.models.survivor_valhalla.BeastLineup?.beast3_id,
      beast4_id: entity.models.survivor_valhalla.BeastLineup?.beast4_id,
      beast5_id: entity.models.survivor_valhalla.BeastLineup?.beast5_id,
    }));

  console.log("[WorldBeastLineups] Processed lineupsArray:", lineupsArray);
  console.log(
    "[WorldBeastLineups] Number of lineups to display:",
    lineupsArray.length,
  );

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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {lineupsArray.map((lineup) => (
            <motion.div
              key={lineup.entityId}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="border border-emerald-500/20 bg-emerald-950/10 p-6"
            >
              <div className="text-center">
                <h3 className="text-lg font-bold text-emerald-400 mb-3">
                  Base
                </h3>
                <div className="text-xs text-emerald-200/60 space-y-2">
                  <div className="pb-2 border-b border-emerald-500/20">
                    <span className="text-emerald-200/40">Player:</span>
                    <div className="text-emerald-300/80 font-mono text-[10px] break-all mt-1">
                      {lineup.player?.slice(0, 10)}...
                      {lineup.player?.slice(-8)}
                    </div>
                  </div>
                  <div className="grid grid-cols-5 gap-1 pt-2">
                    {[1, 2, 3, 4, 5].map((pos) => {
                      const beastId =
                        lineup[`beast${pos}_id` as keyof typeof lineup];
                      const hasBeast = beastId && Number(beastId) > 0;
                      return (
                        <div
                          key={pos}
                          className={`aspect-square border-2 rounded flex items-center justify-center text-xs ${
                            hasBeast
                              ? "border-emerald-500/50 bg-emerald-500/10"
                              : "border-emerald-500/20 bg-emerald-950/20"
                          }`}
                        >
                          {hasBeast ? (
                            <span className="text-emerald-400">
                              {String(beastId).slice(0, 3)}
                            </span>
                          ) : (
                            <span className="text-emerald-200/30">—</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="pt-2 text-emerald-200/40 text-[10px]">
                    Active lineup
                  </div>
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
