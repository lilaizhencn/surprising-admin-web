import { type ProductLine, type Instrument } from "../types";

export const INSTRUMENT_STATUSES = ["DRAFT", "PRE_TRADING", "TRADING", "HALT", "SETTLING", "CLOSED"];

export const ACCOUNT_TYPES = ["", "FUNDING", "SPOT", "USDT_PERPETUAL", "COIN_PERPETUAL", "USDT_DELIVERY", "COIN_DELIVERY", "OPTION"];

export const PRODUCT_LINES = ["", "SPOT", "LINEAR_PERPETUAL", "INVERSE_PERPETUAL", "LINEAR_DELIVERY", "INVERSE_DELIVERY", "OPTION"] as const;

const ACCOUNT_TYPE_PRODUCT_LINE: Record<string, ProductLine> = {
  SPOT: "SPOT",
  USDT_PERPETUAL: "LINEAR_PERPETUAL",
  COIN_PERPETUAL: "INVERSE_PERPETUAL",
  USDT_DELIVERY: "LINEAR_DELIVERY",
  COIN_DELIVERY: "INVERSE_DELIVERY",
  OPTION: "OPTION"
};

export const productLineForAccountType = (accountType: string) => ACCOUNT_TYPE_PRODUCT_LINE[accountType] ?? "";

const PRODUCT_LINE_ACCOUNT_TYPE: Record<string, string> = Object.fromEntries(
  Object.entries(ACCOUNT_TYPE_PRODUCT_LINE).map(([accountType, productLine]) => [productLine, accountType])
);

export const accountTypeForProductLine = (productLine: string) => PRODUCT_LINE_ACCOUNT_TYPE[productLine] ?? "USDT_DELIVERY";

export const defaultAssetForProductLine = (productLine: string) => productLine === "INVERSE_DELIVERY" ? "BTC" : "USDT";

export function productLineForInstrument(instrument?: Pick<Instrument, "instrumentType" | "contractType">): ProductLine | "" {
  if (instrument?.instrumentType === "SPOT" || instrument?.contractType === "SPOT") return "SPOT";
  if (instrument?.instrumentType === "OPTION" || instrument?.contractType === "VANILLA_OPTION") return "OPTION";
  if (instrument?.contractType === "LINEAR_DELIVERY") return "LINEAR_DELIVERY";
  if (instrument?.contractType === "INVERSE_DELIVERY") return "INVERSE_DELIVERY";
  if (instrument?.contractType === "INVERSE_PERPETUAL") return "INVERSE_PERPETUAL";
  if (instrument?.contractType === "LINEAR_PERPETUAL") return "LINEAR_PERPETUAL";
  return "";
}
