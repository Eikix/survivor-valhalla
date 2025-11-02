import { motion } from "framer-motion";
import { Trophy, Skull, Target, TrendingUp } from "lucide-react";

interface PlayerStatsCardProps {
  wins: number;
  losses: number;
  total: number;
  winRate: number;
  ratio: number;
  isLoading: boolean;
}

export function PlayerStatsCard({
  wins,
  losses,
  total,
  winRate,
  ratio,
  isLoading,
}: PlayerStatsCardProps) {
  if (isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="border border-emerald-500/30 bg-emerald-950/20 p-4 sm:p-6"
      >
        <div className="text-center text-emerald-400/60">Loading stats...</div>
      </motion.div>
    );
  }

  if (total === 0) {
    return null; // Don't show if no battles
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="border border-emerald-500/30 bg-gradient-to-br from-emerald-950/30 via-emerald-950/20 to-black/40 p-4 sm:p-6 mb-6 sm:mb-8"
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {/* Total Battles */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Target className="w-4 h-4 text-emerald-400" />
            <h4 className="text-emerald-400 font-bold text-xs uppercase tracking-wider">
              Battles
            </h4>
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-emerald-300">
            {total}
          </div>
        </div>

        {/* Wins */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Trophy className="w-4 h-4 text-yellow-400" />
            <h4 className="text-yellow-400 font-bold text-xs uppercase tracking-wider">
              Wins
            </h4>
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-yellow-300">
            {wins}
          </div>
        </div>

        {/* Losses */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Skull className="w-4 h-4 text-red-400" />
            <h4 className="text-red-400 font-bold text-xs uppercase tracking-wider">
              Losses
            </h4>
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-red-300">
            {losses}
          </div>
        </div>

        {/* Win Rate */}
        <div className="text-center col-span-2 sm:col-span-1">
          <div className="flex items-center justify-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <h4 className="text-emerald-400 font-bold text-xs uppercase tracking-wider">
              Win Rate
            </h4>
          </div>
          <div
            className={`text-2xl sm:text-3xl font-bold ${
              winRate >= 60
                ? "text-green-300"
                : winRate >= 40
                  ? "text-yellow-300"
                  : "text-red-300"
            }`}
          >
            {winRate.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* W/L Ratio Bar */}
      <div className="mt-4">
        <div className="flex justify-between text-xs text-emerald-200/60 mb-1">
          <span>Win/Loss Ratio: {ratio.toFixed(2)}</span>
          <span>
            {wins}W - {losses}L
          </span>
        </div>
        <div className="w-full bg-red-900/40 rounded-full h-3 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${winRate}%` }}
            transition={{ duration: 1, ease: "easeOut" }}
            className="bg-gradient-to-r from-green-600 to-green-400 h-3 rounded-full"
          />
        </div>
      </div>
    </motion.div>
  );
}

