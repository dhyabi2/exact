import {
  DefaultAsset,
  Network,
  PaymentPayload,
  PaymentRequirements,
  SchemeNetworkClient,
} from "@x402/core/types";
import { SignerClass, ExactNanoPayload } from "../types";
import { StateBlock } from "nano-sdk/blocks";
import { CURRENCY_CODE_XNO, XNO_DECIMALS } from "../constants";

/**
 * The XNO entry `findDefaultAsset` returns for Nano networks.
 */
const XNO_DEFAULT_ASSET: DefaultAsset = {
  asset: CURRENCY_CODE_XNO,
  decimals: XNO_DECIMALS,
  symbol: CURRENCY_CODE_XNO,
};

/**
 * Implementation of the x402 Nano "exact" payment scheme for Clients.
 *
 * This client generates payment payloads containing a Nano send block for fixed-amount payments.
 * It integrates with the x402 protocol to enable blockchain-based micropayments.
 */
export class ExactNanoScheme implements SchemeNetworkClient {
  /**
   * The payment scheme identifier.
   */
  readonly scheme = "exact";

  /**
   * Creates a new ExactNanoClient instance.
   *
   * @param signer - The Signer instance used for generating send blocks and communicating with Nano RPC
   */
  constructor(private readonly signer: SignerClass) {}

  /**
   * Reverse lookup used by the x402Client spend controls.
   *
   * Returns the XNO entry when the requirement's asset is exactly "XNO" (the asset the server
   * writes and the facilitator checks) on a `nano:` network, so a client with default spend
   * controls admits Nano requirements. The default `maxAmountPerPayment` of "$1" is then read
   * as 1 whole XNO (10^30 raw) per payment; raise or disable it with `setSpendControls`.
   *
   * @param asset - The asset from the payment requirements
   * @param network - The network from the payment requirements
   * @returns The XNO default asset entry, or undefined for any other asset or network
   */
  findDefaultAsset(asset: string, network: Network): DefaultAsset | undefined {
    if (asset !== CURRENCY_CODE_XNO || !network.startsWith("nano:")) {
      return undefined;
    }
    return XNO_DEFAULT_ASSET;
  }

  /**
   * Creates a payment payload for the Exact scheme with the specified requirements.
   *
   * @param x402Version - The version of the x402 protocol to use
   * @param paymentRequirements - The payment details including payTo recipient and amount
   * @returns A promise that resolves to a payment payload containing the protocol version and transaction payload data
   * @throws Error if generating the send block fails
   *
   * @example
   * ```ts
   * const payload = await client.createPaymentPayload(2, {
   *   payTo: 'nano_...',
   *   amount: '1000000000000000000000000'
   * })
   * ```
   */
  async createPaymentPayload(
    x402Version: number,
    paymentRequirements: PaymentRequirements,
  ): Promise<Pick<PaymentPayload, "x402Version" | "payload">> {
    let skipWorkGeneration: boolean = false;

    if (!paymentRequirements.payTo?.trim()) {
      throw new Error("Missing required payment field: payTo");
    }

    if (!paymentRequirements.amount?.trim()) {
      throw new Error("Missing required payment field: amount");
    }

    if (
      paymentRequirements.extra?.workOptional === true &&
      !this.signer.getConfig().workGenerator &&
      !this.signer.getConfig().workGenerationUrl
    ) {
      skipWorkGeneration = true;
    }

    let sendBlock: StateBlock;
    try {
      sendBlock = await this.signer.generateSendBlock({
        payTo: paymentRequirements.payTo,
        amount: paymentRequirements.amount,
        network: paymentRequirements.network,
        skipWorkGeneration,
      });
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(
          `Failed to generate Nano send block for Client. Cause: ${error.message.includes("Resulting raw amount must not be negative") ? "Not enough balance" : error.message}`,
        );
      }

      throw new Error(`Failed to generate Nano send block for Client`);
    }

    const payload: ExactNanoPayload = { block: sendBlock };

    return {
      x402Version,
      payload,
    };
  }
}
