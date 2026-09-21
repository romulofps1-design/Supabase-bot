// telegram-bot V32 (V31 + PREPARE aos ~10 min, aviso "fechou dentro, segue perto", ⚡ janela forte e placar proprio do alerta dos minutos finais) (historico das versoes: CHANGELOG.md)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const TELEGRAM_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
const TG_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
const ALLOWED_CHAT_IDS = (Deno.env.get("ALLOWED_CHAT_IDS") || "")
.split(",")
.map((s) => s.trim())
.filter(Boolean);
const ALERT_EXCLUIR = (Deno.env.get("ALERT_EXCLUIR_IDS") || "").split(",").map((x) => x.trim()).filter(Boolean);
const ALERT_CHAT_IDS = [...new Set(ALLOWED_CHAT_IDS)].filter((x) => !ALERT_EXCLUIR.includes(x));
let ALERT_OPORT_PCT_MIN = Number(Deno.env.get("ALERT_OPORT_PCT_MIN") || "8");
let ALERT_REV_PCT_MIN = Number(Deno.env.get("ALERT_REV_PCT_MIN") || "12");
const ALERT_COOLDOWN_MIN = Number(Deno.env.get("ALERT_COOLDOWN_MIN") || "60");
const ALERT_COOLDOWN_REPETIDO_MIN = Number(Deno.env.get("ALERT_COOLDOWN_REPETIDO_MIN") || "180");
const WATCH_HORAS = Number(Deno.env.get("WATCH_HORAS") || "48");
const TF_MIN = 15;
const ALERT_FRESCO_CANDLES = Number(Deno.env.get("ALERT_FRESCO_CANDLES") || "2");
const ALERT_IDADE_MAX_CANDLES = Number(Deno.env.get("ALERT_IDADE_MAX_CANDLES") || "0");
let ANTEC_ETA_MAX_CANDLES = Number(Deno.env.get("ANTEC_ETA_MAX_CANDLES") || "6");
let ANTEC_DIST_MAX_PCT = Number(Deno.env.get("ANTEC_DIST_MAX_PCT") || "1");
const TRAVA_PRECO_ON = (Deno.env.get("TRAVA_PRECO_ON") || "1") !== "0";
const ANTEC_DIST_MAX_ATR = Number(Deno.env.get("ANTEC_DIST_MAX_ATR") || "1.5");
const ANTEC_LIGUE_ETA_CANDLES = Number(Deno.env.get("ANTEC_LIGUE_ETA_CANDLES") || "2");
const ALERT_MAX_POR_RODADA = Number(Deno.env.get("ALERT_MAX_POR_RODADA") || "5");
const ALERT_POOL = 40;
const TIMEFRAME = "15m";
const PESO_SUPREMA = 0.5;
const TOP_N = 20;
const TOP_N_CRUZADO = 10;
const OPORT_POOL = 40;
const PAIRS_CACHE_MS = 30 * 60 * 1000;
let FILTRO_VOL_MIN_USDT = Number(Deno.env.get("FILTRO_VOL_MIN_USDT") || "1000000");
let FILTRO_ADX_MIN = Number(Deno.env.get("FILTRO_ADX_MIN") || "18");
let FILTRO_RSI_MAX = Number(Deno.env.get("FILTRO_RSI_MAX") || "85");
let FILTRO_RSI_MIN = Number(Deno.env.get("FILTRO_RSI_MIN") || "15");
let FILTRO_DIST_MAX_PCT = Number(Deno.env.get("FILTRO_DIST_MAX_PCT") || "2");
const ADX_REF = 25;
const CANDLES_LIMIT_PADRAO = 500;
const CANDLES_LIMIT_PRECISO = 500;
let ALERT_FILTROS_ON = (Deno.env.get("ALERT_FILTROS") || "1") !== "0";
const VOL_ACEL_RATIO = Number(Deno.env.get("VOL_ACEL_RATIO") || "1.5");
const VOL_SECO_RATIO = Number(Deno.env.get("VOL_SECO_RATIO") || "0.6");
const SQUEEZE_REL = Number(Deno.env.get("SQUEEZE_REL") || "0.6");
const ANTEC_TABELA = "antecipacoes_log";
const ANTEC_CANCELA_RECUO = Number(Deno.env.get("ANTEC_CANCELA_RECUO") || "1.3");
const ANTEC_CALIB_MIN = 10;
const CONF_VERDE = 7;
const CONF_AMARELO = 5;
const ESTRAT_PUMP = (Deno.env.get("ESTRATEGIA_PUMP") || "1") !== "0";
const FILTRO_RSI_MAX_LONG = Number(Deno.env.get("FILTRO_RSI_MAX_LONG") || "90");
const SERROTE_MAX = Number(Deno.env.get("SERROTE_MAX") || "4");
const LIMITE_LADO = Number(Deno.env.get("LIMITE_LADO") || "3");
const CONF_MIN_OPORT = Number(Deno.env.get("CONF_MIN_OPORT") || "5");
const CONF_MIN_REVERSAO = Number(Deno.env.get("CONF_MIN_REVERSAO") || "7");
const _confBarrada = new Map<string, number>();
const FUNDO_ON = (Deno.env.get("FUNDO_RADAR") || "1") !== "0";
const FUNDO_QUEDA_MIN = Number(Deno.env.get("FUNDO_QUEDA_MIN") || "10");
const FUNDO_CONF_MIN = Number(Deno.env.get("FUNDO_CONF_MIN") || "6");
const FUNDO_PRE_MIN = Number(Deno.env.get("FUNDO_PRE_MIN") || "5");
const FUNDO_LIBERA_LONG = (Deno.env.get("FUNDO_LIBERA_LONG") || "1") !== "0";
const CONF_MIN_FUNDO_LONG = Number(Deno.env.get("CONF_MIN_FUNDO_LONG") || "6");
const FUNDO_COOLDOWN_MIN = Number(Deno.env.get("FUNDO_COOLDOWN_MIN") || "240");
const FUNDO_MAX_POR_RODADA = Number(Deno.env.get("FUNDO_MAX_POR_RODADA") || "2");
const FUNDO_BTC_QUEDA_PCT = Number(Deno.env.get("FUNDO_BTC_QUEDA_PCT") || "1.5");
const FUNDO_PTS_MAX = 13;
const _fundoAvaliado = new Map<string, number>();
const WEBHOOK_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") || "";
const CRON_SO_HEADER = (Deno.env.get("CRON_SO_HEADER") || "0") === "1";
const BTC_DIR_ON = (Deno.env.get("BTC_DIR") || "1") !== "0";
const BTC_DIR_PCT = Number(Deno.env.get("BTC_DIR_PCT") || "1.5");
const BTC_BLOQ_REV_PCT = Number(Deno.env.get("BTC_BLOQ_REV_PCT") || "2.5");
const ESTADO_ROW = "_ESTADO_";
const FINAL_ON = (Deno.env.get("ALERTA_FINAL") || "1") !== "0";
const FINAL_JANELA_MAX_MIN = Number(Deno.env.get("FINAL_JANELA_MAX_MIN") || "5");
const FINAL_JANELA_MIN_MIN = Number(Deno.env.get("FINAL_JANELA_MIN_MIN") || "1");
const FINAL_ENTRADA_PCT = Number(Deno.env.get("FINAL_ENTRADA_PCT") || "0.03");
const FINAL_CANCELA_PCT = Number(Deno.env.get("FINAL_CANCELA_PCT") || "0.1");
const FINAL_CANCELA_ATR = Number(Deno.env.get("FINAL_CANCELA_ATR") || "0.15");
const FINAL_PREFILTRO_PCT = Number(Deno.env.get("FINAL_PREFILTRO_PCT") || "0.4");
const FINAL_MAX_POR_RODADA = Number(Deno.env.get("FINAL_MAX_POR_RODADA") || "3");
const FINAL_MAX_CAND = Number(Deno.env.get("FINAL_MAX_CAND") || "8");
const FINAL_PREPARE_MAX_MIN = Number(Deno.env.get("FINAL_PREPARE_MAX_MIN") || "10");
const FINAL_PREPARE_DIST_PCT = Number(Deno.env.get("FINAL_PREPARE_DIST_PCT") || "0.15");
const FINAL_PREPARE_MAX = Number(Deno.env.get("FINAL_PREPARE_MAX") || "3");
const FINAL_PREPARE_FOLGA_CONF = Number(Deno.env.get("FINAL_PREPARE_FOLGA_CONF") || "1");
const FINAL_PROXIMA_DIST_PCT = Number(Deno.env.get("FINAL_PROXIMA_DIST_PCT") || "0.3");
const FINAL_PLACAR_ON = (Deno.env.get("FINAL_PLACAR") || "1") !== "0";
function igualSeguro(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a), eb = new TextEncoder().encode(b);
  let d = ea.length ^ eb.length;
  const n = Math.max(ea.length, eb.length);
  for (let i = 0; i < n; i++) d |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return d === 0;
}
const FALLBACK_PAIRS = ["BTC-USDT","ETH-USDT","SOL-USDT","XRP-USDT","DOGE-USDT","ADA-USDT","AVAX-USDT","LINK-USDT","DOT-USDT","LTC-USDT","BCH-USDT","ONE-USDT","SUI-USDT","APT-USDT","ARB-USDT","OP-USDT","INJ-USDT","NEAR-USDT","ATOM-USDT","PEPE-USDT"];
async function J(r: Response) {
  const t = await r.text();
  if (t.trim().startsWith("<!DOCTYPE") || t.trim().startsWith("<html")) return { code: "html_block" };
  try { return JSON.parse(t); } catch { return { raw: t.slice(0, 300) }; }
}
let _cachePairs: string[] | null = null;
let _cachePairsAt = 0;
async function getFuturesPairs(): Promise<string[]> {
  const agora = Date.now();
  if (_cachePairs && (agora - _cachePairsAt) < PAIRS_CACHE_MS) return _cachePairs;
  try {
    const r = await fetch("https://openapi.blofin.com/api/v1/market/instruments?instType=SWAP");
    const j = await J(r);
    const pares = (j as any)?.data
    ?.filter((i: any) => i.quoteCurrency === "USDT" && i.instType === "SWAP" && i.state === "live")
    ?.map((i: any) => i.instId as string)
    ?.sort();
    if (pares && pares.length > 50) {
      _cachePairs = pares; _cachePairsAt = agora;
      console.log(`✅ ${pares.length} pares USDT/SWAP`);
      return pares;
    }
    console.log(`⚠️ pares insuficientes (${pares?.length ?? 0}), usando FALLBACK_PAIRS`);
  } catch (e) { console.log(`⚠️ erro instrumentos (${e}), usando FALLBACK_PAIRS`); }
  return FALLBACK_PAIRS;
}
type Botao = { text: string; callback_data?: string; url?: string };
type Botoes = Botao[][];
const TECLADO_ITENS: [string, string][] = [
  ["🚀 Oportunidade", "/oportunidade"], ["🔄 Reversão", "/reversao"], ["🟢 Fundo", "/fundo"], ["📋 Lista", "/lista"],
  ["⭐ Seguidas", "/seguidas"], ["📊 Placar", "/placar"], ["🤖 Robô", "/robo"],
  ["🌅 Resumo", "/resumo"], ["🧾 Meu placar", "/meuplacar"],
  ["⏸ Pausar", "/pausar"],
];
const TECLADO_CMD: Record<string, string> = Object.fromEntries(TECLADO_ITENS.map(([l, c]) => [l.toLowerCase(), c]));
const TECLADO_FIXO = (() => {
  const rows: { text: string }[][] = [];
  for (let i = 0; i < TECLADO_ITENS.length; i += 3) rows.push(TECLADO_ITENS.slice(i, i + 3).map(([l]) => ({ text: l })));
  return rows;
})();
async function apagarMsg(chatId: number | string, id: number) {
  try {
    await fetch(`${TG_API}/deleteMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId, message_id: id }) });
  } catch { }
}
const UI_PREFIXO = "_UI_";
async function uiRegistrar(chatId: number, msgId: number) {
  const SB = getSupabase();
  if (!SB) return;
  const id = UI_PREFIXO + chatId;
  const { data } = await SB.from("alertas_indicador").select("last_status").eq("instid", id).maybeSingle();
  let ids: number[] = [];
  try { ids = JSON.parse(data?.last_status || "[]"); } catch { ids = []; }
  ids.push(msgId);
  const campos = { last_status: JSON.stringify(ids.slice(-40)) };
  if (data) await SB.from("alertas_indicador").update(campos).eq("instid", id);
  else await SB.from("alertas_indicador").insert({ instid: id, ...campos });
}
async function uiLimpar(chatId: number, extras: number[] = []) {
  const ids = extras.filter((x) => typeof x === "number");
  const SB = getSupabase();
  if (SB) {
    const id = UI_PREFIXO + chatId;
    const { data } = await SB.from("alertas_indicador").select("last_status").eq("instid", id).maybeSingle();
    try { const salvos = JSON.parse(data?.last_status || "[]"); if (Array.isArray(salvos)) ids.push(...salvos); } catch { }
    if (data) await SB.from("alertas_indicador").update({ last_status: "[]" }).eq("instid", id);
  }
  await Promise.all(ids.map((m) => apagarMsg(chatId, m)));
}
async function sendTelegram(chatId: number | string, text: string, botoes?: Botoes): Promise<number | null> {
  const markup = { reply_markup: botoes ? { inline_keyboard: botoes } : { keyboard: TECLADO_FIXO, resize_keyboard: true } };
  let id: number | null = null;
  try {
    const r = await fetch(`${TG_API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true, disable_notification: false, ...markup }),
    });
    const j: any = await J(r);
    if (j.ok === false) {
      console.log(`⚠️ sendTelegram HTML falhou (${JSON.stringify(j).slice(0,200)}), tentando sem parse_mode`);
      const r2 = await fetch(`${TG_API}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: text.replace(/<\/?[bi]>/g, ""), disable_web_page_preview: true, ...markup }),
      });
      const j2: any = await J(r2);
      id = j2?.result?.message_id ?? null;
    } else id = j?.result?.message_id ?? null;
  } catch (e) { console.log("Erro sendTelegram", e); }
  if (id && typeof chatId === "number") await uiRegistrar(chatId, id).catch(() => {});
  if (id && TOPO_MIN_CHARS > 0 && text.length >= TOPO_MIN_CHARS) await addBotaoTopo(chatId, id, botoes).catch(() => {});
  return id;
}
const TOPO_MIN_CHARS = Number(Deno.env.get("TOPO_MIN_CHARS") || "700");
const BOT_ID = TELEGRAM_TOKEN.split(":")[0];
let _topoAvisou = false;
async function addBotaoTopo(chatId: number | string, id: number, botoes?: Botoes) {
  const linha: Botao[] = [{ text: "⬆️ Ir ao topo", callback_data: "topo" }];
  const r = await fetch(`${TG_API}/editMessageReplyMarkup`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message_id: id, reply_markup: { inline_keyboard: [...(botoes ?? []), linha] } }),
  });
  const j: any = await J(r);
  if (j?.ok === false && !_topoAvisou) { _topoAvisou = true; console.log(`⚠️ botão "ir ao topo" recusado pelo Telegram: ${JSON.stringify(j).slice(0, 200)}`); }
}
const DIVISOR = "➖➖➖➖➖➖➖➖➖➖";
function ma(d: number[], p: number) {
  const k = 2 / (p + 1); let e = d[0]; const o = [e];
  for (let i = 1; i < d.length; i++) { e = d[i] * k + e * (1 - k); o.push(e); }
  return o;
}
function superV2(closes: number[], peso: number = PESO_SUPREMA) {
  const e20 = ma(closes, 20), e21 = ma(closes, 21), e50 = ma(closes, 50), e60 = ma(closes, 60), e100 = ma(closes, 100), e200 = ma(closes, 200);
  return closes.map((_, i) => {
    const j3 = (e21[i] + e50[i] + e60[i]) / 3;
    const j6 = (e20[i] + e21[i] + e50[i] + e60[i] + e100[i] + e200[i]) / 6;
    const exata = (j3 + j6) / 2;
    const suprema = exata * peso + j6 * (1 - peso);
    return { j3, j6, suprema };
  });
}
const _fonte: Record<string, number> = {};
const marcaFonte = (nome: string) => { _fonte[nome] = (_fonte[nome] ?? 0) + 1; };
function barToMs(bar: string): number {
  const map: Record<string, number> = { "1m":60000,"3m":180000,"5m":300000,"15m":900000,"30m":1800000,"1H":3600000,"2H":7200000,"4H":14400000,"6H":21600000,"12H":43200000,"1D":86400000 };
  return map[bar] || 900000;
}
async function getCandles(instId: string, bar: string, limit: number = CANDLES_LIMIT_PADRAO) {
  const sym = instId.replace("-", "");
  const periodo = barToMs(bar);
  const aberturaAtual = Math.floor(Date.now() / periodo) * periodo;
  const stripCloses = (rows: [number, number][]) => {
    while (rows.length && rows[rows.length - 1][0] >= aberturaAtual) rows.pop();
    return rows.map((r) => r[1]);
  };
  for (let t = 0; t < 2; t++) {
    try {
      const r = await fetch(`https://openapi.blofin.com/api/v1/market/candles?instId=${instId}&bar=${bar}&limit=${limit}`, { headers: { "User-Agent": "Mozilla/5.0" } });
      const j = await J(r);
      if (j.code == "html_block" && t === 0) { await new Promise((res) => setTimeout(res, 500 + Math.random() * 700)); continue; }
      if (j.code == "0" && j.data?.length > 100) { marcaFonte("BloFin"); return stripCloses(j.data.slice().reverse().map((c: any) => [parseInt(c[0]), parseFloat(c[4])] as [number, number])); }
      break;
    } catch { break; }
  }
  try {
    const r = await fetch(`https://api.bybit.com/v5/market/kline?category=linear&symbol=${sym}&interval=${bar.replace("m", "")}&limit=${limit}`);
    const j = await r.json();
    if (j.result?.list?.length > 100) { marcaFonte("Bybit"); return stripCloses(j.result.list.slice().reverse().map((c: any) => [parseInt(c[0]), parseFloat(c[4])] as [number, number])); }
  } catch { }
  try {
    const r = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${sym}&interval=${bar.replace("H", "h")}&limit=${limit}`);
    const j = await r.json();
    if (Array.isArray(j) && j.length > 100) { marcaFonte("Binance"); return stripCloses(j.map((c: any) => [parseInt(c[0]), parseFloat(c[4])] as [number, number])); }
  } catch { }
  marcaFonte("FALHA");
  return [];
}
async function getTickerOne(instId: string) {
  try {
    const r = await fetch(`https://openapi.blofin.com/api/v1/market/tickers?instId=${instId}`);
    const j = await J(r);
    return j.data?.[0] || null;
  } catch { return null; }
}
async function precoAoVivo(instId: string): Promise<number | null> {
  const t = await getTickerOne(instId);
  const v = Number(t?.last);
  return isFinite(v) && v > 0 ? v : null;
}
async function getAllTickersBulk() {
  try {
    const r = await fetch(`https://openapi.blofin.com/api/v1/market/tickers`);
    const j = await J(r);
    if (j.code == "0" && Array.isArray(j.data) && j.data.length > 50) return j.data;
  } catch { }
  return null;
}
function fmtPrice(p: number) {
  if (!isFinite(p)) return "?";
  if (p >= 100) return p.toFixed(2);
  if (p >= 1) return p.toFixed(4);
  if (p >= 0.01) return p.toFixed(6);
  return p.toPrecision(4);
}
function statusIndicador(distAbs: number) {
  if (distAbs < 0.15) return "🔥 MUITO PERTO";
  if (distAbs < 0.5) return "🟡 PERTO";
  if (distAbs < 1.5) return "🟠 DISTANTE";
  return "🔴 MUITO DISTANTE";
}
type Aprox = { alvo: "long" | "short"; dist: number; vel: number; etaCandles: number; consist: number };
type IndicadorInfo = { instId: string; preco: number; topo: number; fundo: number; distAbs: number; regiao: string; idadeCandles: number | null; aprox?: Aprox | null; larguraPct?: number; larguraRel?: number };
async function emLotes<T, R>(itens: T[], tamanhoLote: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < itens.length; i += tamanhoLote) {
    const lote = itens.slice(i, i + tamanhoLote);
    out.push(...(await Promise.all(lote.map(fn))));
  }
  return out;
}
function calcIndicadorDeCloses(instId: string, closes: number[]): IndicadorInfo | null {
  if (closes.length < 100) return null;
  const jData = superV2(closes, PESO_SUPREMA);
  const idx = closes.length - 1;
  const preco = closes[idx];
  const suprema = jData[idx].suprema, j6 = jData[idx].j6;
  if (!isFinite(suprema) || !isFinite(j6) || suprema <= 0 || j6 <= 0) return null;
  const topo = Math.max(suprema, j6), fundo = Math.min(suprema, j6);
  let distAbs: number, regiao: string;
  if (preco > topo) { distAbs = ((preco - topo) / topo) * 100; regiao = "acima, já cruzou"; }
  else if (preco < fundo) { distAbs = ((fundo - preco) / fundo) * 100; regiao = "abaixo, já cruzou"; }
  else {
    const distTopo = ((topo - preco) / preco) * 100;
    const distFundo = ((preco - fundo) / preco) * 100;
    if (distTopo <= distFundo) { distAbs = distTopo; regiao = "dentro, perto do topo"; }
    else { distAbs = distFundo; regiao = "dentro, perto do fundo"; }
  }
  let idadeCandles: number | null = null;
  if (preco > topo || preco < fundo) {
    const acima = preco > topo;
    let k = idx;
    while (k > 0) {
      const tPrev = Math.max(jData[k - 1].suprema, jData[k - 1].j6);
      const fPrev = Math.min(jData[k - 1].suprema, jData[k - 1].j6);
      const mesmoLado = acima ? closes[k - 1] > tPrev : closes[k - 1] < fPrev;
      if (!mesmoLado) break;
      k--;
    }
    idadeCandles = idx - k;
  }
  let aprox: Aprox | null = null;
  if (idadeCandles === null && idx >= 8) {
    const N = 6;
    const cand: { alvo: "long" | "short"; d: number[] }[] = [{ alvo: "long", d: [] }, { alvo: "short", d: [] }];
    for (let k = idx - N + 1; k <= idx; k++) {
      const t = Math.max(jData[k].suprema, jData[k].j6), f = Math.min(jData[k].suprema, jData[k].j6);
      cand[0].d.push(((t - closes[k]) / closes[k]) * 100);
      cand[1].d.push(((closes[k] - f) / closes[k]) * 100);
    }
    const xm = (N - 1) / 2;
    let sxx = 0;
    for (let i = 0; i < N; i++) sxx += (i - xm) * (i - xm);
    for (const c of cand) {
      const dNow = c.d[N - 1];
      if (!(dNow > 0)) continue;
      const ym = c.d.reduce((s, v) => s + v, 0) / N;
      let sxy = 0;
      for (let i = 0; i < N; i++) sxy += (i - xm) * (c.d[i] - ym);
      const slope = sxy / sxx;
      if (slope >= -0.003) continue;
      let passos = 0;
      for (let i = 1; i < N; i++) if (c.d[i] < c.d[i - 1]) passos++;
      const eta = dNow / -slope;
      if (!aprox || eta < aprox.etaCandles) aprox = { alvo: c.alvo, dist: dNow, vel: -slope, etaCandles: eta, consist: passos / (N - 1) };
    }
  }
  const largK = (k: number) => ((Math.max(jData[k].suprema, jData[k].j6) - Math.min(jData[k].suprema, jData[k].j6)) / closes[k]) * 100;
  const larguraPct = largK(idx);
  let larguraRel = 1;
  if (idx >= 30) {
    const hist: number[] = [];
    for (let k = Math.max(0, idx - 96); k < idx; k++) { const w = largK(k); if (isFinite(w) && w > 0) hist.push(w); }
    const med = xMediana(hist);
    if (med > 0 && isFinite(larguraPct)) larguraRel = larguraPct / med;
  }
  return { instId, preco, topo, fundo, distAbs, regiao, idadeCandles, aprox, larguraPct, larguraRel };
}
async function calcIndicadorLimit(instId: string, limit: number): Promise<IndicadorInfo | null> {
  return calcIndicadorDeCloses(instId, await getCandles(instId, TIMEFRAME, limit));
}
const calcIndicador = (instId: string) => calcIndicadorLimit(instId, CANDLES_LIMIT_PADRAO);
const calcIndicador500 = (instId: string) => calcIndicadorLimit(instId, CANDLES_LIMIT_PRECISO);
function indicadorTxt(info: IndicadorInfo | null) {
  if (!info) return `Indicador: sem dado`;
  return `Indicador: ${info.distAbs.toFixed(3)}% ${statusIndicador(info.distAbs)} (${info.regiao})`;
}
async function getVariacoes24h(): Promise<{ instId: string; pct: number; last: number; volUsdt: number }[]> {
  const pares = await getFuturesPairs();
  const paresSet = new Set(pares);
  const variacoes: { instId: string; pct: number; last: number; volUsdt: number }[] = [];
  const bulk = await getAllTickersBulk();
  if (bulk) {
    for (const t of bulk) {
      if (!t.instId || !paresSet.has(t.instId)) continue;
      const last = parseFloat(t.last || "0"), open = parseFloat(t.open24h || "0");
      if (open <= 0 || last <= 0) continue;
      variacoes.push({ instId: t.instId, pct: ((last - open) / open) * 100, last, volUsdt: (parseFloat(t.volCurrency24h || "0") || 0) * last });
    }
  } else {
    const resultados = await emLotes(pares, 25, getTickerOne);
    resultados.forEach((t, i) => {
      if (!t) return;
      const last = parseFloat(t.last || "0"), open = parseFloat(t.open24h || "0");
      if (open <= 0 || last <= 0) return;
      variacoes.push({ instId: pares[i], pct: ((last - open) / open) * 100, last, volUsdt: (parseFloat(t.volCurrency24h || "0") || 0) * last });
    });
  }
  return variacoes;
}
const cortar = (msg: string) => (msg.length > 4000 ? msg.slice(0, 3990) + "\n...(cortado)" : msg);
function calcRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let ganho = 0, perda = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) ganho += d; else perda -= d;
  }
  let mediaGanho = ganho / period, mediaPerda = perda / period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    mediaGanho = (mediaGanho * (period - 1) + (d > 0 ? d : 0)) / period;
    mediaPerda = (mediaPerda * (period - 1) + (d < 0 ? -d : 0)) / period;
  }
  if (mediaPerda === 0) return mediaGanho === 0 ? 50 : 100;
  return 100 - 100 / (1 + mediaGanho / mediaPerda);
}
type InfoFiltravel = IndicadorInfo & { adx: number; rsi: number; atr: number; adxAntes?: number; volRatio?: number | null; trocas?: number; bottom?: FundoRes | null };
function calcATR(h: number[], l: number[], c: number[], p = 14): number {
  const n = c.length;
  if (n < p + 1) return 0;
  const tr: number[] = [];
  for (let i = 1; i < n; i++) tr.push(Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])));
  if (tr.length < p) return 0;
  let atr = tr.slice(0, p).reduce((a, b) => a + b, 0) / p;
  for (let i = p; i < tr.length; i++) atr = (atr * (p - 1) + tr[i]) / p;
  return atr;
}
function volAcel(v: number[]): number | null {
  const n = v.length;
  if (n < 20) return null;
  const rec = (v[n - 1] + v[n - 2] + v[n - 3]) / 3;
  const base = xMediana(v.slice(n - 15, n - 3).filter((x) => isFinite(x)));
  return base > 0 && isFinite(rec) ? rec / base : null;
}
function contarTrocas(closes: number[]): number {
  const L = superV2(closes, PESO_SUPREMA);
  let trocas = 0;
  let anterior: string | null = null;
  for (let i = Math.max(0, closes.length - 16); i < closes.length; i++) {
    const t = Math.max(L[i].suprema, L[i].j6), f = Math.min(L[i].suprema, L[i].j6);
    const est = closes[i] > t ? "A" : closes[i] < f ? "B" : "D";
    if (anterior !== null && est !== anterior) trocas++;
    anterior = est;
  }
  return trocas;
}
type FundoRes = { pts: number; conf: number; motivos: Motivo[]; caindoFaca: boolean; minimo: number; dAtr: number };
function rsiSerie(closes: number[], period = 14): number[] {
  const n = closes.length;
  const out: number[] = new Array(n).fill(NaN);
  if (n < period + 1) return out;
  let g = 0, p = 0;
  for (let i = 1; i <= period; i++) { const d = closes[i] - closes[i - 1]; if (d >= 0) g += d; else p -= d; }
  let mg = g / period, mp = p / period;
  const val = () => (mp === 0 ? (mg === 0 ? 50 : 100) : 100 - 100 / (1 + mg / mp));
  out[period] = val();
  for (let i = period + 1; i < n; i++) {
    const d = closes[i] - closes[i - 1];
    mg = (mg * (period - 1) + (d > 0 ? d : 0)) / period;
    mp = (mp * (period - 1) + (d < 0 ? -d : 0)) / period;
    out[i] = val();
  }
  return out;
}
function confFundo(total: number, caindoFaca: boolean): number {
  const c = Math.max(0, Math.min(10, Math.round((total * 10) / FUNDO_PTS_MAX)));
  return caindoFaca ? Math.min(c, Math.max(0, FUNDO_CONF_MIN - 1)) : c;
}
function calcFundoPre(d: XVelas, info: IndicadorInfo, atr: number, adx: number, adxAntes: number): FundoRes | null {
  const n = d.c.length;
  if (n < 60 || !(atr > 0) || !(info.preco > 0)) return null;
  const motivos: Motivo[] = [];
  const add = (pts: number, txt: string) => motivos.push({ pts, txt });
  const JAN = 16;
  const ini = n - JAN;
  let caindoFaca = false;
  const dAtr = (info.fundo - info.preco) / atr;
  if (dAtr >= 5) add(2, `${info.distAbs.toFixed(1)}% abaixo da faixa (${dAtr.toFixed(1)}× ATR): muito esticada`);
  else if (dAtr >= 3) add(1, `${info.distAbs.toFixed(1)}% abaixo da faixa (${dAtr.toFixed(1)}× ATR): esticada`);
  const rs = rsiSerie(d.c, 14);
  const rsiAtual = rs[n - 1];
  const rsJan = rs.slice(ini, n).filter((x) => isFinite(x));
  const rsiMin = rsJan.length ? Math.min(...rsJan) : 50;
  if (rsiMin <= 25) add(1, `RSI chegou a ${rsiMin.toFixed(0)} nas últimas 4h (capitulação)`);
  if (rsiMin <= 30 && isFinite(rsiAtual) && rsiAtual >= rsiMin + 6) add(1, `RSI virando pra cima (${rsiMin.toFixed(0)} → ${rsiAtual.toFixed(0)})`);
  const base = xMediana(d.v.slice(Math.max(0, n - 96), ini).filter((x) => isFinite(x)));
  const vJan = d.v.slice(ini, n).map((x) => (isFinite(x) ? x : 0));
  const vPico = Math.max(...vJan);
  const idxPico = ini + vJan.indexOf(vPico);
  const vRec = (d.v[n - 1] + d.v[n - 2] + d.v[n - 3]) / 3;
  if (base > 0 && vPico >= 3 * base) {
    if (n - 1 - idxPico >= 2 && vRec <= vPico * 0.5) add(2, `pico de volume ${(vPico / base).toFixed(1)}× a média e já secando: vendedores se esgotando`);
    else add(0, `pico de volume ${(vPico / base).toFixed(1)}× a média, ainda ativo`);
  }
  const lJan = d.l.slice(ini, n);
  const minL = Math.min(...lJan);
  const desde = n - 1 - (ini + lJan.indexOf(minL));
  if (desde <= 1) { caindoFaca = true; add(-2, "ainda fazendo mínimas novas (faca caindo)"); }
  else if (desde >= 3 && d.c[n - 1] > minL + atr) add(1, `parou de fazer mínimas há ${desde * TF_MIN} min e já subiu ${(((d.c[n - 1] - minL) / minL) * 100).toFixed(1)}% da mínima`);
  for (let k = n - 4; k < n; k++) {
    const rng = d.h[k] - d.l[k];
    if (!(rng > 0) || rng < 0.8 * atr) continue;
    const pavio = Math.min(d.o[k], d.c[k]) - d.l[k];
    if (pavio / rng >= 0.55 && (d.c[k] - d.l[k]) / rng >= 0.6) { add(1, "pavio longo de rejeição embaixo (compradores defendendo)"); break; }
  }
  const a0 = n - 8, b0 = n - 24;
  const rA = rs.slice(a0, n).filter((x) => isFinite(x)), rB = rs.slice(b0, a0).filter((x) => isFinite(x));
  if (rA.length && rB.length) {
    const minLA = Math.min(...d.l.slice(a0, n)), minLB = Math.min(...d.l.slice(b0, a0));
    const minRA = Math.min(...rA), minRB = Math.min(...rB);
    if (minLA < minLB && minRA > minRB + 2) add(2, `divergência altista: preço fez mínima menor, RSI fez mínima maior (${minRB.toFixed(0)} → ${minRA.toFixed(0)})`);
  }
  if (adx >= 30 && adx - adxAntes <= -1) add(1, `ADX ${adx.toFixed(0)} caindo (era ${adxAntes.toFixed(0)}): força da queda esfriando`);
  else if (adx - adxAntes >= 2) add(-1, `ADX subindo (${adxAntes.toFixed(0)} → ${adx.toFixed(0)}): a queda ainda acelera`);
  if (d.c[n - 1] > d.o[n - 1] && d.c[n - 1] > d.h[n - 2]) add(1, "última vela 15m verde e fechou acima da máxima da anterior");
  const pts = motivos.reduce((s, m) => s + m.pts, 0);
  return { pts, conf: confFundo(pts, caindoFaca), motivos, caindoFaca, minimo: minL, dAtr };
}
let _btcFundoCache: { t: number; pct: number | null } | null = null;
async function btcVar1h(): Promise<number | null> {
  if (_btcFundoCache && Date.now() - _btcFundoCache.t < 60000) return _btcFundoCache.pct;
  let pct: number | null = null;
  try {
    const d = await xCandles("BTC-USDT", TIMEFRAME, CANDLES_LIMIT_PRECISO);
    if (d && d.c.length > 6) { const n = d.c.length; pct = ((d.c[n - 1] - d.c[n - 5]) / d.c[n - 5]) * 100; }
  } catch { }
  _btcFundoCache = { t: Date.now(), pct };
  return pct;
}
type FundoFinal = FundoRes & { fo: FoInfo | null; btc: number | null };
async function fundoFinal(pre: FundoRes, instId: string, foPre?: FoInfo | null): Promise<FundoFinal> {
  const [fo, btc] = await Promise.all([
    foPre !== undefined ? Promise.resolve(foPre) : getFundingOI(instId).catch(() => null),
    btcVar1h(),
  ]);
  const motivos = [...pre.motivos];
  const add = (pts: number, txt: string) => motivos.push({ pts, txt });
  if (fo && fo.funding !== null) {
    if (fo.funding <= -0.10) add(2, `funding ${fo.funding.toFixed(3)}%: vendidos lotados, combustível pra repique (short squeeze)`);
    else if (fo.funding <= -FUNDING_ALTO_PCT) add(1, `funding ${fo.funding.toFixed(3)}%: multidão vendida`);
  }
  if (fo && fo.oiChg !== null) {
    if (fo.oiChg <= -3) add(1, `OI caiu ${Math.abs(fo.oiChg).toFixed(1)}% em 4h: posições sendo fechadas/liquidadas`);
    else if (fo.oiChg >= 5) add(-1, `OI subiu ${fo.oiChg.toFixed(1)}% em 4h durante a queda: shorts novos entrando`);
  }
  if (btc !== null) {
    if (btc <= -FUNDO_BTC_QUEDA_PCT) add(-2, `BTC caindo ${btc.toFixed(1)}% na última hora: altcoins tendem a seguir`);
    else if (btc >= 0.5) add(1, `BTC subindo +${btc.toFixed(1)}% na última hora`);
  }
  const pts = motivos.reduce((s, m) => s + m.pts, 0);
  return { ...pre, motivos, pts, conf: confFundo(pts, pre.caindoFaca), fo: fo ?? null, btc };
}
function fundoTxt(r: { motivos: Motivo[]; conf: number }, maxPos = 5, maxNeg = 3): string {
  const pos = r.motivos.filter((m) => m.pts > 0).sort((a, b) => b.pts - a.pts).slice(0, maxPos);
  const neg = r.motivos.filter((m) => m.pts < 0).sort((a, b) => a.pts - b.pts).slice(0, maxNeg);
  let t = `🧭 Sinal de fundo: <b>${r.conf}/10</b> ${confEmoji(r.conf)}`;
  for (const m of pos) t += `\n   ✅ ${m.txt}`;
  for (const m of neg) t += `\n   ⚠️ ${m.txt}`;
  return t;
}
function msgFundo(info: InfoFiltravel, pct: number, fin: FundoFinal, vivo: number | null): string {
  const foTxt = fundingOiTxt(fin.fo ?? { funding: null, oiChg: null });
  return `🟢 <b>RADAR DE FUNDO — ${info.instId}</b>\n${DIVISOR}\n\n` +
    `📉 caiu ${pct.toFixed(2)}% em 24h · ${vivo !== null ? `preço agora ${fmtPrice(vivo)}` : `preço ${fmtPrice(info.preco)}`}\n` +
    `Possível virada de queda pra alta (SHORT → LONG). <b>Ainda não é entrada</b>: o robô só abre LONG quando fechar 15m acima do indicador.\n\n` +
    `${fundoTxt(fin)}\n` +
    (foTxt ? `💸 ${foTxt}\n` : "") +
    `\n📍 faixa: fundo ${fmtPrice(info.fundo)} | topo ${fmtPrice(info.topo)} (preço ${info.distAbs.toFixed(2)}% abaixo)\n` +
    `❌ Invalida: perder a mínima recente (${fmtPrice(fin.minimo)}) — aí o fundo ainda não se formou.\n` +
    `⭐ /seguir ${info.instId.replace("-USDT", "").toLowerCase()} pra ser avisado quando chegar na linha.`;
}
async function registrarAlertaFundo(SB: any, info: InfoFiltravel, pct: number, conf: number | null = null) {
  try {
    await inserirLogAlerta(SB, {
      instid: info.instId, lado: "long", tipo: "fundo", status: "🟢 FUNDO", fresco: false,
      idade_candles: info.idadeCandles, pct24: pct, preco: info.preco, adx: info.adx ?? null, rsi: info.rsi ?? null,
    }, conf);
  } catch (e) { console.log("⚠️ registrarAlertaFundo erro", e); }
}
async function radarFundo(SB: any, pool: { instId: string; pct: number; volUsdt: number }[], indicadores: (InfoFiltravel | null)[], posMap: Map<string, Pos[] | null>) {
  if (!FUNDO_ON) return;
  const ativos = ALERT_CHAT_IDS.filter((ch) => !silChat(ch));
  if (!ativos.length) return;
  const ckVela = Math.floor(Date.now() / (TF_MIN * 60000));
  for (const [k, v] of _fundoAvaliado) if (v !== ckVela) _fundoAvaliado.delete(k);
  const cands: { info: InfoFiltravel; pct: number }[] = [];
  indicadores.forEach((info, i) => {
    const p = pool[i];
    if (!info || !info.bottom || !p) return;
    if (p.pct > -FUNDO_QUEDA_MIN || p.volUsdt < FILTRO_VOL_MIN_USDT) return;
    if (ladoAtual(info) === "long") return;
    if (info.bottom.pts < FUNDO_PRE_MIN) return;
    cands.push({ info, pct: p.pct });
  });
  cands.sort((a, b) => b.info.bottom!.pts - a.info.bottom!.pts);
  const top = cands.slice(0, 8);
  console.log(`🟢 radar de fundo: ${cands.length} candidata(s) com queda ≥ ${FUNDO_QUEDA_MIN}% e pré-filtro ≥ ${FUNDO_PRE_MIN} pts`);
  if (!top.length) return;
  const rowsMap = new Map<string, any>();
  try {
    const { data } = await SB.from(TAB).select("*").in("instid", top.map((c) => "_FUNDO_" + c.info.instId));
    ((data || []) as any[]).forEach((r) => rowsMap.set(r.instid, r));
  } catch (e) { console.log("⚠️ leitura do cooldown do radar falhou", e); }
  const agora = Date.now();
  let enviados = 0;
  for (const c of top) {
    if (enviados >= FUNDO_MAX_POR_RODADA) break;
    const inst = c.info.instId;
    const row = rowsMap.get("_FUNDO_" + inst);
    if (row?.last_alert_at && agora - new Date(row.last_alert_at).getTime() < FUNDO_COOLDOWN_MIN * 60000) continue;
    if (_fundoAvaliado.get(inst) === ckVela) continue;
    _fundoAvaliado.set(inst, ckVela);
    const [fin, vivo] = await Promise.all([fundoFinal(c.info.bottom!, inst), precoAoVivo(inst)]);
    if (fin.conf < FUNDO_CONF_MIN) { console.log(`🟢 radar: ${inst} ${fin.conf}/10 < ${FUNDO_CONF_MIN} (${fin.caindoFaca ? "faca caindo" : "sinais insuficientes"})`); continue; }
    const msg = msgFundo(c.info, c.pct, fin, vivo);
    await Promise.all(ativos.map(async (ch) => {
      let extra = "";
      for (const p of posDaMoeda(posMap.get(ch) ?? null, inst).filter((x) => x.lado === "short")) {
        extra += `\n\n📌 <b>Você está SHORT em ${inst}</b> — entrada ${fmtPrice(p.entrada)} | PnL ${sgn(p.pnl)} USDT (${sgn(p.pnlPct, 1)}% da margem)\nSinais de fundo aparecendo: considere realizar parte do lucro e subir o stop pro preço de entrada.`;
      }
      await enviarAlertaMoeda(SB, ch, inst, cortar(msg + extra), botaoAnalisar(inst));
    }));
    await registrarAlertaFundo(SB, c.info, c.pct, fin.conf);
    await upsertLinha(SB, "_FUNDO_" + inst, { last_status: `${fin.conf}/10`, last_alert_at: new Date().toISOString() });
    enviados++;
    console.log(`🟢 radar de fundo enviado: ${inst} ${fin.conf}/10`);
  }
}
async function runFundo(chatId: number | string) {
  const inicio = Date.now();
  const variacoes = await getVariacoes24h();
  const pool = [...variacoes].sort((a, b) => a.pct - b.pct).slice(0, OPORT_POOL);
  const infos = await emLotes(pool.map((t) => t.instId), 15, calcIndicadorFiltro);
  const cands: { info: InfoFiltravel; pct: number }[] = [];
  infos.forEach((info, i) => {
    const p = pool[i];
    if (!info || !info.bottom) return;
    if (p.pct > -FUNDO_QUEDA_MIN || p.volUsdt < FILTRO_VOL_MIN_USDT) return;
    if (ladoAtual(info) === "long") return;
    cands.push({ info, pct: p.pct });
  });
  cands.sort((a, b) => b.info.bottom!.pts - a.info.bottom!.pts);
  const top = cands.slice(0, 8);
  const fins = await Promise.all(top.map((c) => fundoFinal(c.info.bottom!, c.info.instId)));
  const itens = top.map((c, i) => ({ c, fin: fins[i] })).sort((a, b) => b.fin.conf - a.fin.conf || b.fin.pts - a.fin.pts);
  const dur = ((Date.now() - inicio) / 1000).toFixed(1);
  let msg = `🟢 <b>FUNDO — despencaram no dia + sinais de exaustão</b> — ${dur}s\n<i>pool: top ${OPORT_POOL} que mais caíram (24h) · queda ≥ ${FUNDO_QUEDA_MIN}% · volume ≥ ${(FILTRO_VOL_MIN_USDT / 1e6).toFixed(1)}M USDT</i>\n${DIVISOR}\n\n`;
  if (!itens.length) msg += "nenhuma moeda com queda, liquidez e sinais mínimos agora.\n\n";
  itens.forEach(({ c, fin }, i) => {
    const pos = fin.motivos.filter((m) => m.pts > 0).sort((a, b) => b.pts - a.pts).slice(0, 3).map((m) => m.txt);
    const neg = fin.motivos.filter((m) => m.pts < 0).sort((a, b) => a.pts - b.pts).slice(0, 2).map((m) => m.txt);
    msg += `<b>${i + 1}. ${c.info.instId}</b> 📉 ${c.pct.toFixed(2)}% (24h) · ${confEmoji(fin.conf)} <b>${fin.conf}/10</b>\n`;
    if (pos.length) msg += `✅ ${pos.join(" · ")}\n`;
    if (neg.length) msg += `⚠️ ${neg.join(" · ")}\n`;
    msg += `preço ${fmtPrice(c.info.preco)} (${c.info.distAbs.toFixed(1)}% abaixo da faixa) | topo ${fmtPrice(c.info.topo)}\n\n`;
  });
  msg += `<i>Aviso antecipado, não é entrada: o robô só abre LONG quando fechar 15m acima do indicador. O alerta automático sai com confiança ≥ ${FUNDO_CONF_MIN}/10. Use /seguir MOEDA pra ser avisado na linha.</i>`;
  await sendTelegram(chatId, cortar(msg));
}
const ALVO_RR = Number(Deno.env.get("ALVO_RR") || "2");
const STOP_ATR_MULT = Number(Deno.env.get("STOP_ATR_MULT") || "1");
type StopAlvo = { stop: number; alvo: number; riscoPct: number; retornoPct: number };
function calcStopAlvo(lado: "long" | "short", preco: number, topo: number, fundo: number, atr: number): StopAlvo | null {
  if (!(atr > 0) || !(preco > 0)) return null;
  const buffer = atr * STOP_ATR_MULT;
  let stop: number, alvo: number;
  if (lado === "long") {
    stop = fundo - buffer;
    if (!(stop < preco)) return null;
    const risco = preco - stop;
    alvo = preco + risco * ALVO_RR;
  } else {
    stop = topo + buffer;
    if (!(stop > preco)) return null;
    const risco = stop - preco;
    alvo = preco - risco * ALVO_RR;
  }
  return { stop, alvo, riscoPct: (Math.abs(preco - stop) / preco) * 100, retornoPct: (Math.abs(alvo - preco) / preco) * 100 };
}
function stopAlvoTxt(lado: "long" | "short", preco: number, topo: number, fundo: number, atr: number, aoVivo = false): string {
  const sa = calcStopAlvo(lado, preco, topo, fundo, atr);
  if (!sa) return "";
  return `🎯 Sugestão${aoVivo ? ` (a partir do preço agora, ${fmtPrice(preco)})` : ""}: stop ${fmtPrice(sa.stop)} (-${sa.riscoPct.toFixed(2)}%) | alvo ${fmtPrice(sa.alvo)} (+${sa.retornoPct.toFixed(2)}%, RR ${ALVO_RR}:1)\n`;
}
async function calcIndicadorFiltro(instId: string): Promise<InfoFiltravel | null> {
  const d = await xCandles(instId, TIMEFRAME, CANDLES_LIMIT_PRECISO);
  if (!d || d.c.length < 100) return null;
  const info = calcIndicadorDeCloses(instId, d.c);
  if (!info) return null;
  const adxSerie = xAdxSerie(d.h, d.l, d.c, 14);
  const adx = adxSerie.length ? adxSerie[adxSerie.length - 1] : 0;
  const adxAntes = adxSerie.length > 5 ? adxSerie[adxSerie.length - 5] : adx;
  const atr = calcATR(d.h, d.l, d.c, 14);
  let bottom: FundoRes | null = null;
  if (FUNDO_ON) { try { bottom = calcFundoPre(d, info, atr, adx, adxAntes); } catch (e) { console.log("⚠️ calcFundoPre falhou", instId, e); } }
  return { ...info, adx, adxAntes, rsi: calcRSI(d.c, 14), atr, volRatio: volAcel(d.v), trocas: contarTrocas(d.c), bottom };
}
type MotivoDescarte = "volume" | "adx" | "rsi" | "dist" | "serrote";
function motivoDescarte(x: InfoFiltravel, volUsdt: number, checaDist: boolean, lado?: "long" | "short"): MotivoDescarte | null {
  if (volUsdt < FILTRO_VOL_MIN_USDT) return "volume";
  if (x.adx < FILTRO_ADX_MIN) return "adx";
  if (ESTRAT_PUMP && lado) {
    if (lado === "long" ? x.rsi > FILTRO_RSI_MAX_LONG : x.rsi < FILTRO_RSI_MIN) return "rsi";
  } else if (x.rsi > FILTRO_RSI_MAX || x.rsi < FILTRO_RSI_MIN) return "rsi";
  if (checaDist && x.distAbs > FILTRO_DIST_MAX_PCT) return "dist";
  if (lado && SERROTE_MAX > 0 && (x.trocas ?? 0) >= SERROTE_MAX) return "serrote";
  return null;
}
function filtraCandidatos(infos: (InfoFiltravel | null)[], volMap: Map<string, number>, rotulo: string): InfoFiltravel[] {
  const validos = infos.filter((x): x is InfoFiltravel => x !== null);
  const cont: Record<MotivoDescarte, number> = { volume: 0, adx: 0, rsi: 0, dist: 0, serrote: 0 };
  const passaram = validos.filter((x) => {
    const m = motivoDescarte(x, volMap.get(x.instId) ?? 0, true);
    if (m) { cont[m]++; return false; }
    return true;
  });
  console.log(`🧹 ${rotulo}: ${infos.length} no pool, ${validos.length} com dados -> ${passaram.length} passaram | descartadas: volume ${cont.volume}, ADX ${cont.adx}, RSI extremo ${cont.rsi}, distancia>${FILTRO_DIST_MAX_PCT}% ${cont.dist}`);
  return passaram
  .map((x) => ({ x, nota: x.distAbs * (ADX_REF / Math.max(x.adx, 1)) }))
  .sort((a, b) => a.nota - b.nota)
  .slice(0, TOP_N_CRUZADO)
  .map((e) => e.x);
}
async function runCruzado(chatId: number | string, subiu: boolean) {
  const inicio = Date.now();
  const variacoes = await getVariacoes24h();
  const pool = [...variacoes].sort((a, b) => subiu ? b.pct - a.pct : a.pct - b.pct).slice(0, OPORT_POOL);
  const infos = await emLotes(pool.map((t) => t.instId), 15, calcIndicadorFiltro);
  const pctMap = new Map(pool.map((p) => [p.instId, p.pct] as [string, number]));
  const volMap = new Map(pool.map((p) => [p.instId, p.volUsdt] as [string, number]));
  const top = filtraCandidatos(infos, volMap, subiu ? "/oportunidade" : "/reversao");
  const dur = ((Date.now() - inicio) / 1000).toFixed(1);
  let msg = subiu
  ? `🚀 <b>OPORTUNIDADE — subiu no dia + perto do Indicador</b> — ${dur}s\n<i>pool: top ${OPORT_POOL} que mais subiram (24h)</i>\n${DIVISOR}\n\n`
  : `🔄 <b>REVERSÃO — caiu no dia + perto do Indicador</b> — ${dur}s\n<i>pool: top ${OPORT_POOL} que mais caíram (24h)</i>\n${DIVISOR}\n\n`;
  if (top.length === 0) msg += "sem dados no momento (nenhuma moeda passou nos filtros)\n";
  top.forEach((j, i) => {
    const pct = pctMap.get(j.instId) ?? 0;
    msg += `<b>${i + 1}. ${j.instId}</b> ${subiu ? "📈 +" : "📉 "}${pct.toFixed(2)}% (24h)\n${indicadorTxt(j)}\npreço ${fmtPrice(j.preco)} | topo ${fmtPrice(j.topo)} | fundo ${fmtPrice(j.fundo)}\n\n`;
  });
  await sendTelegram(chatId, cortar(msg));
}
function getSupabase() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_KEY);
}
type Setup = { ligue?: { alem: boolean; restMin: number } | null; aprox?: Aprox | null; info: IndicadorInfo; pct: number; lado: "long" | "short"; tipo: "oportunidade" | "reversao"; status: string; fresco: boolean };
const rankStatus = (s: string | null | undefined) => (s || "").includes("LIGUE AGORA") ? 3 : (s || "").includes("MUITO PERTO") ? 2 : ((s || "").includes("PERTO") || (s || "").includes("CHEGANDO")) ? 1 : 0;
function chegandoNaLinha(info: IndicadorInfo): Aprox | null {
  const ap = info.aprox ?? null;
  if (!ap || info.idadeCandles !== null || ANTEC_ETA_MAX_CANDLES <= 0) return null;
  const atr = (info as { atr?: number }).atr;
  const distOk = typeof atr === "number" && atr > 0 && info.preco > 0 && ANTEC_DIST_MAX_ATR > 0
    ? (ap.dist / ((atr / info.preco) * 100) <= ANTEC_DIST_MAX_ATR && ap.dist <= ANTEC_DIST_MAX_PCT * 2)
    : ap.dist <= ANTEC_DIST_MAX_PCT;
  return ap.etaCandles <= ANTEC_ETA_MAX_CANDLES && distOk && ap.consist >= 0.6 ? ap : null;
}
function idadeTxt(idade: number | null): string {
  if (idade === null) return "⏳ ainda NÃO cruzou (vai cruzar)";
  const min = idade * TF_MIN;
  if (idade <= ALERT_FRESCO_CANDLES) return idade === 0 ? "🆕 CRUZOU AGORA (vela atual)" : `🆕 cruzou há ~${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return `⌛ cruzada há ${h > 0 ? h + "h " : ""}${m}min (já passou)`;
}
function ladoAtual(info: IndicadorInfo): "long" | "short" | null {
  if (info.preco > info.topo) return "long";
  if (info.preco < info.fundo) return "short";
  return null;
}
function classificar(info: IndicadorInfo, pct: number): Setup | null {
  let status = statusIndicador(info.distAbs);
  const ap = chegandoNaLinha(info);
  if (rankStatus(status) === 0) { if (!ap) return null; status = "🎯 CHEGANDO"; }
  else if (ap && rankStatus(status) === 1) status = "🎯 CHEGANDO";
  let lado: "long" | "short";
  if (info.preco > info.topo) lado = "long";
  else if (info.preco < info.fundo) lado = "short";
  else if (ap) lado = ap.alvo;
  else lado = info.regiao.includes("topo") ? "long" : "short";
  const seguiu = (lado === "long" && pct > 0) || (lado === "short" && pct < 0);
  const abs = Math.abs(pct);
  const idade = info.idadeCandles;
  if (ALERT_IDADE_MAX_CANDLES > 0 && idade !== null && idade > ALERT_IDADE_MAX_CANDLES) return null;
  const fresco = idade !== null && idade <= ALERT_FRESCO_CANDLES;
  if (ESTRAT_PUMP && !seguiu && lado === "long") {
    const b = (info as Partial<InfoFiltravel>).bottom;
    if (!(FUNDO_ON && FUNDO_LIBERA_LONG && b && b.pts >= FUNDO_PRE_MIN && !b.caindoFaca)) return null;
  }
  if (seguiu && abs >= ALERT_OPORT_PCT_MIN) return { info, pct, lado, tipo: "oportunidade", status, fresco, aprox: ap };
  if (!seguiu && abs >= ALERT_REV_PCT_MIN) return { info, pct, lado, tipo: "reversao", status, fresco, aprox: ap };
  return null;
}
const _watchEnviado = new Set<string>();
type FinalPend = { inst: string; lado: "long" | "short"; ck: number; linha: number; atrPct: number; chats: string[]; estado: "ativo" | "cancelado"; tipo: "aviso" | "prepare" };
const _finalPend = new Map<string, FinalPend>();
const finalKey = (inst: string, lado: string, ck: number) => `${inst}|${lado}|${ck}`;
async function carregarEstado(SB: any) {
  try {
    const { data } = await SB.from("alertas_indicador").select("last_status").eq("instid", ESTADO_ROW).maybeSingle();
    if (!data?.last_status) return;
    const j = JSON.parse(data.last_status);
    const ck = Math.floor(Date.now() / (TF_MIN * 60000));
    for (const [k, v] of Object.entries(j.conf || {})) if (Number(v) === ck) _confBarrada.set(k, ck);
    for (const [k, v] of Object.entries(j.fundo || {})) if (Number(v) === ck) _fundoAvaliado.set(k, ck);
    for (const k of (Array.isArray(j.watch) ? j.watch : [])) _watchEnviado.add(String(k));
    for (const p of (Array.isArray(j.final) ? j.final : [])) {
      const lado = p?.lado === "long" || p?.lado === "short" ? p.lado : null;
      const pck = Number(p?.ck);
      if (!lado || typeof p?.inst !== "string" || !isFinite(pck) || pck < ck - 2) continue;
      _finalPend.set(finalKey(p.inst, lado, pck), {
        inst: p.inst, lado, ck: pck, linha: Number(p.linha) || 0, atrPct: Number(p.atrPct) || 0,
        chats: Array.isArray(p.chats) ? p.chats.map(String) : [], estado: p.estado === "cancelado" ? "cancelado" : "ativo", tipo: p.tipo === "prepare" ? "prepare" : "aviso",
      });
    }
  } catch (e) { console.log("⚠️ carregarEstado falhou (segue sem estado salvo)", e); }
}
async function salvarEstado(SB: any) {
  try {
    const ck = Math.floor(Date.now() / (TF_MIN * 60000));
    for (const [k, v] of _confBarrada) if (v !== ck) _confBarrada.delete(k);
    for (const [k, v] of _fundoAvaliado) if (v !== ck) _fundoAvaliado.delete(k);
    for (const [k, p] of _finalPend) if (p.ck < ck - 2) _finalPend.delete(k);
    const estado = { conf: Object.fromEntries(_confBarrada), fundo: Object.fromEntries(_fundoAvaliado), watch: [..._watchEnviado], final: [..._finalPend.values()] };
    const { data: row } = await SB.from("alertas_indicador").select("instid").eq("instid", ESTADO_ROW).maybeSingle();
    const campos = { last_status: JSON.stringify(estado) };
    if (row) await SB.from("alertas_indicador").update(campos).eq("instid", ESTADO_ROW);
    else await SB.from("alertas_indicador").insert({ instid: ESTADO_ROW, ...campos });
  } catch (e) { console.log("⚠️ salvarEstado falhou", e); }
}
async function checarListaAcompanhamento(SB: any, poolInfoMap: Map<string, IndicadorInfo>, posMap: Map<string, Pos[] | null>) {
  const agoraIso = new Date().toISOString();
  const { data: watchRows } = await SB.from("alertas_indicador").select("*").not("watch_until", "is", null).gt("watch_until", agoraIso).eq("watch_notificado", false);
  if (!watchRows || watchRows.length === 0) { console.log("👀 lista de acompanhamento vazia"); return; }
  console.log(`👀 ${watchRows.length} moeda(s) na lista de acompanhamento`);
  await emLotes(watchRows as any[], 5, async (row: any) => {
    let info = poolInfoMap.get(row.instid) || null;
    if (!info) info = await calcIndicador500(row.instid);
    if (!info) return;
    const atual = ladoAtual(info);
    if (atual === null || atual === row.watch_side) return;
    const psDe = (ch: string) => posDaMoeda(posMap.get(ch) ?? null, info.instId);
    const kw = (ch: string) => `${info.instId}|${ch}`;
    const dest = ALERT_CHAT_IDS.filter((ch) => !_watchEnviado.has(kw(ch)) && (!silChat(ch) || (SILENCIO_PROTECAO && psDe(ch).some((p) => p.lado !== atual))));
    if (!dest.length) return;
    const desdeMs = row.last_alert_at ? new Date(row.last_alert_at).getTime() : null;
    const horasDesde = desdeMs ? ((Date.now() - desdeMs) / 3_600_000).toFixed(1) : "?";
    const msg =
    `🔁 <b>${info.instId}</b> — cruzou CONTRA o movimento\n${DIVISOR}\n\n` +
    `Alerta original era <b>${row.watch_side === "long" ? "LONG" : "SHORT"}</b>, há ${horasDesde}h\n` +
    `Agora cruzou pra <b>${atual === "long" ? "LONG" : "SHORT"}</b>\n` +
    `${idadeTxt(info.idadeCandles)}\n` +
    `${indicadorTxt(info)}\n` +
    `preço ${fmtPrice(info.preco)} | topo ${fmtPrice(info.topo)} | fundo ${fmtPrice(info.fundo)}`;
    await Promise.all(dest.map(async (ch) => {
      await enviarAlertaMoeda(SB, ch, info!.instId, cortar(msg + (await blocoPosicao(psDe(ch), info!))), botaoAnalisar(info!.instId));
      _watchEnviado.add(kw(ch));
    }));
    if (!ALERT_CHAT_IDS.every((ch) => _watchEnviado.has(kw(ch)))) return;
    ALERT_CHAT_IDS.forEach((ch) => _watchEnviado.delete(kw(ch)));
    await SB.from("alertas_indicador").update({ watch_notificado: true, watch_until: null }).eq("instid", row.instid);
    console.log(`🔁 ${info.instId} saiu da lista de acompanhamento (cruzou contra: ${row.watch_side} -> ${atual})`);
  });
}
function cooldownEfetivoMin(row: any, lado: string, status: string): number {
  const repeticao = row?.watch_side === lado && rankStatus(status) === rankStatus(row?.last_status);
  return repeticao ? Math.max(ALERT_COOLDOWN_MIN, ALERT_COOLDOWN_REPETIDO_MIN) : ALERT_COOLDOWN_MIN;
}
function refinarAoVivo(c: Setup, vivo: number): "recuou" | "ok" {
  const ap = c.aprox;
  if (!ap) return "ok";
  const dViva = ap.alvo === "long" ? ((c.info.topo - vivo) / vivo) * 100 : ((vivo - c.info.fundo) / vivo) * 100;
  const alem = dViva <= 0;
  const eta = alem ? 0.1 : (ap.vel > 0 ? dViva / ap.vel : ap.etaCandles);
  if (!alem && ANTEC_ETA_MAX_CANDLES > 0 && eta > ANTEC_ETA_MAX_CANDLES) return "recuou";
  c.aprox = { ...ap, dist: Math.max(dViva, 0), etaCandles: eta };
  const restMin = Math.max(1, Math.ceil(TF_MIN - (Date.now() % (TF_MIN * 60000)) / 60000));
  if (alem || eta <= ANTEC_LIGUE_ETA_CANDLES) {
    c.ligue = { alem, restMin };
    c.status = "🚨 LIGUE AGORA";
  }
  return "ok";
}
// ===== V31/V32: alerta dos minutos finais da vela ("vai fechar cruzado, ligue o robô") =====
// Nos últimos minutos da vela de 15m, projeta o fechamento usando o preço de agora (como se a vela fechasse já).
// Se isso for um cruzamento NOVO da linha (e passar nos mesmos filtros/confiança do alerta normal), avisa (🚨).
// Um pouco antes (~10 min), avisa 🕒 PREPARE pra moeda colada na linha e chegando.
// A pendência fica salva no _ESTADO_ (o cron não guarda memória entre rodadas) pra:
//  • cancelar com histerese se o preço recuar de verdade antes do fechamento (🛑);
//  • confirmar (✅) ou desmentir (❌) quando a vela fechar, e avisar (🔜) se ela fechou sem cruzar mas segue chegando;
//  • entrar no placar (status "VAI FECHAR"), medido só contra a vela que estava fechando.
const FINAL_PERIODO_MS = TF_MIN * 60000;
const FINAL_STATUS = "⏱ VAI FECHAR CRUZADO";
const finalRestMs = () => FINAL_PERIODO_MS - (Date.now() % FINAL_PERIODO_MS);
const finalRestMin = () => Math.max(1, Math.ceil(finalRestMs() / 60000));
// quanto o preço está além da linha, em % (negativo = ainda do lado de dentro)
const finalAlem = (lado: "long" | "short", vivo: number, linha: number) => (lado === "long" ? ((vivo - linha) / linha) * 100 : ((linha - vivo) / linha) * 100);
// distância até a linha do lado, em % (positivo = ainda não chegou; negativo = já passou)
const distLinha = (lado: "long" | "short", preco: number, topo: number, fundo: number) => (lado === "long" ? ((topo - preco) / preco) * 100 : ((preco - fundo) / preco) * 100);
const enviarFinal = (SB: any, chats: string[], inst: string, msg: string) =>
  Promise.all(chats.filter((ch) => ALERT_CHAT_IDS.includes(ch)).map((ch) => enviarAlertaMoeda(SB, ch, inst, cortar(msg), botaoAnalisar(inst))));
function simularFechamento(instId: string, d: XVelas, vivo: number, base: InfoFiltravel): InfoFiltravel | null {
  const closes = [...d.c, vivo];
  const hip = calcIndicadorDeCloses(instId, closes);
  if (!hip) return null;
  return { ...hip, adx: base.adx, adxAntes: base.adxAntes, atr: base.atr, rsi: calcRSI(closes, 14), volRatio: base.volRatio ?? null, trocas: contarTrocas(closes), bottom: base.bottom ?? null };
}
// o horário em que a vela FECHA (não o de agora) é o que conta: às vezes o fechamento cai na virada da hora
function janelaNoFechamento(perfil: XPerfil | null): { forte: boolean; fraca: boolean; idx: number } | null {
  if (!perfil) return null;
  const h = new Date(Date.now() + finalRestMs() + X_TZ_OFFSET_H * 3600000).getUTCHours();
  const idx = perfil.idx[h];
  return typeof idx === "number" && isFinite(idx) ? { forte: idx >= X_JANELA_FORTE, fraca: idx <= X_JANELA_FRACA, idx } : null;
}
function janelaTxt(perfil: XPerfil | null): string {
  const j = janelaNoFechamento(perfil);
  if (!j) return "";
  if (j.forte) return `⚡ <b>PRIORIDADE</b> — o fechamento cai numa janela forte de movimento (${j.idx.toFixed(2)}× o médio)\n`;
  if (j.fraca) return `🐢 janela fraca no fechamento (${j.idx.toFixed(2)}× o médio): o cruzamento tende a ter menos força\n`;
  return "";
}
// a vela de ck fechou sem cruzar: a distância até a linha ainda está caindo e é curta? então a chance passa pra próxima vela
function proximaVela(instId: string, closes: number[], i: number, lado: "long" | "short"): { dNow: number; dPrev: number } | null {
  const now = calcIndicadorDeCloses(instId, closes.slice(0, i + 1));
  const prev = calcIndicadorDeCloses(instId, closes.slice(0, i));
  if (!now || !prev) return null;
  const dNow = distLinha(lado, now.preco, now.topo, now.fundo);
  const dPrev = distLinha(lado, prev.preco, prev.topo, prev.fundo);
  return dNow > 0 && dNow <= FINAL_PROXIMA_DIST_PCT && dNow < dPrev ? { dNow, dPrev } : null;
}
async function registrarAlertaFinal(SB: any, s: Setup, conf: number | null) {
  if (!FINAL_PLACAR_ON) return;
  try {
    const f = s.info as Partial<InfoFiltravel>;
    // idade_candles null: o placar procura o fechamento da vela seguinte (só ela, ver achaEntrada) pra dizer se o robô entrou
    await inserirLogAlerta(SB, {
      instid: s.info.instId, lado: s.lado, tipo: s.tipo, status: FINAL_STATUS, fresco: false,
      idade_candles: null, pct24: s.pct, preco: s.info.preco, adx: f.adx ?? null, rsi: f.rsi ?? null,
    }, conf);
  } catch (e) { console.log("⚠️ registrarAlertaFinal erro", e); }
}
function montarPlacarFinal(finais: any[]): string {
  const res = finais.filter((r) => r.ent_status != null);
  const ok = res.filter((r) => r.ent_status === "entrou");
  const nao = res.filter((r) => r.ent_status === "nao_entrou").length;
  const contra = res.filter((r) => r.ent_status === "contra").length;
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}% (${a}/${b})` : "—");
  let m = `⏱ <b>Alerta dos minutos finais</b> (n=${finais.length}, ${res.length} já conferidos)\n`;
  if (res.length) {
    m += `✅ fechou cruzado: <b>${pct(ok.length, res.length)}</b> · ❌ não fechou: ${nao} · ↔️ fechou do lado oposto: ${contra}\n`;
    const bucket = (nome: string, fn: (r: any) => boolean) => {
      const g = res.filter((r) => r.conf != null && fn(r));
      return g.length ? `${nome} ${pct(g.filter((r) => r.ent_status === "entrou").length, g.length)}` : "";
    };
    const porConf = [bucket("conf 8–10:", (r) => Number(r.conf) >= 8), bucket("6–7:", (r) => Number(r.conf) >= 6 && Number(r.conf) <= 7), bucket("≤ 5:", (r) => Number(r.conf) <= 5)].filter(Boolean);
    if (porConf.length) m += `🧭 acerto do aviso por confiança — ${porConf.join(" · ")}\n`;
    const tipo = (nome: string, t: string) => {
      const g = res.filter((r) => r.tipo === t);
      return g.length ? `${nome} ${pct(g.filter((r) => r.ent_status === "entrou").length, g.length)}` : "";
    };
    const porTipo = [tipo("🚀 oportunidade", "oportunidade"), tipo("🔄 reversão", "reversao")].filter(Boolean);
    if (porTipo.length) m += `${porTipo.join(" · ")}\n`;
  }
  if (ok.length) m += `💰 Dos que fecharam cruzado (entrada = fechamento da vela): ${linhaStats(ok)}\n`;
  m += `<i>acerto do aviso = a vela que estava fechando realmente fechou cruzada; fica de fora das estatísticas acima pra não contar o mesmo cruzamento duas vezes</i>\n\n`;
  return m;
}
async function resolverFinais(SB: any, ck: number) {
  for (const [k, p] of [..._finalPend]) {
    if (p.ck >= ck) continue;
    if (p.ck < ck - 2 || p.estado === "cancelado") { _finalPend.delete(k); continue; }
    const d = await xCandles(p.inst, TIMEFRAME, CANDLES_LIMIT_PRECISO).catch(() => null);
    const i = d ? d.t.indexOf(p.ck * FINAL_PERIODO_MS) : -1;
    if (!d || i < 100) continue;
    const fech = calcIndicadorDeCloses(p.inst, d.c.slice(0, i + 1));
    if (!fech) continue;
    _finalPend.delete(k);
    const nome = p.lado === "long" ? "LONG" : "SHORT";
    const cruzou = ladoAtual(fech) === p.lado;
    const linhaPreco = `preço fech. ${fmtPrice(fech.preco)} | topo ${fmtPrice(fech.topo)} | fundo ${fmtPrice(fech.fundo)}`;
    let msg: string;
    if (cruzou) {
      // quem recebeu só o PREPARE: o alerta normal de cruzamento sai em seguida, não repete aqui
      if (p.tipo === "prepare") { console.log(`⏱ prepare ${p.inst} ${p.lado}: cruzou no fechamento (alerta normal cobre)`); continue; }
      msg = `✅ <b>${p.inst}</b> — FECHOU CRUZADO pra <b>${nome}</b>\n${DIVISOR}\n\nO aviso dos minutos finais se confirmou: a vela de ${TIMEFRAME} fechou ${p.lado === "long" ? "acima" : "abaixo"} da linha (${fech.distAbs.toFixed(3)}% além). O robô entra no fechamento.\n${linhaPreco}`;
    } else {
      const prox = proximaVela(p.inst, d.c, i, p.lado);
      if (p.tipo === "prepare" && !prox) { console.log(`⏱ prepare ${p.inst} ${p.lado}: fechou sem cruzar e sem seguir perto (sem aviso)`); continue; }
      const seguePerto = prox
        ? `\n🔜 <b>Mas segue perto</b>: fechou a ${prox.dNow.toFixed(2)}% da linha de ${nome} (na vela anterior era ${prox.dPrev.toFixed(2)}%) e ainda está chegando. A chance passa pra próxima vela: se quiser, pode deixar o robô ligado; eu aviso de novo nos minutos finais.`
        : "";
      msg = p.tipo === "prepare"
        ? `🔜 <b>${p.inst}</b> — fechou sem cruzar, mas segue perto\n${DIVISOR}\n\nO aviso era de <b>${nome}</b> e a vela fechou sem cruzar.${seguePerto}\n${indicadorTxt(fech)}\n${linhaPreco}`
        : `❌ <b>${p.inst}</b> — NÃO fechou cruzado\n${DIVISOR}\n\nO aviso era de <b>${nome}</b>, mas o preço recuou e a vela fechou sem cruzar.${prox ? seguePerto : " <b>O robô não deve entrar</b> — pode desligar se ligou por causa do aviso."}\n${indicadorTxt(fech)}\n${linhaPreco}`;
    }
    console.log(`⏱ final ${p.inst} ${p.lado} (${p.tipo}): ${cruzou ? "confirmou" : "não confirmou"} no fechamento`);
    await enviarFinal(SB, p.chats, p.inst, msg);
  }
}
async function acompanharFinais(SB: any, ck: number, lastMap: Map<string, number>) {
  for (const p of _finalPend.values()) {
    if (p.tipo !== "aviso" || p.ck !== ck || p.estado !== "ativo" || !(p.linha > 0)) continue;
    const vivo = (await precoAoVivo(p.inst)) ?? lastMap.get(p.inst) ?? null;
    if (vivo === null) continue;
    const alem = finalAlem(p.lado, vivo, p.linha);
    // histerese: entrou com o preço além da linha; só cancela se recuar de verdade pra dentro (margem em % ou em ATR)
    const margem = Math.max(FINAL_CANCELA_PCT, FINAL_CANCELA_ATR * p.atrPct);
    if (alem > -margem) continue;
    p.estado = "cancelado";
    const nome = p.lado === "long" ? "LONG" : "SHORT";
    console.log(`⏱ final ${p.inst} ${p.lado}: cancelado (preço ${fmtPrice(vivo)}, ${alem.toFixed(3)}% da linha, margem ${margem.toFixed(3)}%)`);
    await enviarFinal(SB, p.chats, p.inst,
      `🛑 <b>${p.inst}</b> — RECUOU antes do fechamento\n${DIVISOR}\n\nO aviso "vai fechar cruzado (${nome})" não vale mais: o preço voltou pra dentro da linha (${Math.abs(alem).toFixed(2)}% do lado de dentro). <b>Pode desligar o robô</b> se ligou por causa dele.\nFaltam ~${finalRestMin()} min pra vela fechar; se ela fechar cruzada mesmo assim, o alerta normal de cruzamento sai em seguida.\npreço agora ${fmtPrice(vivo)} | linha ${fmtPrice(p.linha)}`);
  }
}
async function checarAlertaFinal(
  SB: any,
  pool: { instId: string; pct: number; volUsdt: number }[],
  indicadores: (InfoFiltravel | null)[],
  lastMap: Map<string, number>,
  posMap: Map<string, Pos[] | null>,
  perfil: XPerfil | null,
) {
  if (!FINAL_ON) return;
  const ck = Math.floor(Date.now() / FINAL_PERIODO_MS);
  await resolverFinais(SB, ck);
  await acompanharFinais(SB, ck, lastMap);
  const rest = finalRestMs();
  const modo: "aviso" | "prepare" | null =
    rest <= FINAL_JANELA_MAX_MIN * 60000 && rest >= FINAL_JANELA_MIN_MIN * 60000 ? "aviso"
    : (FINAL_PREPARE_MAX_MIN > FINAL_JANELA_MAX_MIN && rest > FINAL_JANELA_MAX_MIN * 60000 && rest <= FINAL_PREPARE_MAX_MIN * 60000) ? "prepare"
    : null;
  if (!modo) return;
  // 1) pré-filtro barato: preço de agora perto/além da linha da última vela FECHADA, e ainda não cruzada desse lado
  //    (no PREPARE: além disso, mais perto da linha do que o fechamento anterior estava = "chegando")
  type Cand = { inst: string; lado: "long" | "short"; base: InfoFiltravel; pct: number; vol: number; d: number };
  const cands: Cand[] = [];
  const pctMin = Math.min(ALERT_OPORT_PCT_MIN, ALERT_REV_PCT_MIN);
  const limite = modo === "aviso" ? FINAL_PREFILTRO_PCT : FINAL_PREPARE_DIST_PCT * 1.5;
  indicadores.forEach((base, i) => {
    if (!base) return;
    const inst = pool[i].instId;
    const last = lastMap.get(inst);
    if (!last || Math.abs(pool[i].pct) < pctMin) return;
    const atual = ladoAtual(base);
    const opcoes: { lado: "long" | "short"; d: number }[] = [];
    for (const l of ["long", "short"] as const) {
      const d = distLinha(l, last, base.topo, base.fundo);
      if (d > limite || atual === l) continue;
      if (modo === "prepare" && !(d < distLinha(l, base.preco, base.topo, base.fundo))) continue;
      opcoes.push({ lado: l, d });
    }
    if (!opcoes.length) return;
    const o = opcoes.sort((a, b) => a.d - b.d)[0];
    const ex = _finalPend.get(finalKey(inst, o.lado, ck));
    if (ex && (modo === "prepare" || ex.tipo === "aviso")) return;
    if (_confBarrada.get(inst + o.lado) === ck) return;
    if (ALERT_FILTROS_ON && motivoDescarte(base, pool[i].volUsdt, false, o.lado)) return;
    cands.push({ inst, lado: o.lado, base, pct: pool[i].pct, vol: pool[i].volUsdt, d: o.d });
  });
  if (!cands.length) { console.log(`⏱ final (${modo}): faltam ${(rest / 60000).toFixed(1)} min, nenhum candidato perto da linha`); return; }
  cands.sort((a, b) => a.d - b.d);
  const top = cands.slice(0, FINAL_MAX_CAND);
  // 2) simulação exata: fecha a vela "de mentira" no preço de agora
  //    aviso: tem que ser cruzamento NOVO; prepare: ainda não cruzou, mas está colada na linha
  const sims = (await emLotes(top, 4, async (c) => {
    const [d, vivo] = await Promise.all([xCandles(c.inst, TIMEFRAME, CANDLES_LIMIT_PRECISO), precoAoVivo(c.inst)]);
    if (!d || d.c.length < 100 || vivo === null) return null;
    const hip = simularFechamento(c.inst, d, vivo, c.base);
    if (!hip) return null;
    if (modo === "aviso") {
      if (hip.idadeCandles !== 0 || ladoAtual(hip) !== c.lado || hip.distAbs < FINAL_ENTRADA_PCT) return null;
    } else {
      const dHip = distLinha(c.lado, vivo, hip.topo, hip.fundo);
      if (ladoAtual(hip) !== null || !(dHip > 0 && dHip <= FINAL_PREPARE_DIST_PCT)) return null;
    }
    const s = classificar(hip, c.pct);
    if (!s || s.lado !== c.lado) return null;
    if (ALERT_FILTROS_ON && motivoDescarte(hip, c.vol, false, s.lado)) return null;
    return { s, hip, vivo, vol: c.vol, dist: distLinha(c.lado, vivo, hip.topo, hip.fundo) };
  })).filter((x): x is NonNullable<typeof x> => x !== null);
  console.log(`⏱ final (${modo}): faltam ${(rest / 60000).toFixed(1)} min | ${cands.length} perto da linha, ${sims.length} passaram na simulação`);
  if (!sims.length) return;
  // não duplica o que o loop principal já mandou nesta vela pra mesma moeda e lado
  const rows = new Map<string, any>();
  try {
    const { data } = await SB.from("alertas_indicador").select("instid,last_status,last_alert_at,watch_side").in("instid", sims.map((x) => x.hip.instId));
    ((data || []) as any[]).forEach((r) => rows.set(r.instid, r));
  } catch (e) { console.log("⚠️ leitura das linhas (alerta final) falhou", e); }
  const abertura = ck * FINAL_PERIODO_MS;
  const loopJaAvisou = (inst: string, lado: string, soLigue: boolean) => {
    const r = rows.get(inst);
    if (!r || r.watch_side !== lado || !r.last_alert_at || new Date(r.last_alert_at).getTime() < abertura) return false;
    return soLigue ? String(r.last_status || "").includes("LIGUE AGORA") : true;
  };
  const posDe = (ch: string, inst: string) => posDaMoeda(posMap.get(ch) ?? null, inst);
  let enviados = 0;
  for (const x of sims.sort((a, b) => a.dist - b.dist)) {
    if (enviados >= (modo === "aviso" ? FINAL_MAX_POR_RODADA : FINAL_PREPARE_MAX)) break;
    const { s, hip, vivo } = x;
    const inst = hip.instId, lado = s.lado;
    if (loopJaAvisou(inst, lado, modo === "aviso")) {
      console.log(`⏱ final ${inst} ${lado} (${modo}): loop principal já avisou nesta vela (sem duplicar)`);
      continue;
    }
    const ativos = ALERT_CHAT_IDS.filter((ch) => !silChat(ch));
    // 🚨 em silêncio ainda protege quem tem posição do lado oposto; PREPARE é só antecipação e respeita o silêncio
    const protegidos = modo === "aviso" && SILENCIO_PROTECAO ? ALERT_CHAT_IDS.filter((ch) => silChat(ch) && posDe(ch, inst).some((p) => p.lado !== lado)) : [];
    // quem já está posicionado no lado do sinal não precisa do "ligue o robô"
    const destinos = [...new Set([...ativos, ...protegidos])].filter((ch) => !posDe(ch, inst).some((p) => p.lado === lado));
    if (!destinos.length) continue;
    const confRes = await calcConfiancaAlerta(s, x.vol, perfil);
    const minBase = s.tipo === "reversao" ? (lado === "long" ? CONF_MIN_FUNDO_LONG : CONF_MIN_REVERSAO) : CONF_MIN_OPORT;
    // moeda que ainda não cruzou pontua ~1–2 pts a menos que a que cruzou: o PREPARE tem essa folga, o 🚨 não
    const minConf = modo === "aviso" ? minBase : Math.max(0, minBase - FINAL_PREPARE_FOLGA_CONF);
    if (minConf > 0 && confRes && confRes.conf < minConf) {
      // só o 🚨 trava a moeda pra vela toda; o PREPARE barrado não pode impedir o 🚨 de sair depois
      if (modo === "aviso") _confBarrada.set(inst + lado, ck);
      console.log(`🧭 final ${inst} ${lado} (${s.tipo}, ${modo}) barrado: confiança ${confRes.conf}/10 < ${minConf}`);
      continue;
    }
    if (BTC_BLOQ_REV_PCT > 0 && s.tipo === "reversao" && lado === "short" && confRes?.btcVar != null && confRes.btcVar >= BTC_BLOQ_REV_PCT) {
      if (modo === "aviso") _confBarrada.set(inst + lado, ck);
      console.log(`₿ final ${inst} SHORT de reversão barrado: BTC +${confRes.btcVar.toFixed(1)}%/h (limite ${BTC_BLOQ_REV_PCT}%)`);
      continue;
    }
    const tipoTxt = s.tipo === "oportunidade" ? "🚀 <b>OPORTUNIDADE</b> (continuação)" : "🔄 <b>REVERSÃO</b> (moeda esticada)";
    const ladoTxt = lado === "long" ? "LONG (compra)" : "SHORT (venda)";
    const pctTxt = `${s.pct >= 0 ? "📈 subiu +" : "📉 caiu "}${s.pct.toFixed(2)}% em 24h\n`;
    const linhas = `preço agora ${fmtPrice(vivo)} | topo ${fmtPrice(hip.topo)} | fundo ${fmtPrice(hip.fundo)} (linhas projetadas pro fechamento)`;
    const foTxt = confRes?.fo ? fundingOiTxt(confRes.fo) : "";
    const linhaFo = confRes ? (foTxt ? `\n💸 ${foTxt}` : "") : await linhaFundingOI(inst);
    const linhaConf = "\n" + janelaTxt(perfil) + (confRes ? confLinha(confRes) : "");
    const nomeCurto = lado === "long" ? "LONG" : "SHORT";
    const msg = modo === "aviso"
      ? `🚨 <b>${inst}</b> — VAI FECHAR CRUZADO\n${DIVISOR}\n\n${tipoTxt}\n${pctTxt}Robô abriria: <b>${ladoTxt}</b>\n` +
        (hip.atr > 0 ? stopAlvoTxt(lado, vivo, hip.topo, hip.fundo, hip.atr, true) : "") +
        `⏱ <b>LIGUE O ROBÔ AGORA</b> — faltam ~${finalRestMin()} min pra vela de ${TIMEFRAME} fechar e o preço já está ${lado === "long" ? "acima" : "abaixo"} da linha (${hip.distAbs.toFixed(3)}% além). O robô entra no fechamento.\n` +
        `🔁 Se o preço recuar pra dentro antes do fechamento, eu aviso pra desligar.\n${linhas}`
      : `🕒 <b>${inst}</b> — PREPARE (fecha em ~${finalRestMin()} min)\n${DIVISOR}\n\n${tipoTxt}\n${pctTxt}Robô abriria: <b>${ladoTxt}</b>\n` +
        `🕒 <b>PREPARE</b> — ainda NÃO ligue: o preço está a ${x.dist.toFixed(3)}% da linha de ${nomeCurto} e chegando. Se cruzar antes do fechamento, eu mando o 🚨 (LIGUE AGORA).\n${linhas}`;
    await Promise.all(destinos.map(async (ch) => enviarAlertaMoeda(SB, ch, inst, cortar(msg + linhaConf + linhaFo + avisoLimiteLado(posMap.get(ch) ?? null, lado) + (modo === "aviso" ? await blocoPosicao(posDe(ch, inst), hip, lado) : "")), botaoAnalisar(inst))));
    _finalPend.set(finalKey(inst, lado, ck), {
      inst, lado, ck, linha: lado === "long" ? hip.topo : hip.fundo,
      atrPct: hip.preco > 0 ? (hip.atr / hip.preco) * 100 : 0, chats: destinos, estado: "ativo", tipo: modo,
    });
    if (modo === "aviso") await registrarAlertaFinal(SB, s, confRes?.conf ?? null);
    enviados++;
    console.log(`⏱ final ${inst} ${lado} (${modo}): avisado (${modo === "aviso" ? `${hip.distAbs.toFixed(3)}% além` : `${x.dist.toFixed(3)}% da linha`}, faltam ~${finalRestMin()} min, ${destinos.length} chat(s))`);
  }
}
async function runAlertaProativo() {
  if (!ALERT_CHAT_IDS.length) { console.log("⚠️ nenhum chat recebe alerta (ALLOWED_CHAT_IDS vazio ou todos em ALERT_EXCLUIR_IDS)"); return; }
  const SB = getSupabase();
  if (!SB) { console.log("⚠️ SUPABASE_URL/KEY nao configurados"); return; }
  await carregarEstado(SB);
  for (const k of Object.keys(_fonte)) delete _fonte[k];
  await avisarCronParado(SB).catch((e) => console.log("⚠️ erro avisarCronParado", e));
  const inicio = Date.now();
  const silencio = emSilencio();
  await carregarPausas(SB).catch((e) => console.log("⚠️ pausas", e));
  const todosSil = ALERT_CHAT_IDS.every((ch) => silChat(ch));
  const posMap = new Map<string, Pos[] | null>();
  await Promise.all(ALERT_CHAT_IDS.map(async (ch) => { posMap.set(ch, await getPosicoes(ch)); }));
  const posDe = (ch: string, inst: string) => posDaMoeda(posMap.get(ch) ?? null, inst);
  const nPos = [...posMap.values()].reduce((n, l) => n + (l ? l.length : 0), 0);
  await Promise.all([
    checarRisco(SB, posMap).catch((e) => console.log("❌ erro risco", e)),
    checarProtecaoLucro(SB, posMap).catch((e) => console.log("❌ erro proteção de lucro", e)),
    checarEnfraquecimento(SB, posMap).catch((e) => console.log("❌ erro enfraquecimento", e)),
  ]);
  if (todosSil && (!SILENCIO_PROTECAO || nPos === 0)) {
    console.log(`🌙 todos em silêncio/pausa (${silencio ? `horário ${SILENCIO_INI_H}h–${SILENCIO_FIM_H}h` : "pausa manual"}): nada a proteger, só conferindo o placar`);
    try { await conferirPlacar(SB); } catch (e) { console.log("❌ erro placar", e); }
    await heartbeat(SB, `silêncio | ${((Date.now() - inicio) / 1000).toFixed(1)}s`);
    return;
  }
  if (todosSil) console.log(`🌙 todos em silêncio/pausa: só alertas de proteção (${nPos} posição(ões) aberta(s))`);
  const variacoes = await getVariacoes24h();
  const subiram = [...variacoes].sort((a, b) => b.pct - a.pct).slice(0, ALERT_POOL);
  const cairam = [...variacoes].sort((a, b) => a.pct - b.pct).slice(0, ALERT_POOL);
  const poolMap = new Map<string, { instId: string; pct: number; volUsdt: number }>();
  subiram.forEach((s) => poolMap.set(s.instId, { instId: s.instId, pct: s.pct, volUsdt: s.volUsdt }));
  cairam.forEach((c) => poolMap.set(c.instId, { instId: c.instId, pct: c.pct, volUsdt: c.volUsdt }));
  const pool = [...poolMap.values()];
  const indicadores = await emLotes(pool.map((p) => p.instId), 20, calcIndicadorFiltro);
  const setups: Setup[] = [];
  const descartes: Record<MotivoDescarte, number> = { volume: 0, adx: 0, rsi: 0, dist: 0, serrote: 0 };
  let descartadosFiltro = 0;
  indicadores.forEach((info, i) => {
    if (!info) return;
    const s = classificar(info, pool[i].pct);
    if (!s) return;
    if (ALERT_FILTROS_ON) {
      const m = motivoDescarte(info, pool[i].volUsdt, false, s.lado);
      if (m) { descartes[m]++; descartadosFiltro++; return; }
    }
    setups.push(s);
  });
  const perfilAlerta = await xPerfilHoras().catch(() => null);
  const prioJanela = (s: Setup) => Number(!!s.aprox && chegadaEmJanelaForte(s.aprox, perfilAlerta));
  setups.sort((a, b) => Number(b.fresco) - Number(a.fresco) || prioJanela(b) - prioJanela(a) || rankStatus(b.status) - rankStatus(a.status) || a.info.distAbs - b.info.distAbs);
  const rowsMap = new Map<string, any>();
  if (setups.length) {
    try {
      const { data: rs } = await SB.from("alertas_indicador").select("*").in("instid", setups.map((s) => s.info.instId));
      ((rs || []) as any[]).forEach((r) => rowsMap.set(r.instid, r));
    } catch (e) { console.log("⚠️ leitura em lote das linhas de alerta falhou", e); }
  }
  console.log(`🔔 ${setups.length} setups validos (pool ${pool.length}, oport>=${ALERT_OPORT_PCT_MIN}% rev>=${ALERT_REV_PCT_MIN}%)` +
    (ALERT_FILTROS_ON ? ` | 🧹 filtros seguraram ${descartadosFiltro}: volume ${descartes.volume}, ADX ${descartes.adx}, RSI extremo ${descartes.rsi}, serrote ${descartes.serrote}` : " | filtros DESLIGADOS"));
  const agora = Date.now();
  let enviados = 0;
  let confBarrados = 0;
  const vivoMemo = new Map<string, Promise<number | null>>();
  const getVivo = (i: string) => { if (!vivoMemo.has(i)) vivoMemo.set(i, precoAoVivo(i)); return vivoMemo.get(i)!; };
  for (const c of setups) {
    if (enviados >= ALERT_MAX_POR_RODADA) break;
    const inst = c.info.instId;
    if (c.info.idadeCandles === null && c.aprox) {
      const v0 = await getVivo(inst);
      if (v0 !== null && refinarAoVivo(c, v0) === "recuou") {
        console.log(`↩️ ${inst} ${c.lado}: preço ao vivo recuou, aproximação já não vale (sem alerta)`);
        continue;
      }
    }
    const cruzou = ladoAtual(c.info) === c.lado;
    const chatsContra = ALERT_CHAT_IDS.filter((ch) => cruzou && posDe(ch, inst).some((p) => p.lado !== c.lado));
    const ativos = ALERT_CHAT_IDS.filter((ch) => !silChat(ch));
    const protegidos = SILENCIO_PROTECAO ? chatsContra.filter((ch) => silChat(ch)) : [];
    if (!ativos.length && !protegidos.length) continue;
    const contraPos = chatsContra.some((ch) => !silChat(ch) || SILENCIO_PROTECAO);
    const row = rowsMap.get(c.info.instId) ?? null;
    const cooldownOk = !row?.last_alert_at || (agora - new Date(row.last_alert_at).getTime()) >= cooldownEfetivoMin(row, c.lado, c.status) * 60 * 1000;
    const escalouBase = rankStatus(c.status) > rankStatus(row?.last_status)
    || (c.fresco && !(row?.last_status || "").includes("🆕"));
    const escalouContra = contraPos && !(row?.last_status || "").includes("🛡️");
    if (!cooldownOk && !escalouBase && !escalouContra) continue;
    const destinosBase = (cooldownOk || escalouBase) ? [...new Set([...ativos, ...protegidos])] : chatsContra.filter((ch) => !silChat(ch) || SILENCIO_PROTECAO);
    // Posição já no lado do sinal: "chegando na linha" não acrescenta nada pra quem já está posicionado (só ruído).
    const destinos = c.info.idadeCandles === null ? destinosBase.filter((ch) => !posDe(ch, inst).some((p) => p.lado === c.lado)) : destinosBase;
    if (!destinos.length) continue;
    const tipoTxt = c.tipo === "oportunidade" ? "🚀 <b>OPORTUNIDADE</b> (continuação)" : "🔄 <b>REVERSÃO</b> (moeda esticada)";
    const ladoTxt = c.lado === "long" ? "LONG (compra)" : "SHORT (venda)";
    const infoAtr = (c.info as InfoFiltravel).atr;
    const ckVela = Math.floor(Date.now() / (TF_MIN * 60000));
    if (_confBarrada.get(inst + c.lado) === ckVela) continue;
    if (_finalPend.has(finalKey(inst, c.lado, ckVela))) { console.log(`⏱ ${inst} ${c.lado}: já coberto pelo alerta dos minutos finais desta vela`); continue; }
    const vivo = await getVivo(inst);
    if (TRAVA_PRECO_ON && vivo !== null) {
      // Trava de preço ao vivo: o sinal foi calculado no fechamento da vela; se o preço de agora já contradiz, não alerta.
      // Não marca nada como "enviado" nem trava a vela: se o preço voltar ao lado certo, o alerta sai normalmente (sem spam, sem perder).
      const ladoOposto = c.lado === "short" ? vivo > c.info.topo : vivo < c.info.fundo;
      const voltouPraDentro = c.info.idadeCandles !== null && (c.lado === "long" ? vivo <= c.info.topo : vivo >= c.info.fundo);
      if (ladoOposto || voltouPraDentro) {
        console.log(`🔒 ${inst} ${c.lado} barrado pela trava: preço agora ${fmtPrice(vivo)} ${ladoOposto ? "já está do lado oposto" : "voltou pra dentro do canal"} (topo ${fmtPrice(c.info.topo)} | fundo ${fmtPrice(c.info.fundo)})`);
        continue;
      }
    }
    const confRes = await calcConfiancaAlerta(c, poolMap.get(inst)?.volUsdt ?? null, perfilAlerta);
    const minConf = c.tipo === "reversao" ? (c.lado === "long" ? CONF_MIN_FUNDO_LONG : CONF_MIN_REVERSAO) : CONF_MIN_OPORT;
    if (minConf > 0 && confRes && confRes.conf < minConf) {
      _confBarrada.set(inst + c.lado, ckVela);
      confBarrados++;
      console.log(`🧭 ${inst} ${c.lado} (${c.tipo}) barrado: confiança ${confRes.conf}/10 < ${minConf}`);
      continue;
    }
    if (BTC_BLOQ_REV_PCT > 0 && c.tipo === "reversao" && c.lado === "short" && confRes?.btcVar != null && confRes.btcVar >= BTC_BLOQ_REV_PCT) {
      _confBarrada.set(inst + c.lado, ckVela);
      console.log(`₿ ${inst} SHORT de reversão barrado: BTC +${confRes.btcVar.toFixed(1)}% na última hora (limite ${BTC_BLOQ_REV_PCT}%)`);
      continue;
    }
    const msg =
    `🔔 <b>${c.info.instId}</b> — ${c.status}${c.fresco ? " 🆕" : ""}\n${DIVISOR}\n\n` +
    `${tipoTxt}\n` +
    `${c.pct >= 0 ? "📈 subiu +" : "📉 caiu "}${c.pct.toFixed(2)}% em 24h\n` +
    `Robô abriria: <b>${ladoTxt}</b>\n` +
    (typeof infoAtr === "number" ? stopAlvoTxt(c.lado, vivo ?? c.info.preco, c.info.topo, c.info.fundo, infoAtr, vivo !== null) : "") +
    `${idadeTxt(c.info.idadeCandles)}\n` +
    (c.aprox ? (c.ligue
      ? `🚨 <b>LIGUE O ROBÔ AGORA</b> — ${c.ligue.alem ? `o preço já está ${c.lado === "long" ? "acima" : "abaixo"} da linha; a vela fecha em ~${c.ligue.restMin} min (o robô entra no fechamento)` : `chega na linha em ~${Math.max(1, Math.round(c.aprox.etaCandles * TF_MIN))} min, dá tempo de ligar`}\n`
      : `🕒 <b>PREPARE</b> — ainda não ligue: aviso antecipado, vou avisar de novo (🚨 LIGUE AGORA) quando estiver perto\n`) : "") +
    (c.aprox ? `🎯 Aproximando: deve chegar na linha em ~${Math.max(1, Math.round(c.aprox.etaCandles * TF_MIN))} min (estimativa, ${c.aprox.vel.toFixed(2)}% por vela) — dá tempo de preparar o robô (se recuar sem cruzar, eu aviso pra desligar)\n` : "") +
    `${indicadorTxt(c.info)}\n` +
    (vivo !== null ? `preço agora ${fmtPrice(vivo)} (fech. 15m ${fmtPrice(c.info.preco)})` : `preço ${fmtPrice(c.info.preco)}`) + ` | topo ${fmtPrice(c.info.topo)} | fundo ${fmtPrice(c.info.fundo)}`;
    const foTxt = confRes?.fo ? fundingOiTxt(confRes.fo) : "";
    const linhaFo = confRes ? (foTxt ? `\n💸 ${foTxt}` : "") : await linhaFundingOI(inst);
    const prio = !!c.aprox && chegadaEmJanelaForte(c.aprox, perfilAlerta);
    const linhaConf = "\n" + (prio ? "⚡ <b>PRIORIDADE</b> — chegada prevista dentro de janela forte de movimento\n" : "") + (confRes ? confLinha(confRes) : "");
    await Promise.all(destinos.map(async (ch) => enviarAlertaMoeda(SB, ch, inst, cortar(msg + linhaConf + linhaFo + avisoLimiteLado(posMap.get(ch) ?? null, c.lado) + (await blocoPosicao(posDe(ch, inst), c.info, c.lado))), botaoAnalisar(inst))));
    await registrarAlerta(SB, c, confRes?.conf ?? null);
    if (c.aprox && c.info.idadeCandles === null) await registrarAntecipacao(SB, c, destinos.filter((ch) => !silChat(ch)));
    enviados++;
    const registro = {
      last_status: c.status + (c.fresco ? " 🆕" : "") + (contraPos ? " 🛡️" : ""),
      last_alert_at: new Date().toISOString(),
      watch_until: new Date(Date.now() + WATCH_HORAS * 3600 * 1000).toISOString(),
      watch_side: c.lado,
      watch_notificado: false,
    };
    if (row) await SB.from("alertas_indicador").update(registro).eq("instid", c.info.instId);
    else await SB.from("alertas_indicador").insert({ instid: c.info.instId, ...registro });
  }
  console.log(`🏁 alerta proativo em ${((Date.now() - inicio) / 1000).toFixed(1)}s - ${setups.length} setups, ${enviados} alertas enviados, ${confBarrados} barrados por confiança`);
  await heartbeat(SB, `${((Date.now() - inicio) / 1000).toFixed(1)}s | setups ${setups.length} | enviados ${enviados}`);
  await avisarFonteDados(SB).catch((e) => console.log("⚠️ erro avisarFonteDados", e));
  if (FUNDO_ON) await radarFundo(SB, pool, indicadores, posMap).catch((e) => console.log("❌ erro radar de fundo", e));
  const poolInfoMap = new Map<string, IndicadorInfo>();
  indicadores.forEach((info, i) => { if (info) poolInfoMap.set(pool[i].instId, info); });
  await checarListaAcompanhamento(SB, poolInfoMap, posMap);
  await checarAntecipacoes(SB, poolInfoMap).catch((e) => console.log("❌ erro antecipações", e));
  const lastMap = new Map(variacoes.map((v) => [v.instId, v.last] as [string, number]));
  await checarAlertaFinal(SB, pool, indicadores, lastMap, posMap, perfilAlerta).catch((e) => console.log("❌ erro alerta final", e));
  await salvarEstado(SB);
  if (todosSil) { try { await conferirPlacar(SB); } catch (e) { console.log("❌ erro placar", e); } return; }
  await extrasV13(SB, poolInfoMap, posMap);
}
const X_TZ_OFFSET_H = Number(Deno.env.get("TZ_OFFSET_H") || "-3");
const X_JANELA_FORTE = 1.15;
const X_JANELA_FRACA = 0.85;
const X_ADX_FORTE = 25;
const X_ADX_FRACO = 18;
const X_MOEDAS_MERCADO = ["BTC-USDT", "ETH-USDT", "SOL-USDT"];
type XVelas = { t: number[]; o: number[]; h: number[]; l: number[]; c: number[]; v: number[] };
function xMediana(a: number[]) {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
async function xCandles(instId: string, bar: string, limit: number): Promise<XVelas | null> {
  const monta = (rows: any[]): XVelas => ({
    t: rows.map((r) => parseInt(r[0])),
    o: rows.map((r) => parseFloat(r[1])),
    h: rows.map((r) => parseFloat(r[2])),
    l: rows.map((r) => parseFloat(r[3])),
    c: rows.map((r) => parseFloat(r[4])),
    v: rows.map((r) => parseFloat(r[5])),
  });
  const fechada = (d: XVelas) => xFechadas(d, barToMs(bar));
  for (let t = 0; t < 2; t++) {
    try {
      const r = await fetch(`https://openapi.blofin.com/api/v1/market/candles?instId=${instId}&bar=${bar}&limit=${limit}`, { headers: { "User-Agent": "Mozilla/5.0" } });
      const j = await J(r);
      if (j.code == "html_block" && t === 0) { await new Promise((res) => setTimeout(res, 500 + Math.random() * 700)); continue; }
      if (j.code == "0" && j.data?.length > 100) { marcaFonte("BloFin"); return fechada(monta(j.data.slice().reverse())); }
      break;
    } catch { break; }
  }
  try {
    const iv = bar === "1H" ? "60" : bar.replace("m", "");
    const r = await fetch(`https://api.bybit.com/v5/market/kline?category=linear&symbol=${instId.replace("-", "")}&interval=${iv}&limit=${bar === "1H" ? 1000 : limit}`);
    const j = await r.json();
    if (j.result?.list?.length > 100) { marcaFonte("Bybit"); return fechada(monta(j.result.list.slice().reverse())); }
  } catch { }
  try {
    const r = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${instId.replace("-", "")}&interval=${bar === "1H" ? "1h" : bar}&limit=${bar === "1H" ? 1000 : limit}`);
    const j = await r.json();
    if (Array.isArray(j) && j.length > 100) { marcaFonte("Binance"); return fechada(monta(j)); }
  } catch { }
  marcaFonte("FALHA");
  return null;
}
function xFechadas(d: XVelas, periodoMs: number): XVelas {
  const ab = Math.floor(Date.now() / periodoMs) * periodoMs;
  let n = d.t.length;
  while (n > 0 && d.t[n - 1] >= ab) n--;
  return { t: d.t.slice(0, n), o: d.o.slice(0, n), h: d.h.slice(0, n), l: d.l.slice(0, n), c: d.c.slice(0, n), v: d.v.slice(0, n) };
}
function xAdxSerie(h: number[], l: number[], c: number[], p = 14): number[] {
  const n = c.length;
  if (n < p * 3) return [];
  const tr: number[] = [0], pdm: number[] = [0], mdm: number[] = [0];
  for (let i = 1; i < n; i++) {
    const up = h[i] - h[i - 1], dn = l[i - 1] - l[i];
    pdm.push(up > dn && up > 0 ? up : 0);
    mdm.push(dn > up && dn > 0 ? dn : 0);
    tr.push(Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])));
  }
  const suav = (a: number[]) => {
    const o: number[] = [];
    let s = a.slice(1, p + 1).reduce((x, y) => x + y, 0);
    o[p] = s;
    for (let i = p + 1; i < a.length; i++) { s = s - s / p + a[i]; o[i] = s; }
    return o;
  };
  const T = suav(tr), P = suav(pdm), M = suav(mdm);
  const dx: number[] = [];
  for (let i = p; i < n; i++) {
    const pi = T[i] ? (P[i] / T[i]) * 100 : 0;
    const mi = T[i] ? (M[i] / T[i]) * 100 : 0;
    const d = pi + mi;
    dx.push(d ? (Math.abs(pi - mi) / d) * 100 : 0);
  }
  if (dx.length < p) return [];
  const out: number[] = [];
  let a = dx.slice(0, p).reduce((x, y) => x + y, 0) / p;
  out.push(a);
  for (let i = p; i < dx.length; i++) { a = (a * (p - 1) + dx[i]) / p; out.push(a); }
  return out;
}
function xDistancia(preco: number, topo: number, fundo: number) {
  if (preco > topo) return { distAbs: ((preco - topo) / topo) * 100, regiao: "acima, já cruzou" };
  if (preco < fundo) return { distAbs: ((fundo - preco) / fundo) * 100, regiao: "abaixo, já cruzou" };
  const dT = ((topo - preco) / preco) * 100, dF = ((preco - fundo) / preco) * 100;
  return dT <= dF ? { distAbs: dT, regiao: "dentro, perto do topo" } : { distAbs: dF, regiao: "dentro, perto do fundo" };
}
function xDur(min: number) {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
}
const xHH = (h: number) => `${String(h).padStart(2, "0")}h`;
type XPerfil = { idx: number[]; dias: number; tipo: string; geradoEm: number };
function xPerfilDeSeries(series: XVelas[], agora: number): XPerfil | null {
  const tzMs = X_TZ_OFFSET_H * 3600000;
  const fimSemanaHoje = [0, 6].includes(new Date(agora + tzMs).getUTCDay());
  const inicioHoraAtual = Math.floor(agora / 3600000) * 3600000;
  const indices: number[][] = [];
  let diasMin = Infinity;
  for (const d of series) {
    const buckets: number[][] = Array.from({ length: 24 }, () => []);
    for (let i = 0; i < d.t.length; i++) {
      if (d.t[i] >= inicioHoraAtual) continue;
      const loc = new Date(d.t[i] + tzMs);
      if ([0, 6].includes(loc.getUTCDay()) !== fimSemanaHoje) continue;
      const rng = ((d.h[i] - d.l[i]) / d.o[i]) * 100;
      if (isFinite(rng) && rng >= 0) buckets[loc.getUTCHours()].push(rng);
    }
    const med = buckets.map(xMediana);
    const base = xMediana(med.filter((v) => v > 0));
    if (!(base > 0)) continue;
    indices.push(med.map((v) => v / base));
    diasMin = Math.min(diasMin, ...buckets.map((b) => b.length));
  }
  if (!indices.length) return null;
  const idx = Array.from({ length: 24 }, (_, h) => indices.reduce((s, a) => s + a[h], 0) / indices.length);
  return { idx, dias: diasMin === Infinity ? 0 : diasMin, tipo: fimSemanaHoje ? "fim de semana" : "dia útil", geradoEm: agora };
}
let _xPerfil: XPerfil | null = null;
async function xPerfilHoras(): Promise<XPerfil | null> {
  const agora = Date.now();
  const tipoHoje = [0, 6].includes(new Date(agora + X_TZ_OFFSET_H * 3600000).getUTCDay()) ? "fim de semana" : "dia útil";
  if (_xPerfil && _xPerfil.tipo === tipoHoje && agora - _xPerfil.geradoEm < 60 * 60000) return _xPerfil;
  const series = (await Promise.all(X_MOEDAS_MERCADO.map((m) => xCandles(m, "1H", 500)))).filter((x): x is XVelas => x !== null);
  const p = xPerfilDeSeries(series, agora);
  if (p) _xPerfil = p;
  return p;
}
function xInfoJanela(p: XPerfil, agora: number) {
  const loc = new Date(agora + X_TZ_OFFSET_H * 3600000);
  const h = loc.getUTCHours(), min = loc.getUTCMinutes();
  const idxAgora = p.idx[h];
  let fimAtual: number | null = null;
  if (idxAgora >= X_JANELA_FORTE) {
    for (let k = 1; k <= 24; k++) { const hh = (h + k) % 24; if (p.idx[hh] < X_JANELA_FORTE) { fimAtual = hh; break; } }
  }
  let proxima: { h: number; emMin: number } | null = null;
  for (let k = 1; k <= 24; k++) {
    const hh = (h + k) % 24;
    if (p.idx[hh] >= X_JANELA_FORTE && p.idx[(hh + 23) % 24] < X_JANELA_FORTE) { proxima = { h: hh, emMin: k * 60 - min }; break; }
  }
  return { h, min, idxAgora, fimAtual, proxima };
}
function xTxtJanela(p: XPerfil | null) {
  if (!p) return "sem dados de horário agora";
  const j = xInfoJanela(p, Date.now());
  const nome = j.idxAgora >= X_JANELA_FORTE ? "janela FORTE" : j.idxAgora <= X_JANELA_FRACA ? "janela fraca" : "janela normal";
  return `${nome} (${j.idxAgora.toFixed(2)}× o movimento médio)`;
}
function chegadaEmJanelaForte(ap: Aprox | null | undefined, perfil: XPerfil | null): boolean {
  if (!ap || !perfil) return false;
  const chegada = Date.now() + ap.etaCandles * TF_MIN * 60000;
  const h = new Date(chegada + X_TZ_OFFSET_H * 3600000).getUTCHours();
  return perfil.idx[h] >= X_JANELA_FORTE;
}
type XRegime = { instId: string; adx: number; adxAntes: number; preco: number; distAbs: number; regiao: string };
let _btcReg: { t: number; v: XRegime | null } | null = null;
async function xRegimeCache(): Promise<XRegime | null> {
  if (_btcReg && Date.now() - _btcReg.t < 4 * 60000) return _btcReg.v;
  const v = await xRegime("BTC-USDT").catch(() => null);
  _btcReg = { t: Date.now(), v };
  return v;
}
async function xRegime(instId: string): Promise<XRegime | null> {
  const bruto = await xCandles(instId, TIMEFRAME, 500);
  if (!bruto) return null;
  const d = xFechadas(bruto, TF_MIN * 60000);
  if (d.c.length < 100) return null;
  const L = superV2(d.c, PESO_SUPREMA);
  const i = d.c.length - 1;
  const topo = Math.max(L[i].suprema, L[i].j6), fundo = Math.min(L[i].suprema, L[i].j6);
  const adx = xAdxSerie(d.h, d.l, d.c, 14);
  if (adx.length < 6) return null;
  const dist = xDistancia(d.c[i], topo, fundo);
  return { instId, adx: adx[adx.length - 1], adxAntes: adx[adx.length - 5], preco: d.c[i], distAbs: dist.distAbs, regiao: dist.regiao };
}
async function runLista(chatId: number | string) {
  const SB = getSupabase();
  if (!SB) { await sendTelegram(chatId, "⚠️ Supabase não configurado (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)."); return; }
  const { data, error } = await SB.from("alertas_indicador").select("*")
  .not("watch_until", "is", null).gt("watch_until", new Date().toISOString()).eq("watch_notificado", false);
  if (error) { await sendTelegram(chatId, `⚠️ Não consegui ler a lista de acompanhamento: ${String(error.message || error).replace(/</g, "&lt;")}`); return; }
  const rows = (data || []) as any[];
  if (rows.length === 0) {
    await sendTelegram(chatId, `📋 <b>LISTA DE ACOMPANHAMENTO</b>\n\nNenhuma moeda em acompanhamento agora. Cada alerta enviado coloca a moeda na lista por ${WATCH_HORAS}h.`);
    return;
  }
  const [infos, variacoes, perfil] = await Promise.all([
    emLotes(rows.map((r) => r.instid as string), 20, calcIndicador500),
    getVariacoes24h().catch(() => [] as { instId: string; pct: number; last: number; volUsdt: number }[]),
    xPerfilHoras().catch(() => null),
  ]);
  const pctMap = new Map(variacoes.map((v) => [v.instId, v.pct] as [string, number]));
  const agora = Date.now();
  const itens = rows.map((r, i) => {
    const info = infos[i];
    const atual = info ? ladoAtual(info) : null;
    return { r, info, contra: atual !== null && atual !== r.watch_side };
  }).sort((a, b) => Number(b.contra) - Number(a.contra) || (a.info ? a.info.distAbs : 999) - (b.info ? b.info.distAbs : 999));
  const cab = `📋 <b>LISTA DE ACOMPANHAMENTO</b> — ${rows.length} moeda(s), janela de ${WATCH_HORAS}h\n⏰ Agora: ${xTxtJanela(perfil)}\n${DIVISOR}\n<i>quem já cruzou contra vem primeiro, depois as mais perto da linha</i>\n\n`;
  const blocos = itens.map(({ r, info, contra }, i) => {
    const horasDesde = r.last_alert_at ? ((agora - new Date(r.last_alert_at).getTime()) / 3600000).toFixed(1) : "?";
    const faltamH = (new Date(r.watch_until).getTime() - agora) / 3600000;
    const falta = faltamH >= 1 ? `${Math.round(faltamH)}h` : `${Math.max(0, Math.round(faltamH * 60))}min`;
    const pct = pctMap.get(r.instid);
    let b = `<b>${i + 1}. ${r.instid}</b> — alerta ${r.watch_side === "long" ? "LONG" : "SHORT"} há ${horasDesde}h (faltam ${falta})\n`;
    if (pct !== undefined) b += `${pct >= 0 ? "📈 +" : "📉 "}${pct.toFixed(2)}% (24h)\n`;
    if (!info) return b + `Indicador: sem dado agora\n\n`;
    if (contra) b += `🔁 JÁ CRUZOU CONTRA o alerta — o aviso 🔁 sai na próxima varredura\n`;
    b += `${idadeTxt(info.idadeCandles)}\n${indicadorTxt(info)}\npreço ${fmtPrice(info.preco)} | topo ${fmtPrice(info.topo)} | fundo ${fmtPrice(info.fundo)}\n\n`;
    return b;
  });
  let parte = cab;
  for (const b of blocos) {
    if (parte.length + b.length > 3800) { await sendTelegram(chatId, parte); parte = ""; }
    parte += b;
  }
  if (parte.trim()) await sendTelegram(chatId, parte);
}
const PLACAR_TABELA = "alertas_log";
const PLACAR_HORIZONTES = [1, 4, 24];
const PLACAR_MAX_CONFERE = 60;
const ANALISE_TARDE_CANDLES = 8;
const ANALISE_MUITO_TARDE_CANDLES = 16;
const ANALISE_VERDE = 5;
const ANALISE_AMARELO = 2;
type VarInfo = { instId: string; pct: number; last: number; volUsdt: number };
let _logTemConf = true;
async function inserirLogAlerta(SB: any, linha: Record<string, unknown>, conf: number | null) {
  if (_logTemConf && conf !== null) {
    const { error } = await SB.from(PLACAR_TABELA).insert({ ...linha, conf });
    if (!error) return;
    if (/conf/i.test(String(error.message || ""))) {
      _logTemConf = false;
      console.log("⚠️ alertas_log sem a coluna conf: rode o ALTER TABLE do arquivo setup-supabase.sql pra medir acerto por confianca");
    } else { console.log("⚠️ registrarAlerta:", error.message); return; }
  }
  const { error } = await SB.from(PLACAR_TABELA).insert(linha);
  if (error) console.log("⚠️ registrarAlerta:", error.message);
}
async function registrarAlerta(SB: any, c: Setup, conf: number | null = null) {
  try {
    const f = c.info as Partial<InfoFiltravel>;
    await inserirLogAlerta(SB, {
      instid: c.info.instId, lado: c.lado, tipo: c.tipo, status: c.status, fresco: c.fresco,
      idade_candles: c.info.idadeCandles, pct24: c.pct, preco: c.info.preco,
      adx: f.adx ?? null, rsi: f.rsi ?? null,
    }, conf);
  } catch (e) { console.log("⚠️ registrarAlerta erro", e); }
}
const TAXA_TAKER_PCT = Number(Deno.env.get("TAXA_TAKER_PCT") || "0.06");
const TAXA_IDA_VOLTA_PCT = Number(Deno.env.get("TAXA_IDA_VOLTA_PCT") || String(TAXA_TAKER_PCT * 2));
function retornoLog(r: any, h: number): number | null {
  const p = r[`preco_${h}h`], p0 = r.preco;
  if (p == null || p0 == null || Number(p0) <= 0) return null;
  const bruto = ((Number(p) - Number(p0)) / Number(p0)) * 100;
  return (r.lado === "long" ? bruto : -bruto) - TAXA_IDA_VOLTA_PCT;
}
const PLACAR_ENTRADA_ON = (Deno.env.get("PLACAR_ENTRADA") || "1") !== "0";
const ehFinalLog = (r: any) => String(r?.status || "").includes("VAI FECHAR");
const ENTRADA_MAX_CANDLES = Number(Deno.env.get("ENTRADA_MAX_CANDLES") || "8");
let _placarTemEntrada = true;
type EntradaRes = { st: "pendente" } | { st: "nao_entrou" | "contra" } | { st: "entrou"; preco: number; emMs: number };
function achaEntrada(d: XVelas, jd: { suprema: number; j6: number }[], r: any): EntradaRes {
  const TFMS = TF_MIN * 60000;
  const t0 = new Date(r.criado_em).getTime();
  const lado: "long" | "short" = r.lado === "long" ? "long" : "short";
  let kA = -1;
  for (let i = d.t.length - 1; i >= 0; i--) { if (d.t[i] + TFMS <= t0) { kA = i; break; } }
  if (kA < 0) return { st: "pendente" };
  const alem = (k: number, l: "long" | "short") =>
    l === "long" ? d.c[k] > Math.max(jd[k].suprema, jd[k].j6) : d.c[k] < Math.min(jd[k].suprema, jd[k].j6);
  if (r.idade_candles != null) {
    const kC = kA - Number(r.idade_candles);
    if (kC >= 0 && alem(kC, lado)) return { st: "entrou", preco: d.c[kC], emMs: d.t[kC] + TFMS };
    return { st: "entrou", preco: d.c[kA], emMs: d.t[kA] + TFMS };
  }
  const kUlt = d.t.length - 1;
  // alerta dos minutos finais vale só pra vela seguinte (a que estava fechando); os demais valem até ENTRADA_MAX_CANDLES
  const maxC = ehFinalLog(r) ? 1 : ENTRADA_MAX_CANDLES;
  const kFim = Math.min(kUlt, kA + maxC);
  for (let k = kA + 1; k <= kFim; k++) {
    if (alem(k, lado)) return { st: "entrou", preco: d.c[k], emMs: d.t[k] + TFMS };
    if (alem(k, lado === "long" ? "short" : "long")) return { st: "contra" };
  }
  return kUlt >= kA + maxC ? { st: "nao_entrou" } : { st: "pendente" };
}
async function conferirPlacar(SB: any) {
  const agora = Date.now();
  const desde = new Date(agora - (PLACAR_ENTRADA_ON ? 30 : 26) * 3600000).toISOString();
  let res: any = null;
  if (PLACAR_ENTRADA_ON && _placarTemEntrada) {
    res = await SB.from(PLACAR_TABELA).select("*")
      .is("preco_24h", null).gt("criado_em", desde).or("ent_status.is.null,ent_status.eq.entrou")
      .order("criado_em", { ascending: true }).limit(PLACAR_MAX_CONFERE);
    if (res.error && /ent_status/i.test(String(res.error.message || ""))) {
      _placarTemEntrada = false;
      console.log("⚠️ alertas_log sem as colunas de entrada: rode o ALTER TABLE V30 do arquivo setup-supabase.sql (placar segue pelo preço do aviso)");
      res = null;
    }
  }
  if (!res) {
    res = await SB.from(PLACAR_TABELA).select("*")
      .is("preco_24h", null).gt("criado_em", desde).order("criado_em", { ascending: true }).limit(PLACAR_MAX_CONFERE);
  }
  const { data, error } = res;
  if (error) { console.log("⚠️ conferirPlacar:", error.message); return; }
  const modoEntrada = PLACAR_ENTRADA_ON && _placarTemEntrada;
  const t0De = (r: any) => (modoEntrada && r.ent_status === "entrou" && r.ent_em) ? new Date(r.ent_em).getTime() : new Date(r.criado_em).getTime();
  const pend = ((data || []) as any[]).filter((r) =>
    (modoEntrada && r.ent_status == null) ||
    PLACAR_HORIZONTES.some((h) => r[`preco_${h}h`] == null && agora >= t0De(r) + h * 3600000));
  if (pend.length === 0) return;
  const porMoeda = new Map<string, any[]>();
  pend.forEach((r) => { const a = porMoeda.get(r.instid) || []; a.push(r); porMoeda.set(r.instid, a); });
  let atualizados = 0;
  await emLotes([...porMoeda.keys()], 5, async (id) => {
    const d = await xCandles(id, TIMEFRAME, CANDLES_LIMIT_PRECISO);
    if (!d) return;
    const jd = modoEntrada ? superV2(d.c, PESO_SUPREMA) : null;
    for (const r of porMoeda.get(id) || []) {
      let t0 = t0De(r);
      let p0 = Number(r.preco);
      const upd: Record<string, any> = {};
      if (modoEntrada && r.ent_status == null) {
        const e = achaEntrada(d, jd!, r);
        if (e.st === "pendente") continue;
        if (e.st !== "entrou") {
          const { error: e3 } = await SB.from(PLACAR_TABELA).update({ ent_status: e.st }).eq("id", r.id);
          if (e3) console.log("⚠️ update entrada:", e3.message); else atualizados++;
          continue;
        }
        upd.ent_status = "entrou"; upd.ent_em = new Date(e.emMs).toISOString(); upd.preco_alerta = r.preco; upd.preco = e.preco;
        t0 = e.emMs; p0 = e.preco;
      }
      let maiorTH = 0;
      for (const h of PLACAR_HORIZONTES) {
        if (r[`preco_${h}h`] != null || agora < t0 + h * 3600000) continue;
        const tH = t0 + h * 3600000;
        let k = -1;
        for (let i = d.t.length - 1; i >= 0; i--) { if (d.t[i] + TF_MIN * 60000 <= tH) { k = i; break; } }
        if (k < 0) continue;
        upd[`preco_${h}h`] = d.c[k];
        maiorTH = Math.max(maiorTH, tH);
      }
      if (maiorTH === 0 && Object.keys(upd).length === 0) continue;
      if (maiorTH > 0) {
        let mx = -Infinity, mn = Infinity;
        for (let i = 0; i < d.t.length; i++) {
          if (d.t[i] + TF_MIN * 60000 > t0 && d.t[i] < maiorTH) { mx = Math.max(mx, d.h[i]); mn = Math.min(mn, d.l[i]); }
        }
        if (isFinite(mx) && isFinite(mn) && p0 > 0) {
          const up = ((mx - p0) / p0) * 100, dn = ((p0 - mn) / p0) * 100;
          upd["mfe_pct"] = Math.max(0, r.lado === "long" ? up : dn);
          upd["mae_pct"] = Math.max(0, r.lado === "long" ? dn : up);
        }
      }
      const { error: e2 } = await SB.from(PLACAR_TABELA).update(upd).eq("id", r.id);
      if (e2) console.log("⚠️ update placar:", e2.message); else atualizados++;
    }
  });
  console.log(`📊 placar: ${pend.length} alerta(s) pendentes, ${atualizados} atualizados${modoEntrada ? " (entrada = fechamento da vela do cruzamento)" : ""}`);
}
function linhaStats(rows: any[]): string {
  const partes = PLACAR_HORIZONTES.map((h) => {
    const rs = rows.map((r) => retornoLog(r, h)).filter((x): x is number => x !== null);
    if (!rs.length) return `${h}h: —`;
    const ac = rs.filter((x) => x > 0).length;
    const med = rs.reduce((s, x) => s + x, 0) / rs.length;
    return `${h}h: ${Math.round((ac / rs.length) * 100)}% (${ac}/${rs.length}) ${med >= 0 ? "+" : ""}${med.toFixed(2)}%`;
  });
  return partes.join(" · ");
}
async function runPlacar(chatId: number | string, dias: number) {
  const SB = getSupabase();
  if (!SB) { await sendTelegram(chatId, "⚠️ Supabase não configurado."); return; }
  const desde = new Date(Date.now() - dias * 86400000).toISOString();
  const { data, error } = await SB.from(PLACAR_TABELA).select("*").gt("criado_em", desde).order("criado_em", { ascending: false }).limit(2000);
  if (error) { await sendTelegram(chatId, `⚠️ Não consegui ler o placar (a tabela ${PLACAR_TABELA} existe?): ${String(error.message || error).replace(/</g, "&lt;")}`); return; }
  const todas = (data || []) as any[];
  const rows = todas.filter((r) => !ehFinalLog(r));
  const finais = todas.filter(ehFinalLog);
  if (todas.length === 0) { await sendTelegram(chatId, `📊 <b>PLACAR</b>\n\nNenhum alerta registrado nos últimos ${dias} dia(s). Os alertas passam a ser registrados a partir de agora.`); return; }
  const comResultado = rows.filter((r) => r.preco_1h != null).length;
  const grupos: [string, (r: any) => boolean][] = [
    ["🚀 Oportunidade", (r) => r.tipo === "oportunidade"],
    ["🔄 Reversão", (r) => r.tipo === "reversao"],
    ["🟢 Fundo (radar)", (r) => r.tipo === "fundo"],
    ["🧭 Confiança 8–10", (r) => r.conf != null && Number(r.conf) >= 8],
    ["🧭 Confiança 6–7", (r) => r.conf != null && Number(r.conf) >= 6 && Number(r.conf) <= 7],
    ["🧭 Confiança ≤ 5", (r) => r.conf != null && Number(r.conf) <= 5],
    ["🆕 Cruzou agora", (r) => r.fresco === true],
    ["⌛ Não fresco", (r) => r.fresco !== true],
    ["🔥 Muito perto", (r) => String(r.status || "").includes("MUITO PERTO")],
    ["🎯 Chegando (antecipado)", (r) => String(r.status || "").includes("CHEGANDO")],
    ["🟡 Perto", (r) => String(r.status || "").includes("PERTO") && !String(r.status || "").includes("MUITO PERTO")],
    ["💪 ADX ≥ 25", (r) => r.adx != null && Number(r.adx) >= 25],
    ["😐 ADX &lt; 25", (r) => r.adx != null && Number(r.adx) < 25],
    ["🟢 LONG", (r) => r.lado === "long"],
    ["🔴 SHORT", (r) => r.lado === "short"],
  ];
  let msg = `📊 <b>PLACAR DOS ALERTAS</b> — últimos ${dias} dia(s)\n${DIVISOR}\n${rows.length} alerta(s), ${comResultado} já conferidos\n<i>acerto = preço andou a favor do lado que o robô abriria, contado desde o FECHAMENTO da vela que cruzou a linha (entrada do robô); % = retorno médio já descontada a taxa (${TAXA_IDA_VOLTA_PCT.toFixed(2)}% ida e volta)</i>\n\n`;
  msg += `<b>Geral</b>\n${linhaStats(rows)}\n\n`;
  for (const [nome, fn] of grupos) {
    const g = rows.filter(fn);
    if (g.length === 0) continue;
    msg += `<b>${nome}</b> (n=${g.length})\n${linhaStats(g)}\n\n`;
  }
  const resolvidos = rows.filter((r) => r.ent_status != null);
  if (resolvidos.length) {
    const nao = resolvidos.filter((r) => r.ent_status === "nao_entrou").length;
    const contraN = resolvidos.filter((r) => r.ent_status === "contra").length;
    msg += `🚫 <b>Não viraram entrada</b>: ${nao + contraN} de ${resolvidos.length} avisos (${nao} não cruzaram · ${contraN} cruzaram pro lado oposto)\n<i>é o alarme falso: aviso em que o robô não entraria naquele lado</i>\n\n`;
  }
  const mf = rows.filter((r) => r.mfe_pct != null && r.mae_pct != null);
  if (mf.length) {
    const mfe = mf.reduce((s, r) => s + Number(r.mfe_pct), 0) / mf.length;
    const mae = mf.reduce((s, r) => s + Number(r.mae_pct), 0) / mf.length;
    msg += `↕️ Andou a favor no máximo <b>${mfe.toFixed(2)}%</b> e contra no máximo <b>${mae.toFixed(2)}%</b> (média, n=${mf.length})\n\n`;
  }
  if (finais.length) msg += montarPlacarFinal(finais);
  msg += await montarCalibracao(SB, dias).catch(() => "");
  if (comResultado < 30) msg += `⚠️ <i>Amostra pequena (${comResultado} conferidos): ainda não tire conclusões.</i>\n`;
  msg += `<i>Já desconta a taxa da BloFin; não considera funding, stop nem o tamanho da posição. Uso: /placar 30 (30 dias)</i>`;
  await sendTelegram(chatId, cortar(msg));
}
async function resolverPar(entrada: string): Promise<string | null> {
  let s = entrada.toUpperCase().replace(/[^A-Z0-9-]/g, "");
  if (!s) return null;
  if (!s.includes("-") && s.endsWith("USDT") && s.length > 4) s = s.slice(0, -4) + "-USDT";
  if (!s.includes("-")) s += "-USDT";
  const pares = await getFuturesPairs();
  if (pares.includes(s)) return s;
  const base = s.split("-")[0];
  if (pares.includes(`1000${base}-USDT`)) return `1000${base}-USDT`;
  return null;
}
async function runAnalise(chatId: number | string, entrada: string) {
  const instId = await resolverPar(entrada);
  if (!instId) { await sendTelegram(chatId, `⚠️ Não achei a moeda "${entrada.replace(/[<>&]/g, "").slice(0, 20)}" na lista de futuros. Exemplo: /analise ONE`); return; }
  const [d15, d1h, vars, perfil, btc, fo, vivo, btcV] = await Promise.all([
    xCandles(instId, TIMEFRAME, CANDLES_LIMIT_PRECISO),
    xCandles(instId, "1H", 500),
    getVariacoes24h().catch(() => [] as VarInfo[]),
    xPerfilHoras().catch(() => null),
    xRegime("BTC-USDT").catch(() => null),
    getFundingOI(instId),
    precoAoVivo(instId),
    btcVar1h().catch(() => null),
  ]);
  if (!d15 || d15.c.length < 100) { await sendTelegram(chatId, `⚠️ Sem dados de velas para ${instId} agora.`); return; }
  const info = calcIndicadorDeCloses(instId, d15.c);
  if (!info) { await sendTelegram(chatId, `⚠️ Não consegui calcular o indicador de ${instId}.`); return; }
  const adxS = xAdxSerie(d15.h, d15.l, d15.c, 14);
  const adx = adxS.length ? adxS[adxS.length - 1] : 0;
  const adxAntes = adxS.length > 5 ? adxS[adxS.length - 5] : adx;
  const adxDif = adx - adxAntes;
  const rsi = calcRSI(d15.c, 14);
  const v = (vars as VarInfo[]).find((x) => x.instId === instId);
  const pct = v ? v.pct : null;
  const volUsdt = v ? v.volUsdt : null;
  const apChega = chegandoNaLinha(info);
  const lado: "long" | "short" = info.preco > info.topo ? "long" : info.preco < info.fundo ? "short" : apChega ? apChega.alvo : (info.regiao.includes("topo") ? "long" : "short");
  const setup = pct !== null ? classificar(info, pct) : null;
  const h1 = d1h ? calcIndicadorDeCloses(instId, d1h.c) : null;
  const lado1h = h1 ? ladoAtual(h1) : null;
  const trocas = contarTrocas(d15.c);
  const largura = ((info.topo - info.fundo) / info.preco) * 100;
  const volRatio = volAcel(d15.v);
  const chegadaForte = chegadaEmJanelaForte(apChega, perfil);
  const bottomA = FUNDO_ON ? calcFundoPre(d15, info, calcATR(d15.h, d15.l, d15.c, 14), adx, adxAntes) : null;
  const { motivos, total, veredito, conf } = pontuar({
    info, lado, adx, adxDif, rsi, volUsdt, trocas, h1, btcAdx: btc ? btc.adx : null, perfil, fo, volRatio, chegadaForte, apChega, tipo: setup?.tipo ?? null, pct24: pct, bottom: bottomA, btcVar: btcV,
  });
  let invalida: string;
  const nTopo = fmtPrice(info.topo), nFundo = fmtPrice(info.fundo);
  if (lado === "long") {
    invalida = info.preco > info.topo
      ? `fechar 15m de volta abaixo de ${nTopo} perde o cruzamento; abaixo de ${nFundo} inverte pra SHORT.`
      : `ainda não confirmou: precisa fechar acima de ${nTopo}; se cair abaixo de ${nFundo}, o lado inverte pra SHORT.`;
  } else {
    invalida = info.preco < info.fundo
      ? `fechar 15m de volta acima de ${nFundo} perde o cruzamento; acima de ${nTopo} inverte pra LONG.`
      : `ainda não confirmou: precisa fechar abaixo de ${nFundo}; se subir acima de ${nTopo}, o lado inverte pra LONG.`;
  }
  let msg = `🔎 <b>ANÁLISE — ${instId}</b>\n${DIVISOR}\n\n`;
  msg += `${veredito} (${total >= 0 ? "+" : ""}${total} pts) · confiança <b>${conf}/10</b> ${confEmoji(conf)}\nRobô abriria: <b>${lado === "long" ? "LONG (compra)" : "SHORT (venda)"}</b>\n${placarFiltros(motivos)}\n\n`;
  for (const m of motivos) msg += `${m.pts > 0 ? "✅" : m.pts < 0 ? "⚠️" : "➖"} ${m.txt}${m.pts !== 0 ? ` (${m.pts > 0 ? "+" : ""}${m.pts})` : ""}\n`;
  if (bottomA && pct !== null && pct <= -FUNDO_QUEDA_MIN && ladoAtual(info) !== "long") {
    const finA = await fundoFinal(bottomA, instId, fo);
    msg += `\n🟢 <b>Radar de fundo</b> (queda de ${Math.abs(pct).toFixed(1)}% em 24h)\n${fundoTxt(finA)}\n`;
  }
  msg += `\n📍 ${indicadorTxt(info)}\n${idadeTxt(info.idadeCandles)}\npreço ${vivo !== null ? `agora ${fmtPrice(vivo)} (fech. 15m ${fmtPrice(info.preco)})` : fmtPrice(info.preco)} | topo ${nTopo} | fundo ${nFundo}\n`;
  msg += `📏 faixa ${largura.toFixed(2)}% de largura${info.larguraRel !== undefined ? ` (${Math.round(info.larguraRel * 100)}% da típica${info.larguraRel <= SQUEEZE_REL ? " — comprimida" : ""})` : ""}\n`;
  if (volRatio !== null) msg += `📊 volume das velas: ${volRatio.toFixed(1)}× a média${volRatio >= VOL_ACEL_RATIO ? " ↗ acelerando" : volRatio <= VOL_SECO_RATIO ? " ↘ secando" : ""}\n`;
  if (info.aprox && info.idadeCandles === null) msg += `🎯 aproximação: ${info.aprox.vel.toFixed(2)}%/vela rumo à linha de ${info.aprox.alvo === "long" ? "LONG" : "SHORT"} (~${Math.max(1, Math.round(info.aprox.etaCandles * TF_MIN))} min)\n`;
  if (h1) msg += `⏱ 1H: ${lado1h === null ? "dentro da faixa" : lado1h === "long" ? "acima da faixa" : "abaixo da faixa"} (${h1.distAbs.toFixed(2)}%)\n`;
  msg += `💪 ADX ${adx.toFixed(1)} ${adxDif > 0.5 ? "↗" : adxDif < -0.5 ? "↘" : "→"} | RSI ${rsi.toFixed(0)}\n`;
  const atrAnalise = calcATR(d15.h, d15.l, d15.c, 14);
  msg += stopAlvoTxt(lado, vivo ?? info.preco, info.topo, info.fundo, atrAnalise, vivo !== null);
  if (pct !== null) msg += `${pct >= 0 ? "📈 +" : "📉 "}${pct.toFixed(2)}% (24h)${volUsdt !== null ? ` | vol ${(volUsdt / 1e6).toFixed(2)}M USDT` : ""}\n`;
  const foTxt = fundingOiTxt(fo);
  if (foTxt) msg += `💸 ${foTxt}\n`;
  msg += setup
    ? `🤖 Bot classificaria: ${setup.tipo === "oportunidade" ? "🚀 OPORTUNIDADE" : "🔄 REVERSÃO"}\n`
    : `🤖 Bot: não geraria alerta agora (movimento de 24h fraco ou longe da linha)\n`;
  msg += `⏰ ${xTxtJanela(perfil)}${btc ? ` | BTC ADX ${btc.adx.toFixed(1)}` : ""}\n`;
  msg += `\n❌ <b>Invalidaria:</b> ${invalida}\n`;
  try {
    const SB = getSupabase();
    if (SB) {
      const { data } = await SB.from(PLACAR_TABELA).select("*").eq("instid", instId).order("criado_em", { ascending: false }).limit(3);
      const hist = (data || []) as any[];
      if (hist.length) {
        msg += `\n📜 <b>Alertas anteriores</b>\n`;
        for (const r of hist) {
          const horas = ((Date.now() - new Date(r.criado_em).getTime()) / 3600000).toFixed(1);
          const res = PLACAR_HORIZONTES.map((h) => { const x = retornoLog(r, h); return `${h}h ${x === null ? "—" : (x >= 0 ? "+" : "") + x.toFixed(2) + "%"}`; }).join(" · ");
          msg += `• há ${horas}h ${r.lado === "long" ? "LONG" : "SHORT"} ${r.tipo} — ${res}\n`;
        }
      }
    }
  } catch { }
  msg += `\n<i>Estatístico, não é recomendação: os pontos são um guia simples (ajuste no bloco V12).</i>`;
  await sendTelegram(chatId, cortar(msg));
}
type Motivo = { pts: number; txt: string };
type FoInfo = { funding: number | null; oiChg: number | null };
type CtxPontos = {
  info: IndicadorInfo; lado: "long" | "short"; adx: number; adxDif: number; rsi: number; volUsdt: number | null;
  trocas: number; h1: IndicadorInfo | null; btcAdx: number | null; perfil: XPerfil | null; fo: FoInfo | null;
  volRatio: number | null; chegadaForte: boolean; apChega: Aprox | null;
  tipo?: "oportunidade" | "reversao" | null; pct24?: number | null; bottom?: FundoRes | null; btcVar?: number | null;
};
const confiancaDe = (total: number) => Math.max(0, Math.min(10, Math.round(((total + 3) * 10) / 11)));
const confEmoji = (n: number) => (n >= CONF_VERDE ? "🟢" : n >= CONF_AMARELO ? "🟡" : "🔴");
function pontuar(x: CtxPontos) {
  const { info, lado, adx, adxDif, rsi, volUsdt, trocas, h1, btcAdx, perfil, fo, volRatio, chegadaForte, apChega, tipo, pct24, bottom, btcVar } = x;
  const lado1h = h1 ? ladoAtual(h1) : null;
  const motivos: Motivo[] = [];
  const add = (pts: number, txt: string) => motivos.push({ pts, txt });
  if (!h1) add(0, "1H sem dados");
  else if (lado1h === null) add(0, "1H: preço dentro da faixa (sem tendência definida)");
  else if (lado1h === lado) add(2, `1H alinhada com o ${lado === "long" ? "LONG" : "SHORT"}`);
  else add(-2, `1H CONTRA (1H está ${lado1h === "long" ? "acima" : "abaixo"} da faixa)`);
  if (adx >= X_ADX_FORTE) add(2, `ADX ${adx.toFixed(1)} (tendência forte)`);
  else if (adx >= FILTRO_ADX_MIN) add(1, `ADX ${adx.toFixed(1)} (moderado)`);
  else add(-2, `ADX ${adx.toFixed(1)} (lateral, cruzamentos falham mais)`);
  if (adxDif > 0.5) add(1, "ADX subindo");
  else if (adxDif < -0.5) add(-1, "ADX caindo");
  if (ESTRAT_PUMP && tipo === "reversao" && lado === "short") {
    if (rsi < FILTRO_RSI_MIN) add(-2, `RSI ${rsi.toFixed(0)} já muito baixo (queda esticada)`);
    else if (rsi >= 70) add(1, `RSI ${rsi.toFixed(0)} esticado: exaustão favorece a reversão`);
    else add(0, `RSI ${rsi.toFixed(0)} ok`);
  } else if (ESTRAT_PUMP && lado === "long") {
    if (rsi > FILTRO_RSI_MAX_LONG) add(-2, `RSI ${rsi.toFixed(0)} extremo`);
    else if (rsi > 85) add(-1, `RSI ${rsi.toFixed(0)} muito esticado (risco de exaustão)`);
    else add(0, `RSI ${rsi.toFixed(0)} ok`);
  } else if (rsi > FILTRO_RSI_MAX || rsi < FILTRO_RSI_MIN) add(-2, `RSI ${rsi.toFixed(0)} extremo`);
  else if ((lado === "long" && rsi > 75) || (lado === "short" && rsi < 25)) add(-1, `RSI ${rsi.toFixed(0)} esticado a favor`);
  else add(0, `RSI ${rsi.toFixed(0)} ok`);
  if (volUsdt !== null) {
    if (volUsdt < FILTRO_VOL_MIN_USDT) add(-2, "volume 24h baixo (pouca liquidez)");
    else if (volUsdt >= FILTRO_VOL_MIN_USDT * 5) add(1, "volume 24h alto");
    else add(0, "volume 24h ok");
  }
  if (volRatio !== null) {
    if (volRatio >= VOL_ACEL_RATIO) add(1, `volume das velas acelerando (${volRatio.toFixed(1)}× a média)`);
    else if (volRatio <= VOL_SECO_RATIO) add(-1, `volume das velas secando (${volRatio.toFixed(1)}× a média)`);
  }
  const idade = info.idadeCandles;
  if (idade === null) add(info.distAbs < 0.15 ? 1 : 0, info.distAbs < 0.15 ? "ainda não cruzou, mas muito perto da linha" : "ainda não cruzou");
  else if (idade <= ALERT_FRESCO_CANDLES) add(2, "cruzamento fresco");
  else if (idade > ANALISE_MUITO_TARDE_CANDLES) add(-2, `cruzou há ${idade * TF_MIN} min (velho)`);
  else if (idade > ANALISE_TARDE_CANDLES) add(-1, `cruzou há ${idade * TF_MIN} min (já andou)`);
  else add(0, `cruzou há ${idade * TF_MIN} min`);
  if (apChega) add(1, `aproximando da linha: chega em ~${Math.max(1, Math.round(apChega.etaCandles * TF_MIN))} min (estimativa)`);
  if (info.larguraRel !== undefined && info.larguraRel <= SQUEEZE_REL && (idade === null || idade <= ALERT_FRESCO_CANDLES)) {
    const pctTip = `${Math.round(info.larguraRel * 100)}% da largura típica`;
    if (adxDif > 0.5 && adx < X_ADX_FORTE) add(1, `faixa comprimida (${pctTip}) + ADX subindo: costuma vir antes do rompimento`);
    else add(0, `faixa comprimida (${pctTip}), ADX ainda não confirma`);
  }
  if (info.distAbs > FILTRO_DIST_MAX_PCT) add(-2, `${info.distAbs.toFixed(2)}% longe da faixa`);
  if (trocas >= 4) add(-1, `vai e vem: ${trocas} trocas de posição em 4h`);
  if (btcAdx !== null && btcAdx < X_ADX_FRACO) add(-1, `BTC lateral (ADX ${btcAdx.toFixed(1)})`);
  if (perfil) {
    const j = xInfoJanela(perfil, Date.now());
    if (j.idxAgora >= X_JANELA_FORTE) add(1, "janela forte de movimento");
    else if (j.idxAgora <= X_JANELA_FRACA) add(-1, "janela fraca de movimento");
  }
  if (fo && fo.funding !== null && ((lado === "long" && fo.funding > FUNDING_ALTO_PCT) || (lado === "short" && fo.funding < -FUNDING_ALTO_PCT))) {
    add(-1, `funding ${fo.funding >= 0 ? "+" : ""}${fo.funding.toFixed(3)}% (multidão esticada do mesmo lado)`);
  }
  if (BTC_DIR_ON && btcVar != null && isFinite(btcVar)) {
    const f = BTC_DIR_PCT;
    if (lado === "short" && btcVar >= f) add(tipo === "reversao" ? -2 : -1, `BTC subindo +${btcVar.toFixed(1)}% na última hora: pump de altcoin tende a continuar, SHORT arriscado`);
    else if (lado === "short" && btcVar <= -f && tipo === "reversao") add(1, `BTC caindo ${btcVar.toFixed(1)}% na última hora: ajuda o SHORT de reversão`);
    else if (lado === "long" && btcVar <= -f && !(pct24 != null && pct24 < 0)) add(-1, `BTC caindo ${btcVar.toFixed(1)}% na última hora: o pump pode perder força`);
  }
  if (fo && fo.funding !== null && lado === "short" && fo.funding > FUNDING_ALTO_PCT) add(1, `funding +${fo.funding.toFixed(3)}%: multidão comprada, combustível pra queda`);
  if (ESTRAT_PUMP && lado === "long" && pct24 != null && pct24 < 0) {
    if (FUNDO_ON && FUNDO_LIBERA_LONG && bottom) {
      if (bottom.conf >= FUNDO_CONF_MIN) add(2, `sinais de fundo (${bottom.conf}/10): queda esgotando, reversão com apoio`);
      else if (bottom.conf >= FUNDO_CONF_MIN - 2) add(0, `sinais de fundo parciais (${bottom.conf}/10)`);
      else add(-2, `moeda em queda no dia sem sinais claros de fundo (${bottom.conf}/10)`);
    } else add(-3, "moeda em queda no dia: LONG seria reversão de baixa pra alta (fora da estratégia)");
  }
  const total = motivos.reduce((s, m) => s + m.pts, 0);
  const veredito = total >= ANALISE_VERDE ? "🟢 <b>FAVORÁVEL</b>" : total >= ANALISE_AMARELO ? "🟡 <b>COM ATENÇÃO</b>" : "🔴 <b>EVITAR / ESPERAR</b>";
  return { motivos, total, veredito, conf: confiancaDe(total) };
}
function placarFiltros(motivos: Motivo[]): string {
  const f = motivos.filter((m) => m.pts > 0).length, c = motivos.filter((m) => m.pts < 0).length, n = motivos.length - f - c;
  const em = f > 0 && f >= 2 * c ? "🟢" : f > c ? "🟡" : "🔴";
  return `📊 Filtros: <b>${f} a favor · ${c} contra</b>${n ? ` · ${n} neutro${n > 1 ? "s" : ""}` : ""} ${em}`;
}
function confLinha(r: { motivos: Motivo[]; conf: number }): string {
  const pos = r.motivos.filter((m) => m.pts > 0).sort((a, b) => b.pts - a.pts).slice(0, 2).map((m) => m.txt);
  const neg = r.motivos.filter((m) => m.pts < 0).sort((a, b) => a.pts - b.pts).slice(0, 2).map((m) => m.txt);
  let t = `🧭 Confiança: <b>${r.conf}/10</b> ${confEmoji(r.conf)}\n   ${placarFiltros(r.motivos)}`;
  if (pos.length) t += `\n   ✅ ${pos.join(" · ")}`;
  if (neg.length) t += `\n   ⚠️ ${neg.join(" · ")}`;
  return t;
}
function avisoLimiteLado(lista: Pos[] | null, lado: "long" | "short"): string {
  if (LIMITE_LADO <= 0 || !lista) return "";
  const n = lista.filter((p) => p.lado === lado).length;
  return n >= LIMITE_LADO ? `\n⚠️ Você já tem ${n} ${lado === "long" ? "LONG" : "SHORT"}(s) abertos — essas moedas tendem a andar juntas com o BTC; considere não abrir mais um.` : "";
}
async function calcConfiancaAlerta(c: Setup, volUsdt: number | null, perfil: XPerfil | null) {
  try {
    const f = c.info as InfoFiltravel;
    const inst = c.info.instId;
    const [d1h, btc, fo, btcV] = await Promise.all([xCandles(inst, "1H", 500), xRegimeCache(), getFundingOI(inst), btcVar1h()]);
    const h1 = d1h ? calcIndicadorDeCloses(inst, d1h.c) : null;
    const ap = c.aprox ?? null;
    const r = pontuar({
      info: c.info, lado: c.lado, adx: f.adx ?? 0, adxDif: (f.adx ?? 0) - (f.adxAntes ?? f.adx ?? 0), rsi: f.rsi ?? 50,
      volUsdt, trocas: f.trocas ?? 0, h1, btcAdx: btc ? btc.adx : null, perfil, fo, volRatio: f.volRatio ?? null,
      chegadaForte: chegadaEmJanelaForte(ap, perfil), apChega: ap, tipo: c.tipo, pct24: c.pct, bottom: f.bottom ?? null, btcVar: btcV,
    });
    return { ...r, fo, btcVar: btcV };
  } catch (e) { console.log("⚠️ confiança do alerta falhou", e); return null; }
}

async function registrarAntecipacao(SB: any, c: Setup, chats: string[]) {
  try {
    const ap = c.aprox;
    if (!ap) return;
    const { data: pend } = await SB.from(ANTEC_TABELA).select("id").eq("instid", c.info.instId).is("resultado", null).limit(1);
    if (pend && pend.length) return;
    const { error } = await SB.from(ANTEC_TABELA).insert({
      instid: c.info.instId, lado: c.lado, eta_prev_min: Math.max(1, Math.round(ap.etaCandles * TF_MIN)),
      dist_pct: ap.dist, chats: chats.join(","),
    });
    if (error) console.log("⚠️ registrarAntecipacao:", error.message);
  } catch (e) { console.log("⚠️ registrarAntecipacao erro", e); }
}
async function checarAntecipacoes(SB: any, poolInfoMap: Map<string, IndicadorInfo>) {
  const agoraIso = new Date().toISOString();
  const corte = new Date(Date.now() - 6 * 3600000).toISOString();
  await SB.from(ANTEC_TABELA).update({ resultado: "expirou", resolvido_em: agoraIso }).is("resultado", null).lte("criado_em", corte);
  const { data, error } = await SB.from(ANTEC_TABELA).select("*").is("resultado", null).gt("criado_em", corte).limit(50);
  if (error) { console.log("⚠️ checarAntecipacoes:", error.message); return; }
  const rows = (data || []) as any[];
  if (!rows.length) return;
  console.log(`🎯 ${rows.length} previsão(ões) 'chegando' pendente(s)`);
  await emLotes(rows, 5, async (r: any) => {
    const inst: string = r.instid, lado: "long" | "short" = r.lado;
    const info = poolInfoMap.get(inst) ?? (await calcIndicadorFiltro(inst).catch(() => null));
    if (!info) return;
    const decorrido = (Date.now() - new Date(r.criado_em).getTime()) / 60000;
    const atual = ladoAtual(info);
    const distPrev = Number(r.dist_pct) || 0;
    const dAlvo = lado === "long" ? ((info.topo - info.preco) / info.preco) * 100 : ((info.preco - info.fundo) / info.preco) * 100;
    let resultado: "cruzou" | "contra" | "recuou" | "expirou" | null = null;
    if (atual === lado) resultado = "cruzou";
    else if (atual !== null) resultado = "contra";
    else if (decorrido >= TF_MIN) {
      const ap = chegandoNaLinha(info);
      const seguindo = !!ap && ap.alvo === lado;
      if (!seguindo && dAlvo >= Math.max(distPrev * ANTEC_CANCELA_RECUO, distPrev + 0.1)) resultado = "recuou";
      else if (decorrido > Math.max(Number(r.eta_prev_min) * 2, 45)) resultado = "expirou";
    }
    if (!resultado) return;
    const realMin = resultado === "cruzou" ? Math.max(0, Math.round(decorrido - (info.idadeCandles ?? 0) * TF_MIN)) : null;
    const { data: ok } = await SB.from(ANTEC_TABELA).update({ resultado, real_min: realMin, resolvido_em: new Date().toISOString() }).eq("id", r.id).is("resultado", null).select("id");
    if (!ok || !ok.length) return;
    console.log(`🎯 previsão ${inst} ${lado}: ${resultado} (previsto ${r.eta_prev_min} min, decorrido ${Math.round(decorrido)} min)`);
    const nome = lado === "long" ? "LONG" : "SHORT";
    const opostoNome = lado === "long" ? "SHORT" : "LONG";
    let msg: string;
    if (resultado === "cruzou") {
      msg = `✅ <b>${inst}</b> — CRUZOU pra <b>${nome}</b>\n${DIVISOR}\n\nPrevisto em ~${r.eta_prev_min} min, cruzou em ~${realMin} min.\n${idadeTxt(info.idadeCandles)}\n${indicadorTxt(info)}\npreço ${fmtPrice(info.preco)} | topo ${fmtPrice(info.topo)} | fundo ${fmtPrice(info.fundo)}`;
    } else if (resultado === "contra") {
      msg = `⚠️ <b>${inst}</b> — cruzou pro lado OPOSTO\n${DIVISOR}\n\nO aviso era de <b>${nome}</b>, mas o preço foi pro outro lado e cruzou pra <b>${opostoNome}</b>.\nO robô abriria ${opostoNome}, não ${nome}.\n${idadeTxt(info.idadeCandles)}\npreço ${fmtPrice(info.preco)} | topo ${fmtPrice(info.topo)} | fundo ${fmtPrice(info.fundo)}`;
    } else if (resultado === "recuou") {
      msg = `🛑 <b>${inst}</b> — NÃO cruzou: o preço recuou\n${DIVISOR}\n\nO aviso "chegando na linha de ${nome}" não se confirmou. <b>Pode desligar o robô</b> se ligou por causa dele.\nDistância até a linha: era ${distPrev.toFixed(2)}% → agora ${dAlvo.toFixed(2)}%\n${indicadorTxt(info)}\npreço ${fmtPrice(info.preco)} | topo ${fmtPrice(info.topo)} | fundo ${fmtPrice(info.fundo)}`;
    } else {
      msg = `⌛ <b>${inst}</b> — passou do prazo sem cruzar\n${DIVISOR}\n\nO aviso "chegando na linha de ${nome}" previa ~${r.eta_prev_min} min e já se passaram ${Math.round(decorrido)} min. <b>Pode desligar o robô</b> se ligou por causa dele.\nDistância até a linha: era ${distPrev.toFixed(2)}% → agora ${dAlvo.toFixed(2)}%\n${indicadorTxt(info)}\npreço ${fmtPrice(info.preco)} | topo ${fmtPrice(info.topo)} | fundo ${fmtPrice(info.fundo)}`;
    }
    const chats = String(r.chats || "").split(",").map((s) => s.trim()).filter((ch) => ch && ALERT_CHAT_IDS.includes(ch) && !silChat(ch));
    await Promise.all(chats.map((ch) => enviarAlertaMoeda(SB, ch, inst, cortar(msg), botaoAnalisar(inst))));
  });
}
async function montarCalibracao(SB: any, dias: number): Promise<string> {
  const desde = new Date(Date.now() - dias * 86400000).toISOString();
  const { data, error } = await SB.from(ANTEC_TABELA).select("*").gt("criado_em", desde).not("resultado", "is", null).limit(2000);
  if (error || !data || !data.length) return "";
  const rows = data as any[];
  const conta = (res: string) => rows.filter((r) => r.resultado === res).length;
  const cruzou = rows.filter((r) => r.resultado === "cruzou");
  let t = `🎯 <b>Previsão "chegando na linha"</b> (n=${rows.length})\n`;
  t += `Cruzou ${cruzou.length} (${Math.round((cruzou.length / rows.length) * 100)}%) · recuou ${conta("recuou")} · lado oposto ${conta("contra")} · expirou ${conta("expirou")}\n`;
  const erros = cruzou.filter((r) => r.real_min != null).map((r) => Number(r.real_min) - Number(r.eta_prev_min));
  if (erros.length) {
    const med = xMediana(erros);
    t += `Erro mediano de tempo: ${med >= 0 ? "+" : ""}${Math.round(med)} min (${med > 0 ? "cruza mais tarde" : "cruza mais cedo"} que o previsto)\n`;
  }
  const maxC = Math.max(ANTEC_ETA_MAX_CANDLES, 1);
  let sug: number | null = null;
  for (let k = 1; k <= maxC; k++) {
    const g = rows.filter((r) => Math.ceil(Number(r.eta_prev_min) / TF_MIN) === k);
    if (g.length >= 3) {
      const ac = g.filter((r) => r.resultado === "cruzou").length;
      t += `• previsto ≤ ${k * TF_MIN} min: ${ac}/${g.length} cruzaram (${Math.round((ac / g.length) * 100)}%)\n`;
    }
    const acum = rows.filter((r) => Number(r.eta_prev_min) <= k * TF_MIN);
    if (acum.length >= 5 && acum.filter((r) => r.resultado === "cruzou").length / acum.length >= 0.6) sug = k;
  }
  if (rows.length < ANTEC_CALIB_MIN) t += `⚠️ <i>Amostra pequena (${rows.length}): ainda não ajuste nada.</i>\n`;
  else if (sug === null) t += `💡 Nenhuma faixa de antecipação chega a 60% de acerto: considere reduzir ANTEC_ETA_MAX_CANDLES (hoje ${ANTEC_ETA_MAX_CANDLES}).\n`;
  else if (sug !== ANTEC_ETA_MAX_CANDLES) t += `💡 Sugestão: ANTEC_ETA_MAX_CANDLES=${sug} (hoje ${ANTEC_ETA_MAX_CANDLES}) — maior janela com ≥60% de acerto.\n`;
  else t += `💡 ANTEC_ETA_MAX_CANDLES=${ANTEC_ETA_MAX_CANDLES} está bem calibrado (≥60% de acerto).\n`;
  return t + "\n";
}
function botaoAnalisar(instId: string): Botoes {
  const s = instId.replace("-USDT", "");
  return [[{ text: `🔎 Analisar ${s}`, callback_data: `/analise ${s.toLowerCase()}` }]];
}
const TAB = "alertas_indicador";
async function upsertLinha(SB: any, instid: string, campos: Record<string, unknown>) {
  const { data: row } = await SB.from(TAB).select("instid").eq("instid", instid).maybeSingle();
  if (row) await SB.from(TAB).update(campos).eq("instid", instid);
  else await SB.from(TAB).insert({ instid, ...campos });
}
const FUNDING_ALTO_PCT = 0.05;
async function getFundingOI(instId: string): Promise<{ funding: number | null; oiChg: number | null }> {
  const sym = instId.replace("-", "");
  let funding: number | null = null, oiChg: number | null = null;
  try {
    const r = await fetch(`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${sym}`);
    const j = await r.json();
    const fr = parseFloat(j?.result?.list?.[0]?.fundingRate);
    if (isFinite(fr)) funding = fr * 100;
  } catch { }
  if (funding === null) {
    try {
      const r = await fetch(`https://openapi.blofin.com/api/v1/market/funding-rate?instId=${instId}`);
      const j = await J(r);
      const fr = parseFloat((j as any)?.data?.[0]?.fundingRate);
      if (isFinite(fr)) funding = fr * 100;
    } catch { }
  }
  try {
    const r = await fetch(`https://api.bybit.com/v5/market/open-interest?category=linear&symbol=${sym}&intervalTime=1h&limit=5`);
    const j = await r.json();
    const l = j?.result?.list;
    if (Array.isArray(l) && l.length >= 5) {
      const a = parseFloat(l[0].openInterest), b = parseFloat(l[4].openInterest);
      if (isFinite(a) && isFinite(b) && b > 0) oiChg = ((a - b) / b) * 100;
    }
  } catch { }
  return { funding, oiChg };
}
function fundingOiTxt(fo: { funding: number | null; oiChg: number | null }): string {
  const p: string[] = [];
  if (fo.funding !== null) p.push(`Funding ${fo.funding >= 0 ? "+" : ""}${fo.funding.toFixed(3)}%`);
  if (fo.oiChg !== null) p.push(`OI ${fo.oiChg >= 0 ? "+" : ""}${fo.oiChg.toFixed(1)}% (4h)`);
  return p.join(" | ");
}
async function linhaFundingOI(instId: string): Promise<string> {
  try { const t = fundingOiTxt(await getFundingOI(instId)); return t ? `\n💸 ${t}` : ""; } catch { return ""; }
}
const SEG_PREFIXO = "SEG_";
const SEG_MAX = Number(Deno.env.get("SEG_MAX") || "10");
const SEG_MAX_GLOBAL = Number(Deno.env.get("SEG_MAX_GLOBAL") || "40");
const SEG_COOLDOWN_MIN = 60;
type Seguida = { chat: string; inst: string; row: any };
function parseSeg(row: any): Seguida | null {
  const resto = String(row.instid).slice(SEG_PREFIXO.length);
  const m = resto.match(/^(-?\d+)_(.+)$/);
  if (m) return { chat: m[1], inst: m[2], row };
  return DONO_CHAT ? { chat: DONO_CHAT, inst: resto, row } : null;
}
async function listarSeguidas(SB: any, chat?: string | number): Promise<Seguida[]> {
  const { data } = await SB.from(TAB).select("*").like("instid", `${SEG_PREFIXO}%`);
  const todas = ((data || []) as any[]).filter((r) => String(r.instid).startsWith(SEG_PREFIXO)).map(parseSeg).filter((x): x is Seguida => x !== null);
  return chat === undefined ? todas : todas.filter((x) => x.chat === String(chat));
}
async function runSeguir(chatId: number | string, entrada: string, seguir: boolean) {
  const SB = getSupabase();
  if (!SB) { await sendTelegram(chatId, "⚠️ Supabase não configurado."); return; }
  const inst = await resolverPar(entrada);
  if (!inst) { await sendTelegram(chatId, `⚠️ Não achei a moeda "${entrada.replace(/[<>&]/g, "").slice(0, 20)}". Exemplo: /${seguir ? "seguir" : "parar"} ONE`); return; }
  const id = `${SEG_PREFIXO}${chatId}_${inst}`;
  const legado = String(chatId) === DONO_CHAT;
  if (!seguir) {
    const antes = await listarSeguidas(SB, chatId);
    const tinha = antes.some((x) => x.inst === inst);
    await SB.from(TAB).delete().eq("instid", id);
    if (legado) await SB.from(TAB).delete().eq("instid", SEG_PREFIXO + inst);
    await sendTelegram(chatId, tinha ? `🛑 Parei de seguir <b>${inst}</b>. (restam ${antes.length - 1}/${SEG_MAX})` : `ℹ️ <b>${inst}</b> não estava na sua lista de seguidas.`);
    return;
  }
  const lista = await listarSeguidas(SB, chatId);
  const jaSegue = lista.some((x) => x.inst === inst);
  if (lista.length >= SEG_MAX && !jaSegue) { await sendTelegram(chatId, `⚠️ Limite de ${SEG_MAX} moedas seguidas (você segue ${lista.length}). Use /parar MOEDA antes.`); return; }
  const unicas = new Set((await listarSeguidas(SB)).map((x) => x.inst));
  if (!unicas.has(inst) && unicas.size >= SEG_MAX_GLOBAL) { await sendTelegram(chatId, `⚠️ O bot já acompanha ${SEG_MAX_GLOBAL} moedas seguidas no total (limite para o robô rodar dentro do tempo). Tente mais tarde ou peça ao administrador para aumentar SEG_MAX_GLOBAL.`); return; }
  if (legado) await SB.from(TAB).delete().eq("instid", SEG_PREFIXO + inst);
  await upsertLinha(SB, id, { last_status: "novo", last_alert_at: null });
  await sendTelegram(chatId, `⭐ Seguindo <b>${inst}</b> (${jaSegue ? lista.length : lista.length + 1}/${SEG_MAX}). Aviso quando cruzar a linha ou chegar PERTO (mesmo fora do top 40 do dia).`, botaoAnalisar(inst));
}
async function runSeguidas(chatId: number | string) {
  const SB = getSupabase();
  if (!SB) { await sendTelegram(chatId, "⚠️ Supabase não configurado."); return; }
  const rows = (await listarSeguidas(SB, chatId)).map((x) => x.inst);
  if (!rows.length) { await sendTelegram(chatId, "⭐ <b>SEGUIDAS</b>\n\nNenhuma moeda seguida. Use /seguir ONE."); return; }
  const [infos, perfilSeg] = await Promise.all([emLotes(rows, 10, calcIndicador500), xPerfilHoras().catch(() => null)]);
  let msg = `⭐ <b>MOEDAS SEGUIDAS</b> — ${rows.length}/${SEG_MAX}\n⏰ Agora: ${xTxtJanela(perfilSeg)}\n${DIVISOR}\n\n`;
  rows.forEach((inst, i) => {
    const info = infos[i];
    msg += `<b>${i + 1}. ${inst}</b>\n${info ? `${idadeTxt(info.idadeCandles)}\n${indicadorTxt(info)}\npreço ${fmtPrice(info.preco)}` : "sem dado agora"}\n\n`;
  });
  const botoesSeg: Botoes = rows.map((inst) => {
    const s = inst.replace("-USDT", "").toLowerCase();
    return [{ text: `🔎 Analisar ${s.toUpperCase()}`, callback_data: `/analise ${s}` }, { text: `❌ Parar ${s.toUpperCase()}`, callback_data: `/parar ${s}` }];
  });
  botoesSeg.push([{ text: "🧹 Parar todas", callback_data: "/parar todas" }]);
  await sendTelegram(chatId, cortar(msg + "<i>Toque em 🔎 para analisar ou em ❌ para deixar de seguir uma moeda.</i>"), botoesSeg);
}
async function pararTodas(chatId: number | string) {
  const SB = getSupabase();
  if (!SB) { await sendTelegram(chatId, "⚠️ Supabase não configurado."); return; }
  const lista = await listarSeguidas(SB, chatId);
  for (const x of lista) await SB.from(TAB).delete().eq("instid", x.row.instid);
  await sendTelegram(chatId, lista.length ? `🧹 Parei de seguir ${lista.length} moeda(s).` : "ℹ️ Você não segue nenhuma moeda.");
}
async function checarSeguidas(SB: any) {
  const segs = await listarSeguidas(SB);
  if (!segs.length) return;
  const unicas = [...new Set(segs.map((x) => x.inst))];
  const infosArr = await emLotes(unicas, 10, calcIndicadorFiltro);
  const infoMap = new Map(unicas.map((inst, i) => [inst, infosArr[i]] as [string, InfoFiltravel | null]));
  const agora = Date.now();
  await emLotes(segs, 5, async (sg) => {
    if (silChat(sg.chat)) return;
    const r = sg.row, info = infoMap.get(sg.inst);
    if (!info) return;
    const inst = info.instId;
    const atual: string = ladoAtual(info) ?? "dentro";
    let aviso: string | null = null;
    if (r.last_status !== "novo" && r.last_status !== atual && atual !== "dentro") {
      aviso = `⭐ <b>${inst}</b> — CRUZOU pra <b>${atual === "long" ? "LONG (compra)" : "SHORT (venda)"}</b>\n${DIVISOR}\n\n`;
    } else if (atual === "dentro" && (info.distAbs < 0.5 || chegandoNaLinha(info)) && (!r.last_alert_at || agora - new Date(r.last_alert_at).getTime() >= SEG_COOLDOWN_MIN * 60000)) {
      const apS = chegandoNaLinha(info);
      aviso = `⭐ <b>${inst}</b> — ${apS ? `🎯 <b>CHEGANDO</b> na linha de ${apS.alvo === "long" ? "LONG" : "SHORT"} em ~${Math.max(1, Math.round(apS.etaCandles * TF_MIN))} min` : `chegou <b>PERTO</b> da linha (${info.regiao.includes("topo") ? "lado LONG" : "lado SHORT"})`}\n${DIVISOR}\n\n`;
    }
    if (aviso) {
      aviso += `${idadeTxt(info.idadeCandles)}\n${indicadorTxt(info)}\nADX ${info.adx.toFixed(1)} | RSI ${info.rsi.toFixed(0)}\npreço ${fmtPrice(info.preco)} | topo ${fmtPrice(info.topo)} | fundo ${fmtPrice(info.fundo)}`;
      aviso += await blocoPosicao(posDaMoeda(await getPosicoes(sg.chat), inst), info, ladoAtual(info) ?? chegandoNaLinha(info)?.alvo);
      await enviarAlertaMoeda(SB, sg.chat, inst, cortar(aviso), botaoSeguida(inst));
    }
    await SB.from(TAB).update({ last_status: atual, last_alert_at: aviso ? new Date().toISOString() : r.last_alert_at }).eq("instid", r.instid);
  });
}
const RESUMO_ON = (Deno.env.get("RESUMO") || "1") !== "0";
const RESUMO_MANHA_H = Number(Deno.env.get("RESUMO_MANHA_H") || "8");
const RESUMO_NOITE_H = Number(Deno.env.get("RESUMO_NOITE_H") || "21");
const _ultimoResumo: Record<string, string> = {};
function xJanelasFortes(p: XPerfil): { ini: number; fim: number }[] {
  const forte = p.idx.map((v) => v >= X_JANELA_FORTE);
  const out: { ini: number; fim: number }[] = [];
  for (let h = 0; h < 24; h++) {
    if (forte[h] && !forte[(h + 23) % 24]) {
      let f = h;
      while (forte[(f + 1) % 24] && (f + 1) % 24 !== h) f++;
      out.push({ ini: h, fim: (f + 1) % 24 });
    }
  }
  return out;
}
async function montarResumoManha(SB: any, chat?: string | number): Promise<string> {
  const [perfil, regimesB] = await Promise.all([xPerfilHoras().catch(() => null), Promise.all(X_MOEDAS_MERCADO.map((m) => xRegime(m).catch(() => null)))]);
  const regimes = regimesB.filter((x): x is XRegime => x !== null);
  const tzTxt = `UTC${X_TZ_OFFSET_H >= 0 ? "+" : ""}${X_TZ_OFFSET_H}`;
  let msg = `🌅 <b>BOM DIA — resumo do dia</b>\n${DIVISOR}\n\n`;
  if (perfil) {
    const js = xJanelasFortes(perfil);
    msg += `🔥 <b>Janelas fortes hoje</b> (${perfil.tipo}, ${tzTxt}):\n${js.length ? js.map((j) => `${xHH(j.ini)}–${xHH(j.fim)}`).join(" · ") : "nenhuma bem definida"}\n\n`;
  } else msg += `⚠️ Sem perfil de horários agora.\n\n`;
  if (regimes.length) {
    const adxMed = regimes.reduce((s, r) => s + r.adx, 0) / regimes.length;
    const nivel = adxMed >= X_ADX_FORTE ? "tendência forte" : adxMed >= X_ADX_FRACO ? "tendência moderada" : "lateral";
    msg += `📊 <b>Mercado</b>: ADX médio ${adxMed.toFixed(1)} — ${nivel}\n${regimes.map((r) => `${r.instId.replace("-USDT", "")} ${r.adx.toFixed(0)}`).join(" · ")}\n\n`;
  }
  const { data: w } = await SB.from(TAB).select("instid, watch_side").not("watch_until", "is", null).gt("watch_until", new Date().toISOString()).eq("watch_notificado", false);
  const ws = (w || []) as any[];
  msg += ws.length ? `📋 <b>Em acompanhamento</b> (${ws.length}): ${ws.slice(0, 12).map((r) => `${String(r.instid).replace("-USDT", "")} ${r.watch_side === "long" ? "L" : "S"}`).join(", ")}\n` : `📋 Nada em acompanhamento.\n`;
  const ss = chat === undefined ? [] : await listarSeguidas(SB, chat);
  if (ss.length) msg += `⭐ <b>Seguindo</b> (${ss.length}): ${ss.slice(0, 12).map((x) => x.inst.replace("-USDT", "")).join(", ")}\n`;
  msg += `\n<i>Estatístico: mostra QUANDO tende a haver mais movimento, não a direção.</i>`;
  return cortar(msg);
}
async function montarResumoNoite(SB: any, chat?: string | number): Promise<string> {
  const tzMs = X_TZ_OFFSET_H * 3600000;
  const inicioDia = Math.floor((Date.now() + tzMs) / 86400000) * 86400000 - tzMs;
  const { data, error } = await SB.from(PLACAR_TABELA).select("*").gt("criado_em", new Date(inicioDia).toISOString()).order("criado_em", { ascending: true }).limit(500);
  let msg = `🌙 <b>BOA NOITE — alertas do dia</b>\n${DIVISOR}\n\n`;
  const rows = ((error ? [] : (data || [])) as any[]).filter((r) => !ehFinalLog(r));
  if (!rows.length) msg += error ? `⚠️ Não consegui ler o placar (tabela ${PLACAR_TABELA} existe?).\n` : `Nenhum alerta hoje.\n`;
  else {
    msg += `${rows.length} alerta(s) hoje:\n`;
    for (const r of rows.slice(-10)) {
      const hora = new Date(new Date(r.criado_em).getTime() + tzMs).toISOString().slice(11, 16);
      const res = PLACAR_HORIZONTES.map((h) => { const x = retornoLog(r, h); return `${h}h ${x === null ? "—" : (x >= 0 ? "+" : "") + x.toFixed(1) + "%"}`; }).join(" · ");
      msg += `• ${hora} ${String(r.instid).replace("-USDT", "")} ${r.lado === "long" ? "LONG" : "SHORT"} — ${res}\n`;
    }
    if (rows.length > 10) msg += `<i>(mostrando os 10 últimos)</i>\n`;
    msg += `\n📊 <b>Resultado</b>\n${linhaStats(rows)}\n<i>alertas recentes ainda não têm 4h/24h conferidos</i>\n`;
  }
  try {
    const { data: d14 } = await SB.from(PLACAR_TABELA).select("*").gt("criado_em", new Date(Date.now() - 14 * 86400000).toISOString()).order("criado_em", { ascending: false }).limit(2000);
    const r14 = ((d14 || []) as any[]).filter((r) => !ehFinalLog(r));
    const ontem = r14.filter((r) => { const t = new Date(r.criado_em).getTime(); return t >= inicioDia - 86400000 && t < inicioDia; });
    if (ontem.length) msg += `\n📆 <b>Ontem</b> (${ontem.length} alerta(s), já conferido)\n${linhaStats(ontem)}\n`;
  } catch (e) { console.log("⚠️ resumo noite (14d)", e); }
  const credR = chat !== undefined ? credDe(chat) : null;
  if (credR) {
    try {
      const { fills } = await buscarFills(credR, inicioDia);
      const fech = fills.filter((f) => numOr0(f.fillPnl) !== 0);
      const soma = fech.reduce((s, f) => s + numOr0(f.fillPnl), 0);
      const gan = fech.filter((f) => numOr0(f.fillPnl) > 0).length;
      msg += `\n💼 <b>Seu resultado real hoje</b>: ${sgn(soma)} USDT${fech.length ? ` (${gan} ganho(s) × ${fech.length - gan} perda(s))` : " (nenhum fechamento)"}\n<i>sem taxas e funding</i>\n`;
    } catch (e) { console.log("⚠️ resumo noite (fills)", e); }
  }
  const { data: w } = await SB.from(TAB).select("instid").not("watch_until", "is", null).gt("watch_until", new Date().toISOString()).eq("watch_notificado", false);
  msg += `\n📋 ${(w || []).length} moeda(s) seguem em acompanhamento.`;
  return cortar(msg);
}
async function checarResumos(SB: any) {
  if (!RESUMO_ON || !ALERT_CHAT_IDS.length || ALERT_CHAT_IDS.every((ch) => silChat(ch))) return;
  const loc = new Date(Date.now() + X_TZ_OFFSET_H * 3600000);
  const h = loc.getUTCHours(), dia = loc.toISOString().slice(0, 10);
  const tarefas: [string, number, (SB: any, chat: string) => Promise<string>][] = [["M", RESUMO_MANHA_H, montarResumoManha], ["N", RESUMO_NOITE_H, montarResumoNoite]];
  for (const [tag, H, montar] of tarefas) {
    if (h < H || h >= H + 3) continue;
    const chave = `${tag} ${dia}`;
    if (_ultimoResumo[tag] === chave) continue;
    const { data: row } = await SB.from(TAB).select("last_status").eq("instid", "_RESUMO_" + tag).maybeSingle();
    if (row?.last_status === chave) { _ultimoResumo[tag] = chave; continue; }
    _ultimoResumo[tag] = chave;
    await upsertLinha(SB, "_RESUMO_" + tag, { last_status: chave, last_alert_at: new Date().toISOString() });
    await Promise.all(ALERT_CHAT_IDS.filter((c) => !silChat(c)).map(async (ch) => sendTelegram(ch, await montar(SB, ch))));
    console.log(`🗓️ resumo ${tag} enviado (${chave})`);
  }
}
async function runResumo(chatId: number | string) {
  const SB = getSupabase();
  if (!SB) { await sendTelegram(chatId, "⚠️ Supabase não configurado."); return; }
  await sendTelegram(chatId, await montarResumoManha(SB, chatId));
  await sendTelegram(chatId, await montarResumoNoite(SB, chatId));
}
async function extrasV13(SB: any, poolInfoMap: Map<string, IndicadorInfo>, posMap: Map<string, Pos[] | null>) {
  const partes: [string, () => Promise<void>][] = [
    ["placar", () => conferirPlacar(SB)],
    ["seguidas", () => checarSeguidas(SB)],
    ["posições", () => checarPosicoes(SB, posMap)],
    ["resumos", () => checarResumos(SB)],
  ];
  await Promise.all(partes.map(async ([nome, fn]) => {
    try { await fn(); } catch (e) { console.log(`❌ erro ${nome}`, e); }
  }));
}
const BLOFIN_KEY = Deno.env.get("BLOFIN_API_KEY") || "";
const BLOFIN_SECRET = Deno.env.get("BLOFIN_API_SECRET") || "";
const BLOFIN_PASS = Deno.env.get("BLOFIN_API_PASSPHRASE") || "";
const BLOFIN_BASE = Deno.env.get("BLOFIN_BASE_URL") || "https://openapi.blofin.com";
type Cred = { key: string; secret: string; pass: string };
const DONO_CHAT = String(Deno.env.get("BLOFIN_OWNER_CHAT_ID") || ALLOWED_CHAT_IDS[0] || ALERT_CHAT_IDS[0] || "");
const BLOFIN_LEGADO: Cred | null = BLOFIN_KEY && BLOFIN_SECRET && BLOFIN_PASS ? { key: BLOFIN_KEY, secret: BLOFIN_SECRET, pass: BLOFIN_PASS } : null;
const BLOFIN_USERS: Record<string, Cred> = (() => {
  const out: Record<string, Cred> = {};
  try {
    const j = JSON.parse(Deno.env.get("BLOFIN_USERS") || "{}");
    for (const [k, v] of Object.entries(j as Record<string, any>)) if (v?.key && v?.secret && v?.pass) out[String(k)] = { key: String(v.key), secret: String(v.secret), pass: String(v.pass) };
  } catch { console.log("⚠️ Secret BLOFIN_USERS com JSON inválido — ignorado"); }
  return out;
})();
function credDe(chat: string | number): Cred | null {
  const id = String(chat);
  return BLOFIN_USERS[id] ?? (id === DONO_CHAT ? BLOFIN_LEGADO : null);
}
async function blofinPrivado(path: string, cred: Cred): Promise<any[]> {
  const ts = String(Date.now());
  const nonce = crypto.randomUUID();
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(cred.secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(path + "GET" + ts + nonce));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const r = await fetch(BLOFIN_BASE + path, {
    headers: { "ACCESS-KEY": cred.key, "ACCESS-SIGN": btoa(hex), "ACCESS-TIMESTAMP": ts, "ACCESS-NONCE": nonce, "ACCESS-PASSPHRASE": cred.pass },
  });
  const j: any = await J(r);
  if (j.code === "html_block") throw new Error("BloFin bloqueou a requisição (HTTP " + r.status + ")");
  if (String(j.code) !== "0") throw new Error(`BloFin ${j.code ?? r.status}: ${j.msg ?? j.raw ?? "sem detalhe"}`);
  return (j.data || []) as any[];
}

