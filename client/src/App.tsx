// src/App.tsx
import { useEffect, useRef } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LandingPage } from "./pages/LandingPage";
import { LineupPage } from "./pages/LineupPage";
import { AttackLineupPage } from "./pages/AttackLineupPage";
import { MatchHistoryPage } from "./pages/MatchHistoryPage";
import { BattlePage } from "./pages/BattlePage";
import { BattleLoadingPage } from "./pages/BattleLoadingPage";
import { StarknetProvider } from "./components/starknet-provider";
import { DojoSdkProvider } from "@dojoengine/sdk/react";
import { init } from "@dojoengine/sdk";
import { dojoConfig } from "./dojoConfig.ts";
import { setupWorld } from "./bindings/typescript/contracts.gen.ts";
import type { SchemaType } from "./bindings/typescript/models.gen.ts";
import { Toaster } from "react-hot-toast";

export const TORII_URL = "https://api.cartridge.gg/x/survivor-valhalla/torii";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const sdk = await init<SchemaType>({
  client: {
    // Required: Address of the deployed World contract
    worldAddress: dojoConfig.manifest.world.address,
    // Optional: Torii indexer URL (defaults to http://localhost:8080)
    toriiUrl: TORII_URL,
  },
  // Domain configuration for typed message signing (SNIP-12)
  domain: {
    name: "Survivor Valhalla",
    version: "1.0",
    chainId: "SN_MAIN",
    revision: "1",
  },
});

function App() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      audioRef.current = new Audio('/sfx/music.mp3');
      audioRef.current.loop = true;
      audioRef.current.volume = 0.2; // Set to 20% volume for subtle background ambiance
      
      const playMusic = async () => {
        try {
          if (audioRef.current) {
            await audioRef.current.play();
          }
        } catch (error) {
                    const startMusicOnInteraction = () => {
            if (audioRef.current) {
              audioRef.current.play().catch(console.error);
            }
            document.removeEventListener('click', startMusicOnInteraction);
            document.removeEventListener('keydown', startMusicOnInteraction);
          };
          
          document.addEventListener('click', startMusicOnInteraction);
          document.addEventListener('keydown', startMusicOnInteraction);
        }
      };
      
      playMusic();
    }

    // Cleanup function
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <DojoSdkProvider sdk={sdk} dojoConfig={dojoConfig} clientFn={setupWorld}>
        <StarknetProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/home" element={<LineupPage />} />
              <Route path="/attack" element={<AttackLineupPage />} />
              <Route path="/history" element={<MatchHistoryPage />} />
              <Route path="/battle/loading" element={<BattleLoadingPage />} />
              <Route path="/battle/:battleId" element={<BattlePage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
          <Toaster 
            position="bottom-right"
            toastOptions={{
              duration: 5000,
              style: {
                background: '#1a0a0a',
                color: '#fff',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '0.5rem',
              },
              success: {
                iconTheme: {
                  primary: '#10b981',
                  secondary: '#fff',
                },
              },
              error: {
                iconTheme: {
                  primary: '#ef4444',
                  secondary: '#fff',
                },
              },
              loading: {
                iconTheme: {
                  primary: '#f59e0b',
                  secondary: '#fff',
                },
              },
            }}
          />
        </StarknetProvider>
      </DojoSdkProvider>
    </QueryClientProvider>
  );
}

export default App;
