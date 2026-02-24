import type { AgentStatus, Scene } from "./types";
import { SCENE_ORDER } from "./types";

type Progress4Props = {
  scene: Scene;
  status: AgentStatus | string;
};

function statusClass(status: string): string {
  if (status === "completed") {
    return "border-emerald-300/60 bg-emerald-400/15 text-emerald-100";
  }
  if (status === "running") {
    return "border-cyan-300/60 bg-cyan-400/15 text-cyan-100";
  }
  if (status === "wait_user") {
    return "border-amber-300/60 bg-amber-400/15 text-amber-100";
  }
  if (status === "failed") {
    return "border-rose-300/60 bg-rose-400/15 text-rose-100";
  }
  return "border-slate-700 bg-slate-900/70 text-slate-200";
}

export function Progress4({ scene, status }: Progress4Props) {
  const activeIndex = SCENE_ORDER.indexOf(scene);

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-4">
        {SCENE_ORDER.map((step, index) => {
          const done = index < activeIndex;
          const active = index === activeIndex;
          return (
            <div
              key={step}
              className={`rounded-lg border px-3 py-2 text-center text-[11px] tracking-[0.2em] ${
                done
                  ? "border-emerald-300/50 bg-emerald-500/10 text-emerald-100"
                  : active
                    ? "border-cyan-300/60 bg-cyan-500/10 text-cyan-100"
                    : "border-slate-700/90 bg-slate-900/70 text-slate-400"
              }`}
            >
              {step}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-300">Current Scene: {scene}</p>
        <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-wider ${statusClass(status)}`}>
          {status}
        </span>
      </div>
    </div>
  );
}
