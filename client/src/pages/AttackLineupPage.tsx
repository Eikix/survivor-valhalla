// src/pages/AttackLineupPage.tsx
import { motion } from "framer-motion";
import { Swords } from "lucide-react";
import { useState, useEffect, useMemo, useRef } from "react";
import { useConnect, useAccount } from "@starknet-react/core";
import { useDojoSDK, useEntityQuery, useModels } from "@dojoengine/sdk/react";
import { ToriiQueryBuilder } from "@dojoengine/sdk";
import { Navbar } from "../components/navbar";
import { WorldBeastLineups } from "../components/WorldBeastLineups";
import { useAdventurers } from "../hooks/useAdventurers";
import { useBeastLineupImages } from "../hooks/useBeasts";
import { useBattleEvents } from "../hooks/useBattleEvents";
import type { Adventurer } from "../hooks/useAdventurers";
import {
  ModelsMapping,
  type AttackLineup,
  type BeastLineup,
} from "../bindings/typescript/models.gen";
import { addAddressPadding } from "starknet";
import { useTransactionToast } from "../hooks/useTransactionToast";

type BeastLineupWithId = BeastLineup & { entityId: string };

export function AttackLineupPage() {
  const [inspectedAdventurer, setInspectedAdventurer] = useState<Adventurer | null>(null);
  const [inspectedEnemyBeast, setInspectedEnemyBeast] = useState<string | null>(null);
  const [attackLineup, setAttackLineup] = useState<(Adventurer | null)[]>(
    Array(5).fill(null),
  );
  const [selectedEnemy, setSelectedEnemy] = useState<BeastLineupWithId | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState<number>(-1);
  const [sortBy, setSortBy] = useState<keyof Adventurer | "">("");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // Use battle events hook
  const {
    battleInProgress,
    battleLog,
    battleResult,
    startBattle,
    clearBattleState,
  } = useBattleEvents();

  const { connect, connectors } = useConnect();
  const { status, address, account } = useAccount();
  const {
    data: adventurers = [],
    isLoading: isLoadingAdventurers,
    error,
  } = useAdventurers(address, {
    enabled: status === "connected",
  });

  const { client } = useDojoSDK();
  const { showTransaction } = useTransactionToast();

  const createLineup = async () => {
    if (!client || !account) return;
    
    const tx = showTransaction(undefined, "Creating adventurer lineup...");
    
    try {
      // Convert to numbers to ensure u64 compatibility
      await client.battle_actions.setAttackLineup(
        account,
        Number(attackLineup[0]?.adventurer_id || 0),
        Number(attackLineup[1]?.adventurer_id || 0),
        Number(attackLineup[2]?.adventurer_id || 0),
        Number(attackLineup[3]?.adventurer_id || 0),
        Number(attackLineup[4]?.adventurer_id || 0),
      );
      tx.success("Adventurer lineup created successfully!");
    } catch (error) {
      console.error("Failed to create lineup:", error);
      tx.error("Failed to create adventurer lineup");
    }
  };

  const updateLineup = async () => {
    if (!client || !account) return;

    const tx = showTransaction(undefined, `Updating adventurer lineup...`);
    
    try {
      // Convert to numbers to ensure u64 compatibility
      await client.battle_actions.setAttackLineup(
        account,
        Number(attackLineup[0]?.adventurer_id || 0),
        Number(attackLineup[1]?.adventurer_id || 0),
        Number(attackLineup[2]?.adventurer_id || 0),
        Number(attackLineup[3]?.adventurer_id || 0),
        Number(attackLineup[4]?.adventurer_id || 0),
      );
      tx.success("Adventurer lineup updated successfully!");
    } catch (error) {
      console.error("Failed to update lineup:", error);
      tx.error("Failed to update adventurer lineup");
    }
  };

  const executeBattle = async () => {
    if (!client || !account || !selectedEnemy || !hasLineup) return;
    
    const tx = showTransaction(undefined, "Initiating battle...");
    
    try {
      // Start battle tracking with hook
      startBattle();
      
      await client.battle_actions.battle(
        account,
        selectedEnemy.player
      );
      tx.success("Battle initiated!");
      
    } catch (error) {
      console.error("Failed to start battle:", error);
      tx.error("Failed to start battle");
      clearBattleState();
    }
  };

  const handleRandomFill = () => {
    if (adventurers.length === 0) return;

    // Shuffle adventurers array and take first 5
    const shuffled = [...adventurers].sort(() => Math.random() - 0.5);
    const randomAdventurers = shuffled.slice(0, 5);

    // Fill remaining slots with null if we have fewer than 5 adventurers
    const filledSlots = [
      ...randomAdventurers,
      ...Array(5 - randomAdventurers.length).fill(null),
    ].slice(0, 5);

    setAttackLineup(filledSlots);
  };

  // Query on-chain attack lineups
  useEntityQuery(
    new ToriiQueryBuilder()
      .includeHashedKeys()
      .withEntityModels([ModelsMapping.AttackLineup]),
  );
  const allLineups = useModels(ModelsMapping.AttackLineup);

  // Query beast lineups for enemy selection
  useEntityQuery(
    new ToriiQueryBuilder()
      .includeHashedKeys()
      .withEntityModels([ModelsMapping.BeastLineup]),
  );
  const allBeastLineups = useModels(ModelsMapping.BeastLineup);

  // Type for lineup objects returned by useModels
  type LineupObj = Record<string, AttackLineup>;
  type AttackLineupWithId = AttackLineup & { entityId: string };

  const userLineup = useMemo((): AttackLineupWithId | null => {
    if (!address) return null;

    const paddedAddress = addAddressPadding(
      address.toLowerCase(),
    ).toLowerCase();

    if (!Array.isArray(allLineups)) return null;

    const found = allLineups.find((lineupObj: LineupObj) => {
      const entityId = Object.keys(lineupObj)[0];
      const lineup = lineupObj[entityId];
      return lineup?.player?.toLowerCase() === paddedAddress;
    });

    if (!found) return null;

    const entityId = Object.keys(found)[0];
    return {
      entityId,
      ...found[entityId],
    };
  }, [allLineups, address]);

  // Beast lineups for enemy selection (excluding user's own base)
  const worldBeastLineups = useMemo((): BeastLineupWithId[] => {
    if (!Array.isArray(allBeastLineups)) return [];

    const paddedAddress = address
      ? addAddressPadding(address.toLowerCase()).toLowerCase()
      : null;

    return allBeastLineups
      .map((lineupObj: Record<string, BeastLineup>) => {
        const entityId = Object.keys(lineupObj)[0];
        const lineup = lineupObj[entityId];

        if (!lineup) return null;

        return {
          entityId,
          player: lineup.player,
          beast1_id: lineup.beast1_id,
          beast2_id: lineup.beast2_id,
          beast3_id: lineup.beast3_id,
          beast4_id: lineup.beast4_id,
          beast5_id: lineup.beast5_id,
        };
      })
      .filter((lineup): lineup is BeastLineupWithId => {
        if (lineup === null) return false;
        // Filter out user's own base
        if (paddedAddress && lineup.player?.toLowerCase() === paddedAddress) {
          return false;
        }
        return true;
      });
  }, [allBeastLineups, address]);

 

  // Extract all unique token IDs from beast lineups for fetching images
  const allBeastLineupTokenIds = useMemo(() => {
    const tokenIds: (string | number | bigint)[] = [];
    worldBeastLineups.forEach((lineup) => {
      [
        lineup.beast1_id,
        lineup.beast2_id,
        lineup.beast3_id,
        lineup.beast4_id,
        lineup.beast5_id,
      ].forEach((id) => {
        if (id && Number(id) > 0) {
          tokenIds.push(id);
        }
      });
    });
    return tokenIds;
  }, [worldBeastLineups]);


  // Fetch images for all beast lineup beasts
  const { data: beastLineupImages = {} } = useBeastLineupImages(allBeastLineupTokenIds, {
    enabled: allBeastLineupTokenIds.length > 0,
  });


  const hasLineup = !!userLineup;
  const lastProcessedLineupRef = useRef<string>("");
  const adventurersIdsString = useMemo(
    () =>
      adventurers
        .map((a) => a.id)
        .sort()
        .join(","),
    [adventurers],
  );

  // Load attack lineup from on-chain data when lineup exists
  useEffect(() => {
    if (hasLineup && userLineup && adventurers.length > 0) {
      const lineupAdventurerIds = [
        userLineup.adventurer1_id,
        userLineup.adventurer2_id,
        userLineup.adventurer3_id,
        userLineup.adventurer4_id,
        userLineup.adventurer5_id,
      ];

      // Create a stable key for this lineup + adventurers combination
      const lineupKey = lineupAdventurerIds.map((id) => String(id || 0)).join(",");
      const combinedKey = `${lineupKey}:${adventurersIdsString}`;

      // Skip if we've already processed this exact lineup with the same adventurers
      if (lastProcessedLineupRef.current === combinedKey) {
        return;
      }

      const loadedAdventurers = lineupAdventurerIds.map((adventurerId) => {
        if (adventurerId && Number(adventurerId) > 0) {
          return adventurers.find((a) => a.adventurer_id === Number(adventurerId)) || null;
        }
        return null;
      });

      setAttackLineup(loadedAdventurers);
      lastProcessedLineupRef.current = combinedKey;
    } else if (!hasLineup) {
      // Only clear if we haven't already cleared it
      if (lastProcessedLineupRef.current !== "empty") {
        setAttackLineup(Array(5).fill(null));
        lastProcessedLineupRef.current = "empty";
      }
    }
  }, [hasLineup, userLineup, adventurersIdsString, adventurers]);

  // Check if current lineup differs from on-chain lineup
  const hasLineupChanges = useMemo(() => {
    if (!hasLineup || !userLineup) return false;
    
    const currentIds = attackLineup.map(a => a?.adventurer_id || 0);
    const onChainIds = [
      Number(userLineup.adventurer1_id || 0),
      Number(userLineup.adventurer2_id || 0),
      Number(userLineup.adventurer3_id || 0),
      Number(userLineup.adventurer4_id || 0),
      Number(userLineup.adventurer5_id || 0),
    ];
    
    return currentIds.some((id, index) => id !== onChainIds[index]);
  }, [hasLineup, userLineup, attackLineup]);

  // Sort adventurers based on sortBy and sortDirection
  const sortedAdventurers = useMemo(() => {
    // Remove duplicates first (by id)
    const uniqueAdventurers = Array.from(
      new Map(adventurers.map((adventurer) => [adventurer.id, adventurer])).values(),
    );

    if (!sortBy) {
      return uniqueAdventurers;
    }

    const sorted = [...uniqueAdventurers];
    sorted.sort((a, b) => {
      const aVal = a[sortBy];
      const bVal = b[sortBy];

      // Handle null/undefined
      if (aVal == null && bVal == null) return a.id - b.id; // Stable sort tiebreaker
      if (aVal == null) return 1;
      if (bVal == null) return -1;

      // Number comparison
      if (typeof aVal === "number" && typeof bVal === "number") {
        // Handle NaN cases
        if (isNaN(aVal) && isNaN(bVal)) return a.id - b.id; // Stable sort tiebreaker
        if (isNaN(aVal)) return 1;
        if (isNaN(bVal)) return -1;
        const result = sortDirection === "asc" ? aVal - bVal : bVal - aVal;
        // If values are equal, use ID as tiebreaker for stable sort
        return result !== 0 ? result : a.id - b.id;
      }

      // String comparison
      if (typeof aVal === "string" && typeof bVal === "string") {
        const result =
          sortDirection === "asc"
            ? aVal.localeCompare(bVal)
            : bVal.localeCompare(aVal);
        // If values are equal, use ID as tiebreaker for stable sort
        return result !== 0 ? result : a.id - b.id;
      }

      return a.id - b.id; // Default stable sort tiebreaker
    });

    return sorted;
  }, [adventurers, sortBy, sortDirection]);

  const cartridgeConnector = connectors.find(
    (connector) => connector.id === "controller",
  );

  // Check if cartridge connector is undefined
  if (!cartridgeConnector) {
    return (
      <div className="min-h-screen bg-black text-white relative overflow-hidden">
        <div className="relative z-10 container mx-auto px-4 py-12 max-w-4xl">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center"
          >
            <div className="border border-emerald-500/30 bg-emerald-950/20 p-12">
              <Swords className="w-16 h-16 text-emerald-500/50 mx-auto mb-6" />
              <h2 className="text-2xl font-bold text-emerald-400 mb-4 tracking-wider uppercase">
                Connector Not Found
              </h2>
              <p className="text-emerald-200/60 mb-4 text-sm tracking-wide">
                The Cartridge Controller connector is not available.
              </p>
              <p className="text-emerald-200/40 text-xs">
                Please ensure the Cartridge wallet is installed and properly
                configured.
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  useEffect(() => {
    if (!inspectedAdventurer && !inspectedEnemyBeast) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setInspectedAdventurer(null);
        setInspectedEnemyBeast(null);
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [inspectedAdventurer, inspectedEnemyBeast]);

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
            ATTACK MODE
          </h1>
          <p className="text-emerald-200/40 text-sm tracking-widest uppercase">
            Choose your enemy and battle
          </p>
        </motion.div>

        {/* Wallet Connection Section */}
        {status !== "connected" ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-center mb-16"
          >
            <div className="border border-emerald-500/30 bg-emerald-950/20 p-12 mb-8">
              <Swords className="w-16 h-16 text-emerald-500/50 mx-auto mb-6" />
              <p className="text-emerald-200/60 mb-8 text-sm tracking-wide uppercase">
                Connect your wallet to enter battle mode
              </p>
              <motion.button
                onClick={() => connect({ connector: connectors[0] })}
                disabled={status === "connecting"}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="px-10 py-4 text-lg font-bold tracking-wider uppercase border-2 border-emerald-500/50 hover:border-emerald-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                style={{
                  background:
                    "linear-gradient(to bottom, rgba(16, 185, 129, 0.1), rgba(0, 0, 0, 0.4))",
                  textShadow: "0 0 10px rgba(16, 185, 129, 0.5)",
                }}
              >
                <span className="text-emerald-500">
                  {status === "connecting" ? "CONNECTING..." : "CONNECT WALLET"}
                </span>
              </motion.button>
            </div>
          </motion.div>
        ) : (
          <>
            {/* Battle Result Display */}
            {battleResult && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="mb-16 text-center"
              >
                <div className={`border p-8 ${
                  battleResult.includes("Victory") 
                    ? "border-emerald-500/50 bg-emerald-950/20"
                    : "border-emerald-500/50 bg-emerald-950/20"
                }`}>
                  <h2 className={`text-4xl font-bold mb-4 tracking-wider uppercase ${
                    battleResult.includes("Victory") ? "text-emerald-400" : "text-emerald-400"
                  }`}>
                    {battleResult}
                  </h2>
                  <motion.button
                    onClick={() => {
                      clearBattleState();
                      setSelectedEnemy(null);
                    }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="px-6 py-2 text-sm font-bold tracking-wider uppercase border border-gray-500/50 hover:border-gray-400 transition-all cursor-pointer text-gray-300"
                  >
                    Continue
                  </motion.button>
                </div>
              </motion.div>
            )}


            {/* Enemy Selection Section - Only show if no enemy selected */}
            {!selectedEnemy && !battleResult && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="mb-16"
              >
                <WorldBeastLineups
                  lineups={worldBeastLineups}
                  beastImages={beastLineupImages}
                  isSelectionMode={true}
                  onSelectLineup={setSelectedEnemy}
                  selectedLineup={selectedEnemy}
                />
              </motion.div>
            )}

            {/* Formation Section - Only show when enemy is selected */}
            {selectedEnemy && !battleResult && (
              <>
                {/* Enemy Force Section */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="mb-8"
                >
                  <div className="border-2 border-amber-900/50 bg-emerald-950/20 p-8 relative overflow-hidden" style={{
                    boxShadow: "0 0 20px rgba(120, 53, 15, 0.2), inset 0 0 20px rgba(120, 53, 15, 0.05)"
                  }}>
                    {/* Accent pattern overlay */}
                    <div className="absolute inset-0 opacity-10 pointer-events-none" style={{
                      backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(120, 53, 15, 0.1) 10px, rgba(120, 53, 15, 0.1) 20px)"
                    }} />
                    <div className="text-center relative z-10">
                      <Swords className="w-12 h-12 text-amber-900/70 mx-auto mb-4 rotate-180" />
                      <h2 className="text-2xl font-bold text-amber-800 mb-2 tracking-wider uppercase" style={{
                        textShadow: "0 0 10px rgba(120, 53, 15, 0.5)"
                      }}>
                        Enemy Force
                      </h2>
                      <div className="text-amber-700/70 font-mono text-xs mb-4">
                        {selectedEnemy.player?.slice(0, 6)}...{selectedEnemy.player?.slice(-4)}
                      </div>
                      <div className="grid grid-cols-5 gap-4 p-4">
                        {[1, 2, 3, 4, 5].map((pos) => {
                          const beastId = selectedEnemy[`beast${pos}_id` as keyof typeof selectedEnemy];
                          const hasBeast = beastId && Number(beastId) > 0;
                          const lookupKey = hasBeast ? String(Number(beastId)) : "";
                          const imageUrl = hasBeast ? beastLineupImages[lookupKey] : null;
                          return (
                            <div
                              key={pos}
                              className="aspect-square flex items-center justify-center relative rounded-lg bg-emerald-950/30"
                            >
                              {hasBeast && imageUrl ? (
                                <motion.img
                                  initial={{ opacity: 0, scale: 0.9 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  src={imageUrl}
                                  alt={`Beast ${beastId}`}
                                  className="w-full h-full object-contain cursor-pointer"
                                  onClick={() => setInspectedEnemyBeast(imageUrl)}
                                />
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </motion.div>

                {/* VS Divider */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.4 }}
                  className="text-center mb-8"
                >
                  <div className="text-4xl font-bold text-emerald-500 mb-4">VS</div>
                  {hasLineup && attackLineup.every((a) => a !== null) ? (
                    <motion.button
                      onClick={executeBattle}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="px-8 py-3 text-lg font-bold tracking-wider uppercase border-2 border-emerald-500/50 hover:border-emerald-500 transition-all cursor-pointer"
                      style={{
                        background: "linear-gradient(to bottom, rgba(16, 185, 129, 0.1), rgba(0, 0, 0, 0.4))",
                        textShadow: "0 0 10px rgba(16, 185, 129, 0.5)",
                      }}
                    >
                      <span className="text-emerald-500">BATTLE!</span>
                    </motion.button>
                  ) : (
                    <div className="text-emerald-400/50 text-sm uppercase tracking-wider">
                      Complete Your Lineup Below
                    </div>
                  )}
                </motion.div>

                {/* Your Attack Force Section */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="mb-16"
                >
                  <div className="border border-emerald-500/30 bg-emerald-950/20 p-8 relative">
                    {!hasLineup && (
                      <div className="absolute top-4 right-4 flex gap-2">
                        {adventurers.length > 0 && (
                          <motion.button
                            onClick={handleRandomFill}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            className="px-4 py-2 text-xs font-bold tracking-wider uppercase border border-emerald-500/50 hover:border-emerald-500 transition-all cursor-pointer text-emerald-400"
                            style={{
                              background:
                                "linear-gradient(to bottom, rgba(16, 185, 129, 0.1), rgba(0, 0, 0, 0.4))",
                            }}
                          >
                            Random Fill
                          </motion.button>
                        )}
                        {attackLineup.some((a) => a !== null) && (
                          <motion.button
                            onClick={() => setAttackLineup(Array(5).fill(null))}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            className="px-4 py-2 text-xs font-bold tracking-wider uppercase border border-orange-500/50 hover:border-orange-500 transition-all cursor-pointer text-orange-400"
                            style={{
                              background:
                                "linear-gradient(to bottom, rgba(251, 146, 60, 0.1), rgba(0, 0, 0, 0.4))",
                            }}
                          >
                            Clear Lineup
                          </motion.button>
                        )}
                      </div>
                    )}
                    <div className="text-center">
                      <Swords className="w-12 h-12 text-emerald-500/50 mx-auto mb-4" />
                      <h2 className="text-2xl font-bold text-emerald-400 mb-4 tracking-wider uppercase">
                        Your Attack Force
                      </h2>
                      <div className="grid grid-cols-5 gap-4 p-4">
                        {attackLineup.map((adventurer, index) => (
                          <div
                            key={index}
                            className={`min-h-[150px] border-2 border-dashed rounded-lg flex items-center justify-center transition-colors ${
                              isDraggingOver === index
                                ? "border-emerald-500 bg-emerald-950/30"
                                : "border-emerald-500/30"
                            }`}
                            onDragOver={(e: React.DragEvent) => {
                              e.preventDefault();
                              setIsDraggingOver(index);
                            }}
                            onDragLeave={() => {
                              setIsDraggingOver(-1);
                            }}
                            onDrop={(e: React.DragEvent) => {
                              e.preventDefault();
                              setIsDraggingOver(-1);
                              const adventurerId = parseInt(
                                e.dataTransfer.getData("adventurerId"),
                              );
                              const adventurerToAdd = adventurers.find(
                                (a) => a.id === adventurerId,
                              );
                              // Check if adventurer is already in lineup
                              const isAlreadyInLineup = attackLineup.some(
                                (a) => a?.id === adventurerId,
                              );
                              if (adventurerToAdd && !isAlreadyInLineup) {
                                const newAttackLineup = [...attackLineup];
                                newAttackLineup[index] = adventurerToAdd;
                                setAttackLineup(newAttackLineup);
                              }
                            }}
                          >
                            {adventurer ? (
                              <motion.div
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="cursor-pointer text-center"
                              >
                                {adventurer.image && (
                                  <img
                                    src={adventurer.image}
                                    alt={`${adventurer.name} - Level: ${adventurer.level}, Health: ${adventurer.health}`}
                                    className="w-24 h-24 mx-auto mb-1"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setInspectedAdventurer(adventurer);
                                    }}
                                  />
                                )}
                                <div className="text-emerald-300 text-xs">Lvl {adventurer.level}</div>
                              </motion.div>
                            ) : (
                              <div className="text-emerald-200/20 text-xs text-center">
                                Slot {index + 1}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      {!hasLineup ? (
                        <motion.button
                          onClick={createLineup}
                          disabled={!attackLineup.every((a) => a !== null)}
                          whileHover={
                            attackLineup.every((a) => a !== null)
                              ? { scale: 1.05 }
                              : {}
                          }
                          whileTap={
                            attackLineup.every((a) => a !== null)
                              ? { scale: 0.95 }
                              : {}
                          }
                          className="mt-6 px-8 py-3 text-base font-bold tracking-wider uppercase border-2 transition-all cursor-pointer disabled:opacity-50"
                          style={{
                            borderColor: attackLineup.every((a) => a !== null)
                              ? "rgba(16, 185, 129, 0.5)"
                              : "rgba(16, 185, 129, 0.3)",
                            background: attackLineup.every((a) => a !== null)
                              ? "linear-gradient(to bottom, rgba(16, 185, 129, 0.1), rgba(0, 0, 0, 0.4))"
                              : "linear-gradient(to bottom, rgba(16, 185, 129, 0.05), rgba(0, 0, 0, 0.3))",
                            textShadow: attackLineup.every((a) => a !== null)
                              ? "0 0 10px rgba(16, 185, 129, 0.5)"
                              : "none",
                          }}
                        >
                          <span
                            className={
                              attackLineup.every((a) => a !== null)
                                ? "text-emerald-500"
                                : "text-emerald-400/50"
                            }
                          >
                            {attackLineup.every((a) => a !== null)
                              ? "Deploy Force"
                              : "Force Incomplete"}
                          </span>
                        </motion.button>
                      ) : hasLineupChanges ? (
                        <motion.button
                          onClick={updateLineup}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          className="mt-6 px-8 py-3 text-base font-bold tracking-wider uppercase border-2 transition-all cursor-pointer"
                          style={{
                            borderColor: "rgba(16, 185, 129, 0.5)",
                            background:
                              "linear-gradient(to bottom, rgba(16, 185, 129, 0.1), rgba(0, 0, 0, 0.4))",
                            textShadow: "0 0 10px rgba(16, 185, 129, 0.5)",
                          }}
                        >
                          <span className="text-emerald-500">
                            Update
                          </span>
                        </motion.button>
                      ) : null}
                      
                      <div className="mt-4 text-center">
                        <motion.button
                          onClick={() => setSelectedEnemy(null)}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          className="px-4 py-2 text-sm font-bold tracking-wider uppercase border border-gray-500/50 hover:border-gray-400 transition-all cursor-pointer text-gray-300"
                        >
                          Choose Different Enemy
                        </motion.button>
                      </div>
                    </div>
                  </div>
                </motion.div>

                {/* Battle Log Section - Show during combat */}
                {(battleInProgress || battleLog.length > 0) && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="mb-16"
                  >
                    <div className="border border-yellow-500/30 bg-yellow-950/20 p-8">
                      <h2 className="text-center text-xl font-bold text-yellow-400 mb-6 tracking-wider uppercase flex items-center justify-center gap-2">
                        ⚔️ Battle Log
                        {battleInProgress && (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-400"></div>
                        )}
                      </h2>
                      <div className="max-h-80 overflow-y-auto border border-yellow-500/20 bg-black/30 p-4 rounded">
                        {battleLog.length > 0 ? (
                          <div className="space-y-2">
                            {battleLog.map((logEntry, index) => (
                              <motion.div
                                key={index}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: index * 0.1 }}
                                className="text-sm font-mono text-yellow-200/90 border-l-2 border-yellow-500/30 pl-4"
                              >
                                {logEntry}
                              </motion.div>
                            ))}
                          </div>
                        ) : battleInProgress ? (
                          <div className="text-center text-yellow-400/60 text-sm uppercase tracking-wide">
                            Waiting for battle events...
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Dead Adventurers Collection Section - Hide during battle */}
                {!battleInProgress && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="mb-16"
                  >
                  <h2 className="text-center text-xl font-bold text-emerald-400 mb-6 tracking-wider uppercase">
                    Fallen Heroes
                  </h2>
                  <div className="border border-emerald-500/30 bg-emerald-950/20 p-8">
                    {isLoadingAdventurers ? (
                      <div className="text-center">
                        <p className="text-emerald-200/60 text-sm tracking-wide uppercase">
                          Summoning fallen heroes...
                        </p>
                      </div>
                    ) : error ? (
                      <div className="text-center">
                        <p className="text-orange-200/60 text-sm tracking-wide uppercase">
                          Error summoning heroes
                        </p>
                      </div>
                    ) : adventurers.length > 0 ? (
                      <>
                        <div className="mb-6 flex flex-wrap justify-center gap-4">
                          {[
                            { key: "level" as keyof Adventurer, label: "Level" },
                            { key: "strength" as keyof Adventurer, label: "Strength" },
                            { key: "dexterity" as keyof Adventurer, label: "Dexterity" },
                            { key: "vitality" as keyof Adventurer, label: "Vitality" },
                            { key: "intelligence" as keyof Adventurer, label: "Intelligence" },
                          ].map(({ key, label }) => (
                            <button
                              key={key}
                              onClick={() => {
                                if (sortBy === key) {
                                  setSortDirection(
                                    sortDirection === "asc" ? "desc" : "asc",
                                  );
                                } else {
                                  setSortBy(key);
                                  setSortDirection("asc");
                                }
                              }}
                              className={`px-4 py-2 text-sm font-bold tracking-wider uppercase transition-all cursor-pointer flex items-center gap-2 ${
                                sortBy === key
                                  ? "text-emerald-400 border-emerald-500/50"
                                  : "text-emerald-200/60 border-emerald-500/20 hover:text-emerald-300"
                              } border rounded`}
                              style={{
                                background:
                                  sortBy === key
                                    ? "linear-gradient(to bottom, rgba(16, 185, 129, 0.1), rgba(0, 0, 0, 0.3))"
                                    : "linear-gradient(to bottom, rgba(16, 185, 129, 0.05), rgba(0, 0, 0, 0.2))",
                              }}
                            >
                              <span>{label}</span>
                              {sortBy === key && (
                                <span className="text-emerald-400">
                                  {sortDirection === "asc" ? "↑" : "↓"}
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                        <div className="grid grid-cols-[repeat(auto-fill,minmax(128px,1fr))] gap-4 justify-items-center">
                          {sortedAdventurers.map((adventurer) => (
                            <motion.div
                              key={`adventurer-${adventurer.id}-${adventurer.adventurer_id}`}
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className="cursor-move text-center"
                            >
                              {adventurer.image && (
                                <img
                                  src={adventurer.image}
                                  alt={`${adventurer.name} - Level: ${adventurer.level}`}
                                  className="w-24 h-24 mx-auto mb-1 cursor-pointer"
                                  draggable
                                  onDragStart={(e: React.DragEvent) => {
                                    e.dataTransfer.setData(
                                      "adventurerId",
                                      adventurer.id.toString(),
                                    );
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setInspectedAdventurer(adventurer);
                                  }}
                                />
                              )}
                              <div className="text-emerald-300 text-xs">Lvl {adventurer.level}</div>
                            </motion.div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className="text-center">
                        <p className="text-emerald-200/60 text-sm tracking-wide uppercase">
                          No fallen heroes found
                        </p>
                      </div>
                    )}
                  </div>
                  </motion.div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Adventurer Inspection Modal */}
      {inspectedAdventurer && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setInspectedAdventurer(null)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-2xl w-full bg-emerald-950/90 border border-emerald-500/30 rounded-lg p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center">
              {/* Very Large Image - 80% of modal */}
              {inspectedAdventurer.image && (
                <img
                  src={inspectedAdventurer.image}
                  alt={inspectedAdventurer.name}
                  className="w-full max-w-lg h-auto mx-auto mb-4"
                />
              )}
              
              {/* Name */}
              <h3 className="text-xl font-bold text-emerald-400 mb-3">
                {inspectedAdventurer.name}
              </h3>
              
              {/* Compact Stats Grid */}
              <div className="grid grid-cols-5 gap-2 max-w-lg mx-auto text-xs">
                <div className="bg-emerald-950/50 border border-emerald-500/20 rounded p-2">
                  <div className="text-emerald-200/60 uppercase tracking-wider text-[10px]">LVL</div>
                  <div className="text-emerald-300 font-bold">{inspectedAdventurer.level}</div>
                </div>
                <div className="bg-emerald-950/50 border border-emerald-500/20 rounded p-2">
                  <div className="text-emerald-200/60 uppercase tracking-wider text-[10px]">HP</div>
                  <div className="text-emerald-300 font-bold">{inspectedAdventurer.health}</div>
                </div>
                <div className="bg-emerald-950/50 border border-emerald-500/20 rounded p-2">
                  <div className="text-emerald-200/60 uppercase tracking-wider text-[10px]">STR</div>
                  <div className="text-emerald-300 font-bold">{inspectedAdventurer.strength}</div>
                </div>
                <div className="bg-emerald-950/50 border border-emerald-500/20 rounded p-2">
                  <div className="text-emerald-200/60 uppercase tracking-wider text-[10px]">DEX</div>
                  <div className="text-emerald-300 font-bold">{inspectedAdventurer.dexterity}</div>
                </div>
                <div className="bg-emerald-950/50 border border-emerald-500/20 rounded p-2">
                  <div className="text-emerald-200/60 uppercase tracking-wider text-[10px]">VIT</div>
                  <div className="text-emerald-300 font-bold">{inspectedAdventurer.vitality}</div>
                </div>
                <div className="bg-emerald-950/50 border border-emerald-500/20 rounded p-2">
                  <div className="text-emerald-200/60 uppercase tracking-wider text-[10px]">INT</div>
                  <div className="text-emerald-300 font-bold">{inspectedAdventurer.intelligence}</div>
                </div>
                <div className="bg-emerald-950/50 border border-emerald-500/20 rounded p-2">
                  <div className="text-emerald-200/60 uppercase tracking-wider text-[10px]">WIS</div>
                  <div className="text-emerald-300 font-bold">{inspectedAdventurer.wisdom}</div>
                </div>
                <div className="bg-emerald-950/50 border border-emerald-500/20 rounded p-2">
                  <div className="text-emerald-200/60 uppercase tracking-wider text-[10px]">CHA</div>
                  <div className="text-emerald-300 font-bold">{inspectedAdventurer.charisma}</div>
                </div>
                <div className="bg-emerald-950/50 border border-emerald-500/20 rounded p-2">
                  <div className="text-emerald-200/60 uppercase tracking-wider text-[10px]">LUCK</div>
                  <div className="text-emerald-300 font-bold">{inspectedAdventurer.luck}</div>
                </div>
                <div className="bg-emerald-950/50 border border-emerald-500/20 rounded p-2">
                  <div className="text-emerald-200/60 uppercase tracking-wider text-[10px]">XP</div>
                  <div className="text-emerald-300 font-bold">{inspectedAdventurer.xp}</div>
                </div>
              </div>
            </div>
            
            <div className="mt-4 text-center">
              <button
                onClick={() => setInspectedAdventurer(null)}
                className="text-emerald-400 text-xs uppercase tracking-wider hover:text-emerald-300 transition-colors"
              >
                Close (ESC)
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Enemy Beast Inspection Modal */}
      {inspectedEnemyBeast && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setInspectedEnemyBeast(null)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-xs w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={inspectedEnemyBeast}
              alt="Enemy Beast"
              className="w-full h-auto object-contain"
            />
            <div className="mt-4 text-center">
              <button
                onClick={() => setInspectedEnemyBeast(null)}
                className="text-emerald-400 text-xs uppercase tracking-wider hover:text-emerald-300 transition-colors"
              >
                Close (ESC)
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
