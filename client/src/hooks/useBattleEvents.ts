import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useAccount } from '@starknet-react/core';
import { useEventQuery, useModels } from '@dojoengine/sdk/react';
import { ToriiQueryBuilder } from '@dojoengine/sdk';
import { ModelsMapping } from '../bindings/typescript/models.gen';

interface BattleEvent {
  type: 'damage' | 'defeat' | 'round' | 'battle';
  battle_id: number;
  data: any;
  order: number; // For proper event ordering
}

export function useBattleEvents() {
  const [battleInProgress, setBattleInProgress] = useState<boolean>(false);
  const [battleLog, setBattleLog] = useState<string[]>([]);
  const [battleResult, setBattleResult] = useState<string | null>(null);
  const [currentBattleId, setCurrentBattleId] = useState<number | null>(null);
  
  const timeoutRef = useRef< ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const processedEventsRef = useRef<Set<string>>(new Set());

  const { address } = useAccount();

  // Query all battle-related entities using the proper Dojo pattern
  useEventQuery(
    new ToriiQueryBuilder()
      .includeHashedKeys()
      .withEntityModels([
        ModelsMapping.DamageDealt,
        ModelsMapping.UnitDefeated, 
        ModelsMapping.RoundCompleted,
        ModelsMapping.BattleCompleted
      ]),
  );

  // Get all battle event models
  const damageEvents = useModels(ModelsMapping.DamageDealt);
  const defeatEvents = useModels(ModelsMapping.UnitDefeated);
  const roundEvents = useModels(ModelsMapping.RoundCompleted);
  const battleEvents = useModels(ModelsMapping.BattleCompleted);

  const clearBattleState = useCallback(() => {
    setBattleResult(null);
    setBattleLog([]);
    setBattleInProgress(false);
    setCurrentBattleId(null);
    startTimeRef.current = null;
    processedEventsRef.current.clear();
    
    // Clear timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // Convert raw model data to standardized BattleEvent format for current battle only
  const currentBattleEvents = useMemo((): BattleEvent[] => {
    if (!battleInProgress || !currentBattleId) return [];

    const allEvents: BattleEvent[] = [];

    // Process damage events for current battle
    if (Array.isArray(damageEvents)) {
      damageEvents.forEach((eventObj: any) => {
        const entityId = Object.keys(eventObj)[0];
        const event = eventObj[entityId];
        if (event && Number(event.battle_id) === currentBattleId) {
          allEvents.push({
            type: 'damage',
            battle_id: Number(event.battle_id),
            data: event,
            order: 1 // Damage events happen first in each exchange
          });
        }
      });
    }

    // Process defeat events for current battle  
    if (Array.isArray(defeatEvents)) {
      defeatEvents.forEach((eventObj: any) => {
        const entityId = Object.keys(eventObj)[0];
        const event = eventObj[entityId];
        if (event && Number(event.battle_id) === currentBattleId) {
          allEvents.push({
            type: 'defeat',
            battle_id: Number(event.battle_id),
            data: event,
            order: 2 // Defeats happen after damage
          });
        }
      });
    }

    // Process round events for current battle
    if (Array.isArray(roundEvents)) {
      roundEvents.forEach((eventObj: any) => {
        const entityId = Object.keys(eventObj)[0];
        const event = eventObj[entityId];
        if (event && Number(event.battle_id) === currentBattleId) {
          allEvents.push({
            type: 'round',
            battle_id: Number(event.battle_id),
            data: event,
            order: 3 // Round completion happens after all combat
          });
        }
      });
    }

    // Process battle completion events for current battle
    if (Array.isArray(battleEvents)) {
      battleEvents.forEach((eventObj: any) => {
        const entityId = Object.keys(eventObj)[0];
        const event = eventObj[entityId];
        if (event && Number(event.battle_id) === currentBattleId) {
          allEvents.push({
            type: 'battle',
            battle_id: Number(event.battle_id),
            data: event,
            order: 4 // Battle completion is final
          });
        }
      });
    }

    // Sort events by type order for proper battle flow
    allEvents.sort((a, b) => a.order - b.order);

    return allEvents;
  }, [damageEvents, defeatEvents, roundEvents, battleEvents, battleInProgress, currentBattleId]);

  const processEvents = useCallback((events: BattleEvent[]) => {
    if (!battleInProgress) return;

    const newLogEntries: string[] = [];

    events.forEach((event) => {
      // Create a unique key for this event to avoid duplicates
      const eventKey = `${event.type}-${event.battle_id}-${JSON.stringify(event.data)}`;
      if (processedEventsRef.current.has(eventKey)) return;
      
      processedEventsRef.current.add(eventKey);

      switch (event.type) {
        case 'damage':
          const multiplierText = Number(event.data.type_multiplier) === 150 ? " (Super effective!)" : 
                               Number(event.data.type_multiplier) === 75 ? " (Not very effective)" : "";
          newLogEntries.push(
            `Unit ${event.data.attacker_id} attacks Unit ${event.data.target_id} for ${event.data.damage} damage${multiplierText}`
          );
          break;
          
        case 'defeat':
          const unitType = event.data.is_adventurer ? "Adventurer" : "Beast";
          newLogEntries.push(
            `💀 ${unitType} ${event.data.unit_id} at position ${event.data.position} has been defeated!`
          );
          break;
          
        case 'round':
          newLogEntries.push(
            `🏁 Round ${event.data.round} completed! Survivors: ${event.data.attacker_survivors} vs ${event.data.defender_survivors}`
          );
          break;
          
        case 'battle':
          const isVictory = event.data.winner?.toLowerCase() === address?.toLowerCase();
          setBattleResult(isVictory ? "Victory!" : "Defeat!");
          setBattleInProgress(false);
          newLogEntries.push(
            `⚔️ Battle ${event.battle_id} completed! Winner: ${event.data.winner.slice(0, 6)}...${event.data.winner.slice(-4)}`
          );
          
          // Clear timeout when battle completes
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }
          break;
      }
    });

    if (newLogEntries.length > 0) {
      setBattleLog(prev => [...prev, ...newLogEntries]);
    }
  }, [battleInProgress, address]);

  // Process new events when model data changes
  useEffect(() => {
    if (currentBattleEvents.length > 0) {
      processEvents(currentBattleEvents);
    }
  }, [currentBattleEvents, processEvents]);

  // Auto-detect battle ID from any new events
  useEffect(() => {
    if (!battleInProgress || currentBattleId) return;

    // Check all event types for a battle ID to auto-detect current battle
    const allEventArrays = [damageEvents, defeatEvents, roundEvents, battleEvents];
    
    for (const eventArray of allEventArrays) {
      if (Array.isArray(eventArray) && eventArray.length > 0) {
        const recentEvent = eventArray[eventArray.length - 1]; // Get most recent event
        const entityId = Object.keys(recentEvent)[0];
        const event = recentEvent[entityId];
        
        if (event && event.battle_id) {
          const battleId = Number(event.battle_id);
          setCurrentBattleId(battleId);
          return;
        }
      }
    }
  }, [damageEvents, defeatEvents, roundEvents, battleEvents, battleInProgress, currentBattleId]);

  const startBattle = useCallback(() => {
    setBattleResult(null);
    setBattleInProgress(true);
    setBattleLog([]);
    setCurrentBattleId(null); // Will be auto-detected from first event
    
    startTimeRef.current = Date.now();
    processedEventsRef.current.clear();
    
    // Set up timeout to stop battle after 30 seconds if no completion
    timeoutRef.current = setTimeout(() => {
      setBattleInProgress(false);
      startTimeRef.current = null;
    }, 30000);
    
  }, []);

  return {
    // State
    battleInProgress,
    battleLog,
    battleResult,
    currentBattleId,
    // Actions
    startBattle,
    clearBattleState,
  };
}
