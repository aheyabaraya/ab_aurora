# Workspace Guardrails (ab_aurora)

This repository is `/Users/yuminseog/ab_aurora`.

## 1) Default working target
- Always treat `ab_aurora` as the only active workspace unless the user explicitly says otherwise in the current turn.
- Do not assume commands or files from other repositories are in scope.

## 2) Cross-repo confusion prevention
- If a request mentions paths, services, scripts, or context that look like another repo (for example `/Users/yuminseog/aheyabaraya/aheya`), stop before executing any change.
- Ask a confirmation question first:
  - `"이 작업은 ab_aurora가 아니라 다른 저장소 기준으로 보입니다. 정말 여기(ab_aurora)에서 진행할까요?"`

## 3) Unrelated command safety gate
- When a user command appears unrelated to `ab_aurora` codebase goals or conflicts with current repo structure, do not execute immediately.
- First ask a short clarification question and wait for user confirmation.

## 4) Execution rule after confirmation
- Only proceed with cross-repo or ambiguous actions after explicit user confirmation in the same conversation turn sequence.

## 5) Engineering design stance
- Default design goals: maintainability, efficiency, cost efficiency, and security.
- Prefer reusable modules and shared utilities over duplicate logic.
- Apply branch handling intentionally so behavior differences are explicit and predictable.
- Keep interfaces simple and stable (clear boundaries, low coupling, small change impact).
- Optimize resource usage first through design (avoid unnecessary API calls, compute, and storage).
- Treat security as a baseline requirement: least privilege, secret-safe handling, input validation, and safe defaults.
