"use client";

import { useMemo, useState } from "react";
import { filterSlashCommands } from "./slash-commands";
import type {
  ArtifactRecord,
  ChatEntry,
  CommandExecutionResult,
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
    return "border-indigo-200/60 bg-indigo-400/20 text-indigo-50";
  }
  if (source === "MOCK") {
    return "border-slate-500 bg-slate-700/40 text-slate-200";
  }
  return "border-indigo-200/20 bg-slate-900/70 text-slate-400";
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
    <article className="aurora-panel aurora-dock flex max-h-[calc(100vh-2.2rem)] min-h-[38rem] flex-col rounded-2xl p-4">
      <div className="aurora-status-pill flex items-center justify-between gap-2 rounded-xl px-3 py-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold tracking-[0.2em] text-indigo-50">
          <span className="h-3 w-3 rounded-full border border-cyan-100/80 bg-cyan-200/20 shadow-[0_0_10px_rgba(125,224,255,0.6)]" />
          {status.toUpperCase()}
        </span>
        <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.15em] ${modelClass(modelSource)}`}>
          {modelSource}
        </span>
      </div>

      {showArtifactsTab ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            className={`aurora-pill rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.15em] ${
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
            className={`aurora-pill rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.15em] ${
              currentTab === "artifacts" ? "aurora-pill-active" : ""
            }`}
            onClick={() => setActiveTab("artifacts")}
          >
            <span className="flex items-center gap-1.5">
              <IconPackage className="h-3 w-3" />
              Package Outputs
            </span>
          </button>
        </div>
      ) : null}

      {actionHub ? (
        <div className="aurora-command-shell mt-2 rounded-xl px-2.5 py-2">
          <p className="aurora-title-label flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em]">
            <IconCommand className="h-3 w-3" />
            Next
          </p>
          <p className="aurora-command-chip mt-1 rounded-md px-2 py-1 text-sm font-semibold text-indigo-100">
            {actionHub.suggestedCommand || "/help"}
          </p>
        </div>
      ) : null}

      {queuedCommands.length > 0 ? (
        <div className="mt-3 space-y-2 rounded-xl border border-cyan-200/35 bg-cyan-400/10 p-2">
          <p className="aurora-title-label flex items-center gap-1.5 text-[11px] uppercase tracking-[0.2em]">
            <IconClock className="h-3 w-3" />
            Queued
          </p>
          {queuedCommands.map((queueItem) => (
            <div key={queueItem.id} className="aurora-surface-soft rounded-md p-2">
              <p className="text-xs text-cyan-50">{queueItem.label}</p>
              <div className="mt-2 flex gap-2">
                <button
                  className="aurora-btn-primary rounded-md px-2 py-1 text-[11px] font-semibold"
                  onClick={() => onForceQueued(queueItem.id)}
                >
                  Force Replan
                </button>
                <button
                  className="aurora-btn-ghost rounded-md px-2 py-1 text-[11px]"
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
        <div className="mt-2 flex min-h-0 flex-1 flex-col gap-2">
          <div className="aurora-chat-track min-h-0 flex-1 overflow-hidden rounded-xl p-2.5">
            <div className="h-full space-y-2.5 overflow-auto pr-1">
              <div
                className={`aurora-safety-banner rounded-lg border px-3 py-2 text-[11px] ${
                  shouldQueueIntervention
                    ? "border-cyan-200/45 bg-cyan-500/10 text-cyan-50"
                    : "border-indigo-200/40 bg-indigo-400/15 text-indigo-50"
                }`}
              >
                {shouldQueueIntervention ? "Queued: 다음 stage 시작 시 적용됩니다." : "Safe: 현재 stage에 바로 반영됩니다."}
              </div>
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className={`flex ${entry.type === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div className={`max-w-[88%] p-2.5 text-xs ${roleClass(entry.type)}`}>
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <p className="aurora-copy-soft uppercase tracking-wide">
                        {entry.type === "user" ? "You" : entry.type === "assistant" ? "Assistant" : entry.type}
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

          <div className="space-y-2">
            {commandNotice ? (
              <div className="aurora-surface-soft rounded-xl px-3 py-2 text-[11px] text-slate-300">
                <pre className="whitespace-pre-wrap font-sans">{commandNotice}</pre>
              </div>
            ) : null}

            <div className="relative">
              <textarea
                className="aurora-input min-h-[82px] w-full rounded-2xl px-3 py-2.5 text-sm"
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
                <div className="absolute bottom-[calc(100%+0.45rem)] left-0 right-0 z-20 max-h-56 overflow-auto rounded-xl border border-indigo-200/35 bg-slate-950/95 p-1.5 shadow-xl">
                  {slashMatches.map((command, index) => (
                    <button
                      key={`${command.id}_${command.canonical}`}
                      className={`w-full rounded-lg px-2.5 py-2 text-left text-xs ${
                        index === highlightIndex
                          ? "border border-indigo-200/45 bg-indigo-400/20 text-indigo-50"
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
              className="aurora-btn-primary aurora-btn-command w-full rounded-xl px-3 py-2 text-sm font-semibold disabled:opacity-60"
              onClick={() => void execute(input)}
              disabled={busy || input.trim().length === 0}
            >
              Send Command {busy ? "(processing)" : ""}
            </button>
          </div>
        </div>
      ) : null}

      {currentTab === "artifacts" ? (
        <div className="aurora-surface mt-3 min-h-0 flex-1 overflow-auto rounded-xl p-2">
          <div className="space-y-2">
            {artifacts.map((artifact) => (
              <div key={artifact.id} className="aurora-surface-soft rounded-md p-2 text-xs">
                <p className="font-semibold text-indigo-100">{artifact.title}</p>
                <p className="text-slate-400">{artifact.kind}</p>
                <p className="text-[11px] text-slate-400">{formatTime(artifact.created_at)}</p>
              </div>
            ))}
            {artifacts.length === 0 ? <p className="text-xs text-slate-400">Package outputs are not ready yet.</p> : null}
          </div>
        </div>
      ) : null}
    </article>
  );
}
