import {
  createPublicClient,
  formatUnits,
  getAddress,
  http,
  parseAbi,
} from "viem";
import { sepolia } from "viem/chains";
import { SECONDS_PER_MONTH } from "./math.ts";
import type {
  Address,
  Stream,
  TreasurySnapshot,
} from "./types.ts";

const erc20Abi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
]);

const safeAbi = parseAbi([
  "function getOwners() view returns (address[])",
  "function getThreshold() view returns (uint256)",
  "function nonce() view returns (uint256)",
]);

const cfaAbi = parseAbi([
  "function getFlow(address token, address sender, address receiver) view returns (uint256 timestamp, int96 flowRate, uint256 deposit, uint256 owedDeposit)",
]);

export type MonitoredStream = Pick<
  Stream,
  "id" | "receiver" | "label" | "protected"
>;

export type LiveTreasuryConfig = {
  rpcUrl: string;
  safeAddress: Address;
  baseTokenAddress: Address;
  baseTokenDecimals: number;
  superTokenAddress: Address;
  superTokenDecimals: number;
  cfaAddress: Address;
  monthlyInflows: number;
  otherMonthlyCosts: number;
  streams: MonitoredStream[];
};

export type LiveReader = {
  readSafe(
    address: Address,
  ): Promise<{ owners: number; threshold: number; nonce: number }>;

  readBalance(
    token: Address,
    account: Address,
  ): Promise<bigint>;

  readFlowRate(
    cfa: Address,
    token: Address,
    sender: Address,
    receiver: Address,
  ): Promise<bigint>;
};

type Environment = Record<string, string | undefined>;

function required(env: Environment, name: string) {
  const value = env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required when RUNLOCK_MODE=live`);
  }

  return value;
}

function address(env: Environment, name: string): Address {
  const value = required(env, name);

  try {
    return getAddress(value) as Address;
  } catch {
    throw new Error(`${name} must be a valid EVM address`);
  }
}

function finiteNumber(
  env: Environment,
  name: string,
  fallback: number,
) {
  const value = env[name]?.trim();

  if (!value) return fallback;

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative number`);
  }

  return parsed;
}

export function parseLiveTreasuryConfig(
  env: Environment = process.env,
): LiveTreasuryConfig {
  const rawStreams = required(env, "RUNLOCK_STREAMS_JSON");

  let decoded: unknown;

  try {
    decoded = JSON.parse(rawStreams);
  } catch {
    throw new Error("RUNLOCK_STREAMS_JSON must be valid JSON");
  }

  if (!Array.isArray(decoded) || decoded.length === 0) {
    throw new Error(
      "RUNLOCK_STREAMS_JSON must contain at least one monitored stream",
    );
  }

  const streams = decoded.map(
    (item, index): MonitoredStream => {
      if (!item || typeof item !== "object") {
        throw new Error(
          `RUNLOCK_STREAMS_JSON[${index}] must be an object`,
        );
      }

      const candidate = item as Record<string, unknown>;

      if (
        typeof candidate.id !== "string" ||
        typeof candidate.label !== "string" ||
        typeof candidate.protected !== "boolean"
      ) {
        throw new Error(
          `RUNLOCK_STREAMS_JSON[${index}] has an invalid id, label, or protected flag`,
        );
      }

      try {
        return {
          id: candidate.id,
          label: candidate.label,
          protected: candidate.protected,
          receiver: getAddress(
            String(candidate.receiver),
          ) as Address,
        };
      } catch {
        throw new Error(
          `RUNLOCK_STREAMS_JSON[${index}].receiver must be a valid EVM address`,
        );
      }
    },
  );

  return {
    rpcUrl: required(env, "RUNLOCK_RPC_URL"),
    safeAddress: address(env, "RUNLOCK_SAFE_ADDRESS"),
    baseTokenAddress: address(env, "RUNLOCK_BASE_TOKEN_ADDRESS"),
    baseTokenDecimals: finiteNumber(
      env,
      "RUNLOCK_BASE_TOKEN_DECIMALS",
      6,
    ),
    superTokenAddress: address(
      env,
      "RUNLOCK_SUPER_TOKEN_ADDRESS",
    ),
    superTokenDecimals: finiteNumber(
      env,
      "RUNLOCK_SUPER_TOKEN_DECIMALS",
      18,
    ),
    cfaAddress: address(env, "RUNLOCK_CFA_ADDRESS"),
    monthlyInflows: finiteNumber(
      env,
      "RUNLOCK_MONTHLY_INFLOWS",
      0,
    ),
    otherMonthlyCosts: finiteNumber(
      env,
      "RUNLOCK_OTHER_MONTHLY_COSTS",
      0,
    ),
    streams,
  };
}

export function createViemReader(
  rpcUrl: string,
): LiveReader {
  const client = createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl),
  });

  return {
    async readSafe(safeAddress) {
      const [owners, threshold, nonce] = await Promise.all([
        client.readContract({
          address: safeAddress,
          abi: safeAbi,
          functionName: "getOwners",
        }),
        client.readContract({
          address: safeAddress,
          abi: safeAbi,
          functionName: "getThreshold",
        }),
        client.readContract({
          address: safeAddress,
          abi: safeAbi,
          functionName: "nonce",
        }),
      ]);

      return {
        owners: owners.length,
        threshold: Number(threshold),
        nonce: Number(nonce),
      };
    },

    readBalance(token, account) {
      return client.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [account],
      });
    },

    async readFlowRate(
      cfa,
      token,
      sender,
      receiver,
    ) {
      const [, flowRate] = await client.readContract({
        address: cfa,
        abi: cfaAbi,
        functionName: "getFlow",
        args: [token, sender, receiver],
      });

      return flowRate;
    },
  };
}

export async function readLiveTreasurySnapshot(
  config = parseLiveTreasuryConfig(),
  reader = createViemReader(config.rpcUrl),
): Promise<TreasurySnapshot> {
  const [
    safe,
    liquidRaw,
    superTokenRaw,
    flowRates,
  ] = await Promise.all([
    reader.readSafe(config.safeAddress),
    reader.readBalance(
      config.baseTokenAddress,
      config.safeAddress,
    ),
    reader.readBalance(
      config.superTokenAddress,
      config.safeAddress,
    ),
    Promise.all(
      config.streams.map((stream) =>
        reader.readFlowRate(
          config.cfaAddress,
          config.superTokenAddress,
          config.safeAddress,
          stream.receiver,
        ),
      ),
    ),
  ]);

  const streams = config.streams.map(
    (stream, index): Stream => {
      const flowRate = flowRates[index] ?? 0n;
      const monthlyRaw =
        flowRate > 0n
          ? flowRate * BigInt(SECONDS_PER_MONTH)
          : 0n;

      return {
        ...stream,
        monthlyAmount: Number(
          formatUnits(
            monthlyRaw,
            config.superTokenDecimals,
          ),
        ),
        status: flowRate > 0n ? "active" : "paused",
      };
    },
  );

  return {
    capturedAt: new Date().toISOString(),
    source: "rpc",
    chainId: sepolia.id,
    chainName: "Sepolia",
    safeAddress: config.safeAddress,
    safe,
    liquidBaseToken: Number(
      formatUnits(liquidRaw, config.baseTokenDecimals),
    ),
    superTokenBalance: Number(
      formatUnits(
        superTokenRaw,
        config.superTokenDecimals,
      ),
    ),
    monthlyInflows: config.monthlyInflows,
    otherMonthlyCosts: config.otherMonthlyCosts,
    streams,
  };
}
