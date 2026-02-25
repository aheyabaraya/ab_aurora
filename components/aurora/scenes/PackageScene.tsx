"use client";

import { PackageChecklist } from "../PackageChecklist";
import type { ArtifactRecord } from "../types";

type PackageSceneProps = {
  artifacts: ArtifactRecord[];
  currentStep: string;
  finalSpec: Record<string, unknown> | null;
  busy: boolean;
  onRegenerateOutputs: () => void;
  onRegenerateTop3: () => void;
  onExportZip: () => void;
};

export function PackageScene({
  artifacts,
  currentStep,
  finalSpec,
  busy,
  onRegenerateOutputs,
  onRegenerateTop3,
  onExportZip
}: PackageSceneProps) {
  return (
    <PackageChecklist
      artifacts={artifacts}
      currentStep={currentStep}
      finalSpec={finalSpec}
      busy={busy}
      onRegenerateOutputs={onRegenerateOutputs}
      onRegenerateTop3={onRegenerateTop3}
      onExportZip={onExportZip}
    />
  );
}
