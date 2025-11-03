import { motion } from "framer-motion";
import { useParams, useNavigate } from "react-router-dom";
import {
  Swords,
  Play,
  Pause,
  RotateCcw,
  Shield,
  Zap,
  Heart,
} from "lucide-react";
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
  const navigate = useNavigate();
  const numericBattleId = battleId ? parseInt(battleId, 10) : 0;
  const { battleDetails } = useBattleDetails(numericBattleId);

  // Determine if this is a fresh battle (from URL params or recent timestamp)
  // Fresh battles should have mystery elements, historical battles should not
  const isNewBattle = useMemo(() => {
    if (!battleDetails) return true; // Default to new battle until loaded

    // Consider it a new battle if it's less than 5 minutes old
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    const battleTime = battleDetails.timestamp * 1000; // Convert to milliseconds

    return battleTime > fiveMinutesAgo;
  }, [battleDetails]);

  // Battle simulation state
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationStep, setSimulationStep] = useState(0);
  const [simulationComplete, setSimulationComplete] = useState(false);
  const [unitHealths, setUnitHealths] = useState<Record<string, number>>({});
  const [highlightedAttacker, setHighlightedAttacker] = useState<string | null>(
    null,
  );
  const [damagedUnit, setDamagedUnit] = useState<string | null>(null);
  const [defeatedUnits, setDefeatedUnits] = useState<Set<string>>(new Set());
  const [simulationSpeed, setSimulationSpeed] = useState(1000); // ms between events
  const [isPaused, setIsPaused] = useState(false);
  const [currentEventDescription, setCurrentEventDescription] =
    useState<string>("");
  const [showResultBanner, setShowResultBanner] = useState(false);

  const simulationIntervalRef = useRef<number | null>(null);

  // Sound effect utility function
  const playSound = useCallback((soundPath: string, volume: number = 0.3) => {
    if (typeof window !== "undefined") {
      const audio = new Audio(soundPath);
      audio.volume = volume;
      audio.play().catch(console.error);
    }
  }, []);

  // Play random attack sound
  const playAttackSound = useCallback(() => {
    const attackSounds = ["/sfx/slash1.mp3", "/sfx/slash2.mp3"];
    const randomSound =
      attackSounds[Math.floor(Math.random() * attackSounds.length)];
    playSound(randomSound, 0.4);
  }, [playSound]);

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
      .filter((event) => event.type === "damage" || event.type === "defeat")
      .sort((a, b) => {
        if (a.round !== b.round) return a.round - b.round;
        return a.sequence - b.sequence;
      });
  }, [battleDetails?.events]);

  // Initialize unit healths
  const initialHealths = useMemo(() => {
    const healths: Record<string, number> = {};

    // Initialize adventurer healths
    enrichedAdventurers.forEach((adventurer) => {
      healths[`adventurer_${adventurer.adventurer_id}`] =
        adventurer.combatHealth || 0;
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
    setSimulationComplete(false);
    setShowResultBanner(false);
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
    if (
      Object.keys(initialHealths).length > 0 &&
      Object.keys(unitHealths).length === 0
    ) {
      setUnitHealths(initialHealths);
    }
  }, [initialHealths, unitHealths]);

  // Simulation step logic
  const processSimulationStep = useCallback(() => {
    if (simulationStep >= simulationEvents.length) {
      setIsSimulating(false);
      setSimulationComplete(true);
      setCurrentEventDescription("The fate of the battle is revealed...");

      // Show result banner after a brief delay
      setTimeout(() => {
        setShowResultBanner(true);
      }, 1000);

      // Play victory sound if user won the battle
      if (battleDetails?.isVictory) {
        playSound("/sfx/victory.mp3", 0.6);
      }

      if (simulationIntervalRef.current) {
        clearInterval(simulationIntervalRef.current);
        simulationIntervalRef.current = null;
      }
      return;
    }

    const event = simulationEvents[simulationStep];

    if (event.type === "damage") {
      const attackerId = Number(event.data.attacker_id);
      const targetId = Number(event.data.target_id);
      const damage = Number(event.data.damage);

      // Create unit mapping - we need to infer unit types from the damage events
      // Check if unit ID exists in our adventurer or beast data
      const attackerIsAdventurer = enrichedAdventurers.some(
        (a) => a.adventurer_id === attackerId,
      );
      const targetIsAdventurer = enrichedAdventurers.some(
        (a) => a.adventurer_id === targetId,
      );

      const attackerKey = attackerIsAdventurer
        ? `adventurer_${attackerId}`
        : `beast_${attackerId}`;
      const targetKey = targetIsAdventurer
        ? `adventurer_${targetId}`
        : `beast_${targetId}`;

      // Create mysterious battle description instead of specific details
      const mysteriousDescriptions = [
        "Steel clashes against steel in Valhalla...",
        "A mighty blow echoes through the battlefield...",
        "The sound of combat fills the air...",
        "Warriors clash in a dance of death...",
        "Blood and sweat mark the hall's floor...",
        "The tension rises as weapons meet...",
        "A fierce exchange shakes the very ground...",
        "Combat rages with primal intensity...",
      ];
      const randomDescription =
        mysteriousDescriptions[
          Math.floor(Math.random() * mysteriousDescriptions.length)
        ];
      setCurrentEventDescription(randomDescription);

      // Play attack sound effect
      playAttackSound();

      // Highlight attacker
      setHighlightedAttacker(attackerKey);

      // Flash damaged unit
      setDamagedUnit(targetKey);
      setTimeout(() => setDamagedUnit(null), 300);

      // Update health
      setUnitHealths((prev) => {
        const newHealths = { ...prev };
        const currentHealth = newHealths[targetKey] || 0;
        newHealths[targetKey] = Math.max(0, currentHealth - damage);
        return newHealths;
      });

      // Clear attacker highlight after animation
      setTimeout(() => setHighlightedAttacker(null), 800);
    }

    if (event.type === "defeat") {
      const unitId = event.data.unit_id;
      const isAdventurer = event.data.is_adventurer;
      const unitKey = isAdventurer ? `adventurer_${unitId}` : `beast_${unitId}`;

      // Create mysterious defeat description instead of specific details
      const defeatDescriptions = [
        "A warrior falls in the halls of Valhalla...",
        "The clash of steel suddenly falls silent...",
        "Victory and defeat hang in the balance...",
        "Another combatant's fate is sealed...",
        "Valhalla claims another soul...",
        "A final gasp echoes through the battlefield...",
        "The tide of battle shifts dramatically...",
        "One fighter's journey comes to an end...",
      ];
      const randomDefeatDesc =
        defeatDescriptions[
          Math.floor(Math.random() * defeatDescriptions.length)
        ];
      setCurrentEventDescription(randomDefeatDesc);

      // Play death sound effect
      playSound("/sfx/inventory-change.mp3", 0.5);

      setDefeatedUnits((prev) => new Set([...prev, unitKey]));
    }

    setSimulationStep((prev) => prev + 1);
  }, [
    simulationStep,
    simulationEvents,
    enrichedAdventurers,
    battleDetails?.isVictory,
    playSound,
    playAttackSound,
  ]);

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
      simulationIntervalRef.current = setInterval(
        processSimulationStep,
        simulationSpeed,
      );
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

  // Auto-start simulation when battle loads
  useEffect(() => {
    if (
      battleDetails &&
      !isSimulating &&
      simulationStep === 0 &&
      !simulationComplete
    ) {
      setIsSimulating(true);
    }
  }, [battleDetails, isSimulating, simulationStep, simulationComplete]);

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
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-black to-red-900/20 text-white relative overflow-hidden">
      {/* Dungeon Atmosphere Background */}
      <div className="absolute inset-0">
        {/* Main ambient glow */}
        <motion.div
          animate={{
            opacity: [0.1, 0.2, 0.1],
          }}
          transition={{
            duration: 6,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[1200px] h-[600px] bg-red-600/10 rounded-full blur-[200px]"
        />

        {/* Secondary glows for depth */}
        <motion.div
          animate={{
            opacity: [0.05, 0.1, 0.05],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 2,
          }}
          className="absolute bottom-20 left-1/4 w-[400px] h-[300px] bg-amber-500/5 rounded-full blur-[150px]"
        />

        <motion.div
          animate={{
            opacity: [0.03, 0.08, 0.03],
          }}
          transition={{
            duration: 10,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 4,
          }}
          className="absolute top-40 right-1/4 w-[500px] h-[400px] bg-emerald-600/5 rounded-full blur-[180px]"
        />

        {/* Texture overlay for dungeon feel */}
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `
              radial-gradient(circle at 25% 25%, rgba(255,255,255,0.1) 1px, transparent 1px),
              radial-gradient(circle at 75% 75%, rgba(255,255,255,0.05) 1px, transparent 1px)
            `,
            backgroundSize: "50px 50px, 30px 30px",
          }}
        />
      </div>

      <Navbar />

      <div className="relative z-10 container mx-auto px-3 sm:px-4 py-6 sm:py-8 md:py-12 max-w-4xl">
        {/* Dungeon Battle Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-6 sm:mb-8 md:mb-12 relative"
        >
          {/* Decorative border */}
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-red-500/50 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-red-500/30 to-transparent" />

          <div className="py-4 sm:py-6 md:py-8">
            <motion.h1
              className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-3 sm:mb-4 text-transparent bg-clip-text bg-gradient-to-r from-red-400 via-red-500 to-red-600 px-2"
              style={{
                fontFamily: "serif",
                textShadow:
                  "0 0 30px rgba(239, 68, 68, 0.5), 0 0 60px rgba(239, 68, 68, 0.2)",
              }}
              animate={{
                textShadow: [
                  "0 0 30px rgba(239, 68, 68, 0.5), 0 0 60px rgba(239, 68, 68, 0.2)",
                  "0 0 40px rgba(239, 68, 68, 0.7), 0 0 80px rgba(239, 68, 68, 0.3)",
                  "0 0 30px rgba(239, 68, 68, 0.5), 0 0 60px rgba(239, 68, 68, 0.2)",
                ],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            >
              VALHALLA BATTLE #{battleId}
            </motion.h1>

            {/* Warriors facing off */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-6 text-red-200/60 text-xs sm:text-sm mb-4 px-2">
              <div className="flex items-center gap-2 bg-red-950/30 px-3 sm:px-4 py-2 rounded-lg border border-red-500/20">
                <Shield className="w-3 h-3 sm:w-4 sm:h-4 text-emerald-400" />
                <span className="font-mono text-xs sm:text-sm">
                  {battleDetails.attacker.slice(0, 6)}...
                  {battleDetails.attacker.slice(-4)}
                </span>
              </div>
              <motion.div
                animate={{
                  rotate: [0, 5, -5, 0],
                  scale: [1, 1.1, 1],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              >
                <Swords className="w-5 h-5 sm:w-6 sm:h-6 text-red-500" />
              </motion.div>
              <div className="flex items-center gap-2 bg-amber-950/30 px-3 sm:px-4 py-2 rounded-lg border border-amber-600/20">
                <Zap className="w-3 h-3 sm:w-4 sm:h-4 text-amber-400" />
                <span className="font-mono text-xs sm:text-sm">
                  {battleDetails.defender.slice(0, 6)}...
                  {battleDetails.defender.slice(-4)}
                </span>
              </div>
            </div>

            {/* Battle Outcome Banner - Hidden until simulation completes (for new battles only) */}
            {!isNewBattle || simulationComplete ? (
              <motion.div
                initial={{ scale: 0.5, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                transition={{
                  delay: 0.5,
                  type: "spring",
                  stiffness: 100,
                  damping: 10,
                }}
                className={`inline-block px-6 py-3 rounded-lg font-bold text-lg tracking-wider border-2 ${
                  battleDetails.isVictory
                    ? "bg-green-950/50 border-green-500/50 text-green-300 shadow-lg shadow-green-500/20"
                    : "bg-red-950/50 border-red-500/50 text-red-300 shadow-lg shadow-red-500/20"
                }`}
                style={{
                  textShadow: battleDetails.isVictory
                    ? "0 0 10px rgba(34, 197, 94, 0.5)"
                    : "0 0 10px rgba(239, 68, 68, 0.5)",
                }}
              >
                {battleDetails.isVictory
                  ? "⚔️ VICTORIOUS ⚔️"
                  : "💀 DEFEATED 💀"}
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="inline-block px-6 py-3 rounded-lg font-bold text-lg tracking-wider border-2 bg-gray-950/50 border-gray-500/50 text-gray-400 shadow-lg shadow-gray-500/20"
              >
                ❓ BATTLE OUTCOME UNKNOWN ❓
              </motion.div>
            )}
          </div>
        </motion.div>

        {/* Fight Board */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mb-6 sm:mb-8"
        >
          <div className="border-2 border-red-500/30 bg-red-950/20 p-4 sm:p-6 md:p-8 relative overflow-hidden">
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

            <div className="space-y-6 sm:space-y-8 md:space-y-12">
              {/* Defense Lineup - Top Row */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 sm:gap-3 md:gap-4 p-2 sm:p-3 md:p-4">
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
                  const currentHealth =
                    unitHealths[beastKey] ?? beastStat?.health ?? 0;
                  const maxHealth = beastStat?.health ?? 0;

                  return (
                    <div
                      key={pos}
                      className="min-h-[140px] sm:min-h-[160px] md:min-h-[200px] border-2 border-dashed rounded-lg flex items-center justify-center transition-colors border-amber-900/50"
                    >
                      {hasBeast && imageUrl ? (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{
                            opacity: isDefeated ? 0.3 : 1,
                            scale: isHighlighted ? 1.05 : isDamaged ? 0.95 : 1,
                            filter: isDefeated ? "grayscale(100%)" : "none",
                          }}
                          transition={{ duration: 0.3 }}
                          className={`cursor-pointer w-full h-full relative overflow-hidden rounded-lg border-2 transition-all ${
                            isHighlighted
                              ? "border-yellow-400 shadow-lg shadow-yellow-400/50"
                              : isDamaged
                                ? "border-red-500"
                                : "border-amber-500/30"
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
                              {beastStat?.level ?? 0}
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
                          <div
                            className={`absolute bottom-0 left-0 border-2 rounded-tr-full w-11 h-11 flex items-end justify-start shadow-lg pl-1 pb-1 ${
                              currentHealth <= maxHealth * 0.25
                                ? "bg-red-900/95 border-red-500/70"
                                : currentHealth <= maxHealth * 0.5
                                  ? "bg-yellow-900/95 border-yellow-500/70"
                                  : "bg-emerald-900/95 border-emerald-500/70"
                            }`}
                          >
                            <motion.span
                              className={`text-xs font-bold leading-none ${
                                currentHealth <= maxHealth * 0.25
                                  ? "text-red-300"
                                  : currentHealth <= maxHealth * 0.5
                                    ? "text-yellow-300"
                                    : "text-emerald-300"
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
                              {beastStat?.power ?? 0}
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
                <div className="text-2xl sm:text-3xl font-bold text-red-500 mb-4 sm:mb-6">
                  VS
                </div>

                {/* Battle Simulation Controls */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-red-950/40 border border-red-500/30 rounded-lg p-4 sm:p-6 mb-4 sm:mb-6"
                >
                  <h3 className="text-base sm:text-lg font-bold text-red-400 mb-3 sm:mb-4 tracking-wider uppercase">
                    {simulationComplete
                      ? "Battle Complete"
                      : "Battle Simulation"}
                  </h3>

                  {/* Event Description - Mysterious for new battles only */}
                  <div className="mb-3 sm:mb-4 min-h-[1.5rem] sm:h-6">
                    <p className="text-red-200/80 text-xs sm:text-sm font-mono">
                      {isNewBattle
                        ? !isSimulating && !simulationComplete
                          ? "Battle outcome unknown... Begin simulation to witness the clash!"
                          : isSimulating && !simulationComplete
                            ? currentEventDescription ||
                              "Steel clashes in Valhalla..."
                            : currentEventDescription || "The dust settles..."
                        : currentEventDescription || "Ready to simulate battle"}
                    </p>
                  </div>

                  {/* Progress Bar - Hidden for new battles until simulation starts */}
                  {(!isNewBattle || isSimulating || simulationComplete) && (
                    <div className="w-full bg-red-950/60 rounded-full h-2 mb-3 sm:mb-4">
                      <motion.div
                        className="bg-red-500 h-2 rounded-full"
                        initial={{ width: 0 }}
                        animate={{
                          width:
                            simulationEvents.length > 0
                              ? `${(simulationStep / simulationEvents.length) * 100}%`
                              : "0%",
                        }}
                        transition={{ duration: 0.3 }}
                      />
                    </div>
                  )}

                  {/* Progress Text - Hidden for new battles initially to maintain mystery */}
                  {(!isNewBattle || isSimulating || simulationComplete) && (
                    <div className="text-red-300/60 text-[10px] sm:text-xs mb-3 sm:mb-4">
                      {simulationComplete
                        ? `Battle concluded after ${simulationEvents.length} events`
                        : `Event ${simulationStep} of ${simulationEvents.length}`}
                    </div>
                  )}

                  {/* Control Buttons */}
                  <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
                    <motion.button
                      onClick={toggleSimulation}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 bg-red-600/20 border border-red-500/50 rounded-lg hover:bg-red-600/30 transition-colors text-red-300 text-xs sm:text-sm"
                    >
                      {isSimulating && !isPaused ? (
                        <>
                          <Pause className="w-3 h-3 sm:w-4 sm:h-4" />{" "}
                          <span className="hidden xs:inline">Pause</span>
                        </>
                      ) : simulationComplete ? (
                        <>
                          <Play className="w-3 h-3 sm:w-4 sm:h-4" />{" "}
                          <span className="hidden xs:inline">View Again</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3 h-3 sm:w-4 sm:h-4" />{" "}
                          <span className="hidden xs:inline">
                            {simulationStep > 0 ? "Resume" : "Begin Battle"}
                          </span>
                          <span className="xs:hidden">
                            {simulationStep > 0 ? "Resume" : "Begin"}
                          </span>
                        </>
                      )}
                    </motion.button>

                    {/* Reset button - Only show after simulation starts, or always for historical battles */}
                    {(!isNewBattle ||
                      simulationStep > 0 ||
                      simulationComplete) && (
                      <motion.button
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        onClick={resetSimulation}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className="flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 bg-orange-600/20 border border-orange-500/50 rounded-lg hover:bg-orange-600/30 transition-colors text-orange-300 text-xs sm:text-sm"
                      >
                        <RotateCcw className="w-3 h-3 sm:w-4 sm:h-4" />{" "}
                        <span className="hidden xs:inline">Reset</span>
                      </motion.button>
                    )}

                    {/* Speed Controls */}
                    <div className="flex items-center gap-1">
                      {[2000, 1000, 500, 250].map((speed, idx) => (
                        <motion.button
                          key={speed}
                          onClick={() => setSimulationSpeed(speed)}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          className={`px-2 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs rounded transition-colors ${
                            simulationSpeed === speed
                              ? "bg-blue-600/30 border border-blue-500/50 text-blue-300"
                              : "bg-gray-600/20 border border-gray-500/30 text-gray-400 hover:text-gray-300"
                          }`}
                        >
                          {idx === 0
                            ? "0.5x"
                            : idx === 1
                              ? "1x"
                              : idx === 2
                                ? "2x"
                                : "4x"}
                        </motion.button>
                      ))}
                    </div>
                  </div>
                </motion.div>
              </div>

              {/* Attack Lineup - Bottom Row */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 sm:gap-3 md:gap-4 p-2 sm:p-3 md:p-4">
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
                  const currentHealth =
                    unitHealths[adventurerKey] ?? adventurer?.combatHealth ?? 0;
                  const maxHealth = adventurer?.combatHealth ?? 0;

                  return (
                    <div
                      key={pos}
                      className="min-h-[140px] sm:min-h-[160px] md:min-h-[200px] border-2 border-dashed rounded-lg flex items-center justify-center transition-colors border-emerald-500/30"
                    >
                      {adventurer?.image ? (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{
                            opacity: isDefeated ? 0.3 : 1,
                            scale: isHighlighted ? 1.05 : isDamaged ? 0.95 : 1,
                            filter: isDefeated ? "grayscale(100%)" : "none",
                          }}
                          transition={{ duration: 0.3 }}
                          className={`cursor-pointer w-full h-full relative overflow-hidden rounded-lg border-2 transition-all ${
                            isHighlighted
                              ? "border-yellow-400 shadow-lg shadow-yellow-400/50"
                              : isDamaged
                                ? "border-red-500"
                                : "border-emerald-500/30"
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
                          <div
                            className={`absolute bottom-0 left-0 border-2 rounded-tr-full w-11 h-11 flex items-end justify-start shadow-lg pl-1 pb-1 ${
                              currentHealth <= maxHealth * 0.25
                                ? "bg-red-900/95 border-red-500/70"
                                : currentHealth <= maxHealth * 0.5
                                  ? "bg-yellow-900/95 border-yellow-500/70"
                                  : "bg-emerald-900/95 border-emerald-500/70"
                            }`}
                          >
                            <motion.span
                              className={`text-xs font-bold leading-none ${
                                currentHealth <= maxHealth * 0.25
                                  ? "text-red-300"
                                  : currentHealth <= maxHealth * 0.5
                                    ? "text-yellow-300"
                                    : "text-emerald-300"
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
                          <div className="text-[10px]">SLOT {pos}</div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Battle Chronicle - Enhanced Dungeon Style */}
        {(!isNewBattle || simulationComplete) && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{
              delay: 1,
              type: "spring",
              stiffness: 80,
              damping: 12,
            }}
            className="mb-8 sm:mb-12 md:mb-16 relative"
          >
            <div className="relative border-2 border-red-500/40 bg-gradient-to-b from-red-950/30 via-red-950/20 to-black/40 p-4 sm:p-6 md:p-8 overflow-hidden">
              {/* Decorative Corner Elements */}
              <div className="absolute top-0 left-0 w-8 h-8 border-l-4 border-t-4 border-amber-500/50"></div>
              <div className="absolute top-0 right-0 w-8 h-8 border-r-4 border-t-4 border-amber-500/50"></div>
              <div className="absolute bottom-0 left-0 w-8 h-8 border-l-4 border-b-4 border-amber-500/50"></div>
              <div className="absolute bottom-0 right-0 w-8 h-8 border-r-4 border-b-4 border-amber-500/50"></div>

              {/* Atmospheric Glow */}
              <div className="absolute top-4 right-4 w-32 h-32 bg-red-600/5 rounded-full blur-[60px]"></div>

              <div className="relative z-10">
                {/* Chronicle Header */}
                <div className="flex items-center justify-center gap-2 sm:gap-3 mb-4 sm:mb-6">
                  <motion.div
                    animate={{ rotate: [0, 5, -5, 0] }}
                    transition={{
                      duration: 4,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                  ></motion.div>
                  <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-red-400 to-amber-400 tracking-wider uppercase">
                    BATTLE CHRONICLE
                  </h2>
                  <motion.div
                    animate={{ rotate: [0, -5, 5, 0] }}
                    transition={{
                      duration: 4,
                      repeat: Infinity,
                      ease: "easeInOut",
                      delay: 2,
                    }}
                  ></motion.div>
                </div>

                {/* Chronicle Content */}
                <div className="bg-black/50 border border-amber-500/30 rounded-lg p-3 sm:p-4 md:p-6 max-h-64 sm:max-h-80 md:max-h-96 overflow-y-auto custom-scrollbar">
                  <div className="space-y-1">
                    {battleDetails.battleLog.map((logEntry, index) => {
                      const isSeparator =
                        logEntry.includes("---") || logEntry.includes("═══");
                      const isHeader = logEntry.includes("Battle Chronicle");
                      const isRoundEnd =
                        logEntry.includes("Round") && logEntry.includes("End");
                      const isDefeat =
                        logEntry.includes("💀") ||
                        logEntry.includes("fainted!");
                      const isDamage =
                        logEntry.includes("dealt") &&
                        logEntry.includes("HP damage");
                      const isBattleEnd =
                        logEntry.includes("Battle #") &&
                        logEntry.includes("complete!");
                      const isVictory = logEntry.includes(
                        "You won the battle!",
                      );
                      const isDefeat2 = logEntry.includes("You were defeated!");

                      return (
                        <motion.div
                          key={index}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.02 }}
                          className={`
                          font-mono text-xs sm:text-sm transition-all hover:bg-red-950/20 rounded px-1 sm:px-2 py-0.5 sm:py-1
                          ${isSeparator ? "text-red-500/50 text-center my-1 border-b border-red-500/20" : ""}
                          ${isHeader ? "text-red-400 font-bold text-center my-2" : ""}
                          ${isRoundEnd ? "text-amber-300 font-bold bg-gradient-to-r from-amber-950/40 to-orange-950/30 p-2 rounded border-l-4 border-amber-500 shadow-md" : ""}
                          ${isDefeat ? "text-red-400 bg-gradient-to-r from-red-950/50 to-black/30 p-2 rounded border-l-3 border-red-600 shadow-md" : ""}
                          ${isDamage ? "text-orange-300 bg-orange-950/20 p-1 rounded border-l-2 border-orange-600/50" : ""}
                          ${isBattleEnd ? "text-red-300 font-bold bg-gradient-to-r from-red-950/60 to-red-900/40 p-3 rounded-lg border-l-4 border-red-400 shadow-lg shadow-red-500/20" : ""}
                          ${isVictory ? "text-green-300 font-bold bg-gradient-to-r from-green-950/60 to-green-900/40 p-3 rounded-lg border-l-4 border-green-400 shadow-lg shadow-green-500/20" : ""}
                          ${isDefeat2 ? "text-red-400 font-bold bg-gradient-to-r from-red-950/60 to-red-900/40 p-3 rounded-lg border-l-4 border-red-400 shadow-lg shadow-red-500/20" : ""}
                          ${!isSeparator && !isHeader && !isRoundEnd && !isDefeat && !isDamage && !isBattleEnd && !isVictory && !isDefeat2 ? "text-red-200/90 hover:text-red-100 pl-2" : ""}
                        `}
                          style={{
                            whiteSpace: "pre-line",
                            lineHeight: isSeparator ? "1.2" : "1.6",
                            textShadow: isVictory
                              ? "0 0 8px rgba(34, 197, 94, 0.5)"
                              : isBattleEnd || isDefeat2
                                ? "0 0 8px rgba(239, 68, 68, 0.5)"
                                : isRoundEnd
                                  ? "0 0 6px rgba(245, 158, 11, 0.4)"
                                  : isDefeat
                                    ? "0 0 4px rgba(239, 68, 68, 0.3)"
                                    : "none",
                          }}
                        >
                          {logEntry}
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Battle Statistics - Dungeon Style */}
        {(!isNewBattle || simulationComplete) && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{
              delay: 1.5,
              type: "spring",
              stiffness: 100,
              damping: 15,
            }}
            className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 md:gap-6"
          >
            {/* Total Events Stat */}
            <motion.div
              whileHover={{ scale: 1.02 }}
              className="relative border-2 border-amber-500/40 bg-gradient-to-br from-amber-950/30 via-red-950/20 to-black/40 p-4 sm:p-5 md:p-6 text-center overflow-hidden group"
            >
              {/* Corner decorations */}
              <div className="absolute top-1 left-1 w-4 h-4 border-l-2 border-t-2 border-amber-400/60"></div>
              <div className="absolute top-1 right-1 w-4 h-4 border-r-2 border-t-2 border-amber-400/60"></div>
              <div className="absolute bottom-1 left-1 w-4 h-4 border-l-2 border-b-2 border-amber-400/60"></div>
              <div className="absolute bottom-1 right-1 w-4 h-4 border-r-2 border-b-2 border-amber-400/60"></div>

              {/* Background glow */}
              <div className="absolute inset-0 bg-amber-600/5 rounded-lg group-hover:bg-amber-600/10 transition-all duration-500"></div>

              <div className="relative z-10">
                <div className="flex items-center justify-center gap-1 sm:gap-2 mb-1 sm:mb-2">
                  <Heart className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" />
                  <h3 className="text-amber-400 font-bold uppercase tracking-wider text-xs sm:text-sm">
                    Total Events
                  </h3>
                  <Heart className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" />
                </div>
                <motion.div
                  className="text-2xl sm:text-3xl font-bold text-amber-300"
                  animate={{
                    textShadow: [
                      "0 0 10px rgba(245, 158, 11, 0.5)",
                      "0 0 20px rgba(245, 158, 11, 0.8)",
                      "0 0 10px rgba(245, 158, 11, 0.5)",
                    ],
                  }}
                  transition={{
                    duration: 3,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                >
                  {battleDetails.events.length}
                </motion.div>
              </div>
            </motion.div>

            {/* Damage Events Stat */}
            <motion.div
              whileHover={{ scale: 1.02 }}
              className="relative border-2 border-red-500/40 bg-gradient-to-br from-red-950/30 via-orange-950/20 to-black/40 p-4 sm:p-5 md:p-6 text-center overflow-hidden group"
            >
              {/* Corner decorations */}
              <div className="absolute top-1 left-1 w-4 h-4 border-l-2 border-t-2 border-red-400/60"></div>
              <div className="absolute top-1 right-1 w-4 h-4 border-r-2 border-t-2 border-red-400/60"></div>
              <div className="absolute bottom-1 left-1 w-4 h-4 border-l-2 border-b-2 border-red-400/60"></div>
              <div className="absolute bottom-1 right-1 w-4 h-4 border-r-2 border-b-2 border-red-400/60"></div>

              {/* Background glow */}
              <div className="absolute inset-0 bg-red-600/5 rounded-lg group-hover:bg-red-600/10 transition-all duration-500"></div>

              <div className="relative z-10">
                <div className="flex items-center justify-center gap-1 sm:gap-2 mb-1 sm:mb-2">
                  <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-red-400" />
                  <h3 className="text-red-400 font-bold uppercase tracking-wider text-xs sm:text-sm">
                    Damage Events
                  </h3>
                  <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-red-400" />
                </div>
                <motion.div
                  className="text-2xl sm:text-3xl font-bold text-red-300"
                  animate={{
                    textShadow: [
                      "0 0 10px rgba(239, 68, 68, 0.5)",
                      "0 0 20px rgba(239, 68, 68, 0.8)",
                      "0 0 10px rgba(239, 68, 68, 0.5)",
                    ],
                  }}
                  transition={{
                    duration: 3,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: 1,
                  }}
                >
                  {
                    battleDetails.events.filter((e) => e.type === "damage")
                      .length
                  }
                </motion.div>
              </div>
            </motion.div>

            {/* Units Defeated Stat */}
            <motion.div
              whileHover={{ scale: 1.02 }}
              className="relative border-2 border-purple-500/40 bg-gradient-to-br from-purple-950/30 via-red-950/20 to-black/40 p-4 sm:p-5 md:p-6 text-center overflow-hidden group"
            >
              {/* Corner decorations */}
              <div className="absolute top-1 left-1 w-4 h-4 border-l-2 border-t-2 border-purple-400/60"></div>
              <div className="absolute top-1 right-1 w-4 h-4 border-r-2 border-t-2 border-purple-400/60"></div>
              <div className="absolute bottom-1 left-1 w-4 h-4 border-l-2 border-b-2 border-purple-400/60"></div>
              <div className="absolute bottom-1 right-1 w-4 h-4 border-r-2 border-b-2 border-purple-400/60"></div>

              {/* Background glow */}
              <div className="absolute inset-0 bg-purple-600/5 rounded-lg group-hover:bg-purple-600/10 transition-all duration-500"></div>

              <div className="relative z-10">
                <div className="flex items-center justify-center gap-1 sm:gap-2 mb-1 sm:mb-2">
                  <Shield className="w-4 h-4 sm:w-5 sm:h-5 text-purple-400" />
                  <h3 className="text-purple-400 font-bold uppercase tracking-wider text-xs sm:text-sm">
                    Units Defeated
                  </h3>
                  <Shield className="w-4 h-4 sm:w-5 sm:h-5 text-purple-400" />
                </div>
                <motion.div
                  className="text-2xl sm:text-3xl font-bold text-purple-300"
                  animate={{
                    textShadow: [
                      "0 0 10px rgba(147, 51, 234, 0.5)",
                      "0 0 20px rgba(147, 51, 234, 0.8)",
                      "0 0 10px rgba(147, 51, 234, 0.5)",
                    ],
                  }}
                  transition={{
                    duration: 3,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: 2,
                  }}
                >
                  {
                    battleDetails.events.filter((e) => e.type === "defeat")
                      .length
                  }
                </motion.div>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* League of Legends Style Result Banner - Only for new battles */}
        {showResultBanner && isNewBattle && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center"
            onClick={() => setShowResultBanner(false)}
          >
            <motion.div
              initial={{ scale: 0.3, opacity: 0, y: 100 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{
                type: "spring",
                stiffness: 150,
                damping: 20,
                delay: 0.2,
              }}
              className="relative"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Victory Banner */}
              {battleDetails.isVictory ? (
                <div className="text-center">
                  {/* Main Victory Text */}
                  <motion.div
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.4, duration: 0.8, type: "spring" }}
                    className="relative"
                  >
                    <h1
                      className="text-8xl md:text-9xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-yellow-300 to-yellow-500 mb-4"
                      style={{
                        textShadow:
                          "0 0 60px rgba(255, 215, 0, 0.8), 0 0 120px rgba(255, 215, 0, 0.4)",
                        fontFamily: "serif",
                      }}
                    >
                      VICTORY
                    </h1>

                    {/* Victory Effects */}
                    <div className="absolute inset-0 -z-10">
                      {[...Array(12)].map((_, i) => (
                        <motion.div
                          key={i}
                          className="absolute w-2 h-2 bg-yellow-400 rounded-full"
                          style={{
                            left: `${50 + Math.cos((i * 30 * Math.PI) / 180) * 200}px`,
                            top: `${50 + Math.sin((i * 30 * Math.PI) / 180) * 200}px`,
                          }}
                          animate={{
                            scale: [0, 1, 0],
                            opacity: [0, 1, 0],
                          }}
                          transition={{
                            duration: 2,
                            repeat: Infinity,
                            delay: i * 0.1,
                          }}
                        />
                      ))}
                    </div>
                  </motion.div>

                  {/* Victory Subtitle */}
                  <motion.p
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.8 }}
                    className="text-2xl text-yellow-200 mb-8 font-bold tracking-wider"
                  >
                    🏆 BATTLE WON! YOUR WARRIORS EMERGE TRIUMPHANT! 🏆
                  </motion.p>

                  {/* Button Container */}
                  <div className="flex flex-col gap-4 items-center">
                    {/* Primary Button - Continue */}
                    <motion.button
                      initial={{ opacity: 0, y: 30 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 1.2 }}
                      onClick={() => navigate("/attack")}
                      whileHover={{
                        scale: 1.05,
                        boxShadow: "0 0 30px rgba(255, 215, 0, 0.5)",
                      }}
                      whileTap={{ scale: 0.95 }}
                      className="px-12 py-4 bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-500 hover:to-yellow-400 text-black font-bold text-xl rounded-lg shadow-lg transition-all duration-300 border-2 border-yellow-400"
                      style={{
                        textShadow: "0 1px 2px rgba(0,0,0,0.3)",
                      }}
                    >
                      Continue →
                    </motion.button>

                    {/* Secondary Button - Replay */}
                    <motion.button
                      initial={{ opacity: 0, y: 30 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 1.3 }}
                      onClick={resetSimulation}
                      whileHover={{
                        scale: 1.02,
                        borderColor: "rgba(255, 215, 0, 1)",
                      }}
                      whileTap={{ scale: 0.98 }}
                      className="px-8 py-3 border-2 border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/10 font-semibold text-base rounded-lg transition-all duration-300"
                    >
                      ⚔️ Replay Battle
                    </motion.button>
                  </div>
                </div>
              ) : (
                /* Defeat Banner */
                <div className="text-center">
                  {/* Main Defeat Text */}
                  <motion.div
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.4, duration: 0.8, type: "spring" }}
                    className="relative"
                  >
                    <h1
                      className="text-8xl md:text-9xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-red-400 to-red-600 mb-4"
                      style={{
                        textShadow:
                          "0 0 60px rgba(239, 68, 68, 0.8), 0 0 120px rgba(239, 68, 68, 0.4)",
                        fontFamily: "serif",
                      }}
                    >
                      DEFEAT
                    </h1>

                    {/* Defeat Effects */}
                    <div className="absolute inset-0 -z-10">
                      {[...Array(8)].map((_, i) => (
                        <motion.div
                          key={i}
                          className="absolute w-3 h-3 bg-red-500 rounded-full opacity-60"
                          style={{
                            left: `${50 + Math.cos((i * 45 * Math.PI) / 180) * 150}px`,
                            top: `${50 + Math.sin((i * 45 * Math.PI) / 180) * 150}px`,
                          }}
                          animate={{
                            y: [0, -30, 0],
                            opacity: [0.6, 0.2, 0.6],
                          }}
                          transition={{
                            duration: 3,
                            repeat: Infinity,
                            delay: i * 0.2,
                          }}
                        />
                      ))}
                    </div>
                  </motion.div>

                  {/* Defeat Subtitle */}
                  <motion.p
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.8 }}
                    className="text-2xl text-red-200 mb-8 font-bold tracking-wider"
                  >
                    💀 YOUR WARRIORS HAVE FALLEN IN BATTLE 💀
                  </motion.p>

                  {/* Button Container */}
                  <div className="flex flex-col gap-4 items-center">
                    {/* Primary Button - Find New Opponent */}
                    <motion.button
                      initial={{ opacity: 0, y: 30 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 1.2 }}
                      onClick={() => navigate("/attack")}
                      whileHover={{
                        scale: 1.05,
                        boxShadow: "0 0 30px rgba(239, 68, 68, 0.5)",
                      }}
                      whileTap={{ scale: 0.95 }}
                      className="px-12 py-4 bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white font-bold text-xl rounded-lg shadow-lg transition-all duration-300 border-2 border-red-400"
                      style={{
                        textShadow: "0 1px 2px rgba(0,0,0,0.3)",
                      }}
                    >
                      Find New Opponent →
                    </motion.button>

                    {/* Secondary Button - Replay */}
                    <motion.button
                      initial={{ opacity: 0, y: 30 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 1.3 }}
                      onClick={resetSimulation}
                      whileHover={{
                        scale: 1.02,
                        borderColor: "rgba(239, 68, 68, 1)",
                      }}
                      whileTap={{ scale: 0.98 }}
                      className="px-8 py-3 border-2 border-red-500/50 text-red-400 hover:bg-red-500/10 font-semibold text-base rounded-lg transition-all duration-300"
                    >
                      ⚔️ Replay Battle
                    </motion.button>
                  </div>
                </div>
              )}

              {/* Close hint */}
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.6 }}
                transition={{ delay: 2 }}
                className="absolute -bottom-12 left-1/2 transform -translate-x-1/2 text-gray-400 text-sm"
              >
                Click anywhere to close this modal
              </motion.p>
            </motion.div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
