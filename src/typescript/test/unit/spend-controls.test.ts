import { describe, it, expect, beforeEach } from "vitest";
import { x402Client } from "@x402/core/client";
import { ExactNanoScheme as ClientExactNanoScheme } from "../../client";
import {
  MOCK_SIGNER,
  MOCK_PAYMENT_REQUIRED_RESPONSE_CLIENT,
  MOCK_PAYMENT_REQUIREMENT_A,
  NETWORK,
} from "./setup";
import { CURRENCY_CODE_XNO, XNO_DECIMALS } from "../../constants";

// ---------------------------------------------------

const ONE_XNO_RAW = (10n ** BigInt(XNO_DECIMALS)).toString();
const TWO_XNO_RAW = (2n * 10n ** BigInt(XNO_DECIMALS)).toString();

function paymentRequiredWithAmount(amount: string) {
  const requirement = { ...MOCK_PAYMENT_REQUIREMENT_A, amount };
  return { ...MOCK_PAYMENT_REQUIRED_RESPONSE_CLIENT, accepts: [requirement] };
}

// ---------------------------------------------------
describe("@x402nano/exact - Client with default spend controls", () => {
  let scheme: ClientExactNanoScheme;
  let client: x402Client;

  beforeEach(() => {
    scheme = new ClientExactNanoScheme(MOCK_SIGNER);
    client = new x402Client();
    client.register(NETWORK, scheme);
  });

  // -----

  it("should return the XNO default asset with 30 decimals on Nano networks", () => {
    const expected = { asset: CURRENCY_CODE_XNO, decimals: 30, symbol: CURRENCY_CODE_XNO };
    expect(scheme.findDefaultAsset(CURRENCY_CODE_XNO, "nano:mainnet")).toStrictEqual(expected);
    expect(scheme.findDefaultAsset(CURRENCY_CODE_XNO, "nano:betanet")).toStrictEqual(expected);
  });

  // -----

  it("should return no default asset for another asset or network", () => {
    expect(scheme.findDefaultAsset("USDC", "nano:mainnet")).toBeUndefined();
    expect(scheme.findDefaultAsset("xno", "nano:mainnet")).toBeUndefined();
    expect(scheme.findDefaultAsset(CURRENCY_CODE_XNO, "eip155:8453")).toBeUndefined();
  });

  // -----

  it("should admit a Nano requirement with no spend-control config", async () => {
    const result = await client.createPaymentPayload(MOCK_PAYMENT_REQUIRED_RESPONSE_CLIENT);

    expect(result).toHaveProperty("payload.block");
  });

  // -----

  it("should admit exactly 1 XNO under the default $1 cap (read as 1 whole XNO)", async () => {
    const result = await client.createPaymentPayload(paymentRequiredWithAmount(ONE_XNO_RAW));

    expect(result).toHaveProperty("payload.block");
  });

  // -----

  it("should refuse a 2 XNO requirement under the default $1 cap (read as 1 whole XNO)", async () => {
    await expect(
      client.createPaymentPayload(paymentRequiredWithAmount(TWO_XNO_RAW)),
    ).rejects.toThrow(/spendControls\.maxAmountPerPayment/);
  });

  // -----

  it("should admit a 2 XNO requirement when the caller raises the cap per asset", async () => {
    client.setSpendControls({
      allowedAssets: [
        { network: NETWORK, asset: CURRENCY_CODE_XNO, maxAmountPerPayment: TWO_XNO_RAW },
      ],
    });

    const result = await client.createPaymentPayload(paymentRequiredWithAmount(TWO_XNO_RAW));

    expect(result).toHaveProperty("payload.block");
  });
});
