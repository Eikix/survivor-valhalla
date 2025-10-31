// src/pages/LandingPage.tsx
import { motion } from "framer-motion";
import { Swords, Shield, Zap, Sparkles } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

export function LandingPage() {
  const navigate = useNavigate();
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnect = async () => {
    setIsConnecting(true);

    // Mock wallet connection (2 second delay)
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Mock setting a wallet address
    localStorage.setItem(
      "mockWalletAddress",
      "0x" + Math.random().toString(16).slice(2, 10),
    );

    setIsConnecting(false);
    navigate("/home");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 text-white overflow-hidden relative">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl"
        />
        <motion.div
          animate={{
            scale: [1, 1.3, 1],
            opacity: [0.2, 0.4, 0.2],
          }}
          transition={{
            duration: 10,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 1,
          }}
          className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-pink-600/20 rounded-full blur-3xl"
        />
      </div>

      {/* Main content */}
      <div className="relative z-10 container mx-auto px-4 py-12 md:py-20">
        {/* Hero section */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center max-w-4xl mx-auto"
        >
          {/* Logo/Title */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mb-8"
          >
            <motion.h1
              className="text-6xl md:text-8xl font-black mb-4 leading-tight"
              style={{
                background:
                  "linear-gradient(to right, #a78bfa, #ec4899, #ef4444)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              CLASH OF
              <br />
              SURVIVORS
            </motion.h1>

            <motion.div
              className="flex items-center justify-center gap-3 text-purple-300"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              <Swords className="w-6 h-6" />
              <span className="text-sm md:text-lg tracking-widest font-semibold">
                ON-CHAIN BATTLES
              </span>
              <Shield className="w-6 h-6" />
            </motion.div>
          </motion.div>

          {/* Tagline */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.6 }}
            className="mb-12 space-y-2"
          >
            <p className="text-xl md:text-2xl text-gray-300">
              Build your base with{" "}
              <span className="text-purple-400 font-semibold">
                dead adventurers
              </span>
            </p>
            <p className="text-xl md:text-2xl text-gray-300">
              Attack with{" "}
              <span className="text-pink-400 font-semibold">fierce beasts</span>
            </p>
            <p className="text-xl md:text-2xl text-gray-300">
              Dominate the{" "}
              <span className="text-red-400 font-semibold">leaderboard</span>
            </p>
          </motion.div>

          {/* CTA Button */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.8, duration: 0.5 }}
          >
            <motion.button
              onClick={handleConnect}
              disabled={isConnecting}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="group relative px-8 md:px-12 py-4 md:py-6 text-lg md:text-2xl font-bold rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 transition-all shadow-2xl shadow-purple-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="relative z-10 flex items-center gap-3">
                {isConnecting ? (
                  <>
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{
                        duration: 1,
                        repeat: Infinity,
                        ease: "linear",
                      }}
                    >
                      <Sparkles className="w-6 h-6 md:w-8 md:h-8" />
                    </motion.div>
                    CONNECTING...
                  </>
                ) : (
                  <>
                    <Zap className="w-6 h-6 md:w-8 md:h-8" />
                    ENTER ARENA
                    <Zap className="w-6 h-6 md:w-8 md:h-8" />
                  </>
                )}
              </span>
              <motion.div className="absolute inset-0 rounded-xl bg-gradient-to-r from-purple-400 to-pink-400 opacity-0 group-hover:opacity-20 blur-xl transition-opacity" />
            </motion.button>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1 }}
              className="mt-4 text-sm text-gray-400"
            >
              {isConnecting
                ? "Connecting to wallet..."
                : "Connect your wallet to start playing"}
            </motion.p>
          </motion.div>
        </motion.div>

        {/* Features */}
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1, duration: 0.8 }}
          className="mt-16 md:mt-24 grid md:grid-cols-3 gap-6 max-w-5xl mx-auto"
        >
          {[
            {
              icon: Shield,
              title: "Build Your Base",
              description: "Use dead Loot Survivor adventurers as defenders",
              gradient: "from-purple-500 to-purple-700",
              delay: 0,
            },
            {
              icon: Swords,
              title: "Attack & Conquer",
              description: "Deploy beasts to raid enemy bases strategically",
              gradient: "from-pink-500 to-red-600",
              delay: 0.1,
            },
            {
              icon: Zap,
              title: "Daily Energy",
              description: "Use 3 daily attacks to climb the leaderboard",
              gradient: "from-red-500 to-orange-600",
              delay: 0.2,
            },
          ].map((feature) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.2 + feature.delay, duration: 0.5 }}
              whileHover={{ y: -8, transition: { duration: 0.2 } }}
              className="bg-gray-800/40 backdrop-blur-sm border border-gray-700/50 rounded-xl p-6 md:p-8"
            >
              <motion.div
                whileHover={{ rotate: [0, -10, 10, -10, 0] }}
                transition={{ duration: 0.5 }}
                className={`w-14 h-14 md:w-16 md:h-16 mx-auto mb-4 bg-gradient-to-br ${feature.gradient} rounded-full flex items-center justify-center shadow-lg`}
              >
                <feature.icon className="w-7 h-7 md:w-8 md:h-8" />
              </motion.div>
              <h3 className="text-lg md:text-xl font-bold mb-2">
                {feature.title}
              </h3>
              <p className="text-sm md:text-base text-gray-400">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </motion.div>

        {/* How it works */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5, duration: 0.8 }}
          className="mt-16 md:mt-24 max-w-2xl mx-auto"
        >
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-8 text-purple-300">
            How It Works
          </h2>
          <div className="space-y-4">
            {[
              {
                num: 1,
                title: "Setup Defense",
                desc: "Choose 5 dead adventurers to guard your base",
              },
              {
                num: 2,
                title: "Launch Attacks",
                desc: "Use daily energy to attack with your beasts",
              },
              {
                num: 3,
                title: "Watch Battles",
                desc: "Experience auto-battler combat and climb ranks",
              },
            ].map((step, index) => (
              <motion.div
                key={step.num}
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1.7 + index * 0.1, duration: 0.5 }}
                whileHover={{ x: 8, transition: { duration: 0.2 } }}
                className="flex items-start gap-4 bg-gray-800/30 backdrop-blur-sm p-4 md:p-6 rounded-lg border border-gray-700/30"
              >
                <motion.div
                  whileHover={{ scale: 1.1 }}
                  className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center font-bold shadow-lg"
                >
                  {step.num}
                </motion.div>
                <div>
                  <h3 className="font-bold mb-1 text-base md:text-lg">
                    {step.title}
                  </h3>
                  <p className="text-sm md:text-base text-gray-400">
                    {step.desc}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2, duration: 0.8 }}
          className="mt-16 md:mt-24 text-center text-xs md:text-sm text-gray-500 space-y-2"
        >
          <p>
            Built on Starknet • Powered by Dojo • Integrates with Loot Survivor
            2
          </p>
          <p>A Dojo/Cartridge Game Jam Creation</p>
        </motion.div>
      </div>
    </div>
  );
}
