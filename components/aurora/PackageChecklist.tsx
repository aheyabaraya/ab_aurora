"use client";

import type { ArtifactRecord } from "./types";

type PackageChecklistProps = {
  artifacts: ArtifactRecord[];
  currentStep: string;
  finalSpec: Record<string, unknown> | null | undefined;
  busy: boolean;
  onRegenerateOutputs: () => void;
  onRegenerateTop3: () => void;
  onExportZip: () => void;
};

type ChecklistStatus = "complete" | "pending" | "failed";

type ChecklistItem = {
  key: string;
  label: string;
  status: ChecklistStatus;
  preview: string;
  regenerate: "outputs" | "top3" | "none";
};

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object") {
    return value as Record<string, unknown>;
  }
  return {};
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function statusLabel(status: ChecklistStatus): string {
  if (status === "complete") {
    return "Complete";
  }
  if (status === "failed") {
    return "Failed";
  }
  return "Pending";
}

export function PackageChecklist({
  artifacts,
  currentStep,
  finalSpec,
  busy,
  onRegenerateOutputs,
  onRegenerateTop3,
  onExportZip
}: PackageChecklistProps) {
  const byKind = new Map<string, ArtifactRecord>();
  for (const artifact of artifacts) {
    if (!byKind.has(artifact.kind)) {
      byKind.set(artifact.kind, artifact);
    }
  }

  const finalSpecObject = asObject(finalSpec);
  const uiPlan = asObject(finalSpecObject.ui_plan);
  const socialAssets = asObject(byKind.get("social_assets")?.content);
  const heroHeadline = typeof uiPlan.headline === "string" ? uiPlan.headline : "";
  const layout = asStringArray(uiPlan.layout);
  const packReady = Boolean(byKind.get("pack_meta")) || currentStep === "done";

  const items: ChecklistItem[] = [
    {
      key: "tokens",
      label: "Brand tokens",
      status: byKind.get("tokens") ? "complete" : "pending",
      preview: byKind.get("tokens")
        ? "Primary, secondary, and accent tokens are ready."
        : "Token artifacts will appear after approve_build.",
      regenerate: "outputs"
    },
    {
      key: "hero_copy",
      label: "Hero copy (KR/EN)",
      status: heroHeadline.length > 0 ? "complete" : "pending",
      preview:
        heroHeadline.length > 0
          ? `KR: ${heroHeadline} / EN: ${heroHeadline}`
          : "Hero headline is waiting for the final spec.",
      regenerate: "outputs"
    },
    {
      key: "social_kit",
      label: "Social kit (9:16 / 4:5 / 1:1)",
      status: byKind.get("social_assets") ? "complete" : "pending",
      preview: byKind.get("social_assets")
        ? `Assets: ${Object.keys(socialAssets).join(", ") || "social bundle"}`
        : "Social outputs are still pending.",
      regenerate: "outputs"
    },
    {
      key: "landing_outline",
      label: "Landing sections outline",
      status: layout.length > 0 ? "complete" : "pending",
      preview: layout.length > 0 ? layout.join(" / ") : "Section outline pending.",
      regenerate: "outputs"
    },
    {
      key: "build_plan",
      label: "Build plan",
      status: byKind.get("code_plan") ? "complete" : "pending",
      preview: byKind.get("code_plan")
        ? "Code plan is generated for the `/` route."
        : "Build plan is still being assembled.",
      regenerate: "outputs"
    },
    {
      key: "export_zip",
      label: "Export zip",
      status: packReady ? "complete" : "pending",
      preview: packReady ? "Ready to export the package snapshot." : "Wait until the package step completes.",
      regenerate: "none"
    }
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="aurora-title-primary text-[clamp(1.3rem,2vw,1.65rem)] leading-[1.08]">
            Collect the deliverables before export.
          </h2>
        </div>
        <span className={packReady ? "aurora-chip" : "aurora-chip-soft"}>
          {packReady ? "Ready to Export" : "Preparing Package"}
        </span>
      </div>

      {items.map((item) => (
        <div key={item.key} className="aurora-panel aurora-package-item">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <span className={`aurora-package-status is-${item.status}`}>
                <span className="aurora-package-status-dot" />
                {statusLabel(item.status)}
              </span>
              <p className="aurora-title-primary mt-3 text-lg">{item.label}</p>
              <p className="mt-2 text-sm text-slate-300">{item.preview}</p>
            </div>

            {item.key === "export_zip" ? (
              <button
                className="aurora-btn-cta rounded-full px-5 py-2 text-xs font-semibold"
                onClick={onExportZip}
                disabled={!packReady || busy}
              >
                Export Zip
              </button>
            ) : (
              <button
                className="aurora-btn-secondary rounded-full px-5 py-2 text-xs font-semibold"
                onClick={item.regenerate === "top3" ? onRegenerateTop3 : onRegenerateOutputs}
                disabled={busy}
              >
                Regenerate This
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
