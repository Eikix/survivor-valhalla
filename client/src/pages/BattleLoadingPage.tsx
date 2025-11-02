import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAccount } from "@starknet-react/core";
import { useEventQuery, useModels } from "@dojoengine/sdk/react";
import { ToriiQueryBuilder } from "@dojoengine/sdk";
import { addAddressPadding } from "starknet";
import { Swords } from "lucide-react";
import { Navbar } from "../components/navbar";
import { ModelsMapping } from "../bindings/typescript/models.gen";

const BATTLE_QUOTES = [
  "The clash of steel echoes through the battlefield...",
  "Heroes rise, legends are born in moments like these.",
  "Every battle tells a story of courage and determination.",
  "In the heat of combat, true character is revealed.",
  "Victory belongs to those who dare to fight for it.",
  "The strongest warriors are forged in the fiercest battles.",
  "Honor is earned through blood, sweat, and perseverance.",
  "Champions are made when nobody is watching.",
];

export function BattleLoadingPage() {
  const [currentQuote, setCurrentQuote] = useState(0);
  const [progress, setProgress] = useState(0);
  
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { address } = useAccount();
  
  // Get the last battle ID from URL params
  const lastBattleIdFromParams = parseInt(searchParams.get('lastBattleId') || '0', 10);
  
  console.log(`[BattleLoadingPage] Waiting for battle ID > ${lastBattleIdFromParams}`);

  // Query battle events to detect when battle completes
  useEventQuery(
    new ToriiQueryBuilder()
      .includeHashedKeys()
      .withEntityModels([
        ModelsMapping.BattleCompleted,
      ]),
  );

  const battleEvents = useModels(ModelsMapping.BattleCompleted);

  // Check for new battle completion events
  useEffect(() => {
    if (!address || !Array.isArray(battleEvents)) return;

    const paddedAddress = addAddressPadding(address.toLowerCase()).toLowerCase();
    console.log(`[BattleLoadingPage] Checking ${battleEvents.length} battle events for address ${paddedAddress.slice(0,8)}...`);
    
    // Look for battles with ID strictly greater than lastBattleIdFromParams
    battleEvents.forEach((eventObj: any) => {
      const entityId = Object.keys(eventObj)[0];
      const event = eventObj[entityId];

      // Only proceed if this user is the attacker in this battle
      if (event && event.attacker?.toLowerCase() === paddedAddress) {
        const battleId = Number(event.battle_id);
        console.log(`[BattleLoadingPage] Found battle ${battleId} where we are attacker, comparing with ${lastBattleIdFromParams}`);
        
        // Only navigate if this battle ID is strictly greater than the last one
        if (battleId > lastBattleIdFromParams) {
          console.log(`[BattleLoadingPage] New battle detected: ${battleId} > ${lastBattleIdFromParams} (we are attacker)`);
          navigate(`/battle/${battleId}`);
          return; // Exit early once we find the new battle
        }
      }
    });
  }, [battleEvents, address, lastBattleIdFromParams, navigate]);

  // Cycle through quotes every 2 seconds during loading
  useEffect(() => {
    const quoteInterval = setInterval(() => {
      setCurrentQuote((prev) => (prev + 1) % BATTLE_QUOTES.length);
    }, 2000);

    return () => clearInterval(quoteInterval);
  }, []);

  // Update progress bar continuously
  useEffect(() => {
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 95) return 95; // Keep it at 95% until battle completes
        return prev + (95 / 300); // 30 seconds to reach 95%
      });
    }, 100);

    return () => clearInterval(progressInterval);
  }, []);

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      {/* Background effect */}
      <div className="absolute inset-0">
        <motion.div
          animate={{
            opacity: [0.1, 0.2, 0.1],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-red-600/10 rounded-full blur-[150px]"
        />
      </div>

      <Navbar />
      
      <div className="relative z-10 min-h-screen flex items-center justify-center">
        <div className="max-w-2xl w-full mx-auto px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center"
          >
            {/* Battle loading icon */}
            <motion.div
              animate={{
                rotate: 360,
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "linear",
              }}
              className="w-24 h-24 mx-auto mb-8"
            >
              <Swords className="w-full h-full text-red-500/70" />
            </motion.div>

            {/* Title */}
            <h1 className="text-4xl md:text-5xl font-bold mb-6 text-red-500">
              Battle in Progress
            </h1>

            {/* Progress bar */}
            <div className="w-full bg-gray-800 rounded-full h-2 mb-8">
              <motion.div
                className="bg-gradient-to-r from-red-600 to-red-400 h-2 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.1 }}
              />
            </div>

            {/* Quote display */}
            <div className="h-16 flex items-center justify-center">
              <AnimatePresence mode="wait">
                <motion.p
                  key={currentQuote}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.5 }}
                  className="text-red-200/80 text-lg italic text-center max-w-lg"
                >
                  "{BATTLE_QUOTES[currentQuote]}"
                </motion.p>
              </AnimatePresence>
            </div>

            {/* Loading text */}
            <motion.p
              animate={{
                opacity: [0.5, 1, 0.5],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              className="text-red-400/60 text-sm uppercase tracking-wider mt-8"
            >
              Waiting for battle results from the chain...
            </motion.p>
          </motion.div>
        </div>
      </div>
    </div>
  );
}