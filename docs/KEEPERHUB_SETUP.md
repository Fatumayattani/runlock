# KeeperHub setup

Runlock has two deliberately separate operating modes.

## Public demo mode

Set `RUNLOCK_MODE=demo` or leave it unset.

Demo mode requires no credentials and never broadcasts transactions.
It demonstrates planning, hashing, simulation and approval safely.

The public deployment runs in this mode:

- https://runlock.fyattani.workers.dev

The Keeper runs view also displays the separately verified live receipt.

## Live treasury monitoring

Set `RUNLOCK_MODE=live` and configure:

- `RUNLOCK_RPC_URL`
- `RUNLOCK_SAFE_ADDRESS`
- `RUNLOCK_BASE_TOKEN_ADDRESS`
- `RUNLOCK_BASE_TOKEN_DECIMALS`
- `RUNLOCK_SUPER_TOKEN_ADDRESS`
- `RUNLOCK_SUPER_TOKEN_DECIMALS`
- `RUNLOCK_CFA_ADDRESS`
- `RUNLOCK_STREAMS_JSON`
- `RUNLOCK_MONTHLY_INFLOWS`
- `RUNLOCK_OTHER_MONTHLY_COSTS`

Runlock reads the Safe configuration and token balances from Sepolia RPC.
It also reads each configured Superfluid CFA flow directly onchain.

## KeeperHub execution

Configure these server-side values:

- `KEEPERHUB_API_URL=https://app.keeperhub.com/api`
- `KEEPERHUB_API_KEY`
- `RUNLOCK_RESERVE_ADDRESS`

Use a KeeperHub key with the minimum required read and write scopes.
Never expose that key in browser code, logs, evidence or Git.

Keep this switch disabled during normal development:

```env
RUNLOCK_LIVE_EXECUTION=false
```

## Controlled execution procedure

1. Read a fresh live treasury snapshot.
2. Review the generated recovery manifest and policy checks.
3. Simulate the locked action through KeeperHub.
4. Confirm that simulation succeeded without a revert.
5. Match human approval to the exact manifest hash.
6. Enable live execution only for the controlled process.
7. Broadcast the unchanged action with its idempotency key.
8. Poll for completion and verify the successful onchain receipt.
9. Read a fresh RPC snapshot to confirm the resulting treasury state.
10. Return `RUNLOCK_LIVE_EXECUTION` to `false`.

Do not enable live execution for unverified stream-mutation actions.
The verified Runlock execution covers a reserve-to-Safe token transfer.

## Verified evidence

The successful Sepolia execution transferred 100 fDAI to the Runlock Safe.

- Execution ID: `f52whszt34pmdecl1r09r`
- Transaction: `0x941ac927033ff1e81044d030c4b1d0e26eb9620ac2ab94543f7d58f403d56c42`
- Receipt status: `success`
- Receipt verification: `verified: true`

See [`VERIFIED_EXECUTION.md`](VERIFIED_EXECUTION.md) for the full record.