const SILENCIO_ON = (Deno.env.get("SILENCIO") || "1") !== "0";
const SILENCIO_INI_H = Number(Deno.env.get("SILENCIO_INI_H") || "3");
const SILENCIO_FIM_H = Number(Deno.env.get("SILENCIO_FIM_H") || "6");
const SILENCIO_PROTECAO = (Deno.env.get("SILENCIO_PROTECAO") || "1") !== "0";
function emSilencio(): boolean {
  if (!SILENCIO_ON) return false;
  const h = new Date(Date.now() + X_TZ_OFFSET_H * 3600000).getUTCHours();
  return SILENCIO_INI_H <= SILENCIO_FIM_H ? (h >= SILENCIO_INI_H && h < SILENCIO_FIM_H) : (h >= SILENCIO_INI_H || h < SILENCIO_FIM_H);
}
const MSG_PREFIXO = "_MSG_";
async function enviarAlertaMoeda(SB: any, chat: string, instId: string, msg: string, botoes?: Botoes): Promise<number | null> {
  const chave = `${MSG_PREFIXO}${chat}_${instId}`;
  let antigo: number | null = null;
  try {
    const { data } = await SB.from(TAB).select("last_status").eq("instid", chave).maybeSingle();
    const n = Number(data?.last_status);
    if (isFinite(n) && n > 0) antigo = n;
  } catch { }
  const novo = await sendTelegram(chat, msg, botoes);
  if (novo) {
    if (antigo) await apagarMsg(chat, antigo);
    try { await upsertLinha(SB, chave, { last_status: String(novo) }); } catch (e) { console.log("⚠️ não salvei id da mensagem", e); }
  }
  return novo;
}
type Pos = { instId: string; lado: "long" | "short"; entrada: number; mark: number; pnl: number; pnlPct: number; lev: number; liq: number };
const numOr0 = (x: unknown) => { const n = Number(x); return isFinite(n) ? n : 0; };
const sgn = (x: number, d = 2) => `${x >= 0 ? "+" : ""}${x.toFixed(d)}`;
function paraPos(p: any): Pos | null {
  const q = numOr0(p.positions);
  if (q === 0) return null;
  const lado = p.positionSide === "long" ? "long" : p.positionSide === "short" ? "short" : (q > 0 ? "long" : "short");
  return { instId: String(p.instId), lado, entrada: numOr0(p.averagePrice), mark: numOr0(p.markPrice), pnl: numOr0(p.unrealizedPnl), pnlPct: numOr0(p.unrealizedPnlRatio) * 100, lev: numOr0(p.leverage), liq: numOr0(p.liquidationPrice) };
}
const POS_CACHE_MS = 45000;
const _posCache = new Map<string, { t: number; v: Pos[] | null }>();
async function getPosicoes(chat: string | number): Promise<Pos[] | null> {
  const id = String(chat), cred = credDe(id);
  if (!cred) return null;
  const c = _posCache.get(id);
  if (c && Date.now() - c.t < POS_CACHE_MS) return c.v;
  let v: Pos[] | null = null;
  try {
    const arr = await blofinPrivado("/api/v1/account/positions", cred);
    v = arr.map(paraPos).filter((x): x is Pos => x !== null);
  } catch (e) { console.log(`⚠️ posições BloFin indisponíveis (chat ${id})`, String((e as Error).message || e)); }
  _posCache.set(id, { t: Date.now(), v });
  return v;
}
const posDaMoeda = (lista: Pos[] | null, instId: string): Pos[] => (lista ? lista.filter((p) => p.instId === instId) : []);
type Sugestao = { emoji: string; titulo: string; dica: string; contra: boolean };
function sugestaoPosicao(p: Pos, info: IndicadorInfo & { adx?: number; rsi?: number; adxAntes?: number }, alvo?: "long" | "short"): Sugestao {
  const atual = ladoAtual(info);
  const adx = typeof info.adx === "number" ? info.adx : null;
  const rsi = typeof info.rsi === "number" ? info.rsi : null;
  const adxAntes = typeof info.adxAntes === "number" ? info.adxAntes : null;
  const longP = p.lado === "long";
  const oposto = longP ? "SHORT" : "LONG";
  const fraco = adx !== null && adx < FILTRO_ADX_MIN;
  const forte = adx !== null && adx >= ADX_REF;
  const esticado = rsi !== null && (longP ? rsi > FILTRO_RSI_MAX - 10 : rsi < FILTRO_RSI_MIN + 10);
  const perdendoForca = !fraco && adx !== null && adxAntes !== null && (adx - adxAntes) <= -3;
  const lucroGrande = p.pnl > 0 && p.pnlPct >= 15;
  const forca = [adx !== null ? `ADX ${adx.toFixed(0)}` : "", rsi !== null ? `RSI ${rsi.toFixed(0)}` : ""].filter(Boolean).join(", ");
  const stopTxt = p.pnl > 0 ? "suba o stop para o preço de entrada" : "mantenha o stop original e não aumente a posição";
  if (atual === p.lado) {
    if (esticado) return { emoji: "🟠", titulo: "A favor, mas esticado", contra: false, dica: `${forca}. Risco de correção: realize uma parte e proteja o resto com stop.` };
    if (fraco) return { emoji: "🟠", titulo: "A favor, mas sem força", contra: false, dica: `${forca} (mínimo do filtro: ${FILTRO_ADX_MIN}). Os filtros não abririam essa entrada agora: ${p.pnl > 0 ? "realize tudo ou boa parte" : "aperte o stop"}.` };
    if (perdendoForca) return { emoji: "🟡", titulo: "A favor, mas perdendo força", contra: false, dica: `ADX caiu de ${adxAntes!.toFixed(0)} para ${adx!.toFixed(0)} na última ~1h${rsi !== null ? `, RSI ${rsi.toFixed(0)}` : ""}. Momentum esfriando${lucroGrande ? `, e você já tem ${sgn(p.pnlPct, 1)}% de lucro` : ""}: bom momento para realizar parte ou subir o stop antes que caia abaixo de ${FILTRO_ADX_MIN}.` };
    if (forte) return { emoji: "🟢", titulo: "Dentro do movimento, pode manter", contra: false, dica: `${forca}. Tendência forte a favor: deixe correr e ${stopTxt}.` };
    return { emoji: "🟢", titulo: "A favor, força moderada", contra: false, dica: `${forca ? forca + ". " : ""}Mantenha com stop curto; se o ADX cair abaixo de ${FILTRO_ADX_MIN}, realize.` };
  }
  if (atual !== null) {
    if (!fraco) return { emoji: "🔴", titulo: "Linha virou CONTRA a posição", contra: true, dica: `Sinal ${oposto} válido pelos filtros${forca ? " (" + forca + ")" : ""}. Proteja: feche ou reduza; se mantiver, stop curto obrigatório${p.pnl < 0 ? " e nada de aumentar/médio" : ""}.` };
    return { emoji: "🟡", titulo: "Virou contra, mas sem força", contra: true, dica: `${forca} — pode ser ruído. Aperte o stop e espere confirmação em vez de fechar na hora.` };
  }
  if (alvo && alvo === p.lado) return { emoji: "🎯", titulo: "Chegando na linha do seu lado", contra: false, dica: `Se cruzar, reforça o movimento a favor. Mantenha o stop${forca ? ". " + forca : ""}.` };
  if (alvo && alvo !== p.lado) return { emoji: "🟠", titulo: "Chegando na linha OPOSTA à posição", contra: false, dica: `Se cruzar (${oposto}), vira contra você. Considere realizar parte ou apertar o stop antes${forca ? ". " + forca : ""}.` };
  return { emoji: "🟡", titulo: "Preço dentro das linhas, sem sinal", contra: false, dica: `Fica contra a posição se passar de ${fmtPrice(longP ? info.fundo : info.topo)}. Mantenha o stop.` };
}
const STOP_ATR_RESERVA = Number(Deno.env.get("STOP_ATR_RESERVA") || "2");
function stopAlvoPosTxt(p: Pos, inf: { topo: number; fundo: number; atr?: number }): string {
  const atr = typeof inf.atr === "number" ? inf.atr : 0;
  if (!(atr > 0) || !(p.entrada > 0)) return "";
  const longP = p.lado === "long";
  let sa = calcStopAlvo(p.lado, p.entrada, inf.topo, inf.fundo, atr);
  let porAtr = false;
  if (!sa) {
    porAtr = true;
    const risco = atr * STOP_ATR_RESERVA;
    const stop = longP ? p.entrada - risco : p.entrada + risco;
    if (!(stop > 0) || !(risco > 0)) return "";
    const alvo = longP ? p.entrada + risco * ALVO_RR : p.entrada - risco * ALVO_RR;
    sa = { stop, alvo, riscoPct: (risco / p.entrada) * 100, retornoPct: ((risco * ALVO_RR) / p.entrada) * 100 };
  }
  if (p.mark > 0 && (longP ? p.mark <= sa.stop : p.mark >= sa.stop)) {
    return `⚠️ Preço atual já passou do stop calculado pela sua entrada (${fmtPrice(sa.stop)}): não serve mais de referência, aperte o stop perto do preço.\n`;
  }
  const mg = (pct: number) => (p.lev > 0 ? ` / ${(pct * p.lev).toFixed(0)}% da margem` : "");
  const batido = p.mark > 0 && (longP ? p.mark >= sa.alvo : p.mark <= sa.alvo);
  const rot = porAtr ? `Pela sua entrada (linha já do outro lado; stop de reserva ${STOP_ATR_RESERVA}×ATR)` : "Pela sua entrada";
  return `🎯 ${rot}: stop ${fmtPrice(sa.stop)} (-${sa.riscoPct.toFixed(2)}%${mg(sa.riscoPct)}) | alvo ${fmtPrice(sa.alvo)} (+${sa.retornoPct.toFixed(2)}%${mg(sa.retornoPct)}, RR ${ALVO_RR}:1)${batido ? " — alvo já atingido, considere realizar/subir o stop" : ""}\n`;
}
async function blocoPosicao(ps: Pos[], info: IndicadorInfo, alvo?: "long" | "short"): Promise<string> {
  if (!ps.length) return "";
  let inf: any = info;
  if (typeof inf.adx !== "number") inf = (await calcIndicadorFiltro(info.instId).catch(() => null)) ?? info;
  let out = `\n\n${DIVISOR}`;
  for (const p of ps) {
    const s = sugestaoPosicao(p, inf, alvo);
    out += `\n📌 <b>Você já está ${p.lado === "long" ? "LONG" : "SHORT"}</b> — entrada ${fmtPrice(p.entrada)} | PnL ${sgn(p.pnl)} USDT (${sgn(p.pnlPct, 1)}% da margem)\n${s.emoji} <b>${s.titulo}</b>\n${s.dica}\n` + (trailingTxt(p, typeof inf.atr === "number" ? inf.atr : 0) || stopAlvoPosTxt(p, inf));
  }
  return out + `<i>Sugestão automática (Indicador + ADX + RSI), não é ordem.</i>`;
}
const POS_ROW = "_POS_";
async function checarPosicoes(SB: any, posMap: Map<string, Pos[] | null>) {
  await Promise.all([...posMap].map(async ([chat, lista]) => {
    if (silChat(chat)) return;
    try { await checarPosicoesChat(SB, chat, lista); } catch (e) { console.log(`❌ erro posições chat ${chat}`, e); }
  }));
}
async function checarPosicoesChat(SB: any, chat: string, posList: Pos[] | null) {
  if (!posList) return;
  const POS_ROW_CHAT = `${POS_ROW}${chat}`;
  const atual: Record<string, { e: number; p: number }> = {};
  for (const p of posList) atual[`${p.instId}|${p.lado}`] = { e: p.entrada, p: p.pnl };
  const { data: row } = await SB.from(TAB).select("last_status").eq("instid", POS_ROW_CHAT).maybeSingle();
  let antes: Record<string, { e: number; p: number }> | null = null;
  if (row?.last_status) { try { antes = JSON.parse(row.last_status); } catch { antes = null; } }
  if (antes) {
    for (const k of Object.keys(atual)) {
      if (antes[k]) continue;
      const p = posList.find((x) => `${x.instId}|${x.lado}` === k)!;
      const info = await calcIndicadorFiltro(p.instId).catch(() => null);
      const msg = `🟢 <b>${p.instId}</b> — posição ABERTA (${p.lado === "long" ? "LONG" : "SHORT"})\n${DIVISOR}\n\nentrada ${fmtPrice(p.entrada)}${p.lev ? ` | ${p.lev}x` : ""}` + (info ? await blocoPosicao([p], info) : "");
      await enviarAlertaMoeda(SB, chat, p.instId, cortar(msg), botaoAnalisar(p.instId));
    }
    for (const k of Object.keys(antes)) {
      if (atual[k]) continue;
      const [inst, lado] = k.split("|");
      const msg = `⚪ <b>${inst}</b> — posição FECHADA (${lado === "long" ? "LONG" : "SHORT"})\n${DIVISOR}\n\nÚltimo PnL aberto visto: ${sgn(antes[k].p)} USDT (estimativa; o resultado real está no /robo).`;
      await enviarAlertaMoeda(SB, chat, inst, msg, botaoAnalisar(inst));
    }
  }
  await upsertLinha(SB, POS_ROW_CHAT, { last_status: JSON.stringify(atual), last_alert_at: new Date().toISOString() });
}

