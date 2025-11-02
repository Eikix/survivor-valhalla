import { motion } from "framer-motion";
import { useParams } from "react-router-dom";
import { Swords } from "lucide-react";
import { useMemo } from "react";
import { Navbar } from "../components/navbar";
import { useBattleDetails } from "../hooks/useBattleDetails";
import { useAdventurers } from "../hooks/useAdventurers";
import { useBeastLineupImages } from "../hooks/useBeasts";

export function BattlePage() {
  const { battleId } = useParams<{ battleId: string }>();
  const numericBattleId = battleId ? parseInt(battleId, 10) : 0;
  const { battleDetails } = useBattleDetails(numericBattleId);

  // Load adventurers for attacker images
  const { data: adventurers = [] } = useAdventurers(battleDetails?.attacker, {
    enabled: !!battleDetails?.attacker,
  });

  // Extract beast IDs from defender lineup for image loading
  const beastTokenIds = useMemo(() => {
    if (!battleDetails?.defenderLineup) return [];
    const tokenIds: (string | number | bigint)[] = [];
    [
      battleDetails.defenderLineup.beast1_id,
      battleDetails.defenderLineup.beast2_id,
      battleDetails.defenderLineup.beast3_id,
      battleDetails.defenderLineup.beast4_id,
      battleDetails.defenderLineup.beast5_id,
    ].forEach((id) => {
      if (id && Number(id) > 0) {
        tokenIds.push(id);
      }
    });
    return tokenIds;
  }, [battleDetails?.defenderLineup]);

  // Fetch beast images
  const { data: beastImages = {} } = useBeastLineupImages(beastTokenIds, {
    enabled: beastTokenIds.length > 0,
  });

  if (!battleDetails) {
    return (
      <div className="min-h-screen bg-black text-white relative overflow-hidden">
        <Navbar />
        <div className="relative z-10 min-h-screen flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl text-red-400">Battle not found</h1>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      {/* Background effect */}
      <div className="absolute inset-0">
        <motion.div
          animate={{
            opacity: [0.1, 0.15, 0.1],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-red-600/10 rounded-full blur-[150px]"
        />
      </div>

      <Navbar />

      <div className="relative z-10 container mx-auto px-4 py-12 max-w-4xl">
        {/* Battle header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <h1 className="text-4xl md:text-5xl font-bold mb-4 text-red-500">
            Battle #{battleId}
          </h1>
          <div className="flex items-center justify-center gap-4 text-red-200/60 text-sm">
            <span>
              {battleDetails.attacker.slice(0, 8)}...
              {battleDetails.attacker.slice(-6)}
            </span>
            <Swords className="w-4 h-4" />
            <span>
              {battleDetails.defender.slice(0, 8)}...
              {battleDetails.defender.slice(-6)}
            </span>
          </div>
          <div className="mt-2">
            <span
              className={`font-bold ${battleDetails.isVictory ? "text-green-400" : "text-red-400"}`}
            >
              {battleDetails.isVictory ? "VICTORY" : "DEFEAT"}
            </span>
          </div>
        </motion.div>

        {/* Fight Board */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mb-8"
        >
          <div className="border-2 border-red-500/30 bg-red-950/20 p-8 relative overflow-hidden">
            {/* Defense Symbol - Top Left */}
            <div className="absolute top-4 left-4 z-20">
              <div className="bg-amber-900/80 border border-amber-600/50 rounded-full p-2">
                <Swords className="w-6 h-6 text-amber-300 rotate-180" />
              </div>
            </div>

            {/* Attack Symbol - Bottom Right */}
            <div className="absolute bottom-4 right-4 z-20">
              <div className="bg-red-900/80 border border-red-500/50 rounded-full p-2">
                <Swords className="w-6 h-6 text-red-300" />
              </div>
            </div>

            <div className="space-y-12">
              {/* Defense Lineup - Top Row */}
              <div className="grid grid-cols-5 gap-4">
                {[1, 2, 3, 4, 5].map((pos) => {
                  const beastId =
                    battleDetails.defenderLineup?.[`beast${pos}_id`];
                  const hasBeast = beastId && Number(beastId) > 0;
                  const lookupKey = hasBeast ? String(Number(beastId)) : "";
                  const imageUrl = hasBeast ? beastImages[lookupKey] : null;

                  return (
                    <div
                      key={pos}
                      className="aspect-square flex items-center justify-center relative rounded-lg bg-amber-950/30 border border-amber-600/20"
                    >
                      {hasBeast && imageUrl ? (
                        <motion.img
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          src={imageUrl}
                          alt={`Beast ${beastId}`}
                          className="w-full h-full object-contain rounded-lg"
                        />
                      ) : hasBeast ? (
                        <div className="text-center">
                          <div className="text-amber-300 text-xs font-bold">
                            B{beastId}
                          </div>
                        </div>
                      ) : (
                        <div className="text-amber-200/20 text-xs text-center">
                          Empty
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* VS Divider */}
              <div className="text-center">
                <div className="text-3xl font-bold text-red-500">VS</div>
              </div>

              {/* Attack Lineup - Bottom Row */}
              <div className="grid grid-cols-5 gap-4">
                {[1, 2, 3, 4, 5].map((pos) => {
                  const adventurerId =
                    battleDetails.attackerLineup?.[`adventurer${pos}_id`];
                  const hasAdventurer =
                    adventurerId && Number(adventurerId) > 0;
                  const adventurer = hasAdventurer
                    ? adventurers.find(
                        (a) => a.adventurer_id === Number(adventurerId),
                      )
                    : null;

                  return (
                    <div
                      key={pos}
                      className="aspect-square flex items-center justify-center relative rounded-lg bg-red-950/30 border border-red-500/20"
                    >
                      {adventurer?.image ? (
                        <motion.img
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          src={adventurer.image}
                          alt={`${adventurer.name}`}
                          className="w-full h-full object-contain rounded-lg"
                        />
                      ) : hasAdventurer ? (
                        <div className="text-center">
                          <div className="text-red-300 text-xs font-bold">
                            A{adventurerId}
                          </div>
                        </div>
                      ) : (
                        <div className="text-red-200/20 text-xs text-center">
                          Empty
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Battle log */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-16"
        >
          <div className="border border-red-500/30 bg-red-950/20 p-8">
            <h2 className="text-center text-xl font-bold text-red-400 mb-6 tracking-wider uppercase">
              Battle Chronicle
            </h2>
            <div className="border border-red-500/20 bg-black/40 p-6 max-h-96 overflow-y-auto">
              <div className="space-y-1">
                {battleDetails.battleLog.map((logEntry, index) => {
                  const isSeparator =
                    logEntry.includes("---") || logEntry.includes("═══");
                  const isHeader = logEntry.includes("Battle Chronicle");

                  return (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.02 }}
                      className={`
                        font-mono text-sm
                        ${isSeparator ? "text-red-500/40 text-center my-1" : ""}
                        ${isHeader ? "text-red-400 font-bold text-center my-2" : ""}
                        ${!isSeparator && !isHeader ? "text-red-200/70 pl-2" : ""}
                      `}
                      style={{
                        whiteSpace: "pre-line",
                        lineHeight: isSeparator ? "1.2" : "1.6",
                      }}
                    >
                      {logEntry}
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Battle statistics */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6"
        >
          <div className="border border-red-500/30 bg-red-950/20 p-6 text-center">
            <h3 className="text-red-400 font-bold mb-2">Total Events</h3>
            <div className="text-2xl font-bold text-red-300">
              {battleDetails.events.length}
            </div>
          </div>
          <div className="border border-red-500/30 bg-red-950/20 p-6 text-center">
            <h3 className="text-red-400 font-bold mb-2">Damage Events</h3>
            <div className="text-2xl font-bold text-red-300">
              {battleDetails.events.filter((e) => e.type === "damage").length}
            </div>
          </div>
          <div className="border border-red-500/30 bg-red-950/20 p-6 text-center">
            <h3 className="text-red-400 font-bold mb-2">Units Defeated</h3>
            <div className="text-2xl font-bold text-red-300">
              {battleDetails.events.filter((e) => e.type === "defeat").length}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
