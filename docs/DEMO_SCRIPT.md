# Two-minute demo script

## 0:00 — The risk

Open Runlock. The Safe has 19.4 days of runway, below its 21-day policy floor. Show that balances, active streams and Safe configuration came from the monitoring surface.

## 0:20 — The decision

Open **Streams**. Core engineering and operations are protected. Community rewards and experimental tooling are adjustable. Return to **Overview** and show the three deterministic recovery actions.

## 0:45 — The control

Open **Policy checks**. Point out the allowlisted chain and contracts, the 100 USDC action ceiling, protected recipients, mandatory simulation and human approval.

## 1:05 — The dry run

Click **Simulate exact plan**. Explain that Runlock sends the exact contract addresses, ABI functions and arguments to KeeperHub with `simulate: true`. The execution button only unlocks when the receipt matches the current manifest hash.

## 1:25 — The execution

Click **Approve & execute**, compare the fingerprint in the confirmation dialog, then approve. KeeperHub executes the identical calls with deterministic idempotency keys.

## 1:45 — The proof

Open **Audit trail**. Show the KeeperHub receipt and open the real Sepolia transaction link. Finish on the runway chart: protected streams continue, net burn discretionary burn falls, and runway reaches 30 days.
