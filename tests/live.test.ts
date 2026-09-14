import assert from "node:assert/strict";
import test from "node:test";
import { SECONDS_PER_MONTH } from "../lib/runlock/math.ts";
import {
  parseLiveTreasuryConfig,
  readLiveTreasurySnapshot,
  type LiveReader,
  type LiveTreasuryConfig,
} from "../lib/runlock/live.ts";

const addresses = {
  safe: "0x1000000000000000000000000000000000000001",
  baseToken: "0x1000000000000000000000000000000000000002",
  superToken: "0x1000000000000000000000000000000000000003",
  cfa: "0x1000000000000000000000000000000000000004",
  protected:
    "0x1000000000000000000000000000000000000005",
  adjustable:
    "0x1000000000000000000000000000000000000006",
} as const;

const config: LiveTreasuryConfig = {
  rpcUrl: "https://rpc.example",
  safeAddress: addresses.safe,
  baseTokenAddress: addresses.baseToken,
  baseTokenDecimals: 6,
  superTokenAddress: addresses.superToken,
  superTokenDecimals: 18,
  cfaAddress: addresses.cfa,
  monthlyInflows: 100,
  otherMonthlyCosts: 50,
  streams: [
    {
      id: "stream-core",
      receiver: addresses.protected,
      label: "Core",
      protected: true,
    },
    {
      id: "stream-community",
      receiver: addresses.adjustable,
      label: "Community",
      protected: false,
    },
  ],
};

const monthlyFlowRate = (amount: number) =>
  BigInt(amount) *
  10n ** 18n /
  BigInt(SECONDS_PER_MONTH);

const reader: LiveReader = {
  async readSafe() {
    return {
      owners: 3,
      threshold: 2,
      nonce: 9,
    };
  },

  async readBalance(token) {
    return token === addresses.baseToken
      ? 392_000_000n
      : 138n * 10n ** 18n;
  },

  async readFlowRate(
    _cfa,
    _token,
    _sender,
    receiver,
  ) {
    return receiver === addresses.protected
      ? monthlyFlowRate(340)
      : monthlyFlowRate(210);
  },
};

test(
  "live adapter combines Safe, token and Superfluid state",
  async () => {
    const snapshot =
      await readLiveTreasurySnapshot(config, reader);

    assert.equal(snapshot.source, "rpc");
    assert.equal(snapshot.safe.threshold, 2);
    assert.equal(snapshot.safe.owners, 3);
    assert.equal(snapshot.safe.nonce, 9);
    assert.equal(snapshot.liquidBaseToken, 392);
    assert.equal(snapshot.superTokenBalance, 138);
    assert.equal(snapshot.streams.length, 2);

    assert.ok(
      Math.abs(
        snapshot.streams[0]!.monthlyAmount - 340,
      ) < 0.000001,
    );

    assert.ok(
      Math.abs(
        snapshot.streams[1]!.monthlyAmount - 210,
      ) < 0.000001,
    );

    assert.ok(
      snapshot.streams.every(
        (stream) => stream.status === "active",
      ),
    );
  },
);

test("zero flow is reported as paused", async () => {
  const pausedReader: LiveReader = {
    ...reader,
    async readFlowRate() {
      return 0n;
    },
  };

  const snapshot =
    await readLiveTreasurySnapshot(
      config,
      pausedReader,
    );

  assert.ok(
    snapshot.streams.every(
      (stream) => stream.status === "paused",
    ),
  );

  assert.ok(
    snapshot.streams.every(
      (stream) => stream.monthlyAmount === 0,
    ),
  );
});

test(
  "live configuration fails closed when required values are missing",
  () => {
    assert.throws(
      () =>
        parseLiveTreasuryConfig({
          RUNLOCK_MODE: "live",
        }),
      /RUNLOCK_STREAMS_JSON is required/,
    );
  },
);
