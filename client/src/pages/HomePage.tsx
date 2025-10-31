// src/pages/HomePage.tsx
import { motion } from "framer-motion";
import { Shield, Trophy, Skull } from "lucide-react";
import { useState } from "react";
import { useConnect, useAccount } from "@starknet-react/core";
import { Navbar } from "../components/navbar";

export function HomePage() {
  const [hasBase, setHasBase] = useState(false);

  const { connect, connectors } = useConnect();
  const { status } = useAccount();
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

  // Mock stats (only shown when wallet is connected)
  const stats = {
    wins: 0,
    losses: 0,
    base: hasBase ? "Base Created" : "No Base",
  };

  const handleCreateBase = async () => {
    if (status !== "connected") return;
    setHasBase(true);
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
            THE ARENA
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
                className="px-10 py-4 text-lg font-bold tracking-wider uppercase border-2 border-emerald-500/50 hover:border-emerald-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
            {/* Create Base Section */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mb-16"
            >
              <div className="border border-emerald-500/30 bg-emerald-950/20 p-8">
                <div className="text-center">
                  <Shield className="w-12 h-12 text-emerald-500/50 mx-auto mb-4" />
                  <h2 className="text-2xl font-bold text-emerald-400 mb-4 tracking-wider uppercase">
                    Your Base
                  </h2>

                  {!hasBase ? (
                    <>
                      <p className="text-emerald-200/40 mb-6 text-sm">
                        Create your base to begin defending
                      </p>
                      <motion.button
                        onClick={handleCreateBase}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className="px-8 py-3 text-base font-bold tracking-wider uppercase border-2 border-emerald-500/50 hover:border-emerald-500 transition-all"
                        style={{
                          background:
                            "linear-gradient(to bottom, rgba(16, 185, 129, 0.1), rgba(0, 0, 0, 0.4))",
                          textShadow: "0 0 10px rgba(16, 185, 129, 0.5)",
                        }}
                      >
                        <span className="text-emerald-500">CREATE BASE</span>
                      </motion.button>
                    </>
                  ) : (
                    <div className="text-emerald-400/80 text-sm tracking-wider uppercase">
                      Base established
                    </div>
                  )}
                </div>
              </div>
            </motion.div>

            {/* Stats Section */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <h2 className="text-center text-xl font-bold text-emerald-400 mb-6 tracking-wider uppercase">
                Combat Records
              </h2>
              <div className="grid grid-cols-3 gap-4">
                {/* Wins */}
                <div className="border border-emerald-500/20 bg-emerald-950/10 p-6 text-center">
                  <Trophy className="w-8 h-8 text-emerald-500/50 mx-auto mb-3" />
                  <div className="text-3xl font-bold text-emerald-400 mb-1">
                    {stats.wins}
                  </div>
                  <div className="text-xs text-emerald-200/40 tracking-wider uppercase">
                    Wins
                  </div>
                </div>

                {/* Losses */}
                <div className="border border-emerald-500/20 bg-emerald-950/10 p-6 text-center">
                  <Skull className="w-8 h-8 text-emerald-500/50 mx-auto mb-3" />
                  <div className="text-3xl font-bold text-emerald-400 mb-1">
                    {stats.losses}
                  </div>
                  <div className="text-xs text-emerald-200/40 tracking-wider uppercase">
                    Losses
                  </div>
                </div>

                {/* Base Status */}
                <div className="border border-emerald-500/20 bg-emerald-950/10 p-6 text-center">
                  <Shield className="w-8 h-8 text-emerald-500/50 mx-auto mb-3" />
                  <div className="text-lg font-bold text-emerald-400 mb-1">
                    {stats.base}
                  </div>
                  <div className="text-xs text-emerald-200/40 tracking-wider uppercase">
                    Base
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </div>
    </div>
  );
}
