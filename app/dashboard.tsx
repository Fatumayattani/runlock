"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, AlertTriangle, ArrowUpRight, BadgeCheck, Boxes, Check, ChevronRight, CircleDollarSign, Command, FileLock2, Fingerprint, Gauge, History, KeyRound, LayoutDashboard, LoaderCircle, LockKeyhole, Network, Play, RefreshCw, Route, ShieldCheck, Siren, UsersRound, WalletCards, Waves } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast, Toaster } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { netMonthlyBurn, projectBalance, runwayDays, streamOutflow, totalBalance } from "@/lib/runlock/math";
import type { ExecutionReceipt, RecoveryManifest, TreasuryPolicy, TreasurySnapshot } from "@/lib/runlock/types";

type Props = { initialSnapshot: TreasurySnapshot; initialManifest: RecoveryManifest; policy: TreasuryPolicy };
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const compactAddress = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`;

function BrandMark() {
  return <span className="relative grid size-9 place-items-center rounded-xl border border-primary/30 bg-primary/10 text-primary"><Route className="size-5"/><span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-primary shadow-[0_0_12px_#b8f24b]"/></span>;
}

function StatusPill({ children, tone = "lime" }: { children: React.ReactNode; tone?: "lime" | "amber" | "quiet" }) {
  const tones = { lime: "border-primary/25 bg-primary/10 text-primary", amber: "border-amber-300/25 bg-amber-300/10 text-amber-200", quiet: "border-border bg-secondary text-muted-foreground" };
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

function Metric({ icon: Icon, label, value, note, danger = false }: { icon: typeof Gauge; label: string; value: string; note: string; danger?: boolean }) {
  return <div className="metric-card rounded-2xl border border-border p-4 lg:p-5"><div className="flex items-center justify-between text-muted-foreground"><span className="text-sm">{label}</span><Icon className="size-4"/></div><div className={`mt-5 text-[2rem] font-semibold tracking-[-0.05em] ${danger ? "text-amber-200" : "text-foreground"}`}>{value}</div><p className="mt-1 text-xs text-muted-foreground">{note}</p></div>;
}

function ActionIcon({ kind }: { kind: string }) {
  const Icon = kind === "wrap" ? WalletCards : kind === "update-flow" ? Waves : Siren;
  return <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-border bg-secondary text-primary"><Icon className="size-4"/></span>;
}

function RunwayChart({ snapshot, manifest }: { snapshot: TreasurySnapshot; manifest: RecoveryManifest }) {
  const currentBurn = netMonthlyBurn(snapshot);
  const projectedBurn = totalBalance(snapshot) / (manifest.projectedRunwayDays / 30);
  const current = projectBalance(snapshot, 2, currentBurn);
  const guarded = projectBalance(snapshot, 2, projectedBurn);
  const data = current.map((point, index) => ({ day: point.day, current: point.balance, guarded: guarded[index].balance }));
  return <div className="h-[245px] w-full" aria-label="Projected treasury balance chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data} margin={{ top: 16, right: 4, left: -18, bottom: 0 }}><defs><linearGradient id="guarded" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#b8f24b" stopOpacity={0.26}/><stop offset="100%" stopColor="#b8f24b" stopOpacity={0}/></linearGradient><linearGradient id="current" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ef7a70" stopOpacity={0.22}/><stop offset="100%" stopColor="#ef7a70" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#20332d" vertical={false} strokeDasharray="3 5"/><XAxis dataKey="day" stroke="#63766f" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}d`}/><YAxis stroke="#63766f" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`}/><Tooltip contentStyle={{ background: "#0d1815", border: "1px solid #20332d", borderRadius: 12, color: "#f3f7f5" }} formatter={(v) => money.format(Number(v))}/><Area type="monotone" dataKey="current" stroke="#ef7a70" strokeWidth={2} fill="url(#current)" name="Without Runlock"/><Area type="monotone" dataKey="guarded" stroke="#b8f24b" strokeWidth={2.5} fill="url(#guarded)" name="After recovery"/></AreaChart></ResponsiveContainer></div>;
}

export function Dashboard({ initialSnapshot, initialManifest, policy }: Props) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [manifest, setManifest] = useState(initialManifest);
  const [receipt, setReceipt] = useState<ExecutionReceipt | null>(null);
  const [audit, setAudit] = useState<ExecutionReceipt[]>([]);
  const [busy, setBusy] = useState<"refresh" | "simulate" | "execute" | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => { const stored = window.localStorage.getItem("runlock-audit-v1"); const timer = window.setTimeout(() => { if (stored) try { setAudit(JSON.parse(stored)); } catch { window.localStorage.removeItem("runlock-audit-v1"); } }, 0); return () => window.clearTimeout(timer); }, []);
  const record = (next: ExecutionReceipt) => { setReceipt(next); setAudit((current) => { const updated = [next, ...current].slice(0, 20); window.localStorage.setItem("runlock-audit-v1", JSON.stringify(updated)); return updated; }); };

  const refresh = async () => {
    setBusy("refresh");
    try {
      const snapResponse = await fetch("/api/snapshot", { cache: "no-store" }); const nextSnapshot = await snapResponse.json() as TreasurySnapshot & { error?: string }; if (!snapResponse.ok) throw new Error(nextSnapshot.error);
      const planResponse = await fetch("/api/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ snapshot: nextSnapshot, policy }) }); const nextManifest = await planResponse.json() as RecoveryManifest & { error?: string }; if (!planResponse.ok) throw new Error(nextManifest.error);
      setSnapshot(nextSnapshot); setManifest(nextManifest); setReceipt(null); toast.success("Fresh treasury state locked into a new plan");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Refresh failed"); } finally { setBusy(null); }
  };

  const simulate = useCallback(async () => {
    setBusy("simulate");
    try { const response = await fetch("/api/keeperhub/simulate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(manifest) }); const next = await response.json() as ExecutionReceipt & { error?: string }; if (!response.ok) throw new Error(next.error); record(next); toast.success("KeeperHub preflight passed for every action"); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Simulation failed"); } finally { setBusy(null); }
  }, [manifest]);

  const execute = async () => {
    setBusy("execute");
    try { const response = await fetch("/api/keeperhub/execute", { method: "POST", headers: { "Content-Type": "application/json", "x-runlock-approval": manifest.manifestHash }, body: JSON.stringify(manifest) }); const next = await response.json() as ExecutionReceipt & { error?: string }; if (!response.ok) throw new Error(next.error); record(next); setDialogOpen(false); toast.success(next.mode === "demo" ? "Demo execution completed" : "Recovery executed through KeeperHub"); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Execution failed"); } finally { setBusy(null); }
  };

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(context.registerTool({
      name: "read_runlock_status",
      title: "Read treasury runway",
      description: "Read the currently displayed treasury runway, policy state, and locked manifest fingerprint without changing anything.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute() { return { runwayDays: Number(runwayDays(snapshot).toFixed(1)), projectedRunwayDays: manifest.projectedRunwayDays, allPolicyChecksPass: manifest.checks.every((check) => check.passed), manifestHash: manifest.manifestHash, source: snapshot.source }; },
    }, { signal: lifecycle.signal })).catch(() => undefined);
    void Promise.resolve(context.registerTool({
      name: "simulate_locked_recovery",
      title: "Simulate locked recovery",
      description: "Run KeeperHub preflight for the exact currently displayed manifest. This never broadcasts a transaction.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      async execute() { await simulate(); return { requested: true, manifestHash: manifest.manifestHash }; },
    }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, [manifest, snapshot, simulate]);

  const allChecksPass = manifest.checks.every((check) => check.passed);
  const simulationPassed = receipt?.status === "simulated" && receipt.manifestHash === manifest.manifestHash;
  const balance = totalBalance(snapshot); const burn = netMonthlyBurn(snapshot); const runway = runwayDays(snapshot);
  const burnReduction = manifest.actions.reduce((sum, action) => sum + Math.max(0, (action.previousMonthlyAmount ?? 0) - (action.nextMonthlyAmount ?? 0)), 0);
  const protectedCount = snapshot.streams.filter((stream) => stream.protected).length;
  const expiringIn = Math.max(0, Math.round((new Date(manifest.expiresAt).getTime() - new Date(manifest.createdAt).getTime()) / 60000));

  return <div className="grid-noise min-h-screen lg:grid lg:grid-cols-[238px_1fr]">
    <Toaster theme="dark" position="top-right" richColors/>
    <aside className="hidden min-h-screen border-r border-border bg-sidebar/85 px-4 py-5 backdrop-blur-xl lg:flex lg:flex-col">
      <div className="flex items-center gap-3 px-2"><BrandMark/><div><div className="font-semibold tracking-tight">Runlock</div><div className="text-[11px] text-muted-foreground">Treasury survival</div></div></div>
      <nav className="mt-9 space-y-1" aria-label="Primary">{[{icon:LayoutDashboard,label:"Command center",active:true},{icon:Waves,label:"Money streams"},{icon:ShieldCheck,label:"Policy vault"},{icon:History,label:"Keeper runs"}].map(({icon:Icon,label,active}) => <button key={label} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}><Icon className="size-4"/>{label}</button>)}</nav>
      <div className="mt-auto rounded-2xl border border-border bg-secondary/55 p-3.5"><div className="flex items-center gap-2 text-xs font-medium"><ShieldCheck className="size-4 text-primary"/>Execution guard active</div><p className="mt-2 text-xs leading-5 text-muted-foreground">Every write must match a reviewed manifest and pass KeeperHub preflight.</p></div>
      <div className="mt-3 flex items-center gap-2 px-2 text-xs text-muted-foreground"><span className="size-2 rounded-full bg-primary shadow-[0_0_9px_#b8f24b]"/>KeeperHub connected</div>
    </aside>
    <main className="min-w-0"><header className="sticky top-0 z-20 flex h-[70px] items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur-xl sm:px-7"><div className="flex items-center gap-3 lg:hidden"><BrandMark/><span className="font-semibold">Runlock</span></div><div className="hidden lg:block"><p className="text-xs text-muted-foreground">Treasury</p><div className="mt-0.5 flex items-center gap-2 text-sm font-medium"><span>Runlock Labs Safe</span><ChevronRight className="size-3 text-muted-foreground"/><span className="text-muted-foreground">{snapshot.chainName}</span></div></div><div className="flex items-center gap-2"><StatusPill tone={snapshot.source === "demo" ? "amber" : "lime"}><span className="size-1.5 rounded-full bg-current"/>{snapshot.source === "demo" ? "Demo data" : "Live data"}</StatusPill><Button variant="outline" size="sm" onClick={refresh} disabled={busy !== null} className="border-border bg-secondary/60"><RefreshCw className={busy === "refresh" ? "animate-spin" : ""}/><span className="hidden sm:inline">Refresh state</span></Button></div></header>
      <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-7 lg:py-8">
        <section className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end"><div><div className="mb-3 flex flex-wrap items-center gap-2"><StatusPill tone="amber"><AlertTriangle className="size-3"/>Intervention recommended</StatusPill><StatusPill tone="quiet">Plan expires in {expiringIn}m</StatusPill></div><h1 className="max-w-3xl text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">Your treasury has <span className="text-amber-200">{runway.toFixed(1)} days</span> before the operating buffer runs out.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Runlock found a policy-safe route to {manifest.projectedRunwayDays} days without touching protected contributor streams.</p></div><div className="flex shrink-0 flex-wrap gap-2"><Button variant="outline" onClick={simulate} disabled={busy !== null || !allChecksPass} className="border-border bg-secondary/70"><Play/>{busy === "simulate" ? "Simulating…" : "Simulate exact plan"}</Button><Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogTrigger asChild><Button disabled={!simulationPassed || busy !== null} className="shadow-[0_0_28px_rgba(184,242,75,.12)]"><LockKeyhole/>Approve & execute</Button></DialogTrigger><DialogContent className="border-border bg-card sm:max-w-xl"><DialogHeader><DialogTitle>Approve the locked recovery plan?</DialogTitle><DialogDescription>KeeperHub will execute the same three calls that passed simulation. Any change invalidates your approval.</DialogDescription></DialogHeader><div className="rounded-xl border border-border bg-background p-3"><div className="text-xs text-muted-foreground">Manifest fingerprint</div><code className="mono mt-1 block break-all text-xs text-primary">{manifest.manifestHash}</code></div><div className="space-y-2">{manifest.actions.map((action) => <div key={action.id} className="flex items-center gap-3 rounded-xl bg-secondary/60 p-3"><ActionIcon kind={action.kind}/><div className="min-w-0"><div className="text-sm font-medium">{action.title}</div><div className="truncate text-xs text-muted-foreground">{action.keeperhub.body.functionName} · {compactAddress(action.keeperhub.body.contractAddress)}</div></div><Check className="ml-auto size-4 text-primary"/></div>)}</div><DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button><Button onClick={execute} disabled={busy !== null}>{busy === "execute" ? <LoaderCircle className="animate-spin"/> : <KeyRound/>}Sign approval hash</Button></DialogFooter></DialogContent></Dialog></div></section>
        <section className="mt-7 grid grid-cols-2 gap-3 xl:grid-cols-4"><Metric icon={Gauge} label="Current runway" value={`${runway.toFixed(1)}d`} note={`Policy floor ${policy.minimumRunwayDays} days`} danger/><Metric icon={CircleDollarSign} label="Liquid reserves" value={money.format(balance)} note={`${money.format(snapshot.superTokenBalance)} available as USDCx`}/><Metric icon={Activity} label="Net monthly burn" value={money.format(burn)} note={`${money.format(streamOutflow(snapshot.streams))} in active streams`}/><Metric icon={UsersRound} label="Protected streams" value={`${protectedCount}/${snapshot.streams.length}`} note="Core obligations cannot be changed"/></section>
        <Tabs defaultValue="overview" className="mt-7"><TabsList variant="line" className="mb-4 w-full justify-start overflow-x-auto border-b border-border pb-0"><TabsTrigger value="overview" className="px-4">Overview</TabsTrigger><TabsTrigger value="streams" className="px-4">Streams</TabsTrigger><TabsTrigger value="policy" className="px-4">Policy checks</TabsTrigger><TabsTrigger value="audit" className="px-4">Audit trail</TabsTrigger></TabsList>
          <TabsContent value="overview"><div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,.8fr)]"><section className="rounded-2xl border border-border bg-card/82 p-4 sm:p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="font-medium">Runway projection</h2><p className="mt-1 text-xs text-muted-foreground">Current trajectory versus the locked recovery plan</p></div><div className="flex gap-3 text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-destructive"/>Current</span><span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-primary"/>Guarded</span></div></div><RunwayChart snapshot={snapshot} manifest={manifest}/><div className="grid grid-cols-3 gap-2 border-t border-border pt-4"><div><p className="text-xs text-muted-foreground">Projected runway</p><p className="mt-1 text-lg font-semibold text-primary">{manifest.projectedRunwayDays} days</p></div><div><p className="text-xs text-muted-foreground">Burn reduction</p><p className="mt-1 text-lg font-semibold">{money.format(burnReduction)}/mo</p></div><div><p className="text-xs text-muted-foreground">Protected value</p><p className="mt-1 text-lg font-semibold">100%</p></div></div></section><section className="rounded-2xl border border-border bg-card/82 p-4 sm:p-5"><div className="flex items-center justify-between"><div><h2 className="font-medium">Recovery sequence</h2><p className="mt-1 text-xs text-muted-foreground">Deterministic · 3 actions</p></div><Fingerprint className="size-5 text-primary"/></div><div className="mt-5 space-y-1">{manifest.actions.map((action, index) => <div key={action.id} className="relative flex gap-3 pb-5 last:pb-1">{index < manifest.actions.length - 1 && <span className="absolute left-[18px] top-9 h-[calc(100%-26px)] w-px bg-border"/>}<ActionIcon kind={action.kind}/><div className="pt-0.5"><div className="flex items-center gap-2"><span className="text-sm font-medium">{action.title}</span><span className="mono text-[10px] text-muted-foreground">0{index + 1}</span></div><p className="mt-1 text-xs leading-5 text-muted-foreground">{action.description}</p></div></div>)}</div><div className="mt-4 overflow-hidden rounded-xl border border-primary/20 bg-primary/[.055] p-3"><div className="mb-2 flex items-center justify-between text-xs"><span className="flex items-center gap-2 font-medium text-primary"><FileLock2 className="size-3.5"/>Manifest locked</span><span className="mono text-muted-foreground">{manifest.manifestHash.slice(0, 10)}…</span></div><Progress value={allChecksPass ? 100 : 50} className="bg-primary/10 [&_[data-slot=progress-indicator]]:bg-primary"/></div></section></div></TabsContent>
          <TabsContent value="streams"><section className="overflow-hidden rounded-2xl border border-border bg-card/82"><div className="flex items-center justify-between border-b border-border p-5"><div><h2 className="font-medium">Superfluid obligations</h2><p className="mt-1 text-xs text-muted-foreground">Continuous outflows included in runway calculations</p></div><StatusPill><Waves className="size-3"/>4 active</StatusPill></div><div className="divide-y divide-border">{snapshot.streams.map((stream) => <div key={stream.id} className="grid gap-3 p-4 sm:grid-cols-[1fr_150px_120px] sm:items-center"><div className="flex items-center gap-3"><span className={`grid size-9 place-items-center rounded-xl ${stream.protected ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"}`}>{stream.protected ? <ShieldCheck className="size-4"/> : <Waves className="size-4"/>}</span><div><div className="text-sm font-medium">{stream.label}</div><code className="mono text-xs text-muted-foreground">{compactAddress(stream.receiver)}</code></div></div><div className="text-sm sm:text-right">{money.format(stream.monthlyAmount)}<span className="text-muted-foreground"> / month</span></div><div className="sm:text-right"><StatusPill tone={stream.protected ? "lime" : "quiet"}>{stream.protected ? "Protected" : "Adjustable"}</StatusPill></div></div>)}</div></section></TabsContent>
          <TabsContent value="policy"><section className="rounded-2xl border border-border bg-card/82 p-5"><div className="flex items-center justify-between"><div><h2 className="font-medium">Policy gate</h2><p className="mt-1 text-xs text-muted-foreground">Version {policy.version}</p></div><StatusPill><BadgeCheck className="size-3"/>All checks passed</StatusPill></div><div className="mt-5 grid gap-3 md:grid-cols-2">{manifest.checks.map((check) => <div key={check.code} className="flex items-start gap-3 rounded-xl border border-border bg-background/55 p-4"><span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full ${check.passed ? "bg-primary text-primary-foreground" : "bg-destructive text-white"}`}><Check className="size-3"/></span><div><div className="text-sm font-medium">{check.label}</div><p className="mt-1 text-xs leading-5 text-muted-foreground">{check.detail}</p></div></div>)}</div></section></TabsContent>
          <TabsContent value="audit"><section className="overflow-hidden rounded-2xl border border-border bg-card/82"><div className="border-b border-border p-5"><h2 className="font-medium">KeeperHub execution evidence</h2><p className="mt-1 text-xs text-muted-foreground">Receipts are stored locally for this build. Live mode returns explorer evidence.</p></div>{audit.length === 0 ? <div className="grid min-h-64 place-items-center p-8 text-center"><div><History className="mx-auto size-8 text-muted-foreground"/><p className="mt-3 text-sm font-medium">No runs recorded yet</p><p className="mt-1 text-xs text-muted-foreground">Simulate the current manifest to create the first audit record.</p></div></div> : <div className="divide-y divide-border">{audit.map((item, index) => <div key={`${item.completedAt}-${index}`} className="grid gap-3 p-4 sm:grid-cols-[1fr_120px_120px] sm:items-center"><div><div className="flex items-center gap-2 text-sm font-medium"><Command className="size-4 text-primary"/>{item.status === "simulated" ? "Preflight simulation" : "Recovery execution"}</div><code className="mono mt-1 block text-xs text-muted-foreground">{item.manifestHash.slice(0, 20)}…</code></div><StatusPill tone={item.status === "failed" ? "amber" : "lime"}>{item.status}</StatusPill><time className="text-xs text-muted-foreground">{new Date(item.completedAt).toLocaleTimeString()}</time></div>)}</div>}</section></TabsContent>
        </Tabs>
        <footer className="mt-8 flex flex-col justify-between gap-3 border-t border-border py-5 text-xs text-muted-foreground sm:flex-row"><span>Runlock · autonomous survival for onchain treasuries</span><div className="flex flex-wrap items-center gap-4"><span className="flex items-center gap-1.5"><Boxes className="size-3.5"/>Safe {snapshot.safe.owners} owners / {snapshot.safe.threshold} threshold</span><span className="flex items-center gap-1.5"><Network className="size-3.5"/>{snapshot.chainName}</span><a href="https://docs.keeperhub.com" target="_blank" rel="noreferrer" className="flex items-center gap-1 text-primary hover:underline">KeeperHub docs<ArrowUpRight className="size-3"/></a></div></footer>
      </div>
    </main>
  </div>;
}
