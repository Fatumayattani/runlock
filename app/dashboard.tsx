"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity, ArrowDownRight, Check, CheckCircle2, Clock3, Copy,
  Fingerprint, Gauge, History, KeyRound, LayoutDashboard, LoaderCircle,
  LockKeyhole, Play, RefreshCw, Route, ShieldCheck, TriangleAlert, WalletCards,
  Waves,
} from "lucide-react";
import { toast, Toaster } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  netMonthlyBurn, runwayDays, streamOutflow, totalBalance,
} from "@/lib/runlock/math";
import type {
  ExecutionReceipt, RecoveryManifest, TreasuryPolicy, TreasurySnapshot,
} from "@/lib/runlock/types";

type Props = {
  initialSnapshot: TreasurySnapshot;
  initialManifest: RecoveryManifest;
  policy: TreasuryPolicy;
};

type View = "overview" | "streams" | "policy" | "activity";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const compactAddress = (value: string) =>
  value.slice(0, 6) + "…" + value.slice(-4);

function Wordmark() {
  return (
    <div className="flex items-center gap-3">
      <span className="rl-brand-mark" aria-hidden="true"><Route className="size-[18px]" /></span>
      <div>
        <p className="text-[17px] font-semibold tracking-[-0.035em]">Runlock</p>
        <p className="text-[10px] uppercase tracking-[0.14em] text-ink-faint">Treasury survival</p>
      </div>
    </div>
  );
}

function StatePill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "critical" | "safe";
}) {
  return <span className={"rl-state-pill rl-state-pill-" + tone}>{children}</span>;
}

function MiniMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rl-metric-tile">
      <p className="text-[11px] uppercase tracking-[0.08em] text-ink-faint">{label}</p>
      <p className="mt-1 text-[21px] font-semibold tracking-[-0.045em]">{value}</p>
      <p className="mt-0.5 truncate text-[11px] text-ink-faint">{detail}</p>
    </div>
  );
}

function ActionGlyph({ kind }: { kind: string }) {
  const Icon = kind === "wrap" ? WalletCards : kind === "update-flow" ? Waves : Activity;
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#20231f] text-acid">
      <Icon className="size-3.5" />
    </span>
  );
}

function Sidebar({
  view,
  setView,
}: {
  view: View;
  setView: (view: View) => void;
}) {
  const items: Array<{ id: View; label: string; icon: typeof Gauge }> = [
    { id: "overview", label: "Command center", icon: LayoutDashboard },
    { id: "streams", label: "Money streams", icon: Waves },
    { id: "policy", label: "Policy vault", icon: ShieldCheck },
    { id: "activity", label: "Keeper runs", icon: History },
  ];

  return (
    <aside className="rl-sidebar">
      <Wordmark />
      <nav className="mt-9 space-y-1" aria-label="Dashboard">
        {items.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setView(id)}
            className={view === id ? "rl-side-link rl-side-link-active" : "rl-side-link"}
          >
            <Icon className="size-4" /> {label}
          </button>
        ))}
      </nav>

      <div className="mt-auto">
        <div className="flex items-center gap-2 px-1 text-[11px] text-ink-faint">
          <span className="rl-status-dot text-acid" /> KeeperHub ready
        </div>
      </div>
    </aside>
  );
}

