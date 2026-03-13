import type { CSSProperties } from "react";

export const ASSET_BASE = "/aurora";

function assetPath(fileName: string): string {
  return `${ASSET_BASE}/${fileName}`;
}

export const AURORA_ASSETS = {
  backgroundDesktop: assetPath("bg_abstract_orbline_1920x1080.webp"),
  backgroundMobile: assetPath("bg_abstract_orbline_1080x1920.webp"),
  backgroundCosmic: assetPath("cosmic_reference_bg.png"),
  avatarPortrait: assetPath("aurora.png"),
  heroDesktop: assetPath("hero_orbcore_1920x1080.webp"),
  heroPortrait: assetPath("hero_orbcore_1080x1920.webp"),
  heroSquare: assetPath("hero_orbcore_1080x1350.webp"),
  heroBlur: assetPath("bg_hero_blur_1920x1080.webp"),
  sigilTile: assetPath("sigil_tile_1024.png"),
  top3Cards: [
    {
      rank: 1,
      name: "Hyunmu",
      image: assetPath("top3_01_hyunmu_card_768x1024.webp"),
      blur: assetPath("top3_01_hyunmu_card_768x1024_blur.webp")
    },
    {
      rank: 2,
      name: "Samjoko",
      image: assetPath("top3_02_samjoko_card_768x1024.webp"),
      blur: assetPath("top3_02_samjoko_card_768x1024_blur.webp")
    },
    {
      rank: 3,
      name: "Haetae",
      image: assetPath("top3_03_haetae_card_768x1024.webp"),
      blur: assetPath("top3_03_haetae_card_768x1024_blur.webp")
    }
  ]
} as const;

export function getTop3CardAsset(rank: number): {
  rank: number;
  name: string;
  image: string;
  blur: string;
} {
  const index = rank >= 1 && rank <= 3 ? rank - 1 : 0;
  return AURORA_ASSETS.top3Cards[index];
}

export function createAuroraPageStyle(): CSSProperties {
  return {
    ["--aurora-bg-desktop" as string]: `url(${AURORA_ASSETS.backgroundDesktop})`,
    ["--aurora-bg-mobile" as string]: `url(${AURORA_ASSETS.backgroundMobile})`,
    ["--aurora-bg-cosmic" as string]: `url(${AURORA_ASSETS.backgroundCosmic})`,
    ["--aurora-sigil-tile" as string]: `url(${AURORA_ASSETS.sigilTile})`
  };
}
