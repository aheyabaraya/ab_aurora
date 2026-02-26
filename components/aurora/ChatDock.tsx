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

function roleClass(type: ChatEntry["type"]): string {
  if (type === "user") {
    return "border-violet-200/55 bg-violet-400/18";
  }
  if (type === "assistant") {
    return "border-indigo-200/35 bg-indigo-400/12";
  }
  if (type === "artifact-note") {
    return "border-cyan-200/35 bg-cyan-400/12";
  }
  return "border-slate-400/35 bg-slate-400/12";
}

function statusClass(status: string): string {
  if (status === "completed") {
    return "border-indigo-200/65 bg-indigo-300/20 text-indigo-50";
  }
  if (status === "running") {
    return "border-violet-200/70 bg-violet-400/20 text-violet-50";
  }
  if (status === "wait_user") {
    return "border-cyan-200/70 bg-cyan-400/20 text-cyan-50";
  }
  if (status === "failed") {
    return "border-rose-300/60 bg-rose-400/15 text-rose-100";
  }
  return "border-indigo-200/28 bg-slate-900/70 text-slate-300";
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

  const normalizedInput = input.trim().toLowerCase();
  const showRuntimeCommands = normalizedInput.startsWith("/runtime");
  const slashMatches = useMemo(() => {
    return filterSlashCommands(input)
      .filter((command) => showRuntimeCommands || command.category !== "runtime")
      .slice(0, 10);
  }, [input, showRuntimeCommands]);
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
    <article className="aurora-panel flex max-h-[calc(100vh-2.2rem)] min-h-[38rem] flex-col rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="aurora-title-label text-xs uppercase tracking-[0.2em]">Chat Dock</p>
          <h2 className="aurora-title-primary text-lg font-semibold">Command Console</h2>
        </div>
        <div className="mt-1 flex flex-wrap gap-2">
          <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.15em] ${statusClass(status)}`}>
            {status}
          </span>
          <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.15em] ${modelClass(modelSource)}`}>
            {modelSource}
          </span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className={`aurora-pill rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.15em] ${
            currentTab === "chat" ? "aurora-pill-active" : ""
          }`}
          onClick={() => setActiveTab("chat")}
        >
          Chat
        </button>
        {showArtifactsTab ? (
          <button
            className={`aurora-pill rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.15em] ${
              currentTab === "artifacts" ? "aurora-pill-active" : ""
            }`}
            onClick={() => setActiveTab("artifacts")}
          >
            Package Outputs
          </button>
        ) : null}
      </div>

      {actionHub ? (
        <div className="aurora-surface mt-3 rounded-xl p-3">
          <p className="aurora-title-label text-[11px] uppercase tracking-[0.2em]">Next Suggested Command</p>
          <p className="mt-2 rounded-md border border-indigo-200/45 bg-indigo-400/18 px-2 py-1 text-sm font-semibold text-indigo-50">
            {actionHub.suggestedCommand || "/help"}
          </p>
          <p className="mt-2 text-[11px] text-slate-300/95">{actionHub.suggestedReason || actionHub.hint}</p>
        </div>
      ) : null}

      {queuedCommands.length > 0 ? (
        <div className="mt-3 space-y-2 rounded-xl border border-cyan-200/35 bg-cyan-400/10 p-2">
          <p className="aurora-title-label text-[11px] uppercase tracking-[0.2em]">Queued</p>
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
        <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3">
          <div className="aurora-surface min-h-0 flex-1 overflow-hidden rounded-xl p-2">
            <div className="h-full space-y-2 overflow-auto">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className={`flex ${entry.type === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div className={`max-w-[88%] rounded-md border p-2 text-xs ${roleClass(entry.type)}`}>
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <p className="uppercase tracking-wide text-slate-300">{entry.type}</p>
                      <p className="text-[10px] text-slate-400">{formatTime(entry.createdAt)}</p>
                    </div>
                    {entry.subtitle ? <p className="mb-1 text-[10px] text-slate-400">{entry.subtitle}</p> : null}
                    <p className="whitespace-pre-wrap text-slate-100">{entry.content}</p>
                  </div>
                </div>
              ))}
              {entries.length === 0 ? <p className="text-xs text-slate-400">No chat history yet.</p> : null}
            </div>
          </div>

          <div className="space-y-2">
            <div
              className={`rounded-lg border px-3 py-2 text-[11px] ${
                shouldQueueIntervention
                  ? "border-cyan-200/45 bg-cyan-500/10 text-cyan-50"
                  : "border-indigo-200/40 bg-indigo-400/15 text-indigo-50"
              }`}
            >
              {shouldQueueIntervention ? "Queued: 다음 stage 시작 시 적용됩니다." : "Safe: 현재 stage에 바로 반영됩니다."}
            </div>

            {commandNotice ? (
              <div className="aurora-surface-soft rounded-lg px-3 py-2 text-[11px] text-slate-300">
                <pre className="whitespace-pre-wrap font-sans">{commandNotice}</pre>
              </div>
            ) : null}

            <div className="relative">
              <textarea
                className="aurora-input min-h-[74px] w-full rounded-lg px-3 py-2 text-sm"
                placeholder='Type "/" for commands or send natural language.'
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
                <div className="absolute bottom-[calc(100%+0.45rem)] left-0 right-0 z-20 max-h-56 overflow-auto rounded-lg border border-indigo-200/35 bg-slate-950/95 p-1 shadow-xl">
                  {slashMatches.map((command, index) => (
                    <button
                      key={`${command.id}_${command.canonical}`}
                      className={`w-full rounded-md px-2 py-2 text-left text-xs ${
                        index === highlightIndex
                          ? "border border-indigo-200/45 bg-indigo-400/20 text-indigo-50"
                          : "border border-transparent text-slate-200 hover:bg-slate-800/80"
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
              className="aurora-btn-primary w-full rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-60"
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
