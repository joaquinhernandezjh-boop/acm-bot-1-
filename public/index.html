const express = require("express");
const fs = require("fs");
const path = require("path");
const http = require("http");
const WebSocket = require("ws");
const bybit = require("./bybit-client");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
const MEMORY_FILE = path.join(__dirname, "acm-memory.json");

// ============================================================
// SEGURIDAD: si BYBIT_TESTNET no es "true", exigimos confirmación
// explícita para evitar arrancar en mainnet por error.
// ============================================================
const ES_TESTNET = process.env.BYBIT_TESTNET === "true";
if (!ES_TESTNET && process.env.CONFIRM_LIVE !== "YES") {
  console.error(
    "[SEGURIDAD] BYBIT_TESTNET no es 'true' y CONFIRM_LIVE no es 'YES'. " +
    "Para operar con dinero real, agregá la variable CONFIRM_LIVE=YES en Railway. Bot detenido."
  );
  process.exit(1);
}
console.log(`[BybitClient] Conectado a ${bybit.BASE_URL} (${ES_TESTNET ? "TESTNET" : "MAINNET — DINERO REAL"})`);

function readMemory() {
  if (!fs.existsSync(MEMORY_FILE)) {
    const base = { wins: 0, losses: 0, totalTrades: 0, streak: 0, history: [] };
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(base, null, 2));
    return base;
  }
  try { return JSON.parse(fs.readFileSync(MEMORY_FILE, "utf8")); }
  catch (err) { return { wins: 0, losses: 0, totalTrades: 0, streak: 0, history: [] }; }
}

function writeMemory(data) {
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(data, null, 2));
}

let memory = readMemory();
let botActivo = true;
let leverageListo = false;

const CONFIG = {
  RIESGO_POR_TRADE: 0.10,
  TAKE_PROFIT: 0.0006,
  STOP_LOSS: 0.0003,
  MIN_CONFIANZA: 20,
  COOLDOWN_MS: 1500,
  HISTORIA_MAX: 200,
  LEVERAGE: 5,
  POLL_POSICIONES_MS: 4000
};

function crearEstadoPar(symbol) {
  return {
    symbol, price: 0, previousPrice: 0,
    coherencia: 0, dCoherencia: 0, momentum: 0,
    microVol: 0, advantage: 0, confianzaACM: 0,
    finalAction: "HOLD", enTrade: false, abriendoOrden: false, ultimoTrade: 0,
    position: { side: "-", entry: 0, qty: 0, sizeUSD: 0, mode: "REAL", reason: "-", tp: 0, sl: 0 },
    instrumento: { minOrderQty: 0, qtyStep: 0.001, tickSize: 0.01 },
    deltaHistory: [], marketStatus: "DISCONNECTED", engineStatus: "OFF"
  };
}

const pares = {
  BTCUSDT: crearEstadoPar("BTCUSDT"),
  ETHUSDT: crearEstadoPar("ETHUSDT"),
  SOLUSDT: crearEstadoPar("SOLUSDT"),
  ADAUSDT: crearEstadoPar("ADAUSDT"),
  ALGOUSDT: crearEstadoPar("ALGOUSDT")
};

const globalState = {
  botName: ES_TESTNET ? "SKYNET F-1 — BYBIT TESTNET" : "SKYNET F-1 — BYBIT LIVE",
  pnl: 0,
  balance: 0, // se carga real desde Bybit al iniciar
  wins: memory.wins || 0,
  losses: memory.losses || 0,
  totalTrades: memory.totalTrades || 0,
  streak: memory.streak || 0,
  history: memory.history || []
};

function avg(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function broadcast(payload) {
  const data = JSON.stringify(payload);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(data);
  });
}

function parSnapshot(p) {
  return {
    symbol: p.symbol, price: p.price,
    engineStatus: p.engineStatus, marketStatus: p.marketStatus,
    finalAction: p.finalAction, confianzaACM: p.confianzaACM,
    enTrade: p.enTrade, position: p.position,
    variables: {
      coherencia: p.coherencia, dCoherencia: p.dCoherencia,
      momentum: p.momentum, microVol: p.microVol
    }
  };
}

