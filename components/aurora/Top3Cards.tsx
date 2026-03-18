"use client";

import Image from "next/image";
import { getTop3CardAsset } from "./aurora-assets";
import type { Candidate, ImagePreviewPayload } from "./types";

type Top3CardsProps = {
  candidates: Candidate[];
  selectedCandidateId: string | null;
  busy: boolean;
  buildRequired: boolean;
  preferChatCommands?: boolean;
  onPreviewImage?: (image: ImagePreviewPayload) => void;
  onSelect: (candidateId: string) => void;
  onConfirmBuild: () => void;
};

function getCandidateStory(candidate: Candidate) {
  return (
    candidate.story ?? {
      premise: candidate.narrative_summary,
      narrative: candidate.rationale,
      asset_rationale: "Review hero, background, and prop together to judge the direction as a full brand bundle."
    }
  );
}

function getSupportingAssets(candidate: Candidate): Array<{
  id: string;
  kind: string;
  title: string;
  prompt: string;
  image_url: string;
}> {
  const assets = candidate.supporting_assets ?? [];
  if (assets.length >= 3) {
    return assets.slice(0, 3);
  }

  const fallbackImage = candidate.image_url || "";
  return [
    {
      id: "asset_1",
      kind: "portrait",
      title: "Character study",
      prompt: candidate.image_prompt,
      image_url: fallbackImage
    },
    {
      id: "asset_2",
      kind: "background",
      title: "Atmosphere background",
      prompt: candidate.moodboard.prompt,
      image_url: fallbackImage
    },
    {
      id: "asset_3",
      kind: "prop",
      title: "Signature prop",
      prompt: candidate.rationale,
      image_url: fallbackImage
    }
  ];
}

