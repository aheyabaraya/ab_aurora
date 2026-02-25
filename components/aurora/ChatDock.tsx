"use client";

import { useState } from "react";
import type {
  ArtifactRecord,
  ChatEntry,
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
  status?: string;
  modelSource?: ModelSource;
  actionHub?: RightPanelViewModel | null;
  onSendChat: (message: string) => void;
  onQuickAction: (actionId: QuickActionId) => void;
  onRunGuidedAction?: (actionId: GuidedActionId) => void;
  onForceQueued: (queueId: string) => void;
  onDiscardQueued: (queueId: string) => void;
};

const CANDIDATE_ACTIONS: Array<{ id: QuickActionId; label: string }> = [
  { id: "pick_1", label: "Pick #1" },
  { id: "pick_2", label: "Pick #2" },
  { id: "pick_3", label: "Pick #3" },
  { id: "regenerate_top3", label: "Regenerate Top-3" }
];

const STYLE_ACTIONS: Array<{ id: QuickActionId; label: string }> = [
  { id: "more_editorial", label: "More editorial" },
  { id: "reduce_futuristic", label: "Reduce futuristic" },
  { id: "calmer", label: "Calmer" },
  { id: "more_ritual", label: "More ritual" },
  { id: "lock_style", label: "Lock style" }
];

