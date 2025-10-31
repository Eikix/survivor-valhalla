// src/pages/HomePage.tsx
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Zap, Swords, Shield, LogOut } from "lucide-react";
import { useEffect, useState } from "react";

export function HomePage() {
  const navigate = useNavigate();
  const [address, setAddress] = useState<string>("");

  useEffect(() => {
    const mockAddress = localStorage.getItem("mockWalletAddress");
    if (!mockAddress) {
      navigate("/");
      return;
    }
    setAddress(mockAddress);
  }, [navigate]);

  const handleDisconnect = () => {
    localStorage.removeItem("mockWalletAddress");
    navigate("/");
  };

  const truncateAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 text-white">
      {/* Header */}
      <motion.header
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-lg"
      >
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Swords className="w-6 h-6 text-purple-400" />
            <span className="font-bold text-xl">Clash of Survivors</span>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-purple-600/20 px-4 py-2 rounded-lg">
              <Zap className="w-4 h-4 text-yellow-400" />
              <span className="font-semibold">3/3</span>
            </div>

            <div className="hidden md:flex items-center gap-2 bg-gray-800/50 px-4 py-2 rounded-lg">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-sm">{truncateAddress(address)}</span>
            </div>

            <button
              onClick={handleDisconnect}
              className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
              title="Disconnect"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </motion.header>

      {/* Main content */}
      <div className="container mx-auto px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <h1 className="text-4xl font-bold mb-4">Welcome, Commander!</h1>
          <p className="text-gray-400">Your base awaits. Choose your path.</p>
        </motion.div>

        {/* Action cards */}
        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            whileHover={{ scale: 1.02, y: -4 }}
            className="bg-gray-800/50 backdrop-blur-sm border border-purple-500/30 rounded-xl p-8 cursor-pointer"
            onClick={() => alert("Base setup coming soon!")}
          >
            <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-purple-700 rounded-full flex items-center justify-center mb-4 mx-auto">
              <Shield className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold mb-2 text-center">My Base</h2>
            <p className="text-gray-400 text-center mb-4">
              Setup your defense with 5 dead adventurers
            </p>
            <div className="text-center">
              <span className="text-sm bg-yellow-500/20 text-yellow-400 px-3 py-1 rounded-full">
                Setup Required
              </span>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            whileHover={{ scale: 1.02, y: -4 }}
            className="bg-gray-800/50 backdrop-blur-sm border border-pink-500/30 rounded-xl p-8 cursor-pointer"
            onClick={() => alert("Attack mode coming soon!")}
          >
            <div className="w-16 h-16 bg-gradient-to-br from-pink-500 to-red-600 rounded-full flex items-center justify-center mb-4 mx-auto">
              <Swords className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold mb-2 text-center">Attack</h2>
            <p className="text-gray-400 text-center mb-4">
              Raid enemy bases with your beast collection
            </p>
            <div className="text-center">
              <span className="text-sm bg-green-500/20 text-green-400 px-3 py-1 rounded-full">
                3 Energy Available
              </span>
            </div>
          </motion.div>
        </div>

        {/* Quick stats */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mt-12 max-w-4xl mx-auto grid grid-cols-3 gap-4"
        >
          <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-purple-400">0</div>
            <div className="text-sm text-gray-400">Wins</div>
          </div>
          <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-pink-400">0</div>
            <div className="text-sm text-gray-400">Losses</div>
          </div>
          <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-red-400">--</div>
            <div className="text-sm text-gray-400">Rank</div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