const PROT_LUCRO_ON = (Deno.env.get("PROT_LUCRO") || "1") !== "0";
const TRAIL_ATR_MULT = Number(Deno.env.get("TRAIL_ATR_MULT") || "2");
const ESTICADO_RSI = Number(Deno.env.get("ESTICADO_RSI") || "80");
const ESTICADO_FOLGA_RSI = 8;
type Trail = { n: number; stop: number; travaPct: number; ganhoPct: number };
function calcTrailing(p: Pos, atr: number): Trail | null {
  if (!(atr > 0) || !(TRAIL_ATR_MULT > 0) || !(p.entrada > 0) || !(p.mark > 0)) return null;
  const R = atr * TRAIL_ATR_MULT;
  const longP = p.lado === "long";
  const ganho = longP ? p.mark - p.entrada : p.entrada - p.mark;
  if (!(ganho >= R)) return null;
  const n = Math.floor(ganho / R);
  const trava = (n - 1) * R;
  return { n, stop: longP ? p.entrada + trava : p.entrada - trava, travaPct: (trava / p.entrada) * 100, ganhoPct: (ganho / p.entrada) * 100 };
}
function trailingTxt(p: Pos, atr: number): string {
  const t = calcTrailing(p, atr);
  if (!t) return "";
  const mg = p.lev > 0 && t.travaPct > 0 ? ` (+${(t.travaPct * p.lev).toFixed(0)}% da margem)` : "";
  return t.n === 1
    ? `🔒 Trailing: o trade já andou ${TRAIL_ATR_MULT}×ATR a seu favor (+${t.ganhoPct.toFixed(2)}%). Suba o stop para o preço de entrada (${fmtPrice(t.stop)}) e não deixe o lucro virar prejuízo.\n`
    : `🔒 Trailing: suba o stop para ${fmtPrice(t.stop)} — trava +${t.travaPct.toFixed(2)}% de ganho${mg} — o preço já andou +${t.ganhoPct.toFixed(2)}%.\n`;
}
const _infoPosCache = new Map<string, { t: number; v: InfoFiltravel | null }>();
async function infoPosCache(instId: string): Promise<InfoFiltravel | null> {
  const c = _infoPosCache.get(instId);
  if (c && Date.now() - c.t < 60000) return c.v;
  const v = await calcIndicadorFiltro(instId).catch(() => null);
  _infoPosCache.set(instId, { t: Date.now(), v });
  return v;
}
async function lerJsonLinha(SB: any, instid: string): Promise<Record<string, number>> {
  try {
    const { data } = await SB.from(TAB).select("last_status").eq("instid", instid).maybeSingle();
    const j = JSON.parse(data?.last_status || "{}");
    return j && typeof j === "object" ? j : {};
  } catch { return {}; }
}
async function checarProtecaoLucro(SB: any, posMap: Map<string, Pos[] | null>) {
  if (!PROT_LUCRO_ON) return;
  await Promise.all([...posMap].map(async ([chat, lista]) => {
    if (!lista || !lista.length) return;
    if (silChat(chat) && !SILENCIO_PROTECAO) return;
    try {
      const linhaT = `_TRAIL_${chat}`, linhaE = `_ESTICA_${chat}`;
      const [prevT, prevE] = await Promise.all([lerJsonLinha(SB, linhaT), lerJsonLinha(SB, linhaE)]);
      const novoT: Record<string, number> = {}, novoE: Record<string, number> = {};
      for (const p of lista) {
        const k = `${p.instId}|${p.lado}`;
        if (prevT[k] !== undefined) novoT[k] = prevT[k];
        if (prevE[k] !== undefined) novoE[k] = prevE[k];
        if (!(p.pnl > 0)) continue;
        const info = await infoPosCache(p.instId);
        if (!info) continue;
        const ladoTxt = p.lado === "long" ? "LONG" : "SHORT";
        const cab = `entrada ${fmtPrice(p.entrada)} | agora ${fmtPrice(p.mark)} | PnL ${sgn(p.pnl)} USDT (${sgn(p.pnlPct, 1)}% da margem)`;
        const tr = calcTrailing(p, info.atr);
        if (tr && tr.n > (prevT[k] ?? 0)) {
          const msg = `🔒 <b>${p.instId}</b> ${ladoTxt} — hora de subir o stop\n${DIVISOR}\n\n${cab}\n\n${trailingTxt(p, info.atr)}\n<i>Sugestão automática (ATR ${TRAIL_ATR_MULT}×), não é ordem. Só avisa de novo no próximo degrau.</i>`;
          const id = await enviarAlertaMoeda(SB, chat, `TRAIL_${p.instId}`, cortar(msg), botaoAnalisar(p.instId));
          if (id) novoT[k] = tr.n;
        }
        const longP = p.lado === "long";
        const lim = longP ? ESTICADO_RSI : 100 - ESTICADO_RSI;
        const esticada = longP ? info.rsi >= lim : info.rsi <= lim;
        const voltou = longP ? info.rsi < lim - ESTICADO_FOLGA_RSI : info.rsi > lim + ESTICADO_FOLGA_RSI;
        if (esticada && novoE[k] === undefined) {
          const msg = `🌡️ <b>${p.instId}</b> ${ladoTxt} — movimento esticado (RSI ${info.rsi.toFixed(0)})\n${DIVISOR}\n\n${cab}\n\n` +
            `Você está no lucro e o preço está esticado: risco de correção. Considere realizar uma parte (por exemplo 30–50%) e proteger o resto com stop.\n` +
            trailingTxt(p, info.atr) + `\n<i>Sugestão automática (RSI 15m ${longP ? "≥" : "≤"} ${lim}), não é ordem. Avisa uma vez por esticada.</i>`;
          const id = await enviarAlertaMoeda(SB, chat, `ESTICADA_${p.instId}`, cortar(msg), botaoAnalisar(p.instId));
          if (id) novoE[k] = Date.now();
        } else if (voltou) delete novoE[k];
      }
      await upsertLinha(SB, linhaT, { last_status: JSON.stringify(novoT) });
      await upsertLinha(SB, linhaE, { last_status: JSON.stringify(novoE) });
    } catch (e) { console.log(`❌ erro proteção de lucro chat ${chat}`, e); }
  }));
}
const FRACO_POS_ON = (Deno.env.get("FRACO_POS") || "1") !== "0";
const FRACO_COOLDOWN_MIN = Number(Deno.env.get("FRACO_COOLDOWN_MIN") || "45");
function nivelEnfraquece(s: Sugestao): 0 | 1 | 2 {
  if (s.titulo.startsWith("Linha virou CONTRA")) return 2;
  if (s.contra || /sem força|perdendo força|OPOSTA/.test(s.titulo)) return 1;
  return 0;
}
async function checarEnfraquecimento(SB: any, posMap: Map<string, Pos[] | null>) {
  if (!FRACO_POS_ON) return;
  await Promise.all([...posMap].map(async ([chat, lista]) => {
    if (!lista || !lista.length) return;
    if (silChat(chat) && !SILENCIO_PROTECAO) return;
    try {
      const linha = `_FRACO_${chat}`;
      const prev = (await lerJsonLinha(SB, linha)) as Record<string, any>;
      const novo: Record<string, { n: number; t: number }> = {};
      const agora = Date.now();
      for (const p of lista) {
        const k = `${p.instId}|${p.lado}`;
        const ant = prev[k] && typeof prev[k] === "object" ? (prev[k] as { n: number; t: number }) : null;
        const info = await infoPosCache(p.instId);
        if (!info) { if (ant) novo[k] = ant; continue; }
        const sug = sugestaoPosicao(p, info);
        const n = nivelEnfraquece(sug);
        const prevN = ant?.n ?? 0, prevT = ant?.t ?? 0;
        let salvo = ant ?? { n: 0, t: 0 };
        if (n === 0) {
          if (prevN !== 0) salvo = { n: 0, t: agora };
        } else if (n > prevN || (prevN === 0 && agora - prevT >= FRACO_COOLDOWN_MIN * 60000)) {
          const ladoTxt = p.lado === "long" ? "LONG" : "SHORT";
          const cab = `entrada ${fmtPrice(p.entrada)} | agora ${fmtPrice(p.mark)} | PnL ${sgn(p.pnl)} USDT (${sgn(p.pnlPct, 1)}% da margem)`;
          const msg = `${sug.emoji} <b>${p.instId}</b> ${ladoTxt} — ${sug.titulo}\n${DIVISOR}\n\n${cab}\n\n${sug.dica}\n` +
            (p.pnl > 0 ? trailingTxt(p, info.atr) : "") +
            `\n<i>Aviso automático: o sinal desta moeda enfraqueceu com a posição aberta. Sugestão, não é ordem.</i>`;
          const id = await enviarAlertaMoeda(SB, chat, `FRACO_${p.instId}`, cortar(msg), botaoAnalisar(p.instId));
          if (id) salvo = { n, t: agora };
        } else if (n < prevN) {
          salvo = { n, t: prevT };
        }
        novo[k] = salvo;
      }
      await upsertLinha(SB, linha, { last_status: JSON.stringify(novo) });
    } catch (e) { console.log(`❌ erro enfraquecimento chat ${chat}`, e); }
  }));
}
const FONTE_FALLBACK_PCT = Number(Deno.env.get("FONTE_FALLBACK_PCT") || "30");
const FONTE_MIN_CHAMADAS = 10;
async function avisarFonteDados(SB: any) {
  const blofin = _fonte["BloFin"] ?? 0, falhas = _fonte["FALHA"] ?? 0;
  const alt = Object.entries(_fonte).filter(([k]) => k !== "BloFin" && k !== "FALHA");
  const fb = alt.reduce((n, [, v]) => n + v, 0);
  const total = blofin + fb + falhas;
  if (total < FONTE_MIN_CHAMADAS) return;
  const pctRuim = ((fb + falhas) / total) * 100;
  const degradado = pctRuim >= FONTE_FALLBACK_PCT;
  const nomes = alt.sort((a, b) => b[1] - a[1]).map(([k]) => k).join("/") || "outra fonte";
  let prev: { e?: string; t?: number } = {};
  try {
    const { data } = await SB.from(TAB).select("last_status").eq("instid", "_FONTE_").maybeSingle();
    prev = JSON.parse(data?.last_status || "{}") || {};
  } catch { prev = {}; }
  const estavaDeg = prev.e === "deg";
  const transicao = degradado !== estavaDeg;
  const ativos = ALERT_CHAT_IDS.filter((ch) => !silChat(ch));
  if (transicao && !ativos.length) return;
  if (transicao) {
    const msg = degradado
      ? `📡 <b>Dados de mercado em modo reserva</b>\n${DIVISOR}\n\nA BloFin não respondeu direito neste ciclo: <b>${pctRuim.toFixed(0)}%</b> das consultas vieram de ${nomes}${falhas ? ` ou falharam (${falhas})` : ""} (${fb + falhas} de ${total}).\n⚠️ Preços e velas dessas fontes podem diferir um pouco da BloFin, onde você opera. Confira o preço na corretora antes de entrar.\n<i>Aviso único: você recebe outro quando normalizar.</i>`
      : `📡 <b>Dados de mercado normalizados</b> — voltaram a vir da BloFin.`;
    for (const ch of ativos) await sendTelegram(ch, msg);
    console.log(`📡 fonte de dados: ${degradado ? "DEGRADADA" : "normalizada"} (${pctRuim.toFixed(0)}% fora da BloFin, ${total} consultas)`);
  }
  await upsertLinha(SB, "_FONTE_", { last_status: JSON.stringify({ e: degradado ? "deg" : "ok", t: transicao ? Date.now() : (prev.t ?? Date.now()), p: Math.round(pctRuim), f: nomes }), last_alert_at: new Date().toISOString() });
}

