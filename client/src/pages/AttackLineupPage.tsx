// src/pages/AttackLineupPage.tsx
import { motion } from "framer-motion";
import { Swords, Trophy, Skull } from "lucide-react";
import { useState, useEffect, useMemo, useRef } from "react";
import { useConnect, useAccount } from "@starknet-react/core";
import { useDojoSDK, useEntityQuery, useModels } from "@dojoengine/sdk/react";
import { ToriiQueryBuilder } from "@dojoengine/sdk";
import { Navbar } from "../components/navbar";
import { WorldAdventurerLineups } from "../components/WorldAdventurerLineups";
import { useAdventurers, useAdventurerLineupImages } from "../hooks/useAdventurers";
import type { Adventurer } from "../hooks/useAdventurers";
import {
  ModelsMapping,
  type AttackLineup,
} from "../bindings/typescript/models.gen";
import { addAddressPadding } from "starknet";

export function AttackLineupPage() {
  const [inspectedAdventurer, setInspectedAdventurer] = useState<Adventurer | null>(null);
  const [attackLineup, setAttackLineup] = useState<(Adventurer | null)[]>(
    Array(5).fill(null),
  );
  const [isDraggingOver, setIsDraggingOver] = useState<number>(-1);
  const [sortBy, setSortBy] = useState<keyof Adventurer | "">("");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [swappedPosition, setSwappedPosition] = useState<number | null>(null);

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

  const createLineup = async () => {
    if (!client || !account) return;
    // TODO: Implement adventurer lineup registration when contract supports it
    console.log("Creating adventurer lineup:", attackLineup);
  };

  const swapAdventurer = async () => {
    if (!client || !account || swappedPosition === null) return;
    const newAdventurer = attackLineup[swappedPosition];
    if (!newAdventurer) return;

    // TODO: Implement adventurer swap when contract supports it
    console.log("Swapping adventurer at position:", swappedPosition);
    setSwappedPosition(null);
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

  const worldLineups = useMemo((): AttackLineupWithId[] => {
    if (!Array.isArray(allLineups)) return [];

    return allLineups
      .map((lineupObj: LineupObj) => {
        // Get the first (and only) key from the object
        const entityId = Object.keys(lineupObj)[0];
        const lineup = lineupObj[entityId];

        if (!lineup) return null;

        return {
          entityId,
          player: lineup.player,
          adventurer1_id: lineup.adventurer1_id,
          adventurer2_id: lineup.adventurer2_id,
          adventurer3_id: lineup.adventurer3_id,
          adventurer4_id: lineup.adventurer4_id,
          adventurer5_id: lineup.adventurer5_id,
        };
      })
      .filter((lineup): lineup is AttackLineupWithId => lineup !== null);
  }, [allLineups]);

  // Extract all unique adventurer IDs from world lineups for fetching images
  const allLineupAdventurerIds = useMemo(() => {
    const adventurerIds: (string | number | bigint)[] = [];
    worldLineups.forEach((lineup) => {
      [
        lineup.adventurer1_id,
        lineup.adventurer2_id,
        lineup.adventurer3_id,
        lineup.adventurer4_id,
        lineup.adventurer5_id,
      ].forEach((id) => {
        if (id && Number(id) > 0) {
          adventurerIds.push(id);
        }
      });
    });
    console.log("[AttackLineupPage] Extracted adventurer IDs for world lineups:", adventurerIds);
    return adventurerIds;
  }, [worldLineups]);

  // Fetch images for all lineup adventurers
  const { data: lineupImages = {} } = useAdventurerLineupImages(allLineupAdventurerIds, {
    enabled: allLineupAdventurerIds.length > 0,
  });

  console.log("[AttackLineupPage] Lineup images received:", lineupImages);

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
      setSwappedPosition(null); // Reset swap state when loading lineup
      lastProcessedLineupRef.current = combinedKey;
    } else if (!hasLineup) {
      // Only clear if we haven't already cleared it
      if (lastProcessedLineupRef.current !== "empty") {
        setAttackLineup(Array(5).fill(null));
        setSwappedPosition(null); // Reset swap state
        lastProcessedLineupRef.current = "empty";
      }
    }
  }, [hasLineup, userLineup, adventurersIdsString, adventurers]);

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
            <div className="border border-red-500/30 bg-red-950/20 p-12">
              <Swords className="w-16 h-16 text-red-500/50 mx-auto mb-6" />
              <h2 className="text-2xl font-bold text-red-400 mb-4 tracking-wider uppercase">
                Connector Not Found
              </h2>
              <p className="text-red-200/60 mb-4 text-sm tracking-wide">
                The Cartridge Controller connector is not available.
              </p>
              <p className="text-red-200/40 text-xs">
                Please ensure the Cartridge wallet is installed and properly
                configured.
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  // Mock stats (only shown when wallet is connected)
  const stats = {
    kills: 0,
    defeats: 0,
  };

  useEffect(() => {
    if (!inspectedAdventurer) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setInspectedAdventurer(null);
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [inspectedAdventurer]);

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
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-red-600/10 rounded-full blur-[150px]"
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
            className="text-5xl md:text-6xl font-bold mb-2 text-red-500"
            style={{
              textShadow: "0 0 30px rgba(239, 68, 68, 0.3)",
              fontFamily: "serif",
            }}
          >
            ATTACK FORCE
          </h1>
          <p className="text-red-200/40 text-sm tracking-widest uppercase">
            Fallen heroes rise again
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
            <div className="border border-red-500/30 bg-red-950/20 p-12 mb-8">
              <Swords className="w-16 h-16 text-red-500/50 mx-auto mb-6" />
              <p className="text-red-200/60 mb-8 text-sm tracking-wide uppercase">
                Connect your wallet to assemble your force
              </p>
              <motion.button
                onClick={() => connect({ connector: connectors[0] })}
                disabled={status === "connecting"}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="px-10 py-4 text-lg font-bold tracking-wider uppercase border-2 border-red-500/50 hover:border-red-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                style={{
                  background:
                    "linear-gradient(to bottom, rgba(239, 68, 68, 0.1), rgba(0, 0, 0, 0.4))",
                  textShadow: "0 0 10px rgba(239, 68, 68, 0.5)",
                }}
              >
                <span className="text-red-500">
                  {status === "connecting" ? "CONNECTING..." : "CONNECT WALLET"}
                </span>
              </motion.button>
            </div>
          </motion.div>
        ) : (
          <>
            {/* Create Attack Lineup Section */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mb-16"
            >
              <div className="border border-red-500/30 bg-red-950/20 p-8 relative">
                {!hasLineup && (
                  <div className="absolute top-4 right-4 flex gap-2">
                    {adventurers.length > 0 && (
                      <motion.button
                        onClick={handleRandomFill}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className="px-4 py-2 text-xs font-bold tracking-wider uppercase border border-red-500/50 hover:border-red-500 transition-all cursor-pointer text-red-400"
                        style={{
                          background:
                            "linear-gradient(to bottom, rgba(239, 68, 68, 0.1), rgba(0, 0, 0, 0.4))",
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
                  <Swords className="w-12 h-12 text-red-500/50 mx-auto mb-4" />
                  <h2 className="text-2xl font-bold text-red-400 mb-4 tracking-wider uppercase">
                    {hasLineup ? "Your Attack Force" : "Assemble Your Force"}
                  </h2>
                  <div className="grid grid-cols-5 gap-4 p-4">
                    {attackLineup.map((adventurer, index) => (
                      <div
                        key={index}
                        className={`min-h-[150px] border-2 border-dashed rounded-lg flex items-center justify-center transition-colors ${
                          isDraggingOver === index
                            ? "border-red-500 bg-red-950/30"
                            : "border-red-500/30"
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
                            const originalAdventurer = newAttackLineup[index];
                            newAttackLineup[index] = adventurerToAdd;
                            setAttackLineup(newAttackLineup);

                            // If lineup is registered and we're swapping an adventurer, track it
                            if (hasLineup && originalAdventurer) {
                              setSwappedPosition(index);
                            }
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
                            <div className="text-red-300 text-xs">Lvl {adventurer.level}</div>
                          </motion.div>
                        ) : (
                          <div className="text-red-200/20 text-xs text-center">
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
                          ? "rgba(239, 68, 68, 0.5)"
                          : "rgba(239, 68, 68, 0.3)",
                        background: attackLineup.every((a) => a !== null)
                          ? "linear-gradient(to bottom, rgba(239, 68, 68, 0.1), rgba(0, 0, 0, 0.4))"
                          : "linear-gradient(to bottom, rgba(239, 68, 68, 0.05), rgba(0, 0, 0, 0.3))",
                        textShadow: attackLineup.every((a) => a !== null)
                          ? "0 0 10px rgba(239, 68, 68, 0.5)"
                          : "none",
                      }}
                    >
                      <span
                        className={
                          attackLineup.every((a) => a !== null)
                            ? "text-red-500"
                            : "text-red-400/50"
                        }
                      >
                        {attackLineup.every((a) => a !== null)
                          ? "Deploy Force"
                          : "Force Incomplete"}
                      </span>
                    </motion.button>
                  ) : swappedPosition !== null ? (
                    <motion.button
                      onClick={swapAdventurer}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="mt-6 px-8 py-3 text-base font-bold tracking-wider uppercase border-2 transition-all cursor-pointer"
                      style={{
                        borderColor: "rgba(239, 68, 68, 0.5)",
                        background:
                          "linear-gradient(to bottom, rgba(239, 68, 68, 0.1), rgba(0, 0, 0, 0.4))",
                        textShadow: "0 0 10px rgba(239, 68, 68, 0.5)",
                      }}
                    >
                      <span className="text-red-500">
                        Replace Hero (Position {swappedPosition + 1})
                      </span>
                    </motion.button>
                  ) : null}
                </div>
              </div>
            </motion.div>

            {/* Dead Adventurers Collection Section */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="mb-16"
            >
              <h2 className="text-center text-xl font-bold text-red-400 mb-6 tracking-wider uppercase">
                Fallen Heroes
              </h2>
              <div className="border border-red-500/30 bg-red-950/20 p-8">
                {isLoadingAdventurers ? (
                  <div className="text-center">
                    <p className="text-red-200/60 text-sm tracking-wide uppercase">
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
                        { key: "health" as keyof Adventurer, label: "Health" },
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
                              ? "text-red-400 border-red-500/50"
                              : "text-red-200/60 border-red-500/20 hover:text-red-300"
                          } border rounded`}
                          style={{
                            background:
                              sortBy === key
                                ? "linear-gradient(to bottom, rgba(239, 68, 68, 0.1), rgba(0, 0, 0, 0.3))"
                                : "linear-gradient(to bottom, rgba(239, 68, 68, 0.05), rgba(0, 0, 0, 0.2))",
                          }}
                        >
                          <span>{label}</span>
                          {sortBy === key && (
                            <span className="text-red-400">
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
                          <div className="text-red-300 text-xs">Lvl {adventurer.level}</div>
                          <div className="text-red-200/50 text-xs">HP {adventurer.health}</div>
                        </motion.div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="text-center">
                    <p className="text-red-200/60 text-sm tracking-wide uppercase">
                      No fallen heroes found
                    </p>
                  </div>
                )}
              </div>
            </motion.div>

            {/* World's Adventurer Lineups Section */}
            <WorldAdventurerLineups
              lineups={worldLineups}
              adventurerImages={lineupImages}
            />

            {/* Stats Section */}
            {hasLineup && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                <h2 className="text-center text-xl font-bold text-red-400 mb-6 tracking-wider uppercase">
                  Battle Records
                </h2>
                <div className="grid grid-cols-3 gap-4">
                  {/* Kills */}
                  <div className="border border-red-500/20 bg-red-950/10 p-6 text-center">
                    <Trophy className="w-8 h-8 text-red-500/50 mx-auto mb-3" />
                    <div className="text-3xl font-bold text-red-400 mb-1">
                      {stats.kills}
                    </div>
                    <div className="text-xs text-red-200/40 tracking-wider uppercase">
                      Kills
                    </div>
                  </div>

                  {/* Defeats */}
                  <div className="border border-red-500/20 bg-red-950/10 p-6 text-center">
                    <Skull className="w-8 h-8 text-red-500/50 mx-auto mb-3" />
                    <div className="text-3xl font-bold text-red-400 mb-1">
                      {stats.defeats}
                    </div>
                    <div className="text-xs text-red-200/40 tracking-wider uppercase">
                      Defeats
                    </div>
                  </div>

                  {/* Force Status */}
                  <div className="border border-red-500/20 bg-red-950/10 p-6 text-center">
                    <Swords className="w-8 h-8 text-red-500/50 mx-auto mb-3" />
                    <div className="text-lg font-bold text-red-400 mb-1">
                      {hasLineup ? "Force Deployed" : "No Force"}
                    </div>
                    <div className="text-xs text-red-200/40 tracking-wider uppercase">
                      Status
                    </div>
                  </div>
                </div>
              </motion.div>
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
            className="max-w-md w-full bg-red-950/90 border border-red-500/30 rounded-lg p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-6">
              {inspectedAdventurer.image && (
                <img
                  src={inspectedAdventurer.image}
                  alt={inspectedAdventurer.name}
                  className="w-32 h-32"
                />
              )}
              <div className="flex-1">
                <h3 className="text-xl font-bold text-red-400 mb-2">
                  {inspectedAdventurer.name}
                </h3>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-red-200/60">Level:</span>
                    <span className="text-red-300">{inspectedAdventurer.level}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-red-200/60">Health:</span>
                    <span className="text-red-300">{inspectedAdventurer.health}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-red-200/60">Strength:</span>
                    <span className="text-red-300">{inspectedAdventurer.strength}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-red-200/60">Dexterity:</span>
                    <span className="text-red-300">{inspectedAdventurer.dexterity}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-red-200/60">Vitality:</span>
                    <span className="text-red-300">{inspectedAdventurer.vitality}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-red-200/60">Intelligence:</span>
                    <span className="text-red-300">{inspectedAdventurer.intelligence}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-red-200/60">Wisdom:</span>
                    <span className="text-red-300">{inspectedAdventurer.wisdom}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-red-200/60">Charisma:</span>
                    <span className="text-red-300">{inspectedAdventurer.charisma}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-red-200/60">Luck:</span>
                    <span className="text-red-300">{inspectedAdventurer.luck}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-4 text-center">
              <button
                onClick={() => setInspectedAdventurer(null)}
                className="text-red-400 text-sm uppercase tracking-wider hover:text-red-300"
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