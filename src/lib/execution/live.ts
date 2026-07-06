import { ClobClient, OrderType, Side, type ApiKeyCreds } from "@polymarket/clob-client";
import { Wallet } from "ethers";

const CLOB_HOST = process.env.POLYMARKET_CLOB_URL ?? "https://clob.polymarket.com";
const POLYGON_CHAIN_ID = 137;

/**
 * Live trading is entirely opt-in and gated on env vars that only exist if
 * you set them as Vercel secrets -- nothing here runs, and no real order is
 * ever placed, unless both TRADING_MODE=live and POLYMARKET_PRIVATE_KEY are
 * configured. Paper mode never imports the signer at all.
 */
export function isLiveTradingConfigured(): boolean {
  return Boolean(process.env.POLYMARKET_PRIVATE_KEY && process.env.POLYMARKET_FUNDER_ADDRESS);
}

/** Adapts an ethers v6 Wallet to the ethers v5-shaped signer the CLOB client expects. */
class EthersV6SignerAdapter {
  constructor(private wallet: Wallet) {}

  async _signTypedData(
    domain: Record<string, unknown>,
    types: Record<string, Array<{ name: string; type: string }>>,
    value: Record<string, unknown>
  ): Promise<string> {
    return this.wallet.signTypedData(domain, types, value);
  }

  async getAddress(): Promise<string> {
    return this.wallet.getAddress();
  }
}

let cachedClient: ClobClient | null = null;

async function getLiveClient(): Promise<ClobClient> {
  if (cachedClient) return cachedClient;

  const privateKey = process.env.POLYMARKET_PRIVATE_KEY;
  const funder = process.env.POLYMARKET_FUNDER_ADDRESS;
  if (!privateKey || !funder) {
    throw new Error(
      "Live trading is not configured: set POLYMARKET_PRIVATE_KEY and POLYMARKET_FUNDER_ADDRESS"
    );
  }

  const wallet = new Wallet(privateKey);
  const signer = new EthersV6SignerAdapter(wallet);
  // signatureType 1 = Magic/email login wallets; 0 = browser wallet (Metamask etc).
  // Most Polymarket accounts created via email use 1 -- override with
  // POLYMARKET_SIGNATURE_TYPE if you connected a browser wallet instead.
  const signatureType = Number(process.env.POLYMARKET_SIGNATURE_TYPE ?? "1");

  const bootstrapClient = new ClobClient(CLOB_HOST, POLYGON_CHAIN_ID, signer);
  const creds: ApiKeyCreds = await bootstrapClient.createOrDeriveApiKey();

  cachedClient = new ClobClient(
    CLOB_HOST,
    POLYGON_CHAIN_ID,
    signer,
    creds,
    signatureType,
    funder
  );
  return cachedClient;
}

export interface LiveOrderResult {
  success: boolean;
  orderId?: string;
  raw: unknown;
}

/** Places an immediate-or-cancel market order. `amountUsd` for BUY, share count for SELL. */
export async function placeLiveMarketOrder(
  tokenId: string,
  side: "BUY" | "SELL",
  amount: number
): Promise<LiveOrderResult> {
  const client = await getLiveClient();

  const raw = await client.createAndPostMarketOrder(
    { tokenID: tokenId, side: side === "BUY" ? Side.BUY : Side.SELL, amount },
    {},
    OrderType.FOK
  );

  return {
    success: Boolean(raw && !raw.error),
    orderId: raw?.orderID ?? raw?.orderId,
    raw,
  };
}
