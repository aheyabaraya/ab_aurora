# Workspace Roots

## Canonical root
- Repository root: `/Users/yuminseog/ab_aurora`
- Source code:
  - `app/`
  - `lib/`
- Runtime/config:
  - `.env.example`
  - `package.json`
- Project docs:
  - `docs/`

## Legacy nested path
- `ab-aurora/` is treated as a legacy nested workspace path.
- It is ignored by git to prevent accidental tracking of duplicated files and build artifacts.
- Do not add active source files under `ab-aurora/`.

## Working rules
1. Run install/build/dev commands only from repository root.
2. Keep environment template updates in root `.env.example`.
3. Keep setup and environment documentation in root `docs/`.
