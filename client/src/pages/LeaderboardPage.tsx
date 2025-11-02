import { motion } from "framer-motion";
import { useState } from "react";
import { useEventQuery, useModels } from "@dojoengine/sdk/react";
import { ToriiQueryBuilder } from "@dojoengine/sdk";
import { Navbar } from "../components/navbar";
import { ModelsMapping } from "../bindings/typescript/models.gen";
import { useLeaderboard, type LeaderboardSort } from "../hooks/useLeaderboard";
import { AddressDisplay } from "../components/AddressDisplay";
import { Trophy, TrendingUp, Target, Award } from "lucide-react";
import { useAccount } from "@starknet-react/core";
import { addAddressPadding } from "starknet";

export function LeaderboardPage() {
  const [sortBy, setSortBy] = useState<LeaderboardSort>("wins");
  const [minBattles, setMinBattles] = useState(5);
  const { address } = useAccount();

  // Query all battle completed events
  useEventQuery(
    new ToriiQueryBuilder()
      .includeHashedKeys()
      .withEntityModels([ModelsMapping.BattleCompleted])
      .withLimit(10000),
  );

  const battleCompletedEvents = useModels(ModelsMapping.BattleCompleted);
  const { leaderboard, isLoading } = useLeaderboard(battleCompletedEvents, {
    sortBy,
    minBattles,
    limit: 100,
  });

  // Find current user's rank
  const paddedAddress = address
    ? addAddressPadding(address.toLowerCase()).toLowerCase()
    : null;
  const userEntry = leaderboard.find(
    (entry) => entry.address === paddedAddress,
  );

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0">
        <motion.div
          animate={{ opacity: [0.1, 0.15, 0.1] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-amber-600/10 rounded-full blur-[150px]"
        />
      </div>

      <Navbar />

      <div className="relative z-10 container mx-auto px-3 sm:px-4 py-6 sm:py-8 md:py-12 max-w-6xl">
        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8 sm:mb-12"
        >
          <h1
            className="text-3xl sm:text-5xl md:text-6xl font-bold mb-2 text-amber-500"
            style={{
              textShadow: "0 0 30px rgba(245, 158, 11, 0.3)",
              fontFamily: "serif",
            }}
          >
            HALL OF FAME
          </h1>
          <p className="text-amber-200/40 text-xs sm:text-sm tracking-widest uppercase">
            The Greatest Warriors of Valhalla
          </p>
        </motion.div>

        {/* User's Rank Card - If ranked */}
        {userEntry && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 border-2 border-emerald-500/50 bg-gradient-to-br from-emerald-950/40 via-emerald-950/20 to-black/40 p-4 sm:p-6"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="text-3xl sm:text-4xl font-bold text-emerald-400">
                  #{userEntry.rank}
                </div>
                <div>
                  <div className="text-emerald-300 font-bold text-sm sm:text-base">
                    Your Rank
                  </div>
                  <div className="text-emerald-200/60 text-xs">
                    {userEntry.wins}W - {userEntry.losses}L (
                    {userEntry.winRate.toFixed(1)}%)
                  </div>
                </div>
              </div>
              <Trophy className="w-8 h-8 sm:w-12 sm:h-12 text-emerald-400" />
            </div>
          </motion.div>
        )}

        {/* Filters */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-6 flex flex-col sm:flex-row gap-3 sm:gap-4 items-start sm:items-center justify-between"
        >
          <div className="flex flex-wrap gap-2">
            <span className="text-amber-200/60 text-sm font-bold uppercase tracking-wider">
              Sort By:
            </span>
            {[
              { key: "wins", label: "Total Wins", icon: Trophy },
              { key: "winRate", label: "Win Rate", icon: TrendingUp },
              { key: "total", label: "Battles", icon: Target },
              { key: "ratio", label: "W/L Ratio", icon: Award },
            ].map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setSortBy(key as LeaderboardSort)}
                className={`flex items-center gap-1 px-3 py-1.5 text-xs font-bold uppercase rounded transition-all ${
                  sortBy === key
                    ? "bg-amber-500/20 text-amber-400 border border-amber-500/50"
                    : "bg-amber-500/5 text-amber-200/60 border border-amber-500/20 hover:text-amber-300"
                }`}
              >
                <Icon className="w-3 h-3" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-amber-200/60 text-xs font-bold uppercase">
              Min Battles:
            </span>
            <select
              value={minBattles}
              onChange={(e) => setMinBattles(Number(e.target.value))}
              className="bg-amber-950/30 border border-amber-500/30 rounded px-2 py-1 text-xs text-amber-300 focus:outline-none focus:border-amber-500/50"
            >
              <option value={1}>1+</option>
              <option value={5}>5+</option>
              <option value={10}>10+</option>
              <option value={25}>25+</option>
              <option value={50}>50+</option>
            </select>
          </div>
        </motion.div>

        {/* Leaderboard Table */}
        {isLoading ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center border border-amber-500/30 bg-amber-950/20 p-12"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              className="w-16 h-16 mx-auto mb-6 border-4 border-amber-500/30 border-t-amber-500 rounded-full"
            />
            <h2 className="text-2xl font-bold text-amber-400 mb-4 tracking-wider uppercase">
              Loading Leaderboard
            </h2>
          </motion.div>
        ) : leaderboard.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center border border-amber-500/30 bg-amber-950/20 p-12"
          >
            <Trophy className="w-16 h-16 text-amber-500/50 mx-auto mb-6" />
            <h2 className="text-2xl font-bold text-amber-400 mb-4 tracking-wider uppercase">
              No Warriors Yet
            </h2>
            <p className="text-amber-200/60 text-sm">
              Be the first to enter the Hall of Fame!
            </p>
          </motion.div>
        ) : (
          <div className="border border-amber-500/30 bg-amber-950/10 overflow-hidden">
            {/* Table Header */}
            <div className="grid grid-cols-[auto_1fr_repeat(4,auto)] gap-2 sm:gap-4 px-3 sm:px-6 py-3 sm:py-4 bg-amber-950/30 border-b border-amber-500/20 text-xs sm:text-sm font-bold text-amber-400 uppercase tracking-wider">
              <div className="text-center">Rank</div>
              <div>Warrior</div>
              <div className="text-center">Wins</div>
              <div className="text-center hidden sm:block">Losses</div>
              <div className="text-center">W/L</div>
              <div className="text-center">Win %</div>
            </div>

            {/* Table Body */}
            <div className="divide-y divide-amber-500/10">
              {leaderboard.map((entry, index) => {
                const isCurrentUser = entry.address === paddedAddress;
                const isTopThree = entry.rank <= 3;

                return (
                  <motion.div
                    key={entry.address}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.02 }}
                    className={`grid grid-cols-[auto_1fr_repeat(4,auto)] gap-2 sm:gap-4 px-3 sm:px-6 py-3 sm:py-4 items-center transition-colors ${
                      isCurrentUser
                        ? "bg-emerald-950/30 border-l-4 border-emerald-500"
                        : isTopThree
                          ? "bg-amber-950/20"
                          : "hover:bg-amber-950/10"
                    }`}
                  >
                    {/* Rank */}
                    <div className="flex items-center justify-center">
                      {isTopThree ? (
                        <div
                          className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center font-bold text-sm sm:text-base ${
                            entry.rank === 1
                              ? "bg-yellow-500/20 text-yellow-400 border-2 border-yellow-500"
                              : entry.rank === 2
                                ? "bg-gray-400/20 text-gray-300 border-2 border-gray-400"
                                : "bg-orange-600/20 text-orange-400 border-2 border-orange-600"
                          }`}
                        >
                          {entry.rank}
                        </div>
                      ) : (
                        <div className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center text-amber-200/60 font-mono text-sm sm:text-base">
                          {entry.rank}
                        </div>
                      )}
                    </div>

                    {/* Address */}
                    <div className="min-w-0">
                      <AddressDisplay
                        address={entry.address}
                        className={`text-xs sm:text-sm ${
                          isCurrentUser
                            ? "text-emerald-300 font-bold"
                            : "text-amber-200"
                        }`}
                      />
                    </div>

                    {/* Wins */}
                    <div className="text-center text-green-400 font-bold text-sm sm:text-base">
                      {entry.wins}
                    </div>

                    {/* Losses - Hidden on mobile */}
                    <div className="hidden sm:block text-center text-red-400 font-bold text-sm sm:text-base">
                      {entry.losses}
                    </div>

                    {/* Ratio */}
                    <div className="text-center text-amber-300 font-mono text-xs sm:text-sm">
                      {entry.ratio.toFixed(2)}
                    </div>

                    {/* Win Rate */}
                    <div
                      className={`text-center font-bold text-sm sm:text-base ${
                        entry.winRate >= 60
                          ? "text-green-400"
                          : entry.winRate >= 40
                            ? "text-yellow-400"
                            : "text-red-400"
                      }`}
                    >
                      {entry.winRate.toFixed(1)}%
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