function snapshot() {
  return {
    botName: globalState.botName,
    pnl: globalState.pnl, balance: globalState.balance,
    wins: globalState.wins, losses: globalState.losses,
    totalTrades: globalState.totalTrades, streak: globalState.streak,
    botActivo,
    pares: Object.fromEntries(
      Object.keys(pares).map(symbol => [symbol, parSnapshot(pares[symbol])])
    ),
    history: globalState.history.slice(-20),
    updatedAt: new Date().toISOString()
  };
}

function saveMemory() {
  memory.wins = globalState.wins;
  memory.losses = globalState.losses;
  memory.totalTrades = globalState.totalTrades;
  memory.streak = globalState.streak;
  memory.history = globalState.history.slice(-CONFIG.HISTORIA_MAX);
  writeMemory(memory);
}

// ============================================================
// Inicialización: cargar balance real, leverage e info de
// instrumentos por símbolo antes de arrancar a operar.
// ============================================================

async function inicializarBybit() {
  try {
    const bal = await bybit.getBalance("USDT");
    globalState.balance = bal.availableBalance || bal.totalEquity;
    console.log(`[Bybit] Balance real cargado: $${globalState.balance}`);
  } catch (err) {
    console.error("[Bybit] No se pudo leer el balance:", err.message);
  }

  for (const symbol of Object.keys(pares)) {
    try {
      await bybit.setLeverage(symbol, CONFIG.LEVERAGE);
    } catch (err) {
      // "leverage not modified" no es un error real, solo informativo
      if (!err.message.includes("110043")) {
        console.warn(`[Bybit] Leverage ${symbol}:`, err.message);
      }
    }
    try {
      const info = await bybit.getInstrumentInfo(symbol);
      pares[symbol].instrumento = info;
    } catch (err) {
      console.error(`[Bybit] No se pudo leer instrumento ${symbol}:`, err.message);
    }
  }
  leverageListo = true;
  console.log("[Bybit] Inicialización completa.");
}

// ============================================================
// Abrir trade REAL en Bybit
// ============================================================

async function abrirTrade(par, side, reason) {
  if (par.abriendoOrden || !leverageListo) return;
  par.abriendoOrden = true;

  try {
    const { qtyStep, minOrderQty, tickSize } = par.instrumento;
    const entry = par.price;
    const sizeUSD = globalState.balance * CONFIG.RIESGO_POR_TRADE;
    let qty = bybit.roundToStep(sizeUSD / entry, qtyStep);

    if (qty < minOrderQty) {
      console.warn(`[${par.symbol}] Qty calculada (${qty}) menor al mínimo (${minOrderQty}). Trade omitido.`);
      par.abriendoOrden = false;
      return;
    }

    const tpRaw = side === "LONG" ? entry * (1 + CONFIG.TAKE_PROFIT) : entry * (1 - CONFIG.TAKE_PROFIT);
    const slRaw = side === "LONG" ? entry * (1 - CONFIG.STOP_LOSS) : entry * (1 + CONFIG.STOP_LOSS);
    const tp = bybit.roundToTick(tpRaw, tickSize);
    const sl = bybit.roundToTick(slRaw, tickSize);
    const bybitSide = side === "LONG" ? "Buy" : "Sell";

    const orden = await bybit.placeMarketOrder({
      symbol: par.symbol, side: bybitSide, qty, takeProfit: tp, stopLoss: sl
    });

    par.enTrade = true;
    par.ultimoTrade = Date.now();
    par.position = { side, entry, qty, sizeUSD, mode: "REAL", reason, tp, sl, orderId: orden.orderId };
    par.finalAction = side === "LONG" ? "BUY" : "SELL";
    console.log(`[${par.symbol}] Orden REAL abierta ${side} qty=${qty} @ ${entry} | TP=${tp} SL=${sl}`);
  } catch (err) {
    console.error(`[${par.symbol}] Error abriendo orden real:`, err.message);
  } finally {
    par.abriendoOrden = false;
  }
}

// ============================================================
// Detectar posiciones cerradas (TP/SL ejecutado en Bybit) y
// registrar el resultado real, incluyendo fees.
// ============================================================

async function chequearPosicionesCerradas() {
  if (!leverageListo) return;
  let posicionesAbiertas = [];
  try {
    posicionesAbiertas = await bybit.getAllPositions();
  } catch (err) {
    console.error("[Bybit] Error consultando posiciones:", err.message);
    return;
  }

  const symbolsConPosicionAbierta = new Set(
    posicionesAbiertas.filter(p => parseFloat(p.size) > 0).map(p => p.symbol)
  );

  for (const symbol of Object.keys(pares)) {
    const par = pares[symbol];
    if (par.enTrade && !symbolsConPosicionAbierta.has(symbol)) {
      await registrarCierre(par);
    }
  }
}

