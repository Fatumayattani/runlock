# Feature: Treasury Runway Analysis node

## Problem

KeeperHub can read balances and protocol positions, but agents currently have to rebuild treasury runway math and policy checks in application code. That makes equivalent workflows produce inconsistent results and makes safety review harder.

## Proposal

Add a deterministic, read-only Treasury Runway Analysis node that accepts liquid balances, recurring inflows, recurring outflows and a policy floor, then returns a typed runway report.

## Suggested input

- `liquidBalanceUsd`: decimal string
- `monthlyInflowsUsd`: decimal string
- `monthlyOutflowsUsd`: decimal string
- `minimumRunwayDays`: positive integer
- `asOf`: optional ISO timestamp

## Suggested output

- `netMonthlyBurnUsd`
- `dailyBurnUsd`
- `runwayDays`
- `belowPolicyFloor`
- `shortfallToPolicyUsd`
- `asOf`

## Acceptance criteria

- Decimal-safe calculations without binary floating-point drift
- Defined behavior for zero or negative net burn
- Zod schemas for input and output
- Unit tests for normal, boundary, zero-burn and invalid-input cases
- Node documentation and one example workflow
- No wallet, credentials or network request required

## Reference integration

Runlock uses this calculation to decide whether a Safe treasury supporting Superfluid streams needs a recovery plan. Runlock will not depend on the feature being merged; the PR would make the analysis reusable across KeeperHub workflows.
