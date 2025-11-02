import { useState, useCallback, useEffect } from "react";
import { useAccount } from "@starknet-react/core";
import { useEventQuery, useModels } from "@dojoengine/sdk/react";
import { ToriiQueryBuilder } from "@dojoengine/sdk";
import { ModelsMapping } from "../bindings/typescript/models.gen";

interface BattleEvent {
  type: "damage" | "defeat" | "round" | "battle";
  battle_id: number;
  data: any;
  round: number;
  sequence: number; // For ordering within a round
}

export function useBattleEvents() {
  const [battleLog, setBattleLog] = useState<string[]>([]);
  const [battleResult, setBattleResult] = useState<string | null>(null);
  const [lastBattleIdBeforeFight, setLastBattleIdBeforeFight] = useState<
    number | null
  >(null);
  const [isWaitingForBattle, setIsWaitingForBattle] = useState(false);

  const { address } = useAccount();

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

  const damageEvents = useModels(ModelsMapping.DamageDealt);
  const unitDefeatedEvents = useModels(ModelsMapping.UnitDefeated);
  const roundEvents = useModels(ModelsMapping.RoundCompleted);
  const battleEvents = useModels(ModelsMapping.BattleCompleted);
  const combatUnits = useModels(ModelsMapping.CombatUnit);

  const clearBattleState = useCallback(() => {
    setBattleLog([]);
    setBattleResult(null);
    setLastBattleIdBeforeFight(null);
    setIsWaitingForBattle(false);
  }, []);

  // Function to capture current battle_id before fight
  const prepareForBattle = useCallback(() => {
    if (!address || !Array.isArray(battleEvents)) {
      setLastBattleIdBeforeFight(0);
      setIsWaitingForBattle(true);
      return;
    }

    const paddedAddress = address.toLowerCase();
    let maxBattleId = 0;

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

    setLastBattleIdBeforeFight(maxBattleId);
    setIsWaitingForBattle(true);
    console.log(
      `[useBattleEvents] Prepared for battle. Last battle_id: ${maxBattleId}`,
    );
  }, [address, battleEvents]);

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
          mostRecentBattle = battleId;
        }
      }
    });

    // If we found a new battle, build the log
    if (mostRecentBattle !== null) {
      console.log(
        `[useBattleEvents] New battle detected: #${mostRecentBattle} (after ${lastBattleIdBeforeFight})`,
      );

      // Build battle log inline
      const battleId = mostRecentBattle;
      const allEvents: BattleEvent[] = [];

      // Collect damage events
      if (Array.isArray(damageEvents)) {
        damageEvents.forEach((eventObj: any) => {
          const entityId = Object.keys(eventObj)[0];
          const event = eventObj[entityId];
          if (event && Number(event.battle_id) === battleId) {
            allEvents.push({
              type: "damage",
              battle_id: battleId,
              data: event,
              round: Number(event.round),
              sequence: 0, // Will be set later
            });
          }
        });
      }

      // Collect defeat events
      if (Array.isArray(unitDefeatedEvents)) {
        unitDefeatedEvents.forEach((eventObj: any) => {
          const entityId = Object.keys(eventObj)[0];
          const event = eventObj[entityId];
          if (event && Number(event.battle_id) === battleId) {
            allEvents.push({
              type: "defeat",
              battle_id: battleId,
              data: event,
              round: Number(event.round),
              sequence: 0, // Will be set later
            });
          }
        });
      }

      // Collect round events
      if (Array.isArray(roundEvents)) {
        roundEvents.forEach((eventObj: any) => {
          const entityId = Object.keys(eventObj)[0];
          const event = eventObj[entityId];
          if (event && Number(event.battle_id) === battleId) {
            allEvents.push({
              type: "round",
              battle_id: battleId,
              data: event,
              round: Number(event.round),
              sequence: 999, // Round summaries come last
            });
          }
        });
      }

      // Collect battle completion event
      if (Array.isArray(battleEvents)) {
        battleEvents.forEach((eventObj: any) => {
          const entityId = Object.keys(eventObj)[0];
          const event = eventObj[entityId];
          if (event && Number(event.battle_id) === battleId) {
            allEvents.push({
              type: "battle",
              battle_id: battleId,
              data: event,
              round: 9999,
              sequence: 9999,
            });
          }
        });
      }

      // Group damage and defeat events - show defeat right after the damage that caused it
      const damageEventsMap = new Map<string, BattleEvent>();
      const defeatEventsMap = new Map<string, BattleEvent>();

      allEvents.forEach((event) => {
        if (event.type === "damage") {
          const key = `${event.round}-${event.data.target_id}`;
          damageEventsMap.set(key, event);
        } else if (event.type === "defeat") {
          const key = `${event.round}-${event.data.unit_id}`;
          defeatEventsMap.set(key, event);
        }
      });

      // Assign sequence numbers to interleave damage and defeat
      let sequenceCounter = 0;
      damageEventsMap.forEach((damageEvent, key) => {
        damageEvent.sequence = sequenceCounter++;
        const defeatEvent = defeatEventsMap.get(key);
        if (defeatEvent) {
          defeatEvent.sequence = sequenceCounter++;
        }
      });

      // Handle defeats that don't have corresponding damage in our map
      defeatEventsMap.forEach((defeatEvent) => {
        if (defeatEvent.sequence === 0) {
          defeatEvent.sequence = sequenceCounter++;
        }
      });

      // Sort events by round, then sequence
      allEvents.sort((a, b) => {
        if (a.round !== b.round) return a.round - b.round;
        return a.sequence - b.sequence;
      });

      console.log(
        `[useBattleEvents] Found ${allEvents.length} events for battle #${battleId}`,
      );

      // Build battle log
      const logEntries: string[] = [];

      let result: string | null = null;

      // Build a map of unit_id to type for better descriptions
      const unitTypes = new Map<number, boolean>(); // true = adventurer, false = beast

      // First, try to get all unit info from CombatUnit data for this battle
      if (Array.isArray(combatUnits)) {
        combatUnits.forEach((unitObj: any) => {
          const entityId = Object.keys(unitObj)[0];
          const unit = unitObj[entityId];
          if (unit && Number(unit.battle_id) === battleId) {
            unitTypes.set(Number(unit.unit_id), unit.is_adventurer);
            console.log(
              `[useBattleEvents] CombatUnit: ${unit.unit_id} is ${unit.is_adventurer ? "Adventurer" : "Beast"}`,
            );
          }
        });
      }

      // Also populate from defeat events as additional source
      allEvents.forEach((event) => {
        if (event.type === "defeat") {
          unitTypes.set(Number(event.data.unit_id), event.data.is_adventurer);
        }
      });

      // Fallback: look at defeat events to understand the pattern and infer other units
      const adventurerIds = new Set<number>();
      const beastIds = new Set<number>();

      allEvents.forEach((event) => {
        if (event.type === "defeat") {
          if (event.data.is_adventurer) {
            adventurerIds.add(Number(event.data.unit_id));
          } else {
            beastIds.add(Number(event.data.unit_id));
          }
        }
      });

      // Now infer types for all units mentioned in damage events
      allEvents.forEach((event) => {
        if (event.type === "damage") {
          const targetId = Number(event.data.target_id);
          const attackerId = Number(event.data.attacker_id);

          // If target is a known beast, attacker is likely an adventurer
          if (beastIds.has(targetId) && !unitTypes.has(attackerId)) {
            unitTypes.set(attackerId, true); // adventurer
          }
          // If target is a known adventurer, attacker is likely a beast
          if (adventurerIds.has(targetId) && !unitTypes.has(attackerId)) {
            unitTypes.set(attackerId, false); // beast
          }
          // If attacker is a known beast, target is likely an adventurer
          if (beastIds.has(attackerId) && !unitTypes.has(targetId)) {
            unitTypes.set(targetId, true); // adventurer
          }
          // If attacker is a known adventurer, target is likely a beast
          if (adventurerIds.has(attackerId) && !unitTypes.has(targetId)) {
            unitTypes.set(targetId, false); // beast
          }
        }
      });

      console.log(
        `[useBattleEvents] Unit types map size: ${unitTypes.size}`,
        Array.from(unitTypes.entries()),
      );

      allEvents.forEach((event) => {
        switch (event.type) {
          case "damage":
            const multiplier = Number(event.data.type_multiplier);
            const damage = Number(event.data.damage);
            const attackerId = Number(event.data.attacker_id);
            const targetId = Number(event.data.target_id);

            // Determine if attacker/target is adventurer or beast
            const attackerType = unitTypes.get(attackerId);
            const targetType = unitTypes.get(targetId);

            let effectText = "";
            if (multiplier === 150) {
              effectText = " It's super effective!";
            } else if (multiplier === 75) {
              effectText = " It's not very effective...";
            }

            // Create more descriptive message
            let attackerDesc = `Unit #${attackerId}`;
            let targetDesc = `Unit #${targetId}`;

            if (attackerType !== undefined) {
              attackerDesc = attackerType
                ? `Adventurer #${attackerId}`
                : `Beast #${attackerId}`;
            }

            if (targetType !== undefined) {
              targetDesc = targetType
                ? `Adventurer #${targetId}`
                : `Beast #${targetId}`;
            }

            logEntries.push(
              `> ${attackerDesc} dealt ${damage} HP damage to ${targetDesc}.${effectText}`,
            );
            break;

          case "defeat":
            const unitType = event.data.is_adventurer ? "Adventurer" : "Beast";
            const position = Number(event.data.position) + 1;
            logEntries.push(
              `  💀 ${unitType} #${event.data.unit_id} (Position ${position}) fainted!`,
            );
            break;

          case "round":
            logEntries.push(
              `\n--- Round ${event.data.round} End ---\nAdventurers: ${event.data.attacker_survivors} remaining | Beasts: ${event.data.defender_survivors} remaining\n`,
            );
            break;

          case "battle":
            const isVictory =
              event.data.winner?.toLowerCase() === address?.toLowerCase();
            result = isVictory ? "Victory!" : "Defeat!";
            const resultText = isVictory
              ? "You won the battle!"
              : "You were defeated!";
            logEntries.push(
              `\n═══════════════════════════════\n${resultText}\nBattle #${battleId} complete!\n═══════════════════════════════`,
            );
            break;
        }
      });

      setBattleLog(logEntries);
      setBattleResult(result);
      setIsWaitingForBattle(false);

      console.log(
        `[useBattleEvents] Battle log created with ${logEntries.length} entries. Result: ${result}`,
      );
    }
  }, [
    battleEvents,
    damageEvents,
    unitDefeatedEvents,
    roundEvents,
    combatUnits,
    address,
    lastBattleIdBeforeFight,
  ]);

  return {
    battleLog,
    battleResult,
    clearBattleState,
    prepareForBattle,
    isWaitingForBattle,
  };
}