async function registrarCierre(par) {
  try {
    const cerrados = await bybit.getClosedPnl(par.symbol, 1);
    const ultimo = cerrados[0];
    const pnlTrade = ultimo ? parseFloat(ultimo.closedPnl) : 0;
    const exitPrice = ultimo ? parseFloat(ultimo.avgExitPrice) : par.price;

    globalState.pnl = Number((globalState.pnl + pnlTrade).toFixed(4));
    globalState.totalTrades += 1;
    const resultado = pnlTrade >= 0 ? "WIN" : "LOSS";

    if (pnlTrade >= 0) {
      globalState.wins += 1;
      globalState.streak = globalState.streak >= 0 ? globalState.streak + 1 : 1;
    } else {
      globalState.losses += 1;
      globalState.streak = globalState.streak <= 0 ? globalState.streak - 1 : -1;
    }

    globalState.history.push({
      t: new Date().toISOString(),
      symbol: par.symbol, side: par.position.side, resultado,
      entry: par.position.entry,
      exit: exitPrice,
      pnl: pnlTrade
    });
    if (globalState.history.length > CONFIG.HISTORIA_MAX) {
      globalState.history = globalState.history.slice(-CONFIG.HISTORIA_MAX);
    }

    // Sincronizar balance real (incluye fees y funding) en lugar de sumar localmente
    try {
      const bal = await bybit.getBalance("USDT");
      globalState.balance = bal.availableBalance || bal.totalEquity;
    } catch (err) {
      console.error("[Bybit] No se pudo refrescar balance tras cierre:", err.message);
    }

    par.enTrade = false;
    par.position = { side: "-", entry: 0, qty: 0, sizeUSD: 0, mode: "REAL", reason: "-", tp: 0, sl: 0 };
    par.finalAction = "HOLD";
    console.log(`[${par.symbol}] Cierre REAL detectado ${resultado} | PNL: ${pnlTrade} | Balance: ${globalState.balance}`);
    saveMemory();
  } catch (err) {
    console.error(`[${par.symbol}] Error registrando cierre:`, err.message);
    // Aun si falla la consulta de PNL exacto, liberamos el estado local
    // para no bloquear al par en "enTrade" indefinidamente.
    par.enTrade = false;
    par.position = { side: "-", entry: 0, qty: 0, sizeUSD: 0, mode: "REAL", reason: "-", tp: 0, sl: 0 };
    par.finalAction = "HOLD";
  }
}

// ============================================================
// Modelo ACM — señal de entrada (sin cambios en la lógica),
// usa el feed de precios de Binance solo como fuente de datos
// para el cálculo de coherencia/momentum.
//
// NOTA IMPORTANTE: el precio que dispara la señal viene de Binance,
// pero la ejecución real ocurre en Bybit. En condiciones normales
// la diferencia de precio entre ambos venues es mínima, pero puede
// generar un pequeño desvío (basis) entre el precio de entrada
// esperado y el precio real de ejecución. Vale la pena migrar el
// feed de precios al WebSocket público de Bybit más adelante para
// eliminar ese desvío.
// ============================================================

