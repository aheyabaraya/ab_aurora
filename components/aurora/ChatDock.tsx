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
  status?: string;
  modelSource?: ModelSource;
  actionHub?: RightPanelViewModel | null;
  onSendChat?: (message: string) => void;
  onQuickAction?: (actionId: QuickActionId) => void;
  onExecuteSlash?: (raw: string) => Promise<CommandExecutionResult>;
  onSwitchUiMode?: (mode: "guided" | "pro") => void;
  onForceQueued: (queueId: string) => void;
  onDiscardQueued: (queueId: string) => void;
};

function roleClass(type: ChatEntry["type"]): string {
  if (type === "user") {
    return "border-cyan-300/40 bg-cyan-500/10";
  }
  if (type === "assistant") {
    return "border-slate-700 bg-slate-900/70";
  }
  if (type === "artifact-note") {
    return "border-emerald-300/40 bg-emerald-500/10";
  }
  return "border-amber-300/40 bg-amber-400/10";
}

function statusClass(status: string): string {
  if (status === "completed") {
    return "border-emerald-300/60 bg-emerald-400/15 text-emerald-100";
  }
  if (status === "running") {
    return "border-cyan-300/60 bg-cyan-400/15 text-cyan-100";
  }
  if (status === "wait_user") {
    return "border-amber-300/60 bg-amber-400/15 text-amber-100";
  }
  if (status === "failed") {
    return "border-rose-300/60 bg-rose-400/15 text-rose-100";
  }
  return "border-slate-700 bg-slate-900/70 text-slate-300";
}

