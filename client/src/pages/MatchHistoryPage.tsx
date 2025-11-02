// src/pages/MatchHistoryPage.tsx
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { useAccount } from "@starknet-react/core";
import { useEntityQuery, useModels } from "@dojoengine/sdk/react";
import { ToriiQueryBuilder } from "@dojoengine/sdk";
import { Navbar } from "../components/navbar";
import { ModelsMapping } from "../bindings/typescript/models.gen";
import type { BattleCompleted } from "../bindings/typescript/models.gen";
import { addAddressPadding } from "starknet";
import { ChevronDown, ChevronUp, Swords } from "lucide-react";

type BattleWithId = BattleCompleted & { entityId: string };

interface BattleLog {
  battleId: number;
  entries: string[];
  result: string;
  isAttacker: boolean;
  opponent: string;
  timestamp: number;
}

export function MatchHistoryPage() {
  const { address } = useAccount();
  const [expandedBattleId, setExpandedBattleId] = useState<number | null>(null);

  // Query all battle completed events
  useEntityQuery(
    new ToriiQueryBuilder()
      .includeHashedKeys()
      .withEntityModels([
        ModelsMapping.BattleCompleted,
        ModelsMapping.DamageDealt,
        ModelsMapping.UnitDefeated,
        ModelsMapping.RoundCompleted,
        ModelsMapping.CombatUnit,
      ]),
  );

  const battleCompletedEvents = useModels(ModelsMapping.BattleCompleted);
  const damageEvents = useModels(ModelsMapping.DamageDealt);
  const unitDefeatedEvents = useModels(ModelsMapping.UnitDefeated);
  const roundEvents = useModels(ModelsMapping.RoundCompleted);
  const combatUnits = useModels(ModelsMapping.CombatUnit);

  console.log("[MatchHistory] battleCompletedEvents:", {
    value: battleCompletedEvents,
    type: typeof battleCompletedEvents,
    isArray: Array.isArray(battleCompletedEvents),
    length: Array.isArray(battleCompletedEvents)
      ? battleCompletedEvents.length
      : "N/A",
  });

  // Check if data is still loading (undefined means not loaded yet, array means loaded)
  const isLoading =
    battleCompletedEvents === undefined ||
    damageEvents === undefined ||
    unitDefeatedEvents === undefined ||
    roundEvents === undefined ||
    combatUnits === undefined;

  // Filter battles where user is attacker or defender
  const userBattles: BattleWithId[] = Array.isArray(battleCompletedEvents)
    ? battleCompletedEvents
        .map((battleObj: any) => {
          const entityId = Object.keys(battleObj)[0];
          const battle = battleObj[entityId];
          if (!battle) return null;

          const paddedAddress = address
            ? addAddressPadding(address.toLowerCase()).toLowerCase()
            : null;

          if (
            paddedAddress &&
            (battle.attacker?.toLowerCase() === paddedAddress ||
              battle.defender?.toLowerCase() === paddedAddress)
          ) {
            return {
              entityId,
              ...battle,
            };
          }
          return null;
        })
        .filter((b): b is BattleWithId => b !== null)
        .sort((a, b) => Number(b.battle_id) - Number(a.battle_id))
    : [];

  const buildBattleLog = (battleId: number): BattleLog | null => {
    const battle = userBattles.find((b) => Number(b.battle_id) === battleId);
    if (!battle) return null;

    const paddedAddress = address
      ? addAddressPadding(address.toLowerCase()).toLowerCase()
      : null;

    const isAttacker = battle.attacker?.toLowerCase() === paddedAddress;
    const opponent = isAttacker ? battle.defender : battle.attacker;
    const isVictory = battle.winner?.toLowerCase() === paddedAddress;

    interface BattleEvent {
      type: "damage" | "defeat" | "round";
      data: any;
      round: number;
      sequence: number;
    }

    const allEvents: BattleEvent[] = [];

    // Collect damage events
    if (Array.isArray(damageEvents)) {
      damageEvents.forEach((eventObj: any) => {
        const entityId = Object.keys(eventObj)[0];
        const event = eventObj[entityId];
        if (event && Number(event.battle_id) === battleId) {
          allEvents.push({
            type: "damage",
            data: event,
            round: Number(event.round),
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
            data: event,
            round: Number(event.round),
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
            data: event,
            round: Number(event.round),
            sequence: 999,
          });
        }
      });
    }

    // Group damage and defeat events
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

    // Assign sequence numbers
    let sequenceCounter = 0;
    damageEventsMap.forEach((damageEvent, key) => {
      damageEvent.sequence = sequenceCounter++;
      const defeatEvent = defeatEventsMap.get(key);
      if (defeatEvent) {
        defeatEvent.sequence = sequenceCounter++;
      }
    });

    defeatEventsMap.forEach((defeatEvent) => {
      if (defeatEvent.sequence === 0) {
        defeatEvent.sequence = sequenceCounter++;
      }
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

    allEvents.forEach((event) => {
      if (event.type === "defeat") {
        unitTypes.set(Number(event.data.unit_id), event.data.is_adventurer);
      }
    });

    // Inference
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

    allEvents.forEach((event) => {
      if (event.type === "damage") {
        const targetId = Number(event.data.target_id);
        const attackerId = Number(event.data.attacker_id);

        if (beastIds.has(targetId) && !unitTypes.has(attackerId)) {
          unitTypes.set(attackerId, true);
        }
        if (adventurerIds.has(targetId) && !unitTypes.has(attackerId)) {
          unitTypes.set(attackerId, false);
        }
        if (beastIds.has(attackerId) && !unitTypes.has(targetId)) {
          unitTypes.set(targetId, true);
        }
        if (adventurerIds.has(attackerId) && !unitTypes.has(targetId)) {
          unitTypes.set(targetId, false);
        }
      }
    });

    // Build log entries
    const logEntries: string[] = [];

    allEvents.forEach((event) => {
      switch (event.type) {
        case "damage":
          const damage = Number(event.data.damage);
          const attackerId = Number(event.data.attacker_id);
          const targetId = Number(event.data.target_id);
          const multiplier = Number(event.data.type_multiplier);

          const attackerType = unitTypes.get(attackerId);
          const targetType = unitTypes.get(targetId);

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

          let effectText = "";
          if (multiplier === 150) {
            effectText = " It's super effective!";
          } else if (multiplier === 75) {
            effectText = " It's not very effective...";
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
      }
    });

    return {
      battleId,
      entries: logEntries,
      result: isVictory ? "Victory" : "Defeat",
      isAttacker,
      opponent,
      timestamp: Number(battle.timestamp),
    };
  };

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      {/* Subtle background glow */}
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
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-emerald-600/10 rounded-full blur-[150px]"
        />
      </div>

      {/* Navbar */}
      <Navbar />

      {/* Main content */}
      <div className="relative z-10 container mx-auto px-4 py-12 max-w-4xl">
        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-16"
        >
          <h1
            className="text-5xl md:text-6xl font-bold mb-2 text-emerald-500"
            style={{
              textShadow: "0 0 30px rgba(16, 185, 129, 0.3)",
              fontFamily: "serif",
            }}
          >
            MATCH HISTORY
          </h1>
          <p className="text-emerald-200/40 text-sm tracking-widest uppercase">
            Review your past battles
          </p>
        </motion.div>

        {/* Battle List */}
        {isLoading ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center"
          >
            <div className="border border-emerald-500/30 bg-emerald-950/20 p-12">
              <motion.div
                animate={{
                  rotate: 360,
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "linear",
                }}
                className="w-16 h-16 mx-auto mb-6 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full"
              />
              <h2 className="text-2xl font-bold text-emerald-400 mb-4 tracking-wider uppercase">
                Loading Battles
              </h2>
              <motion.p
                animate={{
                  opacity: [0.5, 1, 0.5],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                className="text-emerald-200/60 text-sm tracking-wide"
              >
                Fetching your battle history from the chain...
              </motion.p>
            </div>
          </motion.div>
        ) : userBattles.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center"
          >
            <div className="border border-emerald-500/30 bg-emerald-950/20 p-12">
              <Swords className="w-16 h-16 text-emerald-500/50 mx-auto mb-6" />
              <h2 className="text-2xl font-bold text-emerald-400 mb-4 tracking-wider uppercase">
                No Battles Yet
              </h2>
              <p className="text-emerald-200/60 text-sm tracking-wide">
                Your battle history will appear here once you've fought some
                battles.
              </p>
            </div>
          </motion.div>
        ) : (
          <div className="space-y-4">
            {userBattles.map((battle) => {
              const battleLog = buildBattleLog(Number(battle.battle_id));
              if (!battleLog) return null;

              const isExpanded = expandedBattleId === battleLog.battleId;

              return (
                <motion.div
                  key={battle.entityId}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="border border-emerald-500/30 bg-emerald-950/20"
                >
                  {/* Battle Summary - Clickable */}
                  <button
                    onClick={() =>
                      setExpandedBattleId(
                        isExpanded ? null : battleLog.battleId,
                      )
                    }
                    className="w-full p-6 text-left hover:bg-emerald-950/30 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-4 mb-2">
                          <h3 className="text-xl font-bold text-emerald-400">
                            Battle #{battleLog.battleId}
                          </h3>
                          <span
                            className={`px-3 py-1 text-xs font-bold uppercase tracking-wider ${
                              battleLog.result === "Victory"
                                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/50"
                                : "bg-red-500/20 text-red-400 border border-red-500/50"
                            }`}
                          >
                            {battleLog.result}
                          </span>
                          <span className="px-3 py-1 text-xs font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-300/70 border border-emerald-500/30">
                            {battleLog.isAttacker ? "Attacker" : "Defender"}
                          </span>
                        </div>
                        <p className="text-emerald-200/60 text-sm font-mono">
                          vs {battleLog.opponent.slice(0, 6)}...
                          {battleLog.opponent.slice(-4)}
                        </p>
                      </div>
                      <div className="text-emerald-400">
                        {isExpanded ? (
                          <ChevronUp className="w-6 h-6" />
                        ) : (
                          <ChevronDown className="w-6 h-6" />
                        )}
                      </div>
                    </div>
                  </button>

                  {/* Battle Log - Expandable */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="overflow-hidden"
                      >
                        <div className="border-t border-emerald-500/20 p-6 bg-black/40">
                          <div className="space-y-1">
                            {battleLog.entries.map((logEntry, index) => {
                              const isSeparator =
                                logEntry.includes("---") ||
                                logEntry.includes("═══");

                              return (
                                <div
                                  key={index}
                                  className={`
                                    font-mono text-sm
                                    ${isSeparator ? "text-emerald-500/40 text-center my-1" : "text-emerald-200/70 pl-2"}
                                  `}
                                  style={{
                                    whiteSpace: "pre-line",
                                    lineHeight: isSeparator ? "1.2" : "1.6",
                                  }}
                                >
                                  {logEntry}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
