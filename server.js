const express = require("express");
const fs = require("fs");
const path = require("path");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
const MEMORY_FILE = path.join(__dirname, "acm-memory.json");

function readMemory() {
  if (!fs.existsSync(MEMORY_FILE)) {
    const base = { balance: 100, pnl: 0, wins: 0, losses: 0, totalTrades: 0, streak: 0, history: [] };
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(base, null, 2));
    return base;
  }
  try { return JSON.parse(fs.readFileSync(MEMORY_FILE, "utf8")); }
  catch (err) { return { balance: 100, pnl: 0, wins: 0, losses: 0, totalTrades: 0, streak: 0, history: [] }; }
}

function writeMemory(data) {
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(data, null, 2));
}

let memory = readMemory();
let botActivo = true;

const CONFIG = {
  RIESGO_POR_TRADE: 0.10,
  TAKE_PROFIT: 0.0006,
  STOP_LOSS: 0.0003,
  MIN_CONFIANZA: 20,
  COOLDOWN_MS: 1500,
  HISTORIA_MAX: 200
};

function crearEstadoPar(symbol) {
  return {
    symbol, price: 0, previousPrice: 0,
    coherencia: 0, dCoherencia: 0, momentum: 0,
    microVol: 0, advantage: 0, confianzaACM: 0,
    finalAction: "HOLD", enTrade: false, ultimoTrade: 0,
    position: { side: "-", entry: 0, sizeUSD: 0, mode: "SIM", reason: "-", tp: 0, sl: 0 },
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
  botName: "ACM BOT 1 — TESTNET",
  pnl: memory.pnl || 0,
  balance: memory.balance || 100,
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
  memory.pnl = globalState.pnl;
  memory.balance = globalState.balance;
  memory.wins = globalState.wins;
  memory.losses = globalState.losses;
  memory.totalTrades = globalState.totalTrades;
  memory.streak = globalState.streak;
  memory.history = globalState.history.slice(-CONFIG.HISTORIA_MAX);
  writeMemory(memory);
}

function cerrarTrade(par, precioActual) {
  if (!par.enTrade) return;
  const { side, entry, sizeUSD } = par.position;
  let pnlTrade = side === "LONG"
    ? ((precioActual - entry) / entry) * sizeUSD
    : ((entry - precioActual) / entry) * sizeUSD;
  pnlTrade = Number(pnlTrade.toFixed(4));
  globalState.pnl = Number((globalState.pnl + pnlTrade).toFixed(4));
  globalState.balance = Number((globalState.balance + pnlTrade).toFixed(4));
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
    symbol: par.symbol, side, resultado,
    entry: entry.toFixed(["BTCUSDT","ETHUSDT"].includes(par.symbol) ? 2 : 5),
    exit: precioActual.toFixed(["BTCUSDT","ETHUSDT"].includes(par.symbol) ? 2 : 5),
    pnl: pnlTrade
  });
  if (globalState.history.length > CONFIG.HISTORIA_MAX) {
    globalState.history = globalState.history.slice(-CONFIG.HISTORIA_MAX);
  }
  par.enTrade = false;
  par.position = { side: "-", entry: 0, sizeUSD: 0, mode: "SIM", reason: "-", tp: 0, sl: 0 };
  par.finalAction = "HOLD";
  console.log(`[${par.symbol}] ${side} ${resultado} | PNL: ${pnlTrade} | Balance: ${globalState.balance}`);
  saveMemory();
}

function abrirTrade(par, side, reason) {
  const sizeUSD = Number((globalState.balance * CONFIG.RIESGO_POR_TRADE).toFixed(4));
  const entry = par.price;
  const tp = side === "LONG" ? entry * (1 + CONFIG.TAKE_PROFIT) : entry * (1 - CONFIG.TAKE_PROFIT);
  const sl = side === "LONG" ? entry * (1 - CONFIG.STOP_LOSS) : entry * (1 + CONFIG.STOP_LOSS);
  par.enTrade = true;
  par.ultimoTrade = Date.now();
  par.position = { side, entry, sizeUSD, mode: "SIM", reason, tp, sl };
  par.finalAction = side === "LONG" ? "BUY" : "SELL";
}

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

  if (par.enTrade) {
    const pos = par.position;
    if (pos.side === "LONG" && (newPrice >= pos.tp || newPrice <= pos.sl)) {
      cerrarTrade(par, newPrice);
    } else if (pos.side === "SHORT" && (newPrice <= pos.tp || newPrice >= pos.sl)) {
      cerrarTrade(par, newPrice);
    }
    return;
  }

  const cooldownOk = (Date.now() - par.ultimoTrade) > CONFIG.COOLDOWN_MS;
  const confianzaOk = par.confianzaACM >= CONFIG.MIN_CONFIANZA;
  const balanceOk = globalState.balance > 1;

  if (cooldownOk && confianzaOk && balanceOk) {
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
app.post("/api/toggle", (req, res) => {
  botActivo = !botActivo;
  if (!botActivo) {
    Object.values(pares).forEach(p => { if (p.enTrade) cerrarTrade(p, p.price); });
  }
  broadcast(snapshot());
  res.json({ botActivo });
});
app.get("/api/history", (req, res) => { res.json(globalState.history.slice(-50)); });
app.get("/health", (req, res) => {
  res.json({ ok: true, bot: globalState.botName, botActivo });
});

server.listen(PORT, () => {
  console.log("ACM BOT 1 corriendo en puerto " + PORT);
  Object.keys(WS_URLS).forEach(symbol => conectarPar(symbol));
});