export function Top3Cards({
  candidates,
  selectedCandidateId,
  busy,
  buildRequired,
  preferChatCommands = false,
  onPreviewImage,
  onSelect,
  onConfirmBuild
}: Top3CardsProps) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 xl:grid-cols-3">
        {candidates.slice(0, 3).map((candidate) => {
          const selected = candidate.id === selectedCandidateId;
          const asset = getTop3CardAsset(candidate.rank);
          const colors = candidate.moodboard.colors.slice(0, 3);
          const story = getCandidateStory(candidate);
          const supportingAssets = getSupportingAssets(candidate);
          const previewImage = {
            src: candidate.image_url || asset.image,
            alt: `${candidate.naming.recommended} concept render`,
            title: candidate.naming.recommended,
            subtitle: story.premise || candidate.narrative_summary
          } satisfies ImagePreviewPayload;

          return (
            <article
              key={candidate.id}
              className={`aurora-panel aurora-candidate-card overflow-hidden rounded-[28px] ${
                selected ? "is-selected" : ""
              }`}
            >
              <button
                className="aurora-candidate-media relative block aspect-[4/3] w-full cursor-zoom-in border-0 bg-transparent p-0 text-left"
                onClick={() => onPreviewImage?.(previewImage)}
                type="button"
              >
                <div
                  className="absolute inset-0 bg-cover bg-center blur-[1px]"
                  style={{ backgroundImage: `url(${asset.blur})` }}
                  aria-hidden
                />
                {candidate.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={candidate.image_url}
                    alt={`${candidate.naming.recommended} concept render`}
                    className="relative h-full w-full object-cover"
                  />
                ) : (
                  <Image
                    src={asset.image}
                    alt={`${asset.name} concept card`}
                    width={768}
                    height={1024}
                    className="relative h-full w-full object-cover"
                    sizes="(min-width: 1024px) 23vw, (min-width: 768px) 32vw, 100vw"
                    priority={candidate.rank === 1}
                  />
                )}

                <div className="absolute inset-x-4 top-4 z-10 flex items-start justify-between gap-2">
                  <span className="aurora-chip">#{candidate.rank}</span>
                  <div className="flex items-center gap-2">
                    <span className="aurora-chip-soft">Score {candidate.score.toFixed(3)}</span>
                    <span className="aurora-chip-soft">Open Detail</span>
                  </div>
                </div>
              </button>

              <div className="space-y-3.5 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="aurora-title-label">Concept Bundle</p>
                    <h3 className="aurora-title-primary mt-2 text-[1.16rem] leading-tight">{candidate.naming.recommended}</h3>
                    <p className="aurora-text-meta mt-1.5 text-slate-300">{candidate.moodboard.title}</p>
                  </div>
                  <span className={selected ? "aurora-chip" : "aurora-chip-soft"}>{selected ? "Selected" : "Open"}</span>
                </div>

                <div className="aurora-surface-soft rounded-[20px] p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="aurora-title-label">Premise</p>
                    <p className="aurora-text-label text-slate-400">Quick Scan</p>
                  </div>
                  <p className="aurora-text-body mt-2 text-slate-100">{story.premise || candidate.narrative_summary}</p>

                  <div className="mt-3 flex items-center justify-between gap-2">
                    <p className="aurora-title-label">Palette</p>
                    <p className="aurora-text-meta">Top colors</p>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {colors.length > 0 ? (
                      colors.map((color) => (
                        <span
                          key={color}
                          className="inline-flex items-center gap-2 rounded-full border border-white/10 px-2.5 py-1 text-sm text-slate-200"
                        >
                          <span className="aurora-color-dot" style={{ backgroundColor: color, color }} />
                          {color}
                        </span>
                      ))
                    ) : (
                      <span className="aurora-text-meta text-slate-400">Palette is still being refined.</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <p className="aurora-text-meta line-clamp-2 text-slate-400">
                    {preferChatCommands ? `You can also use /pick ${candidate.rank}.` : candidate.rationale}
                  </p>
                  <button
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                      selected ? "aurora-btn-command text-amber-50" : "aurora-btn-secondary"
                    }`}
                    onClick={() => onSelect(candidate.id)}
                    disabled={busy}
                  >
                    {selected ? "Selected Direction" : "Select Direction"}
                  </button>
                </div>

                <details className="aurora-surface-soft rounded-[20px] p-3.5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
                    <div>
                      <p className="aurora-title-label">Supporting Detail</p>
                      <p className="aurora-text-meta mt-1">Story expansion, 3-up assets, and UI plan.</p>
                    </div>
                    <span className="aurora-chip-soft px-3">Expand</span>
                  </summary>

                  <div className="mt-3 space-y-3">
                    <div className="aurora-surface rounded-[18px] p-3">
                      <p className="aurora-title-label">Narrative Summary</p>
                      <p className="aurora-text-body mt-2 text-slate-200">{story.narrative || candidate.narrative_summary}</p>
                      <p className="aurora-text-meta mt-2 text-slate-300">{story.asset_rationale}</p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="aurora-title-label">Supporting Assets</p>
                        <p className="aurora-text-meta">3-up bundle</p>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {supportingAssets.map((supportingAsset) => {
                          const supportingPreview = {
                            src: supportingAsset.image_url || candidate.image_url || asset.image,
                            alt: `${candidate.naming.recommended} ${supportingAsset.title}`,
                            title: `${candidate.naming.recommended} / ${supportingAsset.title}`,
                            subtitle: supportingAsset.prompt
                          } satisfies ImagePreviewPayload;

                          return (
                            <button
                              key={supportingAsset.id}
                              className="aurora-surface-soft group overflow-hidden rounded-[16px] border border-white/8 bg-transparent p-0 text-left"
                              onClick={() => onPreviewImage?.(supportingPreview)}
                              type="button"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={supportingAsset.image_url || candidate.image_url || asset.image}
                                alt={supportingPreview.alt}
                                className="aspect-square w-full object-cover transition duration-200 group-hover:scale-[1.02]"
                              />
                              <div className="px-2.5 py-2">
                                <p className="line-clamp-1 text-sm font-semibold text-slate-100">{supportingAsset.title}</p>
                                <p className="line-clamp-1 aurora-text-label text-slate-400">{supportingAsset.kind}</p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)]">
                      <div className="aurora-surface rounded-[18px] p-3">
                        <p className="aurora-title-label">UI Plan</p>
                        <p className="aurora-text-body mt-2 text-slate-200">{candidate.ui_plan.headline}</p>
                        <p className="aurora-text-meta mt-2 text-slate-400">CTA {candidate.ui_plan.cta}</p>
                      </div>
                      <div className="aurora-surface rounded-[18px] p-3">
                        <p className="aurora-title-label">Story Support</p>
                        <p className="aurora-text-body mt-2 text-slate-200">{candidate.rationale}</p>
                      </div>
                    </div>
                  </div>
                </details>
              </div>
            </article>
          );
        })}
      </div>

      {buildRequired ? (
        <div className="aurora-panel rounded-[26px] border-amber-200/36 bg-amber-300/6 p-4 text-amber-100">
          <p className="aurora-title-label">Build Confirmation</p>
          <p className="aurora-text-body mt-2 text-amber-50/90">
            {preferChatCommands
              ? "Auto pick is off. Use /build in chat to confirm approve_build once."
              : "Auto pick is off. Confirm once to run approve_build and move to package."}
          </p>
          <button
            className="aurora-btn-cta mt-4 rounded-full px-5 py-2 text-sm font-semibold disabled:opacity-60"
            onClick={onConfirmBuild}
            disabled={busy}
          >
            Build
          </button>
        </div>
      ) : null}
    </div>
  );
}
