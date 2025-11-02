import { motion } from "framer-motion";
import { LogOut, ExternalLink, Copy, Check, Shield, Swords } from "lucide-react";
import { useState } from "react";
import { useConnect, useAccount, useDisconnect } from "@starknet-react/core";
import { useLocation, Link } from "react-router-dom";
import type { ControllerConnector } from "@cartridge/connector";

export function Navbar() {
  const [copied, setCopied] = useState(false);
  const location = useLocation();

  const { connect, connector, connectors } = useConnect();
  const { address, status } = useAccount();
  const { disconnect } = useDisconnect();

  return (
    <nav className="relative z-20 border-b border-emerald-500/20 bg-black/50 backdrop-blur-sm">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          {/* Logo/Brand and Navigation Tabs */}
          <div className="flex items-center gap-8">
            <h2 className="text-xl font-bold text-emerald-500 tracking-wider uppercase">
              THE ARENA
            </h2>
            
            {/* Navigation Tabs */}
            {status === "connected" && (
              <div className="flex items-center gap-4">
                <Link to="/home">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className={`flex items-center gap-2 px-4 py-2 text-sm font-bold tracking-wider uppercase transition-all cursor-pointer ${
                      location.pathname === "/home"
                        ? "text-emerald-400 border-b-2 border-emerald-400"
                        : "text-emerald-200/60 hover:text-emerald-300 border-b-2 border-transparent"
                    }`}
                  >
                    <Shield className="w-4 h-4" />
                    <span>Beast Lineup</span>
                  </motion.button>
                </Link>
                
                <Link to="/attack">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className={`flex items-center gap-2 px-4 py-2 text-sm font-bold tracking-wider uppercase transition-all cursor-pointer ${
                      location.pathname === "/attack"
                        ? "text-emerald-400 border-b-2 border-emerald-400"
                        : "text-emerald-200/60 hover:text-emerald-300 border-b-2 border-transparent"
                    }`}
                  >
                    <Swords className="w-4 h-4" />
                    <span>Attack Lineup</span>
                  </motion.button>
                </Link>
              </div>
            )}
          </div>

          {/* Wallet Section */}
          {status === "connected" ? (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2"
            >
              {/* Wallet Address Badge */}
              <motion.button
                onClick={() =>
                  (connector as ControllerConnector)?.controller.openProfile()
                }
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full hover:bg-emerald-500/15 hover:border-emerald-500/30 transition-all cursor-pointer group"
                title="View profile"
              >
                <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                <span className="text-emerald-400 text-sm font-mono group-hover:text-emerald-300 transition-colors">
                  {address?.slice(0, 6)}...{address?.slice(-4)}
                </span>
              </motion.button>

              {/* Copy Button */}
              <motion.button
                onClick={async () => {
                  if (address) {
                    await navigator.clipboard.writeText(address);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }
                }}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                className="p-1.5 text-emerald-500/60 hover:text-emerald-500 hover:bg-emerald-500/10 rounded transition-all cursor-pointer"
                title="Copy address"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </motion.button>

              {/* Profile Button */}
              <motion.button
                onClick={() =>
                  (connector as ControllerConnector)?.controller.openProfile()
                }
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                className="p-1.5 text-emerald-500/60 hover:text-emerald-500 hover:bg-emerald-500/10 rounded transition-all cursor-pointer"
                title="View profile"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </motion.button>

              {/* Divider */}
              <div className="h-4 w-px bg-emerald-500/20 mx-1" />

              {/* Disconnect Button */}
              <motion.button
                onClick={() => disconnect()}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                className="p-1.5 text-emerald-500/60 hover:text-emerald-500 hover:bg-emerald-500/10 rounded transition-all cursor-pointer"
                title="Disconnect wallet"
              >
                <LogOut className="w-3.5 h-3.5" />
              </motion.button>
            </motion.div>
          ) : (
            <motion.button
              onClick={() => connect({ connector: connectors[0] })}
              disabled={status === "connecting"}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="px-6 py-2 text-sm font-bold tracking-wider uppercase border-2 border-emerald-500/50 hover:border-emerald-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed rounded cursor-pointer"
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
          )}
        </div>
      </div>
    </nav>
  );
}