const RISCO_ON = (Deno.env.get("RISCO") || "1") !== "0";
const RISCO_LIQ_PCT = Number(Deno.env.get("RISCO_LIQ_PCT") || "8");
const RISCO_LIQ_CRITICO_PCT = Number(Deno.env.get("RISCO_LIQ_CRITICO_PCT") || "3");
const RISCO_PERDA_PCT = Number(Deno.env.get("RISCO_PERDA_PCT") || "30");
const RISCO_PERDA_CRITICA_PCT = Number(Deno.env.get("RISCO_PERDA_CRITICA_PCT") || "60");
const RISCO_COOLDOWN_MIN = Number(Deno.env.get("RISCO_COOLDOWN_MIN") || "120");
function distLiqPct(p: Pos): number | null {
  if (!(p.liq > 0) || !(p.mark > 0)) return null;
  return (p.lado === "long" ? (p.mark - p.liq) : (p.liq - p.mark)) / p.mark * 100;
}
function nivelRisco(p: Pos): { nivel: 0 | 1 | 2; linhas: string[] } {
  let nivel: 0 | 1 | 2 = 0;
  const linhas: string[] = [];
  const d = distLiqPct(p);
  if (d !== null && d <= RISCO_LIQ_PCT) {
    nivel = Math.max(nivel, d <= RISCO_LIQ_CRITICO_PCT ? 2 : 1) as 0 | 1 | 2;
    linhas.push(`• Liquidação a <b>${d.toFixed(1)}%</b> do preço (liq ${fmtPrice(p.liq)} | agora ${fmtPrice(p.mark)})`);
  }
  const perda = -p.pnlPct;
  if (perda >= RISCO_PERDA_PCT) {
    nivel = Math.max(nivel, perda >= RISCO_PERDA_CRITICA_PCT ? 2 : 1) as 0 | 1 | 2;
    linhas.push(`• Prejuízo de <b>${perda.toFixed(0)}%</b> da margem (${sgn(p.pnl)} USDT)`);
  }
  return { nivel, linhas };
}
async function checarRisco(SB: any, posMap: Map<string, Pos[] | null>) {
  if (!RISCO_ON) return;
  await Promise.all([...posMap].map(async ([chat, lista]) => {
    if (!lista || (silChat(chat) && !SILENCIO_PROTECAO)) return;
    try {
      const linhaId = `_RISCO_${chat}`;
      const { data: row } = await SB.from(TAB).select("last_status").eq("instid", linhaId).maybeSingle();
      let ant: Record<string, { n: number; t: number }> = {};
      try { ant = JSON.parse(row?.last_status || "{}") || {}; } catch { ant = {}; }
      const novo: Record<string, { n: number; t: number }> = {};
      for (const p of lista) {
        const k = `${p.instId}|${p.lado}`;
        const { nivel, linhas } = nivelRisco(p);
        if (nivel === 0) continue;
        const prev = ant[k];
        const reenviar = !prev || nivel > prev.n || Date.now() - prev.t >= RISCO_COOLDOWN_MIN * 60000;
        if (!reenviar) { novo[k] = prev; continue; }
        const info = await calcIndicadorFiltro(p.instId).catch(() => null);
        const msg = `🚨 <b>RISCO — ${p.instId}</b> ${p.lado === "long" ? "LONG" : "SHORT"}${p.lev ? ` ${p.lev}x` : ""} — ${nivel === 2 ? "🔴 CRÍTICO" : "🟠 atenção"}\n${DIVISOR}\n\n${linhas.join("\n")}\n\n` +
          (nivel === 2 ? "Reduza a posição ou adicione margem agora; não aumente a posição." : "Revise o stop e evite aumentar a posição.") +
          (info ? await blocoPosicao([p], info) : "");
        const id = await enviarAlertaMoeda(SB, chat, `RISCO_${p.instId}`, cortar(msg), botaoAnalisar(p.instId));
        novo[k] = id ? { n: nivel, t: Date.now() } : (prev ?? { n: 0, t: 0 });
      }
      await upsertLinha(SB, linhaId, { last_status: JSON.stringify(novo) });
    } catch (e) { console.log(`❌ erro risco chat ${chat}`, e); }
  }));
}

