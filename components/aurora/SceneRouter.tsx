"use client";

import type { ReactNode } from "react";
import type { Scene } from "./types";

type SceneRouterProps = {
  scene: Scene;
  stage: string;
  children: ReactNode;
};

export function SceneRouter({ scene, stage, children }: SceneRouterProps) {
  return (
    <div key={`${scene}-${stage}`} className="aurora-scene-enter" data-scene={scene}>
      {children}
    </div>
  );
}
