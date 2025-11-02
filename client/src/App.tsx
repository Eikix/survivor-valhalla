// src/App.tsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LandingPage } from "./pages/LandingPage";
import { LineupPage } from "./pages/LineupPage";
import { AttackLineupPage } from "./pages/AttackLineupPage";
import { MatchHistoryPage } from "./pages/MatchHistoryPage";
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
