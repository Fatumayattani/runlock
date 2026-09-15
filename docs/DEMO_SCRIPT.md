# Two-minute demo script

## 0:00 — The risk

Open the public Runlock application. Explain that it starts with a safe interactive demo scenario: the treasury has 19.4 days of runway, below its 21-day policy floor.

## 0:20 — The treasury

Open **Money streams**. Show that core engineering and operations are protected while community rewards and experimental tooling are adjustable. Return to **Command center** and show the deterministic recovery plan.

## 0:40 — The controls

Open **Policy vault**. Show the allowlisted chain and contracts, action-value ceiling, protected recipients, mandatory simulation and human approval.

## 1:00 — The dry run

Return to **Command center** and click **Simulate**. Explain that Runlock simulates the exact locked manifest and only unlocks approval when the simulation receipt matches its fingerprint.

## 1:20 — The approval flow

Open the approval dialog and compare the manifest fingerprint. Approve the demo execution. State clearly that the public deployment contains no execution credentials and does not broadcast transactions.

## 1:40 — The live proof

Open **Keeper runs**. Show **Verified live recovery** and open **View transaction**. Show the successful Sepolia transaction that transferred 100 fDAI through KeeperHub to the Runlock Safe.

Finish by explaining that the verified receipt, execution ID, locked manifest, preflight result and post-execution RPC snapshot are preserved in the repository. The live recovery raised the Safe from zero to 30 days of projected runway.
