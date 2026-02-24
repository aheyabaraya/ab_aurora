# Aurora UI Assets Final v1 (2026-02-24)

## What this pack is
- Safe-to-use **derived** UI images from AheyaBaraya canon assets (no overwrite).
- One **abstract background** designed for console panels (no characters / no text).

## Recommended usage
### Background (avoid layout shift)
Use as CSS background for the page root, not <img>.

```css
.pageBg{
  background-image:
    linear-gradient(180deg, rgba(6,10,18,.82) 0%, rgba(6,10,18,.55) 60%, rgba(6,10,18,.82) 100%),
    url('/assets/bg_abstract_orbline_1920x1080.webp');
  background-size: cover;
  background-position: center;
}
```

### Top-3 cards (stable sizing)
Use next/image with fixed width/height to prevent CLS.
- card: 768x1024 or 960x1440
- blur placeholder: *_blur.webp

### Sigil tile overlay
Apply as subtle overlay:
- opacity: 0.06 ~ 0.12
- mix-blend-mode: overlay (optional)
