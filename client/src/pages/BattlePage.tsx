import { motion } from "framer-motion";
import { useParams } from "react-router-dom";
import { Swords } from "lucide-react";
import { Navbar } from "../components/navbar";
import { useBattleDetails } from "../hooks/useBattleDetails";

export function BattlePage() {
  const { battleId } = useParams<{ battleId: string }>();
  const numericBattleId = battleId ? parseInt(battleId, 10) : 0;
  const { battleDetails } = useBattleDetails(numericBattleId);

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
              {battleDetails.attacker.slice(0, 8)}...{battleDetails.attacker.slice(-6)}
            </span>
            <Swords className="w-4 h-4" />
            <span>
              {battleDetails.defender.slice(0, 8)}...{battleDetails.defender.slice(-6)}
            </span>
          </div>
          <div className="mt-2">
            <span className={`font-bold ${battleDetails.isVictory ? 'text-green-400' : 'text-red-400'}`}>
              {battleDetails.isVictory ? 'VICTORY' : 'DEFEAT'}
            </span>
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
                  const isSeparator = logEntry.includes("---") || logEntry.includes("═══");
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
              {battleDetails.events.filter(e => e.type === 'damage').length}
            </div>
          </div>
          <div className="border border-red-500/30 bg-red-950/20 p-6 text-center">
            <h3 className="text-red-400 font-bold mb-2">Units Defeated</h3>
            <div className="text-2xl font-bold text-red-300">
              {battleDetails.events.filter(e => e.type === 'defeat').length}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}