import { useMemo } from "react";
import { useAccount } from "@starknet-react/core";
import {
  useEventQuery,
  useModels,
  useEntityQuery,
} from "@dojoengine/sdk/react";
import { ToriiQueryBuilder } from "@dojoengine/sdk";
import { ModelsMapping } from "../bindings/typescript/models.gen";

interface BattleEvent {
  type: "damage" | "defeat" | "round" | "battle";
  battle_id: number;
  data: any;
  round: number;
  sequence: number;
}

interface BattleDetails {
  battleId: number;
  attacker: string;
  defender: string;
  winner: string;
  timestamp: number;
  events: BattleEvent[];
  battleLog: string[];
  isVictory: boolean;
  attackerLineup: any;
  defenderLineup: any;
}

export function useBattleDetails(battleId: number) {
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

  // Query lineup models
  useEntityQuery(
    new ToriiQueryBuilder()
      .includeHashedKeys()
      .withEntityModels([
        ModelsMapping.AttackLineup,
        ModelsMapping.BeastLineup,
      ]),
  );

  const damageEvents = useModels(ModelsMapping.DamageDealt);
  const unitDefeatedEvents = useModels(ModelsMapping.UnitDefeated);
  const roundEvents = useModels(ModelsMapping.RoundCompleted);
  const battleEvents = useModels(ModelsMapping.BattleCompleted);
  const combatUnits = useModels(ModelsMapping.CombatUnit);
  const attackLineups = useModels(ModelsMapping.AttackLineup);
  const beastLineups = useModels(ModelsMapping.BeastLineup);

  const battleDetails: BattleDetails | null = useMemo(() => {
    if (!Array.isArray(battleEvents) || battleId <= 0) return null;

    // Find the battle completion event for this battle
    let battleCompletionEvent: any = null;
    battleEvents.forEach((eventObj: any) => {
      const entityId = Object.keys(eventObj)[0];
      const event = eventObj[entityId];
      if (event && Number(event.battle_id) === battleId) {
        battleCompletionEvent = event;
      }
    });

    if (!battleCompletionEvent) return null;

    // Collect all events for this battle
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
            round: Number(event.round) || 1,
            sequence: 0,
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
            round: Number(event.round) || 1,
            sequence: 0,
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
            round: Number(event.round) || 1,
            sequence: 999,
          });
        }
      });
    }

    // Add battle completion event
    allEvents.push({
      type: "battle",
      battle_id: battleId,
      data: battleCompletionEvent,
      round: 9999,
      sequence: 9999,
    });

    // Sort events
    allEvents.sort((a, b) => {
      if (a.round !== b.round) return a.round - b.round;
      return a.sequence - b.sequence;
    });

    // Build unit types map
    const unitTypes = new Map<number, boolean>();
    if (Array.isArray(combatUnits)) {
      combatUnits.forEach((unitObj: any) => {
        const entityId = Object.keys(unitObj)[0];
        const unit = unitObj[entityId];
        if (unit && Number(unit.battle_id) === battleId) {
          unitTypes.set(Number(unit.unit_id), unit.is_adventurer);
        }
      });
    }

    // Build battle log
    const logEntries: string[] = [];
    allEvents.forEach((event) => {
      switch (event.type) {
        case "damage":
          const multiplier = Number(event.data.type_multiplier);
          const damage = Number(event.data.damage);
          const attackerId = Number(event.data.attacker_id);
          const targetId = Number(event.data.target_id);

          const attackerType = unitTypes.get(attackerId);
          const targetType = unitTypes.get(targetId);

          let effectText = "";
          if (multiplier === 150) {
            effectText = " It's super effective!";
          } else if (multiplier === 75) {
            effectText = " It's not very effective...";
          }

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
          const resultText = isVictory
            ? "You won the battle!"
            : "You were defeated!";
          logEntries.push(
            `\n═══════════════════════════════\n${resultText}\nBattle #${battleId} complete!\n═══════════════════════════════`,
          );
          break;
      }
    });

    // Get lineups
    let attackerLineup: any = null;
    let defenderLineup: any = null;

    if (Array.isArray(attackLineups)) {
      attackLineups.forEach((lineupObj: any) => {
        const entityId = Object.keys(lineupObj)[0];
        const lineup = lineupObj[entityId];
        if (
          lineup &&
          lineup.player?.toLowerCase() ===
            battleCompletionEvent.attacker?.toLowerCase()
        ) {
          attackerLineup = lineup;
        }
      });
    }

    if (Array.isArray(beastLineups)) {
      beastLineups.forEach((lineupObj: any) => {
        const entityId = Object.keys(lineupObj)[0];
        const lineup = lineupObj[entityId];
        if (
          lineup &&
          lineup.player?.toLowerCase() ===
            battleCompletionEvent.defender?.toLowerCase()
        ) {
          defenderLineup = lineup;
        }
      });
    }

    return {
      battleId,
      attacker: battleCompletionEvent.attacker,
      defender: battleCompletionEvent.defender,
      winner: battleCompletionEvent.winner,
      timestamp: battleCompletionEvent.timestamp,
      events: allEvents,
      battleLog: logEntries,
      isVictory:
        battleCompletionEvent.winner?.toLowerCase() === address?.toLowerCase(),
      attackerLineup,
      defenderLineup,
    };
  }, [
    battleEvents,
    damageEvents,
    unitDefeatedEvents,
    roundEvents,
    combatUnits,
    attackLineups,
    beastLineups,
    battleId,
    address,
  ]);

  return {
    battleDetails,
  };
}
