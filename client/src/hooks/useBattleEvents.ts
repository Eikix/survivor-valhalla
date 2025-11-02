import { useState, useCallback, useEffect } from "react";
import { useAccount } from "@starknet-react/core";
import { useEventQuery, useModels } from "@dojoengine/sdk/react";
import { ToriiQueryBuilder } from "@dojoengine/sdk";
import { ModelsMapping } from "../bindings/typescript/models.gen";
import { useNavigate } from "react-router-dom";

export function useBattleEvents() {
  const [battleLog, setBattleLog] = useState<string[]>([]);
  const [battleResult, setBattleResult] = useState<string | null>(null);
  const [lastBattleIdBeforeFight, setLastBattleIdBeforeFight] = useState<
    number | null
  >(null);
  const [isWaitingForBattle, setIsWaitingForBattle] = useState(false);

  const { address } = useAccount();
  const navigate = useNavigate();

  // Query all battle-related events
  useEventQuery(
    new ToriiQueryBuilder()
      .includeHashedKeys()
      .withEntityModels([
        ModelsMapping.DamageDealt,
        ModelsMapping.UnitDefeated,
        ModelsMapping.RoundCompleted,
        ModelsMapping.BattleCompleted,
        ModelsMapping.CombatUnit,
      ]),
  );

  const battleEvents = useModels(ModelsMapping.BattleCompleted);

  const clearBattleState = useCallback(() => {
    setBattleLog([]);
    setBattleResult(null);
    setLastBattleIdBeforeFight(null);
    setIsWaitingForBattle(false);
  }, []);

  // Function to prepare for battle after transaction is confirmed
  const prepareForBattle = useCallback(() => {
    // Capture the current highest battle ID before the new one arrives
    let maxBattleId = 0;
    if (address && Array.isArray(battleEvents)) {
      const paddedAddress = address.toLowerCase();

      battleEvents.forEach((eventObj: any) => {
        const entityId = Object.keys(eventObj)[0];
        const event = eventObj[entityId];

        if (event && event.attacker?.toLowerCase() === paddedAddress) {
          const battleId = Number(event.battle_id);
          if (battleId > maxBattleId) {
            maxBattleId = battleId;
          }
        }
      });
    }

    setLastBattleIdBeforeFight(maxBattleId);
    setIsWaitingForBattle(true);

    // Navigate to loading page with the last battle ID as a parameter
    navigate(`/battle/loading?lastBattleId=${maxBattleId}`);
    console.log(
      `[useBattleEvents] Prepared for battle. Last battle_id: ${maxBattleId}`,
    );
  }, [address, battleEvents, navigate]);

  useEffect(() => {
    console.log("battleEvents haha", battleEvents);
  }, [battleEvents]);

  // Listen for new BattleCompleted events where we're the attacker
  useEffect(() => {
    // Only show logs if we've prepared for battle (clicked the button)
    if (
      !address ||
      !Array.isArray(battleEvents) ||
      lastBattleIdBeforeFight === null
    )
      return;

    const paddedAddress = address.toLowerCase();

    // Find the most recent battle where we're the attacker with battle_id > lastBattleIdBeforeFight
    let mostRecentBattle: number | null = null;

    battleEvents.forEach((eventObj: any) => {
      const entityId = Object.keys(eventObj)[0];
      const event = eventObj[entityId];

      if (event && event.attacker?.toLowerCase() === paddedAddress) {
        const battleId = Number(event.battle_id);

        // Only consider battles with ID strictly greater than lastBattleIdBeforeFight
        if (
          battleId > lastBattleIdBeforeFight &&
          (mostRecentBattle === null || battleId > mostRecentBattle)
        ) {
          console.log("found the fight battleId", battleId);
          mostRecentBattle = battleId;
        }
      }
    });

    // If we found a new battle, navigate to battle page
    if (mostRecentBattle !== null) {
      console.log(
        `[useBattleEvents] New battle detected: #${mostRecentBattle} (after ${lastBattleIdBeforeFight})`,
      );

      // Navigate to battle page with the battle ID
      navigate(`/battle/${mostRecentBattle}`);
      return;
    }
  }, [battleEvents, address, lastBattleIdBeforeFight, navigate]);

  return {
    battleLog,
    battleResult,
    clearBattleState,
    prepareForBattle,
    isWaitingForBattle,
  };
}