function updateModel(par, newPrice) {
  if (!botActivo) return;
  if (!par.price) {
    par.price = newPrice;
    par.previousPrice = newPrice;
    par.engineStatus = "ON";
    par.marketStatus = "CONNECTED";
    return;
  }
  par.previousPrice = par.price;
  par.price = newPrice;
  const delta = par.price - par.previousPrice;
  const deltaRel = par.price > 0 ? delta / par.price : delta;
  par.deltaHistory.push(deltaRel);
  if (par.deltaHistory.length > 100) par.deltaHistory.shift();
  const absDeltas = par.deltaHistory.map(x => Math.abs(x));
  par.coherencia = Number((par.coherencia * 0.82 + deltaRel * 0.18).toFixed(8));
  par.dCoherencia = Number(deltaRel.toFixed(8));
  par.momentum = Number(avg(par.deltaHistory.slice(-20)).toFixed(8));
  par.microVol = Number(avg(absDeltas.slice(-20)).toFixed(8));
  par.advantage = Number((Math.abs(par.coherencia) / (par.microVol || 0.000001)).toFixed(6));
  par.confianzaACM = Number(clamp(par.advantage * 100, 0, 100).toFixed(2));
  par.engineStatus = "ON";
  par.marketStatus = "CONNECTED";

  if (par.enTrade || par.abriendoOrden) return;

  const cooldownOk = (Date.now() - par.ultimoTrade) > CONFIG.COOLDOWN_MS;
  const confianzaOk = par.confianzaACM >= CONFIG.MIN_CONFIANZA;
  const balanceOk = globalState.balance > 1;

  if (cooldownOk && confianzaOk && balanceOk && leverageListo) {
    if (par.coherencia > 0 && par.momentum > 0 && delta > 0) {
      abrirTrade(par, "LONG", "ACM coherencia + momentum positivo");
    } else if (par.coherencia < 0 && par.momentum < 0 && delta < 0) {
      abrirTrade(par, "SHORT", "ACM coherencia + momentum negativo");
    }
  }
}

const WS_URLS = {
  BTCUSDT: "wss://stream.binance.com:9443/ws/btcusdt@trade",
  ETHUSDT: "wss://stream.binance.com:9443/ws/ethusdt@trade",
  SOLUSDT: "wss://stream.binance.com:9443/ws/solusdt@trade",
  ADAUSDT: "wss://stream.binance.com:9443/ws/adausdt@trade",
  ALGOUSDT: "wss://stream.binance.com:9443/ws/algousdt@trade"
};

const sockets = {};
const reconnectTimers = {};

function conectarPar(symbol) {
  if (sockets[symbol]) { try { sockets[symbol].terminate(); } catch (_) {} }
  const ws = new WebSocket(WS_URLS[symbol]);
  sockets[symbol] = ws;
  ws.on("open", () => {
    console.log(`${symbol} conectado`);
    pares[symbol].marketStatus = "CONNECTED";
    pares[symbol].engineStatus = "ON";
  });
  ws.on("message", (raw) => {
    try {
      const data = JSON.parse(raw.toString());
      if (!data.p) return;
      updateModel(pares[symbol], parseFloat(data.p));
      broadcast(snapshot());
    } catch (err) { console.error(`Error ${symbol}:`, err.message); }
  });
  ws.on("close", () => {
    console.log(`${symbol} desconectado`);
    pares[symbol].marketStatus = "DISCONNECTED";
    pares[symbol].engineStatus = "OFF";
    clearTimeout(reconnectTimers[symbol]);
    reconnectTimers[symbol] = setTimeout(() => conectarPar(symbol), 5000);
  });
  ws.on("error", (err) => {
    console.error(`Error WS ${symbol}:`, err.message);
    pares[symbol].marketStatus = "ERROR";
  });
}

wss.on("connection", (ws) => { ws.send(JSON.stringify(snapshot())); });
app.get("/api/status", (req, res) => { res.json(snapshot()); });

app.post("/api/toggle", async (req, res) => {
  botActivo = !botActivo;
  if (!botActivo) {
    // Cerrar todas las posiciones reales abiertas al apagar el bot
    for (const symbol of Object.keys(pares)) {
      const par = pares[symbol];
      if (par.enTrade) {
        try {
          const bybitSide = par.position.side === "LONG" ? "Buy" : "Sell";
          await bybit.closePosition(symbol, bybitSide, par.position.qty);
          await registrarCierre(par);
        } catch (err) {
          console.error(`[${symbol}] Error cerrando posición al apagar bot:`, err.message);
        }
      }
    }
  }
  broadcast(snapshot());
  res.json({ botActivo });
});

app.get("/api/history", (req, res) => { res.json(globalState.history.slice(-50)); });
app.get("/health", (req, res) => {
  res.json({ ok: true, bot: globalState.botName, botActivo, testnet: ES_TESTNET });
});

server.listen(PORT, async () => {
  console.log("SKYNET F-1 corriendo en puerto " + PORT);
  await inicializarBybit();
  Object.keys(WS_URLS).forEach(symbol => conectarPar(symbol));
  setInterval(chequearPosicionesCerradas, CONFIG.POLL_POSICIONES_MS);
});
