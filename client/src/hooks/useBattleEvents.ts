import { useState, useCallback, useRef, useEffect } from 'react';
import { useDojoSDK } from '@dojoengine/sdk/react';
import { ToriiQueryBuilder } from '@dojoengine/sdk';
import { useAccount } from '@starknet-react/core';

interface BattleEvent {
  type: 'damage' | 'defeat' | 'round' | 'battle';
  battle_id: number;
  data: any;
  timestamp?: number;
}

export function useBattleEvents() {
  const [battleInProgress, setBattleInProgress] = useState<boolean>(false);
  const [battleLog, setBattleLog] = useState<string[]>([]);
  const [battleResult, setBattleResult] = useState<string | null>(null);
  const [currentBattleId, setCurrentBattleId] = useState<number | null>(null);
  
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const subscriptionRef = useRef<{ cancel: () => void } | null>(null);
  const processedEventsRef = useRef<Set<string>>(new Set());

  const { client } = useDojoSDK();
  const { address } = useAccount();

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
    
    // Cancel subscription
    if (subscriptionRef.current) {
      subscriptionRef.current.cancel();
      subscriptionRef.current = null;
    }
  }, []);

  const processEvent = useCallback((entity: any): BattleEvent | null => {
    const models = entity.models?.survivor_valhalla;
    if (!models) return null;

    let eventType: 'damage' | 'defeat' | 'round' | 'battle' | null = null;
    let eventData: any = null;
    let battleId: number | null = null;

    // Check for DamageDealt events
    if (models.DamageDealt) {
      eventType = 'damage';
      eventData = models.DamageDealt;
      battleId = Number(eventData.battle_id);
    }
    // Check for UnitDefeated events
    else if (models.UnitDefeated) {
      eventType = 'defeat';
      eventData = models.UnitDefeated;
      battleId = Number(eventData.battle_id);
    }
    // Check for RoundCompleted events
    else if (models.RoundCompleted) {
      eventType = 'round';
      eventData = models.RoundCompleted;
      battleId = Number(eventData.battle_id);
    }
    // Check for BattleCompleted events
    else if (models.BattleCompleted) {
      eventType = 'battle';
      eventData = models.BattleCompleted;
      battleId = Number(eventData.battle_id);
    }

    if (eventType && eventData && battleId) {
      return {
        type: eventType,
        battle_id: battleId,
        data: eventData,
        timestamp: Date.now()
      };
    }

    return null;
  }, []);

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

  const startBattleEventSubscription = useCallback(async () => {
    if (!client || !battleInProgress) return;

    try {
      console.log('[useBattleEvents] Starting event subscription...');
      
      // Subscribe to all combat-related events
      const [initialEntities, subscription] = await client.subscribeEntityQuery({
        query: new ToriiQueryBuilder()
          .includeHashedKeys(),
        callback: ({ data, error }) => {
          if (error) {
            console.error('[useBattleEvents] Subscription error:', error);
            return;
          }

          if (data && data.length > 0) {
            console.log('[useBattleEvents] Received entities:', data.length);
            
            const events: BattleEvent[] = [];
            
            data.forEach((entity) => {
              const event = processEvent(entity);
              if (event) {
                // Only process events for the current battle or recent battles
                const battleTime = startTimeRef.current || 0;
                if (event.timestamp && event.timestamp >= battleTime - 5000) { // 5 second buffer
                  events.push(event);
                  
                  // Set current battle ID from first event if not set
                  if (!currentBattleId) {
                    console.log('[useBattleEvents] Setting battle ID:', event.battle_id);
                    setCurrentBattleId(event.battle_id);
                  }
                }
              }
            });

            if (events.length > 0) {
              console.log('[useBattleEvents] Processing events:', events);
              processEvents(events);
            }
          }
        },
      });

      subscriptionRef.current = subscription;
      console.log('[useBattleEvents] Subscription established');

      // Process initial entities
      if (initialEntities && initialEntities.length > 0) {
        console.log('[useBattleEvents] Processing initial entities:', initialEntities.length);
        const initialEvents: BattleEvent[] = [];
        
        initialEntities.forEach((entity) => {
          const event = processEvent(entity);
          if (event) {
            initialEvents.push(event);
          }
        });

        if (initialEvents.length > 0) {
          console.log('[useBattleEvents] Processing initial events:', initialEvents);
          processEvents(initialEvents);
        }
      }

    } catch (error) {
      console.error('[useBattleEvents] Failed to start subscription:', error);
    }
  }, [client, battleInProgress, currentBattleId, processEvent, processEvents]);

  // Start subscription when battle begins
  useEffect(() => {
    if (battleInProgress && client) {
      startBattleEventSubscription();
    }
    
    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current.cancel();
        subscriptionRef.current = null;
      }
    };
  }, [battleInProgress, client, startBattleEventSubscription]);

  const startBattle = useCallback(() => {
    console.log('[useBattleEvents] Starting battle tracking...');
    setBattleResult(null);
    setBattleInProgress(true);
    setBattleLog([]);
    setCurrentBattleId(null);
    startTimeRef.current = Date.now();
    processedEventsRef.current.clear();
    
    // Set up timeout to stop battle after 30 seconds if no completion
    timeoutRef.current = setTimeout(() => {
      console.log('[useBattleEvents] Battle timeout reached');
      setBattleInProgress(false);
      startTimeRef.current = null;
      if (subscriptionRef.current) {
        subscriptionRef.current.cancel();
        subscriptionRef.current = null;
      }
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