# KeeperHub setup

## 1. Create an organization API key

Create a `kh_` key in KeeperHub. A read-scoped key is sufficient for simulation. Broadcasting requires `mcp:write` or `mcp:admin`. Never expose the key through a `NEXT_PUBLIC_` variable.

## 2. Connect a wallet

Configure the organization wallet in KeeperHub. For the intended demo, link the wallet or Safe smart account that controls the Sepolia Superfluid streams. Confirm its address before continuing.

## 3. Build the monitoring workflow

Use KeeperHub MCP or the visual builder. Discover the authoritative current action schemas with `list_action_schemas` or `search_protocol_actions`; do not guess fields from this document.

Suggested workflow:

```text
Manual trigger
  -> Safe: Get Owners
  -> Safe: Get Threshold
  -> Safe: Get Nonce
  -> Web3: Check USDC balance
  -> Superfluid: Get SuperToken Balance
  -> Superfluid: Get Flow (one node per configured receiver)
  -> Code: normalize output into the TreasurySnapshot shape
```

The workflow's final output must match:

```json
{
  "chainId": 11155111,
  "chainName": "Sepolia",
  "safeAddress": "0x...",
  "safe": { "owners": 3, "threshold": 2, "nonce": 47 },
  "liquidUsdc": 392,
  "superTokenBalance": 138,
  "monthlyInflows": 100,
  "otherMonthlyCosts": 100,
  "streams": [
    { "id": "stream-core", "receiver": "0x...", "label": "Core engineering", "monthlyAmount": 340, "protected": true, "status": "active" }
  ]
}
```

Save its ID as `KEEPERHUB_MONITOR_WORKFLOW_ID`.

## 4. Configure and preflight

Copy `.env.example` to `.env`, add the API key and workflow ID, keep `RUNLOCK_LIVE_EXECUTION=false`, and set `RUNLOCK_MODE=live`. Refresh state in Runlock and use **Simulate exact plan**.

KeeperHub direct protocol actions do not currently dry-run. Runlock therefore compiles Superfluid operations to `/api/execute/contract-call`, the documented KeeperHub surface that supports `simulate: true`.

## 5. Broadcast once

Only after every simulation succeeds:

1. Verify the displayed manifest fingerprint.
2. Set `RUNLOCK_LIVE_EXECUTION=true`.
3. Restart the application.
4. Simulate once more.
5. Approve and execute.

Capture the returned transaction link and KeeperHub execution evidence for the hackathon submission.
