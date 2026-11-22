import { describe, it, expect, vi, afterEach } from "vitest";
import { deriveAccountFromLink, deriveAccountFromPrivateKey } from "nano-sdk/crypto";
import { createClientNanoSigner } from "../../";
import { NETWORK } from "./setup";

// Throwaway keys built at run time; none of them holds funds.
const PAYER_KEY = "1".repeat(64);
const PAYER = deriveAccountFromPrivateKey({ privateKey: PAYER_KEY });
const FRONTIER_REP = deriveAccountFromPrivateKey({ privateKey: "2".repeat(64) });
const HOME_REP = deriveAccountFromPrivateKey({ privateKey: "3".repeat(64) });
const BOUND_REP = deriveAccountFromPrivateKey({ privateKey: "4".repeat(64) });
const PAY_TO = deriveAccountFromPrivateKey({ privateKey: "5".repeat(64) });

const FRONTIER_HASH = "A".repeat(64);
const ONE_XNO_RAW = (10n ** 30n).toString();

function stubNode(frontierRepresentative: string) {
  const frontierBlock = {
    type: "state",
    account: PAYER,
    previous: "B".repeat(64),
    representative: frontierRepresentative,
    balance: (5n * 10n ** 30n).toString(),
    link: "C".repeat(64),
    link_as_account: deriveAccountFromLink({ link: "C".repeat(64) }),
    signature: "D".repeat(128),
    work: "0000000000000000",
  };

  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: { body: string }) => {
      const { action } = JSON.parse(init.body);
      const body =
        action === "account_info"
          ? {
              frontier: FRONTIER_HASH,
              balance: frontierBlock.balance,
              representative: frontierRepresentative,
            }
          : { contents: frontierBlock, block_account: PAYER, balance: frontierBlock.balance };
      return new Response(JSON.stringify(body), { status: 200 });
    }),
  );
}

function payment(representative?: string) {
  return {
    payTo: PAY_TO,
    amount: ONE_XNO_RAW,
    network: NETWORK,
    skipWorkGeneration: true,
    ...(representative ? { representative } : {}),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("@x402nano/exact - Signer representative", () => {
  it("keeps the frontier's representative when none is configured (unchanged default)", async () => {
    stubNode(FRONTIER_REP);
    const signer = createClientNanoSigner({
      accountPrivateKey: PAYER_KEY,
      rpcUrl: "http://127.0.0.1/rpc",
    });

    const block = await signer.generateSendBlock(payment());

    expect(block.representative).toBe(FRONTIER_REP);
  });

  it("sets a per-payment representative on that send block", async () => {
    stubNode(HOME_REP);
    const signer = createClientNanoSigner({
      accountPrivateKey: PAYER_KEY,
      rpcUrl: "http://127.0.0.1/rpc",
      representative: HOME_REP,
    });

    const block = await signer.generateSendBlock(payment(BOUND_REP));

    expect(block.representative).toBe(BOUND_REP);
    expect(block.link_as_account).toBe(PAY_TO);
  });

  it("restores the configured representative on the next send, also from a fresh signer", async () => {
    // The frontier now carries the per-payment representative of the previous send.
    stubNode(BOUND_REP);
    const restarted = createClientNanoSigner({
      accountPrivateKey: PAYER_KEY,
      rpcUrl: "http://127.0.0.1/rpc",
      representative: HOME_REP,
    });

    const block = await restarted.generateSendBlock(payment());

    expect(block.representative).toBe(HOME_REP);
  });

  it("refuses a per-payment representative when no representative is configured to restore", async () => {
    stubNode(FRONTIER_REP);
    const signer = createClientNanoSigner({
      accountPrivateKey: PAYER_KEY,
      rpcUrl: "http://127.0.0.1/rpc",
    });

    await expect(signer.generateSendBlock(payment(BOUND_REP))).rejects.toThrow(/restore/);
  });

  it("refuses a representative that fails the account checksum", async () => {
    stubNode(HOME_REP);
    const signer = createClientNanoSigner({
      accountPrivateKey: PAYER_KEY,
      rpcUrl: "http://127.0.0.1/rpc",
      representative: HOME_REP,
    });
    const badChecksum = BOUND_REP.slice(0, -1) + (BOUND_REP.endsWith("1") ? "3" : "1");

    await expect(signer.generateSendBlock(payment(badChecksum))).rejects.toThrow(
      /Invalid representative/,
    );
    expect(() =>
      createClientNanoSigner({
        accountPrivateKey: PAYER_KEY,
        rpcUrl: "http://127.0.0.1/rpc",
        representative: badChecksum,
      }),
    ).toThrow();
  });
});
