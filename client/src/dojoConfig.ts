import { createDojoConfig } from "@dojoengine/core";
import manifest from "../../contract/manifest_mainnet.json";

export const dojoConfig = createDojoConfig({ manifest });
