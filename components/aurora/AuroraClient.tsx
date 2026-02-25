"use client";

import { useCallback, useState } from "react";
import { GuidedConsole } from "./GuidedConsole";
import { ProConsole } from "./ProConsole";
import { useAuroraController } from "./useAuroraController";

type UiMode = "guided" | "pro";

type AuroraClientProps = {
  initialUiMode: UiMode;
};

function syncUrlUiMode(mode: UiMode) {
  const url = new URL(window.location.href);
  if (mode === "guided") {
    url.searchParams.delete("ui");
  } else {
    url.searchParams.set("ui", mode);
  }
  window.history.replaceState({}, "", url.toString());
}

export function AuroraClient({ initialUiMode }: AuroraClientProps) {
  const controller = useAuroraController();
  const [uiMode, setUiMode] = useState<UiMode>(initialUiMode);

  const handleSwitchUiMode = useCallback((nextMode: UiMode) => {
    setUiMode(nextMode);
    syncUrlUiMode(nextMode);
  }, []);

  if (uiMode === "pro") {
    return <ProConsole controller={controller} onSwitchUiMode={handleSwitchUiMode} />;
  }

  return <GuidedConsole controller={controller} onSwitchUiMode={handleSwitchUiMode} />;
}
