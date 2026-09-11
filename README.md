# Runlock

**The autonomous survival layer for onchain treasuries.**

Runlock watches a Safe treasury and its Superfluid obligations, calculates how long operations can continue, and prepares a policy-bound recovery plan. KeeperHub simulates and executes the exact reviewed contract calls. Nothing is reinterpreted at execution time.

## Why it exists

Treasuries often hold enough value but still fail operationally because liquid balances, streams and reserve policy are managed separately. An agent can identify the problem, but an agent should not improvise while moving funds. Runlock separates the probabilistic decision from deterministic execution.

## Demo scenario

- A Sepolia Safe has 530 USDC/USDCx in liquid operating reserves.
- Active Superfluid streams and fixed expenses create an 820 USDC monthly net burn.
- Current runway is 19.4 days, below the 21-day policy floor.
- Core engineering and operations streams are protected.
- Runlock compiles three approved calls: wrap 75 USDC, throttle community rewards, and pause experimental tooling.
- Projected runway becomes 30 days.
- KeeperHub preflights those exact calls and executes only after hash-bound human approval.

## What is included

- Responsive treasury command center
- Safe ownership, threshold and nonce model
- Superfluid stream inventory
- Deterministic runway calculations
- Protected-recipient and allowlist policy engine
- Canonical SHA-256 recovery manifests
- KeeperHub direct execution adapter
- Mandatory preflight simulation
- Approval hash verification
- Per-action deterministic idempotency keys
- Browser audit history and explorer links
- Eleven domain and safety tests
- KeeperHub setup, architecture, demo and bounty documentation

## Run locally

Requirements: Node.js 22.13 or newer and pnpm.

```bash
pnpm install
cp .env.example .env
pnpm dev
```

Open the local address printed by the terminal. Runlock defaults to demo mode and requires no API keys.

Verify everything:

```bash
pnpm test
pnpm typecheck
pnpm build
```

## Demo mode versus live mode

Demo mode exercises the complete interface, hashing, policy checks, approval gating and audit flow without contacting KeeperHub or broadcasting transactions. Demo transaction hashes are clearly marked by `mode: "demo"` in receipts and must never be used as hackathon proof.

For live mode, follow [docs/KEEPERHUB_SETUP.md](docs/KEEPERHUB_SETUP.md). You will need:

- A KeeperHub organization API key
- A configured KeeperHub wallet or Safe smart account
- A KeeperHub monitoring workflow using its Safe and Superfluid plugins
- Sepolia USDCx and CFA forwarder addresses verified against the current protocol registry
- A small amount of testnet assets

Live broadcasting remains disabled until `RUNLOCK_LIVE_EXECUTION=true`.

## Repository map

```text
app/
  api/                    snapshot, plan, simulation and execution routes
  dashboard.tsx          interactive command center
lib/runlock/
  canonical.ts           canonical JSON and SHA-256 commitments
  keeperhub.ts           authenticated execution and idempotency adapter
  math.ts                runway and flow-rate calculations
  plan.ts                recovery compiler and policy gate
  types.ts               typed domain contract
config/
  policy.example.json    editable policy example
docs/
  ARCHITECTURE.md
  BOUNTY_ISSUE_DRAFT.md
  DEMO_SCRIPT.md
  KEEPERHUB_SETUP.md
tests/
  runlock.test.ts
```

## Safety model

Runlock fails closed:

1. Every action must use an approved chain and contract.
2. Protected receivers cannot appear in recovery actions.
3. Single-action value is capped by policy.
4. The complete snapshot, plan and call payloads are canonicalized and hashed.
5. Simulation must succeed for the same manifest currently displayed.
6. Approval must repeat that manifest hash.
7. The server recomputes the hash immediately before execution.
8. Each action has a reproducible KeeperHub idempotency key.
9. The first failed action stops the sequence.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for details.

## KeeperHub integration

Runlock uses documented KeeperHub surfaces:

- `POST /api/workflows/{workflowId}/execute` for the monitoring workflow
- `GET /api/workflows/executions/{executionId}/wait` for its receipt
- `POST /api/execute/contract-call` with `simulate: true` for preflight
- The same contract-call body without `simulate` for execution
- `Idempotency-Key` derived from the manifest hash and action ID

KeeperHub protocol actions currently do not support dry-run simulation. Runlock therefore compiles Superfluid operations into exact contract calls, allowing the identical body to be simulated and later broadcast through KeeperHub.

## Main track and bounty

This repository is the main-track integration. The separate feature bounty should be submitted from a PR to `KeeperHub/keeperhub`. The proposed contribution is documented in [docs/BOUNTY_ISSUE_DRAFT.md](docs/BOUNTY_ISSUE_DRAFT.md). Open and get the issue accepted before implementing the KeeperHub PR.

## License

MIT
