import { motion } from "framer-motion";
import { useParams } from "react-router-dom";
import { Swords, Play, Pause, RotateCcw, FastForward } from "lucide-react";
import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { Navbar } from "../components/navbar";
import { useBattleDetails } from "../hooks/useBattleDetails";
import { useAdventurers } from "../hooks/useAdventurers";
import {
  useBeastLineupImages,
  useBeastLineupStats,
  getBeastWeaponType,
} from "../hooks/useBeasts";
import { useEntityQuery } from "@dojoengine/sdk/react";
import { ToriiQueryBuilder } from "@dojoengine/sdk";
import { ModelsMapping } from "../bindings/typescript/models.gen";
import {
  useAdventurerWeapons,
  getWeaponTypeIcon,
  getArmorTypeIcon,
} from "../hooks/useAdventurerWeapons";

export function BattlePage() {
  const { battleId } = useParams<{ battleId: string }>();
  const numericBattleId = battleId ? parseInt(battleId, 10) : 0;
  const { battleDetails } = useBattleDetails(numericBattleId);
  
  // Battle simulation state
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationStep, setSimulationStep] = useState(0);
  const [unitHealths, setUnitHealths] = useState<Record<string, number>>({});
  const [highlightedAttacker, setHighlightedAttacker] = useState<string | null>(null);
  const [damagedUnit, setDamagedUnit] = useState<string | null>(null);
  const [defeatedUnits, setDefeatedUnits] = useState<Set<string>>(new Set());
  const [simulationSpeed, setSimulationSpeed] = useState(1000); // ms between events
  const [isPaused, setIsPaused] = useState(false);
  const [currentEventDescription, setCurrentEventDescription] = useState<string>("");
  
  const simulationIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Query adventurer weapons for stat enrichment
  useEntityQuery(
    new ToriiQueryBuilder()
      .includeHashedKeys()
      .withEntityModels([ModelsMapping.AdventurerWeapon]),
  );
  const weaponMap = useAdventurerWeapons();

  // Load adventurers for attacker images
  const { data: adventurers = [] } = useAdventurers(battleDetails?.attacker, {
    enabled: !!battleDetails?.attacker,
  });

  // Enrich adventurers with combat stats
  const enrichedAdventurers = useMemo(() => {
    if (!weaponMap) return adventurers;

    return adventurers.map((adventurer) => {
      const weapon = weaponMap[adventurer.adventurer_id];
      const combatHealth = 100 + adventurer.vitality * 15;

      return {
        ...adventurer,
        combatHealth,
        weaponPower: weapon?.weapon_power,
        weaponType: weapon?.weapon_type,
      };
    });
  }, [adventurers, weaponMap]);

  // Extract beast IDs from defender lineup for image loading
  const beastTokenIds = useMemo(() => {
    if (!battleDetails?.defenderLineup) return [];
    const tokenIds: (string | number | bigint)[] = [];
    [
      battleDetails.defenderLineup.beast1_id,
      battleDetails.defenderLineup.beast2_id,
      battleDetails.defenderLineup.beast3_id,
      battleDetails.defenderLineup.beast4_id,
      battleDetails.defenderLineup.beast5_id,
    ].forEach((id) => {
      if (id && Number(id) > 0) {
        tokenIds.push(id);
      }
    });
    return tokenIds;
  }, [battleDetails?.defenderLineup]);

  // Fetch beast images
  const { data: beastImages = {} } = useBeastLineupImages(beastTokenIds, {
    enabled: beastTokenIds.length > 0,
  });

  // Fetch beast stats
  const { data: beastStats = {} } = useBeastLineupStats(beastTokenIds, {
    enabled: beastTokenIds.length > 0,
  });
  
  // Process battle events for simulation
  const simulationEvents = useMemo(() => {
    if (!battleDetails?.events) return [];
    return battleDetails.events
      .filter(event => event.type === 'damage' || event.type === 'defeat')
      .sort((a, b) => {
        if (a.round !== b.round) return a.round - b.round;
        return a.sequence - b.sequence;
      });
  }, [battleDetails?.events]);
  
  // Initialize unit healths
  const initialHealths = useMemo(() => {
    const healths: Record<string, number> = {};
    
    // Initialize adventurer healths
    enrichedAdventurers.forEach(adventurer => {
      healths[`adventurer_${adventurer.adventurer_id}`] = adventurer.combatHealth || 0;
    });
    
    // Initialize beast healths  
    Object.entries(beastStats).forEach(([beastId, stats]) => {
      healths[`beast_${beastId}`] = stats.health || 0;
    });
    
    return healths;
  }, [enrichedAdventurers, beastStats]);
  
  // Reset simulation to initial state
  const resetSimulation = useCallback(() => {
    setIsSimulating(false);
    setSimulationStep(0);
    setUnitHealths(initialHealths);
    setHighlightedAttacker(null);
    setDamagedUnit(null);
    setDefeatedUnits(new Set());
    setIsPaused(false);
    setCurrentEventDescription("");
    if (simulationIntervalRef.current) {
      clearInterval(simulationIntervalRef.current);
      simulationIntervalRef.current = null;
    }
  }, [initialHealths]);
  
  // Initialize healths when data loads
  useEffect(() => {
    if (Object.keys(initialHealths).length > 0 && Object.keys(unitHealths).length === 0) {
      setUnitHealths(initialHealths);
    }
  }, [initialHealths, unitHealths]);

  // Simulation step logic
  const processSimulationStep = useCallback(() => {
    if (simulationStep >= simulationEvents.length) {
      setIsSimulating(false);
      setCurrentEventDescription("Battle simulation complete!");
      if (simulationIntervalRef.current) {
        clearInterval(simulationIntervalRef.current);
        simulationIntervalRef.current = null;
      }
      return;
    }
    
    const event = simulationEvents[simulationStep];
    
    if (event.type === 'damage') {
      const attackerId = Number(event.data.attacker_id);
      const targetId = Number(event.data.target_id);
      const damage = Number(event.data.damage);
      
      // Create unit mapping - we need to infer unit types from the damage events
      // Check if unit ID exists in our adventurer or beast data
      const attackerIsAdventurer = enrichedAdventurers.some(a => a.adventurer_id === attackerId);
      const targetIsAdventurer = enrichedAdventurers.some(a => a.adventurer_id === targetId);
      
      const attackerKey = attackerIsAdventurer ? `adventurer_${attackerId}` : `beast_${attackerId}`;
      const targetKey = targetIsAdventurer ? `adventurer_${targetId}` : `beast_${targetId}`;
      
      const attackerType = attackerIsAdventurer ? 'Adventurer' : 'Beast';
      const targetType = targetIsAdventurer ? 'Adventurer' : 'Beast';
      
      // Update description
      setCurrentEventDescription(`${attackerType} #${attackerId} attacks ${targetType} #${targetId} for ${damage} damage`);
      
      // Highlight attacker
      setHighlightedAttacker(attackerKey);
      
      // Flash damaged unit
      setDamagedUnit(targetKey);
      setTimeout(() => setDamagedUnit(null), 300);
      
      // Update health
      setUnitHealths(prev => {
        const newHealths = { ...prev };
        const currentHealth = newHealths[targetKey] || 0;
        newHealths[targetKey] = Math.max(0, currentHealth - damage);
        return newHealths;
      });
      
      // Clear attacker highlight after animation
      setTimeout(() => setHighlightedAttacker(null), 800);
    }
    
    if (event.type === 'defeat') {
      const unitId = event.data.unit_id;
      const isAdventurer = event.data.is_adventurer;
      const unitKey = isAdventurer ? `adventurer_${unitId}` : `beast_${unitId}`;
      
      setCurrentEventDescription(`${isAdventurer ? 'Adventurer' : 'Beast'} #${unitId} is defeated!`);
      
      setDefeatedUnits(prev => new Set([...prev, unitKey]));
    }
    
    setSimulationStep(prev => prev + 1);
  }, [simulationStep, simulationEvents, enrichedAdventurers]);
  
  // Start/stop simulation
  const toggleSimulation = useCallback(() => {
    if (isSimulating) {
      setIsPaused(!isPaused);
    } else {
      setIsSimulating(true);
      setIsPaused(false);
    }
  }, [isSimulating, isPaused]);
  
  // Simulation interval effect
  useEffect(() => {
    if (isSimulating && !isPaused) {
      simulationIntervalRef.current = setInterval(processSimulationStep, simulationSpeed);
    } else {
      if (simulationIntervalRef.current) {
        clearInterval(simulationIntervalRef.current);
        simulationIntervalRef.current = null;
      }
    }
    
    return () => {
      if (simulationIntervalRef.current) {
        clearInterval(simulationIntervalRef.current);
        simulationIntervalRef.current = null;
      }
    };
  }, [isSimulating, isPaused, processSimulationStep, simulationSpeed]);

  if (!battleDetails) {
    return (
      <div className="min-h-screen bg-black text-white relative overflow-hidden">
        <Navbar />
        <div className="relative z-10 min-h-screen flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl text-red-400">Battle not found</h1>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      {/* Background effect */}
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
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-red-600/10 rounded-full blur-[150px]"
        />
      </div>

      <Navbar />

      <div className="relative z-10 container mx-auto px-4 py-12 max-w-4xl">
        {/* Battle header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <h1 className="text-4xl md:text-5xl font-bold mb-4 text-red-500">
            Battle #{battleId}
          </h1>
          <div className="flex items-center justify-center gap-4 text-red-200/60 text-sm">
            <span>
              {battleDetails.attacker.slice(0, 8)}...
              {battleDetails.attacker.slice(-6)}
            </span>
            <Swords className="w-4 h-4" />
            <span>
              {battleDetails.defender.slice(0, 8)}...
              {battleDetails.defender.slice(-6)}
            </span>
          </div>
          <div className="mt-2">
            <span
              className={`font-bold ${battleDetails.isVictory ? "text-green-400" : "text-red-400"}`}
            >
              {battleDetails.isVictory ? "VICTORY" : "DEFEAT"}
            </span>
          </div>
        </motion.div>

        {/* Fight Board */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mb-8"
        >
          <div className="border-2 border-red-500/30 bg-red-950/20 p-8 relative overflow-hidden">
            {/* Defense Symbol - Top Left */}
            <div className="absolute top-4 left-4 z-0 opacity-30">
              <div className="bg-amber-900/80 border border-amber-600/50 rounded-full p-2">
                <Swords className="w-6 h-6 text-amber-300 rotate-180" />
              </div>
            </div>

            {/* Attack Symbol - Bottom Right */}
            <div className="absolute bottom-4 right-4 z-0 opacity-30">
              <div className="bg-red-900/80 border border-red-500/50 rounded-full p-2">
                <Swords className="w-6 h-6 text-red-300" />
              </div>
            </div>

            <div className="space-y-12">
              {/* Defense Lineup - Top Row */}
              <div className="grid grid-cols-5 gap-4 p-4">
                {[1, 2, 3, 4, 5].map((pos) => {
                  const beastId =
                    battleDetails.defenderLineup?.[`beast${pos}_id`];
                  const hasBeast = beastId && Number(beastId) > 0;
                  const lookupKey = hasBeast ? String(Number(beastId)) : "";
                  const imageUrl = hasBeast ? beastImages[lookupKey] : null;
                  const beastStat = hasBeast ? beastStats[lookupKey] : null;
                  const beastKey = `beast_${beastId}`;
                  const isHighlighted = highlightedAttacker === beastKey;
                  const isDamaged = damagedUnit === beastKey;
                  const isDefeated = defeatedUnits.has(beastKey);
                  const currentHealth = unitHealths[beastKey] || (beastStat?.health || 0);
                  const maxHealth = beastStat?.health || 0;

                  return (
                    <div
                      key={pos}
                      className="min-h-[200px] border-2 border-dashed rounded-lg flex items-center justify-center transition-colors border-amber-900/50"
                    >
                      {hasBeast && imageUrl ? (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ 
                            opacity: isDefeated ? 0.3 : 1, 
                            scale: isHighlighted ? 1.05 : isDamaged ? 0.95 : 1,
                            filter: isDefeated ? 'grayscale(100%)' : 'none',
                          }}
                          transition={{ duration: 0.3 }}
                          className={`cursor-pointer w-full h-full relative overflow-hidden rounded-lg border-2 transition-all ${
                            isHighlighted ? 'border-yellow-400 shadow-lg shadow-yellow-400/50' :
                            isDamaged ? 'border-red-500' :
                            'border-amber-500/30'
                          }`}
                          style={{
                            background: isHighlighted 
                              ? "linear-gradient(135deg, rgba(255, 193, 7, 0.2) 0%, rgba(245, 158, 11, 0.1) 100%)"
                              : "linear-gradient(135deg, rgba(245, 158, 11, 0.1) 0%, rgba(0, 0, 0, 0.4) 100%)",
                          }}
                        >
                          {/* Background Beast Image */}
                          <div className="absolute inset-0">
                            <img
                              src={imageUrl}
                              alt={`Beast ${beastId}`}
                              className="w-full h-full object-cover"
                            />
                          </div>

                          {/* Level - Top Left Corner */}
                          <div className="absolute top-1 left-1 bg-amber-900/95 border-2 border-amber-500/70 rounded-md w-10 h-10 flex items-center justify-center shadow-lg">
                            <span className="text-amber-300 text-sm font-bold">
                              {beastStat?.level || 0}
                            </span>
                          </div>

                          {/* Beast Armor Type Icon - Top Right Corner */}
                          <div className="absolute top-1 right-1 bg-amber-900/95 border-2 border-amber-500/70 rounded-md w-10 h-10 flex items-center justify-center shadow-lg">
                            <span className="text-xl">
                              {getArmorTypeIcon(
                                getBeastWeaponType(beastStat?.type || ""),
                              )}
                            </span>
                          </div>

                          {/* HP - Bottom Left Corner (Half Circle) */}
                          <div className={`absolute bottom-0 left-0 border-2 rounded-tr-full w-11 h-11 flex items-end justify-start shadow-lg pl-1 pb-1 ${
                            currentHealth <= maxHealth * 0.25 ? 'bg-red-900/95 border-red-500/70' :
                            currentHealth <= maxHealth * 0.5 ? 'bg-yellow-900/95 border-yellow-500/70' :
                            'bg-emerald-900/95 border-emerald-500/70'
                          }`}>
                            <motion.span 
                              className={`text-xs font-bold leading-none ${
                                currentHealth <= maxHealth * 0.25 ? 'text-red-300' :
                                currentHealth <= maxHealth * 0.5 ? 'text-yellow-300' :
                                'text-emerald-300'
                              }`}
                              key={currentHealth}
                              initial={{ scale: 1.2 }}
                              animate={{ scale: 1 }}
                              transition={{ duration: 0.2 }}
                            >
                              {currentHealth}
                            </motion.span>
                          </div>

                          {/* ATK - Bottom Right Corner (Half Circle) */}
                          <div className="absolute bottom-0 right-0 bg-amber-900/95 border-2 border-amber-500/70 rounded-tl-full w-11 h-11 flex items-end justify-end shadow-lg pr-1 pb-1">
                            <span className="text-amber-300 text-xs font-bold leading-none">
                              {beastStat?.power || 0}
                            </span>
                          </div>
                          {/* Death Overlay */}
                          {isDefeated && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.5 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-lg"
                            >
                              <div className="text-red-400 text-4xl">💀</div>
                            </motion.div>
                          )}
                          
                          {/* Attack Flash Effect */}
                          {isDamaged && (
                            <motion.div
                              initial={{ opacity: 0 }}
                              animate={{ opacity: [0, 0.8, 0] }}
                              transition={{ duration: 0.3 }}
                              className="absolute inset-0 bg-red-500/30 rounded-lg pointer-events-none"
                            />
                          )}
                        </motion.div>
                      ) : (
                        <div className="text-amber-200/20 text-xs text-center">
                          Empty
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* VS Divider */}
              <div className="text-center">
                <div className="text-3xl font-bold text-red-500 mb-6">VS</div>
                
                {/* Battle Simulation Controls */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-red-950/40 border border-red-500/30 rounded-lg p-6 mb-6"
                >
                  <h3 className="text-lg font-bold text-red-400 mb-4 tracking-wider uppercase">
                    Battle Simulation
                  </h3>
                  
                  {/* Event Description */}
                  <div className="mb-4 h-6">
                    <p className="text-red-200/80 text-sm font-mono">
                      {currentEventDescription || "Ready to simulate battle"}
                    </p>
                  </div>
                  
                  {/* Progress Bar */}
                  <div className="w-full bg-red-950/60 rounded-full h-2 mb-4">
                    <motion.div
                      className="bg-red-500 h-2 rounded-full"
                      initial={{ width: 0 }}
                      animate={{ 
                        width: simulationEvents.length > 0 
                          ? `${(simulationStep / simulationEvents.length) * 100}%` 
                          : "0%" 
                      }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                  
                  {/* Progress Text */}
                  <div className="text-red-300/60 text-xs mb-4">
                    Step {simulationStep} of {simulationEvents.length}
                  </div>
                  
                  {/* Control Buttons */}
                  <div className="flex items-center justify-center gap-3">
                    <motion.button
                      onClick={toggleSimulation}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="flex items-center gap-2 px-4 py-2 bg-red-600/20 border border-red-500/50 rounded-lg hover:bg-red-600/30 transition-colors text-red-300"
                    >
                      {isSimulating && !isPaused ? (
                        <><Pause className="w-4 h-4" /> Pause</>
                      ) : (
                        <><Play className="w-4 h-4" /> {simulationStep > 0 ? 'Resume' : 'Start'}</>
                      )}
                    </motion.button>
                    
                    <motion.button
                      onClick={resetSimulation}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="flex items-center gap-2 px-4 py-2 bg-orange-600/20 border border-orange-500/50 rounded-lg hover:bg-orange-600/30 transition-colors text-orange-300"
                    >
                      <RotateCcw className="w-4 h-4" /> Reset
                    </motion.button>
                    
                    {/* Speed Controls */}
                    <div className="flex items-center gap-1">
                      {[2000, 1000, 500, 250].map((speed, idx) => (
                        <motion.button
                          key={speed}
                          onClick={() => setSimulationSpeed(speed)}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          className={`px-3 py-2 text-xs rounded transition-colors ${
                            simulationSpeed === speed
                              ? 'bg-blue-600/30 border border-blue-500/50 text-blue-300'
                              : 'bg-gray-600/20 border border-gray-500/30 text-gray-400 hover:text-gray-300'
                          }`}
                        >
                          {idx === 0 ? '0.5x' : idx === 1 ? '1x' : idx === 2 ? '2x' : '4x'}
                        </motion.button>
                      ))}
                    </div>
                  </div>
                </motion.div>
              </div>

              {/* Attack Lineup - Bottom Row */}
              <div className="grid grid-cols-5 gap-4 p-4">
                {[1, 2, 3, 4, 5].map((pos) => {
                  const adventurerId =
                    battleDetails.attackerLineup?.[`adventurer${pos}_id`];
                  const hasAdventurer =
                    adventurerId && Number(adventurerId) > 0;
                  const adventurer = hasAdventurer
                    ? enrichedAdventurers.find(
                        (a) => a.adventurer_id === Number(adventurerId),
                      )
                    : null;
                  
                  const adventurerKey = `adventurer_${adventurerId}`;
                  const isHighlighted = highlightedAttacker === adventurerKey;
                  const isDamaged = damagedUnit === adventurerKey;
                  const isDefeated = defeatedUnits.has(adventurerKey);
                  const currentHealth = unitHealths[adventurerKey] || (adventurer?.combatHealth || 0);
                  const maxHealth = adventurer?.combatHealth || 0;

                  return (
                    <div
                      key={pos}
                      className="min-h-[200px] border-2 border-dashed rounded-lg flex items-center justify-center transition-colors border-emerald-500/30"
                    >
                      {adventurer?.image ? (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ 
                            opacity: isDefeated ? 0.3 : 1, 
                            scale: isHighlighted ? 1.05 : isDamaged ? 0.95 : 1,
                            filter: isDefeated ? 'grayscale(100%)' : 'none',
                          }}
                          transition={{ duration: 0.3 }}
                          className={`cursor-pointer w-full h-full relative overflow-hidden rounded-lg border-2 transition-all ${
                            isHighlighted ? 'border-yellow-400 shadow-lg shadow-yellow-400/50' :
                            isDamaged ? 'border-red-500' :
                            'border-emerald-500/30'
                          }`}
                          style={{
                            background: isHighlighted 
                              ? "linear-gradient(135deg, rgba(255, 193, 7, 0.2) 0%, rgba(16, 185, 129, 0.1) 100%)"
                              : "linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(0, 0, 0, 0.4) 100%)",
                          }}
                        >
                          {/* Background Character Image */}
                          <div className="absolute inset-0">
                            <img
                              src={adventurer.image}
                              alt={`${adventurer.name}`}
                              className="w-full h-full object-cover"
                            />
                          </div>

                          {/* Level - Top Left Corner */}
                          <div className="absolute top-1 left-1 bg-emerald-900/95 border-2 border-emerald-500/70 rounded-md w-10 h-10 flex items-center justify-center shadow-lg">
                            <span className="text-emerald-300 text-sm font-bold">
                              {adventurer.level}
                            </span>
                          </div>

                          {/* Weapon Type Icon - Top Right Corner */}
                          <div className="absolute top-1 right-1 bg-emerald-900/95 border-2 border-emerald-500/70 rounded-md w-10 h-10 flex items-center justify-center shadow-lg">
                            <span className="text-xl">
                              {getWeaponTypeIcon(adventurer.weaponType || 0)}
                            </span>
                          </div>

                          {/* HP - Bottom Left Corner (Half Circle) */}
                          <div className={`absolute bottom-0 left-0 border-2 rounded-tr-full w-11 h-11 flex items-end justify-start shadow-lg pl-1 pb-1 ${
                            currentHealth <= maxHealth * 0.25 ? 'bg-red-900/95 border-red-500/70' :
                            currentHealth <= maxHealth * 0.5 ? 'bg-yellow-900/95 border-yellow-500/70' :
                            'bg-emerald-900/95 border-emerald-500/70'
                          }`}>
                            <motion.span 
                              className={`text-xs font-bold leading-none ${
                                currentHealth <= maxHealth * 0.25 ? 'text-red-300' :
                                currentHealth <= maxHealth * 0.5 ? 'text-yellow-300' :
                                'text-emerald-300'
                              }`}
                              key={currentHealth}
                              initial={{ scale: 1.2 }}
                              animate={{ scale: 1 }}
                              transition={{ duration: 0.2 }}
                            >
                              {currentHealth}
                            </motion.span>
                          </div>

                          {/* ATK - Bottom Right Corner (Half Circle) */}
                          <div className="absolute bottom-0 right-0 bg-amber-900/95 border-2 border-amber-500/70 rounded-tl-full w-11 h-11 flex items-end justify-end shadow-lg pr-1 pb-1">
                            <span className="text-amber-300 text-xs font-bold leading-none">
                              {adventurer.weaponPower || 0}
                            </span>
                          </div>
                          {/* Death Overlay */}
                          {isDefeated && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.5 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-lg"
                            >
                              <div className="text-red-400 text-4xl">💀</div>
                            </motion.div>
                          )}
                          
                          {/* Attack Flash Effect */}
                          {isDamaged && (
                            <motion.div
                              initial={{ opacity: 0 }}
                              animate={{ opacity: [0, 0.8, 0] }}
                              transition={{ duration: 0.3 }}
                              className="absolute inset-0 bg-red-500/30 rounded-lg pointer-events-none"
                            />
                          )}
                        </motion.div>
                      ) : (
                        <div className="text-emerald-200/20 text-xs text-center">
                          <div className="mb-2 text-emerald-500/20 text-2xl">
                            ⬚
                          </div>
                          <div className="text-[10px]">
                            SLOT {pos}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Battle log */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-16"
        >
          <div className="border border-red-500/30 bg-red-950/20 p-8">
            <h2 className="text-center text-xl font-bold text-red-400 mb-6 tracking-wider uppercase">
              Battle Chronicle
            </h2>
            <div className="border border-red-500/20 bg-black/40 p-6 max-h-96 overflow-y-auto">
              <div className="space-y-1">
                {battleDetails.battleLog.map((logEntry, index) => {
                  const isSeparator =
                    logEntry.includes("---") || logEntry.includes("═══");
                  const isHeader = logEntry.includes("Battle Chronicle");

                  return (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.02 }}
                      className={`
                        font-mono text-sm
                        ${isSeparator ? "text-red-500/40 text-center my-1" : ""}
                        ${isHeader ? "text-red-400 font-bold text-center my-2" : ""}
                        ${!isSeparator && !isHeader ? "text-red-200/70 pl-2" : ""}
                      `}
                      style={{
                        whiteSpace: "pre-line",
                        lineHeight: isSeparator ? "1.2" : "1.6",
                      }}
                    >
                      {logEntry}
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Battle statistics */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6"
        >
          <div className="border border-red-500/30 bg-red-950/20 p-6 text-center">
            <h3 className="text-red-400 font-bold mb-2">Total Events</h3>
            <div className="text-2xl font-bold text-red-300">
              {battleDetails.events.length}
            </div>
          </div>
          <div className="border border-red-500/30 bg-red-950/20 p-6 text-center">
            <h3 className="text-red-400 font-bold mb-2">Damage Events</h3>
            <div className="text-2xl font-bold text-red-300">
              {battleDetails.events.filter((e) => e.type === "damage").length}
            </div>
          </div>
          <div className="border border-red-500/30 bg-red-950/20 p-6 text-center">
            <h3 className="text-red-400 font-bold mb-2">Units Defeated</h3>
            <div className="text-2xl font-bold text-red-300">
              {battleDetails.events.filter((e) => e.type === "defeat").length}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
