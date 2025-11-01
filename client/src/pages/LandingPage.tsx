// src/pages/LandingPage.tsx
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";

export function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-black text-white overflow-hidden relative flex items-center justify-center">
      {/* Dark Portal Background Effect */}
      <div className="absolute inset-0">
        {/* Fel green glow in center */}
        <motion.div
          animate={{
            scale: [1, 1.15, 1],
            opacity: [0.2, 0.35, 0.2],
          }}
          transition={{
            duration: 6,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-emerald-500/30 rounded-full blur-[120px]"
        />

        {/* Darker outer glow */}
        <motion.div
          animate={{
            scale: [1, 1.1, 1],
            opacity: [0.1, 0.2, 0.1],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 0.5,
          }}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-emerald-700/20 rounded-full blur-[150px]"
        />

        {/* Vignette */}
        <div className="absolute inset-0 bg-gradient-radial from-transparent via-black/50 to-black" />
      </div>

      {/* Main Portal Content */}
      <div className="relative z-10 text-center px-4">
        {/* Portal Frame/Gate */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.2, ease: "easeOut" }}
          className="mb-8"
        >
          {/* Top decorative line */}
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 1, delay: 0.3 }}
            className="h-[2px] w-32 mx-auto mb-8 bg-gradient-to-r from-transparent via-emerald-500/60 to-transparent"
          />

          {/* Title with fel green glow */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.5 }}
            className="text-6xl md:text-8xl font-bold tracking-wider mb-6"
            style={{
              textShadow:
                "0 0 40px rgba(16, 185, 129, 0.5), 0 0 80px rgba(16, 185, 129, 0.2)",
              fontFamily: "serif",
            }}
          >
            <span className="text-emerald-500">SURVIVOR</span>
            <br />
            <span className="text-gray-300">VALHALLA</span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.8 }}
            className="text-emerald-200/60 text-sm md:text-base tracking-[0.3em] uppercase"
          >
            Where legends are forged
          </motion.p>

          {/* Bottom decorative line */}
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 1, delay: 0.3 }}
            className="h-[2px] w-32 mx-auto mt-8 bg-gradient-to-r from-transparent via-emerald-500/60 to-transparent"
          />
        </motion.div>

        {/* Enter Button */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 1 }}
        >
          <motion.button
            onClick={() => navigate("/home")}
            whileHover={{
              scale: 1.05,
              textShadow: "0 0 20px rgba(16, 185, 129, 0.8)",
            }}
            whileTap={{ scale: 0.95 }}
            className="group relative px-12 py-4 text-xl font-bold tracking-wider uppercase border-2 border-emerald-500/50 hover:border-emerald-500 transition-all duration-300 cursor-pointer"
            style={{
              background:
                "linear-gradient(to bottom, rgba(16, 185, 129, 0.1), rgba(0, 0, 0, 0.4))",
              textShadow: "0 0 10px rgba(16, 185, 129, 0.5)",
            }}
          >
            <span className="relative z-10 text-emerald-500">ENTER ARENA</span>

            {/* Hover glow effect */}
            <motion.div
              className="absolute inset-0 bg-emerald-500/0 group-hover:bg-emerald-500/10 transition-all duration-300"
              initial={{ opacity: 0 }}
              whileHover={{ opacity: 1 }}
            />
          </motion.button>
        </motion.div>
      </div>
    </div>
  );
}
