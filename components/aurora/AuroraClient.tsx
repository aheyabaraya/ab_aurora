"use client";

import { GuidedConsole } from "./GuidedConsole";
import { useAuroraController } from "./useAuroraController";

export function AuroraClient() {
  const controller = useAuroraController();
  return <GuidedConsole controller={controller} />;
}
