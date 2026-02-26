import type { Scene } from "./types";
import { SCENE_ORDER } from "./types";

type Progress4Props = {
  scene: Scene;
};
export function Progress4({ scene }: Progress4Props) {
  const activeIndex = SCENE_ORDER.indexOf(scene);

  return (
    <div className="aurora-progress4">
      <div className="aurora-progress4-rail">
        {SCENE_ORDER.map((step, index) => {
          const done = index < activeIndex;
          const active = index === activeIndex;
          return (
            <div
              key={step}
              className={`aurora-progress4-step ${done ? "is-done" : ""} ${active ? "is-active" : ""}`}
            >
              <span className="aurora-progress4-step-no">{index + 1}</span>
              <span className="aurora-progress4-step-label">{step}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