export function Dashboard({ initialSnapshot, initialManifest, policy }: Props) {
  const [view, setView] = useState<View>("overview");
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [manifest, setManifest] = useState(initialManifest);
  const [receipt, setReceipt] = useState<ExecutionReceipt | null>(null);
  const [audit, setAudit] = useState<ExecutionReceipt[]>([]);
  const [busy, setBusy] = useState<"refresh" | "simulate" | "execute" | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem("runlock-audit-v1");
    if (!stored) return;
    const timer = window.setTimeout(() => {
      try {
        setAudit(JSON.parse(stored));
      } catch {
        window.localStorage.removeItem("runlock-audit-v1");
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const record = (next: ExecutionReceipt) => {
    setReceipt(next);
    setAudit((current) => {
      const updated = [next, ...current].slice(0, 20);
      window.localStorage.setItem("runlock-audit-v1", JSON.stringify(updated));
      return updated;
    });
  };

  const refresh = async () => {
    setBusy("refresh");
    try {
      const snapshotResponse = await fetch("/api/snapshot", { cache: "no-store" });
      const nextSnapshot = await snapshotResponse.json() as TreasurySnapshot & { error?: string };
      if (!snapshotResponse.ok) throw new Error(nextSnapshot.error);

      const planResponse = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshot: nextSnapshot, policy }),
      });
      const nextManifest = await planResponse.json() as RecoveryManifest & { error?: string };
      if (!planResponse.ok) throw new Error(nextManifest.error);

      setSnapshot(nextSnapshot);
      setManifest(nextManifest);
      setReceipt(null);
      toast.success("Treasury snapshot refreshed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Refresh failed");
    } finally {
      setBusy(null);
    }
  };

  const simulate = useCallback(async () => {
    setBusy("simulate");
    try {
      const response = await fetch("/api/keeperhub/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(manifest),
      });
      const next = await response.json() as ExecutionReceipt & { error?: string };
      if (!response.ok) throw new Error(next.error);
      record(next);
      toast.success("Every recovery action passed KeeperHub preflight");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Simulation failed");
    } finally {
      setBusy(null);
    }
  }, [manifest]);

  const execute = async () => {
    setBusy("execute");
    try {
      const response = await fetch("/api/keeperhub/execute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-runlock-approval": manifest.manifestHash,
        },
        body: JSON.stringify(manifest),
      });
      const next = await response.json() as ExecutionReceipt & { error?: string };
      if (!response.ok) throw new Error(next.error);
      record(next);
      setDialogOpen(false);
      setView("activity");
      toast.success(next.mode === "demo" ? "Demo execution completed" : "Recovery executed through KeeperHub");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Execution failed");
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();

    void Promise.resolve(context.registerTool({
      name: "read_runlock_status",
      title: "Read treasury runway",
      description: "Read the displayed treasury runway, policy state and manifest fingerprint.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute() {
        return {
          runwayDays: Number(runwayDays(snapshot).toFixed(1)),
          projectedRunwayDays: manifest.projectedRunwayDays,
          allPolicyChecksPass: manifest.checks.every((check) => check.passed),
          manifestHash: manifest.manifestHash,
          source: snapshot.source,
        };
      },
    }, { signal: lifecycle.signal })).catch(() => undefined);

    void Promise.resolve(context.registerTool({
      name: "simulate_locked_recovery",
      title: "Simulate locked recovery",
      description: "Run KeeperHub preflight for the exact displayed manifest without broadcasting.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      async execute() {
        await simulate();
        return { requested: true, manifestHash: manifest.manifestHash };
      },
    }, { signal: lifecycle.signal })).catch(() => undefined);

    return () => lifecycle.abort();
  }, [manifest, snapshot, simulate]);

  const allChecksPass = manifest.checks.every((check) => check.passed);
  const simulationPassed = receipt?.status === "simulated" && receipt.manifestHash === manifest.manifestHash;
  const balance = totalBalance(snapshot);
  const burn = netMonthlyBurn(snapshot);
  const runway = runwayDays(snapshot);
  const burnReduction = manifest.actions.reduce(
    (sum, action) => sum + Math.max(0, (action.previousMonthlyAmount ?? 0) - (action.nextMonthlyAmount ?? 0)),
    0,
  );
  const protectedCount = snapshot.streams.filter((stream) => stream.protected).length;
  const runwayScale = Math.max(policy.targetRunwayDays + 5, 35);
  const currentPosition = Math.min(100, (runway / runwayScale) * 100);
  const floorPosition = Math.min(100, (policy.minimumRunwayDays / runwayScale) * 100);
  const targetPosition = Math.min(100, (policy.targetRunwayDays / runwayScale) * 100);

  const copyHash = async () => {
    await navigator.clipboard.writeText(manifest.manifestHash);
    toast.success("Manifest fingerprint copied");
  };

  return (
    <div className="rl-dashboard-shell">
      <Toaster theme="dark" position="top-right" richColors />
      <Sidebar view={view} setView={setView} />

      <div className="rl-workspace">
        <header className="rl-workspace-header">
          <div>
            <h1 className="text-xl font-semibold tracking-[-0.04em]">
              {view === "overview" && "Treasury command center"}
              {view === "streams" && "Continuous obligations"}
              {view === "policy" && "Execution policy"}
              {view === "activity" && "KeeperHub activity"}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <StatePill tone={snapshot.source === "demo" ? "neutral" : "safe"}>
              <span className="rl-status-dot" /> {snapshot.chainName} · {snapshot.source === "demo" ? "Demo" : "Live"}
            </StatePill>
            <span className="hidden rounded-lg border border-line bg-panel px-3 py-2 font-mono text-[11px] text-ink-faint sm:block">{compactAddress(snapshot.safeAddress)}</span>
            <Button variant="outline" size="icon" onClick={refresh} disabled={busy !== null} className="rl-topbar-button" aria-label="Refresh treasury">
              <RefreshCw className={busy === "refresh" ? "animate-spin" : ""} />
            </Button>
          </div>
        </header>

        <div className="rl-mobile-tabs">
          {([
            ["overview", "Overview"],
            ["streams", "Streams"],
            ["policy", "Policy"],
            ["activity", "Activity"],
          ] as Array<[View, string]>).map(([id, label]) => (
            <button key={id} type="button" onClick={() => setView(id)} className={view === id ? "rl-mobile-tab rl-mobile-tab-active" : "rl-mobile-tab"}>{label}</button>
          ))}
        </div>

        <main className="rl-view-frame">
          {view === "overview" && (
            <div className="rl-overview-grid">
              <section className="rl-runway-panel">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <StatePill tone="critical"><TriangleAlert className="size-3.5" /> Action required</StatePill>
                    <p className="mt-4 text-xs text-ink-muted">Operational runway</p>
                    <div className="mt-1 flex items-end gap-2">
                      <strong className="text-[58px] font-semibold leading-none tracking-[-0.075em] xl:text-[72px]">{runway.toFixed(1)}</strong>
                      <span className="pb-1.5 text-base text-ink-muted">days</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="flex items-center justify-end gap-1 text-sm font-semibold text-[#f1a098]">
                      <ArrowDownRight className="size-4" /> {(policy.minimumRunwayDays - runway).toFixed(1)}d
                    </p>
                    <p className="mt-1 text-[11px] text-ink-faint">below policy floor</p>
                  </div>
                </div>

                <div className="rl-runway-scale">
                  <div className="rl-runway-track">
                    <div className="rl-runway-danger" style={{ width: String(floorPosition) + "%" }} />
                    <div className="rl-runway-current" style={{ left: String(currentPosition) + "%" }}><span>{runway.toFixed(1)}d</span></div>
                    <div className="rl-runway-marker" style={{ left: String(floorPosition) + "%" }}><span>Floor {policy.minimumRunwayDays}d</span></div>
                    <div className="rl-runway-marker rl-runway-marker-target" style={{ left: String(targetPosition) + "%" }}><span>Target {policy.targetRunwayDays}d</span></div>
                  </div>
                </div>

                <div className="rl-metrics-grid">
                  <MiniMetric label="Available" value={money.format(balance)} detail={money.format(snapshot.superTokenBalance) + " USDCx"} />
                  <MiniMetric label="Monthly burn" value={money.format(burn)} detail={money.format(streamOutflow(snapshot.streams)) + " streamed"} />
                  <MiniMetric label="Protected" value={protectedCount + "/" + snapshot.streams.length} detail="Core obligations" />
                </div>
              </section>

              <section className="rl-recovery-panel">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="rl-eyebrow">Locked recovery</p>
                    <h2 className="mt-1.5 text-xl font-semibold tracking-[-0.04em]">Restore 30-day runway</h2>
                  </div>
                  <span className="grid size-9 place-items-center rounded-full bg-acid text-[#0d100c]"><CheckCircle2 className="size-4" /></span>
                </div>

                <div className="rl-recovery-outcome">
                  <div>
                    <p className="text-[11px] text-ink-faint">Projected runway</p>
                    <p className="mt-0.5 text-2xl font-semibold tracking-[-0.05em] text-acid">{manifest.projectedRunwayDays} days</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-acid">−{money.format(burnReduction)}</p>
                    <p className="mt-0.5 text-[11px] text-ink-faint">monthly burn</p>
                  </div>
                </div>

                <div className="rl-action-list">
                  {manifest.actions.map((action, index) => (
                    <div key={action.id} className="rl-action-row">
                      <div className="relative">
                        <ActionGlyph kind={action.kind} />
                        {index < manifest.actions.length - 1 && <span className="rl-action-line" />}
                      </div>
                      <div className="min-w-0 flex-1 pb-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-[13px] font-medium">{action.title}</p>
                          <span className="font-mono text-[9px] text-ink-faint">0{index + 1}</span>
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-ink-faint">{action.description}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="rl-manifest-box">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-[11px] text-ink-muted"><Fingerprint className="size-3 text-acid" /> Manifest locked</span>
                    <button type="button" onClick={copyHash} className="text-ink-faint hover:text-ink" aria-label="Copy manifest"><Copy className="size-3" /></button>
                  </div>
                  <code className="mt-1.5 block truncate font-mono text-[10px] text-ink-faint">{manifest.manifestHash}</code>
                </div>

                <div className="mt-auto grid grid-cols-2 gap-2">
                  <Button variant="outline" onClick={simulate} disabled={busy !== null || !allChecksPass} className="h-10 border-line bg-transparent">
                    {busy === "simulate" ? <LoaderCircle className="animate-spin" /> : <Play />}
                    {busy === "simulate" ? "Simulating" : "Simulate"}
                  </Button>
                  <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                    <DialogTrigger asChild>
                      <Button disabled={!simulationPassed || busy !== null} className="h-10 bg-acid text-[#0d100c] hover:bg-[#d5ff71]"><LockKeyhole /> Execute</Button>
                    </DialogTrigger>
                    <DialogContent className="border-line bg-[#151714] sm:max-w-xl">
                      <DialogHeader>
                        <DialogTitle>Approve this exact recovery?</DialogTitle>
                        <DialogDescription>KeeperHub will execute only the calls bound to this manifest fingerprint. Any change invalidates approval.</DialogDescription>
                      </DialogHeader>
                      <div className="rounded-xl border border-line bg-[#0e100e] p-3">
                        <p className="text-xs text-ink-faint">Manifest fingerprint</p>
                        <code className="mt-1 block break-all font-mono text-xs text-acid">{manifest.manifestHash}</code>
                      </div>
                      <div className="space-y-2">
                        {manifest.actions.map((action) => (
                          <div key={action.id} className="flex items-center gap-3 rounded-xl bg-[#1c1f1b] p-3">
                            <ActionGlyph kind={action.kind} />
                            <div className="min-w-0">
                              <p className="text-sm font-medium">{action.title}</p>
                              <p className="truncate font-mono text-[10px] text-ink-faint">{action.keeperhub.body.functionName} · {compactAddress(action.keeperhub.body.contractAddress)}</p>
                            </div>
                            <Check className="ml-auto size-4 text-acid" />
                          </div>
                        ))}
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-line">Cancel</Button>
                        <Button onClick={execute} disabled={busy !== null} className="bg-acid text-[#0d100c] hover:bg-[#d5ff71]">
                          {busy === "execute" ? <LoaderCircle className="animate-spin" /> : <KeyRound />} Approve hash
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
                <p className="mt-2 text-center text-[10px] text-ink-faint">
                  {simulationPassed ? "Preflight passed. Exact execution unlocked." : "Execute unlocks after KeeperHub simulation."}
                </p>
              </section>
            </div>
          )}

          {view === "streams" && (
            <section className="rl-single-panel">
              <div className="rl-panel-title">
                <div><p className="rl-eyebrow">Superfluid</p><h2 className="mt-1.5 text-xl font-semibold">Continuous obligations</h2></div>
                <StatePill tone="safe"><Waves className="size-3" /> {snapshot.streams.length} active</StatePill>
              </div>
              <div className="rl-stream-table">
                <div className="rl-table-head"><span>Recipient</span><span>Monthly outflow</span><span>Protection</span><span>Status</span></div>
                {snapshot.streams.map((stream) => (
                  <div key={stream.id} className="rl-table-row">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className={stream.protected ? "rl-stream-icon rl-stream-icon-protected" : "rl-stream-icon"}>{stream.protected ? <ShieldCheck className="size-4" /> : <Waves className="size-4" />}</span>
                      <div className="min-w-0"><p className="truncate text-sm font-medium">{stream.label}</p><p className="font-mono text-[10px] text-ink-faint">{compactAddress(stream.receiver)}</p></div>
                    </div>
                    <span className="text-sm font-medium">{money.format(stream.monthlyAmount)} / mo</span>
                    <span className={stream.protected ? "text-xs text-acid" : "text-xs text-ink-muted"}>{stream.protected ? "Protected" : "Adjustable"}</span>
                    <StatePill tone="safe"><span className="rl-status-dot" /> Active</StatePill>
                  </div>
                ))}
              </div>
            </section>
          )}

          {view === "policy" && (
            <div className="rl-policy-grid">
              <section className="rl-single-panel">
                <div className="rl-panel-title">
                  <div><p className="rl-eyebrow">Policy {policy.version}</p><h2 className="mt-1.5 text-xl font-semibold">Execution gates</h2></div>
                  <StatePill tone="safe"><CheckCircle2 className="size-3" /> All passed</StatePill>
                </div>
                <div className="rl-check-grid">
                  {manifest.checks.map((check) => (
                    <div key={check.code} className="rl-check-card">
                      <span className={check.passed ? "rl-check-icon rl-check-icon-pass" : "rl-check-icon rl-check-icon-fail"}><Check className="size-3" /></span>
                      <div><p className="text-sm font-medium">{check.label}</p><p className="mt-1 text-xs leading-5 text-ink-faint">{check.detail}</p></div>
                    </div>
                  ))}
                </div>
              </section>
              <aside className="rl-details-panel">
                <p className="rl-eyebrow">Treasury controls</p>
                <div className="rl-detail-list">
                  <div><span>Minimum runway</span><strong>{policy.minimumRunwayDays} days</strong></div>
                  <div><span>Recovery target</span><strong>{policy.targetRunwayDays} days</strong></div>
                  <div><span>Maximum action</span><strong>{money.format(policy.maximumSingleActionUsd)}</strong></div>
                  <div><span>Human approval</span><strong>Required</strong></div>
                  <div><span>Simulation</span><strong>Required</strong></div>
                  <div><span>Safe threshold</span><strong>{snapshot.safe.threshold} of {snapshot.safe.owners}</strong></div>
                </div>
              </aside>
            </div>
          )}

          {view === "activity" && (
            <section className="rl-single-panel">
              <div className="rl-panel-title">
                <div><p className="rl-eyebrow">Audit trail</p><h2 className="mt-1.5 text-xl font-semibold">KeeperHub runs</h2></div>
                <StatePill><Clock3 className="size-3" /> Local evidence</StatePill>
              </div>
              {audit.length === 0 ? (
                <div className="rl-empty-state">
                  <span className="grid size-11 place-items-center rounded-full bg-[#20231f] text-ink-faint"><History className="size-5" /></span>
                  <p className="mt-3 text-sm font-medium">No runs recorded</p>
                  <p className="mt-1 max-w-sm text-center text-xs leading-5 text-ink-faint">Return to the command center and simulate the locked recovery plan to create the first audit record.</p>
                  <Button variant="outline" onClick={() => setView("overview")} className="mt-4 border-line bg-transparent"><Play /> Open recovery plan</Button>
                </div>
              ) : (
                <div className="rl-activity-list">
                  {audit.map((item, index) => (
                    <div key={item.completedAt + "-" + index} className="rl-activity-row">
                      <span className="grid size-9 place-items-center rounded-full bg-acid/10 text-acid">{item.status === "simulated" ? <Play className="size-4" /> : <CheckCircle2 className="size-4" />}</span>
                      <div className="min-w-0 flex-1"><p className="text-sm font-medium">{item.status === "simulated" ? "Preflight simulation" : "Recovery execution"}</p><p className="truncate font-mono text-[10px] text-ink-faint">{item.manifestHash}</p></div>
                      <StatePill tone={item.status === "failed" ? "critical" : "safe"}>{item.status}</StatePill>
                      <time className="w-24 text-right text-xs text-ink-faint">{new Date(item.completedAt).toLocaleTimeString()}</time>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
