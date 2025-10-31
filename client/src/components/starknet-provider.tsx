"use client";
import React from "react";

import { mainnet } from "@starknet-react/chains";
import {
  StarknetConfig,
  voyager,
  cartridgeProvider,
} from "@starknet-react/core";

import { ControllerConnector } from "@cartridge/connector";
import { constants } from "starknet";

const cartridgeConnector = new ControllerConnector({
  chains: [
    {
      rpcUrl: "https://api.cartridge.gg/x/starknet/sepolia",
    },
    {
      rpcUrl: "https://api.cartridge.gg/x/starknet/mainnet",
    },
  ],
  defaultChainId: constants.StarknetChainId.SN_MAIN,
});

export function StarknetProvider({ children }: { children: React.ReactNode }) {
  return (
    <StarknetConfig
      chains={[mainnet]}
      provider={cartridgeProvider()}
      connectors={[cartridgeConnector]}
      explorer={voyager}
    >
      {children}
    </StarknetConfig>
  );
}
