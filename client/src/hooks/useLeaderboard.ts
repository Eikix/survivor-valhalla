import { useMemo } from "react";

export interface LeaderboardEntry {
  address: string;
  wins: number;
  losses: number;
  total: number;
  winRate: number;
  ratio: number;
  rank: number;
}

export type LeaderboardSort = "wins" | "winRate" | "total" | "ratio";

interface UseLeaderboardOptions {
  sortBy?: LeaderboardSort;
  minBattles?: number; // Minimum battles to appear on leaderboard
  limit?: number; // Top N players
}

export function useLeaderboard(
  battleCompletedEvents: any,
  options: UseLeaderboardOptions = {},
) {
  const { sortBy = "wins", minBattles = 1, limit = 100 } = options;

  return useMemo(() => {
    if (!Array.isArray(battleCompletedEvents)) {
      return {
        leaderboard: [],
        isLoading: battleCompletedEvents === undefined,
      };
    }

    // Aggregate stats per player
    const playerStatsMap = new Map<
      string,
      {
        wins: number;
        losses: number;
      }
    >();

    battleCompletedEvents.forEach((battleObj: any) => {
      const entityId = Object.keys(battleObj)[0];
      const battle = battleObj[entityId];

      if (!battle) return;

      const attacker = battle.attacker?.toLowerCase();
      const defender = battle.defender?.toLowerCase();
      const winner = battle.winner?.toLowerCase();

      if (!attacker || !defender || !winner) return;

      // Initialize players if not exist
      if (!playerStatsMap.has(attacker)) {
        playerStatsMap.set(attacker, { wins: 0, losses: 0 });
      }
      if (!playerStatsMap.has(defender)) {
        playerStatsMap.set(defender, { wins: 0, losses: 0 });
      }

      // Update stats
      const attackerStats = playerStatsMap.get(attacker)!;
      const defenderStats = playerStatsMap.get(defender)!;

      if (winner === attacker) {
        attackerStats.wins++;
        defenderStats.losses++;
      } else if (winner === defender) {
        defenderStats.wins++;
        attackerStats.losses++;
      }
    });

    // Convert to array and calculate derived stats
    let leaderboard: LeaderboardEntry[] = Array.from(
      playerStatsMap.entries(),
    ).map(([address, stats]) => {
      const total = stats.wins + stats.losses;
      const winRate = total > 0 ? (stats.wins / total) * 100 : 0;
      const ratio = stats.losses > 0 ? stats.wins / stats.losses : stats.wins;

      return {
        address,
        wins: stats.wins,
        losses: stats.losses,
        total,
        winRate,
        ratio,
        rank: 0, // Will be assigned after sorting
      };
    });

    // Filter by minimum battles
    leaderboard = leaderboard.filter((entry) => entry.total >= minBattles);

    // Sort based on criteria
    leaderboard.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case "wins":
          comparison = b.wins - a.wins;
          break;
        case "winRate":
          comparison = b.winRate - a.winRate;
          // Tiebreaker: more total battles wins
          if (comparison === 0) {
            comparison = b.total - a.total;
          }
          break;
        case "total":
          comparison = b.total - a.total;
          break;
        case "ratio":
          comparison = b.ratio - a.ratio;
          break;
      }

      // Final tiebreaker: address for stability
      if (comparison === 0) {
        comparison = a.address.localeCompare(b.address);
      }

      return comparison;
    });

    // Limit results and assign ranks
    leaderboard = leaderboard.slice(0, limit).map((entry, index) => ({
      ...entry,
      rank: index + 1,
    }));

    return {
      leaderboard,
      isLoading: false,
    };
  }, [battleCompletedEvents, sortBy, minBattles, limit]);
}

