"use client";

import { GuidedConsole } from "./GuidedConsole";
import { ProConsole } from "./ProConsole";
import { useAuroraController } from "./useAuroraController";

type AuroraClientProps = {
  initialUiMode: "guided" | "pro";
};

export function AuroraClient({ initialUiMode }: AuroraClientProps) {
  const controller = useAuroraController();

  if (initialUiMode === "pro") {
    return <ProConsole controller={controller} />;
  }

  return <GuidedConsole controller={controller} />;
}