async function buscarFills(cred: Cred, desdeMs: number, maxPag = 12): Promise<{ fills: any[]; cortado: boolean }> {
  const out: any[] = [];
  let apos = "", cortado = false;
  for (let p = 0; p < maxPag; p++) {
    const lote = await blofinPrivado(`/api/v1/trade/fills-history?begin=${desdeMs}&end=${Date.now()}&limit=100${apos ? `&after=${apos}` : ""}`, cred);
    out.push(...lote);
    if (lote.length < 100) break;
    apos = String(lote[lote.length - 1].tradeId ?? "");
    if (!apos) break;
    if (p === maxPag - 1) cortado = true;
  }
  return { fills: out, cortado };
}
const MEUPLACAR_ANTES_MIN = 15;
const MEUPLACAR_DEPOIS_H = 6;
async function runMeuPlacar(chatId: number | string, dias: number) {
  const cred = credDe(chatId);
  if (!cred) { await sendTelegram(chatId, `🧾 <b>/meuplacar</b> precisa da sua chave BloFin (só leitura) ligada a este chat.\nSeu chat_id: <b>${chatId}</b>`); return; }
  const SB = getSupabase();
  if (!SB) { await sendTelegram(chatId, "⚠️ Supabase não configurado."); return; }
  const desdeMs = Date.now() - dias * 86400000;
  let fills: any[] = [], cortado = false;
  try { ({ fills, cortado } = await buscarFills(cred, desdeMs)); }
  catch (e) { await sendTelegram(chatId, `⚠️ Não consegui ler seus trades: ${String((e as Error).message || e).replace(/[<>&]/g, "").slice(0, 160)}`); return; }
  const { data, error } = await SB.from(PLACAR_TABELA).select("*").gt("criado_em", new Date(desdeMs).toISOString()).order("criado_em", { ascending: true }).limit(2000);
  if (error) { await sendTelegram(chatId, `⚠️ Não consegui ler os alertas: ${String(error.message || error).replace(/[<>&]/g, "").slice(0, 160)}`); return; }
  const alertas = ((data || []) as any[]).filter((r) => !ehFinalLog(r));
  const aberturas = fills.filter((f) => numOr0(f.fillPnl) === 0).map((f) => ({
    inst: String(f.instId), ts: numOr0(f.ts),
    dir: (f.positionSide === "long" || f.positionSide === "short") ? f.positionSide as string : (f.side === "buy" ? "long" : "short"),
  }));
  const seguidos: any[] = [], ignorados: any[] = [];
  let contra = 0;
  const instSeguidas = new Set<string>();
  for (const a of alertas) {
    const t = new Date(a.criado_em).getTime();
    const jan = aberturas.filter((x) => x.inst === a.instid && x.ts >= t - MEUPLACAR_ANTES_MIN * 60000 && x.ts <= t + MEUPLACAR_DEPOIS_H * 3600000);
    if (jan.some((x) => x.dir === a.lado)) { seguidos.push(a); instSeguidas.add(String(a.instid)); }
    else { ignorados.push(a); if (jan.length) contra++; }
  }
  const fech = fills.filter((f) => numOr0(f.fillPnl) !== 0);
  const soma = (l: any[]) => l.reduce((s, f) => s + numOr0(f.fillPnl), 0);
  const fSeg = fech.filter((f) => instSeguidas.has(String(f.instId)));
  const fOut = fech.filter((f) => !instSeguidas.has(String(f.instId)));
  const gp = (l: any[]) => `${l.filter((f) => numOr0(f.fillPnl) > 0).length} ganho(s) × ${l.filter((f) => numOr0(f.fillPnl) < 0).length} perda(s)`;
  let msg = `🧾 <b>MEU PLACAR</b> — últimos ${dias} dia(s)\n${DIVISOR}\n\n`;
  msg += `🔔 ${alertas.length} alerta(s) do bot no período\n✅ Você entrou em ${seguidos.length}\n⏭️ Não entrou em ${ignorados.length - contra}\n↔️ Entrou contra o lado do alerta em ${contra}\n\n`;
  msg += `💰 <b>Resultado realizado</b>: ${sgn(soma(fech))} USDT (${gp(fech)})\n`;
  msg += `• Moedas em que você seguiu um alerta: ${sgn(soma(fSeg))} USDT (${gp(fSeg)})\n`;
  msg += `• Outras moedas: ${sgn(soma(fOut))} USDT (${gp(fOut)})\n\n`;
  msg += `🤖 <b>O que o bot registrou nesses alertas</b>\n`;
  msg += `Seguidos: ${seguidos.length ? linhaStats(seguidos) : "—"}\nNão seguidos: ${ignorados.length ? linhaStats(ignorados) : "—"}\n\n`;
  msg += `<i>Aproximação: conta como "seguiu" uma abertura na mesma moeda e lado entre ${MEUPLACAR_ANTES_MIN} min antes e ${MEUPLACAR_DEPOIS_H}h depois do alerta. Sem taxas e funding. O resultado por moeda soma todos os trades naquela moeda no período.</i>`;
  if (cortado) msg += `\n<i>(limite de execuções lidas atingido; use menos dias)</i>`;
  await sendTelegram(chatId, cortar(msg));
}

