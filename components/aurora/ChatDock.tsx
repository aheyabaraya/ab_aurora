"use client";

import { useMemo, useState } from "react";
import type { ArtifactRecord, ChatEntry, JobsPayload, QueuedCommand, QuickActionId } from "./types";

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
  onSendChat: (message: string) => void;
  onQuickAction: (actionId: QuickActionId) => void;
  onForceQueued: (queueId: string) => void;
  onDiscardQueued: (queueId: string) => void;
};

const QUICK_ACTIONS: Array<{ id: QuickActionId; label: string }> = [
  { id: "pick_1", label: "Pick #1" },
  { id: "pick_2", label: "Pick #2" },
  { id: "pick_3", label: "Pick #3" },
  { id: "regenerate_top3", label: "Regenerate Top-3" },
  { id: "more_editorial", label: "Make it more editorial" },
  { id: "reduce_futuristic", label: "reduce futuristic" },
  { id: "calmer", label: "calmer" },
  { id: "more_ritual", label: "more ritual" },
  { id: "lock_style", label: "Lock style" }
];

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
  onSendChat,
  onQuickAction,
  onForceQueued,
  onDiscardQueued
}: ChatDockProps) {
  const [activeTab, setActiveTab] = useState<TabId>(defaultTab);
  const [showJobsTab, setShowJobsTab] = useState(!guided);
  const [input, setInput] = useState("");

  const visibleTabs = useMemo(() => {
    const tabs: TabId[] = ["chat", "artifacts"];
    if (showJobsTab) {
      tabs.push("jobs");
    }
    return tabs;
  }, [showJobsTab]);

  const send = () => {
    if (!sessionReady || input.trim().length === 0) {
      return;
    }
    onSendChat(input.trim());
    setInput("");
  };

  return (
    <article className="rounded-2xl border border-cyan-300/20 bg-slate-950/55 p-4 backdrop-blur">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Chat Dock</p>
          <h2 className="text-lg font-semibold text-cyan-100">Intervention Console</h2>
        </div>
        {!showJobsTab ? (
          <button
            className="rounded-md border border-cyan-300/40 px-2 py-1 text-[11px] font-semibold text-cyan-100 hover:bg-cyan-400/10"
            onClick={() => {
              setShowJobsTab(true);
              setActiveTab("jobs");
            }}
          >
            Pro 보기
          </button>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {visibleTabs.map((tab) => (
          <button
            key={tab}
            className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.15em] ${
              activeTab === tab
                ? "border-cyan-300/70 bg-cyan-500/20 text-cyan-100"
                : "border-slate-700 text-slate-300"
            }`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "chat" ? (
        <div className="mt-4 space-y-3">
          {sessionReady ? (
            <div
              className={`rounded-lg border px-3 py-2 text-[11px] ${
                shouldQueueIntervention
                  ? "border-amber-300/45 bg-amber-500/10 text-amber-100"
                  : "border-cyan-300/35 bg-cyan-500/10 text-cyan-100"
              }`}
            >
              {shouldQueueIntervention
                ? "예약 적용 (Queued): 다음 stage 시작 시 반영됩니다."
                : "즉시 적용 (Safe): 현재 stage에 바로 반영됩니다."}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.id}
                className="rounded-full border border-cyan-300/35 px-3 py-1 text-[11px] text-cyan-100 hover:bg-cyan-400/10"
                onClick={() => onQuickAction(action.id)}
                disabled={!sessionReady}
              >
                {action.label}
              </button>
            ))}
          </div>

          {queuedCommands.length > 0 ? (
            <div className="space-y-2 rounded-lg border border-amber-300/35 bg-amber-400/10 p-2">
              <p className="text-[11px] uppercase tracking-[0.2em] text-amber-100">
                queued · 다음 stage 시작 시 적용
              </p>
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

          <div className="max-h-[22rem] space-y-2 overflow-auto rounded-xl border border-slate-700 bg-slate-900/50 p-2">
            {entries.map((entry) => (
              <div key={entry.id} className={`rounded-md border p-2 text-xs ${roleClass(entry.type)}`}>
                <div className="mb-1 flex items-center justify-between">
                  <p className="uppercase tracking-wide text-slate-300">{entry.type}</p>
                  <p className="text-[10px] text-slate-400">{formatTime(entry.createdAt)}</p>
                </div>
                {entry.subtitle ? <p className="mb-1 text-[11px] text-slate-400">{entry.subtitle}</p> : null}
                <p className="whitespace-pre-wrap text-slate-100">{entry.content}</p>
              </div>
            ))}
            {entries.length === 0 ? <p className="text-xs text-slate-400">No chat history yet.</p> : null}
          </div>

          <div className="space-y-2">
            <input
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
              placeholder='e.g. "2번 후보로 바꿔"'
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  send();
                }
              }}
            />
            <button
              className="w-full rounded-lg border border-cyan-300/40 px-3 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-400/10 disabled:opacity-60"
              onClick={send}
              disabled={!sessionReady || input.trim().length === 0}
            >
              Send Command {busy ? "(processing)" : ""}
            </button>
          </div>
        </div>
      ) : null}

      {activeTab === "artifacts" ? (
        <div className="mt-4 max-h-[34rem] space-y-2 overflow-auto rounded-xl border border-slate-700 bg-slate-900/50 p-2">
          {artifacts.map((artifact) => (
            <div key={artifact.id} className="rounded-md border border-slate-700 p-2 text-xs">
              <p className="font-semibold text-cyan-100">{artifact.title}</p>
              <p className="text-slate-400">{artifact.kind}</p>
              <p className="text-[11px] text-slate-400">{formatTime(artifact.created_at)}</p>
            </div>
          ))}
          {artifacts.length === 0 ? <p className="text-xs text-slate-400">No artifacts yet.</p> : null}
        </div>
      ) : null}

      {activeTab === "jobs" ? (
        <div className="mt-4 max-h-[34rem] space-y-2 overflow-auto rounded-xl border border-slate-700 bg-slate-900/50 p-2">
          {jobs.map((job) => (
            <div key={job.id} className="rounded-md border border-slate-700 p-2 text-xs">
              <p className="font-semibold text-slate-100">{job.step}</p>
              <p className="text-slate-300">{job.status}</p>
              {job.error ? <p className="text-rose-300">{job.error}</p> : null}
            </div>
          ))}
          {jobs.length === 0 ? <p className="text-xs text-slate-400">No jobs yet.</p> : null}
        </div>
      ) : null}
    </article>
  );
}
