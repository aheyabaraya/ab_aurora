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

function statusMark(status: ChecklistStatus): string {
  if (status === "complete") {
    return "✅";
  }
  if (status === "failed") {
    return "❌";
  }
  return "…";
}

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
        ? "Primary/secondary/accent tokens are ready."
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
          : "Hero headline is waiting for final spec.",
      regenerate: "outputs"
    },
    {
      key: "social_kit",
      label: "Social kit (9:16 / 4:5 / 1:1)",
      status: byKind.get("social_assets") ? "complete" : "pending",
      preview: byKind.get("social_assets")
        ? `Assets: ${Object.keys(socialAssets).join(", ") || "social bundle"}`
        : "Social outputs pending.",
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
        ? "Code plan is generated for `/` route."
        : "Build plan pending.",
      regenerate: "outputs"
    },
    {
      key: "export_zip",
      label: "Export zip",
      status: packReady ? "complete" : "pending",
      preview: packReady ? "Ready to export package snapshot." : "Wait until package step completes.",
      regenerate: "none"
    }
  ];

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.key} className="aurora-panel rounded-xl p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="aurora-title-primary text-sm font-semibold">
                {statusMark(item.status)} {item.label}
              </p>
              <p className="mt-1 text-xs text-slate-300">{item.preview}</p>
            </div>

            {item.key === "export_zip" ? (
              <button
                className="aurora-btn-primary rounded-md px-3 py-1 text-xs font-semibold"
                onClick={onExportZip}
                disabled={!packReady || busy}
              >
                Export zip
              </button>
            ) : (
              <button
                className="aurora-btn-secondary rounded-md px-3 py-1 text-xs font-semibold"
                onClick={item.regenerate === "top3" ? onRegenerateTop3 : onRegenerateOutputs}
                disabled={busy}
              >
                regenerate this only
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