let _pausas = new Map<string, number>();
async function carregarPausas(SB: any) {
  const { data } = await SB.from(TAB).select("instid, last_status").like("instid", "_PAUSA_%");
  const m = new Map<string, number>();
  for (const r of (data || []) as any[]) {
    const n = Number(r.last_status);
    if (n > Date.now()) m.set(String(r.instid).slice("_PAUSA_".length), n);
  }
  _pausas = m;
}
function silChat(ch: string | number): boolean {
  return emSilencio() || (_pausas.get(String(ch)) ?? 0) > Date.now();
}
const horaLocal = (ms: number) => new Date(ms + X_TZ_OFFSET_H * 3600000).toISOString().slice(11, 16);
async function heartbeat(SB: any, txt: string) {
  try { await upsertLinha(SB, "_CRON_", { last_status: txt, last_alert_at: new Date().toISOString() }); } catch { }
}
const CRON_AVISO_MIN = Number(Deno.env.get("CRON_AVISO_MIN") || "20");
async function avisarCronParado(SB: any) {
  try {
    const { data: r } = await SB.from(TAB).select("last_alert_at").eq("instid", "_CRON_").maybeSingle();
    if (!r?.last_alert_at) return;
    const min = Math.round((Date.now() - new Date(r.last_alert_at).getTime()) / 60000);
    if (min <= CRON_AVISO_MIN) return;
    const msg = `⚠️ <b>Cron estava parado</b> — ficou ~${min} min sem rodar, voltando agora.\n<i>Nesse período os alertas automáticos e a proteção de posições não rodaram.</i>`;
    await Promise.all(ALERT_CHAT_IDS.map((ch) => sendTelegram(ch, msg)));
    console.log(`⚠️ cron tinha parado por ${min} min - aviso enviado`);
  } catch (e) { console.log("⚠️ erro checando cron parado", e); }
}
function botaoSeguida(instId: string): Botoes {
  const s = instId.replace("-USDT", "").toLowerCase();
  return [[{ text: `🔎 Analisar ${s.toUpperCase()}`, callback_data: `/analise ${s}` }, { text: "❌ Parar de seguir", callback_data: `/parar ${s}` }]];
}
async function runPausar(chatId: number | string, arg: string) {
  const SB = getSupabase();
  if (!SB) { await sendTelegram(chatId, "⚠️ Supabase não configurado."); return; }
  const id = `_PAUSA_${chatId}`;
  const protecao = SILENCIO_PROTECAO ? "Continuam chegando os avisos de risco e de proteção das suas posições abertas.\n" : "";
  if (arg === "0") {
    await upsertLinha(SB, id, { last_status: "0" });
    _pausas.delete(String(chatId));
    await sendTelegram(chatId, "▶️ <b>Alertas retomados.</b>");
    return;
  }
  if (arg === "") {
    const { data } = await SB.from(TAB).select("last_status").eq("instid", id).maybeSingle();
    const ate = Number(data?.last_status);
    const estado = ate > Date.now() ? `⏸ Pausado até <b>${horaLocal(ate)}</b>.\n\n` : "";
    await sendTelegram(chatId, `${estado}⏸ <b>Pausar alertas</b> por quanto tempo?\n(O silêncio das ${SILENCIO_INI_H}h às ${SILENCIO_FIM_H}h continua funcionando sozinho.)`,
      [[{ text: "⏸ 1h", callback_data: "/pausar 1" }, { text: "⏸ 2h", callback_data: "/pausar 2" }, { text: "⏸ 3h", callback_data: "/pausar 3" }], [{ text: "▶️ Retomar", callback_data: "/retomar" }]]);
    return;
  }
  const n = Number(arg.replace(/[^\d.,]/g, "").replace(",", "."));
  const h = Math.min(3, Math.max(1, Math.round(isFinite(n) && n > 0 ? n : 1)));
  const ate = Date.now() + h * 3600000;
  await upsertLinha(SB, id, { last_status: String(ate) });
  _pausas.set(String(chatId), ate);
  await sendTelegram(chatId, `⏸ <b>Alertas pausados por ${h}h</b> (até ${horaLocal(ate)}).\n${protecao}Para voltar antes: /retomar.`);
}
const CRON_ALERTA_MIN = Number(Deno.env.get("CRON_ALERTA_MIN") || "15");
async function runStatus(chatId: number | string) {
  const SB = getSupabase();
  const teste = async (nome: string, fn: () => Promise<void>) => {
    const t0 = Date.now();
    try { await fn(); return `✅ ${nome} (${Date.now() - t0} ms)`; }
    catch (e) { return `❌ ${nome}: ${String((e as Error).message || e).replace(/[<>&]/g, "").slice(0, 100)}`; }
  };
  const cred = credDe(chatId);
  const testes = await Promise.all([
    teste("Supabase", async () => { if (!SB) throw new Error("não configurado"); const { error } = await SB.from(TAB).select("instid").limit(1); if (error) throw new Error(error.message); }),
    teste("Tabela do placar", async () => { if (!SB) throw new Error("sem Supabase"); const { error } = await SB.from(PLACAR_TABELA).select("id").limit(1); if (error) throw new Error(error.message); }),
    teste("Dados de mercado", async () => { const c = await getCandles("BTC-USDT", TIMEFRAME); if (!c || c.length < 100) throw new Error("sem velas"); }),
    cred ? teste("Sua conta BloFin", async () => { await blofinPrivado("/api/v1/account/positions", cred); }) : Promise.resolve("➖ Conta BloFin: sem chave ligada a este chat"),
  ]);
  let cron = "❓ Cron: ainda sem registro";
  let pausa = "";
  let fonte = "";
  let nSeg = 0;
  if (SB) {
    const { data: r } = await SB.from(TAB).select("last_status, last_alert_at").eq("instid", "_CRON_").maybeSingle();
    if (r?.last_alert_at) {
      const min = Math.round((Date.now() - new Date(r.last_alert_at).getTime()) / 60000);
      cron = `${min > CRON_ALERTA_MIN ? "⚠️" : "✅"} Cron: último ciclo há ${min} min (${r.last_status || "?"})${min > CRON_ALERTA_MIN ? " — pode estar parado" : ""}`;
    }
    const { data: p } = await SB.from(TAB).select("last_status").eq("instid", `_PAUSA_${chatId}`).maybeSingle();
    const ate = Number(p?.last_status);
    if (ate > Date.now()) pausa = `⏸ Alertas pausados até ${horaLocal(ate)}\n`;
    nSeg = (await listarSeguidas(SB, chatId)).length;
    try {
      const { data: f } = await SB.from(TAB).select("last_status").eq("instid", "_FONTE_").maybeSingle();
      const fj = JSON.parse(f?.last_status || "{}");
      if (fj.e === "deg") fonte = `📡 ⚠️ Dados em modo reserva (${fj.f || "fallback"}, ${fj.p ?? "?"}% das consultas) desde ${horaLocal(Number(fj.t) || Date.now())}\n`;
      else if (fj.e === "ok") fonte = `📡 ✅ Dados de mercado vindo da BloFin\n`;
    } catch { }
  }
  const msg = `🩺 <b>STATUS</b>\n${DIVISOR}\n\n${testes.join("\n")}\n${cron}\n${fonte}\n` +
    pausa + (emSilencio() ? `🌙 Silêncio automático agora (${SILENCIO_INI_H}h–${SILENCIO_FIM_H}h)\n` : "") +
    `⭐ Seguidas: ${nSeg}/${SEG_MAX}\n` +
    `🔔 Este chat ${ALERT_CHAT_IDS.includes(String(chatId)) ? "recebe" : "NÃO recebe"} os alertas automáticos\n` +
    `🔑 Chave BloFin: ${cred ? "vinculada" : "não vinculada"}`;
  await sendTelegram(chatId, cortar(msg));
}
async function runRobo(chatId: number | string) {
  if (ALLOWED_CHAT_IDS.length === 0) {
    await sendTelegram(chatId, "🔒 O /robo mostra dados da sua conta, então só funciona com ALLOWED_CHAT_IDS configurado nos Secrets (seu chat_id aparece no /start).");
    return;
  }
  const cred = credDe(chatId);
  if (!cred) {
    await sendTelegram(chatId, `🤖 <b>/robo</b> não está configurado para este chat.\nSeu chat_id: <b>${chatId}</b>\nPeça ao administrador para cadastrar sua chave BloFin (só leitura) no Secret BLOFIN_USERS com esse chat_id.`);
    return;
  }
  const tzMs = X_TZ_OFFSET_H * 3600000;
  const inicioDia = Math.floor((Date.now() + tzMs) / 86400000) * 86400000 - tzMs;
  let posicoes: any[] | null = null, erroPos = "";
  try { posicoes = await blofinPrivado("/api/v1/account/positions", cred); } catch (e) { erroPos = String((e as Error).message || e); }
  let fills: any[] | null = [], erroFills = "";
  try {
    let apos = "";
    for (let p = 0; p < 5; p++) {
      const lote = await blofinPrivado(`/api/v1/trade/fills-history?begin=${inicioDia}&end=${Date.now()}&limit=100${apos ? `&after=${apos}` : ""}`, cred);
      fills!.push(...lote);
      if (lote.length < 100) break;
      apos = String(lote[lote.length - 1].tradeId ?? "");
      if (!apos) break;
    }
  } catch (e) { fills = null; erroFills = String((e as Error).message || e); }
  const esc = (s: string) => s.replace(/[<>&]/g, "").slice(0, 160);
  let msg = `🤖 <b>ROBÔ — BloFin</b>\n${DIVISOR}\n\n`;
  if (posicoes === null) msg += `⚠️ Não consegui ler as posições: ${esc(erroPos)}\n\n`;
  else if (!posicoes.length) msg += `📭 Nenhuma posição aberta.\n\n`;
  else {
    const ps = posicoes.filter((p) => numOr0(p.positions) !== 0)
      .sort((a, b) => numOr0(b.unrealizedPnl) - numOr0(a.unrealizedPnl));
    const total = ps.reduce((s, p) => s + numOr0(p.unrealizedPnl), 0);
    msg += `📌 <b>${ps.length} posição(ões) aberta(s)</b> — PnL aberto ${sgn(total)} USDT\n\n`;
    const infosRobo = await emLotes(ps.slice(0, 15).map((p) => String(p.instId)), 5, (i) => calcIndicadorFiltro(i).catch(() => null));
    for (const [idx, p] of ps.slice(0, 15).entries()) {
      const q = numOr0(p.positions);
      const lado = p.positionSide === "long" ? "LONG" : p.positionSide === "short" ? "SHORT" : (q > 0 ? "LONG" : "SHORT");
      const pnl = numOr0(p.unrealizedPnl);
      msg += `${pnl >= 0 ? "🟢" : "🔴"} <b>${String(p.instId).replace("-USDT", "")}</b> ${lado} ${numOr0(p.leverage) || ""}x ${p.marginMode === "cross" ? "cross" : "isolada"}\n` +
        `   entrada ${fmtPrice(numOr0(p.averagePrice))} → agora ${fmtPrice(numOr0(p.markPrice))}\n` +
        `   PnL ${sgn(pnl)} USDT (${sgn(numOr0(p.unrealizedPnlRatio) * 100, 1)}% da margem)` +
        (numOr0(p.liquidationPrice) > 0 ? ` | liq ${fmtPrice(numOr0(p.liquidationPrice))}` : "") + `\n`;
      const pp = paraPos(p), inf = infosRobo[idx];
      if (pp && inf) {
        const sug = sugestaoPosicao(pp, inf);
        msg += `   ${sug.emoji} <b>${sug.titulo}</b>${ps.length <= 5 ? `\n   ${sug.dica}` : ""}\n`;
        const trl = trailingTxt(pp, typeof inf.atr === "number" ? inf.atr : 0);
        if (trl) msg += `   ${trl}`;
      }
    }
    if (ps.length > 15) msg += `<i>(mostrando 15 de ${ps.length})</i>\n`;
    msg += `\n`;
  }
  if (fills === null) msg += `⚠️ Não consegui ler o resultado do dia: ${esc(erroFills)}\n`;
  else {
    const fech = fills.filter((f) => numOr0(f.fillPnl) !== 0);
    const soma = fech.reduce((s, f) => s + numOr0(f.fillPnl), 0);
    const ganhos = fech.filter((f) => numOr0(f.fillPnl) > 0).length;
    msg += `📅 <b>Hoje</b> (desde 00h, UTC${X_TZ_OFFSET_H >= 0 ? "+" : ""}${X_TZ_OFFSET_H})\n`;
    if (!fills.length) msg += `Nenhuma execução hoje.\n`;
    else msg += `${fills.length} execução(ões), ${fech.length} de fechamento\nResultado realizado: <b>${sgn(soma)} USDT</b>` +
      (fech.length ? ` | ${ganhos} ganho(s) × ${fech.length - ganhos} perda(s)` : "") + `\n`;
    if (fills.length >= 500) msg += `<i>(limite de 500 execuções lidas)</i>\n`;
  }
  msg += `\n<i>Só leitura. O resultado usa o fillPnl informado pela BloFin e pode não incluir taxas e funding. As sugestões usam Indicador + ADX + RSI e não são ordem de compra ou venda.</i>`;
  await sendTelegram(chatId, cortar(msg));
}
const ADMIN_CHAT_ID = String(Deno.env.get("ADMIN_CHAT_ID") || DONO_CHAT || "");
const ehAdmin = (chatId: number | string, remetente?: number | string | null) =>
  ADMIN_CHAT_ID !== "" && String(chatId) === ADMIN_CHAT_ID && String(remetente ?? chatId) === ADMIN_CHAT_ID;
