import { useMemo } from "react";
import { useAccount } from "@starknet-react/core";
import { addAddressPadding } from "starknet";

interface PlayerStats {
  wins: number;
  losses: number;
  total: number;
  winRate: number;
  ratio: number;
  isLoading: boolean;
}

export function usePlayerStats(battleCompletedEvents: any): PlayerStats {
  const { address } = useAccount();

  return useMemo(() => {
    const defaultStats = {
      wins: 0,
      losses: 0,
      total: 0,
      winRate: 0,
      ratio: 0,
      isLoading: battleCompletedEvents === undefined,
    };

    if (!address || !Array.isArray(battleCompletedEvents)) {
      return defaultStats;
    }

    const paddedAddress = addAddressPadding(address.toLowerCase()).toLowerCase();

    let wins = 0;
    let losses = 0;

    battleCompletedEvents.forEach((battleObj: any) => {
      const entityId = Object.keys(battleObj)[0];
      const battle = battleObj[entityId];

      if (!battle) return;

      // Check if user participated in this battle
      const isParticipant =
        battle.attacker?.toLowerCase() === paddedAddress ||
        battle.defender?.toLowerCase() === paddedAddress;

      if (!isParticipant) return;

      // Check if user won
      const isWinner = battle.winner?.toLowerCase() === paddedAddress;

      if (isWinner) {
        wins++;
      } else {
        losses++;
      }
    });

    const total = wins + losses;
    const winRate = total > 0 ? (wins / total) * 100 : 0;
    const ratio = losses > 0 ? wins / losses : wins > 0 ? wins : 0;

    return {
      wins,
      losses,
      total,
      winRate,
      ratio,
      isLoading: false,
    };
  }, [address, battleCompletedEvents]);
}

