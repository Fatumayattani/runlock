# Verified KeeperHub execution

This document records Runlock's verified Ethereum Sepolia recovery transaction and distinguishes on-chain evidence from the included demo scenario.

## Result

| Field | Verified value |
| --- | --- |
| Network | Ethereum Sepolia (`11155111`) |
| Runlock Safe | `0x9e604f3Aacb910a8dbdBE7B5459fB9074BC0600A` |
| KeeperHub reserve | `0x07e60ae18a26effbb9301c0d2cec0419e5abf09b` |
| Asset | fDAI (`0x4e89088cd14064f38e5b2f309cfab9c864f9a8e6`) |
| Amount | 100 fDAI |
| Manifest hash | `10b0ea1da681f8002642c7a7059487c6427c39bf69ea32362ff7993a3180924a` |
| KeeperHub execution ID | `f52whszt34pmdecl1r09r` |
| Transaction hash | [`0x941ac927033ff1e81044d030c4b1d0e26eb9620ac2ab94543f7d58f403d56c42`](https://sepolia.etherscan.io/tx/0x941ac927033ff1e81044d030c4b1d0e26eb9620ac2ab94543f7d58f403d56c42) |
| Block | `11702833` |
| Receipt verification | `verified: true` |
| Receipt status | `success` |
| Safe fDAI before | 0 |
| Safe fDAI after | 100 |

Runlock recorded the execution attempt from `2026-09-14T12:15:11.139Z` until the verified completion at `2026-09-14T12:15:38.645Z`.

## Execution sequence

1. Runlock read the Safe configuration, fDAI balance, fDAIx balance and configured Superfluid CFA flow from Ethereum Sepolia RPC.
2. With zero available balance, zero inflow, no active stream outflow and a configured monthly operating cost of 100, Runlock calculated zero days of runway.
3. The deterministic planner produced one action: transfer 100 fDAI from the KeeperHub reserve to the Safe.
4. The action passed the chain, contract, protected-recipient, value-limit, simulation and human-approval policy gates.
5. Runlock canonicalized the manifest and committed it to the SHA-256 fingerprint recorded above.
6. KeeperHub simulated the exact ERC-20 transfer from the configured reserve. The simulation returned `success: true`, `wouldRevert: false` and a gas estimate of `51875`.
7. Runlock matched the human approval header to the locked manifest, repeated preflight and broadcast the unchanged action with a deterministic idempotency key.
8. KeeperHub returned a verified successful receipt. A fresh RPC snapshot then reported 100 fDAI in the Safe and 30 days of projected runway.
9. `RUNLOCK_LIVE_EXECUTION` remained `false` in `.env`; it was enabled only for the controlled execution process.

## Repository evidence

- [`keeperhub-live-manifest.json`](evidence/keeperhub-live-manifest.json): locked recovery manifest
- [`keeperhub-live-preflight.json`](evidence/keeperhub-live-preflight.json): non-broadcast KeeperHub simulation
- [`keeperhub-live-receipt.json`](evidence/keeperhub-live-receipt.json): KeeperHub execution and verified receipt
- [`keeperhub-live-snapshot-after.json`](evidence/keeperhub-live-snapshot-after.json): post-execution RPC treasury state

The on-chain transaction link is the independent public proof of value movement. Repository JSON files preserve the Runlock and KeeperHub application-level record around that transaction.

## Scope of the evidence

This transaction proves that Runlock generated, policy-checked, locked, simulated and executed a KeeperHub reserve-to-Safe recovery transfer.

It does not claim that:

- The Safe activation transaction was a KeeperHub transaction.
- A live Superfluid stream was created, updated or deleted in this execution.
- Demo-mode transaction hashes are on-chain evidence.
- fDAI represents mainnet funds; it is a Sepolia test asset.

Runlock does read the configured Superfluid token balance and CFA flow state on-chain. The included demo scenario exercises stream-adjustment planning separately from the verified live top-up.
