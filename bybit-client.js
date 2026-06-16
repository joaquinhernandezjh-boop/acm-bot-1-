// ============================================================
// bybit-client.js
// Cliente real para la API de Bybit V5 (Futures USDT-M / linear)
// Soporta testnet y mainnet vía variable de entorno BYBIT_TESTNET
// ============================================================

const crypto = require("crypto");

const BASE_URL = process.env.BYBIT_TESTNET === "true"
  ? "https://api-testnet.bybit.com"
  : "https://api.bybit.com";

const API_KEY = process.env.BYBIT_API_KEY;
const API_SECRET = process.env.BYBIT_API_SECRET;
const RECV_WINDOW = "5000";

if (!API_KEY || !API_SECRET) {
  console.warn("[BybitClient] Faltan BYBIT_API_KEY / BYBIT_API_SECRET en las variables de entorno.");
}

function sign(payload) {
  return crypto.createHmac("sha256", API_SECRET).update(payload).digest("hex");
}

function timestamp() {
  return Date.now().toString();
}

// Construye los headers firmados según el spec de Bybit V5
function buildHeaders(payloadStr) {
  const ts = timestamp();
  const preSign = ts + API_KEY + RECV_WINDOW + payloadStr;
  const signature = sign(preSign);
  return {
    "X-BAPI-API-KEY": API_KEY,
    "X-BAPI-SIGN": signature,
    "X-BAPI-SIGN-TYPE": "2",
    "X-BAPI-TIMESTAMP": ts,
    "X-BAPI-RECV-WINDOW": RECV_WINDOW,
    "Content-Type": "application/json"
  };
}

async function bybitGet(endpoint, params = {}) {
  const query = new URLSearchParams(params).toString();
  const headers = buildHeaders(query);
  const url = `${BASE_URL}${endpoint}${query ? "?" + query : ""}`;
  const res = await fetch(url, { method: "GET", headers });
  const json = await res.json();
  if (json.retCode !== 0) {
    throw new Error(`[Bybit GET ${endpoint}] ${json.retCode}: ${json.retMsg}`);
  }
  return json.result;
}

async function bybitPost(endpoint, body = {}) {
  const payloadStr = JSON.stringify(body);
  const headers = buildHeaders(payloadStr);
  const url = `${BASE_URL}${endpoint}`;
  const res = await fetch(url, { method: "POST", headers, body: payloadStr });
  const json = await res.json();
  if (json.retCode !== 0) {
    throw new Error(`[Bybit POST ${endpoint}] ${json.retCode}: ${json.retMsg}`);
  }
  return json.result;
}

// ------------------------------------------------------------
// Cuenta / Balance
// ------------------------------------------------------------

async function getBalance(coin = "USDT") {
  const result = await bybitGet("/v5/account/wallet-balance", {
    accountType: "UNIFIED",
    coin
  });
  const account = result.list?.[0];
  const coinData = account?.coin?.find(c => c.coin === coin);
  return {
    totalEquity: parseFloat(account?.totalEquity || 0),
    availableBalance: parseFloat(coinData?.availableToWithdraw || account?.totalAvailableBalance || 0),
    walletBalance: parseFloat(coinData?.walletBalance || 0)
  };
}

// ------------------------------------------------------------
// Configuración de apalancamiento (una vez por símbolo, o al cambiarlo)
// ------------------------------------------------------------

async function setLeverage(symbol, leverage = 5) {
  return bybitPost("/v5/position/set-leverage", {
    category: "linear",
    symbol,
    buyLeverage: String(leverage),
    sellLeverage: String(leverage)
  });
}

// ------------------------------------------------------------
// Precio actual (ticker)
// ------------------------------------------------------------

async function getTicker(symbol) {
  const result = await bybitGet("/v5/market/tickers", {
    category: "linear",
    symbol
  });
  const t = result.list?.[0];
  return { symbol, lastPrice: parseFloat(t?.lastPrice || 0) };
}

// ------------------------------------------------------------
// Abrir orden de mercado con TP/SL adjuntos
// side: "Buy" (LONG) | "Sell" (SHORT)
// qty: cantidad en el activo base (no en USD) — calcular antes de llamar
// ------------------------------------------------------------

async function placeMarketOrder({ symbol, side, qty, takeProfit, stopLoss }) {
  const body = {
    category: "linear",
    symbol,
    side, // "Buy" o "Sell"
    orderType: "Market",
    qty: String(qty),
    timeInForce: "IOC",
    reduceOnly: false,
    closeOnTrigger: false
  };
  if (takeProfit) body.takeProfit = String(takeProfit);
  if (stopLoss) body.stopLoss = String(stopLoss);

  return bybitPost("/v5/order/create", body);
}

// ------------------------------------------------------------
// Cerrar posición abierta a mercado (orden reduceOnly en sentido contrario)
// ------------------------------------------------------------

async function closePosition(symbol, side, qty) {
  const closingSide = side === "Buy" ? "Sell" : "Buy";
  return bybitPost("/v5/order/create", {
    category: "linear",
    symbol,
    side: closingSide,
    orderType: "Market",
    qty: String(qty),
    timeInForce: "IOC",
    reduceOnly: true,
    closeOnTrigger: false
  });
}

// ------------------------------------------------------------
// Consultar posiciones abiertas
// ------------------------------------------------------------

async function getPositions(symbol) {
  const result = await bybitGet("/v5/position/list", {
    category: "linear",
    symbol
  });
  return result.list || [];
}

// ------------------------------------------------------------
// Reglas de tamaño mínimo / step por símbolo (instrumentos)
// Necesario porque Bybit exige qty con precisión exacta por símbolo
// ------------------------------------------------------------

async function getInstrumentInfo(symbol) {
  const result = await bybitGet("/v5/market/instruments-info", {
    category: "linear",
    symbol
  });
  const info = result.list?.[0];
  return {
    minOrderQty: parseFloat(info?.lotSizeFilter?.minOrderQty || 0),
    qtyStep: parseFloat(info?.lotSizeFilter?.qtyStep || 0.001),
    tickSize: parseFloat(info?.priceFilter?.tickSize || 0.01)
  };
}

function roundToStep(qty, step) {
  const precision = Math.max(0, Math.round(-Math.log10(step)));
  return parseFloat((Math.floor(qty / step) * step).toFixed(precision));
}

function roundToTick(price, tick) {
  const precision = Math.max(0, Math.round(-Math.log10(tick)));
  return parseFloat((Math.round(price / tick) * tick).toFixed(precision));
}

// ------------------------------------------------------------
// Todas las posiciones abiertas en una sola llamada (más eficiente
// que consultar símbolo por símbolo y evita rate limits)
// ------------------------------------------------------------

async function getAllPositions() {
  const result = await bybitGet("/v5/position/list", {
    category: "linear",
    settleCoin: "USDT"
  });
  return result.list || [];
}

// ------------------------------------------------------------
// PNL realizado más reciente de un símbolo (para registrar el
// resultado exacto, con fees, cuando una posición se cierra)
// ------------------------------------------------------------

async function getClosedPnl(symbol, limit = 1) {
  const result = await bybitGet("/v5/position/closed-pnl", {
    category: "linear",
    symbol,
    limit: String(limit)
  });
  return result.list || [];
}

module.exports = {
  BASE_URL,
  getBalance,
  setLeverage,
  getTicker,
  placeMarketOrder,
  closePosition,
  getPositions,
  getAllPositions,
  getClosedPnl,
  getInstrumentInfo,
  roundToStep,
  roundToTick
};
