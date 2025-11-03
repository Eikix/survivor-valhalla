// src/pages/LineupPage.tsx
import { motion } from "framer-motion";
import { Shield } from "lucide-react";
import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useConnect, useAccount } from "@starknet-react/core";
import { useDojoSDK, useEntityQuery, useModels } from "@dojoengine/sdk/react";
import { ToriiQueryBuilder } from "@dojoengine/sdk";
import { Navbar } from "../components/navbar";
import { WorldBeastLineups } from "../components/WorldBeastLineups";
import { useBeasts, useBeastLineupImages } from "../hooks/useBeasts";
import type { Beast } from "../hooks/useBeasts";
import {
  ModelsMapping,
  type BeastLineup,
} from "../bindings/typescript/models.gen";
import { addAddressPadding } from "starknet";
import { useTransactionToast } from "../hooks/useTransactionToast";

export function LineupPage() {
  const [inspectedBeast, setInspectedBeast] = useState<Beast | null>(null);
  const [baseBeasts, setBaseBeasts] = useState<(Beast | null)[]>(
    Array(5).fill(null),
  );
  const [isDraggingOver, setIsDraggingOver] = useState<number>(-1);
  const [sortBy, setSortBy] = useState<keyof Beast | "">("power");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [swappedPosition, setSwappedPosition] = useState<number | null>(null);
  const [selectedBeastForMobile, setSelectedBeastForMobile] =
    useState<Beast | null>(null);
  const [selectedLineupIndex, setSelectedLineupIndex] = useState<number | null>(
    null,
  );
  const [longPressTimer, setLongPressTimer] = useState<ReturnType<
    typeof setTimeout
  > | null>(null);
  const [touchStartPos, setTouchStartPos] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [isTouchInteraction, setIsTouchInteraction] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const navigate = useNavigate();
  const { connect, connectors } = useConnect();
  const { status, address, account } = useAccount();
  const {
    data: beasts = [],
    isLoading: isLoadingBeasts,
    error,
  } = useBeasts(address, {
    enabled: status === "connected",
  });

  const { client } = useDojoSDK();
  const { showTransaction } = useTransactionToast();

  const createLineup = async () => {
    if (!client || !account) return;

    const tx = showTransaction(undefined, "Creating beast lineup...");

    try {
      await client.beast_actions.register(
        account,
        baseBeasts[0]?.token_id || 0,
        baseBeasts[1]?.token_id || 0,
        baseBeasts[2]?.token_id || 0,
        baseBeasts[3]?.token_id || 0,
        baseBeasts[4]?.token_id || 0,
      );
      tx.success("Beast lineup created successfully!");
      setShowSuccessModal(true);
    } catch (error) {
      console.error("Failed to create lineup:", error);
      tx.error("Failed to create beast lineup");
    }
  };

  const swapBeast = async () => {
    if (!client || !account || swappedPosition === null) return;
    const newBeast = baseBeasts[swappedPosition];
    if (!newBeast) return;

    const tx = showTransaction(
      undefined,
      `Swapping beast at position ${swappedPosition + 1}...`,
    );

    try {
      await client.beast_actions.swap(
        account,
        swappedPosition,
        newBeast.token_id,
      );
      setSwappedPosition(null);
      tx.success("Beast swapped successfully!");
    } catch (error) {
      console.error("Failed to swap beast:", error);
      tx.error("Failed to swap beast");
    }
  };

  const handleRandomFill = () => {
    if (beasts.length === 0) return;

    // Shuffle beasts array and take first 5
    const shuffled = [...beasts].sort(() => Math.random() - 0.5);
    const randomBeasts = shuffled.slice(0, 5);

    // Fill remaining slots with null if we have fewer than 5 beasts
    const filledSlots = [
      ...randomBeasts,
      ...Array(5 - randomBeasts.length).fill(null),
    ].slice(0, 5);

    setBaseBeasts(filledSlots);
  };

  // Query on-chain base
  // Query all BeastLineup entities using VariableLen pattern matching with empty key
  // See: https://dojoengine.org/toolchain/torii/grpc#quick-start
  useEntityQuery(
    new ToriiQueryBuilder()
      .includeHashedKeys()
      .withEntityModels([ModelsMapping.BeastLineup]),
  );
  const allLineups = useModels(ModelsMapping.BeastLineup);

  // Type for lineup objects returned by useModels
  type LineupObj = Record<string, BeastLineup>;
  type BeastLineupWithId = BeastLineup & { entityId: string };

  const userLineup = useMemo((): BeastLineupWithId | null => {
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

  const worldLineups = useMemo((): BeastLineupWithId[] => {
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
          beast1_id: lineup.beast1_id,
          beast2_id: lineup.beast2_id,
          beast3_id: lineup.beast3_id,
          beast4_id: lineup.beast4_id,
          beast5_id: lineup.beast5_id,
        };
      })
      .filter((lineup): lineup is BeastLineupWithId => lineup !== null);
  }, [allLineups]);

  // Extract all unique token IDs from world lineups for fetching images
  const allLineupTokenIds = useMemo(() => {
    const tokenIds: (string | number | bigint)[] = [];
    worldLineups.forEach((lineup) => {
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
    console.log(
      "[LineupPage] Extracted token IDs for world lineups:",
      tokenIds,
    );
    return tokenIds;
  }, [worldLineups]);

  // Fetch images for all lineup beasts
  const { data: lineupImages = {} } = useBeastLineupImages(allLineupTokenIds, {
    enabled: allLineupTokenIds.length > 0,
  });

  console.log("[LineupPage] Lineup images received:", lineupImages);

  const hasBase = !!userLineup;
  const lastProcessedLineupRef = useRef<string>("");
  const beastsIdsString = useMemo(
    () =>
      beasts
        .map((b) => b.id)
        .sort()
        .join(","),
    [beasts],
  );

  // Load base beasts from on-chain data when lineup exists
  useEffect(() => {
    if (hasBase && userLineup && beasts.length > 0) {
      const lineupBeastIds = [
        userLineup.beast1_id,
        userLineup.beast2_id,
        userLineup.beast3_id,
        userLineup.beast4_id,
        userLineup.beast5_id,
      ];

      // Create a stable key for this lineup + beasts combination
      const lineupKey = lineupBeastIds.map((id) => String(id || 0)).join(",");
      const combinedKey = `${lineupKey}:${beastsIdsString}`;

      // Skip if we've already processed this exact lineup with the same beasts
      if (lastProcessedLineupRef.current === combinedKey) {
        return;
      }

      const loadedBeasts = lineupBeastIds.map((beastId) => {
        if (beastId && Number(beastId) > 0) {
          return beasts.find((b) => b.token_id === Number(beastId)) || null;
        }
        return null;
      });

      setBaseBeasts(loadedBeasts);
      setSwappedPosition(null); // Reset swap state when loading lineup
      lastProcessedLineupRef.current = combinedKey;
    } else if (!hasBase) {
      // Only clear if we haven't already cleared it
      if (lastProcessedLineupRef.current !== "empty") {
        setBaseBeasts(Array(5).fill(null));
        setSwappedPosition(null); // Reset swap state
        lastProcessedLineupRef.current = "empty";
      }
    }
  }, [hasBase, userLineup, beastsIdsString, beasts]);

  // Sort beasts based on sortBy and sortDirection
  const sortedBeasts = useMemo(() => {
    // Remove duplicates first (by id)
    const uniqueBeasts = Array.from(
      new Map(beasts.map((beast) => [beast.id, beast])).values(),
    );

    if (!sortBy) {
      return uniqueBeasts;
    }

    const sorted = [...uniqueBeasts];
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
  }, [beasts, sortBy, sortDirection]);

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
              <Shield className="w-16 h-16 text-red-500/50 mx-auto mb-6" />
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

  useEffect(() => {
    if (!inspectedBeast) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setInspectedBeast(null);
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [inspectedBeast]);

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
            VALHALLA
          </h1>
          <p className="text-emerald-200/40 text-sm tracking-widest uppercase">
            Prepare for battle
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
              <Shield className="w-16 h-16 text-emerald-500/50 mx-auto mb-6" />
              <p className="text-emerald-200/60 mb-8 text-sm tracking-wide uppercase">
                Connect your wallet to enter
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
            {/* Create Lineup Section */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mb-16"
            >
              <div className="border border-emerald-500/30 bg-emerald-950/20 p-8 relative">
                {!hasBase && (
                  <div className="absolute top-4 right-4 flex gap-2">
                    {beasts.length > 0 && (
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
                    {baseBeasts.some((b) => b !== null) && (
                      <motion.button
                        onClick={() => setBaseBeasts(Array(5).fill(null))}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className="px-4 py-2 text-xs font-bold tracking-wider uppercase border border-red-500/50 hover:border-red-500 transition-all cursor-pointer text-red-400"
                        style={{
                          background:
                            "linear-gradient(to bottom, rgba(239, 68, 68, 0.1), rgba(0, 0, 0, 0.4))",
                        }}
                      >
                        Clear Lineup
                      </motion.button>
                    )}
                  </div>
                )}
                <div className="text-center">
                  <Shield className="w-12 h-12 text-emerald-500/50 mx-auto mb-4" />
                  <h2 className="text-2xl font-bold text-emerald-400 mb-4 tracking-wider uppercase">
                    {hasBase ? "Your Lineup" : "Create Your Lineup"}
                  </h2>
                  <div className="overflow-x-auto pb-4 -mx-4 px-4">
                    <div className="flex gap-4 min-w-max md:grid md:grid-cols-5 md:min-w-0 md:gap-4 md:p-4">
                      {baseBeasts.map((beast, index) => (
                        <div
                          key={index}
                          className={`min-w-[140px] md:min-w-0 min-h-[180px] md:min-h-[150px] border-2 border-dashed rounded-lg flex items-center justify-center transition-all duration-200 flex-shrink-0 cursor-pointer relative ${
                            selectedLineupIndex === index
                              ? "border-blue-500 bg-blue-950/30 border-solid"
                              : isDraggingOver === index
                                ? "border-emerald-500 bg-emerald-950/30 scale-105"
                                : selectedBeastForMobile && !beast
                                  ? "border-emerald-400/70 bg-emerald-950/10 animate-pulse shadow-[0_0_15px_rgba(16,185,129,0.2)]"
                                  : "border-emerald-500/30 hover:border-emerald-500/50 hover:scale-[1.02]"
                          }`}
                          onClick={() => {
                            // Handle swapping from lineup
                            if (selectedLineupIndex !== null) {
                              if (selectedLineupIndex !== index) {
                                // Swap the beasts
                                const newBaseBeasts = [...baseBeasts];
                                const temp = newBaseBeasts[index];
                                newBaseBeasts[index] =
                                  newBaseBeasts[selectedLineupIndex];
                                newBaseBeasts[selectedLineupIndex] = temp;
                                setBaseBeasts(newBaseBeasts);

                                // Track swap for on-chain update if needed
                                if (hasBase) {
                                  setSwappedPosition(index);
                                }
                              }
                              setSelectedLineupIndex(null);
                              return;
                            }

                            // Mobile tap: add selected beast from collection to this slot
                            if (selectedBeastForMobile) {
                              const isAlreadyInBase = baseBeasts.some(
                                (b) => b?.id === selectedBeastForMobile.id,
                              );
                              if (!isAlreadyInBase) {
                                const newBaseBeasts = [...baseBeasts];
                                const originalBeast = newBaseBeasts[index];
                                newBaseBeasts[index] = selectedBeastForMobile;
                                setBaseBeasts(newBaseBeasts);

                                if (hasBase && originalBeast) {
                                  setSwappedPosition(index);
                                }
                              }
                              setSelectedBeastForMobile(null);
                            }
                          }}
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
                            const beastId = parseInt(
                              e.dataTransfer.getData("beastId"),
                            );
                            const beastToAdd = beasts.find(
                              (b) => b.id === beastId,
                            );
                            // Check if beast is already in lineup
                            const isAlreadyInBase = baseBeasts.some(
                              (b) => b?.id === beastId,
                            );
                            if (beastToAdd && !isAlreadyInBase) {
                              const newBaseBeasts = [...baseBeasts];
                              const originalBeast = newBaseBeasts[index];
                              newBaseBeasts[index] = beastToAdd;
                              setBaseBeasts(newBaseBeasts);

                              // If lineup is registered and we're swapping a beast, track it
                              if (hasBase && originalBeast) {
                                setSwappedPosition(index);
                              }
                            }
                          }}
                        >
                          {beast ? (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className={`cursor-pointer w-full h-full flex items-center justify-center p-2 transition-all ${
                                selectedLineupIndex === index
                                  ? "ring-4 ring-blue-500 scale-110"
                                  : ""
                              }`}
                              onClick={(e) => {
                                // Only stop propagation if we're not trying to place/swap a beast
                                if (
                                  !selectedBeastForMobile &&
                                  (selectedLineupIndex === null ||
                                    selectedLineupIndex === index)
                                ) {
                                  e.stopPropagation();
                                }
                              }}
                            >
                              {beast.image && (
                                <img
                                  src={beast.image}
                                  alt={`${beast.name} - Level: ${beast.level}, Health: ${beast.health}, Power: ${beast.power}, Tier: ${beast.tier}, Type: ${beast.type}, Prefix: ${beast.prefix}, Suffix: ${beast.suffix}, Shiny: ${beast.shiny}, Animated: ${beast.animated}`}
                                  className="w-full h-auto max-w-[120px] md:max-w-[128px] object-contain"
                                  onClick={(e) => {
                                    // Skip if this was a touch interaction
                                    if (isTouchInteraction) {
                                      setIsTouchInteraction(false);
                                      // If collection beast or lineup beast selected, let it bubble to slot
                                      if (
                                        !selectedBeastForMobile &&
                                        selectedLineupIndex === null
                                      ) {
                                        e.stopPropagation();
                                      }
                                      return;
                                    }
                                    // If a collection beast is selected, don't stop propagation
                                    // Let the slot onClick handle placing the collection beast
                                    if (selectedBeastForMobile) {
                                      // Don't stop propagation - let it bubble to slot handler
                                      return;
                                    }
                                    // If a different lineup beast is already selected, let it bubble to slot handler for swap
                                    if (
                                      selectedLineupIndex !== null &&
                                      selectedLineupIndex !== index
                                    ) {
                                      // Don't stop propagation - let it bubble to slot handler
                                      return;
                                    }
                                    e.stopPropagation();
                                    // Toggle selection of lineup beast
                                    if (selectedLineupIndex === index) {
                                      setSelectedLineupIndex(null);
                                    } else {
                                      setSelectedLineupIndex(index);
                                      setSelectedBeastForMobile(null); // Clear collection selection
                                    }
                                  }}
                                  onDoubleClick={(e) => {
                                    e.stopPropagation();
                                    setInspectedBeast(beast);
                                  }}
                                  onTouchStart={(e) => {
                                    const touch = e.touches[0];
                                    setTouchStartPos({
                                      x: touch.clientX,
                                      y: touch.clientY,
                                    });
                                    const timer = setTimeout(() => {
                                      setInspectedBeast(beast);
                                      setLongPressTimer(null);
                                      setTouchStartPos(null);
                                    }, 500);
                                    setLongPressTimer(timer);
                                  }}
                                  onTouchEnd={(e) => {
                                    setIsTouchInteraction(true);
                                    if (longPressTimer) {
                                      clearTimeout(longPressTimer);
                                      setLongPressTimer(null);
                                      setTouchStartPos(null);
                                      // If a collection beast is selected, don't prevent default
                                      // Let the click event fire to trigger slot onClick
                                      if (selectedBeastForMobile) {
                                        return;
                                      }
                                      // If a different lineup beast is selected, don't prevent default
                                      // Let the click event fire to trigger slot onClick for swap
                                      if (
                                        selectedLineupIndex !== null &&
                                        selectedLineupIndex !== index
                                      ) {
                                        return;
                                      }
                                      e.preventDefault();
                                      // Toggle selection of lineup beast
                                      if (selectedLineupIndex === index) {
                                        setSelectedLineupIndex(null);
                                      } else {
                                        setSelectedLineupIndex(index);
                                        setSelectedBeastForMobile(null); // Clear collection selection
                                      }
                                    }
                                  }}
                                  onTouchMove={(e) => {
                                    // Only cancel if user moves more than 10px (scrolling)
                                    if (longPressTimer && touchStartPos) {
                                      const touch = e.touches[0];
                                      const dx = Math.abs(
                                        touch.clientX - touchStartPos.x,
                                      );
                                      const dy = Math.abs(
                                        touch.clientY - touchStartPos.y,
                                      );
                                      if (dx > 10 || dy > 10) {
                                        clearTimeout(longPressTimer);
                                        setLongPressTimer(null);
                                        setTouchStartPos(null);
                                      }
                                    }
                                  }}
                                />
                              )}
                            </motion.div>
                          ) : (
                            <div className="text-emerald-200/20 text-xs text-center relative">
                              {selectedBeastForMobile ? (
                                <>
                                  <div className="text-emerald-400/70 text-3xl mb-2">⊕</div>
                                  <div className="text-emerald-400/70 font-medium">Tap to place</div>
                                </>
                              ) : (
                                <>
                                  <div className="text-emerald-500/20 text-2xl mb-2">⬚</div>
                                  <div>Slot {index + 1}</div>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                  {!hasBase ? (
                    <motion.button
                      onClick={createLineup}
                      disabled={!baseBeasts.every((b) => b !== null)}
                      whileHover={
                        baseBeasts.every((b) => b !== null)
                          ? { scale: 1.05 }
                          : {}
                      }
                      whileTap={
                        baseBeasts.every((b) => b !== null)
                          ? { scale: 0.95 }
                          : {}
                      }
                      className="mt-6 px-8 py-3 text-base font-bold tracking-wider uppercase border-2 transition-all cursor-pointer disabled:opacity-50"
                      style={{
                        borderColor: baseBeasts.every((b) => b !== null)
                          ? "rgba(16, 185, 129, 0.5)"
                          : "rgba(16, 185, 129, 0.3)",
                        background: baseBeasts.every((b) => b !== null)
                          ? "linear-gradient(to bottom, rgba(16, 185, 129, 0.1), rgba(0, 0, 0, 0.4))"
                          : "linear-gradient(to bottom, rgba(16, 185, 129, 0.05), rgba(0, 0, 0, 0.3))",
                        textShadow: baseBeasts.every((b) => b !== null)
                          ? "0 0 10px rgba(16, 185, 129, 0.5)"
                          : "none",
                      }}
                    >
                      <span
                        className={
                          baseBeasts.every((b) => b !== null)
                            ? "text-emerald-500"
                            : "text-emerald-400/50"
                        }
                      >
                        {baseBeasts.every((b) => b !== null)
                          ? "Register Lineup"
                          : "Lineup Incomplete"}
                      </span>
                    </motion.button>
                  ) : swappedPosition !== null ? (
                    <motion.button
                      onClick={swapBeast}
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
                        Swap Beast (Position {swappedPosition + 1})
                      </span>
                    </motion.button>
                  ) : null}
                </div>
              </div>
            </motion.div>

            {/* Beasts Collection Section */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="mb-16"
            >
              <h2 className="text-center text-xl font-bold text-emerald-400 mb-6 tracking-wider uppercase">
                Your Beasts
              </h2>
              <div className="border border-emerald-500/30 bg-emerald-950/20 p-8">
                {isLoadingBeasts ? (
                  <div className="text-center">
                    <p className="text-emerald-200/60 text-sm tracking-wide uppercase">
                      Loading beasts...
                    </p>
                  </div>
                ) : error ? (
                  <div className="text-center">
                    <p className="text-red-200/60 text-sm tracking-wide uppercase">
                      Error loading beasts
                    </p>
                  </div>
                ) : beasts.length > 0 ? (
                  <>
                    <div className="mb-6 flex flex-wrap justify-center gap-4">
                      {[
                        { key: "power" as keyof Beast, label: "Power" },
                        { key: "name" as keyof Beast, label: "Name" },
                        { key: "level" as keyof Beast, label: "Level" },
                        { key: "health" as keyof Beast, label: "Health" },
                        { key: "tier" as keyof Beast, label: "Tier" },
                        { key: "type" as keyof Beast, label: "Type" },
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
                              // Default to desc for power, asc for others
                              setSortDirection(
                                key === "power" ? "desc" : "asc",
                              );
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
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(128px,1fr))] gap-4 justify-items-start">
                      {sortedBeasts.map((beast) => (
                        <motion.div
                          key={`beast-${beast.id}-${beast.token_id}`}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="relative group cursor-pointer"
                        >
                          {beast.image && (
                            <>
                              <img
                                src={beast.image}
                                alt={`${beast.name} - Level: ${beast.level}, Health: ${beast.health}, Power: ${beast.power}, Tier: ${beast.tier}, Type: ${beast.type}, Prefix: ${beast.prefix}, Suffix: ${beast.suffix}, Shiny: ${beast.shiny}, Animated: ${beast.animated}`}
                                className={`w-32 h-auto cursor-pointer transition-all ${
                                  selectedBeastForMobile?.id === beast.id
                                    ? "ring-4 ring-emerald-500 scale-110"
                                    : "group-hover:scale-105"
                                }`}
                                draggable
                                onDragStart={(e: React.DragEvent) => {
                                  e.dataTransfer.setData(
                                    "beastId",
                                    beast.id.toString(),
                                  );
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  // Skip if this was a touch interaction
                                  if (isTouchInteraction) {
                                    setIsTouchInteraction(false);
                                    return;
                                  }
                                  // Toggle selection
                                  if (selectedBeastForMobile?.id === beast.id) {
                                    setSelectedBeastForMobile(null);
                                  } else {
                                    setSelectedBeastForMobile(beast);
                                    setSelectedLineupIndex(null); // Clear lineup selection
                                  }
                                }}
                                onDoubleClick={(e) => {
                                  e.stopPropagation();
                                  setInspectedBeast(beast);
                                }}
                                onTouchStart={(e) => {
                                  const touch = e.touches[0];
                                  setTouchStartPos({
                                    x: touch.clientX,
                                    y: touch.clientY,
                                  });
                                  const timer = setTimeout(() => {
                                    // Long press = inspect
                                    setInspectedBeast(beast);
                                    setLongPressTimer(null);
                                    setTouchStartPos(null);
                                  }, 500);
                                  setLongPressTimer(timer);
                                }}
                                onTouchEnd={(e) => {
                                  e.preventDefault();
                                  setIsTouchInteraction(true);
                                  if (longPressTimer) {
                                    // Short tap = select
                                    clearTimeout(longPressTimer);
                                    setLongPressTimer(null);
                                    setTouchStartPos(null);
                                    if (
                                      selectedBeastForMobile?.id === beast.id
                                    ) {
                                      setSelectedBeastForMobile(null);
                                    } else {
                                      setSelectedBeastForMobile(beast);
                                      setSelectedLineupIndex(null); // Clear lineup selection
                                    }
                                  }
                                }}
                                onTouchMove={(e) => {
                                  // Only cancel if user moves more than 10px (scrolling)
                                  if (longPressTimer && touchStartPos) {
                                    const touch = e.touches[0];
                                    const dx = Math.abs(
                                      touch.clientX - touchStartPos.x,
                                    );
                                    const dy = Math.abs(
                                      touch.clientY - touchStartPos.y,
                                    );
                                    if (dx > 10 || dy > 10) {
                                      clearTimeout(longPressTimer);
                                      setLongPressTimer(null);
                                      setTouchStartPos(null);
                                    }
                                  }
                                }}
                              />

                              {/* Hover overlay with + button */}
                              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                                <div className="bg-emerald-500 rounded-full w-10 h-10 flex items-center justify-center shadow-lg">
                                  <span className="text-white text-2xl font-bold leading-none">
                                    +
                                  </span>
                                </div>
                              </div>

                              {/* "Click a slot" instruction when selected */}
                              {selectedBeastForMobile?.id === beast.id && (
                                <motion.div
                                  initial={{ opacity: 0, y: 5 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  className="absolute -top-8 left-1/2 -translate-x-1/2 bg-emerald-500 text-white text-xs px-2 py-1 rounded whitespace-nowrap shadow-lg"
                                >
                                  Click a slot ↑
                                </motion.div>
                              )}
                            </>
                          )}
                        </motion.div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="text-center">
                    <p className="text-emerald-200/60 text-sm tracking-wide uppercase">
                      No beasts found
                    </p>
                  </div>
                )}
              </div>
            </motion.div>

            {/* World's Beast Lineups Section */}
            <WorldBeastLineups
              lineups={worldLineups}
              beastImages={lineupImages}
            />
          </>
        )}
      </div>

      {/* Beast Selection Indicator */}
      {(selectedBeastForMobile || selectedLineupIndex !== null) && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-40 border-2 p-4 rounded-lg shadow-lg max-w-xs w-full mx-4 ${
            selectedLineupIndex !== null
              ? "bg-blue-950 border-blue-500"
              : "bg-emerald-950 border-emerald-500"
          }`}
        >
          <div className="flex items-center gap-3">
            {selectedBeastForMobile?.image && (
              <img
                src={selectedBeastForMobile.image}
                alt={selectedBeastForMobile.name}
                className="w-16 h-16 object-contain"
              />
            )}
            {selectedLineupIndex !== null &&
              baseBeasts[selectedLineupIndex]?.image && (
                <img
                  src={baseBeasts[selectedLineupIndex]!.image}
                  alt={baseBeasts[selectedLineupIndex]!.name}
                  className="w-16 h-16 object-contain"
                />
              )}
            <div className="flex-1">
              <p
                className={`text-sm font-bold mb-1 ${
                  selectedLineupIndex !== null
                    ? "text-blue-400"
                    : "text-emerald-400"
                }`}
              >
                {selectedBeastForMobile?.name ||
                  baseBeasts[selectedLineupIndex!]?.name}
              </p>
              <p
                className={`text-xs ${
                  selectedLineupIndex !== null
                    ? "text-blue-200/60"
                    : "text-emerald-200/60"
                }`}
              >
                {selectedLineupIndex !== null
                  ? "Tap another slot to swap"
                  : "Tap a slot to place"}
              </p>
            </div>
            <button
              onClick={() => {
                setSelectedBeastForMobile(null);
                setSelectedLineupIndex(null);
              }}
              className="px-3 py-2 text-xs font-bold tracking-wider uppercase border border-red-500/50 hover:border-red-500 transition-all text-red-400"
              style={{
                background:
                  "linear-gradient(to bottom, rgba(239, 68, 68, 0.1), rgba(0, 0, 0, 0.4))",
              }}
            >
              Cancel
            </button>
          </div>
        </motion.div>
      )}

      {/* Beast Inspection Modal */}
      {inspectedBeast && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setInspectedBeast(null)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-xs w-full"
            onClick={(e) => e.stopPropagation()}
          >
            {inspectedBeast.image && (
              <img
                src={inspectedBeast.image}
                alt={`${inspectedBeast.name} - Level: ${inspectedBeast.level}, Health: ${inspectedBeast.health}, Power: ${inspectedBeast.power}, Tier: ${inspectedBeast.tier}, Type: ${inspectedBeast.type}, Prefix: ${inspectedBeast.prefix}, Suffix: ${inspectedBeast.suffix}, Shiny: ${inspectedBeast.shiny}, Animated: ${inspectedBeast.animated}`}
                className="w-full h-auto object-contain"
              />
            )}
          </motion.div>
        </div>
      )}

      {/* Success Modal */}
      {showSuccessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-gradient-to-br from-emerald-900 to-emerald-800 p-8 rounded-lg border-2 border-emerald-500 max-w-md text-center shadow-2xl"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
              className="text-6xl mb-4"
            >
              ⚔️
            </motion.div>
            <h2 className="text-3xl font-bold text-emerald-300 mb-4">
              Lineup Created!
            </h2>
            <p className="text-emerald-100 mb-6">
              Your beast team is ready for battle. Choose an opponent and
              unleash your warriors!
            </p>
            <motion.button
              onClick={() => {
                setShowSuccessModal(false);
                navigate("/attack");
              }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="w-full bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold py-3 px-6 rounded-lg mb-3 transition-all"
            >
              Find Opponent →
            </motion.button>
            <motion.button
              onClick={() => setShowSuccessModal(false)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="text-emerald-300 hover:text-emerald-200 text-sm transition-colors"
            >
              Stay on lineup page
            </motion.button>
          </motion.div>
        </div>
      )}
    </div>
  );
}