const RUNTIME_ACTIONS: Array<{ id: GuidedActionId; label: string; requireGoal?: boolean }> = [
  { id: "start_runtime_goal", label: "Start Runtime Goal" },
  { id: "runtime_step", label: "Runtime Step", requireGoal: true },
  { id: "pause_runtime", label: "Pause" },
  { id: "resume_runtime", label: "Resume" },
  { id: "force_replan", label: "Force Replan", requireGoal: true }
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
  onQuickAction,
  onRunGuidedAction,
  onForceQueued,
  onDiscardQueued
}: ChatDockProps) {
  const [activeTab, setActiveTab] = useState<TabId>(defaultTab);
  const [showJobsTab, setShowJobsTab] = useState(!guided);
  const [showPanels, setShowPanels] = useState(!guided);
  const [showStyleTools, setShowStyleTools] = useState(false);
  const [showRuntimeTools, setShowRuntimeTools] = useState(false);
  const [input, setInput] = useState("");
  const currentTab: TabId = showPanels ? activeTab : "chat";

  const pinnedIds = new Set<string>();
  if (actionHub?.primaryAction?.id) {
    pinnedIds.add(actionHub.primaryAction.id);
  }
  if (actionHub?.secondaryAction?.id) {
    pinnedIds.add(actionHub.secondaryAction.id);
  }

  const quickCandidateActions = CANDIDATE_ACTIONS.filter((action) => !pinnedIds.has(action.id));
  const quickStyleActions = STYLE_ACTIONS.filter((action) => !pinnedIds.has(action.id));
  const quickRuntimeActions = RUNTIME_ACTIONS.filter((action) => !pinnedIds.has(action.id));

  const showRuntimeSection = sessionReady && (!guided || Boolean(actionHub?.showRuntimeGroup) || Boolean(actionHub?.hasRuntimeGoal));

  const send = () => {
    if (!sessionReady || input.trim().length === 0) {
      return;
    }
    onSendChat(input.trim());
    setInput("");
  };

  const runPinnedAction = (actionId: GuidedActionId) => {
    if (!onRunGuidedAction) {
      return;
    }
    onRunGuidedAction(actionId);
  };

  const actionHint =
    actionHub?.primaryAction?.disabledReason ?? actionHub?.secondaryAction?.disabledReason ?? actionHub?.hint ?? "";

  return (
    <article className="flex max-h-[calc(100vh-2.2rem)] min-h-[38rem] flex-col rounded-2xl border border-cyan-300/20 bg-slate-950/55 p-4 backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Chat Dock</p>
          <h2 className="text-lg font-semibold text-cyan-100">Intervention Console</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.15em] ${statusClass(status)}`}>
              {status}
            </span>
            <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.15em] ${modelClass(modelSource)}`}>
              {modelSource}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          {guided ? (
            <button
              className="rounded-md border border-cyan-300/30 px-2 py-1 text-[11px] text-cyan-100 hover:bg-cyan-400/10"
              onClick={() => setShowPanels((value) => !value)}
            >
              {showPanels ? "패널 숨기기" : "패널 보기"}
            </button>
          ) : null}
          {!showJobsTab ? (
            <button
              className="rounded-md border border-cyan-300/40 px-2 py-1 text-[11px] font-semibold text-cyan-100 hover:bg-cyan-400/10"
              onClick={() => {
                setShowJobsTab(true);
                setShowPanels(true);
                setActiveTab("jobs");
              }}
            >
              Pro 보기
            </button>
          ) : null}
        </div>
      </div>

      {actionHub ? (
        <div className="mt-3 rounded-xl border border-cyan-300/25 bg-slate-900/70 p-3">
          <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-200">Next Action</p>
          {actionHub.primaryAction ? (
            <button
              className="mt-2 w-full rounded-lg border border-cyan-300/55 bg-cyan-400/15 px-3 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-300/20 disabled:opacity-55"
              onClick={() => runPinnedAction(actionHub.primaryAction!.id)}
              disabled={busy || actionHub.primaryAction.disabled || !onRunGuidedAction}
            >
              {actionHub.primaryAction.label}
            </button>
          ) : null}
          {actionHub.secondaryAction ? (
            <button
              className="mt-2 w-full rounded-lg border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-800 disabled:opacity-55"
              onClick={() => runPinnedAction(actionHub.secondaryAction!.id)}
              disabled={busy || actionHub.secondaryAction.disabled || !onRunGuidedAction}
            >
              {actionHub.secondaryAction.label}
            </button>
          ) : null}
          {actionHint ? <p className="mt-2 text-[11px] text-slate-300">{actionHint}</p> : null}
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

      {showPanels ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.15em] ${
              currentTab === "chat"
                ? "border-cyan-300/70 bg-cyan-500/20 text-cyan-100"
                : "border-slate-700 text-slate-300"
            }`}
            onClick={() => setActiveTab("chat")}
          >
            chat
          </button>
          <button
            className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.15em] ${
              currentTab === "artifacts"
                ? "border-cyan-300/70 bg-cyan-500/20 text-cyan-100"
                : "border-slate-700 text-slate-300"
            }`}
            onClick={() => setActiveTab("artifacts")}
          >
            artifacts
          </button>
          {showJobsTab ? (
            <button
              className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.15em] ${
                currentTab === "jobs"
                  ? "border-cyan-300/70 bg-cyan-500/20 text-cyan-100"
                  : "border-slate-700 text-slate-300"
              }`}
              onClick={() => setActiveTab("jobs")}
            >
              jobs
            </button>
          ) : null}
        </div>
      ) : null}

      {currentTab === "chat" ? (
        <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3">
          {sessionReady ? (
            <div className="space-y-2">
              {quickCandidateActions.length > 0 ? (
                <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-2">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-300">Pipeline Actions</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {quickCandidateActions.map((action) => (
                      <button
                        key={action.id}
                        className="rounded-full border border-cyan-300/35 px-3 py-1 text-[11px] text-cyan-100 hover:bg-cyan-400/10 disabled:opacity-50"
                        onClick={() => onQuickAction(action.id)}
                        disabled={!sessionReady}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {quickStyleActions.length > 0 ? (
                <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-2">
                  <button
                    className="flex w-full items-center justify-between text-left text-[11px] uppercase tracking-[0.18em] text-slate-300"
                    onClick={() => setShowStyleTools((value) => !value)}
                  >
                    Style Actions
                    <span>{showStyleTools ? "−" : "+"}</span>
                  </button>
                  {showStyleTools ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {quickStyleActions.map((action) => (
                        <button
                          key={action.id}
                          className="rounded-full border border-cyan-300/35 px-3 py-1 text-[11px] text-cyan-100 hover:bg-cyan-400/10 disabled:opacity-50"
                          onClick={() => onQuickAction(action.id)}
                          disabled={!sessionReady}
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {showRuntimeSection ? (
                <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-2">
                  <button
                    className="flex w-full items-center justify-between text-left text-[11px] uppercase tracking-[0.18em] text-slate-300"
                    onClick={() => setShowRuntimeTools((value) => !value)}
                  >
                    Runtime Controls
                    <span>{showRuntimeTools ? "−" : "+"}</span>
                  </button>
                  {showRuntimeTools ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {quickRuntimeActions.map((action) => (
                        <button
                          key={action.id}
                          className="rounded-full border border-amber-300/35 px-3 py-1 text-[11px] text-amber-100 hover:bg-amber-400/10 disabled:opacity-50"
                          onClick={() => runPinnedAction(action.id)}
                          disabled={
                            !sessionReady ||
                            !onRunGuidedAction ||
                            Boolean(action.requireGoal && !actionHub?.hasRuntimeGoal)
                          }
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-700 bg-slate-900/50 p-2">
            <div className="h-full space-y-2 overflow-auto">
              {entries.map((entry) => (
                <div key={entry.id} className={`rounded-md border p-2 text-xs ${roleClass(entry.type)}`}>
                  <div className="mb-1 flex items-center justify-between">
                    <p className="uppercase tracking-wide text-slate-300">{entry.type}</p>
                    <p className="text-[10px] text-slate-400">{formatTime(entry.createdAt)}</p>
                  </div>
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

      {currentTab === "artifacts" ? (
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

      {currentTab === "jobs" ? (
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
