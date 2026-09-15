# Runlock architecture

Runlock separates observation, decision and execution so no probabilistic component can reinterpret a treasury action after approval.

```mermaid
flowchart LR
  A[Safe and Superfluid state] --> B[Runway engine]
  B --> C[Policy gate]
  C --> D[Canonical manifest]
  D --> E[KeeperHub simulation]
  E --> F[Human approval]
  F --> G[KeeperHub execution]
  G --> H[Receipt and audit]
```

## Trust boundaries

1. **Observation:** a KeeperHub monitoring workflow reads Safe owners, threshold and nonce plus Superfluid balances and streams.
2. **Decision:** Runlock calculates net burn and proposes only deterministic recovery actions.
3. **Policy:** chain, contracts, action value and protected recipients are checked before a manifest can be locked.
4. **Commitment:** canonical JSON is hashed with SHA-256. The approval header must equal that hash.
5. **Preflight:** each exact contract call is sent to KeeperHub with `simulate: true`. Nothing is signed or broadcast.
6. **Execution:** the identical bodies are sent without `simulate`. Each action receives an idempotency key derived from the manifest hash and action ID.
7. **Evidence:** KeeperHub execution IDs, transaction hashes and explorer links are retained as the run receipt.

## Failure behavior

- A stale or modified manifest is rejected.
- Any failed policy check blocks simulation and execution.
- A failed simulation stops the sequence at that action.
- Live broadcasting is disabled unless `RUNLOCK_LIVE_EXECUTION=true`.
- Actions execute sequentially. A failure stops remaining actions rather than continuing into an unknown partial state.
- Retrying the same action uses the same KeeperHub idempotency key.

## Current integration surface

Live monitoring reads Safe configuration, token balances and configured Superfluid CFA flow state directly from Ethereum Sepolia RPC. KeeperHub is the execution boundary, not the monitoring source. The verified recovery used KeeperHub's `/api/execute/transfer` endpoint with the chain, reserve, token, recipient and amount locked into the approved manifest. Runlock can compile deterministic Superfluid adjustment actions for planning and demo coverage, but this repository does not claim a verified live Superfluid stream mutation.
