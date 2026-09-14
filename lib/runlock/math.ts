import type { Stream, TreasurySnapshot } from "./types.ts";

export const DAYS_PER_MONTH = 30;
export const SECONDS_PER_MONTH = 30 * 24 * 60 * 60;

export function totalBalance(snapshot: TreasurySnapshot) {
  return snapshot.liquidBaseToken + snapshot.superTokenBalance;
}

export function streamOutflow(streams: Stream[]) {
  return streams.filter((stream) => stream.status === "active").reduce((sum, stream) => sum + stream.monthlyAmount, 0);
}

export function netMonthlyBurn(snapshot: TreasurySnapshot) {
  return Math.max(0, streamOutflow(snapshot.streams) + snapshot.otherMonthlyCosts - snapshot.monthlyInflows);
}

export function runwayDays(snapshot: TreasurySnapshot) {
  const burn = netMonthlyBurn(snapshot);
  return burn === 0 ? Number.POSITIVE_INFINITY : (totalBalance(snapshot) / burn) * DAYS_PER_MONTH;
}

export function monthlyToFlowRate(monthlyAmount: number) {
  const micro = BigInt(Math.round(monthlyAmount * 1_000_000));
  return ((micro * BigInt("1000000000000")) / BigInt(SECONDS_PER_MONTH)).toString();
}

export function projectBalance(snapshot: TreasurySnapshot, months = 3, monthlyBurn = netMonthlyBurn(snapshot)) {
  const start = totalBalance(snapshot);
  return Array.from({ length: months * 4 + 1 }, (_, index) => {
    const day = Math.round(index * 7.5);
    return { day, balance: Math.max(0, Number((start - (monthlyBurn / DAYS_PER_MONTH) * day).toFixed(2))) };
  });
}
