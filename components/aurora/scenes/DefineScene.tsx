"use client";

import { AURORA_ASSETS } from "../aurora-assets";

type DefineSceneProps = {
  stage: string;
};

export function DefineScene({ stage }: DefineSceneProps) {
  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-cyan-300/20 bg-slate-950/70">
        <div
          className="h-56 bg-cover bg-center"
          style={{
            backgroundImage: `linear-gradient(180deg, rgba(2,6,23,0.25), rgba(2,6,23,0.82)), url(${AURORA_ASSETS.heroSquare})`
          }}
        />
        <div className="space-y-2 p-4 text-sm text-slate-200">
          <p>Interview + intent gate + draft spec are merged as one DEFINE scene.</p>
          <p>Current stage: {stage}</p>
        </div>
      </div>
    </div>
  );
}
