"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
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
  RightPanelViewModel
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

function formatStatusLabel(value: string): string {
  return value.replaceAll("_", " ");
}

function dockHeadline(sessionReady: boolean, status: string): string {
  if (!sessionReady) {
    return "Waiting for direction";
  }
  if (status === "running") {
    return "Flow is in motion";
  }
  if (status === "wait_user") {
    return "Direction lock pending";
  }
  if (status === "failed") {
    return "Intervention required";
  }
  if (status === "completed") {
    return "Package is ready";
  }
  return "Command channel is live";
}

function dockTitle(sessionReady: boolean): string {
  if (!sessionReady) {
    return "Waiting for direction";
  }
  return "Aurora";
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
  const currentTab = activeTab === "artifacts" && !showArtifactsTab ? "chat" : activeTab;
  const slashMatches = useMemo(() => {
    return filterSlashCommands(input).slice(0, 10);
  }, [input]);
  const showSlashPopover = currentTab === "chat" && input.trim().startsWith("/") && slashMatches.length > 0;
  const selectedCommand = showSlashPopover ? slashMatches[highlightIndex] : null;
  const primaryAction = actionHub?.primaryAction ?? null;
  const secondaryAction = actionHub?.secondaryAction ?? null;
  const statusLabel = formatStatusLabel(status);

  const execute = async (raw: string) => {
    const trimmed = raw.trim();
    const isSlash = trimmed.startsWith("/");
    if (trimmed.length === 0) {
      return;
    }

    if (!onExecuteSlash) {
      if (isSlash) {
        setCommandNotice("Slash command execution is not configured.");
        setInput("");
        setHighlightIndex(0);
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
      setInput("");
      return;
    }

    const result = await onExecuteSlash(trimmed);
    if (result.message) {
      setCommandNotice(result.message);
    } else {
      setCommandNotice("");
    }
    if (isSlash || result.accepted) {
      setInput("");
      setHighlightIndex(0);
    }
  };

  return (
    <article className="aurora-panel aurora-dock flex max-h-[calc(100vh-2rem)] min-h-[42rem] flex-col rounded-[32px] p-4 md:p-5">
      <div className="aurora-status-pill rounded-[26px] px-4 py-3">
        <div className={`flex items-start justify-between gap-3 ${sessionReady ? "flex-row-reverse" : ""}`}>
          <div className={`flex-1 ${sessionReady ? "text-right" : ""}`}>
            <p className="aurora-title-label text-[10px] tracking-[0.24em]">
              {sessionReady ? "Conversation Window" : "Companion Dock"}
            </p>
            <h2 className="aurora-title-primary mt-2 text-[clamp(1.3rem,1.8vw,1.7rem)] leading-[1.06]">
              {dockTitle(sessionReady)}
            </h2>
            <p className="mt-1 text-xs text-slate-300">{dockHeadline(sessionReady, status)}</p>
          </div>
          <span className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.15em] ${modelClass(modelSource)}`}>
            {modelSource}
          </span>
        </div>
      </div>

      <div className="aurora-oracle-card mt-3 rounded-[28px] px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <p className="aurora-title-label text-[10px] tracking-[0.22em]">{statusLabel}</p>
          <span className="aurora-presence-chip">{presenceLabel(sessionReady, status)}</span>
        </div>

        <div className="mt-4 flex flex-col items-center text-center">
          <div className="aurora-avatar-shell">
            <div className="aurora-avatar-image">
              <Image
                src={AURORA_ASSETS.avatarPortrait}
                alt="Aurora companion visual"
                fill
                sizes="(min-width: 1280px) 18rem, (min-width: 768px) 24rem, 64vw"
                className="object-cover object-[center_18%]"
                priority
              />
            </div>
          </div>
          {!sessionReady ? <h3 className="aurora-title-primary mt-5 text-[1.8rem] leading-none">Aurora</h3> : null}
          <p className={`text-sm text-slate-300 ${sessionReady ? "mt-4" : "mt-2"}`}>
            {sessionReady
              ? "Queued notes and scene guidance stay synchronized with the active flow."
              : "Start a session to form the live command state."}
          </p>
        </div>
      </div>

      {showArtifactsTab ? (
        <div className="mt-3 flex flex-wrap gap-2">
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
        <div className="aurora-action-hub mt-3 rounded-[24px] px-4 py-4">
          <p className="aurora-title-label flex items-center gap-1.5 text-[10px] tracking-[0.24em]">
            <IconCommand className="h-3 w-3" />
            Next Action
          </p>
          <p className="mt-2 text-sm text-slate-200">{actionHub.hint}</p>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
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

          <div className="aurora-command-shell mt-3 rounded-[20px] px-3 py-3">
            <p className="aurora-title-label text-[10px] tracking-[0.18em]">Queued Intention</p>
            <p className="aurora-command-chip mt-2 rounded-[16px] px-3 py-2 text-sm font-semibold text-indigo-50">
              {actionHub.suggestedCommand || "/help"}
            </p>
            <p className="mt-2 text-[11px] text-slate-300">{actionHub.suggestedReason}</p>
          </div>
        </div>
      ) : null}

      {queuedCommands.length > 0 ? (
        <div className="mt-3 space-y-2 rounded-[24px] border border-cyan-200/28 bg-cyan-400/8 p-3">
          <p className="aurora-title-label flex items-center gap-1.5 text-[10px] tracking-[0.22em]">
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

      {currentTab === "chat" ? (
        <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3">
          <div className="aurora-chat-track min-h-0 flex-1 overflow-hidden rounded-[24px] p-3">
            <div className="h-full space-y-2.5 overflow-auto pr-1">
              <div
                className={`aurora-safety-banner rounded-[18px] border px-3 py-2 text-[11px] ${
                  shouldQueueIntervention
                    ? "border-cyan-200/34 bg-cyan-500/10 text-cyan-50"
                    : "border-indigo-200/28 bg-indigo-400/10 text-indigo-50"
                }`}
              >
                {shouldQueueIntervention ? "Queued: next stage boundary applies the note." : "Safe: current stage accepts the note immediately."}
              </div>
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className={`flex ${entry.type === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div className={`max-w-[88%] p-3 text-xs ${roleClass(entry.type)}`}>
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <p className="aurora-copy-soft uppercase tracking-wide">
                        {entry.type === "user" ? "You" : entry.type === "assistant" ? "Aurora" : entry.type}
                      </p>
                      <p className="text-[10px] text-slate-400/90">{formatTime(entry.createdAt)}</p>
                    </div>
                    {entry.subtitle ? <p className="aurora-copy-soft mb-1 text-[10px]">{entry.subtitle}</p> : null}
                    <p className="aurora-copy whitespace-pre-wrap">{entry.content}</p>
                  </div>
                </div>
              ))}
              {entries.length === 0 ? <p className="aurora-copy-soft text-sm">No chat history yet.</p> : null}
            </div>
          </div>

          <div className="aurora-composer-shell space-y-3 rounded-[24px] p-3">
            <p className="aurora-title-label text-[10px] tracking-[0.18em]">Command Composer</p>
            {commandNotice ? (
              <div className="aurora-surface-soft rounded-[18px] px-3 py-2 text-[11px] text-slate-300">
                <pre className="whitespace-pre-wrap font-sans">{commandNotice}</pre>
              </div>
            ) : null}

            <div className="relative">
              <textarea
                className="aurora-input min-h-[96px] w-full rounded-[22px] px-3 py-3 text-sm"
                placeholder='Type "/?" for commands or send natural language.'
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
                <div className="absolute bottom-[calc(100%+0.45rem)] left-0 right-0 z-20 max-h-56 overflow-auto rounded-[20px] border border-indigo-200/28 bg-slate-950/96 p-1.5 shadow-xl">
                  {slashMatches.map((command, index) => (
                    <button
                      key={`${command.id}_${command.canonical}`}
                      className={`w-full rounded-[14px] px-2.5 py-2 text-left text-xs ${
                        index === highlightIndex
                          ? "border border-indigo-200/38 bg-indigo-400/18 text-indigo-50"
                          : "border border-transparent text-slate-200 hover:bg-slate-800/70"
                      }`}
                      onMouseEnter={() => setHighlightIndex(index)}
                      onClick={() => void execute(command.canonical)}
                    >
                      <p className="font-semibold">{command.canonical}</p>
                      <p className="mt-1 text-[11px] text-slate-400">{command.help}</p>
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
              Send Command {busy ? "(processing)" : ""}
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
