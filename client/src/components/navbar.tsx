import { motion } from "framer-motion";
import { LogOut, ExternalLink, Copy, Check, Shield, Swords, ScrollText } from "lucide-react";
import { useState } from "react";
import { useConnect, useAccount, useDisconnect } from "@starknet-react/core";
import { useLocation, Link } from "react-router-dom";
import type { ControllerConnector } from "@cartridge/connector";
import { AddressDisplay } from "./AddressDisplay";

export function Navbar() {
  const [copied, setCopied] = useState(false);
  const location = useLocation();

  const { connect, connector, connectors } = useConnect();
  const { address, status } = useAccount();
  const { disconnect } = useDisconnect();

  return (
    <nav className="relative z-20 border-b border-emerald-500/20 bg-black/50 backdrop-blur-sm">
      <div className="container mx-auto px-2 sm:px-4 py-3 sm:py-4">
        <div className="flex items-center justify-between">
          {/* Logo/Brand and Navigation Tabs */}
          <div className="flex items-center gap-2 sm:gap-4 md:gap-8">
            <h2 className="text-sm sm:text-lg md:text-xl font-bold text-emerald-500 tracking-wider uppercase">
              <span className="hidden sm:inline">SURVIVOR VALHALLA</span>
              <span className="sm:hidden">VALHALLA</span>
            </h2>

            {/* Navigation Tabs */}
            {status === "connected" && (
              <div className="flex items-center gap-1 sm:gap-2 md:gap-4">
                <Link to="/home">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className={`flex items-center gap-1 sm:gap-2 px-1.5 sm:px-3 md:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-bold tracking-wider uppercase transition-all cursor-pointer ${
                      location.pathname === "/home"
                        ? "text-emerald-400 border-b-2 border-emerald-400"
                        : "text-emerald-200/60 hover:text-emerald-300 border-b-2 border-transparent"
                    }`}
                    title="Beast Lineup"
                  >
                    <Shield className="w-4 h-4 sm:w-4 sm:h-4" />
                    <span className="hidden sm:inline">Beast Lineup</span>
                  </motion.button>
                </Link>

                <Link to="/attack">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className={`flex items-center gap-1 sm:gap-2 px-1.5 sm:px-3 md:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-bold tracking-wider uppercase transition-all cursor-pointer ${
                      location.pathname === "/attack"
                        ? "text-emerald-400 border-b-2 border-emerald-400"
                        : "text-emerald-200/60 hover:text-emerald-300 border-b-2 border-transparent"
                    }`}
                    title="Attack Lineup"
                  >
                    <Swords className="w-4 h-4 sm:w-4 sm:h-4" />
                    <span className="hidden sm:inline">Attack Lineup</span>
                  </motion.button>
                </Link>

                <Link to="/history">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className={`flex items-center gap-1 sm:gap-2 px-1.5 sm:px-3 md:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-bold tracking-wider uppercase transition-all cursor-pointer ${
                      location.pathname === "/history"
                        ? "text-emerald-400 border-b-2 border-emerald-400"
                        : "text-emerald-200/60 hover:text-emerald-300 border-b-2 border-transparent"
                    }`}
                    title="Match History"
                  >
                    <ScrollText className="w-4 h-4 sm:w-4 sm:h-4" />
                    <span className="hidden sm:inline">Match History</span>
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
              className="flex items-center gap-1 sm:gap-2"
            >
              {/* Wallet Address Badge */}
              <motion.button
                onClick={() =>
                  (connector as ControllerConnector)?.controller.openProfile()
                }
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full hover:bg-emerald-500/15 hover:border-emerald-500/30 transition-all cursor-pointer group"
                title="View profile"
              >
                <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-emerald-500 rounded-full" />
                <AddressDisplay
                  address={address}
                  className="text-xs sm:text-sm group-hover:text-emerald-300 transition-colors"
                />
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
                className="p-1 sm:p-1.5 text-emerald-500/60 hover:text-emerald-500 hover:bg-emerald-500/10 rounded transition-all cursor-pointer"
                title="Copy address"
              >
                {copied ? (
                  <Check className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                ) : (
                  <Copy className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                )}
              </motion.button>

              {/* Profile Button - Hidden on mobile */}
              <motion.button
                onClick={() =>
                  (connector as ControllerConnector)?.controller.openProfile()
                }
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                className="hidden sm:block p-1.5 text-emerald-500/60 hover:text-emerald-500 hover:bg-emerald-500/10 rounded transition-all cursor-pointer"
                title="View profile"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </motion.button>

              {/* Divider */}
              <div className="h-3 sm:h-4 w-px bg-emerald-500/20 mx-0.5 sm:mx-1" />

              {/* Disconnect Button */}
              <motion.button
                onClick={() => disconnect()}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                className="p-1 sm:p-1.5 text-emerald-500/60 hover:text-emerald-500 hover:bg-emerald-500/10 rounded transition-all cursor-pointer"
                title="Disconnect wallet"
              >
                <LogOut className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              </motion.button>
            </motion.div>
          ) : (
            <motion.button
              onClick={() => connect({ connector: connectors[0] })}
              disabled={status === "connecting"}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="px-3 sm:px-4 md:px-6 py-1.5 sm:py-2 text-xs sm:text-sm font-bold tracking-wider uppercase border-2 border-emerald-500/50 hover:border-emerald-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed rounded cursor-pointer"
              style={{
                background:
                  "linear-gradient(to bottom, rgba(16, 185, 129, 0.1), rgba(0, 0, 0, 0.4))",
                textShadow: "0 0 10px rgba(16, 185, 129, 0.5)",
              }}
            >
              <span className="text-emerald-500">
                {status === "connecting" ? (
                  <>
                    <span className="hidden sm:inline">CONNECTING...</span>
                    <span className="sm:hidden">...</span>
                  </>
                ) : (
                  <>
                    <span className="hidden sm:inline">CONNECT WALLET</span>
                    <span className="sm:hidden">CONNECT</span>
                  </>
                )}
              </span>
            </motion.button>
          )}
        </div>
      </div>
    </nav>
  );
}
