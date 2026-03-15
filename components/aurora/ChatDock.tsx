"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { AURORA_ASSETS } from "./aurora-assets";
import { filterSlashCommands } from "./slash-commands";
import type {
  ArtifactRecord,
  ChatEntry,
  CommandExecutionResult,
  GuidedActionId,
  JobsPayload,
  ModelSource,
  QueuedCommand,
  QuickActionId,
  RightPanelViewModel,
  SessionUsageSummary
} from "./types";

type TabId = "chat" | "artifacts" | "jobs";

type ChatDockProps = {
  entries: ChatEntry[];
  artifacts: ArtifactRecord[];
  jobs: JobsPayload["jobs"];
  queuedCommands: QueuedCommand[];
  shouldQueueIntervention: boolean;
  busy: boolean;
  sessionReady: boolean;
  guided: boolean;
  defaultTab: TabId;
  showArtifactsTab?: boolean;
  status?: string;
  modelSource?: ModelSource;
  usageSummary?: SessionUsageSummary | null;
  actionHub?: RightPanelViewModel | null;
  onSendChat?: (message: string) => void;
  onQuickAction?: (actionId: QuickActionId) => void;
  onRunGuidedAction?: (actionId: GuidedActionId) => Promise<void> | void;
  onExecuteSlash?: (raw: string) => Promise<CommandExecutionResult>;
  onForceQueued: (queueId: string) => void;
  onDiscardQueued: (queueId: string) => void;
};

type IconProps = {
  className?: string;
};

