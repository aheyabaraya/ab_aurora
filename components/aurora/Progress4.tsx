import type { Scene } from "./types";
import { SCENE_ORDER } from "./types";

type Progress4Props = {
  scene: Scene;
};
export function Progress4({ scene }: Progress4Props) {
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
              className={`rounded-lg px-3 py-2 text-center text-[11px] tracking-[0.2em] ${
                done
                  ? "aurora-pill-active"
                  : active
                    ? "border border-violet-200/75 bg-violet-400/20 text-violet-50"
                    : "aurora-pill text-slate-300"
              }`}
            >
              {step}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between">
        <p className="aurora-title-label text-xs uppercase tracking-[0.2em]">Current Scene: {scene}</p>
      </div>
    </div>
  );
}