function montarConfig(): string {
  const on = (b: boolean) => (b ? "ligado" : "desligado");
  const tz = `UTC${X_TZ_OFFSET_H >= 0 ? "+" : ""}${X_TZ_OFFSET_H}`;
  const adminFixo = !!Deno.env.get("ADMIN_CHAT_ID") || !!Deno.env.get("BLOFIN_OWNER_CHAT_ID");
  let m = `⚙️ <b>CONFIG</b> (valores em uso agora)\n${DIVISOR}\n\n`;
  m += `🔔 <b>Alertas</b>\n• oportunidade ≥ ${ALERT_OPORT_PCT_MIN}% · reversão ≥ ${ALERT_REV_PCT_MIN}% (24h)\n• cooldown ${ALERT_COOLDOWN_MIN} min · repetição idêntica ${ALERT_COOLDOWN_REPETIDO_MIN} min\n• fresco ≤ ${ALERT_FRESCO_CANDLES} velas · idade máx ${ALERT_IDADE_MAX_CANDLES || "sem limite"}\n• máx ${ALERT_MAX_POR_RODADA} por rodada · pool ${ALERT_POOL} · acompanhamento ${WATCH_HORAS}h\n• antecipação: ${ANTEC_ETA_MAX_CANDLES} velas (${ANTEC_ETA_MAX_CANDLES * TF_MIN} min), distância ≤ ${ANTEC_DIST_MAX_PCT}%\n\n`;
  m += `💸 <b>Taxa no placar</b>: ${TAXA_IDA_VOLTA_PCT.toFixed(3)}% ida e volta (taker ${TAXA_TAKER_PCT}% × 2; ajuste com TAXA_TAKER_PCT ou TAXA_IDA_VOLTA_PCT)\n`;
  m += `📏 <b>Placar</b>: entrada pelo fechamento da vela do cruzamento ${on(PLACAR_ENTRADA_ON && _placarTemEntrada)}${PLACAR_ENTRADA_ON && !_placarTemEntrada ? " (faltam as colunas: rode o ALTER TABLE V30)" : ""} · cruzamento vale até ${ENTRADA_MAX_CANDLES} velas (${ENTRADA_MAX_CANDLES * TF_MIN} min) depois do aviso\n\n`;
  m += `⏱ <b>V32 · alerta dos minutos finais</b> (${on(FINAL_ON)})\n• 🚨 janela: de ${FINAL_JANELA_MAX_MIN} a ${FINAL_JANELA_MIN_MIN} min antes do fechamento da vela ${TIMEFRAME} (cron a cada 1–2 min)\n• avisa se o preço já está ${FINAL_ENTRADA_PCT}%+ além da linha projetada · cancela só se recuar ${FINAL_CANCELA_PCT}% (ou ${FINAL_CANCELA_ATR}×ATR) pra dentro (histerese)\n• 🕒 PREPARE: de ${FINAL_PREPARE_MAX_MIN} a ${FINAL_JANELA_MAX_MIN} min antes, moeda a ≤ ${FINAL_PREPARE_DIST_PCT}% da linha e chegando (máx ${FINAL_PREPARE_MAX} por rodada, confiança mín. −${FINAL_PREPARE_FOLGA_CONF})\n• 🔜 se a vela fechar sem cruzar mas seguir a ≤ ${FINAL_PROXIMA_DIST_PCT}% da linha e chegando, avisa que a chance passa pra próxima vela\n• ⚡ janela forte de horário no fechamento · placar próprio no /placar (${on(FINAL_PLACAR_ON)})\n• pré-filtro ${FINAL_PREFILTRO_PCT}% da linha · máx ${FINAL_MAX_POR_RODADA} por rodada · confirma ✅/❌ no fechamento\n\n`;
  m += `🛡️ <b>V29</b>\n• filtro BTC: ${on(BTC_DIR_ON)} (±${BTC_DIR_PCT}%/h pontua) · SHORT de reversão barrado com BTC ≥ +${BTC_BLOQ_REV_PCT}%/h${BTC_BLOQ_REV_PCT > 0 ? "" : " (desligado)"}\n• webhook: ${WEBHOOK_SECRET ? "com secret_token ✅" : "SEM secret_token ⚠️"} · cron: ${CRON_SO_HEADER ? "só por header ✅" : "aceita segredo na URL ⚠️"}\n• anti-repetição salva no Supabase\n\n`;
  m += `🟢 <b>V28 · radar de fundo</b> (${on(FUNDO_ON)})\n• queda ≥ ${FUNDO_QUEDA_MIN}% em 24h · confiança ≥ ${FUNDO_CONF_MIN}/10 · pré-filtro ≥ ${FUNDO_PRE_MIN} pts (velas 15m)\n• cooldown ${FUNDO_COOLDOWN_MIN} min · máx ${FUNDO_MAX_POR_RODADA} por rodada · BTC ≤ -${FUNDO_BTC_QUEDA_PCT}%/h penaliza\n• LONG em moeda que caiu: ${FUNDO_LIBERA_LONG ? `liberado com sinal de fundo (confiança mín. ${CONF_MIN_FUNDO_LONG}/10)` : "bloqueado"}\n\n`;
  m += `🧭 <b>V26</b>\n• squeeze: faixa ≤ ${Math.round(SQUEEZE_REL * 100)}% da típica · volume das velas ≥ ${VOL_ACEL_RATIO}× (seco ≤ ${VOL_SECO_RATIO}×)\n• alarme falso: cancela se a distância até a linha crescer ${Math.round((ANTEC_CANCELA_RECUO - 1) * 100)}%+ ou passar de 2× o prazo\n• confiança: verde ≥ ${CONF_VERDE}/10 · amarelo ≥ ${CONF_AMARELO}/10\n• modo pump (${on(ESTRAT_PUMP)}): mín. confiança oportunidade ${CONF_MIN_OPORT} · reversão ${CONF_MIN_REVERSAO} · serrote ≥ ${SERROTE_MAX} trocas/4h barra · RSI máx LONG ${FILTRO_RSI_MAX_LONG} · limite ${LIMITE_LADO} por lado\n\n`;
  m += `🧹 <b>Filtros</b> (${on(ALERT_FILTROS_ON)})\n• volume ≥ ${(FILTRO_VOL_MIN_USDT / 1000).toFixed(0)}k USDT · ADX ≥ ${FILTRO_ADX_MIN}\n• RSI entre ${FILTRO_RSI_MIN} e ${FILTRO_RSI_MAX} · distância ≤ ${FILTRO_DIST_MAX_PCT}%\n\n`;
  m += `🎯 <b>Stop / alvo / trailing</b>\n• stop: faixa + ${STOP_ATR_MULT}×ATR · alvo RR ${ALVO_RR}:1\n• stop de reserva: ${STOP_ATR_RESERVA}×ATR\n• trailing (${on(PROT_LUCRO_ON)}): degrau de ${TRAIL_ATR_MULT}×ATR\n• RSI esticado: ≥ ${ESTICADO_RSI} (long) · ≤ ${100 - ESTICADO_RSI} (short)\n\n`;
  m += `🚨 <b>Risco</b> (${on(RISCO_ON)}): liquidação < ${RISCO_LIQ_PCT}% (crítico ${RISCO_LIQ_CRITICO_PCT}%) · prejuízo ≥ ${RISCO_PERDA_PCT}% (crítico ${RISCO_PERDA_CRITICA_PCT}%) · reenvio ${RISCO_COOLDOWN_MIN} min\n\n`;
  m += `🌙 <b>Silêncio</b> (${on(SILENCIO_ON)}): ${SILENCIO_INI_H}h–${SILENCIO_FIM_H}h, proteção ${on(SILENCIO_PROTECAO)} · fuso ${tz}\n`;
  m += `🗓️ <b>Resumos</b> (${on(RESUMO_ON)}): manhã ${RESUMO_MANHA_H}h · noite ${RESUMO_NOITE_H}h\n`;
  m += `⭐ seguidas: ${SEG_MAX} por pessoa\n`;
  m += `📡 Fallback de dados avisa a partir de ${FONTE_FALLBACK_PCT}% das consultas\n`;
  m += `⏱ Cron: aviso se parar > ${CRON_AVISO_MIN} min (/status alerta > ${CRON_ALERTA_MIN} min)\n\n`;
  m += `👥 <b>Acesso</b>: ${ALLOWED_CHAT_IDS.length} chat(s) autorizado(s) · ${ALERT_CHAT_IDS.length} recebem alertas${ALERT_EXCLUIR.length ? ` (${ALERT_EXCLUIR.length} excluído(s))` : ""} · ${Object.keys(BLOFIN_USERS).length + (BLOFIN_LEGADO ? 1 : 0)} com chave BloFin\n`;
  m += `🔑 Admin: <b>${ADMIN_CHAT_ID || "não definido"}</b>\n`;
  if (!adminFixo) m += `⚠️ <i>Admin vem do 1º ID de ALLOWED_CHAT_IDS. Fixe ADMIN_CHAT_ID nos Secrets para não mudar se você reordenar a lista.</i>\n`;
  m += `\n<i>Estes valores vêm dos Secrets: pra mudar, edite o Secret e publique de novo. Chaves e tokens nunca aparecem aqui.</i>`;
  return cortar(m);
}
Deno.serve(async (req) => {
  try {
    const urlObj = new URL(req.url);
    const cronQuery = urlObj.searchParams.get("cron_secret");
    const cronHeader = req.headers.get("x-cron-secret");
    const cronOk = !!CRON_SECRET && (
      (cronHeader !== null && igualSeguro(cronHeader, CRON_SECRET)) ||
      (!CRON_SO_HEADER && cronQuery !== null && igualSeguro(cronQuery, CRON_SECRET)));
    if (cronOk) {
      if (cronHeader === null) console.log("⚠️ cron chamado com o segredo na URL (aparece em log): passe pro header x-cron-secret e ligue CRON_SO_HEADER=1");
      const tarefa = runAlertaProativo().catch((e) => console.log("❌ erro alerta proativo", e));
      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
        EdgeRuntime.waitUntil(tarefa);
        return new Response("ok - alerta proativo iniciado");
      }
      await tarefa;
      return new Response("ok - alerta proativo executado");
    }
    if (req.method !== "POST") return new Response("ok");
    if (!TELEGRAM_TOKEN) { console.log("⚠️ TELEGRAM_BOT_TOKEN não configurado"); return new Response("ok"); }
    if (WEBHOOK_SECRET && !igualSeguro(req.headers.get("x-telegram-bot-api-secret-token") || "", WEBHOOK_SECRET)) {
      console.log("⛔ requisição sem secret_token válido do Telegram - ignorada");
      return new Response("forbidden", { status: 401 });
    }
    const update = await req.json().catch(() => ({} as any));
    const cq = update?.callback_query;
    const message = update?.message ?? cq?.message;
    const chatId = message?.chat?.id;
    const textoBruto = String(cq?.data ?? message?.text ?? "").trim().toLowerCase();
    const text = TECLADO_CMD[textoBruto] ?? textoBruto;
    if (!chatId) return new Response("ok");
    const remetente = cq?.from?.id ?? update?.message?.from?.id ?? chatId;
    if (!ALLOWED_CHAT_IDS.includes(String(chatId))) {
      console.log(`⛔ chat_id ${chatId} nao autorizado (fora de ALLOWED_CHAT_IDS) - ignorando mensagem "${text}"`);
      if (!cq && (text === "/start" || text === "/help")) {
        await fetch(`${TG_API}/sendMessage`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: `🔒 Acesso restrito.\nSeu chat_id: ${chatId}\nPasse esse número ao administrador para ser liberado.` }),
        }).catch(() => {});
      }
      return new Response("ok");
    }
    if (cq?.id) {
      await fetch(`${TG_API}/answerCallbackQuery`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callback_query_id: cq.id }),
      }).catch(() => {});
    }
    if (cq && textoBruto === "topo") {
      // Responde à mensagem grande: tocar na citação da resposta rola o chat até o início dela.
      const origId = message?.message_id;
      if (origId) {
        const r = await fetch(`${TG_API}/sendMessage`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: "⬆️ Toque na citação acima para ir ao topo",
            reply_parameters: { message_id: origId, allow_sending_without_reply: true },
            disable_notification: true,
          }),
        }).catch(() => null);
        const j: any = r ? await J(r) : null;
        const novoId = j?.result?.message_id;
        if (novoId) await uiRegistrar(chatId, novoId).catch(() => {});
      }
      return new Response("ok");
    }
    if (text.startsWith("/")) {
      await uiLimpar(chatId, cq ? [] : [message?.message_id]).catch((e) => console.log("⚠️ uiLimpar", e));
    }
    const rodarEmBackground = (tarefa: Promise<void>) => {
      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
        EdgeRuntime.waitUntil(tarefa);
        return Promise.resolve();
      }
      return tarefa;
    };
    const comAguarde = async (txt: string, fn: () => Promise<void>) => {
      const id = await sendTelegram(chatId, txt);
      await rodarEmBackground(fn().catch((e) => console.log("❌ erro no comando", e)).finally(() => (id ? apagarMsg(chatId, id) : undefined)));
    };
    if (text === "/start" || text === "/help") {
      await sendTelegram(chatId,
        "🤖 <b>Comandos</b>\n" + DIVISOR + "\n\n" +
        "🚀 /oportunidade — subiram no dia, com liquidez e tendência, perto do Indicador\n\n" +
        "🔄 /reversao — caíram no dia, com liquidez e tendência, perto do Indicador\n\n" +
        (FUNDO_ON ? "🟢 /fundo — despencaram no dia e já mostram sinais de fundo (possível virada SHORT → LONG)\n\n" : "") +
        "📋 /lista — moedas em acompanhamento (alerta original + situação atual)\n\n" +
        "🔎 /analise ONE — veredito com pontos, o que invalida e alertas anteriores\n\n" +
        "⭐ /seguir ONE · /parar ONE · /seguidas (com botões ❌ para parar) — moedas suas, avisadas mesmo fora do top 40\n\n" +
        "📊 /placar 7 — taxa de acerto dos alertas (1h, 4h, 24h)\n\n" +
        "⏸ /pausar — pausa os alertas por 1h, 2h ou 3h · /retomar volta antes\n\n" +
        "🩺 /status — testa Supabase, corretora, sua conta BloFin e o cron\n\n" +
        "🧾 /meuplacar 7 — seus trades reais x alertas do bot (precisa da chave BloFin)\n\n" +
        "🌅 /resumo — resumo da manhã e da noite (também chegam sozinhos)\n\n" +
        "🤖 /robo — posições abertas, sugestão para cada uma e resultado do dia na BloFin (só leitura)\n\n" +
        (credDe(chatId) ? "🔑 BloFin: chave vinculada a este chat.\n\n" : "🔑 BloFin: nenhuma chave vinculada a este chat (o /robo fica desativado aqui).\n\n") +
        (PROT_LUCRO_ON ? `🔒 Posição no lucro: aviso pra subir o stop a cada ${TRAIL_ATR_MULT}×ATR de ganho e pra realizar parte se o RSI esticar (≥${ESTICADO_RSI}).\n\n` : "") +
        (ehAdmin(chatId, remetente) ? "⚙️ /config — parâmetros em uso (só você, admin)\n\n" : "") +
        (RISCO_ON ? `🚨 Aviso de risco nas suas posições: liquidação a menos de ${RISCO_LIQ_PCT}% ou prejuízo acima de ${RISCO_PERDA_PCT}% da margem.\n\n` : "") +
        (SILENCIO_ON ? `🌙 Silêncio das ${SILENCIO_INI_H}h às ${SILENCIO_FIM_H}h (horário local)${SILENCIO_PROTECAO ? ": só passa alerta de proteção de posição aberta" : ""}.\n\n` : "") +
        "🧭 Todo alerta traz a confiança X/10 (mesmos pontos do /analise). Se um aviso \"chegando\" não se confirmar (preço recuou), eu aviso pra você desligar o robô.\n\n" +
        (FINAL_ON ? `⏱ Minutos finais da vela: aos ~${FINAL_PREPARE_MAX_MIN} min do fechamento aviso 🕒 PREPARE (moeda colada na linha); nos últimos ${FINAL_JANELA_MAX_MIN} min, se o preço já está além da linha, mando 🚨 "vai fechar cruzado, ligue o robô" (⚡ quando o fechamento cai em janela forte). Depois confirmo (✅), aviso se recuar (🛑) ou se não cruzou (❌); se a vela fechar sem cruzar mas seguir perto, mando 🔜 (a chance passa pra próxima).\n\n` : "") +
        (ESTRAT_PUMP ? `🎯 Modo pump: LONG de continuação e SHORT de reversão em moeda que subiu; em moeda que caiu só SHORT. Confiança mínima ${CONF_MIN_OPORT}/10 (continuação) e ${CONF_MIN_REVERSAO}/10 (reversão).\n\n` : "") +
        (FUNDO_ON ? `🟢 Radar de fundo: aviso antecipado quando moeda que caiu ≥${FUNDO_QUEDA_MIN}% em 24h mostra sinais de exaustão (confiança ≥${FUNDO_CONF_MIN}/10). Não é entrada: o robô só abre LONG ao cruzar acima do indicador.\n\n` : "") +
        `🆔 Seu chat_id: <b>${chatId}</b>\n\n` +
        (ALERT_CHAT_IDS.length
          ? `🔔 Alerta proativo ATIVO — aviso sozinho quando OPORTUNIDADE (≥${ALERT_OPORT_PCT_MIN}%) ou REVERSÃO (≥${ALERT_REV_PCT_MIN}%) estiver CHEGANDO, PERTO ou MUITO PERTO da linha` +
            (ANTEC_ETA_MAX_CANDLES > 0 ? ` (aviso antecipado até ${ANTEC_ETA_MAX_CANDLES * TF_MIN} min antes)` : "") +
            (ALERT_FILTROS_ON ? ", só com liquidez e tendência" : "") +
            "."
          : "🔔 Alerta proativo desativado (adicione seu ID em ALLOWED_CHAT_IDS + cron).")
      );
      return new Response("ok");
    }
    if (text.startsWith("/oportunidade")) {
      await comAguarde("🔍 Cruzando quem subiu no dia com o Indicador, aguarde...", () => runCruzado(chatId, true));
      return new Response("ok");
    }
    if (text.startsWith("/reversao") || text.startsWith("/reversão")) {
      await comAguarde("🔍 Cruzando quem caiu no dia com o Indicador, aguarde...", () => runCruzado(chatId, false));
      return new Response("ok");
    }
    if (text.startsWith("/fundo")) {
      await comAguarde("🔍 Procurando moedas que despencaram e já mostram sinais de fundo, aguarde...", () => runFundo(chatId));
      return new Response("ok");
    }
    if (text.startsWith("/lista")) {
      await comAguarde("🔍 Montando a lista de acompanhamento, aguarde...", () => runLista(chatId));
      return new Response("ok");
    }
    if (text.startsWith("/analise") || text.startsWith("/análise")) {
      const arg = text.split(/\s+/)[1];
      if (!arg) { await sendTelegram(chatId, "🔎 Use: /analise ONE (com ou sem -USDT)"); return new Response("ok"); }
      await comAguarde("🔎 Analisando, aguarde uns segundos...", () => runAnalise(chatId, arg));
      return new Response("ok");
    }
    if (text.startsWith("/pausar") || text.startsWith("/retomar")) {
      const arg = text.startsWith("/retomar") ? "0" : (text.split(/\s+/)[1] || "");
      await rodarEmBackground(runPausar(chatId, arg));
      return new Response("ok");
    }
    if (text.startsWith("/status")) {
      await comAguarde("🩺 Testando as conexões, aguarde...", () => runStatus(chatId));
      return new Response("ok");
    }
    if (text.startsWith("/meuplacar")) {
      const dias = Math.min(30, Math.max(1, Math.round(Number(text.split(/\s+/)[1]) || 7)));
      await comAguarde("🧾 Lendo seus trades e cruzando com os alertas, aguarde...", () => runMeuPlacar(chatId, dias));
      return new Response("ok");
    }
    if (text.startsWith("/placar")) {
      const dias = Math.min(90, Math.max(1, Math.round(Number(text.split(/\s+/)[1]) || 7)));
      await rodarEmBackground(runPlacar(chatId, dias));
      return new Response("ok");
    }
    if (text.startsWith("/seguidas")) {
      await comAguarde("⭐ Lendo as moedas seguidas, aguarde...", () => runSeguidas(chatId));
      return new Response("ok");
    }
    if (text.startsWith("/seguir") || text.startsWith("/parar")) {
      const arg = text.split(/\s+/)[1];
      const seguir = text.startsWith("/seguir");
      if (!seguir && (arg === "todas" || arg === "tudo" || arg === "all")) { await rodarEmBackground(pararTodas(chatId)); return new Response("ok"); }
      if (!arg && !seguir) { await comAguarde("⭐ Lendo as moedas seguidas, aguarde...", () => runSeguidas(chatId)); return new Response("ok"); }
      if (!arg) { await sendTelegram(chatId, "⭐ Use: /seguir ONE"); return new Response("ok"); }
      await rodarEmBackground(runSeguir(chatId, arg, seguir));
      return new Response("ok");
    }
    if (text.startsWith("/resumo")) {
      await comAguarde("🗓️ Montando os resumos, aguarde...", () => runResumo(chatId));
      return new Response("ok");
    }
    if (text.startsWith("/robo")) {
      await comAguarde("🤖 Consultando a BloFin, aguarde...", () => runRobo(chatId));
      return new Response("ok");
    }
    if (text.startsWith("/config")) {
      if (!ehAdmin(chatId, remetente)) { await sendTelegram(chatId, "🔒 Comando restrito ao administrador."); return new Response("ok"); }
      await sendTelegram(chatId, montarConfig());
      return new Response("ok");
    }
    if (text.startsWith("/menu")) {
      await sendTelegram(chatId, "⌨️ <b>Teclado ativado</b> — os botões ficam fixos embaixo. Cada toque apaga a resposta anterior (os alertas do robô só são substituídos por um novo da mesma moeda).");
      return new Response("ok");
    }
    return new Response("ok");
  } catch (e) {
    console.log("❌ ERRO GERAL telegram-bot", e);
    return new Response("ok");
  }
});