function IconChat({ className = "h-3.5 w-3.5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden>
      <path d="M7 17.5l-3.5 2 .9-4A8 8 0 1112 20a8 8 0 01-5-.5z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconPackage({ className = "h-3.5 w-3.5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden>
      <path d="M4 8.5L12 4l8 4.5v7L12 20l-8-4.5v-7z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 4v16M4 8.5l8 4.5 8-4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconCommand({ className = "h-3.5 w-3.5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden>
      <path d="M8 8h8M8 16h8M9.5 8A2.5 2.5 0 117 5.5 2.5 2.5 0 019.5 8zm0 8A2.5 2.5 0 117 13.5 2.5 2.5 0 019.5 16zM17 8a2.5 2.5 0 112.5 2.5A2.5 2.5 0 0117 8zm0 8a2.5 2.5 0 112.5 2.5A2.5 2.5 0 0117 16z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconClock({ className = "h-3.5 w-3.5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l3 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function roleClass(type: ChatEntry["type"]): string {
  if (type === "user") {
    return "aurora-chat-bubble aurora-chat-user";
  }
  if (type === "assistant") {
    return "aurora-chat-bubble aurora-chat-assistant";
  }
  if (type === "artifact-note") {
    return "aurora-chat-bubble aurora-chat-artifact";
  }
  return "aurora-chat-bubble aurora-chat-system";
}

function modelClass(source: ModelSource): string {
  if (source === "OPENAI") {
    return "border-indigo-200/50 bg-indigo-400/18 text-indigo-50";
  }
  if (source === "MOCK") {
    return "border-slate-400/40 bg-slate-700/30 text-slate-100";
  }
  return "border-indigo-200/20 bg-slate-900/70 text-slate-300";
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function dockHeadline(sessionReady: boolean, status: string): string {
  if (!sessionReady) {
    return "Start a session to open the live conversation.";
  }
  if (status === "running") {
    return "Aurora is responding. New notes and prompts will appear here.";
  }
  if (status === "wait_user") {
    return "Aurora is waiting for your next instruction.";
  }
  if (status === "failed") {
    return "The last step needs your input before continuing.";
  }
  if (status === "completed") {
    return "The package is ready and the final notes are shown here.";
  }
  return "This panel keeps the live back-and-forth with Aurora in view.";
}

function dockTitle(sessionReady: boolean): string {
  if (!sessionReady) {
    return "Talk with Aurora";
  }
  return "Talk with Aurora";
}

function presenceLabel(sessionReady: boolean, status: string): string {
  if (!sessionReady) {
    return "Unformed";
  }
  if (status === "running") {
    return "Attuned";
  }
  if (status === "wait_user") {
    return "Awaiting Input";
  }
  if (status === "completed") {
    return "Resolved";
  }
  if (status === "failed") {
    return "Disrupted";
  }
  return "Guided";
}

export function ChatDock({
  entries,
  artifacts,
  queuedCommands,
  shouldQueueIntervention,
  busy,
  sessionReady,
  defaultTab,
  showArtifactsTab = false,
  status = "idle",
  modelSource = "UNKNOWN",
  usageSummary = null,
  actionHub,
  onSendChat,
  onRunGuidedAction,
  onExecuteSlash,
  onForceQueued,
  onDiscardQueued
}: ChatDockProps) {
  const initialTab = defaultTab === "artifacts" && showArtifactsTab ? "artifacts" : "chat";
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [input, setInput] = useState("");
  const [commandNotice, setCommandNotice] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [isComposing, setIsComposing] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const currentTab = activeTab === "artifacts" && !showArtifactsTab ? "chat" : activeTab;
  const slashMatches = useMemo(() => {
    return filterSlashCommands(input).slice(0, 10);
  }, [input]);
  const showSlashPopover = currentTab === "chat" && input.trim().startsWith("/") && slashMatches.length > 0;
  const selectedCommand = showSlashPopover ? slashMatches[highlightIndex] : null;
  const primaryAction = actionHub?.primaryAction ?? null;
  const secondaryAction = actionHub?.secondaryAction ?? null;
  const preSessionHint = primaryAction?.disabled
    ? "Complete the brief, then start the session."
    : "The brief is ready. Start the session.";
  const tokenTotal = usageSummary?.by_type?.openai_tokens_total ?? 0;
  const imageGenerations = usageSummary?.by_type?.openai_image_generations ?? 0;
  const textRequests = usageSummary?.by_type?.openai_text_requests ?? 0;

  useEffect(() => {
    if (currentTab !== "chat") {
      return;
    }
    const viewport = chatScrollRef.current;
    if (!viewport) {
      return;
    }
    viewport.scrollTop = viewport.scrollHeight;
  }, [commandNotice, currentTab, entries]);

  const execute = async (raw: string) => {
    const trimmed = raw.trim();
    const isSlash = trimmed.startsWith("/");
    if (trimmed.length === 0) {
      return;
    }

    setInput("");
    setHighlightIndex(0);
    setCommandNotice("");

    if (!onExecuteSlash) {
      if (isSlash) {
        setCommandNotice("Slash command execution is not configured.");
        return;
      }
      if (!sessionReady) {
        setCommandNotice("Session is required. Run /start first.");
        return;
      }
      if (!onSendChat) {
        setCommandNotice("Chat sender is not configured.");
        return;
      }
      onSendChat(trimmed);
      return;
    }

    try {
      const result = await onExecuteSlash(trimmed);
      if (result.message) {
        setCommandNotice(result.message);
      } else {
        setCommandNotice("");
      }
    } catch (error) {
      setCommandNotice(error instanceof Error ? error.message : "Command failed.");
    }
  };

  return (
    <article
      className={`aurora-panel aurora-dock flex min-h-[30rem] min-w-0 flex-col rounded-[32px] p-3.5 md:p-4 ${
        sessionReady
          ? "aurora-dock-live xl:h-[calc(100dvh-1rem)] xl:max-h-[calc(100dvh-1rem)] xl:min-h-0"
          : "xl:max-h-[calc(100dvh-1rem)]"
      }`}
    >
      {sessionReady ? (
        <div className="aurora-status-pill rounded-[24px] px-3 py-3">
          <div className="flex items-start gap-3">
            <div className="aurora-avatar-shell is-compact shrink-0">
              <div className="aurora-avatar-image">
                <Image
                  src={AURORA_ASSETS.avatarPortrait}
                  alt="Aurora companion visual"
                  fill
                  sizes="(min-width: 1280px) 8rem, (min-width: 768px) 7rem, 24vw"
                  className="object-cover object-[center_18%]"
                  priority
                />
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="aurora-title-label text-[9px] tracking-[0.18em]">Live Conversation</p>
                  <h2 className="aurora-title-primary mt-1 text-[clamp(1.22rem,1.45vw,1.48rem)] leading-[1.02]">
                    {dockTitle(sessionReady)}
                  </h2>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <span className="aurora-presence-chip px-3 text-[10px]">{presenceLabel(sessionReady, status)}</span>
                  <span className={`rounded-full border px-2.5 py-1 text-[9px] uppercase tracking-[0.16em] ${modelClass(modelSource)}`}>
                    {modelSource}
                  </span>
                </div>
              </div>
              <p className="mt-1.5 text-[12px] leading-5 text-slate-300">
                {dockHeadline(sessionReady, status)}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="aurora-status-pill min-h-[5.25rem] rounded-[24px] px-3.5 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <h2 className="aurora-title-primary mt-1 text-[clamp(1.38rem,1.75vw,1.72rem)] leading-[1.04]">
                {dockTitle(sessionReady)}
              </h2>
              <p className="mt-1.5 max-w-[17rem] text-[11px] leading-5 text-slate-300">
                {dockHeadline(sessionReady, status)}
              </p>
            </div>
          </div>
        </div>
      )}

      {!sessionReady ? (
        <div className="aurora-oracle-card mt-2.5 rounded-[24px] px-3.5 py-3">
          <div className="flex items-center gap-3">
            <div className="aurora-avatar-shell shrink-0" style={{ width: "8.5rem" }}>
              <div className="aurora-avatar-image">
                <Image
                  src={AURORA_ASSETS.avatarPortrait}
                  alt="Aurora companion visual"
                  fill
                  sizes="(min-width: 1280px) 10rem, (min-width: 768px) 8.5rem, 42vw"
                  className="object-cover object-[center_18%]"
                  priority
                />
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="aurora-title-primary text-[1.2rem] leading-[1.02]">Aurora</h3>
                <span className="aurora-presence-chip px-3 text-[10px]">{presenceLabel(sessionReady, status)}</span>
              </div>
              <p className="mt-2 text-[12px] leading-5 text-slate-300">
                Start the session and Aurora&apos;s replies will appear here.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {showArtifactsTab ? (
        <div className="mt-2.5 flex flex-wrap gap-2">
          <button
            className={`aurora-pill rounded-full px-3 py-1.5 text-[11px] uppercase tracking-[0.15em] ${
              currentTab === "chat" ? "aurora-pill-active" : ""
            }`}
            onClick={() => setActiveTab("chat")}
          >
            <span className="flex items-center gap-1.5">
              <IconChat className="h-3 w-3" />
              Chat
            </span>
          </button>
          <button
            className={`aurora-pill rounded-full px-3 py-1.5 text-[11px] uppercase tracking-[0.15em] ${
              currentTab === "artifacts" ? "aurora-pill-active" : ""
            }`}
            onClick={() => setActiveTab("artifacts")}
          >
            <span className="flex items-center gap-1.5">
              <IconPackage className="h-3 w-3" />
              Package
            </span>
          </button>
        </div>
      ) : null}

      {actionHub ? (
        sessionReady ? (
          <div className="aurora-action-hub aurora-surface-soft mt-2 shrink-0 rounded-[22px] px-3 py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="aurora-title-label flex items-center gap-1.5 text-[9px] tracking-[0.2em]">
                  <IconCommand className="h-3 w-3" />
                  Next Action
                </p>
                <p className="mt-1 text-[12px] leading-5 text-slate-200">{actionHub.hint}</p>
              </div>
              <p className="aurora-command-chip rounded-full px-3 py-1.5 text-[11px] font-semibold text-indigo-50">
                {actionHub.suggestedCommand || "/help"}
              </p>
            </div>

            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {primaryAction ? (
                <button
                  className="aurora-btn-cta rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-60"
                  onClick={() => {
                    if (!onRunGuidedAction) {
                      return;
                    }
                    void onRunGuidedAction(primaryAction.id);
                  }}
                  disabled={busy || primaryAction.disabled || !onRunGuidedAction}
                  title={primaryAction.disabledReason}
                >
                  {primaryAction.label}
                </button>
              ) : null}
              {secondaryAction ? (
                <button
                  className="aurora-btn-secondary rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-60"
                  onClick={() => {
                    if (!onRunGuidedAction) {
                      return;
                    }
                    void onRunGuidedAction(secondaryAction.id);
                  }}
                  disabled={busy || secondaryAction.disabled || !onRunGuidedAction}
                  title={secondaryAction.disabledReason}
                >
                  {secondaryAction.label}
                </button>
              ) : null}
            </div>

            <div className="mt-2 flex flex-wrap gap-2">
              <div className="rounded-full border border-indigo-200/22 bg-slate-950/45 px-3 py-1.5 text-[11px] text-slate-100">
                {tokenTotal.toLocaleString()} tokens · {textRequests.toLocaleString()} text calls · {imageGenerations.toLocaleString()} images
              </div>
              <div className="rounded-full border border-indigo-200/18 bg-slate-950/36 px-3 py-1.5 text-[11px] text-slate-300">
                {actionHub.suggestedReason}
              </div>
            </div>
          </div>
        ) : (
          <div className="aurora-action-hub mt-2 rounded-[22px] px-3.5 py-3">
            <p className="aurora-title-label flex items-center gap-1.5 text-[9px] tracking-[0.2em]">
              <IconCommand className="h-3 w-3" />
              Start Here
            </p>
            <p className="mt-1.5 text-[12px] leading-5 text-slate-200">{preSessionHint}</p>

            <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
              {primaryAction ? (
                <button
                  className="aurora-btn-cta rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-60"
                  onClick={() => {
                    if (!onRunGuidedAction) {
                      return;
                    }
                    void onRunGuidedAction(primaryAction.id);
                  }}
                  disabled={busy || primaryAction.disabled || !onRunGuidedAction}
                  title={primaryAction.disabledReason}
                >
                  {primaryAction.label}
                </button>
              ) : null}
            </div>

            <div className="aurora-command-shell mt-2 rounded-[20px] px-3 py-2.5">
              <p className="aurora-title-label text-[9px] tracking-[0.18em]">Try This First</p>
              <p className="aurora-command-chip mt-2 rounded-[16px] px-3 py-2 text-sm font-semibold text-indigo-50">
                {actionHub.suggestedCommand || "/help"}
              </p>
            </div>
          </div>
        )
      ) : null}

      {queuedCommands.length > 0 ? (
        <div className="mt-2 max-h-40 shrink-0 space-y-2 overflow-auto rounded-[24px] border border-cyan-200/28 bg-cyan-400/8 p-3">
          <p className="aurora-title-label flex items-center gap-1.5 text-[9px] tracking-[0.22em]">
            <IconClock className="h-3 w-3" />
            Queued Commands
          </p>
          {queuedCommands.map((queueItem) => (
            <div key={queueItem.id} className="aurora-surface-soft rounded-[18px] p-3">
              <p className="text-sm text-cyan-50">{queueItem.label}</p>
              <div className="mt-3 flex gap-2">
                <button
                  className="aurora-btn-primary rounded-full px-3 py-1.5 text-[11px] font-semibold"
                  onClick={() => onForceQueued(queueItem.id)}
                >
                  Force Replan
                </button>
                <button
                  className="aurora-btn-ghost rounded-full px-3 py-1.5 text-[11px]"
                  onClick={() => onDiscardQueued(queueItem.id)}
                >
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {currentTab === "chat" && !sessionReady ? (
        <div className="aurora-chat-track mt-2 rounded-[22px] p-3">
          <p className="aurora-title-label text-[9px] tracking-[0.18em]">Conversation</p>
          <p className="mt-2 text-[13px] leading-6 text-slate-200">
            Once the session starts, Aurora&apos;s replies, queued notes, and next steps will appear here.
          </p>
        </div>
      ) : null}

      {currentTab === "chat" && sessionReady ? (
        <div className="mt-2 flex min-h-0 flex-1 flex-col gap-1.5">
          <div className="aurora-chat-track min-h-0 flex-1 overflow-hidden rounded-[22px] p-2.5">
            <div ref={chatScrollRef} className="h-full space-y-2.5 overflow-auto pr-1">
              {sessionReady ? (
                <div
                  className={`aurora-safety-banner rounded-[18px] border px-3 py-2 text-[11px] ${
                    shouldQueueIntervention
                      ? "border-cyan-200/34 bg-cyan-500/10 text-cyan-50"
                      : "border-indigo-200/28 bg-indigo-400/10 text-indigo-50"
                  }`}
                >
                  {shouldQueueIntervention ? "Queued: the next stage boundary applies the note." : "Safe: this note can be applied immediately."}
                </div>
              ) : null}
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className={`flex ${entry.type === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div className={`max-w-[88%] p-2.5 text-xs ${roleClass(entry.type)}`}>
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <p className="aurora-copy-soft uppercase tracking-wide">
                        {entry.type === "user" ? "You" : entry.type === "assistant" ? "Aurora" : entry.type}
                      </p>
                      <p className="text-[10px] text-slate-400/90">{formatTime(entry.createdAt)}</p>
                    </div>
                    {entry.imageUrl ? (
                      <div className="mb-2 overflow-hidden rounded-[16px] border border-indigo-200/20 bg-slate-950/40">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={entry.imageUrl} alt={entry.content} className="block h-auto w-full object-cover" />
                      </div>
                    ) : null}
                    {entry.subtitle ? <p className="aurora-copy-soft mb-1 text-[10px]">{entry.subtitle}</p> : null}
                    <p className="aurora-copy whitespace-pre-wrap">{entry.content}</p>
                  </div>
                </div>
              ))}
              {entries.length === 0 ? <p className="aurora-copy-soft text-sm">Aurora is ready for the next message.</p> : null}
            </div>
          </div>

          <div className="aurora-composer-shell shrink-0 space-y-1.5 rounded-[22px] p-2.5">
            <p className="aurora-title-label text-[9px] tracking-[0.18em]">Message Aurora</p>
            {commandNotice ? (
              <div className="aurora-surface-soft rounded-[18px] px-3 py-2 text-[11px] text-slate-300">
                <pre className="whitespace-pre-wrap font-sans">{commandNotice}</pre>
              </div>
            ) : null}

            <div className="relative">
              <textarea
                className="aurora-input min-h-[60px] w-full rounded-[22px] px-3 py-3 text-sm"
                placeholder='Type a note or use "/?" for commands.'
                value={input}
                onChange={(event) => {
                  setInput(event.target.value);
                  setHighlightIndex(0);
                }}
                onCompositionStart={() => setIsComposing(true)}
                onCompositionEnd={() => setIsComposing(false)}
                onKeyDown={(event) => {
                  if (isComposing) {
                    return;
                  }

                  if (showSlashPopover && event.key === "ArrowDown") {
                    event.preventDefault();
                    setHighlightIndex((value) => (value + 1) % slashMatches.length);
                    return;
                  }

                  if (showSlashPopover && event.key === "ArrowUp") {
                    event.preventDefault();
                    setHighlightIndex((value) => (value - 1 + slashMatches.length) % slashMatches.length);
                    return;
                  }

                  if (event.key === "Escape") {
                    setInput("");
                    setHighlightIndex(0);
                    return;
                  }

                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    if (showSlashPopover && selectedCommand) {
                      void execute(selectedCommand.canonical);
                      return;
                    }
                    void execute(input);
                  }
                }}
              />

              {showSlashPopover ? (
                <div className="absolute bottom-[calc(100%+0.45rem)] left-0 right-0 z-20 max-h-56 overflow-auto rounded-[20px] border border-cyan-100/34 bg-[linear-gradient(180deg,rgba(44,63,154,0.96)_0%,rgba(12,18,58,0.98)_44%,rgba(5,9,28,0.99)_100%)] p-1.5 shadow-[0_28px_70px_-28px_rgba(102,157,255,0.92),0_18px_36px_-22px_rgba(255,191,122,0.48)] backdrop-blur-xl">
                  <div className="px-2.5 pb-1.5 pt-1 text-[10px] uppercase tracking-[0.2em] text-cyan-50/78">Slash commands</div>
                  {slashMatches.map((command, index) => (
                    <button
                      key={`${command.id}_${command.canonical}`}
                      className={`w-full rounded-[14px] px-2.5 py-2 text-left text-xs ${
                        index === highlightIndex
                          ? "border border-cyan-100/38 bg-[linear-gradient(100deg,rgba(92,178,255,0.24)_0%,rgba(112,118,255,0.22)_52%,rgba(211,149,255,0.18)_100%)] text-indigo-50"
                          : "border border-transparent bg-slate-950/18 text-slate-100 hover:bg-slate-900/58"
                      }`}
                      onMouseEnter={() => setHighlightIndex(index)}
                      onClick={() => void execute(command.canonical)}
                    >
                      <p className="font-semibold">{command.canonical}</p>
                      <p className="mt-1 text-[11px] text-slate-300">{command.help}</p>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <button
              className="aurora-btn-primary aurora-btn-command aurora-btn-cta w-full rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-60"
              onClick={() => void execute(input)}
              disabled={busy || input.trim().length === 0}
            >
              Send to Aurora {busy ? "(processing)" : ""}
            </button>
          </div>
        </div>
      ) : null}

      {currentTab === "artifacts" ? (
        <div className="aurora-surface mt-3 min-h-0 flex-1 overflow-auto rounded-[24px] p-3">
          <div className="space-y-2">
            {artifacts.map((artifact) => (
              <div key={artifact.id} className="aurora-surface-soft rounded-[18px] p-3 text-xs">
                <p className="font-semibold text-indigo-100">{artifact.title}</p>
                <p className="mt-1 text-slate-400">{artifact.kind}</p>
                <p className="mt-1 text-[11px] text-slate-400">{formatTime(artifact.created_at)}</p>
              </div>
            ))}
            {artifacts.length === 0 ? <p className="text-xs text-slate-400">Package outputs are not ready yet.</p> : null}
          </div>
        </div>
      ) : null}
    </article>
  );
}