function modelClass(source: ModelSource): string {
  if (source === "OPENAI") {
    return "border-cyan-300/60 bg-cyan-400/15 text-cyan-100";
  }
  if (source === "MOCK") {
    return "border-slate-500 bg-slate-700/40 text-slate-200";
  }
  return "border-slate-700 bg-slate-900/70 text-slate-400";
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
  jobs,
  queuedCommands,
  shouldQueueIntervention,
  busy,
  sessionReady,
  guided,
  defaultTab,
  status = "idle",
  modelSource = "UNKNOWN",
  actionHub,
  onSendChat,
  onExecuteSlash,
  onSwitchUiMode,
  onForceQueued,
  onDiscardQueued
}: ChatDockProps) {
  const [activeTab, setActiveTab] = useState<TabId>(defaultTab);
  const [input, setInput] = useState("");
  const [commandNotice, setCommandNotice] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [isComposing, setIsComposing] = useState(false);

  const slashMatches = useMemo(() => filterSlashCommands(input).slice(0, 10), [input]);
  const showSlashPopover = activeTab === "chat" && input.trim().startsWith("/") && slashMatches.length > 0;
  const selectedCommand = showSlashPopover ? slashMatches[highlightIndex] : null;

  const execute = async (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      return;
    }

    if (!onExecuteSlash) {
      if (trimmed.startsWith("/")) {
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
      setInput("");
      return;
    }

    const result = await onExecuteSlash(trimmed);
    if (result.message) {
      setCommandNotice(result.message);
    } else {
      setCommandNotice("");
    }
    if (result.accepted) {
      setInput("");
      setHighlightIndex(0);
    }
  };

  const handleJobsTabClick = () => {
    if (guided) {
      onSwitchUiMode?.("pro");
      return;
    }
    setActiveTab("jobs");
  };

  return (
    <article className="flex max-h-[calc(100vh-2.2rem)] min-h-[38rem] flex-col rounded-2xl border border-cyan-300/20 bg-slate-950/55 p-4 backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Chat Dock</p>
          <h2 className="text-lg font-semibold text-cyan-100">Command Console</h2>
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
          className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.15em] ${
            activeTab === "chat" ? "border-cyan-300/70 bg-cyan-500/20 text-cyan-100" : "border-slate-700 text-slate-300"
          }`}
          onClick={() => setActiveTab("chat")}
        >
          Chat
        </button>
        <button
          className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.15em] ${
            activeTab === "artifacts"
              ? "border-cyan-300/70 bg-cyan-500/20 text-cyan-100"
              : "border-slate-700 text-slate-300"
          }`}
          onClick={() => setActiveTab("artifacts")}
        >
          Artifacts
        </button>
        <button
          className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.15em] ${
            !guided && activeTab === "jobs"
              ? "border-cyan-300/70 bg-cyan-500/20 text-cyan-100"
              : "border-slate-700 text-slate-300"
          }`}
          onClick={handleJobsTabClick}
        >
          {guided ? "Jobs (Pro)" : "Jobs"}
        </button>
      </div>

      {actionHub ? (
        <div className="mt-3 rounded-xl border border-cyan-300/25 bg-slate-900/70 p-3">
          <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-200">Next Suggested Command</p>
          <p className="mt-2 rounded-md border border-cyan-300/35 bg-cyan-500/10 px-2 py-1 text-sm font-semibold text-cyan-100">
            {actionHub.suggestedCommand || "/help"}
          </p>
          <p className="mt-2 text-[11px] text-slate-300">{actionHub.suggestedReason || actionHub.hint}</p>
        </div>
      ) : null}

      {queuedCommands.length > 0 ? (
        <div className="mt-3 space-y-2 rounded-xl border border-amber-300/35 bg-amber-500/10 p-2">
          <p className="text-[11px] uppercase tracking-[0.2em] text-amber-100">Queued</p>
          {queuedCommands.map((queueItem) => (
            <div key={queueItem.id} className="rounded-md border border-amber-300/30 bg-slate-950/40 p-2">
              <p className="text-xs text-amber-50">{queueItem.label}</p>
              <div className="mt-2 flex gap-2">
                <button
                  className="rounded-md border border-amber-300/60 px-2 py-1 text-[11px] font-semibold text-amber-100 hover:bg-amber-400/15"
                  onClick={() => onForceQueued(queueItem.id)}
                >
                  Force Replan
                </button>
                <button
                  className="rounded-md border border-slate-600 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-800"
                  onClick={() => onDiscardQueued(queueItem.id)}
                >
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {activeTab === "chat" ? (
        <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3">
          <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-700 bg-slate-900/50 p-2">
            <div className="h-full space-y-2 overflow-auto">
              {entries.map((entry) => (
                <div key={entry.id} className={`rounded-md border p-2 text-xs ${roleClass(entry.type)}`}>
                  <div className="mb-1 flex items-center justify-between">
                    <p className="uppercase tracking-wide text-slate-300">{entry.type}</p>
                    <p className="text-[10px] text-slate-400">{formatTime(entry.createdAt)}</p>
                  </div>
                  {entry.subtitle ? <p className="mb-1 text-[10px] text-slate-400">{entry.subtitle}</p> : null}
                  <p className="whitespace-pre-wrap text-slate-100">{entry.content}</p>
                </div>
              ))}
              {entries.length === 0 ? <p className="text-xs text-slate-400">No chat history yet.</p> : null}
            </div>
          </div>

          <div className="space-y-2">
            <div
              className={`rounded-lg border px-3 py-2 text-[11px] ${
                shouldQueueIntervention
                  ? "border-amber-300/45 bg-amber-500/10 text-amber-100"
                  : "border-cyan-300/35 bg-cyan-500/10 text-cyan-100"
              }`}
            >
              {shouldQueueIntervention ? "Queued: 다음 stage 시작 시 적용됩니다." : "Safe: 현재 stage에 바로 반영됩니다."}
            </div>

            {commandNotice ? (
              <div className="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-[11px] text-slate-300">
                <pre className="whitespace-pre-wrap font-sans">{commandNotice}</pre>
              </div>
            ) : null}

            <div className="relative">
              <textarea
                className="min-h-[74px] w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
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
                <div className="absolute bottom-[calc(100%+0.45rem)] left-0 right-0 z-20 max-h-56 overflow-auto rounded-lg border border-cyan-300/25 bg-slate-950/95 p-1 shadow-xl">
                  {slashMatches.map((command, index) => (
                    <button
                      key={`${command.id}_${command.canonical}`}
                      className={`w-full rounded-md px-2 py-2 text-left text-xs ${
                        index === highlightIndex ? "bg-cyan-500/15 text-cyan-100" : "text-slate-200 hover:bg-slate-800"
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
              className="w-full rounded-lg border border-cyan-300/40 px-3 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-400/10 disabled:opacity-60"
              onClick={() => void execute(input)}
              disabled={busy || input.trim().length === 0}
            >
              Send Command {busy ? "(processing)" : ""}
            </button>
          </div>
        </div>
      ) : null}

      {activeTab === "artifacts" ? (
        <div className="mt-3 min-h-0 flex-1 overflow-auto rounded-xl border border-slate-700 bg-slate-900/50 p-2">
          <div className="space-y-2">
            {artifacts.map((artifact) => (
              <div key={artifact.id} className="rounded-md border border-slate-700 p-2 text-xs">
                <p className="font-semibold text-cyan-100">{artifact.title}</p>
                <p className="text-slate-400">{artifact.kind}</p>
                <p className="text-[11px] text-slate-400">{formatTime(artifact.created_at)}</p>
              </div>
            ))}
            {artifacts.length === 0 ? <p className="text-xs text-slate-400">No artifacts yet.</p> : null}
          </div>
        </div>
      ) : null}

      {!guided && activeTab === "jobs" ? (
        <div className="mt-3 min-h-0 flex-1 overflow-auto rounded-xl border border-slate-700 bg-slate-900/50 p-2">
          <div className="space-y-2">
            {jobs.map((job) => (
              <div key={job.id} className="rounded-md border border-slate-700 p-2 text-xs">
                <p className="font-semibold text-slate-100">{job.step}</p>
                <p className="text-slate-300">{job.status}</p>
                {job.error ? <p className="text-rose-300">{job.error}</p> : null}
              </div>
            ))}
            {jobs.length === 0 ? <p className="text-xs text-slate-400">No jobs yet.</p> : null}
          </div>
        </div>
      ) : null}
    </article>
  );
}
