// telegram-bot V109 — alertas de cripto no Telegram (Supabase Edge Function).
// Histórico completo das versões: CHANGELOG.md (antes ficava aqui no cabeçalho, ~26 mil caracteres).
// V109 (V108 + ADX alinhado à vela nas análises: /juncao, /radarconf (e retro), /faca, /foguete, /radarsim regra e o histórico dos radares liam o ADX de 27 velas DEPOIS (adxNaVela corrige; os alertas ao vivo não tinham o erro) · /juncao novos: SuperTrend, faixa com folga, Chandelier e Donchian na mesma conta da faixa · /juncao filtros: o motor real com ADX, Choppiness e ER como filtro de regime · /juncao mov: linha do ADX abaixo do mínimo · /velas: as velas de 15m num arquivo CSV · pedidos de análise sem Telegram: um comando de leitura gravado na tabela analises_pedidos roda na rodada do cron (requisição separada) e a resposta fica na própria linha. Só análises: alertas, bot e motor não mudam)
// Ao subir de versão: troque BOT_VERSAO (logo abaixo do import), atualize esta linha e registre no CHANGELOG.md.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const BOT_VERSAO = "V109"; // V107: gravado em cada alerta (coluna versao) — suba junto com o cabeçalho a cada versão
// V107: declarados no topo porque o numEnv é chamado desde as primeiras linhas. Antes o _numEnvAvisado ficava mais abaixo, e um Secret
// numérico INVÁLIDO lido antes dele derrubava a function na carga (variável usada antes de existir) em vez de cair no padrão.
const _numEnvAvisado = new Set<string>();
const _cfgNum = new Map<string, { padrao: string; bruto: string | undefined }>(); // V107: pro /config mudou

// ===== V74: controle do volume de logs (Secret LOG_NIVEL) =====
// tudo   = todos os logs, como antes.
// normal = (padrão) erros/avisos + eventos (alerta enviado, ordem, fechamento...). Corta o ruído que se repete a cada rodada.
// erro   = só erros e avisos.   mudo = nada.
// LOG_OCULTAR = trechos (separados por vírgula) que NUNCA aparecem · LOG_MOSTRAR = trechos que SEMPRE aparecem (menos no mudo).
// Erro/aviso igual repetido dentro de LOG_REPETIDO_MIN minutos (padrão 10) sai 1 vez só, e depois vem "(+N iguais ocultas)"; LOG_REPETIDO_MIN=0 desliga.
type LogNivel = "tudo" | "normal" | "erro" | "mudo";
const LOG_NIVEL: LogNivel = (() => {
  const v = String(Deno.env.get("LOG_NIVEL") || "normal").trim().toLowerCase();
  if (["tudo", "all", "completo", "verbose"].includes(v)) return "tudo";
  if (["erro", "erros", "error", "errors"].includes(v)) return "erro";
  if (["mudo", "off", "nenhum", "silencio", "silêncio"].includes(v)) return "mudo";
  return "normal";
})();
const LOG_LISTA = (k: string): string[] => String(Deno.env.get(k) || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
const LOG_OCULTAR = LOG_LISTA("LOG_OCULTAR"), LOG_MOSTRAR = LOG_LISTA("LOG_MOSTRAR");
const LOG_REPETIDO_MS = Math.max(0, Number(Deno.env.get("LOG_REPETIDO_MIN") ?? "10") || 0) * 60000;
const LOG_ERRO_INICIO = /^\s*(❌|⚠️|⛔|🚨|Erro|ERRO|Gemini|Claude)/;
const LOG_ERRO_PALAVRA = /(falhou|FALHOU|ERRO |erro rede|⏳ Telegram 429|⏳ retry)/;
const LOG_RUIDO: RegExp[] = [
  /^\s*🏁 alerta proativo em/, /^\s*🔔 \d+ setups/, /^\s*👀 (lista de acompanhamento|\d+ moeda)/, /^\s*🔄 painel/, /^\s*📊 placar:/, /^\s*🎯 \d+ previs/,
  /^\s*(🟢|🔴|🗜️) radar (de fundo|de topo|de compressão): \d+ candidata/, /^\s*(🟢|🔴) radar: .* < /, /^\s*🧱 lateral: BTC/, /^\s*📡 fonte de dados/,
  /^\s*⏱ (final \(.*faltam|prepare)/, /^\s*🌙 todos/, /^\s*⏭️/, /^\s*ℹ️/, /^\s*🗑️ autoapagar/, /^\s*(🧭|₿|🧱|🔒) .*barrado/, /^\s*🔎 volume/,
  /^\s*🧹 \/oportunidade/, /^\s*✅ \d+ pares/, /^\s*⏳ .* cruzou contra, mas o último aviso/, /^\s*⏱ .*já coberto pelo alerta/, /^\s*⏱ final .*loop principal já avisou/,
];
const logClasse = (msg: string): "erro" | "ruido" | "evento" => {
  if (LOG_ERRO_INICIO.test(msg)) return "erro";
  if (LOG_RUIDO.some((r) => r.test(msg))) return "ruido";
  if (LOG_ERRO_PALAVRA.test(msg)) return "erro";
  return "evento";
};
const _logEst = { mostrados: 0, ruido: 0, repetidos: 0, filtro: 0, desde: Date.now() };
const _logOrig = console.log.bind(console);
const _logVisto = new Map<string, { t: number; n: number }>();
console.log = (...args: unknown[]) => {
  if (LOG_NIVEL === "tudo" && !LOG_OCULTAR.length) { _logOrig(...args); return; }
  const msg = args.map((a) => {
    if (typeof a === "string") return a;
    if (a instanceof Error) return a.message;
    try { return JSON.stringify(a); } catch { return String(a); }
  }).join(" ");
  const low = msg.toLowerCase();
  if (LOG_OCULTAR.some((x) => low.includes(x))) { _logEst.filtro++; return; }
  if (LOG_NIVEL === "tudo") { _logOrig(...args); return; }
  if (LOG_NIVEL === "mudo") { _logEst.ruido++; return; }
  const cls = logClasse(msg), forca = LOG_MOSTRAR.some((x) => low.includes(x));
  if (!forca && ((LOG_NIVEL === "erro" && cls !== "erro") || (LOG_NIVEL === "normal" && cls === "ruido"))) { _logEst.ruido++; return; }
  if (cls === "erro" && LOG_REPETIDO_MS > 0) {
    const chave = msg.replace(/\d+(?:[.,]\d+)?/g, "#").slice(0, 140);
    const agora = Date.now(), v = _logVisto.get(chave);
    if (v && agora - v.t < LOG_REPETIDO_MS) { v.n++; _logEst.repetidos++; return; }
    if (_logVisto.size > 800) _logVisto.clear();
    _logVisto.set(chave, { t: agora, n: 0 });
    if (v && v.n > 0) { _logEst.mostrados++; _logOrig(...args, `(+${v.n} iguais ocultas)`); return; }
  }
  _logEst.mostrados++;
  _logOrig(...args);
};
const logResumo = (): string =>
  `📜 <b>LOGS</b>\nNível: <b>${LOG_NIVEL}</b>${LOG_OCULTAR.length ? ` · ocultar: ${LOG_OCULTAR.join(", ")}` : ""}${LOG_MOSTRAR.length ? ` · sempre mostrar: ${LOG_MOSTRAR.join(", ")}` : ""} · repetidos: ${LOG_REPETIDO_MS ? `${LOG_REPETIDO_MS / 60000} min` : "off"}\n` +
  `Desde que esta instância subiu (${Math.round((Date.now() - _logEst.desde) / 60000)} min): ${_logEst.mostrados} mostrados · ${_logEst.ruido} ruído/nível ocultos · ${_logEst.repetidos} repetidos ocultos · ${_logEst.filtro} por LOG_OCULTAR\n` +
  `<i>Secrets: LOG_NIVEL = tudo | normal | erro | mudo · LOG_OCULTAR / LOG_MOSTRAR = trechos separados por vírgula · LOG_REPETIDO_MIN</i>`;

// Timeout padrão: quase todas as chamadas de dados de mercado, do Telegram e da BloFin não tinham limite de tempo. Uma conexão
// que trava ficava esperando até a function ser derrubada pela plataforma, segurando a trava do cron e atrasando todos os alertas.
// 15 s pra mercado/Telegram/BloFin (respondem em menos de 2 s; passou disso, está travado) e 30 s pras consultas ao Supabase (leituras
// do placar podem ser mais pesadas). Ambos ficam abaixo da trava do cron (110 s). Quem já passa o próprio `signal` (IA, notícias,
// OKX/Binance) continua com o dele. FETCH_TIMEOUT_MS / FETCH_TIMEOUT_DB_MS = 0 desligam.
const FETCH_TIMEOUT_MS = Number(Deno.env.get("FETCH_TIMEOUT_MS") ?? "15000");
const FETCH_TIMEOUT_DB_MS = Number(Deno.env.get("FETCH_TIMEOUT_DB_MS") ?? "30000");
{
  const fetchOriginal = globalThis.fetch.bind(globalThis);
  const baseDb = Deno.env.get("SUPABASE_URL") || "";
  globalThis.fetch = ((entrada: any, init?: any) => {
    if (init?.signal) return fetchOriginal(entrada, init);
    const url = typeof entrada === "string" ? entrada : String(entrada?.url ?? entrada ?? "");
    const ms = baseDb && url.startsWith(baseDb) ? FETCH_TIMEOUT_DB_MS : FETCH_TIMEOUT_MS;
    return ms > 0 ? fetchOriginal(entrada, { ...(init || {}), signal: AbortSignal.timeout(ms) }) : fetchOriginal(entrada, init);
  }) as typeof fetch;
}
const TELEGRAM_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
const TG_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
const ALLOWED_CHAT_IDS = (Deno.env.get("ALLOWED_CHAT_IDS") || "")
.split(",")
.map((s) => s.trim())
.filter(Boolean);
// V109: modo captura dos pedidos de análise (tabela analises_pedidos, ver rodarPedidosAnalise): o comando roda com um chat falso "cap_<uuid>"
// e as mensagens ficam guardadas aqui em vez de ir pro Telegram (sendTelegram, editarTelegram, apagarMsg e tgEnviarArquivo olham isto).
const _capturas = new Map<string, { msgs: (string | null)[] }>();
const ehCaptura = (chatId: unknown): boolean => typeof chatId === "string" && _capturas.has(chatId);
const ALERT_EXCLUIR = (Deno.env.get("ALERT_EXCLUIR_IDS") || "").split(",").map((x) => x.trim()).filter(Boolean);
const ALERT_CHAT_IDS = [...new Set(ALLOWED_CHAT_IDS)].filter((x) => !ALERT_EXCLUIR.includes(x));
let ALERT_OPORT_PCT_MIN = numEnv("ALERT_OPORT_PCT_MIN", "8");
let ALERT_REV_PCT_MIN = numEnv("ALERT_REV_PCT_MIN", "12");
// V37: alertas proativos (os que o robô manda sozinho, sem comando) levam uma marca discreta
// (🔔 na frente do título, não mais uma linha inteira separada) e se autoapagam ALERTA_AUTOAPAGAR_MIN
// minutos depois de enviados.
const ALERTA_MARCA = "🔔 ";
const ALERTA_AUTOAPAGAR_MIN = numEnv("ALERTA_AUTOAPAGAR_MIN", "15");
const ALERT_COOLDOWN_MIN = numEnv("ALERT_COOLDOWN_MIN", "60");
const ALERT_COOLDOWN_REPETIDO_MIN = numEnv("ALERT_COOLDOWN_REPETIDO_MIN", "180");
const WATCH_HORAS = numEnv("WATCH_HORAS", "48");
// V72: antes, o aviso de "cruzou CONTRA" fechava o acompanhamento da moeda depois do 1º aviso (watch_notificado=true,
// watch_until=null). Se ela virasse de novo mais tarde, ninguém olhava — só reabria se um alerta CHEIO conseguisse
// passar de novo pelo classificar()+confiança+ESTRATEGIA_PUMP, o que pro lado "contra o dia" pode nunca acontecer.
// Com WATCH_REPETIR=1 (padrão), em vez de fechar, o acompanhamento continua no NOVO lado: se virar de novo, avisa de
// novo. WATCH_REPETIR=0 volta ao comportamento antigo (avisa 1x e some).
// V79: teto de moedas mostradas no /lista (0 = sem teto) e idade máxima do alerta original pra continuar renovando a vigilância a cada virada (0 = sem teto).
const LISTA_MAX = numEnv("LISTA_MAX", "20");
const WATCH_IDADE_MAX_H = numEnv("WATCH_IDADE_MAX_H", "168");
// V81: aviso 🔁 "cruzou contra" por mensagem só pra moeda que IMPORTA pro chat: alerta original recente (<= ACOMP_AVISO_MAX_H), moeda seguida por ele ou com posição aberta dele.
// O resto continua na /lista (marcado como cruzou contra / virou) mas sem mensagem. 0 = sem corte (avisa tudo, como na V80). O toque na linha NÃO espera confirmação.
const ACOMP_AVISO_MAX_H = numEnv("ACOMP_AVISO_MAX_H", "24");
const WATCH_REPETIR = (Deno.env.get("WATCH_REPETIR") || "1") !== "0";
// V72: o aviso de "cruzou CONTRA" (ACOMP_) some em 5 min por padrão, mais rápido que o auto-apagar geral (15 min) —
// é um aviso informativo, e com WATCH_REPETIR ligado pode chegar de novo a cada virada; não precisa ficar muito tempo.
const ACOMP_AUTOAPAGAR_MIN = numEnv("ACOMP_AUTOAPAGAR_MIN", "5");
// V74: intervalo mínimo entre dois avisos de "cruzou CONTRA" da MESMA moeda no mesmo chat (padrão 0 = desligado: aviso toda vez que cruza, o que também serve de sinal de moeda lateral; ligue com ACOMP_INTERVALO_MIN=30, por ex.).
// Evita spam em moeda picotada que cruza toda hora. Guardado no Supabase (a function serverless não guarda memória entre rodadas).
const ACOMP_INTERVALO_MIN = numEnv("ACOMP_INTERVALO_MIN", "30"); // V82: antes 0 (sem intervalo). O 1º 🔁 de uma moeda sai na hora; o seguinte só depois do intervalo e se ela AINDA estiver contra (corta o vai-e-vem em cima da linha).
const ACOMP_INTERVALO_PREFIXO = "_ACOMPT_";
// V74: aviso "voltou pra dentro da faixa": alerta que saiu JÁ cruzado e o preço recuou pra dentro da faixa (repique) sem chegar à linha
// oposta — o "cruzou CONTRA" não cobre isso. Dispara quando o preço está pelo menos WATCH_VOLTA_ATR × ATR dentro da linha (mín. FINAL_CANCELA_PCT %).
// 0 desliga. Sai 1x por alerta.
const WATCH_VOLTA_ATR = numEnv("WATCH_VOLTA_ATR", "0.5");
const TF_MIN = 15;
const ALERT_FRESCO_CANDLES = numEnv("ALERT_FRESCO_CANDLES", "2");
const ALERT_IDADE_MAX_CANDLES = numEnv("ALERT_IDADE_MAX_CANDLES", "0");
// V68: cruzamento já velho (> N velas) não gera mais alerta de reteste; 0 desliga. Aviso de proteção (posição contra) continua passando.
const ALERT_RETESTE_MAX_CANDLES = numEnv("ALERT_RETESTE_MAX_CANDLES", "16");
// V68: ent_em mais de N horas antes do alerta é dado inválido (série de velas velha/errada), não entrada
const ENT_MAX_ATRASO_H = numEnv("ENT_MAX_ATRASO_H", "48");
let ANTEC_ETA_MAX_CANDLES = numEnv("ANTEC_ETA_MAX_CANDLES", "6");
let ANTEC_DIST_MAX_PCT = numEnv("ANTEC_DIST_MAX_PCT", "1");
const TRAVA_PRECO_ON = (Deno.env.get("TRAVA_PRECO_ON") || "1") !== "0";
let ANTEC_DIST_MAX_ATR = numEnv("ANTEC_DIST_MAX_ATR", "1.5");
const ANTEC_LIGUE_ETA_CANDLES = numEnv("ANTEC_LIGUE_ETA_CANDLES", "2");
const ALERT_MAX_POR_RODADA = numEnv("ALERT_MAX_POR_RODADA", "5");
const ALERT_POOL = 40;
const TIMEFRAME = "15m";
const PESO_SUPREMA = 0.5;
const TOP_N_CRUZADO = 10;
const CONF_LISTA_TOP = numEnv("CONF_LISTA_TOP", "5"); // V54: quantas moedas de /oportunidade e /reversao ganham a linha de confiança
const OPORT_POOL = 40;
const PAIRS_CACHE_MS = 30 * 60 * 1000;
let FILTRO_VOL_MIN_USDT = numEnv("FILTRO_VOL_MIN_USDT", "1000000");
// V106: MODO SOMBRA DE VOLUME. Candidatos com volume entre FILTRO_VOL_SOMBRA_MIN e FILTRO_VOL_MIN_USDT passam pelas MESMAS regras dos
// radares de topo/fundo/repique e do alerta de oportunidade/reversão, mas só são GRAVADOS (tipo vol_sombra, sombra_vol=true): não avisam,
// não entram no /placar nem nas outras estatísticas; só o /volconf lê. 0 desliga. VOL_SOMBRA_POOL = quantas moedas da faixa avaliar por rodada.
const FILTRO_VOL_SOMBRA_MIN = numEnv("FILTRO_VOL_SOMBRA_MIN", "100000");
const VOL_SOMBRA_POOL = numEnv("VOL_SOMBRA_POOL", "12");
const VOL_SOMBRA_COOLDOWN_MIN = numEnv("VOL_SOMBRA_COOLDOWN_MIN", "240");
const VOL_SOMBRA_MAX_POR_RODADA = numEnv("VOL_SOMBRA_MAX_POR_RODADA", "4");
// V106: só pro /volconf. Mínimo de volume em UNIDADES da moeda pra testar "os dois filtros juntos" (0 = usa a mediana da amostra). Não barra nada ao vivo.
const FILTRO_VOL_MIN_MOEDA = numEnv("FILTRO_VOL_MIN_MOEDA", "0");
const ALERTA_MOSTRA_VOL = (Deno.env.get("ALERTA_MOSTRA_VOL") ?? "1") !== "0"; // V106: linha 💧 volume 24h nos radares
const VOL_SOMBRA_TIPO = "vol_sombra";
// V106: volume 24h de cada moeda (USDT e unidades), atualizado a cada getVariacoes24h; o registro do log lê daqui.
const _volMap = new Map<string, { u: number; m: number }>();
const volDe = (inst: string) => _volMap.get(inst) ?? null;
const fmtVol = (v: number | null | undefined): string => {
  if (v == null || !isFinite(v)) return "?";
  const a = Math.abs(v);
  return a >= 1e9 ? `${(v / 1e9).toFixed(1)}B` : a >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : a >= 1e3 ? `${(v / 1e3).toFixed(0)}k` : v.toFixed(0);
};
const volLinha = (inst: string): string => {
  if (!ALERTA_MOSTRA_VOL) return "";
  const v = volDe(inst);
  return v ? `\n💧 Volume 24h: ${fmtVol(v.u)} USDT (${fmtVol(v.m)} ${inst.split("-")[0]})` : "";
};
let FILTRO_ADX_MIN = numEnv("FILTRO_ADX_MIN", "14"); // V74: 15 → 14 (pega a tendência começando); se você tem o Secret FILTRO_ADX_MIN=15 salvo, ele vence: apague ou troque (histórico: V61 baixou de 18 pra 15 — com o DI oculto (V60) filtrando falso cruzamento por trás, dá pra descer o piso e pegar antecipação sem tanto ruído)
// V74 (OPCIONAL, desligado): corte duro "ADX subindo" (ADX agora > ADX de ~1h atrás, as mesmas 4 velas do adxAntes). Hoje o "ADX subindo" já entra na PONTUAÇÃO de confiança (+1, ou +0 se o DI do lado oposto puxa).
// FILTRO_ADX_SUBINDO_ATE: só exige "subindo" enquanto o ADX está abaixo desse valor (ex.: 25 = acima disso a tendência já está formada e não precisa estar subindo); 0 = sempre.
const FILTRO_ADX_SUBINDO = (Deno.env.get("FILTRO_ADX_SUBINDO") ?? "0") === "1"; // padrão DESLIGADO: a pontuação de confiança já premia "ADX subindo" com o contexto do DI (ver pontuação); ligue com FILTRO_ADX_SUBINDO=1 pra virar corte duro
const FILTRO_ADX_SUBINDO_ATE = numEnv("FILTRO_ADX_SUBINDO_ATE", "0");
// V57: filtro de mercado lateral (BTC + ETH), com duas faixas pra não ficar ligando/desligando em cima do limite.
// Bloqueia quando os DOIS estão com ADX < LATERAL_ADX_BLOQ; só libera quando UM deles chega a >= LATERAL_ADX_LIBERA.
const LATERAL_ON = (Deno.env.get("LATERAL_BLOQ") || "1") !== "0";
const LATERAL_ADX_BLOQ = numEnv("LATERAL_ADX_BLOQ", "18");
const LATERAL_ADX_LIBERA = LATERAL_ADX_BLOQ; // V70: o mínimo é um só (antes eram duas faixas, 18 e 20)
// V57: 2 confirmações além do ADX (mesma ideia de duas faixas): ER = Efficiency Ratio de Kaufman (deslocamento líquido ÷ caminho percorrido
// nas últimas LATERAL_JAN velas 15m; perto de 0 = vai e vem, perto de 1 = tendência) e "caixa" = amplitude máx−mín das mesmas velas em ATRs.
// Cada ativo vota com os 3 indicadores; bloqueia com LATERAL_VOTOS (2) de 3 nos DOIS ativos (e nenhum sinal de tendência) e libera com LATERAL_VOTOS_LIBERA (1) de 3 de tendência em UM deles.
const LATERAL_ER_BLOQ = numEnv("LATERAL_ER_BLOQ", "0.25");
const LATERAL_ER_LIBERA = LATERAL_ER_BLOQ; // V70: idem (antes 0.25 e 0.35)
const LATERAL_AMP_BLOQ = numEnv("LATERAL_AMP_BLOQ", "3");
const LATERAL_AMP_LIBERA = LATERAL_AMP_BLOQ; // V70: idem (antes 3 e 4)
const LATERAL_JAN = Math.max(4, Math.round(numEnv("LATERAL_JAN", "16")));
const LATERAL_VOTOS = Math.min(3, Math.max(1, Math.round(numEnv("LATERAL_VOTOS", "2")))); // votos de LATERAL (nos dois ativos) pra bloquear
const LATERAL_VOTOS_LIBERA = Math.min(3, Math.max(1, Math.round(numEnv("LATERAL_VOTOS_LIBERA", "2")))); // V70: requisitos NO MÍNIMO (em um ativo) pra liberar — padrão agora 2 de 3
const LATERAL_VOTOS_QUER = Math.min(3, Math.max(1, Math.round(numEnv("LATERAL_VOTOS_QUER", "1")))); // V70: requisitos no mínimo que disparam o aviso 👀 \"querendo sair da lateral\" (enquanto ainda não liberou)
const LATERAL_AVISO_ON = (Deno.env.get("LATERAL_AVISO") || "1") !== "0"; // aviso quando um dos 3 sinais sai da lateral (com o filtro bloqueando)
const LATERAL_AVISO_MIN = numEnv("LATERAL_AVISO_MIN", "30"); // intervalo mínimo entre dois desses avisos
const LATERAL_AVISO_ENTROU_ON = (Deno.env.get("LATERAL_AVISO_ENTROU") || "1") !== "0"; // V59: aviso quando o mercado ENTRA em lateral (espelho do aviso de saída; mesmo intervalo mínimo LATERAL_AVISO_MIN)
const LATERAL_HOLD_MIN = numEnv("LATERAL_HOLD_MIN", "30"); // depois de liberar, espera esse tempo antes de poder bloquear de novo (evita piscar)
// V58: LATERAL_MODO decide o que o filtro FAZ quando detecta lateral: "bloqueia" (padrão, comportamento V57) barra
// o LIGUE AGORA e os alertas de entrada; "visual" mantém a leitura/estado/contadores normais, mas não barra nada —
// todo alerta sai como sairia sem o filtro, só com a nota 🧱 avisando que o mercado está lateral.
const LATERAL_MODO = (Deno.env.get("LATERAL_MODO") || "visual").toLowerCase();
const LATERAL_BARRA = LATERAL_ON && LATERAL_MODO !== "visual"; // usar isso (não LATERAL_ON sozinho) em qualquer lugar que decida BARRAR um alerta
let FILTRO_RSI_MAX = numEnv("FILTRO_RSI_MAX", "85");
let FILTRO_RSI_MIN = numEnv("FILTRO_RSI_MIN", "15");
let FILTRO_DIST_MAX_PCT = numEnv("FILTRO_DIST_MAX_PCT", "2");
// Lista negra manual: instId separados por vírgula (ex.: "BTC-USDT,ETH-USDT,META-USDT") pra tirar
// moedas mais consolidadas/paradas da lista, independente de volume ou volatilidade. Default abaixo
// cobre as blue-chips de maior market cap/liquidez do mercado de perp (as que lideram/puxam o resto,
// em vez de serem puxadas por ele) — o robô é feito pra pegar pump/dump em altcoins menores, então
// deixar BTC/ETH e afins de fora evita gastar vaga do radar e do LIMITE_LADO com moedas que raramente
// dão o movimento explosivo que a estratégia procura. Ajuste via env var BLACKLIST_MOEDAS sem precisar
// editar o código (passe "" pra zerar e voltar a avaliar todo mundo).
const BLACKLIST_MOEDAS = new Set(
  (Deno.env.get("BLACKLIST_MOEDAS") ?? "BTC-USDT,ETH-USDT,BNB-USDT,SOL-USDT,XRP-USDT")
    .split(",").map((x) => x.trim().toUpperCase()).filter(Boolean)
);
// Amplitude mínima (%) pra uma moeda entrar no radar: usa o maior entre |variação 24h|, queda desde o
// topo e alta desde o fundo. Serve pra empurrar pra fora as moedas "paradas" e priorizar as que estão
// bombando, sem precisar listar cada uma na mão. 0 desliga o filtro (comportamento atual).
let FILTRO_AMPLITUDE_MIN = numEnv("FILTRO_AMPLITUDE_MIN", "0");
const ADX_REF = 25;
const CANDLES_LIMIT_PADRAO = 500;
const CANDLES_LIMIT_PRECISO = 500;
let ALERT_FILTROS_ON = (Deno.env.get("ALERT_FILTROS") || "1") !== "0";
const VOL_ACEL_RATIO = numEnv("VOL_ACEL_RATIO", "1.5");
const VOL_SECO_RATIO = numEnv("VOL_SECO_RATIO", "0.6");
const SQUEEZE_REL = numEnv("SQUEEZE_REL", "0.6");
const ANTEC_TABELA = "antecipacoes_log";
const ANTEC_CANCELA_RECUO = numEnv("ANTEC_CANCELA_RECUO", "1.3");
const ANTEC_CALIB_MIN = numEnv("ANTEC_CALIB_MIN", "10");
const CONF_VERDE = 7;
const CONF_AMARELO = 6;
const ESTRAT_PUMP = (Deno.env.get("ESTRATEGIA_PUMP") || "1") !== "0";
const FILTRO_RSI_MAX_LONG = numEnv("FILTRO_RSI_MAX_LONG", "90");
const SERROTE_MAX = numEnv("SERROTE_MAX", "4");
// V56: limiar do texto/penalidade de "vai e vem" segue o SERROTE_MAX (antes 4 fixo em 2 lugares); com SERROTE_MAX=0 (filtro duro desligado) mantém 4
const SERROTE_AVISO = SERROTE_MAX > 0 ? SERROTE_MAX : 4;
const LIMITE_LADO = numEnv("LIMITE_LADO", "3");
const CONF_MIN_OPORT = numEnv("CONF_MIN_OPORT", "6");
const CONF_MIN_REVERSAO = numEnv("CONF_MIN_REVERSAO", "7");
// V100: regra extra SÓ pro alerta de REVERSÃO (cruzamento da faixa contra o dia) — a tendência velha precisa estar fraca e o DI já virando pro lado da reversão.
//   REV_ADX_MAX (20)  = ADX tem que ser <= esse valor (0 desliga). O piso continua sendo FILTRO_ADX_MIN (14), então a janela é 14–20.
//   REV_DI_OBRIGA (1) = o lado que domina o +DI/−DI (xDiDominante) tem que ser o MESMO lado da reversão (LONG: +DI > −DI · SHORT: −DI > +DI). DI neutro (diferença < DI_GAP_MIN) também barra. 0 desliga.
//   REV_SOMBRA (1)    = o que a regra (ou a nota, até REV_SOMBRA_FOLGA_CONF pontos abaixo do corte) barrar é GRAVADO em silêncio no alertas_log com tipo "reversao_sombra"
//                       (fora do /placar, /15min, /saida etc.; o /reversaoconf compara reais x sombra). Cooldown por moeda+lado REV_SOMBRA_COOLDOWN_MIN (180) e no máx. REV_SOMBRA_MAX_POR_RODADA (5).
const REV_ADX_MAX = numEnv("REV_ADX_MAX", "20");
const REV_DI_OBRIGA = (Deno.env.get("REV_DI_OBRIGA") ?? "1") !== "0";
const REV_SOMBRA_ON = (Deno.env.get("REV_SOMBRA") ?? "1") !== "0";
const REV_SOMBRA_FOLGA_CONF = numEnv("REV_SOMBRA_FOLGA_CONF", "2");
const REV_SOMBRA_COOLDOWN_MIN = numEnv("REV_SOMBRA_COOLDOWN_MIN", "180");
const REV_SOMBRA_MAX_POR_RODADA = numEnv("REV_SOMBRA_MAX_POR_RODADA", "5");
const REV_SOMBRA_TIPO = "reversao_sombra";
const _confBarrada = new Map<string, number>();
// Fix: o laço principal também barra por confiança setups que AINDA NÃO CRUZARAM a linha (idadeCandles === null). Antes usava o mesmo
// _confBarrada do alerta dos minutos finais, então uma nota baixa no início da vela bloqueava o 🚨 e o aviso final pela vela inteira.
// Agora esses barrados ficam num mapa separado, que só o laço principal consulta.
const _confBarradaPre = new Map<string, number>();
const FUNDO_ON = (Deno.env.get("FUNDO_RADAR") || "1") !== "0";
const FUNDO_QUEDA_MIN = numEnv("FUNDO_QUEDA_MIN", "10");
const FUNDO_JAN_PICO = numEnv("FUNDO_JAN_PICO", "96");
// V54: o padrão acompanha FUNDO_QUEDA_MIN (antes 6 contra 10: a moeda era marcada ⭐ repique e ganhava +2/+1,
// mas não entrava no pool nem no classificar(), que exigem FUNDO_QUEDA_MIN). Mesma medida (ddDoPico) nos dois.
const FUNDO_TOQUE_PICO_MIN = numEnv("FUNDO_TOQUE_PICO_MIN", String(FUNDO_QUEDA_MIN));
const ALERT_POOL_RECUO = numEnv("ALERT_POOL_RECUO", "15");
const TOPO_ON = (Deno.env.get("TOPO_RADAR") || "1") !== "0";
const TOPO_ALTA_MIN = numEnv("TOPO_ALTA_MIN", "10");
const TOPO_CONF_MIN = numEnv("TOPO_CONF_MIN", "5");
const TOPO_PRE_MIN = numEnv("TOPO_PRE_MIN", "5");
// V54: idem FUNDO_TOQUE_PICO_MIN — o padrão acompanha TOPO_ALTA_MIN (altaDoVale nos dois lados).
const TOPO_TOQUE_VALE_MIN = numEnv("TOPO_TOQUE_VALE_MIN", String(TOPO_ALTA_MIN));
// Fix do repique: o repique só vale quando existe o movimento ANTERIOR (SHORT: queda antes do vale; LONG: alta antes do topo) e o preço chegou
// na faixa pelo lado certo (SHORT: vindo de baixo; LONG: vindo de cima). Antes só se media a alta desde a mínima de 24h (SHORT) ou a queda desde a
// máxima (LONG), e o "tocou a faixa" era trivialmente verdadeiro pra moeda vindo do lado oposto: uma moeda que disparou e voltava pra faixa
// por cima era marcada como ⭐ REPIQUE SHORT ("despencou e repicou"), o contrário do que ela fazia (o caso certo era REPIQUE LONG).
const REPIQUE_MOV_ANTES_MIN = numEnv("REPIQUE_MOV_ANTES_MIN", String(Math.min(FUNDO_QUEDA_MIN, TOPO_ALTA_MIN)));
const REPIQUE_LADO_ATR = numEnv("REPIQUE_LADO_ATR", "1");
const TOPO_COOLDOWN_MIN = numEnv("TOPO_COOLDOWN_MIN", "240");
// V97: radar de topo só alerta com ADX BAIXO (histórico dos radares: ADX < 20 funcionou 75% e invalidou 11%, n=44; de 20 pra cima ~50% e ~45%).
// Vale só pro topo normal; o repique (⭐) fica de fora (amostra pequena e comportamento diferente). TOPO_ADX_MAX=0 desliga.
const TOPO_ADX_MAX = numEnv("TOPO_ADX_MAX", "20");
// V96: "nota subiu" fura o cooldown. Antes, qualquer alerta do radar (topo/fundo) bloqueava a moeda por TOPO/FUNDO_COOLDOWN_MIN mesmo que a nota subisse de 3 pra 5/10 logo depois
// (só aparecia na lista do /topo e /fundo). Agora, se a nota subir RADAR_UPGRADE_DELTA pontos ou mais desde o último alerta da moeda, sai um 2º alerta marcado "⬆️ NOTA SUBIU",
// respeitando um intervalo mínimo de RADAR_UPGRADE_GAP_MIN minutos desde o alerta anterior. RADAR_UPGRADE_DELTA = 0 desliga.
const RADAR_UPGRADE_DELTA = numEnv("RADAR_UPGRADE_DELTA", "2");
const RADAR_UPGRADE_GAP_MIN = numEnv("RADAR_UPGRADE_GAP_MIN", "30");
const TOPO_MAX_POR_RODADA = numEnv("TOPO_MAX_POR_RODADA", "2");
// V74: quantas candidatas (já ordenadas por força) os radares de fundo/topo/compressão olham por rodada. O cooldown é checado DENTRO do laço, então
// com janela de 8 (ou 6) as mesmas moedas fortes, em cooldown, bloqueavam as seguintes. O limite por rodada (*_MAX_POR_RODADA) continua mandando no spam.
const RADAR_CAND_JANELA = numEnv("RADAR_CAND_JANELA", "20");
const ALERT_POOL_ALTA = numEnv("ALERT_POOL_ALTA", "15");
// V36: inclinação da faixa, medida em "velas típicas por vela" (quanto o meio da faixa anda por vela, dividido pelo movimento típico de uma vela da moeda)
const INCLINA_JAN = numEnv("INCLINA_JAN", "8");
const INCLINA_FORTE = numEnv("INCLINA_FORTE", "0.25");
const INCLINA_MOD = numEnv("INCLINA_MOD", "0.12");
const INCLINA_PLANA = numEnv("INCLINA_PLANA", "0.08");
// V36: radar de compressão (faixa achatada + velas minúsculas + volume começando a subir = rompimento iminente, direção imprevisível)
const COMPRESS_ON = (Deno.env.get("COMPRESS_RADAR") || "1") !== "0";
const COMPRESS_REL = numEnv("COMPRESS_REL", "0.5");
const COMPRESS_VOL_MIN = numEnv("COMPRESS_VOL_MIN", "1.1");
const COMPRESS_DIST_MAX_PCT = numEnv("COMPRESS_DIST_MAX_PCT", "1.5");
const COMPRESS_CONF_MIN = numEnv("COMPRESS_CONF_MIN", "8"); // V102: 6 → 8 (só a compressão de nota 8/10 ou mais manda alerta)
// V102: COMPRESS_CONF_MAX = teto da nota (0 = sem teto; 8 = só a nota 8 exata). COMPRESS_ADX_MIN (13) = ADX mínimo da moeda (0 desliga; use 12 a 14).
// COMPRESS_ADX_SUBINDO (1) = o ADX precisa estar subindo (hoje − 5 velas atrás > COMPRESS_ADX_SUBINDO_MIN = 0.5, o mesmo corte do "ADX ↗" do /compressao). Sem o dado do ADX de antes, não barra.
const COMPRESS_CONF_MAX = numEnv("COMPRESS_CONF_MAX", "0");
const COMPRESS_ADX_MIN = numEnv("COMPRESS_ADX_MIN", "13");
// V103: teto do ADX (exclusivo; 0 desliga). Padrão 15: só vale o ADX "acordando" (13 até < 15) e subindo; com o ADX já em 15, 20 etc. subindo, NÃO conta.
const COMPRESS_ADX_MAX = numEnv("COMPRESS_ADX_MAX", "15");
const compAdxTxt = () => `${COMPRESS_ADX_MIN > 0 || COMPRESS_ADX_MAX > 0 ? `ADX ${COMPRESS_ADX_MIN > 0 ? `≥ ${COMPRESS_ADX_MIN}` : ""}${COMPRESS_ADX_MIN > 0 && COMPRESS_ADX_MAX > 0 ? " e " : ""}${COMPRESS_ADX_MAX > 0 ? `< ${COMPRESS_ADX_MAX}` : ""}` : ""}${COMPRESS_ADX_SUBINDO ? `${COMPRESS_ADX_MIN > 0 || COMPRESS_ADX_MAX > 0 ? " " : "ADX "}subindo` : ""}`;
const COMPRESS_ADX_SUBINDO = (Deno.env.get("COMPRESS_ADX_SUBINDO") ?? "1") !== "0";
const COMPRESS_ADX_SUBINDO_MIN = numEnv("COMPRESS_ADX_SUBINDO_MIN", "0.5");
const COMPRESS_COOLDOWN_MIN = numEnv("COMPRESS_COOLDOWN_MIN", "180");
// V85: no /compressao, "rompeu de verdade" = o preço andou pelo menos COMPRESS_ROMPE_PCT% (padrão 5) pra algum lado, a partir da entrada, dentro da janela do mfe/mae do placar (≈24h);
// "limpo" = andou isso a favor de um lado e menos que COMPRESS_LIMPO_PCT% (padrão 2,5) pro outro.
const COMPRESS_ROMPE_PCT = numEnv("COMPRESS_ROMPE_PCT", "5");
// V90: filtro de volatilidade da moeda no alerta de compressão. Amplitude = mediana, nas últimas COMPRESS_AMP_VELAS velas, do quanto o preço varia (máx−mín) em janelas de 24h.
// COMPRESS_AMP_MIN_PCT = 0 (padrão) NÃO filtra nada: só grava a amplitude de cada alerta. Ex.: 7 manda alerta só de moeda com amplitude de 24h ≥ 7%.
const COMPRESS_AMP_MIN_PCT = numEnv("COMPRESS_AMP_MIN_PCT", "0");
const COMPRESS_AMP_VELAS = numEnv("COMPRESS_AMP_VELAS", "480");
// V95: movimento mínimo da moeda no dia (|variação 24h| na hora do alerta) pra mandar compressão. 0 (padrão) = não filtra. Ex.: 3 corta a compressão de moeda parada (< 3% no dia).
// Diferente da amplitude acima, esse número é conhecido NA HORA do alerta (sem "visão do futuro"), então a medição do /compressao por movimento do dia é honesta.
const COMPRESS_PCT24_MIN = numEnv("COMPRESS_PCT24_MIN", "0");
const COMPRESS_LIMPO_PCT = numEnv("COMPRESS_LIMPO_PCT", "2.5");
const COMPRESS_MAX_POR_RODADA = numEnv("COMPRESS_MAX_POR_RODADA", "2");
const COMPRESS_ROT_N = numEnv("COMPRESS_ROT_N", "25");
const COMPRESS_PTS_MAX = 12;
const LISTA_POOL_LADO = numEnv("LISTA_POOL_LADO", "30");
// V36: prioridade do REPIQUE nos dois lados — SHORT = moeda que despencou, repicou até a faixa e está sendo rejeitada (retoma a queda);
// LONG = moeda que disparou, recuou até a faixa e está segurando (retoma a alta). Nos dois casos é a favor do movimento anterior.
const REPIQUE_BONUS = numEnv("REPIQUE_BONUS", "1");
const REPIQUE_CONF_MIN = numEnv("REPIQUE_CONF_MIN", "4");
const REPIQUE_COOLDOWN_MIN = numEnv("REPIQUE_COOLDOWN_MIN", "120");
const REPIQUE_MAX_POR_RODADA = numEnv("REPIQUE_MAX_POR_RODADA", "3");
// V104: REPIQUE = continuação do movimento, então só alerta com tendência de verdade:
//   REPIQUE_ADX_MIN (24)      = ADX mínimo (0 desliga). ADX desconhecido (NaN/ausente) não barra.
//   REPIQUE_DI_OBRIGA (1)     = o +DI/−DI tem que puxar pro lado do repique (LONG: +DI > −DI · SHORT: −DI > +DI). DI neutro (diferença < DI_GAP_MIN) também barra. 0 desliga.
//   REPIQUE_ADX_SUBINDO (0)   = opcional: exige ADX subindo (hoje − 5 velas atrás > REPIQUE_ADX_SUBINDO_MIN = 0.5). Desligado porque o ADX costuma ficar chato durante o recuo.
//   REPIQUE_SOMBRA (1)        = o repique que a regra barrar (e que passaria na nota REPIQUE_CONF_MIN) é GRAVADO em silêncio no alertas_log com tipo "repique_sombra"
//                               (fora do /placar, /15min, /saida etc.; o /repsombra compara reais x sombra). Cooldown por moeda+lado REPIQUE_SOMBRA_COOLDOWN_MIN (120)
//                               e no máx. REPIQUE_SOMBRA_MAX_POR_RODADA (5) por radar e rodada.
const REPIQUE_ADX_MIN = numEnv("REPIQUE_ADX_MIN", "24");
const REPIQUE_DI_OBRIGA = (Deno.env.get("REPIQUE_DI_OBRIGA") ?? "1") !== "0";
const REPIQUE_ADX_SUBINDO = (Deno.env.get("REPIQUE_ADX_SUBINDO") ?? "0") === "1";
const REPIQUE_ADX_SUBINDO_MIN = numEnv("REPIQUE_ADX_SUBINDO_MIN", "0.5");
const REPIQUE_SOMBRA_ON = (Deno.env.get("REPIQUE_SOMBRA") ?? "1") !== "0";
const REPIQUE_SOMBRA_COOLDOWN_MIN = numEnv("REPIQUE_SOMBRA_COOLDOWN_MIN", "120");
const REPIQUE_SOMBRA_MAX_POR_RODADA = numEnv("REPIQUE_SOMBRA_MAX_POR_RODADA", "5");
const REP_SOMBRA_TIPO = "repique_sombra";
// V104: motivos pelos quais um REPIQUE é barrado: "ADX" (abaixo do mínimo), "ADX-" (não está subindo, se REPIQUE_ADX_SUBINDO=1), "DI-" (DI puxa pro lado contrário), "DI0" (DI neutro)
function repMotivos(lado: "long" | "short", adx: number | null | undefined, adxAntes: number | null | undefined, di: "long" | "short" | null | undefined): string[] {
  const m: string[] = [];
  const adxOk = typeof adx === "number" && isFinite(adx);
  if (REPIQUE_ADX_MIN > 0 && adxOk && adx! < REPIQUE_ADX_MIN) m.push("ADX");
  if (REPIQUE_ADX_SUBINDO && adxOk && typeof adxAntes === "number" && isFinite(adxAntes) && !(adx! - adxAntes > REPIQUE_ADX_SUBINDO_MIN)) m.push("ADX-");
  if (REPIQUE_DI_OBRIGA && di !== lado) m.push(di == null ? "DI0" : "DI-");
  return m;
}
const repRegraTxt = () => {
  const p: string[] = [];
  if (REPIQUE_ADX_MIN > 0) p.push(`ADX ≥ ${REPIQUE_ADX_MIN}${REPIQUE_ADX_SUBINDO ? " e subindo" : ""}`);
  else if (REPIQUE_ADX_SUBINDO) p.push("ADX subindo");
  if (REPIQUE_DI_OBRIGA) p.push("DI a favor");
  return p.length ? p.join(" e ") : "sem corte por ADX/DI";
};
const topoOk = (t?: FundoRes | null) => !!t && t.conf >= (t.repique && !t.caindoFaca ? REPIQUE_CONF_MIN : TOPO_CONF_MIN);
const fundoOk = (b?: FundoRes | null) => !!b && b.conf >= (b.repique && !b.caindoFaca ? REPIQUE_CONF_MIN : FUNDO_CONF_MIN);
let _compCursor = 0;
const FUNDO_CONF_MIN = numEnv("FUNDO_CONF_MIN", "5");
const FUNDO_PRE_MIN = numEnv("FUNDO_PRE_MIN", "5");
const FUNDO_LIBERA_LONG = (Deno.env.get("FUNDO_LIBERA_LONG") || "1") !== "0";
const CONF_MIN_FUNDO_LONG = numEnv("CONF_MIN_FUNDO_LONG", "6");
const FUNDO_COOLDOWN_MIN = numEnv("FUNDO_COOLDOWN_MIN", "240");
// V97: radar de fundo (exceto repique ⭐) NÃO alerta com ADX alto (histórico dos radares: ADX >= 30 antes do alerta funcionou só 35% e invalidou 63%, n=48;
// com ADX < 30 funcionou ~71%). Só o ALERTA AUTOMÁTICO do radar é cortado; /fundo, /analise e a pontuação seguem como estavam.
// FUNDO_ADX_MAX=0 desliga. Teste sem mexer no código: ajuste o secret (ex.: 25 corta mais, 35 corta menos).
const FUNDO_ADX_MAX = numEnv("FUNDO_ADX_MAX", "30");
// V98: MODO FACA ("faca caindo"): o fundo com ADX alto (que o radar de fundo agora NÃO avisa) é tratado como CONTINUAÇÃO da queda, lado SHORT.
//   FACA_MODO=sombra (padrão)  grava os candidatos em silêncio numa linha própria (_FACA_SOMBRA_), sem mandar aviso e SEM entrar no /placar,
//                              /saida, /15min nem nos resumos (não usa a tabela do placar). Resultado com /faca [dias].
//   FACA_MODO=alerta           além de gravar, manda o aviso 🔪 (experimental) nos chats ativos.   FACA_MODO=off  desliga tudo.
// FACA_ADX_MIN (30) = ADX mínimo · FACA_CONF_MIN (5) = nota mínima pra AVISAR (modo alerta) · FACA_GRAVA_MIN (3) = nota mínima pra GRAVAR na sombra (amostra; nunca acima de FACA_CONF_MIN) · FACA_COOLDOWN_MIN (240)
// por moeda · FACA_MAX_POR_RODADA (2) · FACA_DIAS_GUARDA (14). Só avalia até ~9 dias de velas, como o /radar.
const FACA_MODO: "off" | "sombra" | "alerta" = (() => {
  const v = String(Deno.env.get("FACA_MODO") || "sombra").trim().toLowerCase();
  if (["off", "0", "desligado", "nao", "não"].includes(v)) return "off";
  if (["alerta", "on", "1", "ligado", "aviso"].includes(v)) return "alerta";
  return "sombra";
})();
const FACA_ADX_MIN = numEnv("FACA_ADX_MIN", "30");
const FACA_CONF_MIN = numEnv("FACA_CONF_MIN", "5"); // nota mínima pra AVISAR (só vale com FACA_MODO=alerta)
const FACA_GRAVA_MIN = Math.min(FACA_CONF_MIN, numEnv("FACA_GRAVA_MIN", "3")); // nota mínima pra GRAVAR (amostra pro /faca); nunca acima de FACA_CONF_MIN
const FACA_COOLDOWN_MIN = numEnv("FACA_COOLDOWN_MIN", "240");
const FACA_MAX_POR_RODADA = numEnv("FACA_MAX_POR_RODADA", "2");
const FACA_DIAS_GUARDA = numEnv("FACA_DIAS_GUARDA", "14");
const FACA_ROW = "_FACA_SOMBRA_";
const FACA_MAX = 600;
const FUNDO_MAX_POR_RODADA = numEnv("FUNDO_MAX_POR_RODADA", "2");
const FUNDO_BTC_QUEDA_PCT = numEnv("FUNDO_BTC_QUEDA_PCT", "1.5");
// V42: FUNDO_PTS_MAX é o teto real de pontos somando o pré-filtro (calcFundoPre/calcTopoPre, até 13) +
// o que fundoFinal/topoFinal ainda somam depois (funding até +2, OI até +1, BTC até +1 = até +4). Antes
// estava em 13 (só o pré-filtro), então qualquer moeda com 13 a 17 pontos aparecia igual, 10/10 — o topo
// da escala ficava "achatado" e não dava pra diferenciar um sinal forte de um excepcional. FUNDO_CONF_MIN/
// TOPO_CONF_MIN/REPIQUE_CONF_MIN foram recalculados junto pra continuar exigindo os MESMOS pontos brutos de
// antes (nenhum alerta que disparava deixa de disparar, e vice-versa) — só o número mostrado ficou exato.
// V46: antes era um número fixo (17) calculado na mão somando o melhor caso de calcFundoPre/calcTopoPre
// (13, incluindo o bônus de repique) + fundoFinal/topoFinal (funding +2, OI +1, BTC +1 = 4). Só batia porque
// REPIQUE_BONUS era 1; se REPIQUE_BONUS mudar pela env sem atualizar esse número junto, a escala 0-10
// desalinha em silêncio — o mesmo bug que o comentário V43 (CONFIANCA_TOTAL_MIN/MAX, acima) já corrigiu na
// pontuar(). Aqui o teto vira derivado, então nunca fica desatualizado sozinho.
const FUNDO_PTS_MAX = 16 + Math.max(0, REPIQUE_BONUS);
// V54: com os padrões atuais (FUNDO_PTS_MAX=17, confiança = round(pts*10/17)), FUNDO/TOPO_CONF_MIN=5 exige >= 8 pontos
// brutos e REPIQUE_CONF_MIN=4 exige >= 6; o pré-filtro exige 5 (repique: 4). O repique já traz +2 (toque) +1 (bônus)
// dentro desses pontos, então na prática precisa de ~3 pontos de outras evidências contra ~8 do fundo/topo comum.
// É uma vantagem grande e proposital (repique = a favor do movimento anterior, com a faixa como suporte/resistência);
// se mudar REPIQUE_CONF_MIN/REPIQUE_BONUS, reconferir estas contas e validar no /placar (repique LONG/SHORT vs. comum).
// piso teórico: caindoFaca (-2) + ADX acelerando (-1) no pré-filtro, + OI subindo (-1) + BTC contra (-2) no
// final = -6. Não afeta a escala (confFundo trava em 0 com Math.max), só serve de referência pra auto-checagem abaixo.
const FUNDO_PTS_MIN = -6;
let _fundoPtsExtremoMin = FUNDO_PTS_MIN, _fundoPtsExtremoMax = FUNDO_PTS_MAX;
function checarDerivaFundo(total: number) {
  if (total < FUNDO_PTS_MIN && total < _fundoPtsExtremoMin) {
    _fundoPtsExtremoMin = total;
    const msg = `⚠️ confFundo(): total ${total} abaixo do piso assumido (FUNDO_PTS_MIN=${FUNDO_PTS_MIN}) — recalcule o comentário V46 acima de FUNDO_PTS_MAX/MIN`;
    console.log(msg);
    avisarAdmin(msg);
  } else if (total > FUNDO_PTS_MAX && total > _fundoPtsExtremoMax) {
    _fundoPtsExtremoMax = total;
    const msg = `⚠️ confFundo(): total ${total} acima do teto assumido (FUNDO_PTS_MAX=${FUNDO_PTS_MAX}) — recalcule o comentário V46 acima de FUNDO_PTS_MAX/MIN`;
    console.log(msg);
    avisarAdmin(msg);
  }
}
const _fundoAvaliado = new Map<string, number>();
const WEBHOOK_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") || "";
const CRON_SO_HEADER = (Deno.env.get("CRON_SO_HEADER") || "0") === "1";
const BTC_DIR_ON = (Deno.env.get("BTC_DIR") || "1") !== "0";
const BTC_DIR_PCT = numEnv("BTC_DIR_PCT", "1.5");
const BTC_BLOQ_REV_PCT = numEnv("BTC_BLOQ_REV_PCT", "2.5");
const ESTADO_ROW = "_ESTADO_";
const FINAL_ON = (Deno.env.get("ALERTA_FINAL") || "1") !== "0";
const FINAL_JANELA_MAX_MIN = numEnv("FINAL_JANELA_MAX_MIN", "5");
const FINAL_JANELA_MIN_MIN = numEnv("FINAL_JANELA_MIN_MIN", "1");
const FINAL_ENTRADA_PCT = numEnv("FINAL_ENTRADA_PCT", "0.03");
const FINAL_CANCELA_PCT = numEnv("FINAL_CANCELA_PCT", "0.1");
const FINAL_CANCELA_ATR = numEnv("FINAL_CANCELA_ATR", "0.15");
const FINAL_PREFILTRO_PCT = numEnv("FINAL_PREFILTRO_PCT", "0.4");
const FINAL_MAX_POR_RODADA = numEnv("FINAL_MAX_POR_RODADA", "3");
const FINAL_MAX_CAND = numEnv("FINAL_MAX_CAND", "8");
// V41: cluster/rotação — a partir de quantas moedas "chegando" juntas no pool vale avisar que pode ser o
// mercado todo se movendo (não edge da moeda específica).
const CLUSTER_ALERTA_MIN = numEnv("CLUSTER_ALERTA_MIN", "4");
const FINAL_PREPARE_MAX_MIN = numEnv("FINAL_PREPARE_MAX_MIN", "10");
const FINAL_PREPARE_DIST_PCT = numEnv("FINAL_PREPARE_DIST_PCT", "0.15");
const FINAL_PREPARE_MAX = numEnv("FINAL_PREPARE_MAX", "3");
const FINAL_PREPARE_FOLGA_CONF = numEnv("FINAL_PREPARE_FOLGA_CONF", "1");
const FINAL_PROXIMA_DIST_PCT = numEnv("FINAL_PROXIMA_DIST_PCT", "0.3");
const FINAL_PLACAR_ON = (Deno.env.get("FINAL_PLACAR") || "1") !== "0";
function igualSeguro(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a), eb = new TextEncoder().encode(b);
  let d = ea.length ^ eb.length;
  const n = Math.max(ea.length, eb.length);
  for (let i = 0; i < n; i++) d |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return d === 0;
}
// Lê uma env var numérica com fallback seguro. `Number(Deno.env.get(X) || "padrao")` só cai no padrão
// quando a env var está AUSENTE/VAZIA — se alguém digitar um valor inválido no Secret (ex. "8%" em vez
// de "8"), Number(...) vira NaN e essa NaN se propaga em silêncio por todo comparador (>=, <, etc sempre
// dão false), desligando filtros e limiares sem nenhum aviso. numEnv() pega esse caso: loga 1x e cai no
// padrão em vez de deixar a NaN vazar.
function numEnv(nome: string, padrao: string): number {
  const bruto = Deno.env.get(nome);
  _cfgNum.set(nome, { padrao, bruto });
  const def = Number(padrao);
  if (bruto === undefined || bruto === "") return def;
  const v = Number(bruto);
  if (!isFinite(v)) {
    if (!_numEnvAvisado.has(nome)) {
      _numEnvAvisado.add(nome);
      console.log(`⚠️ env var ${nome}="${bruto}" não é um número válido — usando o padrão ${padrao}`);
    }
    return def;
  }
  return v;
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
  ["🚀 Oportunidade", "/oportunidade"], ["🔄 Reversão", "/reversao"], ["🟢 Fundo", "/fundo"], ["🔴 Topo", "/topo"], ["📋 Lista", "/lista"],
  ["📊 Placar", "/placar"], ["⏱ 15min", "/15min"], ["🚪 Saída", "/saida"], ["🤖 Robô", "/robo"],
  ["🌅 Resumo", "/resumo"], ["📅 Agenda", "/agenda"], ["📰 Notícia", "/noticia"], ["🧾 Meu placar", "/meuplacar"],
  ["⏸ Pausar", "/pausar"],
];
const TECLADO_CMD: Record<string, string> = Object.fromEntries(TECLADO_ITENS.map(([l, c]) => [l.toLowerCase(), c]));
const TECLADO_FIXO = (() => {
  const rows: { text: string }[][] = [];
  for (let i = 0; i < TECLADO_ITENS.length; i += 3) rows.push(TECLADO_ITENS.slice(i, i + 3).map(([l]) => ({ text: l })));
  return rows;
})();
// Botão "Menu" fixo ao lado da caixa de digitar (setChatMenuButton), separado do teclado de atalhos.
// Roda uma vez por cold start; é idempotente, então repetir não tem custo.
async function configurarMenuBotao() {
  if (!TELEGRAM_TOKEN) return;
  const comandos = [
    { command: "start", description: "Como o robô e os alertas funcionam" },
    ...TECLADO_ITENS.map(([label, cmd]) => ({ command: cmd.replace("/", ""), description: label.replace(/^\S+\s*/, "") || label })),
    { command: "analise", description: "Analisar uma moeda específica" },
    { command: "comandos", description: "Lista de todos os comandos" },
    { command: "help", description: "Como o robô e os alertas funcionam" },
    { command: "status", description: "Testar as conexões" },
    { command: "modo", description: "Trocar entre Novato e Experiente" },
  ];
  try {
    await fetch(`${TG_API}/setMyCommands`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commands: comandos }),
    });
    await fetch(`${TG_API}/setChatMenuButton`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ menu_button: { type: "commands" } }),
    });
  } catch (e) { console.log("⚠️ não configurei o botão de menu", e); }
}
configurarMenuBotao();
// V74: apagarMsgStatus separa "ok" / "gone" (400-404: mensagem já não existe ou não dá mais pra apagar — comum quando um alerta novo
// substitui o velho) de "retry" (429, 5xx ou rede — erro temporário; vale tentar de novo). apagarMsg segue devolvendo boolean como antes.
async function apagarMsgStatus(chatId: number | string, id: number): Promise<"ok" | "gone" | "retry"> {
  if (ehCaptura(chatId)) { const cap = _capturas.get(String(chatId))!; if (id >= 1 && id <= cap.msgs.length) cap.msgs[id - 1] = null; return "ok"; } // V109: some com o "aguarde" do pedido
  try {
    const r = await fetch(`${TG_API}/deleteMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId, message_id: id }) });
    const j: any = await J(r);
    if (j?.ok !== false) return "ok";
    const code = Number(j?.error_code);
    return code === 429 || code >= 500 ? "retry" : "gone";
  } catch { return "retry"; }
}
async function apagarMsg(chatId: number | string, id: number): Promise<boolean> {
  return (await apagarMsgStatus(chatId, id)) === "ok";
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
// V38: modo Novato (padrão, mensagens explicadas) x Experiente (só confirmações e números).
// Guardado por chat no Supabase (mesma tabela dos outros flags); cache em memória evita 1 SELECT por mensagem.
type Modo = "novato" | "experiente";
const MODO_PREFIXO = "_MODO_";
const _modoCache = new Map<string, Modo>();
async function getModo(chatId: number | string): Promise<Modo> {
  const chave = String(chatId);
  if (_modoCache.has(chave)) return _modoCache.get(chave)!;
  let modo: Modo = "novato";
  try {
    const SB = getSupabase();
    if (SB) {
      const { data } = await SB.from(TAB).select("last_status").eq("instid", `${MODO_PREFIXO}${chatId}`).maybeSingle();
      if (data?.last_status === "experiente") modo = "experiente";
    }
  } catch { }
  _modoCache.set(chave, modo);
  return modo;
}
async function setModo(chatId: number | string, modo: Modo) {
  _modoCache.set(String(chatId), modo);
  try { const SB = getSupabase(); if (SB) await upsertLinha(SB, `${MODO_PREFIXO}${chatId}`, { last_status: modo }); } catch { }
}
async function modoJaEscolhido(chatId: number | string): Promise<boolean> {
  try {
    const SB = getSupabase();
    if (!SB) return true; // sem Supabase não dá pra lembrar a escolha, então não pergunta de novo a cada /start
    const { data } = await SB.from(TAB).select("instid").eq("instid", `${MODO_PREFIXO}${chatId}`).maybeSingle();
    return !!data;
  } catch { return true; }
}
// Reduz o texto pro modo Experiente: tira os blocos <i>explicativo/rodapé</i> e encurta a lista de
// motivos (✅/⚠️) do "🧭 Sinal de ...: X/10" pra só a nota. Roda em cima do texto já pronto, então
// vale pra toda mensagem do bot (alertas automáticos e comandos manuais) sem duplicar cada função.
function compactarExperiente(texto: string): string {
  let t = texto
    .replace(/\n?<i>[\s\S]*?<\/i>/g, "")
    // Qualquer bloco "🧭 ... X/10": mantém o cabeçalho (e o resumo "📊 Filtros: N a favor · N contra" se vier
    // logo abaixo) mas corta a lista de motivos ✅/⚠️ linha a linha. Antes só pegava "🧭 Sinal de ..." (usado no
    // radar de fundo/topo/compressão); não pegava "🧭 Confiança: ..." — que é o bloco que sai em TODO alerta
    // automático (checarAlertaFinal/runAlertaProativo) e no /analise, então era o principal motivo de ainda
    // sobrar muito texto no modo Experiente.
    .replace(/(🧭 [^\n]*\d+\/10[^\n]*(?:\nMovimento: [^\n]*)?(?:\n {3}📊[^\n]*)?)(?:\n {3}[✅⚠️][^\n]*)+/g, "$1")
    // "Ligar o robô?": mantém a confirmação (PREPARE/LIGUE AGORA/LIGUE O ROBÔ AGORA/Ainda não/Já cruzou) + a 1ª
    // frase (que já traz a distância/preço/tempo), corta a explicação de regra que vem depois na mesma linha.
    .replace(/(<b>(?:Já cruzou|LIGUE O ROBÔ AGORA|LIGUE AGORA|PREPARE|Ainda não)<\/b>[^\n]*?\.)(?=\s[A-ZÀ-Ú])[^\n]*/g, "$1")
    // "🔁 Se o preço recuar..." e "Robô entra no fechamento": linhas de regra fixa que se repetem em toda
    // mensagem — quem já está no modo Experiente já sabe a regra, então saem inteiras.
    .replace(/\n🔁 Se o preço recuar pra dentro antes do fechamento, eu aviso pra desligar\.\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return t;
}
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
// POST genérico pra API do Telegram com 1 retry em 429 (flood control). O Telegram manda quanto esperar
// em parameters.retry_after (segundos); aqui a espera é limitada a TG_RETRY_MAX_S pra não travar a função
// serverless por muito tempo numa rodada de cron. Se ainda vier 429 depois do retry, desiste (j.ok = false).
const TG_RETRY_MAX_S = numEnv("TG_RETRY_MAX_S", "10");
async function tgPost(path: string, body: any): Promise<any> {
  const r = await fetch(`${TG_API}/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  let j: any = await J(r);
  if (j?.ok === false && j?.error_code === 429) {
    const espera = Math.min(Number(j?.parameters?.retry_after) || 1, TG_RETRY_MAX_S);
    console.log(`⏳ Telegram 429 em ${path}, aguardando ${espera}s e tentando de novo`);
    await sleep(espera * 1000);
    const r2 = await fetch(`${TG_API}/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    j = await J(r2);
  }
  return j;
}
// Auditoria #14: sendTelegram registrava TODA mensagem enviada (id) na lista "_UI_{chat}" usada por uiLimpar
// pra apagar a resposta anterior a cada novo comando "/". Isso incluía alertas proativos (radar de fundo/topo/
// compressão, alerta principal, trailing, RSI esticado, posição fraca, risco — todos via enviarAlertaMoeda),
// avisos de fonte de dados degradada, cron parado, auto-calibração pro dono e o resumo automático de manhã/
// noite: qualquer um desses chegando entre dois comandos do usuário virava "lixo de UI" e sumia sozinho
// (apagado do chat) assim que a pessoa mandasse o próximo /comando — mesmo sem ter lido. O texto do /menu
// promete o oposto ("os alertas do robô só são substituídos por um novo da mesma moeda"), e alertas/risco já
// têm seu próprio ciclo de vida (substituição por moeda via MSG_PREFIXO, autoapagar por tempo). Fix: só entra
// na lista de limpeza quem é de fato resposta de comando (default); sites de envio proativo/broadcast passam
// semUi:true pra não entrar nessa lista.
// Plano B quando o Telegram recusa o HTML: tira as tags que o bot usa (inclusive <a href="...">) e desfaz o escape,
// pra não aparecer "&lt;", "&amp;" nem tag crua na mensagem.
const textoSemHtml = (t: string): string =>
  t.replace(/<\/?(b|i|u|s|a|code|pre)\b[^>]*>/gi, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
async function sendTelegram(chatId: number | string, text: string, botoes?: Botoes, opts?: { semUi?: boolean }): Promise<number | null> {
  if (ehCaptura(chatId)) { const cap = _capturas.get(String(chatId))!; cap.msgs.push(text); return cap.msgs.length; } // V109: pedido de análise, guarda em vez de mandar
  if (await getModo(chatId) === "experiente") text = compactarExperiente(text);
  if (text.length > 4096) text = cortar(text); // rede de segurança: acima disso o Telegram recusa e a mensagem se perdia em silêncio
  // texto grande: o botão "⬆️ Ir ao topo" já vai na própria mensagem (teclado inline, 1 chamada só).
  // O teclado fixo do rodapé continua valendo: o Telegram não o remove quando chega uma mensagem com botões inline.
  const grande = TOPO_MIN_CHARS > 0 && text.length >= TOPO_MIN_CHARS;
  const inline: Botoes | undefined = grande ? [...(botoes ?? []), [BOTAO_TOPO]] : botoes;
  const markup = { reply_markup: inline ? { inline_keyboard: inline } : { keyboard: TECLADO_FIXO, resize_keyboard: true } };
  let id: number | null = null;
  try {
    const mudo = SILENCIO_MODO === "mudo" && emSilencio(); // V107: horário mudo = chega sem som
    const j: any = await tgPost("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true, disable_notification: mudo, ...markup });
    if (j.ok === false) {
      console.log(`⚠️ sendTelegram HTML falhou (${JSON.stringify(j).slice(0,200)}), tentando sem parse_mode`);
      const j2: any = await tgPost("sendMessage", { chat_id: chatId, text: textoSemHtml(text), disable_web_page_preview: true, disable_notification: mudo, ...markup });
      id = j2?.result?.message_id ?? null;
    } else id = j?.result?.message_id ?? null;
  } catch (e) { console.log("Erro sendTelegram", e); }
  if (id && typeof chatId === "number" && !opts?.semUi) await uiRegistrar(chatId, id).catch(() => {});
  return id;
}
const IA_TABELA = "ia_uso";
const IA_LIMITE_DIARIO_GEMINI = numEnv("IA_LIMITE_DIARIO_GEMINI", "0"); // 0 = sem limite
const IA_LIMITE_DIARIO_CLAUDE = numEnv("IA_LIMITE_DIARIO_CLAUDE", "0"); // 0 = sem limite
const IA_AVISO_RESTANTE = numEnv("IA_AVISO_RESTANTE", "5"); // avisa quando faltar isso ou menos
function iaDiaHoje(): string { return new Date(Date.now() + X_TZ_OFFSET_H * 3600000).toISOString().slice(0, 10); }
// Lê o uso de hoje sem gravar nada (usado pra decidir se ainda dá pra consultar antes de gastar chamada de API).
async function iaUsoHoje(SB: any, provedor: "gemini" | "claude"): Promise<number> {
  if (!SB) return 0;
  try {
    const { data } = await SB.from(IA_TABELA).select("contagem").eq("dia", iaDiaHoje()).eq("provedor", provedor).maybeSingle();
    return data?.contagem ?? 0;
  } catch (e) { console.log("⚠️ iaUsoHoje falhou", e); return 0; }
}
// Soma 1 ao contador do dia (upsert manual: lê, soma, grava — sem transação, mas o volume de uso é baixo o
// suficiente pra corrida entre requisições ser um risco desprezível aqui).
async function iaRegistrarUso(SB: any, provedor: "gemini" | "claude"): Promise<number> {
  if (!SB) return 0;
  const dia = iaDiaHoje();
  try {
    const { data } = await SB.from(IA_TABELA).select("contagem").eq("dia", dia).eq("provedor", provedor).maybeSingle();
    const nova = (data?.contagem ?? 0) + 1;
    const { error } = await SB.from(IA_TABELA).upsert({ dia, provedor, contagem: nova }, { onConflict: "dia,provedor" });
    if (error) console.log("⚠️ iaRegistrarUso upsert falhou", error.message);
    return nova;
  } catch (e) { console.log("⚠️ iaRegistrarUso falhou", e); return 0; }
}
const IA_TIMEOUT_MS = numEnv("IA_TIMEOUT_MS", "90000"); // corta a chamada da IA depois disso (evita a função ser derrubada pelo limite do Supabase sem avisar)
const IA_MAX_TOKENS_GEMINI = numEnv("IA_MAX_TOKENS_GEMINI", "4000");
async function chamarGemini(sistema: string, usuario: string): Promise<string | null> {
  const k = Deno.env.get("GEMINI_API_KEY"); if (!k) return null;
  const modelo = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`;
  // modelos 3.x "pensam" antes de responder: nível LOW deixa mais rápido e evita gastar o limite de saída só pensando.
  // GEMINI_THINKING=off desliga esse ajuste.
  const usaThinking = modelo.startsWith("gemini-3") && (Deno.env.get("GEMINI_THINKING") || "low").toLowerCase() !== "off";
  const chamar = (comThinking: boolean) => fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": k },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: sistema }] },
      contents: [{ role: "user", parts: [{ text: usuario }] }],
      generationConfig: { maxOutputTokens: IA_MAX_TOKENS_GEMINI, ...(comThinking ? { thinkingConfig: { thinkingLevel: "LOW" } } : {}) },
    }),
    signal: AbortSignal.timeout(IA_TIMEOUT_MS),
  });
  try {
    let r = await chamar(usaThinking);
    if (!r.ok && r.status === 400 && usaThinking) { console.log("Gemini 400 com thinkingLevel - tentando sem"); r = await chamar(false); }
    if (!r.ok) { console.log("Gemini falhou", r.status, (await r.text().catch(() => "")).slice(0, 200)); return null; }
    const j = await r.json();
    const cand = j?.candidates?.[0];
    const t = (cand?.content?.parts || []).filter((p: any) => !p.thought).map((p: any) => p.text || "").join("").trim();
    if (!t) console.log("Gemini vazio", cand?.finishReason || j?.promptFeedback?.blockReason || "sem motivo");
    return t || null;
  } catch (e) { console.log("Gemini erro", e); return null; }
}
async function chamarClaude(sistema: string, usuario: string): Promise<string | null> {
  const k = Deno.env.get("ANTHROPIC_API_KEY"); if (!k) return null;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": k, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: Deno.env.get("CLAUDE_MODEL") || "claude-haiku-4-5-20251001", max_tokens: 600, system: sistema, messages: [{ role: "user", content: usuario }] }),
      signal: AbortSignal.timeout(IA_TIMEOUT_MS),
    });
    if (!r.ok) { console.log("Claude falhou", r.status, (await r.text().catch(() => "")).slice(0, 200)); return null; }
    const j = await r.json();
    const t = (j?.content || []).map((b: any) => b.text || "").join("").trim();
    return t || null;
  } catch (e) { console.log("Claude erro", e); return null; }
}
// Markdown da IA -> HTML do Telegram (escapa primeiro, cria as tags depois)
function iaMdParaHtml(t: string): string {
  const esc = t.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" } as any)[c]);
  return esc.replace(/\*\*(.+?)\*\*/gs, "<b>$1</b>").replace(/^#{1,6}\s+(.+)$/gm, "<b>$1</b>").replace(/^\s*[*-]\s+/gm, "• ").replace(/(?<![\w*])\*(?!\s)([^*\n]+?)\*(?![\w*])/g, "<i>$1</i>");
}
// /melhor: roda as varreduras de oportunidade e reversão (as mesmas do /oportunidade e /reversao), junta os textos e pede pro Gemini comparar.
// Usa o mesmo limite diário do Gemini (IA_LIMITE_DIARIO_GEMINI) e o mesmo timeout do /pergunta.
async function runMelhor(chatId: number | string, extra: string) {
  if (!Deno.env.get("GEMINI_API_KEY")) { await sendTelegram(chatId, "⚠️ GEMINI_API_KEY não está configurada no Supabase, então não dá pra usar o Gemini."); return; }
  const limite = IA_LIMITE_DIARIO_GEMINI;
  const SB = getSupabase();
  if (limite > 0) {
    const usoAntes = await iaUsoHoje(SB, "gemini");
    if (usoAntes >= limite) { await sendTelegram(chatId, `⛔ Limite diário do Gemini atingido (${usoAntes}/${limite} hoje). Volta a funcionar amanhã, ou aumente IA_LIMITE_DIARIO_GEMINI nos Secrets.`); return; }
  }
  let opo = "", rev = "";
  await runCruzado(chatId, "oportunidade", (m) => { opo = m; });
  await runCruzado(chatId, "reversao", (m) => { rev = m; }); // a 2ª usa o cache de 60s da varredura, então é rápida
  const limparTxt = (t: string) => t.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  const ctx = `=== OPORTUNIDADES (a favor do dia) ===\n${limparTxt(opo)}\n\n=== REVERSÕES (contra o dia) ===\n${limparTxt(rev)}`.slice(0, 12000);
  const cab = "🏆 <b>Gemini · MELHORES AGORA</b>";
  if (!/\d+\.\s/.test(limparTxt(opo)) && !/\d+\.\s/.test(limparTxt(rev))) { await sendTelegram(chatId, `${cab}\nNenhuma moeda passou nos filtros das varreduras agora, então não há o que comparar.`); return; }
  const sistema = "Você compara as moedas listadas nas varreduras abaixo e responde em português, de forma curta e direta. Diga quais são as até 3 melhores para ligar o robô agora, na ordem, com o motivo de cada uma e o principal risco. Considere a confiança X/10, a distância do indicador, a força (ADX), a idade do sinal, ⭐ (repique na faixa) e 🔔 (já no alerta automático). Oportunidade é a favor do dia; reversão é contra o dia e costuma ser mais arriscada. Se nenhuma estiver boa, diga isso. Use só as moedas e os números que estão na lista, não invente nada e não dê recomendação de investimento. Mostre também um risco geral, se houver.";
  const pedido = extra ? extra : "Qual moeda está mais bem posicionada para ligar o robô agora? Compare e faça um ranking curto.";
  const resp = await chamarGemini(sistema, `VARREDURAS:\n${ctx}\n\nPEDIDO: ${pedido}`);
  if (!resp) { await sendTelegram(chatId, `${cab}\n⚠️ O Gemini não respondeu agora (limite, crédito ou erro). Tente de novo daqui a pouco.`); return; }
  let rodape = "";
  if (limite > 0) {
    const usoDepois = await iaRegistrarUso(SB, "gemini");
    const restante = Math.max(0, limite - usoDepois);
    if (restante <= IA_AVISO_RESTANTE) rodape = `\n\n⚠️ <i>Restam ${restante} consulta${restante === 1 ? "" : "s"} do Gemini hoje (limite diário ${limite}).</i>`;
  }
  await sendTelegram(chatId, `${cab}\n${iaMdParaHtml(resp.slice(0, 3500))}${rodape}\n\n<i>É um filtro inicial: confirme a escolhida com /pergunta MOEDA.</i>`);
}
async function runIA(chatId: number | string, moeda: string, extra: string, prov: "gemini" | "claude") {
  const nome = prov === "gemini" ? "Gemini" : "Claude";
  const secret = prov === "gemini" ? "GEMINI_API_KEY" : "ANTHROPIC_API_KEY";
  if (!Deno.env.get(secret)) { await sendTelegram(chatId, `⚠️ ${secret} não está configurada no Supabase, então não dá pra usar o ${nome}.`); return; }
  const limite = prov === "gemini" ? IA_LIMITE_DIARIO_GEMINI : IA_LIMITE_DIARIO_CLAUDE;
  const SB = getSupabase();
  if (limite > 0) {
    const usoAntes = await iaUsoHoje(SB, prov);
    if (usoAntes >= limite) { await sendTelegram(chatId, `⛔ Limite diário do ${nome} atingido (${usoAntes}/${limite} hoje). Volta a funcionar amanhã, ou aumente ${prov === "gemini" ? "IA_LIMITE_DIARIO_GEMINI" : "IA_LIMITE_DIARIO_CLAUDE"} nos Secrets.`); return; }
  }
  let partes: string[] = []; await runAnalise(chatId, moeda, (p) => { partes = p; }); if (!partes.length) return;
  const ctx = partes.join("\n").replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").slice(0, 12000);
  const sistema = "Você responde só com base na análise fornecida, em português, de forma curta e direta. Se a análise não trouxer a informação pedida, diga que não consta. Não invente números e não dê recomendação de investimento. Sempre mostre os DOIS lados: os pontos a favor e os riscos ou sinais de atenção que constarem na análise (radar de topo ou fundo, notas de topo e fundo, RSI, distância da faixa, quanto o preço já devolveu da máxima), mesmo que o quadro geral pareça positivo ou negativo. Não omita um risco só porque a tendência é forte. Cite os números da análise que sustentam cada ponto.";
  const pedido = extra ? extra : "Dê um veredito curto: o cenário está a favor de ligar o robô agora, de esperar ou de evitar? Cite os 2 ou 3 motivos principais e o principal risco.";
  const usuario = `ANÁLISE:\n${ctx}\n\nPEDIDO: ${pedido}`;
  const resp = prov === "gemini" ? await chamarGemini(sistema, usuario) : await chamarClaude(sistema, usuario);
  const limpo = (t: string) => t.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" } as any)[c]);
  const cab = `${prov === "gemini" ? "🤖" : "⚖️"} <b>${nome} · ${limpo(moeda).slice(0, 20).toUpperCase()}</b>`;
  if (!resp) { await sendTelegram(chatId, `${cab}\n⚠️ O ${nome} não respondeu agora (limite, crédito ou erro). Tente de novo daqui a pouco.`); return; }
  let rodape = "";
  if (limite > 0) {
    const usoDepois = await iaRegistrarUso(SB, prov);
    const restante = Math.max(0, limite - usoDepois);
    if (restante <= IA_AVISO_RESTANTE) rodape = `\n\n⚠️ <i>Restam ${restante} consulta${restante === 1 ? "" : "s"} do ${nome} hoje (limite diário ${limite}).</i>`;
  }
  // a IA responde em Markdown; o Telegram do bot usa HTML. Escapa primeiro (limpo) e só depois cria as tags.
  const md = iaMdParaHtml;
  await sendTelegram(chatId, cortar(`${cab}\n${md(resp.slice(0, 3500))}${rodape}`));
}
// V47: avisos de deriva das escalas (confFundo/pontuar) e de outros erros "silenciosos" só iam pro
// console.log do Deno Deploy — ninguém vê a menos que entre no painel de logs por acaso. avisarAdmin()
// manda o mesmo texto pro chat do admin (ADMIN_CHAT_ID), reaproveitando o sendTelegram normal. Fire-and-
// forget (sem await de quem chama) pra não atrasar o cálculo de pontuação por causa de uma notificação;
// erro de envio cai só no console (não pode ficar chamando avisarAdmin recursivamente se o próprio
// avisarAdmin falhar). Sem ADMIN_CHAT_ID configurado, não faz nada (mesmo comportamento de hoje).
async function avisarAdmin(texto: string): Promise<void> {
  if (!ADMIN_CHAT_ID) return;
  try { await sendTelegram(ADMIN_CHAT_ID, texto, undefined, { semUi: true }); } catch (e) { console.log("⚠️ avisarAdmin falhou", e); }
}
// V39: edita uma mensagem já mandada (usado nos minutos finais da vela, pra atualizar a MESMA mensagem —
// distância/tempo restando — em vez de mandar uma nova a cada rodada do cron). Se a edição falhar (mensagem
// muito antiga, apagada pelo usuário etc.) devolve false pra quem chamou mandar uma mensagem nova.
async function editarTelegram(chatId: number | string, messageId: number, text: string, botoes?: Botoes): Promise<boolean> {
  if (ehCaptura(chatId)) { const cap = _capturas.get(String(chatId))!; if (messageId >= 1 && messageId <= cap.msgs.length) cap.msgs[messageId - 1] = text; else cap.msgs.push(text); return true; } // V109
  let t = text;
  if (await getModo(chatId) === "experiente") t = compactarExperiente(t);
  const markup = botoes ? { reply_markup: { inline_keyboard: botoes } } : {};
  try {
    const j: any = await tgPost("editMessageText", { chat_id: chatId, message_id: messageId, text: t, parse_mode: "HTML", disable_web_page_preview: true, ...markup });
    if (j.ok === false) {
      if (String(j.description || "").includes("message is not modified")) return true;
      console.log(`⚠️ editarTelegram falhou (${JSON.stringify(j).slice(0, 150)}), mandando mensagem nova`);
      return false;
    }
    return true;
  } catch (e) { console.log("Erro editarTelegram", e); return false; }
}
const TOPO_MIN_CHARS = numEnv("TOPO_MIN_CHARS", "700");
const BOTAO_TOPO: Botao = { text: "⬆️ Ir ao topo", callback_data: "topo" };
const DIVISOR = "➖➖➖➖➖➖➖➖➖➖";
const MINI_DIVISOR = "┄┄┄┄┄┄┄┄┄┄"; // separador leve entre itens de uma lista (mais fino que o DIVISOR, que separa seções)
function ma(d: number[], p: number) {
  const k = 2 / (p + 1); let e = d[0]; const o = [e];
  for (let i = 1; i < d.length; i++) { e = d[i] * k + e * (1 - k); o.push(e); }
  return o;
}
// J6_MODO: Juncao 6 RAPIDA (9,20,21,50,60) ou CLASSICA (20,21,50,60,100,200). Secret J6_MODO=rapida liga a rapida; sem o secret (ou "classica") nada muda.
// Use o MESMO valor no motor e no bot de alertas (e a opcao "Juncao 6 RAPIDA" do indicador no TradingView), senao cada um enxerga linhas diferentes.
// Se o motor e o bot de alertas estiverem em projetos Supabase diferentes, o secret precisa ser criado nos DOIS projetos.
const J6_MODO_ENV = (Deno.env.get("J6_MODO") || "classica").trim().toLowerCase().replace(/[\s+_-]/g, "");
// V107: "rapida144" (ou "rapida+144") = Junção 6 RÁPIDA + EMA 144 (média de 9, 20, 21, 50, 60 e 144), igual à opção do indicador no TradingView
const J6_R144 = J6_MODO_ENV === "rapida144" || J6_MODO_ENV === "144";
const J6_RAPIDA = J6_MODO_ENV === "rapida" || J6_R144;
function superV2(closes: number[], peso: number = PESO_SUPREMA) {
  const e9 = ma(closes, 9), e20 = ma(closes, 20), e21 = ma(closes, 21), e50 = ma(closes, 50), e60 = ma(closes, 60), e100 = ma(closes, 100), e200 = ma(closes, 200);
  const e144 = J6_R144 ? ma(closes, 144) : null; // V107
  return closes.map((_, i) => {
    const j3 = (e21[i] + e50[i] + e60[i]) / 3;
    const j6 = e144 ? (e9[i] + e20[i] + e21[i] + e50[i] + e60[i] + e144[i]) / 6 : J6_RAPIDA ? (e9[i] + e20[i] + e21[i] + e50[i] + e60[i]) / 5 : (e20[i] + e21[i] + e50[i] + e60[i] + e100[i] + e200[i]) / 6;
    const exata = (j3 + j6) / 2;
    const suprema = exata * peso + j6 * (1 - peso);
    return { j3, j6, suprema };
  });
}
const _fonte: Record<string, number> = {};
const marcaFonte = (nome: string) => { _fonte[nome] = (_fonte[nome] ?? 0) + 1; };
// Fontes extras de velas (só entram quando BloFin, Bybit e Binance futuros falham). OKX devolve no máx. 300 velas por chamada, mais novas primeiro. O espelho spot da Binance (data-api.binance.vision) não tem bloqueio geográfico, mas é preço spot, não perpétuo.
// V67: fallbacks (OKX / Binance spot) só valem se o preço bater com o das corretoras principais.
// Motivo: o QNT-USDT-SWAP da OKX vale ~49 enquanto BloFin/Bybit/Binance valem ~290, e quando as principais falhavam num ciclo o robô gravava preço errado.
// FALLBACK_BLOQ = moedas que nunca usam OKX/Binance spot (padrão QNT-USDT); FALLBACK_DIV_MAX = divergência máxima aceita (0.25 = 25%); FALLBACK_TRAVA=0 desliga a checagem por preço (a lista de bloqueio continua).
const FALLBACK_BLOQ = new Set((Deno.env.get("FALLBACK_BLOQ") || "QNT-USDT").split(",").map((x) => x.trim().toUpperCase()).filter(Boolean));
const FALLBACK_TRAVA = (Deno.env.get("FALLBACK_TRAVA") || "1") !== "0";
const FALLBACK_DIV_MAX = Number(Deno.env.get("FALLBACK_DIV_MAX") || "0.25");
async function precoReferencia(instId: string): Promise<number | null> {
  const sym = instId.replace("-", "");
  const tenta = async (url: string, pega: (j: any) => any) => {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
      const v = Number(pega(await r.json()));
      return isFinite(v) && v > 0 ? v : null;
    } catch { return null; }
  };
  return (
    (await tenta(`https://openapi.blofin.com/api/v1/market/tickers?instId=${instId}`, (j) => j?.data?.[0]?.last)) ??
    (await tenta(`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${sym}`, (j) => j?.result?.list?.[0]?.lastPrice)) ??
    (await tenta(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${sym}`, (j) => j?.price))
  );
}
// rows no formato OKX/Binance: [ts, o, h, l, c, ...] em ordem cronológica
async function fallbackConfiavel(instId: string, rows: any[], fonte: string): Promise<boolean> {
  if (FALLBACK_BLOQ.has(instId.toUpperCase())) { console.log(`⚠️ ${fonte} ignorada para ${instId} (FALLBACK_BLOQ)`); return false; }
  if (!FALLBACK_TRAVA) return true;
  const ult = parseFloat(rows[rows.length - 1]?.[4]);
  const ref = await precoReferencia(instId);
  if (ref == null || !isFinite(ult) || ult <= 0) return true; // sem referência: não dá pra comparar, mantém o comportamento antigo
  const div = Math.abs(ult - ref) / ref;
  if (div > FALLBACK_DIV_MAX) { console.log(`⚠️ ${fonte} rejeitada para ${instId}: último fechamento ${ult} vs referência ${ref} (${(div * 100).toFixed(0)}% de diferença)`); return false; }
  return true;
}
const FALLBACK_OKX = (Deno.env.get("FALLBACK_OKX") || "0") === "1"; // V67: OKX desligada por padrão (contrato diferente da BloFin, preço pode vir em outra escala); FALLBACK_OKX=1 religa
async function fetchOkxRows(instId: string, bar: string, limit: number): Promise<any[] | null> {
  if (!FALLBACK_OKX) return null;
  try {
    const r = await fetch(`https://www.okx.com/api/v5/market/candles?instId=${instId}-SWAP&bar=${bar}&limit=${Math.min(limit, 300)}`, { signal: AbortSignal.timeout(6000) });
    const j = await r.json();
    if (j.code == "0" && Array.isArray(j.data) && j.data.length > 100) {
      const rows = j.data.slice().reverse();
      if (await fallbackConfiavel(instId, rows, "OKX")) return rows;
    }
  } catch { }
  return null;
}
async function fetchBinanceSpotRows(instId: string, bar: string, limit: number): Promise<any[] | null> {
  try {
    const r = await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${instId.replace("-", "")}&interval=${bar.replace("H", "h")}&limit=${Math.min(limit, 1000)}`, { signal: AbortSignal.timeout(6000) });
    const j = await r.json();
    if (Array.isArray(j) && j.length > 100) { if (await fallbackConfiavel(instId, j, "Binance spot")) return j; }
  } catch { }
  return null;
}
function barToMs(bar: string): number {
  const map: Record<string, number> = { "1m":60000,"3m":180000,"5m":300000,"15m":900000,"30m":1800000,"1H":3600000,"2H":7200000,"4H":14400000,"6H":21600000,"12H":43200000,"1D":86400000,"1W":604800000 };
  return map[bar] || 900000;
}
// V75: BTC e ETH (BTC-USDT / ETH-USDT) usam a BINANCE FUTUROS (BTCUSDT / ETHUSDT perpetuo - o mesmo do painel no TradingView) como fonte PRIMEIRA de velas, preco ao vivo,
// funding, open interest e livro de ofertas. Segunda opcao: Binance spot (data-api.binance.vision, sem bloqueio por regiao). So se as duas falharem cai na cadeia antiga
// (BloFin, Bybit...). Secret BINANCE_BTC_ETH=0 (ou off) volta ao comportamento antigo. As outras moedas nao mudam.
const BINANCE_BTC_ETH = !/^(0|off|false|nao|no)$/i.test((Deno.env.get("BINANCE_BTC_ETH") || "on").trim());
const ehBtcEth = (instId: string): boolean => BINANCE_BTC_ETH && (instId === "BTC-USDT" || instId === "ETH-USDT");
// de onde vieram as velas de BTC/ETH na ultima leitura (aparece no aviso do filtro lateral e no log, pra conferir)
const _fonteBtcEth: Record<string, string> = {};
const FONTE_FORA_BINANCE = "⚠️ FORA da Binance (BloFin/Bybit)";
async function binanceGet(path: string, host: string = "https://fapi.binance.com"): Promise<any | null> {
  const nome = host.includes("vision") ? "Binance spot" : "Binance futuros";
  try {
    const r = await fetch(`${host}${path}`, { signal: AbortSignal.timeout(8000) });
    const txt = await r.text();
    let j: any = null;
    try { j = JSON.parse(txt); } catch { }
    if (!r.ok || j === null) { console.log(`⚠️ ${nome} ${path.split("?")[0]} HTTP ${r.status}: ${txt.slice(0, 160)}`); return null; }
    if (!Array.isArray(j) && j.code !== undefined && Number(j.code) !== 0 && Number(j.code) !== 200) { console.log(`⚠️ ${nome} ${path.split("?")[0]} recusou: ${txt.slice(0, 160)}`); return null; }
    return j;
  } catch (e) { console.log(`⚠️ ${nome} ${path.split("?")[0]} falhou: ${e}`); return null; }
}
// velas BTC/ETH: 1) Binance futuros  2) Binance spot  3) null -> cadeia antiga
async function binanceKlinesBtcEth(instId: string, bar: string, limit: number): Promise<any[] | null> {
  const iv = /[HDW]$/.test(bar) ? bar.toLowerCase() : bar;
  const sym = instId.replace("-", "");
  const jf = await binanceGet(`/fapi/v1/klines?symbol=${sym}&interval=${iv}&limit=${Math.min(limit, 1500)}`);
  if (Array.isArray(jf) && jf.length > 100) { if (_fonteBtcEth[instId] !== "Binance futuros") console.log(`📊 ${instId} velas: Binance futuros`); _fonteBtcEth[instId] = "Binance futuros"; return jf; }
  const js = await binanceGet(`/api/v3/klines?symbol=${sym}&interval=${iv}&limit=${Math.min(limit, 1000)}`, "https://data-api.binance.vision");
  if (Array.isArray(js) && js.length > 100) { if (_fonteBtcEth[instId] !== "Binance spot") console.log(`📊 ${instId} velas: Binance spot (futuros indisponivel)`); _fonteBtcEth[instId] = "Binance spot"; return js; }
  if (_fonteBtcEth[instId] !== FONTE_FORA_BINANCE) console.log(`❌ ${instId}: Binance futuros E spot falharam - usando a cadeia antiga (BloFin/Bybit)`);
  _fonteBtcEth[instId] = FONTE_FORA_BINANCE;
  return null;
}
async function getCandles(instId: string, bar: string, limit: number = CANDLES_LIMIT_PADRAO) {
  const sym = instId.replace("-", "");
  const periodo = barToMs(bar);
  const aberturaAtual = Math.floor(Date.now() / periodo) * periodo;
  const stripCloses = (rows: [number, number][]) => {
    while (rows.length && rows[rows.length - 1][0] >= aberturaAtual) rows.pop();
    return rows.map((r) => r[1]);
  };
  if (ehBtcEth(instId)) {
    const jb = await binanceKlinesBtcEth(instId, bar, limit);
    if (jb) { marcaFonte(_fonteBtcEth[instId] === "Binance spot" ? "Binance spot" : "Binance"); return stripCloses(jb.map((c: any) => [parseInt(c[0]), parseFloat(c[4])] as [number, number])); }
  }
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
  { const rows = await fetchOkxRows(instId, bar, limit); if (rows) { marcaFonte("OKX"); return stripCloses(rows.map((c: any) => [parseInt(c[0]), parseFloat(c[4])] as [number, number])); } }
  { const rows = await fetchBinanceSpotRows(instId, bar, limit); if (rows) { marcaFonte("Binance spot"); return stripCloses(rows.map((c: any) => [parseInt(c[0]), parseFloat(c[4])] as [number, number])); } }
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
  if (ehBtcEth(instId)) {
    const jp = await binanceGet(`/fapi/v1/ticker/price?symbol=${instId.replace("-", "")}`);
    const pf = Number(jp?.price);
    if (isFinite(pf) && pf > 0) return pf;
    const js = await binanceGet(`/api/v3/ticker/price?symbol=${instId.replace("-", "")}`, "https://data-api.binance.vision");
    const ps = Number(js?.price);
    if (isFinite(ps) && ps > 0) return ps;
  }
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
type IndicadorInfo = { instId: string; preco: number; topo: number; fundo: number; distAbs: number; regiao: string; idadeCandles: number | null; aprox?: Aprox | null; larguraPct?: number; larguraRel?: number; inclinaPct?: number; inclinaRel?: number; compCandles?: number };
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
  let larguraRel = 1, larguraMed = 0;
  if (idx >= 30) {
    const hist: number[] = [];
    for (let k = Math.max(0, idx - 96); k < idx; k++) { const w = largK(k); if (isFinite(w) && w > 0) hist.push(w); }
    const med = xMediana(hist);
    larguraMed = med;
    if (med > 0 && isFinite(larguraPct)) larguraRel = larguraPct / med;
  }
  // V36: há quantas velas seguidas a faixa está comprimida (≤ SQUEEZE_REL da largura típica)
  let compCandles = 0;
  if (larguraMed > 0) {
    for (let k = idx; k >= Math.max(0, idx - 48); k--) {
      const w = largK(k);
      if (isFinite(w) && w <= SQUEEZE_REL * larguraMed) compCandles++; else break;
    }
  }
  // V36: inclinação do meio da faixa nas últimas INCLINA_JAN velas, em "velas típicas por vela" (sinal: + subindo, − descendo)
  let inclinaPct = 0, inclinaRel = 0;
  if (INCLINA_JAN >= 2 && idx >= INCLINA_JAN + 1) {
    const meio = (k: number) => (Math.max(jData[k].suprema, jData[k].j6) + Math.min(jData[k].suprema, jData[k].j6)) / 2;
    const m0 = meio(idx - INCLINA_JAN), m1 = meio(idx);
    if (m0 > 0 && isFinite(m0) && isFinite(m1)) {
      inclinaPct = ((m1 - m0) / m0) * 100;
      const rets: number[] = [];
      for (let k = Math.max(1, idx - 288); k <= idx; k++) if (closes[k - 1] > 0) rets.push(Math.abs((closes[k] - closes[k - 1]) / closes[k - 1]) * 100);
      const medRet = xMediana(rets);
      if (medRet > 0 && isFinite(medRet)) inclinaRel = inclinaPct / INCLINA_JAN / medRet;
    }
  }
  return { instId, preco, topo, fundo, distAbs, regiao, idadeCandles, aprox, larguraPct, larguraRel, inclinaPct, inclinaRel, compCandles };
}
function inclinaTxt(info: IndicadorInfo): string {
  const r = info.inclinaRel;
  if (r === undefined || !isFinite(r)) return "sem dados";
  const a = Math.abs(r), seta = r < 0 ? "↘ descendo" : "↗ subindo";
  if (a <= INCLINA_PLANA) return `→ plana (${r >= 0 ? "+" : ""}${r.toFixed(2)})`;
  return `${seta} ${a >= INCLINA_FORTE ? "forte" : a >= INCLINA_MOD ? "moderada" : "leve"} (${r >= 0 ? "+" : ""}${r.toFixed(2)})`;
}
async function calcIndicadorLimit(instId: string, limit: number): Promise<IndicadorInfo | null> {
  return calcIndicadorDeCloses(instId, await getCandles(instId, TIMEFRAME, limit));
}
const calcIndicador500 = (instId: string) => calcIndicadorLimit(instId, CANDLES_LIMIT_PRECISO);
function indicadorTxt(info: IndicadorInfo | null) {
  if (!info) return `Indicador: sem dado`;
  return `Indicador: ${info.distAbs.toFixed(3)}% ${statusIndicador(info.distAbs)} (${info.regiao})`;
}
function upDeTicker(t: any, last: number): number {
  const low = parseFloat(t?.low24h || "0");
  return low > 0 && last >= low ? ((last - low) / low) * 100 : 0;
}
// alta em % desde o fundo recente (velas): pega moeda que despencou e repicou, mesmo com o dia ainda negativo
function altaDoVale(l: number[], preco: number, jan: number = FUNDO_JAN_PICO): number {
  const n = Math.min(l.length, jan);
  if (n < 1 || !(preco > 0)) return 0;
  let vale = Infinity;
  for (let i = l.length - n; i < l.length; i++) if (l[i] > 0 && l[i] < vale) vale = l[i];
  return isFinite(vale) && preco > vale ? ((preco - vale) / vale) * 100 : 0;
}
const altaEfetiva = (pct: number, up?: number | null) => Math.max(pct, up ?? 0, 0);
function altaTxt(pct: number, alta: number): string {
  if (alta > Math.max(0, pct) + 1) return `subiu ${alta.toFixed(1)}% desde a mínima recente (no dia: ${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%)`;
  return `subiu +${pct.toFixed(2)}% em 24h`;
}
function ddDeTicker(t: any, last: number): number {
  const high = parseFloat(t?.high24h || "0");
  return high > 0 && last > 0 && high >= last ? ((high - last) / high) * 100 : 0;
}
// queda desde o topo recente (velas): pega moeda que disparou e devolveu, mesmo com o dia ainda positivo
function ddDoPico(h: number[], preco: number, jan: number = FUNDO_JAN_PICO): number {
  const n = Math.min(h.length, jan);
  if (n < 1 || !(preco > 0)) return 0;
  let pico = 0;
  for (let i = h.length - n; i < h.length; i++) if (h[i] > pico) pico = h[i];
  return pico > preco ? ((pico - preco) / pico) * 100 : 0;
}
// Movimento ANTERIOR ao repique. SHORT: queda do pico até o vale (só conta o pico que veio ANTES do vale de 24h).
function quedaAntesDoVale(h: number[], l: number[], jan: number = FUNDO_JAN_PICO): number {
  const n = Math.min(l.length, jan);
  if (n < 2) return 0;
  const ini = l.length - n;
  let iv = -1, vale = Infinity;
  for (let i = ini; i < l.length; i++) if (l[i] > 0 && l[i] < vale) { vale = l[i]; iv = i; }
  if (iv <= ini) return 0;
  let pico = 0;
  for (let i = ini; i < iv; i++) if (h[i] > pico) pico = h[i];
  return pico > vale ? ((pico - vale) / pico) * 100 : 0;
}
// LONG (espelho): alta do fundo até o topo, só contando o fundo que veio ANTES do topo de 24h.
function altaAntesDoTopo(h: number[], l: number[], jan: number = FUNDO_JAN_PICO): number {
  const n = Math.min(h.length, jan);
  if (n < 2) return 0;
  const ini = h.length - n;
  let it = -1, topo = 0;
  for (let i = ini; i < h.length; i++) if (h[i] > topo) { topo = h[i]; it = i; }
  if (it <= ini) return 0;
  let fundo = Infinity;
  for (let i = ini; i < it; i++) if (l[i] > 0 && l[i] < fundo) fundo = l[i];
  return isFinite(fundo) && topo > fundo ? ((topo - fundo) / fundo) * 100 : 0;
}
// queda em % (positivo = caiu): o maior entre a variação de 24h e o recuo desde a máxima
const quedaEfetiva = (pct: number, dd?: number | null) => Math.max(-pct, dd ?? 0, 0);
function quedaTxt(pct: number, queda: number): string {
  if (queda > Math.max(0, -pct) + 1) return `recuou ${queda.toFixed(1)}% desde a máxima recente (no dia: ${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%)`;
  return `caiu ${(-pct).toFixed(2)}% em 24h`;
}
// Filtro de amplitude: true = passa. Usa o maior entre |variação 24h|, queda desde o topo e alta desde
// o fundo — assim pega tanto quem está subindo quanto quem está caindo forte, e só barra quem está parado.
function passaAmplitude(pct: number, dd: number, up: number): boolean {
  if (FILTRO_AMPLITUDE_MIN <= 0) return true;
  return Math.max(Math.abs(pct), dd || 0, up || 0) >= FILTRO_AMPLITUDE_MIN;
}
let _volCampoLogado = false;
async function getVariacoes24h(): Promise<VarInfo[]> {
  const pares = await getFuturesPairs();
  const paresSet = new Set(pares);
  const variacoes: VarInfo[] = [];
  const bulk = await getAllTickersBulk();
  if (bulk) {
    // V56: 1x por isolate, mostra os campos de volume do ticker com o volUsdt calculado, pra conferir a unidade
    // (volCurrency24h deve ser em moeda-base; vol24h em contratos). Compare com o volume 24h no app da BloFin.
    if (!_volCampoLogado) {
      _volCampoLogado = true;
      for (const t of bulk.filter((x: any) => x?.instId && parseFloat(x.last || "0") > 0).slice(0, 3)) {
        const l = parseFloat(t.last);
        console.log(`🔎 volume ${t.instId}: vol24h=${t.vol24h} volCurrency24h=${t.volCurrency24h} last=${t.last} -> volUsdt=${((parseFloat(t.volCurrency24h || "0") || 0) * l).toFixed(0)}`);
      }
    }
    for (const t of bulk) {
      if (!t.instId || !paresSet.has(t.instId)) continue;
      if (BLACKLIST_MOEDAS.has(t.instId.toUpperCase())) continue;
      const last = parseFloat(t.last || "0"), open = parseFloat(t.open24h || "0");
      if (open <= 0 || last <= 0) continue;
      const pct = ((last - open) / open) * 100, dd = ddDeTicker(t, last), up = upDeTicker(t, last);
      const volM = parseFloat(t.volCurrency24h || "0") || 0;
      _volMap.set(t.instId, { u: volM * last, m: volM }); // V106
      if (!passaAmplitude(pct, dd, up)) continue;
      variacoes.push({ instId: t.instId, pct, last, volUsdt: volM * last, volMoeda: volM, dd, up });
    }
  } else {
    const resultados = await emLotes(pares, 25, getTickerOne);
    resultados.forEach((t, i) => {
      if (!t) return;
      if (BLACKLIST_MOEDAS.has(pares[i].toUpperCase())) return;
      const last = parseFloat(t.last || "0"), open = parseFloat(t.open24h || "0");
      if (open <= 0 || last <= 0) return;
      const pct = ((last - open) / open) * 100, dd = ddDeTicker(t, last), up = upDeTicker(t, last);
      const volM = parseFloat(t.volCurrency24h || "0") || 0;
      _volMap.set(pares[i], { u: volM * last, m: volM }); // V106
      if (!passaAmplitude(pct, dd, up)) return;
      variacoes.push({ instId: pares[i], pct, last, volUsdt: volM * last, volMoeda: volM, dd, up });
    });
  }
  return variacoes;
}
// Corta em fim de linha e fecha as tags HTML que ficaram abertas — cortar no meio de "<b>...", "<a href" ou "&am" fazia o Telegram
// recusar o HTML e a mensagem inteira sair sem formatação (ou com tag crua aparecendo).
const cortar = (msg: string): string => {
  if (msg.length <= 4000) return msg;
  let c = msg.slice(0, 3950);
  const nl = c.lastIndexOf("\n");
  if (nl > 3000) c = c.slice(0, nl);
  c = c.replace(/<[^>]*$/, "").replace(/&[a-z#0-9]{0,6}$/i, "");
  const abertas: string[] = [];
  for (const m of c.matchAll(/<(\/?)(b|i|u|s|a|code|pre)\b[^>]*>/gi)) {
    const nome = m[2].toLowerCase();
    if (m[1]) { const k = abertas.lastIndexOf(nome); if (k >= 0) abertas.splice(k, 1); } else abertas.push(nome);
  }
  return c + "\n...(cortado)" + abertas.reverse().map((t) => `</${t}>`).join("");
};
// V54: o Telegram recusa mensagem com mais de 4096 caracteres e o sendTelegram não divide — o /help do modo Novato
// (~4.2k) simplesmente não chegava (a 1ª tentativa falha por tamanho e a 2ª, sem HTML, falha pelo mesmo motivo).
// dividirTexto() quebra em partes <= max, de preferência numa linha divisória (DIVISOR/MINI_DIVISOR) ou em branco, sempre
// entre linhas (as tags <b>/<i> do /help ficam todas dentro de uma linha, então cada parte continua HTML válido).
function dividirTexto(texto: string, max = 3800): string[] {
  if (texto.length <= max) return [texto];
  const ehQuebra = (l: string) => l.trim() === "" || l === DIVISOR || l === MINI_DIVISOR;
  const partes: string[] = [];
  let cur: string[] = [];
  const tam = (ls: string[]) => ls.join("\n").length;
  // V107: linha sozinha maior que o limite é quebrada em pedaços (num espaço, se der)
  const linhas: string[] = [];
  for (const l of texto.split("\n")) {
    let r = l;
    while (r.length > max) { let c = r.lastIndexOf(" ", max); if (c < max * 0.5) c = max; linhas.push(r.slice(0, c)); r = r.slice(c).replace(/^ /, ""); }
    linhas.push(r);
  }
  for (const linha of linhas) {
    // V107: "while" (antes "if"): depois de cortar na última linha em branco, o resto + a linha nova ainda podia passar do limite,
    // e a parte seguinte saía com mais de 4096 caracteres -> o sendTelegram cortava ("...(cortado)" no /config).
    while (cur.length && tam([...cur, linha]) > max) {
      let corte = cur.length;
      for (let k = cur.length - 1; k > 0; k--) if (ehQuebra(cur[k])) { corte = k; break; }
      partes.push(cur.slice(0, corte).join("\n"));
      cur = cur.slice(corte).filter((l, i) => !(i === 0 && ehQuebra(l)));
    }
    cur.push(linha);
  }
  if (cur.length) partes.push(cur.join("\n"));
  return partes.map((x) => x.replace(/^\n+|\n+$/g, "")).filter((x) => x.trim() !== "");
}
// V74: divide texto longo em várias mensagens SEM perder o fim (o cortar() jogava fora o que passava de ~4000 caracteres: o /saida perdia "Melhores" e o rodapé).
// Quebra em linha divisória/em branco (dividirTexto) e, se uma tag HTML (<i>, <b>...) ficou aberta no fim de uma parte, fecha ali e reabre no começo da seguinte.
// V107: manda uma mensagem longa em partes (sem "...(cortado)"); os botões vão na última parte
async function enviarEmPartes(chatId: number | string, msg: string, botoes?: Botoes): Promise<void> {
  const partes = dividirHtml(msg);
  for (let i = 0; i < partes.length; i++) await sendTelegram(chatId, partes[i], i === partes.length - 1 ? botoes : undefined);
}
function dividirHtml(texto: string, max = 3800): string[] {
  const partes = dividirTexto(texto, max - 80); // folga pras tags fechadas/reabertas
  const abertas: string[] = []; // tags de abertura completas (com atributos) ainda abertas
  const nomeDe = (t: string) => (/^<(\w+)/.exec(t)?.[1] || "").toLowerCase();
  return partes.map((p) => {
    const prefixo = abertas.join("");
    for (const m of p.matchAll(/<(\/?)(b|i|u|s|a|code|pre)\b[^>]*>/gi)) {
      const nome = m[2].toLowerCase();
      if (m[1]) { for (let k = abertas.length - 1; k >= 0; k--) if (nomeDe(abertas[k]) === nome) { abertas.splice(k, 1); break; } }
      else abertas.push(m[0]);
    }
    return prefixo + p + [...abertas].reverse().map((t) => `</${nomeDe(t)}>`).join("");
  });
}
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
type InfoFiltravel = IndicadorInfo & { diDom?: "long" | "short" | null; ddPico?: number; altaVale?: number; top?: FundoRes | null; adx: number; rsi: number; atr: number; adxAntes?: number; volRatio?: number | null; trocas?: number; bottom?: FundoRes | null; rangeRel?: number };
// V36: tamanho das últimas 6 velas em relação ao típico da moeda (≤ 0.7 = velas minúsculas)
function rangeRelDe(h: number[], l: number[], c: number[]): number | undefined {
  const n = c.length;
  if (n < 40) return undefined;
  const rg = (i: number) => (c[i] > 0 ? ((h[i] - l[i]) / c[i]) * 100 : NaN);
  const rec: number[] = [];
  for (let i = n - 6; i < n; i++) { const r = rg(i); if (isFinite(r)) rec.push(r); }
  const base: number[] = [];
  for (let i = Math.max(0, n - 294); i < n - 6; i++) { const r = rg(i); if (isFinite(r) && r > 0) base.push(r); }
  const med = xMediana(base);
  if (!rec.length || !(med > 0)) return undefined;
  return (rec.reduce((s, v) => s + v, 0) / rec.length) / med;
}
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
// V56: conta mudanças entre 3 estados (acima / dentro / abaixo da faixa) nas últimas 16 velas (4h). Acima→dentro→acima = 2 trocas:
// entrar e sair da faixa também é serrote. Os textos dizem "trocas em 4h", não "trocas de lado".
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
type FundoRes = { pts: number; conf: number; motivos: Motivo[]; caindoFaca: boolean; minimo: number; dAtr: number; repique?: boolean };
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
  checarDerivaFundo(total);
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
  let caindoFaca = false, repique = false;
  const dAtr = (info.fundo - info.preco) / atr;
  if (dAtr >= 5) add(2, `${info.distAbs.toFixed(1)}% abaixo da faixa (${dAtr.toFixed(1)}× ATR): muito esticada`);
  else if (dAtr >= 3) add(1, `${info.distAbs.toFixed(1)}% abaixo da faixa (${dAtr.toFixed(1)}× ATR): esticada`);
  else {
    // moeda que disparou e devolveu: o fundo costuma ser a própria faixa (suporte da alta), sem precisar furá-la
    const recuoPico = ddDoPico(d.h, info.preco);
    const tocou = Math.min(...d.l.slice(n - 6)) <= info.topo + 0.25 * atr;
    const segura = info.preco >= info.fundo - 0.5 * atr;
    // veio de baixo = nas últimas 16 velas o preço esteve bem abaixo da faixa: é bounce de queda, não repique de alta
    const veioDeBaixo = Math.min(...d.l.slice(n - JAN)) < info.fundo - REPIQUE_LADO_ATR * atr;
    const dispAntes = altaAntesDoTopo(d.h, d.l) >= REPIQUE_MOV_ANTES_MIN;
    if (recuoPico >= FUNDO_TOQUE_PICO_MIN && tocou && segura && dispAntes && !veioDeBaixo) { add(2, `voltou até a faixa (${recuoPico.toFixed(0)}% abaixo do pico) e está segurando nela`); repique = true; }
  }
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
  repique = repique && !caindoFaca;
  if (repique && REPIQUE_BONUS > 0) add(REPIQUE_BONUS, "⭐ repique segurando na faixa: retomada da alta anterior, LONG a favor dela (prioridade)");
  const pts = motivos.reduce((s, m) => s + m.pts, 0);
  return { pts, conf: confFundo(pts, caindoFaca), motivos, caindoFaca, minimo: minL, dAtr, repique };
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
// V41: ETH como segunda referência além do BTC — mesma ideia do btcVar1h, espelhada pra ETH-USDT.
let _ethFundoCache: { t: number; pct: number | null } | null = null;
async function ethVar1h(): Promise<number | null> {
  if (_ethFundoCache && Date.now() - _ethFundoCache.t < 60000) return _ethFundoCache.pct;
  let pct: number | null = null;
  try {
    const d = await xCandles("ETH-USDT", TIMEFRAME, CANDLES_LIMIT_PRECISO);
    if (d && d.c.length > 6) { const n = d.c.length; pct = ((d.c[n - 1] - d.c[n - 5]) / d.c[n - 5]) * 100; }
  } catch { }
  _ethFundoCache = { t: Date.now(), pct };
  return pct;
}
const ETH_DIR_ON = (Deno.env.get("ETH_DIR") || "1") !== "0";
const ETH_DIR_PCT = numEnv("ETH_DIR_PCT", "1.5");
type FundoFinal = FundoRes & { fo: FoInfo | null; btc: number | null };
async function fundoFinal(pre: FundoRes, instId: string, foPre?: FoInfo | null, inclinaRel?: number): Promise<FundoFinal> {
  const [fo, btc, bookImb] = await Promise.all([
    foPre !== undefined ? Promise.resolve(foPre) : getFundingOI(instId).catch(() => null),
    btcVar1h(),
    getBookImbalance(instId).catch(() => null),
  ]);
  const motivos = [...pre.motivos];
  const add = (pts: number, txt: string) => motivos.push({ pts, txt });
  // V63: alinha o radar de fundo/topo com o que a pontuação principal já enxerga — book e inclinação da faixa,
  // que antes só entravam na confiança de continuação, agora também contam a favor/contra a reversão aqui.
  if (bookImb != null && isFinite(bookImb)) {
    if (bookImb >= BOOK_IMB_MIN_PCT) add(1, `book desequilibrado pra compra (+${bookImb.toFixed(0)}%): reforça repique/virada pra cima`);
    else if (bookImb <= -BOOK_IMB_MIN_PCT) add(-1, `book pesando pro lado vendedor (${bookImb.toFixed(0)}%): contra a virada pra cima`);
  }
  if (inclinaRel !== undefined && isFinite(inclinaRel)) {
    if (inclinaRel >= INCLINA_MOD) add(1, `inclinação da faixa ${inclinaTxt({ inclinaRel } as any)}: a favor da virada pra cima`);
    else if (-inclinaRel >= INCLINA_FORTE) add(-1, `inclinação da faixa ${inclinaTxt({ inclinaRel } as any)}: contra a virada, ainda descendo forte`);
  }
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
function fundoTxt(r: { motivos: Motivo[]; conf: number }, maxPos = 5, maxNeg = 3, seta = ""): string {
  const pos = r.motivos.filter((m) => m.pts > 0).sort((a, b) => b.pts - a.pts).slice(0, maxPos);
  const neg = r.motivos.filter((m) => m.pts < 0).sort((a, b) => a.pts - b.pts).slice(0, maxNeg);
  let t = `🧭 Sinal de fundo: <b>${r.conf}/10</b> ${confEmoji(r.conf)}${seta ? `\nMovimento: ${seta}` : ""}`;
  for (const m of pos) t += `\n   ✅ ${m.txt}`;
  for (const m of neg) t += `\n   ⚠️ ${m.txt}`;
  return t;
}
function msgFundo(info: InfoFiltravel, pct: number, queda: number, fin: FundoFinal, vivo: number | null, seta = ""): string {
  const foTxt = fundingOiTxt(fin.fo ?? { funding: null, oiChg: null });
  const ref = vivo ?? info.preco;
  const dTopo = ref > 0 ? ((info.topo - ref) / ref) * 100 : 0;
  const dentro = ladoAtual(info) === null;
  const ligar = dentro
    ? `🔌 <b>Ligar o robô?</b>\n🕒 <b>PREPARE</b> — preço já está dentro da faixa, a ${Math.max(0, dTopo).toFixed(2)}% da linha de LONG (${fmtPrice(info.topo)}). O robô entra LONG se uma vela 15m FECHAR acima dela. Se a aproximação ficar consistente e a confiança for ≥ ${CONF_MIN_FUNDO_LONG}/10, o bot manda o 🚨 LIGUE AGORA.\n`
    : `🔌 <b>Ligar o robô?</b>\n⏳ <b>Ainda não</b> — preço ${info.distAbs.toFixed(2)}% abaixo da faixa; se o robô estiver ligado, está SHORT. Ele só vira LONG se uma vela 15m FECHAR acima de ${fmtPrice(info.topo)} (faltam ${Math.max(0, dTopo).toFixed(2)}%).\n`;
  return `${fin.repique ? "⭐🟢 <b>REPIQUE LONG — " : "🟢 <b>RADAR DE FUNDO — "}${info.instId}</b>\n${DIVISOR}\n\n` +
    `📉 ${quedaTxt(pct, queda)} · ${vivo !== null ? `preço agora ${fmtPrice(vivo)}` : `preço ${fmtPrice(info.preco)}`}\n` +
    `<i>${fin.repique ? "Moeda que disparou, recuou até a faixa e está segurando nela: retomada da alta, LONG a favor dela (prioridade)." : "Possível virada de queda pra alta."}</i> <b>Ainda não é entrada</b>: o robô só abre LONG quando fechar 15m acima do indicador.\n\n` +
    ligar + `\n` +
    `${fundoTxt(fin, 5, 3, seta)}\n` +
    (foTxt ? `💸 ${foTxt}\n` : "") +
    `\n📍 faixa: fundo ${fmtPrice(info.fundo)} | topo ${fmtPrice(info.topo)}${dentro ? " (preço dentro da faixa)" : ` (preço ${info.distAbs.toFixed(2)}% abaixo)`}\n` +
    `❌ Invalida: perder a mínima recente (${fmtPrice(fin.minimo)})<i> — aí o fundo ainda não se formou</i>.\n` +
    `⭐ /seguir ${info.instId.replace("-USDT", "").toLowerCase()} pra ser avisado quando chegar na linha.`;
}
async function registrarAlertaFundo(SB: any, info: InfoFiltravel, pct: number, conf: number | null = null, repique = false) {
  try {
    await inserirLogAlerta(SB, {
      instid: info.instId, lado: "long", tipo: "fundo", status: repique ? "🟢 REPIQUE LONG" : "🟢 FUNDO", fresco: false,
      idade_candles: info.idadeCandles, pct24: pct, preco: info.preco, adx: info.adx ?? null, rsi: info.rsi ?? null,
    }, conf);
    await registrarHipotese(SB, info.instId, repique ? "repique" : "fundo", "long", Number(info.preco)); // V74: acompanha a hipótese (invalida/funcionou)
  } catch (e) { console.log("⚠️ registrarAlertaFundo erro", e); }
}
// ===== V98: MODO FACA — candidatos de "continuação da queda" (fundo com ADX alto), gravados à parte do placar =====
type FacaReg = { i: string; t: number; p: number; a: number | null; c: number; q: number; u?: number | null; m?: number | null; v?: string }; // V106: u = volume 24h em USDT, m = em unidades da moeda
const _facaAvaliado = new Map<string, number>();
async function facaLer(SB: any): Promise<FacaReg[] | null> {
  try {
    const { data, error } = await SB.from(TAB).select("last_status").eq("instid", FACA_ROW).maybeSingle();
    if (error) { console.log("⚠️ modo faca: leitura falhou, pulo a rodada", error.message ?? error); return null; }
    if (!data?.last_status) return [];
    try { const j = JSON.parse(data.last_status); return Array.isArray(j) ? j : []; } catch { return []; }
  } catch (e) { console.log("⚠️ modo faca: leitura falhou", e); return null; }
}
async function facaSalvar(SB: any, lista: FacaReg[]) {
  const corte = Date.now() - FACA_DIAS_GUARDA * 86400000;
  await upsertLinha(SB, FACA_ROW, { last_status: JSON.stringify(lista.filter((r) => r.t >= corte).slice(-FACA_MAX)), last_alert_at: new Date().toISOString() });
}
function msgFaca(info: InfoFiltravel, queda: number, conf: number, vivo: number | null): string {
  return `🔪 <b>FACA CAINDO — ${info.instId}</b> (experimental)\n${DIVISOR}\n\n` +
    `Caiu ${queda.toFixed(1)}% e o ADX está em ${Math.round(info.adx ?? 0)} (queda com força). O radar de fundo leria isso como reversão (nota ${conf}/10), mas com ADX alto o histórico dos radares mostra que a queda costuma CONTINUAR.\n\n` +
    `Preço: ${fmtPrice(vivo ?? info.preco)}\n` +
    `Ideia em teste: SHORT só se romper a MÍNIMA da vela do alerta, stop na máxima, alvo ${RUP_ALVO_R}R. Não é entrada pronta.\n` +
    `Resultado acumulado: /faca`;
}
async function radarFaca(SB: any, pool: { instId: string; pct: number; volUsdt: number; dd?: number }[], indicadores: (InfoFiltravel | null)[]) {
  if (FACA_MODO === "off" || !FUNDO_ON || !(FACA_ADX_MIN > 0)) return;
  const ckVela = Math.floor(Date.now() / (TF_MIN * 60000));
  for (const [k, v] of _facaAvaliado) if (v !== ckVela) _facaAvaliado.delete(k);
  const cands: { info: InfoFiltravel; queda: number }[] = [];
  indicadores.forEach((info, i) => {
    const p = pool[i];
    if (!info || !info.bottom || !p || info.bottom.repique) return;
    if (!(typeof info.adx === "number" && isFinite(info.adx) && info.adx >= FACA_ADX_MIN)) return;
    const queda = quedaEfetiva(p.pct, Math.max(p.dd ?? 0, info.ddPico ?? 0));
    if (queda < FUNDO_QUEDA_MIN || p.volUsdt < FILTRO_VOL_MIN_USDT) return;
    if (ladoAtual(info) === "long") return; // mesma população do radar de fundo
    if (info.bottom.pts < FUNDO_PRE_MIN) return;
    cands.push({ info, queda });
  });
  if (!cands.length) return;
  cands.sort((a, b) => b.info.bottom!.pts - a.info.bottom!.pts);
  const lista = await facaLer(SB);
  if (!lista) return;
  const ativos = ALERT_CHAT_IDS.filter((ch) => !silChat(ch));
  const agora = Date.now();
  let gravou = 0;
  for (const c of cands.slice(0, RADAR_CAND_JANELA)) {
    if (gravou >= FACA_MAX_POR_RODADA) break;
    const inst = c.info.instId;
    if (_facaAvaliado.get(inst) === ckVela) continue;
    const ult = lista.filter((r) => r.i === inst).reduce((m, r) => Math.max(m, r.t), 0);
    if (ult && agora - ult < FACA_COOLDOWN_MIN * 60000) continue;
    const fin = await fundoFinal(c.info.bottom!, inst);
    _facaAvaliado.set(inst, ckVela);
    if (fin.conf < FACA_GRAVA_MIN) continue; // grava de FACA_GRAVA_MIN pra cima (amostra)
    const r1 = (v: number) => Math.round(v * 10) / 10;
    const vf = volDe(inst);
    lista.push({ i: inst, t: agora, p: Number(c.info.preco), a: r1(c.info.adx), c: fin.conf, q: r1(c.queda), u: vf ? Math.round(vf.u) : null, m: vf ? vf.m : null, v: BOT_VERSAO });
    gravou++;
    console.log(`🔪 faca (${FACA_MODO}): ${inst} nota ${fin.conf}/10 · ADX ${c.info.adx.toFixed(0)} · queda ${c.queda.toFixed(1)}%`);
    if (FACA_MODO === "alerta" && ativos.length && fin.conf >= FACA_CONF_MIN) { // avisa só nota >= FACA_CONF_MIN
      const vivo = await precoAoVivo(inst).catch(() => null);
      const msg = msgFaca(c.info, c.queda, fin.conf, vivo);
      await Promise.all(ativos.map((ch) => enviarAlertaMoeda(SB, ch, `FACA_${inst}`, cortar(msg), botaoAnalisar(inst)).catch(() => null)));
    }
  }
  if (gravou) await facaSalvar(SB, lista);
}
// ===== V107: MODO FOGUETE — espelho do modo faca =====
// Topo com ADX ALTO (que o radar de topo não avisa, TOPO_ADX_MAX) vira candidato LONG de CONTINUAÇÃO da alta. Só grava em silêncio
// (linha própria _FOGUETE_SOMBRA_, fora do /placar); o resultado sai no /foguete [dias], com as mesmas regras do /radar.
// FOGUETE_MODO=sombra (padrão) | off · FOGUETE_ADX_MIN (padrão = FACA_ADX_MIN, 30) · FOGUETE_GRAVA_MIN (3) = nota mínima do radar de topo pra gravar
// · FOGUETE_COOLDOWN_MIN (240) por moeda · FOGUETE_MAX_POR_RODADA (2) · FOGUETE_DIAS_GUARDA (14).
// Leitura da nota: ela mede o quanto a alta PARECE topo; o LONG aposta contra isso (nota maior ≠ LONG melhor), igual à faca.
const FOGUETE_MODO: "off" | "sombra" = String(Deno.env.get("FOGUETE_MODO") || "sombra").trim().toLowerCase() === "off" ? "off" : "sombra";
const FOGUETE_ADX_MIN = numEnv("FOGUETE_ADX_MIN", String(FACA_ADX_MIN));
const FOGUETE_GRAVA_MIN = numEnv("FOGUETE_GRAVA_MIN", "3");
const FOGUETE_COOLDOWN_MIN = numEnv("FOGUETE_COOLDOWN_MIN", "240");
const FOGUETE_MAX_POR_RODADA = numEnv("FOGUETE_MAX_POR_RODADA", "2");
const FOGUETE_DIAS_GUARDA = numEnv("FOGUETE_DIAS_GUARDA", "14");
const FOGUETE_ROW = "_FOGUETE_SOMBRA_";
const _fogueteAvaliado = new Map<string, number>();
async function fogueteLer(SB: any): Promise<FacaReg[] | null> {
  try {
    const { data, error } = await SB.from(TAB).select("last_status").eq("instid", FOGUETE_ROW).maybeSingle();
    if (error) { console.log("⚠️ modo foguete: leitura falhou, pulo a rodada", error.message ?? error); return null; }
    if (!data?.last_status) return [];
    try { const j = JSON.parse(data.last_status); return Array.isArray(j) ? j : []; } catch { return []; }
  } catch (e) { console.log("⚠️ modo foguete: leitura falhou", e); return null; }
}
async function radarFoguete(SB: any, pool: { instId: string; pct: number; volUsdt: number; up?: number }[], indicadores: (InfoFiltravel | null)[]) {
  if (FOGUETE_MODO === "off" || !TOPO_ON || !(FOGUETE_ADX_MIN > 0)) return;
  const ckVela = Math.floor(Date.now() / (TF_MIN * 60000));
  for (const [k, v] of _fogueteAvaliado) if (v !== ckVela) _fogueteAvaliado.delete(k);
  const cands: { info: InfoFiltravel; alta: number }[] = [];
  indicadores.forEach((info, i) => {
    const p = pool[i];
    if (!info || !info.top || !p || info.top.repique) return;
    if (!(typeof info.adx === "number" && isFinite(info.adx) && info.adx >= FOGUETE_ADX_MIN)) return;
    const alta = altaEfetiva(p.pct, Math.max(p.up ?? 0, info.altaVale ?? 0));
    if (alta < TOPO_ALTA_MIN || p.volUsdt < FILTRO_VOL_MIN_USDT) return;
    if (ladoAtual(info) === "short") return; // mesma população do radar de topo
    if (info.top.pts < TOPO_PRE_MIN) return;
    cands.push({ info, alta });
  });
  if (!cands.length) return;
  cands.sort((a, b) => b.info.top!.pts - a.info.top!.pts);
  const lista = await fogueteLer(SB);
  if (!lista) return;
  const agora = Date.now();
  let gravou = 0;
  for (const c of cands.slice(0, RADAR_CAND_JANELA)) {
    if (gravou >= FOGUETE_MAX_POR_RODADA) break;
    const inst = c.info.instId;
    if (_fogueteAvaliado.get(inst) === ckVela) continue;
    const ult = lista.filter((r) => r.i === inst).reduce((m, r) => Math.max(m, r.t), 0);
    if (ult && agora - ult < FOGUETE_COOLDOWN_MIN * 60000) continue;
    const fin = await topoFinal(c.info.top!, inst);
    _fogueteAvaliado.set(inst, ckVela);
    if (fin.conf < FOGUETE_GRAVA_MIN) continue;
    const r1 = (v: number) => Math.round(v * 10) / 10, vf = volDe(inst);
    lista.push({ i: inst, t: agora, p: Number(c.info.preco), a: r1(c.info.adx), c: fin.conf, q: r1(c.alta), u: vf ? Math.round(vf.u) : null, m: vf ? vf.m : null, v: BOT_VERSAO });
    gravou++;
    console.log(`🚀 foguete (sombra): ${inst} nota de topo ${fin.conf}/10 · ADX ${c.info.adx.toFixed(0)} · alta ${c.alta.toFixed(1)}%`);
  }
  if (gravou) {
    const corte = Date.now() - FOGUETE_DIAS_GUARDA * 86400000;
    await upsertLinha(SB, FOGUETE_ROW, { last_status: JSON.stringify(lista.filter((r) => r.t >= corte).slice(-FACA_MAX)), last_alert_at: new Date().toISOString() });
  }
}
// ===== V107: humor do BTC na hora do alerta (pra separar resultado por regime de mercado) =====
// Variação do BTC nas 24h até a vela ANTERIOR à do alerta (sem olhar o futuro). ≥ +REGIME_BTC_PCT = subindo · ≤ −REGIME_BTC_PCT = caindo · resto = de lado.
const REGIME_BTC_PCT = numEnv("REGIME_BTC_PCT", "2");
type RegimeBtc = "sobe" | "cai" | "lado";
const REGIME_TXT: Record<RegimeBtc, string> = { sobe: `📈 BTC subindo (≥ +${REGIME_BTC_PCT}% em 24h)`, cai: `📉 BTC caindo (≤ −${REGIME_BTC_PCT}% em 24h)`, lado: "↔️ BTC de lado" };
async function btcRegimeFn(): Promise<(ms: number) => RegimeBtc | null> {
  const d = await xCandles("BTC-USDT", TIMEFRAME, SAIDA_CANDLES).catch(() => null);
  if (!d || !d.c.length) return () => null;
  const TFMS = TF_MIN * 60000, n24 = Math.round(1440 / TF_MIN);
  return (ms: number) => {
    let k = -1;
    for (let i = d.t.length - 1; i >= 0; i--) { if (d.t[i] <= ms && ms < d.t[i] + TFMS) { k = i; break; } }
    if (k < 1 || k - 1 - n24 < 0) return null;
    const v = (d.c[k - 1] / d.c[k - 1 - n24] - 1) * 100;
    return v >= REGIME_BTC_PCT ? "sobe" : v <= -REGIME_BTC_PCT ? "cai" : "lado";
  };
}
// V104: modo sombra do repique — grava em silêncio (alertas_log, tipo repique_sombra) o repique que a regra de ADX/DI barrou, mas que teria passado na nota.
type RepSombraCand = { info: InfoFiltravel; pct: number; motivos: string[] };
async function repSombraRodar(SB: any, lista: RepSombraCand[], lado: "long" | "short") {
  if (!REPIQUE_SOMBRA_ON || !lista.length) return;
  const ckVela = Math.floor(Date.now() / (TF_MIN * 60000));
  const ptsDe = (c: RepSombraCand) => (lado === "long" ? c.info.bottom?.pts : c.info.top?.pts) ?? 0;
  lista.sort((a, b) => ptsDe(b) - ptsDe(a));
  let n = 0;
  for (const c of lista.slice(0, RADAR_CAND_JANELA)) {
    if (n >= REPIQUE_SOMBRA_MAX_POR_RODADA) break;
    const inst = c.info.instId;
    const gk = `repsombra|${lado}|${inst}`;
    if (_fundoAvaliado.get(gk) === ckVela) continue;
    const chave = `_REPSOMBRA_${inst}_${lado}`;
    try {
      const { data } = await SB.from(TAB).select("last_alert_at").eq("instid", chave).maybeSingle();
      const ult = data?.last_alert_at ? new Date(data.last_alert_at).getTime() : 0;
      if (ult && Date.now() - ult < REPIQUE_SOMBRA_COOLDOWN_MIN * 60000) continue;
      const pre = lado === "long" ? c.info.bottom : c.info.top;
      if (!pre) continue;
      const fin = lado === "long" ? await fundoFinal(pre, inst) : await topoFinal(pre, inst);
      _fundoAvaliado.set(gk, ckVela);
      // mesma nota mínima que o alerta real exigiria, pra sombra e real serem comparáveis
      const minConf = fin.repique && !fin.caindoFaca ? REPIQUE_CONF_MIN : (lado === "long" ? FUNDO_CONF_MIN : TOPO_CONF_MIN);
      if (fin.conf < minConf) continue;
      await inserirLogAlerta(SB, {
        instid: inst, lado, tipo: REP_SOMBRA_TIPO, status: `${lado === "long" ? "🟢 REPIQUE LONG" : "🔴 REPIQUE SHORT"} 🌑SOMBRA[${c.motivos.join("+")}]`, fresco: false,
        idade_candles: c.info.idadeCandles, pct24: c.pct, preco: c.info.preco, adx: c.info.adx ?? null, rsi: c.info.rsi ?? null,
      }, fin.conf);
      await upsertLinha(SB, chave, { last_alert_at: new Date().toISOString(), last_status: c.motivos.join("+") });
      n++;
      console.log(`🌑 sombra repique ${lado}: ${inst} [${c.motivos.join("+")}] nota ${fin.conf}/10 · ADX ${c.info.adx != null ? Math.round(c.info.adx) : "?"} · DI ${c.info.diDom ?? "neutro"}`);
    } catch (e) { console.log("⚠️ sombra repique falhou", e); }
  }
}
async function radarFundo(SB: any, pool: { instId: string; pct: number; volUsdt: number; dd?: number }[], indicadores: (InfoFiltravel | null)[], posMap: Map<string, Pos[] | null>) {
  if (!FUNDO_ON) return;
  const ativos = ALERT_CHAT_IDS.filter((ch) => !silChat(ch));
  if (!ativos.length) return;
  const ckVela = Math.floor(Date.now() / (TF_MIN * 60000));
  for (const [k, v] of _fundoAvaliado) if (v !== ckVela) _fundoAvaliado.delete(k);
  const cands: { info: InfoFiltravel; pct: number; queda: number }[] = [];
  let barradasAdx = 0; // V97: candidatas cortadas por ADX alto
  const sombraRep: RepSombraCand[] = []; // V104: repiques barrados por ADX/DI (vão pro modo sombra)
  indicadores.forEach((info, i) => {
    const p = pool[i];
    if (!info || !info.bottom || !p) return;
    const queda = quedaEfetiva(p.pct, Math.max(p.dd ?? 0, info.ddPico ?? 0));
    if (queda < FUNDO_QUEDA_MIN || p.volUsdt < FILTRO_VOL_MIN_USDT) return;
    if (ladoAtual(info) === "long") return;
    if (info.bottom.pts < (info.bottom.repique ? Math.max(1, FUNDO_PRE_MIN - 1) : FUNDO_PRE_MIN)) return;
    // V104: repique (LONG) só com ADX >= REPIQUE_ADX_MIN e +DI puxando; o que a regra barra vai pro modo sombra
    if (info.bottom.repique) {
      const mot = repMotivos("long", info.adx, info.adxAntes, info.diDom ?? null);
      if (mot.length) { sombraRep.push({ info, pct: p.pct, motivos: mot }); return; }
    }
    // V97: ADX desconhecido (NaN/ausente) não barra; só barra quando o valor existe e passa do teto.
    if (FUNDO_ADX_MAX > 0 && !info.bottom.repique && typeof info.adx === "number" && isFinite(info.adx) && info.adx >= FUNDO_ADX_MAX) { barradasAdx++; return; }
    cands.push({ info, pct: p.pct, queda });
  });
  cands.sort((a, b) => Number(!!b.info.bottom!.repique) - Number(!!a.info.bottom!.repique) || b.info.bottom!.pts - a.info.bottom!.pts);
  const top = cands.slice(0, RADAR_CAND_JANELA); // V74: janela maior que 8/6 — as de cima em cooldown ocupavam todas as vagas e as de baixo nunca saíam
  console.log(`🟢 radar de fundo: ${cands.length} candidata(s) com queda ≥ ${FUNDO_QUEDA_MIN}% e pré-filtro ≥ ${FUNDO_PRE_MIN} pts${barradasAdx ? ` (+${barradasAdx} barrada(s) por ADX ≥ ${FUNDO_ADX_MAX})` : ""}${sombraRep.length ? ` (+${sombraRep.length} repique(s) barrado(s): ${repRegraTxt()})` : ""}`);
  if (!top.length) { await repSombraRodar(SB, sombraRep, "long"); return; }
  const rowsMap = new Map<string, any>();
  try {
    const { data } = await SB.from(TAB).select("*").in("instid", top.map((c) => "_FUNDO_" + c.info.instId));
    ((data || []) as any[]).forEach((r) => rowsMap.set(r.instid, r));
  } catch (e) { console.log("⚠️ leitura do cooldown do radar falhou", e); }
  const agora = Date.now();
  let enviados = 0, enviadosRep = 0;
  for (const c of top) {
    const ehRep = !!c.info.bottom?.repique;
    if (ehRep ? enviadosRep >= REPIQUE_MAX_POR_RODADA : enviados >= FUNDO_MAX_POR_RODADA) continue;
    const inst = c.info.instId;
    const row = rowsMap.get("_FUNDO_" + inst);
    let subidaDe: number | null = null; // V96: nota anterior, quando este é um alerta de "nota subiu" dentro do cooldown
    if (row?.last_alert_at && agora - new Date(row.last_alert_at).getTime() < (ehRep ? REPIQUE_COOLDOWN_MIN : FUNDO_COOLDOWN_MIN) * 60000) {
      const prevC = parseUltimaConf(row?.last_status), idadeMin = (agora - new Date(row.last_alert_at).getTime()) / 60000;
      if (RADAR_UPGRADE_DELTA <= 0 || prevC === null || idadeMin < RADAR_UPGRADE_GAP_MIN || (c.info.bottom!.conf ?? 0) < prevC + RADAR_UPGRADE_DELTA - 2) continue;
      subidaDe = prevC;
    }
    // Auditoria (achado #18, mesmo em radarTopo/radarCompressao): _fundoAvaliado marcava a moeda como "já
    // avaliada nesta vela" ANTES de saber se o envio ia ser confirmado — undermineava o "não vou queimar o
    // cooldown" logo abaixo: o cooldown ficava livre pra tentar de novo, mas esse guard de "1x por vela"
    // bloqueava os próximos ciclos do cron mesmo assim (só destravava na troca de vela, até ~15 min depois).
    // Corrigido: só marca quando não vai reavaliar mesmo (confiança insuficiente) ou quando o envio confirma;
    // no caso de falha de envio, não marca, pra tentar de novo no próximo ciclo.
    if (_fundoAvaliado.get(inst) === ckVela) continue;
    const [fin, vivo] = await Promise.all([fundoFinal(c.info.bottom!, inst), precoAoVivo(inst)]);
    if (subidaDe !== null && fin.conf < subidaDe + RADAR_UPGRADE_DELTA) { _fundoAvaliado.set(inst, ckVela); continue; }
    const minConf = fin.repique && !fin.caindoFaca ? REPIQUE_CONF_MIN : FUNDO_CONF_MIN;
    if (fin.conf < minConf) { _fundoAvaliado.set(inst, ckVela); console.log(`🟢 radar: ${inst} ${fin.conf}/10 < ${minConf} (${fin.caindoFaca ? "faca caindo" : "sinais insuficientes"})`); continue; }
    const seta = setaTxt(row?.last_status, fin.conf);
    const msg = (subidaDe !== null ? `⬆️ <b>NOTA SUBIU</b> ${subidaDe}/10 → ${fin.conf}/10 (2º alerta da mesma moeda)\n\n` : "") + msgFundo(c.info, c.pct, c.queda, fin, vivo, seta) + volLinha(inst);
    const ids = await Promise.all(ativos.map(async (ch) => {
      const atrRadar = typeof (c.info as any).atr === "number" ? (c.info as any).atr : 0;
      let extra = "";
      for (const p of posDaMoeda(posMap.get(ch) ?? null, inst).filter((x) => x.lado === "short")) {
        extra += `\n\n📌 <b>Você está SHORT em ${inst}</b> — entrada ${fmtPrice(p.entrada)} | ${p.pnl >= 0 ? "➕" : "➖"} PnL ${sgn(p.pnl)} USDT (${sgn(p.pnlPct, 1)}% da margem)\n${p.pnl > 0 ? `Sinais de fundo aparecendo: considere realizar parte do lucro e ${stopSugeridoTxt(p, atrRadar)}.` : `Sinais de fundo aparecendo contra a sua posição SHORT, que está no prejuízo: confira o stop antes.`}`;
      }
      return await enviarAlertaMoeda(SB, ch, `FUNDO_${inst}`, cortar(msg + extra + notaLat()), botaoAnalisar(inst));
    }));
    if (!ids.some(Boolean)) { console.log(`⚠️ radar de fundo: ${inst} — nenhum envio confirmado, não vou queimar o cooldown`); continue; }
    _fundoAvaliado.set(inst, ckVela);
    await registrarAlertaFundo(SB, c.info, c.pct, fin.conf, !!fin.repique);
    await upsertLinha(SB, "_FUNDO_" + inst, { last_status: `${fin.conf}/10`, last_alert_at: new Date().toISOString() });
    // V107: modo alerta do motor (em segundo plano: a rodada espera no fim, depois de liberar a trava)
    if (!fin.repique) _bgTarefas.push(enviarAlertaMotor({ inst, side: "long", tipo: "fundo", preco: Number(vivo ?? c.info.preco), atr: Number(c.info.atr), nota: fin.conf, vol: volDe(inst)?.u ?? null }).catch((e) => console.log("⚠️ modo alerta falhou", e))); // repique (regra nova) não vai
    if (ehRep) enviadosRep++; else enviados++;
    console.log(`🟢 radar de fundo enviado: ${inst} ${fin.conf}/10${ehRep ? " ⭐ repique" : ""}${subidaDe !== null ? ` (nota subiu de ${subidaDe})` : ""}`);
  }
  await repSombraRodar(SB, sombraRep, "long"); // V104: depois dos alertas reais, pra não atrasá-los
}
async function runFundo(chatId: number | string) {
  const inicio = Date.now();
  const variacoes = await getVariacoes24h();
  const pool = [...variacoes].sort((a, b) => quedaEfetiva(b.pct, b.dd) - quedaEfetiva(a.pct, a.dd)).slice(0, OPORT_POOL);
  const infos = await emLotes(pool.map((t) => t.instId), 15, calcIndicadorFiltro);
  const cands: { info: InfoFiltravel; pct: number; queda: number }[] = [];
  infos.forEach((info, i) => {
    const p = pool[i];
    if (!info || !info.bottom) return;
    const queda = quedaEfetiva(p.pct, Math.max(p.dd, info.ddPico ?? 0));
    if (queda < FUNDO_QUEDA_MIN || p.volUsdt < FILTRO_VOL_MIN_USDT) return;
    if (ladoAtual(info) === "long") return;
    // V54: mesmo pré-filtro do radar automático e de /oportunidade + /reversao (pts mínimos de sinal). Antes o /fundo listava moeda com
    // 0 pts de sinal, apesar do título ("+ sinais de exaustão") e da mensagem vazia ("sinais mínimos") prometerem o contrário.
    if (info.bottom.pts < (info.bottom.repique ? Math.max(1, FUNDO_PRE_MIN - 1) : FUNDO_PRE_MIN)) return;
    cands.push({ info, pct: p.pct, queda });
  });
  cands.sort((a, b) => Number(!!b.info.bottom!.repique) - Number(!!a.info.bottom!.repique) || b.info.bottom!.pts - a.info.bottom!.pts);
  const top = cands.slice(0, 8);
  const fins = await Promise.all(top.map((c) => fundoFinal(c.info.bottom!, c.info.instId)));
  const itens = top.map((c, i) => ({ c, fin: fins[i] })).sort((a, b) => Number(!!b.fin.repique) - Number(!!a.fin.repique) || b.fin.conf - a.fin.conf || b.fin.pts - a.fin.pts);
  const dur = ((Date.now() - inicio) / 1000).toFixed(1);
  let msg = `🟢 <b>FUNDO — despencaram (no dia ou desde o topo) + sinais de exaustão</b> — ${dur}s\n<i>pool: top ${OPORT_POOL} que mais recuaram (24h ou desde a máxima) · queda ≥ ${FUNDO_QUEDA_MIN}% · volume ≥ ${(FILTRO_VOL_MIN_USDT / 1e6).toFixed(1)}M USDT</i>\n${DIVISOR}\n\n`;
  if (!itens.length) msg += "nenhuma moeda com queda, liquidez e sinais mínimos agora.\n\n";
  itens.forEach(({ c, fin }, i) => {
    const pos = fin.motivos.filter((m) => m.pts > 0).sort((a, b) => b.pts - a.pts).slice(0, 3).map((m) => m.txt);
    const neg = fin.motivos.filter((m) => m.pts < 0).sort((a, b) => a.pts - b.pts).slice(0, 2).map((m) => m.txt);
    if (i > 0) msg += `${MINI_DIVISOR}\n`;
    msg += `<b>${i + 1}. ${c.info.instId}</b>${fin.repique ? " ⭐ repique" : ""} 📉 ${quedaTxt(c.pct, c.queda)} · ${confEmoji(fin.conf)} <b>${fin.conf}/10</b>\n`;
    if (pos.length) msg += `✅ ${pos.join(" · ")}\n`;
    if (neg.length) msg += `⚠️ ${neg.join(" · ")}\n`;
    msg += `preço ${fmtPrice(c.info.preco)} (${c.info.distAbs.toFixed(1)}% abaixo da faixa) | topo ${fmtPrice(c.info.topo)}\n\n`;
  });
  msg += `<i>⭐ repique = disparou, recuou até a faixa e segura nela (retomada da alta). Aviso antecipado, não é entrada: o robô só abre LONG quando fechar 15m acima do indicador. O alerta automático sai com confiança ≥ ${FUNDO_CONF_MIN}/10. Use /seguir MOEDA pra ser avisado na linha.</i>`;
  await enviarEmPartes(chatId, msg, itens.length ? botoesAnalisarLista(itens.map(({ c }) => c.info.instId)) : undefined); // V107: em partes
}

// ───── V35: radar de TOPO (espelho do radar de fundo): moeda que subiu forte e mostra exaustão → possível virada LONG → SHORT ─────
// (em FundoRes, "minimo" guarda aqui a MÁXIMA recente)
function calcTopoPre(d: XVelas, info: IndicadorInfo, atr: number, adx: number, adxAntes: number): FundoRes | null {
  const n = d.c.length;
  if (n < 60 || !(atr > 0) || !(info.preco > 0)) return null;
  const motivos: Motivo[] = [];
  const add = (pts: number, txt: string) => motivos.push({ pts, txt });
  const JAN = 16;
  const ini = n - JAN;
  let subindoFoguete = false, repique = false;
  const dAtr = (info.preco - info.topo) / atr;
  if (dAtr >= 5) add(2, `${info.distAbs.toFixed(1)}% acima da faixa (${dAtr.toFixed(1)}× ATR): muito esticada`);
  else if (dAtr >= 3) add(1, `${info.distAbs.toFixed(1)}% acima da faixa (${dAtr.toFixed(1)}× ATR): esticada`);
  else {
    // moeda que despencou e repicou: o topo costuma ser a própria faixa (resistência da queda), sem precisar rompê-la
    const altaVale = altaDoVale(d.l, info.preco);
    const tocou = Math.max(...d.h.slice(n - 6)) >= info.fundo - 0.25 * atr;
    const rejeita = info.preco <= info.topo + 0.5 * atr;
    // veio de cima = nas últimas 16 velas o preço esteve bem acima da faixa: é recuo de pump, não repique de queda
    const veioDeCima = Math.max(...d.h.slice(n - JAN)) > info.topo + REPIQUE_LADO_ATR * atr;
    const despencouAntes = quedaAntesDoVale(d.h, d.l) >= REPIQUE_MOV_ANTES_MIN;
    if (altaVale >= TOPO_TOQUE_VALE_MIN && tocou && rejeita && despencouAntes && !veioDeCima) { add(2, `voltou até a faixa (${altaVale.toFixed(0)}% acima da mínima) e está sendo rejeitada nela`); repique = true; }
  }
  const rs = rsiSerie(d.c, 14);
  const rsiAtual = rs[n - 1];
  const rsJan = rs.slice(ini, n).filter((x) => isFinite(x));
  const rsiMax = rsJan.length ? Math.max(...rsJan) : 50;
  if (rsiMax >= 75) add(1, `RSI chegou a ${rsiMax.toFixed(0)} nas últimas 4h (euforia)`);
  if (rsiMax >= 70 && isFinite(rsiAtual) && rsiAtual <= rsiMax - 6) add(1, `RSI virando pra baixo (${rsiMax.toFixed(0)} → ${rsiAtual.toFixed(0)})`);
  const base = xMediana(d.v.slice(Math.max(0, n - 96), ini).filter((x) => isFinite(x)));
  const vJan = d.v.slice(ini, n).map((x) => (isFinite(x) ? x : 0));
  const vPico = Math.max(...vJan);
  const idxPico = ini + vJan.indexOf(vPico);
  const vRec = (d.v[n - 1] + d.v[n - 2] + d.v[n - 3]) / 3;
  if (base > 0 && vPico >= 3 * base) {
    if (n - 1 - idxPico >= 2 && vRec <= vPico * 0.5) add(2, `pico de volume ${(vPico / base).toFixed(1)}× a média e já secando: compradores se esgotando`);
    else add(0, `pico de volume ${(vPico / base).toFixed(1)}× a média, ainda ativo`);
  }
  const hJan = d.h.slice(ini, n);
  const maxH = Math.max(...hJan);
  const desde = n - 1 - (ini + hJan.indexOf(maxH));
  if (desde <= 1) { subindoFoguete = true; add(-2, "ainda fazendo máximas novas (foguete subindo)"); }
  else if (desde >= 3 && d.c[n - 1] < maxH - atr) add(1, `parou de fazer máximas há ${desde * TF_MIN} min e já devolveu ${(((maxH - d.c[n - 1]) / maxH) * 100).toFixed(1)}% da máxima`);
  for (let k = n - 4; k < n; k++) {
    const rng = d.h[k] - d.l[k];
    if (!(rng > 0) || rng < 0.8 * atr) continue;
    const pavio = d.h[k] - Math.max(d.o[k], d.c[k]);
    if (pavio / rng >= 0.55 && (d.h[k] - d.c[k]) / rng >= 0.6) { add(1, "pavio longo de rejeição em cima (vendedores defendendo)"); break; }
  }
  const a0 = n - 8, b0 = n - 24;
  const rA = rs.slice(a0, n).filter((x) => isFinite(x)), rB = rs.slice(b0, a0).filter((x) => isFinite(x));
  if (rA.length && rB.length) {
    const maxHA = Math.max(...d.h.slice(a0, n)), maxHB = Math.max(...d.h.slice(b0, a0));
    const maxRA = Math.max(...rA), maxRB = Math.max(...rB);
    if (maxHA > maxHB && maxRA < maxRB - 2) add(2, `divergência baixista: preço fez máxima maior, RSI fez máxima menor (${maxRB.toFixed(0)} → ${maxRA.toFixed(0)})`);
  }
  if (adx >= 30 && adx - adxAntes <= -1) add(1, `ADX ${adx.toFixed(0)} caindo (era ${adxAntes.toFixed(0)}): força da alta esfriando`);
  else if (adx - adxAntes >= 2) add(-1, `ADX subindo (${adxAntes.toFixed(0)} → ${adx.toFixed(0)}): a alta ainda acelera`);
  if (d.c[n - 1] < d.o[n - 1] && d.c[n - 1] < d.l[n - 2]) add(1, "última vela 15m vermelha e fechou abaixo da mínima da anterior");
  repique = repique && !subindoFoguete;
  if (repique && REPIQUE_BONUS > 0) add(REPIQUE_BONUS, "⭐ repique rejeitado na faixa: retomada da queda anterior, SHORT a favor dela (prioridade)");
  const pts = motivos.reduce((s, m) => s + m.pts, 0);
  return { pts, conf: confFundo(pts, subindoFoguete), motivos, caindoFaca: subindoFoguete, minimo: maxH, dAtr, repique };
}
async function topoFinal(pre: FundoRes, instId: string, foPre?: FoInfo | null, inclinaRel?: number): Promise<FundoFinal> {
  const [fo, btc, bookImb] = await Promise.all([
    foPre !== undefined ? Promise.resolve(foPre) : getFundingOI(instId).catch(() => null),
    btcVar1h(),
    getBookImbalance(instId).catch(() => null),
  ]);
  const motivos = [...pre.motivos];
  const add = (pts: number, txt: string) => motivos.push({ pts, txt });
  // V63: espelho do fundoFinal — book e inclinação também contam a favor/contra a virada pra baixo
  if (bookImb != null && isFinite(bookImb)) {
    if (bookImb <= -BOOK_IMB_MIN_PCT) add(1, `book desequilibrado pra venda (${bookImb.toFixed(0)}%): reforça reversão/virada pra baixo`);
    else if (bookImb >= BOOK_IMB_MIN_PCT) add(-1, `book pesando pro lado comprador (+${bookImb.toFixed(0)}%): contra a virada pra baixo`);
  }
  if (inclinaRel !== undefined && isFinite(inclinaRel)) {
    if (-inclinaRel >= INCLINA_MOD) add(1, `inclinação da faixa ${inclinaTxt({ inclinaRel } as any)}: a favor da virada pra baixo`);
    else if (inclinaRel >= INCLINA_FORTE) add(-1, `inclinação da faixa ${inclinaTxt({ inclinaRel } as any)}: contra a virada, ainda subindo forte`);
  }
  if (fo && fo.funding !== null) {
    if (fo.funding >= 0.10) add(2, `funding +${fo.funding.toFixed(3)}%: comprados lotados, combustível pra queda (long squeeze)`);
    else if (fo.funding >= FUNDING_ALTO_PCT) add(1, `funding +${fo.funding.toFixed(3)}%: multidão comprada`);
  }
  if (fo && fo.oiChg !== null) {
    if (fo.oiChg <= -3) add(1, `OI caiu ${Math.abs(fo.oiChg).toFixed(1)}% em 4h: alta sem fôlego (posições fechando)`);
    else if (fo.oiChg >= 5) add(-1, `OI subiu ${fo.oiChg.toFixed(1)}% em 4h durante a alta: comprados novos entrando`);
  }
  if (btc !== null) {
    if (btc >= FUNDO_BTC_QUEDA_PCT) add(-2, `BTC subindo +${btc.toFixed(1)}% na última hora: altcoins tendem a seguir`);
    else if (btc <= -0.5) add(1, `BTC caindo ${btc.toFixed(1)}% na última hora`);
  }
  const pts = motivos.reduce((s, m) => s + m.pts, 0);
  return { ...pre, motivos, pts, conf: confFundo(pts, pre.caindoFaca), fo: fo ?? null, btc };
}
function topoTxt(r: { motivos: Motivo[]; conf: number }, maxPos = 5, maxNeg = 3, seta = ""): string {
  return fundoTxt(r, maxPos, maxNeg, seta).replace("Sinal de fundo", "Sinal de topo");
}
function msgTopo(info: InfoFiltravel, pct: number, alta: number, fin: FundoFinal, vivo: number | null, seta = ""): string {
  const foTxt = fundingOiTxt(fin.fo ?? { funding: null, oiChg: null });
  const ref = vivo ?? info.preco;
  const dFundo = ref > 0 ? ((ref - info.fundo) / ref) * 100 : 0;
  const dentro = ladoAtual(info) === null;
  const ligar = dentro
    ? `🔌 <b>Ligar o robô?</b>\n🕒 <b>PREPARE</b> — preço já está dentro da faixa, a ${Math.max(0, dFundo).toFixed(2)}% da linha de SHORT (${fmtPrice(info.fundo)}). O robô entra SHORT se uma vela 15m FECHAR abaixo dela. Se a aproximação ficar consistente e a confiança for ≥ ${CONF_MIN_REVERSAO}/10, o bot manda o 🚨 LIGUE AGORA.\n`
    : `🔌 <b>Ligar o robô?</b>\n⏳ <b>Ainda não</b> — preço ${info.distAbs.toFixed(2)}% acima da faixa; se o robô estiver ligado, está LONG. Ele só vira SHORT se uma vela 15m FECHAR abaixo de ${fmtPrice(info.fundo)} (faltam ${Math.max(0, dFundo).toFixed(2)}%).\n`;
  return `${fin.repique ? "⭐🔴 <b>REPIQUE SHORT — " : "🔴 <b>RADAR DE TOPO — "}${info.instId}</b>\n${DIVISOR}\n\n` +
    `📈 ${altaTxt(pct, alta)} · ${vivo !== null ? `preço agora ${fmtPrice(vivo)}` : `preço ${fmtPrice(info.preco)}`}\n` +
    `<i>${fin.repique ? "Moeda que despencou, repicou até a faixa e está sendo rejeitada: retomada da queda, SHORT a favor dela (prioridade)." : "Possível virada de alta pra queda."}</i> <b>Ainda não é entrada</b>: o robô só abre SHORT quando fechar 15m abaixo do indicador.\n\n` +
    ligar + `\n` +
    `${topoTxt(fin, 5, 3, seta)}\n` +
    (foTxt ? `💸 ${foTxt}\n` : "") +
    `\n📍 faixa: fundo ${fmtPrice(info.fundo)} | topo ${fmtPrice(info.topo)}${dentro ? " (preço dentro da faixa)" : ` (preço ${info.distAbs.toFixed(2)}% acima)`}\n` +
    `❌ Invalida: romper a máxima recente (${fmtPrice(fin.minimo)})<i> — aí o topo ainda não se formou</i>.\n` +
    `⭐ /seguir ${info.instId.replace("-USDT", "").toLowerCase()} pra ser avisado quando chegar na linha.`;
}
async function registrarAlertaTopo(SB: any, info: InfoFiltravel, pct: number, conf: number | null = null, repique = false) {
  try {
    await inserirLogAlerta(SB, {
      instid: info.instId, lado: "short", tipo: "topo", status: repique ? "🔴 REPIQUE SHORT" : "🔴 TOPO", fresco: false,
      idade_candles: info.idadeCandles, pct24: pct, preco: info.preco, adx: info.adx ?? null, rsi: info.rsi ?? null,
    }, conf);
    await registrarHipotese(SB, info.instId, repique ? "repique" : "topo", "short", Number(info.preco)); // V74: acompanha a hipótese (invalida/funcionou)
  } catch (e) { console.log("⚠️ registrarAlertaTopo erro", e); }
}
async function radarTopo(SB: any, pool: { instId: string; pct: number; volUsdt: number; up?: number }[], indicadores: (InfoFiltravel | null)[], posMap: Map<string, Pos[] | null>) {
  if (!TOPO_ON) return;
  const ativos = ALERT_CHAT_IDS.filter((ch) => !silChat(ch));
  if (!ativos.length) return;
  const ckVela = Math.floor(Date.now() / (TF_MIN * 60000));
  const cands: { info: InfoFiltravel; pct: number; alta: number }[] = [];
  let barradasAdx = 0; // V97
  const sombraRep: RepSombraCand[] = []; // V104: repiques barrados por ADX/DI (vão pro modo sombra)
  indicadores.forEach((info, i) => {
    const p = pool[i];
    if (!info || !info.top || !p) return;
    const alta = altaEfetiva(p.pct, Math.max(p.up ?? 0, info.altaVale ?? 0));
    if (alta < TOPO_ALTA_MIN || p.volUsdt < FILTRO_VOL_MIN_USDT) return;
    if (ladoAtual(info) === "short") return;
    if (info.top.pts < (info.top.repique ? Math.max(1, TOPO_PRE_MIN - 1) : TOPO_PRE_MIN)) return;
    // V104: repique (SHORT) só com ADX >= REPIQUE_ADX_MIN e −DI puxando; o que a regra barra vai pro modo sombra
    if (info.top.repique) {
      const mot = repMotivos("short", info.adx, info.adxAntes, info.diDom ?? null);
      if (mot.length) { sombraRep.push({ info, pct: p.pct, motivos: mot }); return; }
    }
    // V97: ADX desconhecido não barra; o corte de ADX do topo comum não vale pro repique (o repique segue a regra V104 acima).
    if (TOPO_ADX_MAX > 0 && !info.top.repique && typeof info.adx === "number" && isFinite(info.adx) && info.adx >= TOPO_ADX_MAX) { barradasAdx++; return; }
    cands.push({ info, pct: p.pct, alta });
  });
  cands.sort((a, b) => Number(!!b.info.top!.repique) - Number(!!a.info.top!.repique) || b.info.top!.pts - a.info.top!.pts);
  const top = cands.slice(0, RADAR_CAND_JANELA); // V74: janela maior que 8/6 — as de cima em cooldown ocupavam todas as vagas e as de baixo nunca saíam
  console.log(`🔴 radar de topo: ${cands.length} candidata(s) com alta ≥ ${TOPO_ALTA_MIN}% e pré-filtro ≥ ${TOPO_PRE_MIN} pts${barradasAdx ? ` (+${barradasAdx} barrada(s) por ADX ≥ ${TOPO_ADX_MAX})` : ""}${sombraRep.length ? ` (+${sombraRep.length} repique(s) barrado(s): ${repRegraTxt()})` : ""}`);
  if (!top.length) { await repSombraRodar(SB, sombraRep, "short"); return; }
  const rowsMap = new Map<string, any>();
  try {
    const { data } = await SB.from(TAB).select("*").in("instid", top.map((c) => "_TOPO_" + c.info.instId));
    ((data || []) as any[]).forEach((r) => rowsMap.set(r.instid, r));
  } catch (e) { console.log("⚠️ leitura do cooldown do radar de topo falhou", e); }
  const agora = Date.now();
  let enviados = 0, enviadosRep = 0;
  for (const c of top) {
    const ehRep = !!c.info.top?.repique;
    if (ehRep ? enviadosRep >= REPIQUE_MAX_POR_RODADA : enviados >= TOPO_MAX_POR_RODADA) continue;
    const inst = c.info.instId;
    const row = rowsMap.get("_TOPO_" + inst);
    let subidaDe: number | null = null; // V96: nota anterior, quando este é um alerta de "nota subiu" dentro do cooldown
    if (row?.last_alert_at && agora - new Date(row.last_alert_at).getTime() < (ehRep ? REPIQUE_COOLDOWN_MIN : TOPO_COOLDOWN_MIN) * 60000) {
      const prevC = parseUltimaConf(row?.last_status), idadeMin = (agora - new Date(row.last_alert_at).getTime()) / 60000;
      if (RADAR_UPGRADE_DELTA <= 0 || prevC === null || idadeMin < RADAR_UPGRADE_GAP_MIN || (c.info.top!.conf ?? 0) < prevC + RADAR_UPGRADE_DELTA - 2) continue;
      subidaDe = prevC;
    }
    // Auditoria (achado #18, mesmo bug em radarFundo/radarCompressao): ver comentário lá.
    if (_fundoAvaliado.get("topo|" + inst) === ckVela) continue;
    const [fin, vivo] = await Promise.all([topoFinal(c.info.top!, inst), precoAoVivo(inst)]);
    if (subidaDe !== null && fin.conf < subidaDe + RADAR_UPGRADE_DELTA) { _fundoAvaliado.set("topo|" + inst, ckVela); continue; }
    const minConf = fin.repique && !fin.caindoFaca ? REPIQUE_CONF_MIN : TOPO_CONF_MIN;
    if (fin.conf < minConf) { _fundoAvaliado.set("topo|" + inst, ckVela); console.log(`🔴 radar de topo: ${inst} ${fin.conf}/10 < ${minConf} (${fin.caindoFaca ? "foguete" : "sinais insuficientes"})`); continue; }
    const seta = setaTxt(row?.last_status, fin.conf);
    const msg = (subidaDe !== null ? `⬆️ <b>NOTA SUBIU</b> ${subidaDe}/10 → ${fin.conf}/10 (2º alerta da mesma moeda)\n\n` : "") + msgTopo(c.info, c.pct, c.alta, fin, vivo, seta) + volLinha(inst);
    const ids = await Promise.all(ativos.map(async (ch) => {
      const atrRadar = typeof (c.info as any).atr === "number" ? (c.info as any).atr : 0;
      let extra = "";
      for (const p of posDaMoeda(posMap.get(ch) ?? null, inst).filter((x) => x.lado === "long")) {
        extra += `\n\n📌 <b>Você está LONG em ${inst}</b> — entrada ${fmtPrice(p.entrada)} | ${p.pnl >= 0 ? "➕" : "➖"} PnL ${sgn(p.pnl)} USDT (${sgn(p.pnlPct, 1)}% da margem)\n${p.pnl > 0 ? `Sinais de topo aparecendo: considere realizar parte do lucro e ${stopSugeridoTxt(p, atrRadar)}.` : `Sinais de topo aparecendo contra a sua posição LONG, que está no prejuízo: confira o stop antes.`}`;
      }
      return await enviarAlertaMoeda(SB, ch, `TOPO_${inst}`, cortar(msg + extra + notaLat()), botaoAnalisar(inst));
    }));
    if (!ids.some(Boolean)) { console.log(`⚠️ radar de topo: ${inst} — nenhum envio confirmado, não vou queimar o cooldown`); continue; }
    _fundoAvaliado.set("topo|" + inst, ckVela);
    await registrarAlertaTopo(SB, c.info, c.pct, fin.conf, !!fin.repique);
    await upsertLinha(SB, "_TOPO_" + inst, { last_status: `${fin.conf}/10`, last_alert_at: new Date().toISOString() });
    if (ehRep) enviadosRep++; else enviados++;
    console.log(`🔴 radar de topo enviado: ${inst} ${fin.conf}/10${ehRep ? " ⭐ repique" : ""}${subidaDe !== null ? ` (nota subiu de ${subidaDe})` : ""}`);
  }
  await repSombraRodar(SB, sombraRep, "short"); // V104: depois dos alertas reais, pra não atrasá-los
}
async function runTopo(chatId: number | string) {
  const inicio = Date.now();
  const variacoes = await getVariacoes24h();
  const pool = [...variacoes].sort((a, b) => altaEfetiva(b.pct, b.up) - altaEfetiva(a.pct, a.up)).slice(0, OPORT_POOL);
  const infos = await emLotes(pool.map((t) => t.instId), 15, calcIndicadorFiltro);
  const cands: { info: InfoFiltravel; pct: number; alta: number }[] = [];
  infos.forEach((info, i) => {
    const p = pool[i];
    if (!info || !info.top) return;
    const alta = altaEfetiva(p.pct, Math.max(p.up, info.altaVale ?? 0));
    if (alta < TOPO_ALTA_MIN || p.volUsdt < FILTRO_VOL_MIN_USDT) return;
    if (ladoAtual(info) === "short") return;
    // V54: idem /fundo — pré-filtro de pts do radar de topo (antes listava moeda sem sinal nenhum).
    if (info.top.pts < (info.top.repique ? Math.max(1, TOPO_PRE_MIN - 1) : TOPO_PRE_MIN)) return;
    cands.push({ info, pct: p.pct, alta });
  });
  cands.sort((a, b) => Number(!!b.info.top!.repique) - Number(!!a.info.top!.repique) || b.info.top!.pts - a.info.top!.pts);
  const top = cands.slice(0, 8);
  const fins = await Promise.all(top.map((c) => topoFinal(c.info.top!, c.info.instId)));
  const itens = top.map((c, i) => ({ c, fin: fins[i] })).sort((a, b) => Number(!!b.fin.repique) - Number(!!a.fin.repique) || b.fin.conf - a.fin.conf || b.fin.pts - a.fin.pts);
  const dur = ((Date.now() - inicio) / 1000).toFixed(1);
  let msg = `🔴 <b>TOPO — dispararam (no dia ou desde a mínima) + sinais de exaustão</b> — ${dur}s\n<i>pool: top ${OPORT_POOL} que mais subiram (24h ou desde a mínima) · alta ≥ ${TOPO_ALTA_MIN}% · volume ≥ ${(FILTRO_VOL_MIN_USDT / 1e6).toFixed(1)}M USDT</i>\n${DIVISOR}\n\n`;
  if (!itens.length) msg += "nenhuma moeda com alta, liquidez e sinais mínimos agora.\n\n";
  itens.forEach(({ c, fin }, i) => {
    const pos = fin.motivos.filter((m) => m.pts > 0).sort((a, b) => b.pts - a.pts).slice(0, 3).map((m) => m.txt);
    const neg = fin.motivos.filter((m) => m.pts < 0).sort((a, b) => a.pts - b.pts).slice(0, 2).map((m) => m.txt);
    if (i > 0) msg += `${MINI_DIVISOR}\n`;
    msg += `<b>${i + 1}. ${c.info.instId}</b>${fin.repique ? " ⭐ repique" : ""} 📈 ${altaTxt(c.pct, c.alta)} · ${confEmoji(fin.conf)} <b>${fin.conf}/10</b>\n`;
    if (pos.length) msg += `✅ ${pos.join(" · ")}\n`;
    if (neg.length) msg += `⚠️ ${neg.join(" · ")}\n`;
    msg += `preço ${fmtPrice(c.info.preco)} (${ladoAtual(c.info) === "long" ? `${c.info.distAbs.toFixed(1)}% acima da faixa` : "dentro da faixa"}) | fundo ${fmtPrice(c.info.fundo)}\n\n`;
  });
  msg += `<i>⭐ repique = despencou, repicou até a faixa e foi rejeitada (retomada da queda). Aviso antecipado, não é entrada: o robô só abre SHORT quando fechar 15m abaixo do indicador. O alerta automático sai com confiança ≥ ${TOPO_CONF_MIN}/10. Use /seguir MOEDA pra ser avisado na linha.</i>`;
  await enviarEmPartes(chatId, msg, itens.length ? botoesAnalisarLista(itens.map(({ c }) => c.info.instId)) : undefined); // V107: em partes
}
// ───── V36: radar de COMPRESSÃO — faixa achatada + velas minúsculas + volume começando a subir = rompimento iminente (direção imprevisível: o robô ligado pega o lado que romper) ─────
type CompRes = { pts: number; conf: number; motivos: Motivo[]; volOk: boolean };
function calcCompressao(info: InfoFiltravel, volUsdt: number): CompRes | null {
  const lr = info.larguraRel;
  if (lr === undefined || !(lr <= SQUEEZE_REL)) return null;
  const idade = info.idadeCandles;
  if (idade !== null && idade > ALERT_FRESCO_CANDLES) return null;
  if (info.inclinaRel !== undefined && Math.abs(info.inclinaRel) >= INCLINA_FORTE) return null;
  if (info.distAbs > COMPRESS_DIST_MAX_PCT) return null;
  const motivos: Motivo[] = [];
  const add = (pts: number, txt: string) => motivos.push({ pts, txt });
  const pctTip = `${Math.round(lr * 100)}% da largura típica`;
  add(lr <= COMPRESS_REL ? 3 : 2, `faixa ${lr <= COMPRESS_REL ? "muito " : ""}comprimida (${pctTip})`);
  const cc = info.compCandles ?? 0;
  if (cc >= 16) add(2, `comprimida há ~${cc * TF_MIN} min (mola bem armada)`);
  else if (cc >= 8) add(1, `comprimida há ~${cc * TF_MIN} min`);
  if (info.inclinaRel !== undefined && Math.abs(info.inclinaRel) <= INCLINA_PLANA) add(1, "faixa achatada (sem inclinação)");
  if (info.rangeRel !== undefined && info.rangeRel <= 0.7) add(1, `velas minúsculas coladas na faixa (${Math.round(info.rangeRel * 100)}% do tamanho típico)`);
  const vr = info.volRatio ?? null;
  const volOk = vr !== null && vr >= COMPRESS_VOL_MIN;
  if (vr !== null && vr >= VOL_ACEL_RATIO) add(3, `volume acelerando (${vr.toFixed(1)}× a média)`);
  else if (volOk) add(2, `volume começando a subir (${vr!.toFixed(1)}× a média)`);
  else if (vr !== null && vr <= VOL_SECO_RATIO) add(-1, `volume ainda seco (${vr.toFixed(1)}× a média): falta combustível`);
  const adxDif = (info.adx ?? 0) - (info.adxAntes ?? info.adx ?? 0);
  if (adxDif > 0.5 && info.adx < X_ADX_FORTE) add(1, `ADX saindo do fundo (${info.adx.toFixed(1)} ↗)`);
  if (volUsdt >= FILTRO_VOL_MIN_USDT * 5) add(1, "volume 24h alto (liquidez)");
  if (idade !== null && !(vr !== null && vr >= VOL_ACEL_RATIO)) add(-1, "já cruzou, mas o 1º cruzamento em faixa comprimida costuma ser falso");
  const pts = motivos.reduce((s, m) => s + m.pts, 0);
  const conf = Math.max(0, Math.min(10, Math.round((pts / COMPRESS_PTS_MAX) * 10)));
  return { pts, conf, motivos, volOk };
}
function compTxt(r: { motivos: Motivo[]; conf: number }, maxPos = 5, maxNeg = 3, seta = ""): string {
  const pos = r.motivos.filter((m) => m.pts > 0).sort((a, b) => b.pts - a.pts).slice(0, maxPos);
  const neg = r.motivos.filter((m) => m.pts < 0).sort((a, b) => a.pts - b.pts).slice(0, maxNeg);
  let t = `🧭 Sinal de compressão: <b>${r.conf}/10</b> ${confEmoji(r.conf)}${seta ? `\nMovimento: ${seta}` : ""}`;
  for (const m of pos) t += `\n   ✅ ${m.txt}`;
  for (const m of neg) t += `\n   ⚠️ ${m.txt}`;
  return t;
}
function linhasCompTxt(info: InfoFiltravel, vivo: number | null): string {
  const ref = vivo ?? info.preco;
  const dLong = ref > 0 ? ((info.topo - ref) / ref) * 100 : 0;
  const dShort = ref > 0 ? ((ref - info.fundo) / ref) * 100 : 0;
  const f = (d: number) => (d > 0 ? `faltam ${d.toFixed(2)}%` : `já passou ${(-d).toFixed(2)}%`);
  return `🟢 LONG se uma vela 15m FECHAR acima de ${fmtPrice(info.topo)} (${f(dLong)})\n🔴 SHORT se uma vela 15m FECHAR abaixo de ${fmtPrice(info.fundo)} (${f(dShort)})`;
}
function msgCompressao(info: InfoFiltravel, res: CompRes, vivo: number | null, seta = ""): string {
  const vr = info.volRatio ?? null;
  const cc = info.compCandles ?? 0;
  return `🗜️ <b>PREPARE: rompimento iminente — ${info.instId}</b>\n${DIVISOR}\n\n` +
    `<i>Faixa comprimida (${Math.round((info.larguraRel ?? 1) * 100)}% da largura típica${cc >= 4 ? `, há ~${cc * TF_MIN} min` : ""}) e volume começando a subir${vr !== null ? ` (${vr.toFixed(1)}× a média)` : ""}.</i> ${vivo !== null ? `Preço agora ${fmtPrice(vivo)}.` : `Preço ${fmtPrice(info.preco)}.`} <b>Ainda não é entrada</b>: a direção não dá pra prever.\n\n` +
    `🔌 <b>Ligar o robô?</b>\n🕒 <b>PREPARE</b> — o robô ligado pega o lado que romper:\n${linhasCompTxt(info, vivo)}\n` +
    `<i>⚠️ O 1º cruzamento em compressão costuma ser falso (o robô pode entrar e ser stopado antes do movimento verdadeiro). Se cruzar, espere o fechamento da vela com volume; o bot já desconta 1 ponto de confiança no cruzamento sem volume.</i>\n\n` +
    `${compTxt(res, 5, 3, seta)}\n\n` +
    `📍 faixa: fundo ${fmtPrice(info.fundo)} | topo ${fmtPrice(info.topo)} · 📐 ${inclinaTxt(info)}\n` +
    `⭐ /seguir ${info.instId.replace("-USDT", "").toLowerCase()} pra ser avisado quando chegar na linha.`;
}
async function registrarAlertaCompressao(SB: any, info: InfoFiltravel, pct: number, conf: number | null = null, amp: number | null = null) {
  if (!_placarTemEntrada) return;
  try {
    // lado provisório: o placar troca pelo lado do 1º fechamento fora da faixa (o que o robô ligado pegaria)
    const r2 = (x: number | undefined | null, d = 2) => (x === undefined || x === null || !isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);
    const feat = JSON.stringify({
      lr: r2(info.larguraRel), cc: info.compCandles ?? 0, inc: r2(info.inclinaRel), rng: r2(info.rangeRel), vr: r2(info.volRatio),
      adx: r2(info.adx, 1), dadx: r2((info.adx ?? 0) - (info.adxAntes ?? info.adx ?? 0), 1), dist: r2(info.distAbs), idade: info.idadeCandles, amp,
    });
    await inserirLogAlerta(SB, {
      instid: info.instId, lado: "long", tipo: "compressao", status: "🗜️ COMPRESSÃO", fresco: false,
      idade_candles: info.idadeCandles, pct24: pct, preco: info.preco, adx: info.adx ?? null, rsi: info.rsi ?? null,
    }, conf, feat);
  } catch (e) { console.log("⚠️ registrarAlertaCompressao erro", e); }
}
const _ampCache = new Map<string, { t: number; v: number | null }>();
async function amplitude24h(inst: string): Promise<number | null> {
  const c = _ampCache.get(inst);
  if (c && Date.now() - c.t < 6 * 3600000) return c.v;
  let v: number | null = null;
  try {
    const d = await xCandles(inst, TIMEFRAME, COMPRESS_AMP_VELAS);
    const jan = Math.round(1440 / TF_MIN);
    if (d && d.c.length >= jan + 20) {
      const amps: number[] = [];
      for (let k = 0; k + jan < d.c.length; k += 4) {
        let mx = -Infinity, mn = Infinity;
        for (let i = k + 1; i <= k + jan; i++) { if (d.h[i] > mx) mx = d.h[i]; if (d.l[i] < mn) mn = d.l[i]; }
        if (d.c[k] > 0 && isFinite(mx) && isFinite(mn)) amps.push(((mx - mn) / d.c[k]) * 100);
      }
      if (amps.length >= 10) v = Math.round(_med(amps) * 10) / 10;
    }
  } catch { v = null; }
  _ampCache.set(inst, { t: Date.now(), v });
  return v;
}
async function radarCompressao(SB: any, variacoes: VarInfo[], pool: { instId: string; pct: number; volUsdt: number }[], indicadores: (InfoFiltravel | null)[], posMap: Map<string, Pos[] | null>) {
  if (!COMPRESS_ON) return;
  const ativos = ALERT_CHAT_IDS.filter((ch) => !silChat(ch));
  if (!ativos.length) return;
  const ckVela = Math.floor(Date.now() / (TF_MIN * 60000));
  const noPool = new Set(pool.map((p) => p.instId));
  const universo = variacoes.filter((v) => v.volUsdt >= FILTRO_VOL_MIN_USDT && !noPool.has(v.instId)).map((v) => v.instId).sort();
  const extras: string[] = [];
  if (universo.length && COMPRESS_ROT_N > 0) {
    const n = Math.min(COMPRESS_ROT_N, universo.length);
    const ini = _compCursor % universo.length;
    for (let i = 0; i < n; i++) extras.push(universo[(ini + i) % universo.length]);
    _compCursor = (ini + n) % universo.length;
  }
  const extraInfos = extras.length ? await emLotes(extras, 20, calcIndicadorFiltro) : [];
  const varMap = new Map(variacoes.map((v) => [v.instId, v] as [string, VarInfo]));
  const cands: { info: InfoFiltravel; res: CompRes; pct: number }[] = [];
  let semAdx = 0, semSubida = 0;
  const avalia = (info: InfoFiltravel | null, vol: number, pct: number) => {
    if (!info || vol < FILTRO_VOL_MIN_USDT) return;
    const res = calcCompressao(info, vol);
    if (!res || !res.volOk || res.conf < COMPRESS_CONF_MIN) return;
    if (COMPRESS_CONF_MAX > 0 && res.conf > COMPRESS_CONF_MAX) return;
    // V102: ADX mínimo e subindo (só conta quem já passou na nota, pro log mostrar o que a regra de ADX cortou)
    if (COMPRESS_ADX_MIN > 0 && !(typeof info.adx === "number" && isFinite(info.adx) && info.adx >= COMPRESS_ADX_MIN)) { semAdx++; return; }
    if (COMPRESS_ADX_MAX > 0 && typeof info.adx === "number" && isFinite(info.adx) && info.adx >= COMPRESS_ADX_MAX) { semAdx++; return; } // V103: ADX já forte (15+) não conta, mesmo subindo
    if (COMPRESS_ADX_SUBINDO && typeof info.adxAntes === "number" && isFinite(info.adxAntes) && !(info.adx - info.adxAntes > COMPRESS_ADX_SUBINDO_MIN)) { semSubida++; return; }
    cands.push({ info, res, pct });
  };
  indicadores.forEach((info, i) => avalia(info, pool[i]?.volUsdt ?? 0, pool[i]?.pct ?? 0));
  extraInfos.forEach((info, i) => avalia(info, varMap.get(extras[i])?.volUsdt ?? 0, varMap.get(extras[i])?.pct ?? 0));
  cands.sort((a, b) => b.res.conf - a.res.conf || b.res.pts - a.res.pts);
  console.log(`🗜️ radar de compressão: ${cands.length} candidata(s) com confiança ${COMPRESS_CONF_MAX > 0 ? `${COMPRESS_CONF_MIN}–${COMPRESS_CONF_MAX}` : `≥ ${COMPRESS_CONF_MIN}`}${compAdxTxt() ? ` e ${compAdxTxt()}` : ""} (ADX cortou ${semAdx} por nível + ${semSubida} por não subir; ${pool.length} do pool + ${extras.length} do rodízio, cursor ${_compCursor}/${universo.length})`);
  if (!cands.length) return;
  const top = cands.slice(0, RADAR_CAND_JANELA); // V74: janela maior que 8/6 — as de cima em cooldown ocupavam todas as vagas e as de baixo nunca saíam
  const rowsMap = new Map<string, any>();
  try {
    const { data } = await SB.from(TAB).select("*").in("instid", top.map((c) => "_COMP_" + c.info.instId));
    ((data || []) as any[]).forEach((r) => rowsMap.set(r.instid, r));
  } catch (e) { console.log("⚠️ leitura do cooldown do radar de compressão falhou", e); }
  const agora = Date.now();
  let enviados = 0;
  for (const c of top) {
    if (enviados >= COMPRESS_MAX_POR_RODADA) break;
    const inst = c.info.instId;
    const row = rowsMap.get("_COMP_" + inst);
    if (row?.last_alert_at && agora - new Date(row.last_alert_at).getTime() < COMPRESS_COOLDOWN_MIN * 60000) continue;
    // Auditoria (achado #18, mesmo bug em radarFundo/radarTopo): ver comentário lá.
    if (_fundoAvaliado.get("comp|" + inst) === ckVela) continue;
    // V95: moeda parada no dia não gera compressão quando COMPRESS_PCT24_MIN > 0.
    if (COMPRESS_PCT24_MIN > 0 && Math.abs(c.pct) < COMPRESS_PCT24_MIN) {
      console.log(`🗜️ ${inst}: compressão ${c.res.conf}/10 ignorada — |24h| ${Math.abs(c.pct).toFixed(1)}% < ${COMPRESS_PCT24_MIN}%`);
      _fundoAvaliado.set("comp|" + inst, ckVela);
      continue;
    }
    // V90: volatilidade da moeda. Com COMPRESS_AMP_MIN_PCT > 0, moeda menos volátil que isso não gera alerta (amplitude desconhecida deixa passar).
    const amp = await amplitude24h(inst);
    if (COMPRESS_AMP_MIN_PCT > 0 && amp !== null && amp < COMPRESS_AMP_MIN_PCT) {
      console.log(`🗜️ ${inst}: compressão ${c.res.conf}/10 ignorada — amplitude de 24h ${amp}% < ${COMPRESS_AMP_MIN_PCT}%`);
      _fundoAvaliado.set("comp|" + inst, ckVela);
      continue;
    }
    const vivo = await precoAoVivo(inst);
    const seta = setaTxt(row?.last_status, c.res.conf);
    const msg = msgCompressao(c.info, c.res, vivo, seta) + volLinha(inst);
    const ids = await Promise.all(ativos.map(async (ch) => {
      let extra = "";
      for (const p of posDaMoeda(posMap.get(ch) ?? null, inst)) {
        extra += `\n\n📌 <b>Você está ${p.lado === "long" ? "LONG" : "SHORT"} em ${inst}</b> — entrada ${fmtPrice(p.entrada)} | ${p.pnl >= 0 ? "➕" : "➖"} PnL ${sgn(p.pnl)} USDT (${sgn(p.pnlPct, 1)}% da margem)\nO rompimento pode vir pros dois lados: confira o stop antes.`;
      }
      return await enviarAlertaMoeda(SB, ch, `COMPRESSAO_${inst}`, cortar(msg + extra + notaLat()), botaoAnalisar(inst));
    }));
    if (!ids.some(Boolean)) { console.log(`⚠️ radar de compressão: ${inst} — nenhum envio confirmado, não vou queimar o cooldown`); continue; }
    _fundoAvaliado.set("comp|" + inst, ckVela);
    await registrarAlertaCompressao(SB, c.info, c.pct, c.res.conf, amp);
    await upsertLinha(SB, "_COMP_" + inst, { last_status: `${c.res.conf}/10`, last_alert_at: new Date().toISOString() });
    enviados++;
    console.log(`🗜️ radar de compressão enviado: ${inst} ${c.res.conf}/10`);
  }
}
const ALVO_RR = numEnv("ALVO_RR", "2");
const STOP_ATR_MULT = numEnv("STOP_ATR_MULT", "1");
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
  let top: FundoRes | null = null;
  if (TOPO_ON) { try { top = calcTopoPre(d, info, atr, adx, adxAntes); } catch (e) { console.log("⚠️ calcTopoPre falhou", instId, e); } }
  return { ...info, adx, adxAntes, diDom: xDiDominante(d.h, d.l, d.c, 14), rsi: calcRSI(d.c, 14), atr, volRatio: volAcel(d.v), trocas: contarTrocas(d.c), bottom, ddPico: ddDoPico(d.h, info.preco), altaVale: altaDoVale(d.l, info.preco), top, rangeRel: rangeRelDe(d.h, d.l, d.c) };
}
type MotivoDescarte = "volume" | "adx" | "rsi" | "dist" | "serrote";
function motivoDescarte(x: InfoFiltravel, volUsdt: number, checaDist: boolean, lado?: "long" | "short"): MotivoDescarte | null {
  if (volUsdt < FILTRO_VOL_MIN_USDT) return "volume";
  if (x.adx < FILTRO_ADX_MIN) return "adx";
  // V74: ADX precisa estar subindo (sem o adxAntes não dá pra saber: não barra)
  if (FILTRO_ADX_SUBINDO && typeof x.adxAntes === "number" && isFinite(x.adxAntes) && (FILTRO_ADX_SUBINDO_ATE <= 0 || x.adx < FILTRO_ADX_SUBINDO_ATE) && !(x.adx > x.adxAntes)) return "adx";
  if (ESTRAT_PUMP && lado) {
    if (lado === "long" ? x.rsi > FILTRO_RSI_MAX_LONG : x.rsi < FILTRO_RSI_MIN) return "rsi";
  } else if (x.rsi > FILTRO_RSI_MAX || x.rsi < FILTRO_RSI_MIN) return "rsi";
  if (checaDist && x.distAbs > FILTRO_DIST_MAX_PCT) return "dist";
  if (lado && SERROTE_MAX > 0 && (x.trocas ?? 0) >= SERROTE_MAX) return "serrote";
  return null;
}
// V36: /oportunidade e /reversao seguem a mesma regra dos alertas — o tipo vem do LADO que o robô pegaria contra o movimento de 24h
//   oportunidade = a favor do dia · reversão = contra o dia (SHORT em moeda que subiu = virada LONG → SHORT; LONG em moeda que caiu = virada SHORT → LONG)
type ItemLado = { info: InfoFiltravel; pct: number; lado: "long" | "short"; tipo: "oportunidade" | "reversao"; noAlerta: boolean; repique: boolean };
let _ladosCache: { t: number; itens: ItemLado[] } | null = null;
// V54: contagem dos descartes da última montagem da lista (a mesma do cache), pra mensagem de lista vazia dizer o motivo
let _ladosDescarte: { pool: number; cont: Record<string, number>; semFundo: number } | null = null;
function textoListaVazia(d: { pool: number; cont: Record<string, number>; semFundo: number } | null, outroTipo: number): string {
  if (!d) return "sem dados no momento (nenhuma moeda passou nos filtros)\n";
  const nomes: [string, number][] = [
    [`distância > ${FILTRO_DIST_MAX_PCT}% da linha`, d.cont.dist ?? 0], [FILTRO_ADX_SUBINDO ? "ADX baixo ou não subindo" : "ADX baixo", d.cont.adx ?? 0], ["RSI fora da faixa", d.cont.rsi ?? 0],
    ["volume baixo", d.cont.volume ?? 0], ["serrote", d.cont.serrote ?? 0], ["LONG sem sinal de fundo", d.semFundo],
  ];
  const motivos = nomes.filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t}: ${n}`).join(" · ");
  let m = `nenhuma moeda do pool (${d.pool}) passou nos filtros agora`;
  if (motivos) m += `\n<i>descartadas por → ${motivos}</i>`;
  if (outroTipo > 0) m += `\n<i>${outroTipo} passaram, mas são do outro tipo (veja /oportunidade e /reversao)</i>`;
  return m + "\n";
}
async function itensPorLado(calc: (id: string) => Promise<InfoFiltravel | null> = calcIndicadorFiltro, variacoesIn?: VarInfo[]): Promise<ItemLado[]> {
  if (!variacoesIn && _ladosCache && Date.now() - _ladosCache.t < 60000) return _ladosCache.itens;
  const variacoes = variacoesIn ?? await getVariacoes24h();
  const n = Math.max(1, LISTA_POOL_LADO);
  const mapa = new Map<string, VarInfo>();
  // V56: volume mínimo ANTES do corte top-N (o motivoDescarte já barrava depois, mas as vagas eram gastas com moeda ilíquida)
  const liquidas = variacoes.filter((v) => v.volUsdt >= FILTRO_VOL_MIN_USDT);
  for (const v of [...liquidas].sort((a, b) => b.pct - a.pct).slice(0, n)) mapa.set(v.instId, v);
  for (const v of [...liquidas].sort((a, b) => a.pct - b.pct).slice(0, n)) mapa.set(v.instId, v);
  const pool = [...mapa.values()];
  const infos = await emLotes(pool.map((v) => v.instId), 15, calc);
  const itens: ItemLado[] = [];
  const cont: Record<MotivoDescarte, number> = { volume: 0, adx: 0, rsi: 0, dist: 0, serrote: 0 };
  let semFundo = 0;
  infos.forEach((info, i) => {
    if (!info) return;
    const v = pool[i];
    const setup = classificar(info, v.pct);
    const lado = setup?.lado ?? ladoDoSetup(info, chegandoNaLinha(info));
    const tipo = setup?.tipo ?? tipoDoLado(lado, v.pct, devolveuMovimento(info, lado));
    const m = motivoDescarte(info, v.volUsdt, true, lado);
    if (m) { cont[m]++; return; }
    if (!setup && ESTRAT_PUMP && tipo === "reversao" && lado === "long") {
      const b = info.bottom;
      if (!(FUNDO_ON && FUNDO_LIBERA_LONG && b && b.pts >= (b.repique ? Math.max(1, FUNDO_PRE_MIN - 1) : FUNDO_PRE_MIN) && !b.caindoFaca)) { semFundo++; return; }
    }
    itens.push({ info, pct: v.pct, lado, tipo, noAlerta: !!setup, repique: lado === "short" ? !!info.top?.repique : !!info.bottom?.repique });
  });
  console.log(`🧹 /oportunidade + /reversao: ${pool.length} no pool -> ${itens.length} passaram | descartadas: volume ${cont.volume}, ADX ${cont.adx}, RSI ${cont.rsi}, distância>${FILTRO_DIST_MAX_PCT}% ${cont.dist}, serrote ${cont.serrote}, LONG sem sinal de fundo ${semFundo}`);
  if (!variacoesIn) { _ladosCache = { t: Date.now(), itens }; _ladosDescarte = { pool: pool.length, cont: { ...cont }, semFundo }; }
  return itens;
}
async function runCruzado(chatId: number | string, tipoAlvo: "oportunidade" | "reversao", capturar?: (msg: string) => void) {
  const inicio = Date.now();
  const todos = await itensPorLado();
  // V101: a lista de reversão segue a mesma regra do alerta (ADX <= REV_ADX_MAX e DI puxando pro lado da reversão); o que fica de fora é contado na mensagem
  const doTipo = todos.filter((x) => x.tipo === tipoAlvo);
  const passouRegra = tipoAlvo === "reversao" ? doTipo.filter((x) => revMotivos(x.lado, x.info.adx, x.info.diDom ?? null, null, 0).length === 0) : doTipo;
  const foraRegra = doTipo.length - passouRegra.length;
  const top = passouRegra
    .map((x) => ({ x, nota: x.info.distAbs * (ADX_REF / Math.max(x.info.adx, 1)) }))
    .sort((a, b) => Number(b.x.repique) - Number(a.x.repique) || a.nota - b.nota)
    .slice(0, TOP_N_CRUZADO).map((e) => e.x);
  // V54: confiança X/10 nas primeiras moedas da lista (mesmo cálculo dos alertas e do /analise, via calcConfiancaAlerta). Limitado às
  // CONF_LISTA_TOP primeiras porque cada uma faz várias consultas (velas 1H, funding, book...); a ordem da lista não muda.
  const [varsC, perfilC] = top.length ? await Promise.all([getVariacoes24h().catch(() => [] as VarInfo[]), xPerfilHoras().catch(() => null)]) : [[] as VarInfo[], null];
  const volDe = new Map(varsC.map((v) => [v.instId, v.volUsdt] as [string, number]));
  const confsC = await Promise.all(top.map((x, i) => i >= CONF_LISTA_TOP ? Promise.resolve(null) : calcConfiancaAlerta(
    { info: x.info, pct: x.pct, lado: x.lado, tipo: x.tipo, status: "", fresco: false, aprox: chegandoNaLinha(x.info) },
    volDe.get(x.info.instId) ?? null, perfilC)));
  const dur = ((Date.now() - inicio) / 1000).toFixed(1);
  const pool = `top ${LISTA_POOL_LADO} que mais subiram + top ${LISTA_POOL_LADO} que mais caíram (24h)`;
  let msg = tipoAlvo === "oportunidade"
    ? `🚀 <b>OPORTUNIDADE — a favor do dia + perto do Indicador</b> — ${dur}s\n<i>LONG em moeda que subiu · SHORT em moeda que caiu · pool: ${pool}</i>\n${DIVISOR}\n\n`
    : `🔄 <b>REVERSÃO — vira contra o dia + perto do Indicador</b> — ${dur}s\n<i>SHORT em moeda que subiu (LONG → SHORT) · LONG em moeda que caiu (SHORT → LONG)${ESTRAT_PUMP ? ", só com sinais de fundo" : ""} · pool: ${pool}${REV_ADX_MAX > 0 || REV_DI_OBRIGA ? ` · regra: ${REV_ADX_MAX > 0 ? `ADX ≤ ${REV_ADX_MAX}` : ""}${REV_ADX_MAX > 0 && REV_DI_OBRIGA ? " e " : ""}${REV_DI_OBRIGA ? "DI a favor" : ""}` : ""}</i>\n${DIVISOR}\n\n`;
  if (top.length === 0) msg += textoListaVazia(_ladosDescarte, todos.length - foraRegra);
  if (tipoAlvo === "reversao" && foraRegra > 0) msg += `<i>🚫 ${foraRegra} reversão(ões) perto do Indicador ficaram de fora pela regra nova (ADX acima de ${REV_ADX_MAX} ou DI sem puxar a favor).</i>\n${top.length ? "\n" : ""}`;
  top.forEach((x, i) => {
    const j = x.info;
    const dia = `${x.pct >= 0 ? "📈 +" : "📉 "}${x.pct.toFixed(2)}% em 24h`;
    const ladoLinha = x.tipo === "oportunidade"
      ? `${x.lado === "long" ? "🟢 LONG a favor da alta" : "🔴 SHORT a favor da queda"} (${dia})`
      : `${x.lado === "short" ? "🔴 SHORT" : "🟢 LONG"} · virada ${x.lado === "short" ? "LONG → SHORT" : "SHORT → LONG"} (${dia})`;
    msg += `<b>${i + 1}. ${j.instId}</b>${x.repique ? " ⭐" : ""}${x.noAlerta ? " 🔔" : ""}\n${ladoLinha}\n📍 ${indicadorTxt(j)}\n${idadeTxt(j.idadeCandles)}\n${forcaLinha(j)}${confsC[i] ? `🧭 Confiança: ${confEmoji(confsC[i]!.conf)} <b>${confsC[i]!.conf}/10</b>\n` : ""}preço ${fmtPrice(j.preco)} | topo ${fmtPrice(j.topo)} | fundo ${fmtPrice(j.fundo)}\n\n`;
  });
  if (top.length) msg += `<i>🔔 = já no critério do alerta automático (oportunidade ≥ ${ALERT_OPORT_PCT_MIN}% · reversão ≥ ${ALERT_REV_PCT_MIN}% em 24h) · ⭐ = repique na faixa. Toque em 🔎 para a análise completa, com "ligar o robô?".</i>`;
  if (capturar) { capturar(msg); return; } // usado pelo /melhor: devolve o texto em vez de mandar pro chat
  await enviarEmPartes(chatId, msg, top.length ? botoesAnalisarLista(top.map((j) => j.info.instId)) : undefined); // V107: em partes
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
// lado que o robô pegaria: fora da faixa = o lado em que o preço está; dentro = pra onde está chegando, senão a linha mais perto
function ladoDoSetup(info: IndicadorInfo, ap: Aprox | null): "long" | "short" {
  if (info.preco > info.topo) return "long";
  if (info.preco < info.fundo) return "short";
  if (ap) return ap.alvo;
  return info.regiao.includes("topo") ? "long" : "short";
}
// V43: zona morta em torno de pct≈0 pra classificar o TIPO do repique (fundo/topo) — o repique por natureza
// acontece com a moeda devolvendo boa parte do movimento, então o pct de 24h costuma ficar bem perto de zero
// exatamente nesses casos; sem margem, ruído de rodada cruzava o zero e trocava oportunidade ↔ reversão à toa
// (mudando a confiança mínima exigida e o bloqueio de BTC). Dentro da zona morta, fica sempre "reversao" (mais
// conservador — só vira "oportunidade" quando o dia já virou de forma inequívoca).
const REPIQUE_PCT_ZONA = numEnv("REPIQUE_PCT_ZONA", "2");
// V54: zona morta ÚNICA, e só pra moeda que "disparou e devolveu" (LONG: queda >= FUNDO_QUEDA_MIN desde o pico; SHORT:
// alta >= TOPO_ALTA_MIN desde o vale — a mesma condição do repique/sinais de fundo e topo no classificar()). Antes só o
// classificar() respeitava REPIQUE_PCT_ZONA; a lista (itensPorLado) e o /agora usavam o tipoDoLado sem zona, e a mesma
// moeda podia ser "reversão" no alerta e "oportunidade" na lista. Fora desse caso (moeda que só subiu/caiu no dia, sem
// devolver), o tipo segue a regra simples de sempre (pct > 0 / pct < 0): o classificar() nem gera alerta abaixo de
// ALERT_OPORT_PCT_MIN/ALERT_REV_PCT_MIN, então não há incoerência a corrigir ali. Passe devolveu=true nos dois lados do
// repique (o classificar() já sabe) e use devolveuMovimento() onde só há o info.
const devolveuMovimento = (info: { ddPico?: number; altaVale?: number }, lado: "long" | "short") =>
  lado === "long" ? (info.ddPico ?? 0) >= FUNDO_QUEDA_MIN : (info.altaVale ?? 0) >= TOPO_ALTA_MIN;
// oportunidade = a favor do dia (LONG em moeda que subiu, SHORT em moeda que caiu); reversão = contra o dia (virada LONG → SHORT ou SHORT → LONG)
const tipoDoLado = (lado: "long" | "short", pct: number, devolveu = false): "oportunidade" | "reversao" => {
  const z = devolveu ? REPIQUE_PCT_ZONA : 0;
  return (lado === "long" && pct > z) || (lado === "short" && pct < -z) ? "oportunidade" : "reversao";
};
const tipoTxtDe = (tipo: "oportunidade" | "reversao", lado: "long" | "short") =>
  tipo === "oportunidade" ? "🚀 <b>OPORTUNIDADE</b> (continuação)" : `🔄 <b>REVERSÃO</b> — virada ${lado === "short" ? "LONG → SHORT" : "SHORT → LONG"} (moeda esticada)`;
function classificar(info: IndicadorInfo, pct: number): Setup | null {
  let status = statusIndicador(info.distAbs);
  const ap = chegandoNaLinha(info);
  if (rankStatus(status) === 0) { if (!ap) return null; status = "🎯 CHEGANDO"; }
  else if (ap && rankStatus(status) === 1) status = "🎯 CHEGANDO";
  const lado = ladoDoSetup(info, ap);
  const seguiu = (lado === "long" && pct > 0) || (lado === "short" && pct < 0);
  const abs = Math.abs(pct);
  const idade = info.idadeCandles;
  if (ALERT_IDADE_MAX_CANDLES > 0 && idade !== null && idade > ALERT_IDADE_MAX_CANDLES) return null;
  const fresco = idade !== null && idade <= ALERT_FRESCO_CANDLES;
  if (ESTRAT_PUMP && !seguiu && lado === "long") {
    const b = (info as Partial<InfoFiltravel>).bottom;
    if (!(FUNDO_ON && FUNDO_LIBERA_LONG && b && b.pts >= (b.repique ? Math.max(1, FUNDO_PRE_MIN - 1) : FUNDO_PRE_MIN) && !b.caindoFaca)) return null;
  }
  if (seguiu && abs >= ALERT_OPORT_PCT_MIN) return { info, pct, lado, tipo: "oportunidade", status, fresco, aprox: ap };
  if (!seguiu && abs >= ALERT_REV_PCT_MIN) return { info, pct, lado, tipo: "reversao", status, fresco, aprox: ap };
  // moeda que disparou e devolveu, mostrando sinais de fundo; tipo segue a mesma regra do tipoDoLado(..., true) (V44: antes
  // era sempre "reversao", mesmo com o dia já virado positivo — agora espelha o bloco SHORT abaixo)
  if (lado === "long" && FUNDO_ON && FUNDO_LIBERA_LONG) {
    const f = info as Partial<InfoFiltravel>;
    if ((f.ddPico ?? 0) >= FUNDO_QUEDA_MIN && f.bottom && f.bottom.pts >= (f.bottom.repique ? Math.max(1, FUNDO_PRE_MIN - 1) : FUNDO_PRE_MIN) && !f.bottom.caindoFaca) return { info, pct, lado, tipo: tipoDoLado(lado, pct, true), status, fresco, aprox: ap };
  }
  // espelho: moeda que despencou e repicou até a faixa (dia ainda fraco) mostrando exaustão da alta: repique SHORT
  if (lado === "short" && TOPO_ON) {
    const f = info as Partial<InfoFiltravel>;
    if ((f.altaVale ?? 0) >= TOPO_ALTA_MIN && f.top && f.top.pts >= (f.top.repique ? Math.max(1, TOPO_PRE_MIN - 1) : TOPO_PRE_MIN) && !f.top.caindoFaca) return { info, pct, lado, tipo: tipoDoLado(lado, pct, true), status, fresco, aprox: ap };
  }
  return null;
}
const _watchEnviado = new Set<string>();
// V39: msgIds (chat -> message_id) permite EDITAR a mesma mensagem em vez de mandar uma nova a cada rodada;
// distPrev/distPrevT guardam a última distância medida (e quando) pra calcular a velocidade de aproximação
// (🐢/🚀); cruzouAntes marca se já esteve além da linha nesta vela, pra pegar pavio de rejeição (toques).
type FinalPend = {
  inst: string; lado: "long" | "short"; ck: number; linha: number; atrPct: number;
  chats: string[]; estado: "ativo" | "cancelado"; tipo: "aviso" | "prepare";
  msgIds?: Record<string, number>; distPrev?: number; distPrevT?: number; cruzouAntes?: boolean; toques?: number; velPrev?: number;
};
const _finalPend = new Map<string, FinalPend>();
const finalKey = (inst: string, lado: string, ck: number) => `${inst}|${lado}|${ck}`;
async function carregarEstado(SB: any) {
  try {
    const { data } = await SB.from("alertas_indicador").select("last_status").eq("instid", ESTADO_ROW).maybeSingle();
    if (!data?.last_status) return;
    const j = JSON.parse(data.last_status);
    const ck = Math.floor(Date.now() / (TF_MIN * 60000));
    for (const [k, v] of Object.entries(j.conf || {})) if (Number(v) === ck) _confBarrada.set(k, ck);
    for (const [k, v] of Object.entries(j.confPre || {})) if (Number(v) === ck) _confBarradaPre.set(k, ck);
    for (const [k, v] of Object.entries(j.fundo || {})) if (Number(v) === ck) _fundoAvaliado.set(k, ck);
    for (const k of (Array.isArray(j.watch) ? j.watch : [])) _watchEnviado.add(String(k));
    if (isFinite(Number(j.comp?.cur))) _compCursor = Math.max(0, Math.floor(Number(j.comp.cur)));
    for (const p of (Array.isArray(j.final) ? j.final : [])) {
      const lado = p?.lado === "long" || p?.lado === "short" ? p.lado : null;
      const pck = Number(p?.ck);
      if (!lado || typeof p?.inst !== "string" || !isFinite(pck) || pck < ck - 2) continue;
      const msgIds: Record<string, number> = {};
      if (p.msgIds && typeof p.msgIds === "object") for (const [ch, id] of Object.entries(p.msgIds)) if (isFinite(Number(id))) msgIds[ch] = Number(id);
      _finalPend.set(finalKey(p.inst, lado, pck), {
        inst: p.inst, lado, ck: pck, linha: Number(p.linha) || 0, atrPct: Number(p.atrPct) || 0,
        chats: Array.isArray(p.chats) ? p.chats.map(String) : [], estado: p.estado === "cancelado" ? "cancelado" : "ativo", tipo: p.tipo === "prepare" ? "prepare" : "aviso",
        msgIds: Object.keys(msgIds).length ? msgIds : undefined,
        distPrev: isFinite(Number(p.distPrev)) ? Number(p.distPrev) : undefined,
        distPrevT: isFinite(Number(p.distPrevT)) ? Number(p.distPrevT) : undefined,
        cruzouAntes: !!p.cruzouAntes, toques: isFinite(Number(p.toques)) ? Number(p.toques) : 0,
        velPrev: isFinite(Number(p.velPrev)) ? Number(p.velPrev) : undefined,
      });
    }
  } catch (e) { console.log("⚠️ carregarEstado falhou (segue sem estado salvo)", e); }
}
async function salvarEstado(SB: any) {
  try {
    const ck = Math.floor(Date.now() / (TF_MIN * 60000));
    for (const [k, v] of _confBarrada) if (v !== ck) _confBarrada.delete(k);
    for (const [k, v] of _confBarradaPre) if (v !== ck) _confBarradaPre.delete(k);
    for (const [k, v] of _fundoAvaliado) if (v !== ck) _fundoAvaliado.delete(k);
    for (const [k, p] of _finalPend) if (p.ck < ck - 2) _finalPend.delete(k);
    const estado = { conf: Object.fromEntries(_confBarrada), confPre: Object.fromEntries(_confBarradaPre), fundo: Object.fromEntries(_fundoAvaliado), watch: [..._watchEnviado], final: [..._finalPend.values()], comp: { cur: _compCursor } };
    const { data: row } = await SB.from("alertas_indicador").select("instid").eq("instid", ESTADO_ROW).maybeSingle();
    const campos = { last_status: JSON.stringify(estado) };
    if (row) await SB.from("alertas_indicador").update(campos).eq("instid", ESTADO_ROW);
    else await SB.from("alertas_indicador").insert({ instid: ESTADO_ROW, ...campos });
  } catch (e) { console.log("⚠️ salvarEstado falhou", e); }
}
// V80: a LISTA DE ACOMPANHAMENTO é por chat. Cada chat tem a própria linha por moeda: WL_<chat>_<moeda> (mesmas colunas watch_* / last_status / last_alert_at).
// A linha da moeda sozinha (instid = moeda) fica só com o cooldown/último alerta global; não carrega mais vigilância.
const WL_PREFIXO = "WL_";
const wlId = (ch: string | number, inst: string) => `${WL_PREFIXO}${ch}_${inst}`;
function parseWL(row: any): { chat: string; inst: string } | null {
  const m = String(row?.instid || "").slice(WL_PREFIXO.length).match(/^(-?\d+)_(.+)$/);
  return String(row?.instid || "").startsWith(WL_PREFIXO) && m ? { chat: m[1], inst: m[2] } : null;
}
// Migração única: vigilância antiga (na linha da moeda) vira uma linha por chat de alerta, e a linha antiga é fechada.
async function migrarWatchLegado(SB: any) {
  try {
    const { data } = await SB.from(TAB).select("*").not("watch_until", "is", null).gt("watch_until", new Date().toISOString()).eq("watch_notificado", false)
      .not("instid", "like", `${WL_PREFIXO}%`).not("instid", "like", `${SEG_PREFIXO}%`);
    for (const r of (data || []) as any[]) {
      if (r.watch_side !== "long" && r.watch_side !== "short") continue;
      for (const ch of ALERT_CHAT_IDS) {
        await upsertLinha(SB, wlId(ch, r.instid), { last_status: r.last_status ?? "novo", last_alert_at: r.last_alert_at ?? null, watch_side: r.watch_side, watch_until: r.watch_until, watch_notificado: false });
      }
      await SB.from(TAB).update({ watch_until: null }).eq("instid", r.instid);
      console.log(`📋 migrei a vigilância de ${r.instid} pra ${ALERT_CHAT_IDS.length} chat(s)`);
    }
  } catch (e) { console.log("⚠️ migrarWatchLegado falhou", e); }
}
async function avisarVoltouPraDentro(SB: any, row: any, info: IndicadorInfo, posMap: Map<string, Pos[] | null>, soChat?: string): Promise<void> {
  if (WATCH_VOLTA_ATR <= 0 || !String(row.last_status || "").includes("✔")) return;
  const lado: "long" | "short" = row.watch_side;
  if (lado !== "long" && lado !== "short") return;
  const linha = lado === "long" ? info.topo : info.fundo;
  if (!(info.preco > 0) || !(linha > 0)) return;
  const dentroPct = lado === "long" ? ((linha - info.preco) / info.preco) * 100 : ((info.preco - linha) / info.preco) * 100;
  const atr = (info as { atr?: number }).atr;
  const atrPct = typeof atr === "number" && atr > 0 ? (atr / info.preco) * 100 : 0;
  const margem = Math.max(FINAL_CANCELA_PCT, WATCH_VOLTA_ATR * atrPct);
  if (dentroPct < margem) return;
  const psDe = (ch: string) => posDaMoeda(posMap.get(ch) ?? null, info.instId);
  // sem filtro de _watchEnviado: o marcador ✔ da linha já garante 1 aviso por alerta
  const dest = (soChat ? [soChat] : ALERT_CHAT_IDS).filter((ch) => !silChat(ch) || (SILENCIO_PROTECAO && psDe(ch).some((p) => p.lado === lado)));
  if (!dest.length) return;
  const nome = lado === "long" ? "LONG" : "SHORT";
  const horasDesde = row.last_alert_at ? ((Date.now() - new Date(row.last_alert_at).getTime()) / 3_600_000).toFixed(1) : "?";
  const msg =
    `↩️ <b>${info.instId}</b> — voltou pra dentro da faixa\n${DIVISOR}\n\n` +
    `Alerta original era <b>${nome}</b>, há ${horasDesde}h, já cruzado.\n` +
    `Agora o preço está ${dentroPct.toFixed(2)}% de volta pra dentro da linha de ${nome} (repique / cruzamento enfraqueceu). Ainda não cruzou pro lado contrário.\n` +
    `${indicadorTxt(info)}\n` +
    `preço ${fmtPrice(info.preco)} | topo ${fmtPrice(info.topo)} | fundo ${fmtPrice(info.fundo)}`;
  const oks = await Promise.all(dest.map(async (ch) =>
    !!(await enviarAlertaMoeda(SB, ch, `VOLTA_${info.instId}`, cortar(msg + (await blocoPosicao(SB, ch, psDe(ch), info))), botaoAnalisar(info.instId), ACOMP_AUTOAPAGAR_MIN))));
  if (oks.some(Boolean)) {
    await SB.from(TAB).update({ last_status: String(row.last_status).replace(/\s*✔/g, "") }).eq("instid", row._wlId ?? row.instid);
    console.log(`↩️ ${info.instId} voltou pra dentro da faixa (${nome}, ${dentroPct.toFixed(2)}% dentro)`);
  }
}
// V79/V80: moeda SEGUIDA (/seguir) fica na lista de acompanhamento DO CHAT que a segue, enquanto for seguida. Quando a vigilância dela acaba (prazo vencido
// ou fechada), reabre no lado atual. Vigilância ainda ativa nunca é mexida (apagaria um "cruzou contra" pendente). Dentro da faixa (sem lado) não reabre.
async function renovarSeguidasNaLista(SB: any, poolInfoMap: Map<string, IndicadorInfo>) {
  try {
    const seg = await listarSeguidas(SB);
    if (!seg.length) return;
    const { data } = await SB.from(TAB).select("instid, watch_until, watch_notificado").in("instid", seg.map((x) => wlId(x.chat, x.inst)));
    const porId = new Map(((data || []) as any[]).map((r) => [String(r.instid), r] as [string, any]));
    const infos = new Map<string, IndicadorInfo | null>();
    const agora = Date.now();
    for (const sg of seg) {
      const id = wlId(sg.chat, sg.inst), ex = porId.get(id);
      const ativa = !!ex && !!ex.watch_until && new Date(ex.watch_until).getTime() > agora && ex.watch_notificado === false;
      if (ativa) continue;
      if (!infos.has(sg.inst)) infos.set(sg.inst, poolInfoMap.get(sg.inst) || (await calcIndicador500(sg.inst)));
      const info = infos.get(sg.inst);
      const atual = info ? ladoAtual(info) : null;
      if (!atual) continue;
      const w = { watch_side: atual, watch_notificado: false, watch_until: new Date(agora + WATCH_HORAS * 3600 * 1000).toISOString() };
      if (ex) await SB.from(TAB).update(w).eq("instid", id);
      else await SB.from(TAB).insert({ instid: id, last_status: "novo", ...w });
      console.log(`📋 ${sg.inst} (seguida por ${sg.chat}) reaberta na lista de acompanhamento (${atual})`);
    }
  } catch (e) { console.log("⚠️ renovar seguidas na lista falhou", e); }
}
async function checarListaAcompanhamento(SB: any, poolInfoMap: Map<string, IndicadorInfo>, posMap: Map<string, Pos[] | null>) {
  await migrarWatchLegado(SB);
  await renovarSeguidasNaLista(SB, poolInfoMap);
  const agoraIso = new Date().toISOString();
  const { data: watchRows } = await SB.from(TAB).select("*").like("instid", `${WL_PREFIXO}%`).not("watch_until", "is", null).gt("watch_until", agoraIso).eq("watch_notificado", false);
  if (!watchRows || watchRows.length === 0) { console.log("👀 lista de acompanhamento vazia"); return; }
  console.log(`👀 ${watchRows.length} vigilância(s) na lista de acompanhamento (todos os chats)`);
  const segSet = new Set<string>();
  try { (await listarSeguidas(SB)).forEach((x) => segSet.add(`${x.chat}|${x.inst}`)); } catch (e) { console.log("⚠️ lista de acompanhamento: não li as seguidas", e); }
  await emLotes(watchRows as any[], 5, async (wl: any) => {
    try { // V74: erro numa moeda não derruba o lote inteiro (Promise.all) nem as moedas seguintes
    const pw = parseWL(wl);
    if (!pw) return;
    const ch = pw.chat;
    const row = { ...wl, instid: pw.inst, _wlId: wl.instid }; // mesma forma da linha antiga; o dono é o chat `ch`
    let info = poolInfoMap.get(pw.inst) || null;
    if (!info) info = await calcIndicador500(pw.inst);
    if (!info) return;
    const atual = ladoAtual(info);
    if (atual === null || atual === row.watch_side) {
      if (atual === null) await avisarVoltouPraDentro(SB, row, info, posMap, ch).catch((e) => console.log("⚠️ erro aviso voltou pra dentro", e));
      return;
    }
    const ps = posDaMoeda(posMap.get(ch) ?? null, info.instId);
    // fecha ou renova a vigilância depois de uma virada (com ou sem mensagem)
    const atualizarVig = async (comAviso: boolean) => {
      // V79: depois de WATCH_IDADE_MAX_H do alerta original, a virada não renova mais (a vigilância fecha).
      const idadeAlertaH = row.last_alert_at ? (Date.now() - new Date(row.last_alert_at).getTime()) / 3600000 : 0;
      if (WATCH_REPETIR && !(WATCH_IDADE_MAX_H > 0 && idadeAlertaH > WATCH_IDADE_MAX_H)) {
        await SB.from(TAB).update({
          watch_side: atual, watch_notificado: false,
          watch_until: new Date(Date.now() + WATCH_HORAS * 3600 * 1000).toISOString(),
        }).eq("instid", wl.instid);
        console.log(`🔁 ${info!.instId} (${ch}) virou de novo (${row.watch_side} -> ${atual}); continuo acompanhando${comAviso ? "" : " (sem mensagem)"}`);
      } else {
        await SB.from(TAB).update({ watch_notificado: true, watch_until: null }).eq("instid", wl.instid);
        console.log(`🔁 ${info!.instId} (${ch}) saiu da lista de acompanhamento (cruzou contra: ${row.watch_side} -> ${atual})${comAviso ? "" : " (sem mensagem)"}`);
      }
    };
    // V81: só manda a mensagem se a moeda importa pra este chat (alerta recente, seguida ou com posição). Senão registra a virada na lista, em silêncio.
    const idadeOrigH = row.last_alert_at ? (Date.now() - new Date(row.last_alert_at).getTime()) / 3600000 : 0;
    const importa = ACOMP_AVISO_MAX_H <= 0 || !row.last_alert_at || idadeOrigH <= ACOMP_AVISO_MAX_H || segSet.has(`${ch}|${pw.inst}`) || ps.length > 0;
    if (!importa) { await atualizarVig(false); return; }
    if (silChat(ch) && !(SILENCIO_PROTECAO && ps.some((p) => p.lado !== atual))) return;
    // V74: intervalo mínimo desde o último aviso desta moeda neste chat. Dentro dele não envia e não mexe na linha:
    // a próxima rodada reavalia (se ainda estiver contra, sai quando o intervalo passar; se desvirou, o `atual === watch_side` acima já barra).
    if (ACOMP_INTERVALO_MIN > 0) {
      let ultimo = 0;
      try {
        const { data: lt } = await SB.from(TAB).select("last_status").eq("instid", `${ACOMP_INTERVALO_PREFIXO}${ch}_${info.instId}`).maybeSingle();
        const n = Number(lt?.last_status);
        if (isFinite(n) && n > 0) ultimo = n;
      } catch { }
      if (Date.now() - ultimo < ACOMP_INTERVALO_MIN * 60000) { console.log(`⏳ ${info.instId} (${ch}) cruzou contra, mas o último aviso foi há ${Math.round((Date.now() - ultimo) / 60000)}min (< ${ACOMP_INTERVALO_MIN}min) — aguardo`); return; }
    }
    const desdeMs = row.last_alert_at ? new Date(row.last_alert_at).getTime() : null;
    const horasDesde = desdeMs ? ((Date.now() - desdeMs) / 3_600_000).toFixed(1) : "?";
    const msg =
    `🔁 <b>${info.instId}</b> — cruzou CONTRA o movimento\n${DIVISOR}\n\n` +
    `Alerta original era <b>${row.watch_side === "long" ? "LONG" : "SHORT"}</b>${tipoAlertaTxt(row) ? ` (${tipoAlertaTxt(row)})` : ""}, há ${horasDesde}h\n` +
    `Agora cruzou pra <b>${atual === "long" ? "LONG" : "SHORT"}</b>\n` +
    `${idadeTxt(info.idadeCandles)}\n` +
    `${indicadorTxt(info)}\n` +
    `preço ${fmtPrice(info.preco)} | topo ${fmtPrice(info.topo)} | fundo ${fmtPrice(info.fundo)}`;
    const id = await enviarAlertaMoeda(SB, ch, `ACOMP_${info.instId}`, cortar(msg + (await blocoPosicao(SB, ch, ps, info))), botaoAnalisar(info.instId), ACOMP_AUTOAPAGAR_MIN);
    if (!id) return; // não entregou: a linha fica como está e a próxima rodada tenta de novo
    if (ACOMP_INTERVALO_MIN > 0) { try { await upsertLinha(SB, `${ACOMP_INTERVALO_PREFIXO}${ch}_${info.instId}`, { last_status: String(Date.now()) }); } catch { } }
    await atualizarVig(true);
    } catch (e) { console.log(`⚠️ lista de acompanhamento: erro em ${wl?.instid}`, e); }
  });
}
// V74: lado do ÚLTIMO ALERTA, gravado no fim do last_status (" [L]"/" [S]"). O watch_side muda quando a moeda vira na lista de acompanhamento; usar ele aqui fazia um alerta
// NOVO no lado novo parecer "repetição" (cooldown de 180 min em vez de 60) e o alerta final achar que o loop principal já avisou. Linha antiga sem marcador: cai no watch_side.
// V82: tipo do alerta original (gravado no last_status: {O} oportunidade = a favor do dia · {R} reversão = contra o dia). Linha antiga sem marcador: "".
const tipoAlertaTxt = (row: any): string => { const ls = String(row?.last_status || ""); return ls.includes(" {O}") ? "oportunidade" : ls.includes(" {R}") ? "reversão" : ""; };
const ladoUltimoAlerta = (row: any): string | null => {
  const ls = String(row?.last_status || "");
  return ls.includes(" [L]") ? "long" : ls.includes(" [S]") ? "short" : (row?.watch_side ?? null);
};
function cooldownEfetivoMin(row: any, lado: string, status: string): number {
  const repeticao = ladoUltimoAlerta(row) === lado && rankStatus(status) === rankStatus(row?.last_status);
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
// V39: mesma ideia do enviarFinal, mas tenta EDITAR a mensagem já mandada pra este chat nesta vela (msgIds em
// pend) em vez de mandar uma nova — dá uma "tela ao vivo" nos minutos finais sem poluir o chat. Sem pend (ou
// sem msgId pra aquele chat), manda nova, do mesmo jeito de sempre. Devolve os msgIds atualizados.
// V39: compara a distância medida agora com a da rodada anterior do cron (guardada em pend) pra dizer se o
// preço está acelerando em direção à linha ou andando devagar — ajuda a decidir "ligo agora ou espero".
// distAgora: negativo = já passou da linha (não mostra velocidade, não faz sentido nesse caso).
// V40: antes só comparava a distância desta rodada com a rodada anterior (1 medida de velocidade = fácil de
// confundir um pico de ruído com aceleração de verdade). Agora guarda também a velocidade da rodada anterior
// (pend.velPrev) e compara as duas: só chama de "acelerando de verdade" quando GANHOU ritmo 2 rodadas seguidas,
// e só reforça o alerta de "devagar" quando ESTEVE devagar nas 2 últimas rodadas (não numa piscada só).
// V41: sinal agora vem classificado (não só texto) pra poder entrar no pontuar() — "acelerando2x"/"devagar2x"
// só quando CONFIRMOU 2 rodadas seguidas (mesmo critério que já gerava o 🚀🚀/🐢🐢 no texto).
type VelSinal = "acelerando" | "acelerando2x" | "devagar" | "devagar2x" | null;
function velocidadeTxt(pend: FinalPend | undefined, distAgora: number): { txt: string; vel?: number; sinal: VelSinal } {
  if (distAgora <= 0 || !pend || pend.distPrev === undefined || !pend.distPrevT) return { txt: "", sinal: null };
  const elapsedMin = (Date.now() - pend.distPrevT) / 60000;
  if (elapsedMin < 0.3) return { txt: "", sinal: null }; // rodadas muito próximas: medida instável, melhor não mostrar
  const velAtual = (pend.distPrev - distAgora) / elapsedMin; // % de distância fechada por minuto
  const minutosRestantes = Math.max(1, finalRestMin());
  const velNecessaria = distAgora / minutosRestantes;
  const rapido = velAtual >= velNecessaria * 1.3;
  const devagar = velAtual <= velNecessaria * 0.5;
  const velPrev = pend.velPrev;
  if (rapido) {
    const acelerouMais = velPrev !== undefined && velAtual >= velPrev * 1.15;
    return { txt: acelerouMais ? `🚀🚀 acelerando de verdade — ganhando ritmo 2 rodadas seguidas\n` : `🚀 acelerando em direção à linha (a favor de fechar cruzado)\n`, vel: velAtual, sinal: acelerouMais ? "acelerando2x" : "acelerando" };
  }
  if (devagar) {
    const jaEstavaDevagar = velPrev !== undefined && velPrev <= velNecessaria * 0.5;
    return { txt: jaEstavaDevagar ? `🐢🐢 devagar 2 rodadas seguidas — chance real de não chegar a tempo\n` : `🐢 se aproximando devagar — no ritmo atual pode não chegar a tempo\n`, vel: velAtual, sinal: jaEstavaDevagar ? "devagar2x" : "devagar" };
  }
  return { txt: "", vel: velAtual, sinal: null };
}
async function enviarOuEditarFinal(SB: any, pend: FinalPend | undefined, chats: string[], inst: string, msgPorChat: (ch: string) => Promise<string> | string, botoesExtra?: Botoes): Promise<Record<string, number>> {
  const botoes: Botoes = [...(botoesExtra ?? []), ...botaoAnalisar(inst)];
  const ids: Record<string, number> = { ...(pend?.msgIds ?? {}) };
  await Promise.all(chats.filter((ch) => ALERT_CHAT_IDS.includes(ch)).map(async (ch) => {
    const msg = cortar(await msgPorChat(ch));
    const existente = pend?.msgIds?.[ch];
    if (existente && (await editarTelegram(ch, existente, cortar(agRiscoLinha() + msg), botoes))) return;
    const novo = await enviarAlertaMoeda(SB, ch, `FINAL_${inst}`, msg, botoes);
    if (novo) ids[ch] = novo; else delete ids[ch];
  }));
  return ids;
}
function simularFechamento(instId: string, d: XVelas, vivo: number, base: InfoFiltravel): InfoFiltravel | null {
  const closes = [...d.c, vivo];
  const hip = calcIndicadorDeCloses(instId, closes);
  if (!hip) return null;
  return { ...hip, adx: base.adx, adxAntes: base.adxAntes, atr: base.atr, rsi: calcRSI(closes, 14), volRatio: base.volRatio ?? null, trocas: contarTrocas(closes), bottom: base.bottom ?? null, ddPico: base.ddPico, altaVale: base.altaVale, top: base.top ?? null };
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
    // V69: usava faixas fixas (8–10/6–7/≤5), diferentes do resto do /placar (CONF_VERDE=7/CONF_AMARELO=6) — a mesma
    // mensagem cortava a confiança em lugares diferentes dependendo da seção. Agora usa as mesmas constantes.
    const porConf = [bucket(`conf ${CONF_VERDE}–10:`, (r) => Number(r.conf) >= CONF_VERDE), bucket(`${CONF_AMARELO}${CONF_VERDE - CONF_AMARELO > 1 ? `–${CONF_VERDE - 1}` : ""}:`, (r) => Number(r.conf) >= CONF_AMARELO && Number(r.conf) < CONF_VERDE), bucket(`≤ ${CONF_AMARELO - 1}:`, (r) => Number(r.conf) < CONF_AMARELO)].filter(Boolean);
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
    const nome = p.lado === "long" ? "LONG" : "SHORT";
    const cruzou = ladoAtual(fech) === p.lado;
    const linhaPreco = `preço fech. ${fmtPrice(fech.preco)} | topo ${fmtPrice(fech.topo)} | fundo ${fmtPrice(fech.fundo)}`;
    let msg: string;
    if (cruzou) {
      // quem recebeu só o PREPARE: o alerta normal de cruzamento sai em seguida, não repete aqui
      if (p.tipo === "prepare") { console.log(`⏱ prepare ${p.inst} ${p.lado}: cruzou no fechamento (alerta normal cobre)`); _finalPend.delete(k); continue; }
      msg = `✅ <b>${p.inst}</b> — FECHOU CRUZADO pra <b>${nome}</b>\n${DIVISOR}\n\nO aviso dos minutos finais se confirmou: a vela de ${TIMEFRAME} fechou ${p.lado === "long" ? "acima" : "abaixo"} da linha (${fech.distAbs.toFixed(3)}% além). O robô entra no fechamento.\n${linhaPreco}`;
    } else {
      const prox = proximaVela(p.inst, d.c, i, p.lado);
      if (p.tipo === "prepare" && !prox) { console.log(`⏱ prepare ${p.inst} ${p.lado}: fechou sem cruzar e sem seguir perto (sem aviso)`); _finalPend.delete(k); continue; }
      const seguePerto = prox
        ? `\n🔜 <b>Mas segue perto</b>: fechou a ${prox.dNow.toFixed(2)}% da linha de ${nome} (na vela anterior era ${prox.dPrev.toFixed(2)}%) e ainda está chegando. A chance passa pra próxima vela: se quiser, pode deixar o robô ligado; eu aviso de novo nos minutos finais.`
        : "";
      msg = p.tipo === "prepare"
        ? `🔜 <b>${p.inst}</b> — fechou sem cruzar, mas segue perto\n${DIVISOR}\n\nO aviso era de <b>${nome}</b> e a vela fechou sem cruzar.${seguePerto}\n${indicadorTxt(fech)}\n${linhaPreco}`
        : `❌ <b>${p.inst}</b> — NÃO fechou cruzado\n${DIVISOR}\n\nO aviso era de <b>${nome}</b>, mas o preço recuou e a vela fechou sem cruzar.${prox ? seguePerto : " <b>O robô não deve entrar</b> — pode desligar se ligou por causa do aviso."}\n${indicadorTxt(fech)}\n${linhaPreco}`;
    }
    console.log(`⏱ final ${p.inst} ${p.lado} (${p.tipo}): ${cruzou ? "confirmou" : "não confirmou"} no fechamento`);
    // V39: fecha editando a mesma mensagem (se ainda tiver o id); sem id (estado antigo, ou chat novo), manda nova.
    const destinos = p.chats.filter((ch) => ALERT_CHAT_IDS.includes(ch));
    const ok = await Promise.all(destinos.map(async (ch) => {
      // V74: veredito do fechamento também como mensagem nova (notifica; a anterior da mesma chave é apagada)
      return !!(await enviarAlertaMoeda(SB, ch, `FINAL_${p.inst}`, cortar(msg), botaoAnalisar(p.inst)));
    }));
    if (ok.some(Boolean) || !destinos.length) _finalPend.delete(k);
    else console.log(`⚠️ final ${p.inst} ${p.lado}: nenhum envio do veredito confirmado, deixando pendente pra tentar de novo (a limpeza por idade cobre se continuar falhando)`);
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
    const nome = p.lado === "long" ? "LONG" : "SHORT";
    console.log(`⏱ final ${p.inst} ${p.lado}: cancelado (preço ${fmtPrice(vivo)}, ${alem.toFixed(3)}% da linha, margem ${margem.toFixed(3)}%)`);
    const msgCancel = `🛑 <b>${p.inst}</b> — RECUOU antes do fechamento\n${DIVISOR}\n\nO aviso "vai fechar cruzado (${nome})" não vale mais: o preço voltou pra dentro da linha (${Math.abs(alem).toFixed(2)}% do lado de dentro). <b>Pode desligar o robô</b> se ligou por causa dele.\nFaltam ~${finalRestMin()} min pra vela fechar; se ela fechar cruzada mesmo assim, o alerta normal de cruzamento sai em seguida.\npreço agora ${fmtPrice(vivo)} | linha ${fmtPrice(p.linha)}`;
    const destinos = p.chats.filter((ch) => ALERT_CHAT_IDS.includes(ch));
    const ok = await Promise.all(destinos.map(async (ch) => {
      // V74: o cancelamento sai como mensagem NOVA (edição não notifica no Telegram e o aviso de "vai fechar cruzado" já pode ter sido lido);
      // enviarAlertaMoeda apaga a mensagem anterior da mesma chave FINAL_<moeda>, então não sobra o aviso velho na tela.
      return !!(await enviarAlertaMoeda(SB, ch, `FINAL_${p.inst}`, cortar(msgCancel), botaoAnalisar(p.inst)));
    }));
    if (ok.some(Boolean) || !destinos.length) p.estado = "cancelado";
    else console.log(`⚠️ final ${p.inst} ${p.lado}: cancelamento não confirmado, tentando de novo na próxima rodada`);
  }
}
async function checarAlertaFinal(
  SB: any,
  pool: { instId: string; pct: number; volUsdt: number; dd?: number; up?: number }[],
  indicadores: (InfoFiltravel | null)[],
  lastMap: Map<string, number>,
  posMap: Map<string, Pos[] | null>,
  perfil: XPerfil | null,
  lat?: LateralEst | null,
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
    if (!last || Math.max(Math.abs(pool[i].pct), base.ddPico ?? 0, base.altaVale ?? 0) < pctMin) return;
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
  // V41: cluster/rotação — quantas moedas do pool estão "🎯 CHEGANDO" na linha ao mesmo tempo (mesma rodada).
  // Muita moeda chegando junto geralmente é o mercado todo (BTC) puxando, não uma moeda isolada com edge própria.
  const clusterTotal = cands.length;
  const clusterPorLado = new Map<"long" | "short", number>();
  for (const c of cands) clusterPorLado.set(c.lado, (clusterPorLado.get(c.lado) ?? 0) + 1);
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
    return { s, hip, vivo, vol: c.vol, dist: distLinha(c.lado, vivo, hip.topo, hip.fundo), di: c.base.diDom ?? null }; // V100: o hip não carrega o DI, vem da moeda
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
    if (!r || ladoUltimoAlerta(r) !== lado || !r.last_alert_at || new Date(r.last_alert_at).getTime() < abertura) return false;
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
    let destinos = [...new Set([...ativos, ...protegidos])].filter((ch) => !posDe(ch, inst).some((p) => p.lado === lado));
    if (!destinos.length) continue;
    // V41: pendAntes/distAgora/vel precisam ser calculados ANTES da confiança pra o sinal 🚀🚀/🐢🐢 poder entrar no pontuar()
    const pendAntes = _finalPend.get(finalKey(inst, lado, ck));
    const distAgora = modo === "aviso" ? -hip.distAbs : x.dist;
    const cruzouAgora = distAgora <= 0;
    const toques = (pendAntes?.toques ?? 0) + (pendAntes?.cruzouAntes && !cruzouAgora ? 1 : 0);
    const vel = velocidadeTxt(pendAntes, distAgora);
    const velTxt = vel.txt;
    const confRes = await calcConfiancaAlerta(s, x.vol, perfil, vel.sinal);
    const minBase = s.tipo === "reversao" ? (lado === "long" ? CONF_MIN_FUNDO_LONG : CONF_MIN_REVERSAO) : CONF_MIN_OPORT;
    // moeda que ainda não cruzou pontua ~1–2 pts a menos que a que cruzou: o PREPARE tem essa folga, o 🚨 não
    const minConf = modo === "aviso" ? minBase : Math.max(0, minBase - FINAL_PREPARE_FOLGA_CONF);
    if (s.tipo === "reversao") {
      // V100: mesma regra nova da reversão (ADX baixo + DI a favor); a sombra só grava no 🚨 (cruzou), igual ao que o placar registra
      const rvF = revMotivos(lado, hip.adx, x.di, confRes?.conf ?? null, minConf);
      if (rvF.length) {
        if (modo === "aviso") _confBarrada.set(inst + lado, ck);
        console.log(`🧭 final ${inst} ${lado} (reversão, ${modo}) barrada [${rvF.join("+")}]: ADX ${Number.isFinite(hip.adx) ? hip.adx.toFixed(1) : "?"} (máx ${REV_ADX_MAX}) · DI ${x.di ?? "neutro"} · nota ${confRes?.conf ?? "?"}/10 (mín ${minConf})`);
        if (modo === "aviso") await revSombraGravar(SB, s, confRes?.conf ?? null, rvF, minConf);
        continue;
      }
    }
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
    if (BTC_BLOQ_REV_PCT > 0 && s.tipo === "reversao" && lado === "long" && confRes?.btcVar != null && confRes.btcVar <= -BTC_BLOQ_REV_PCT) {
      if (modo === "aviso") _confBarrada.set(inst + lado, ck);
      console.log(`₿ final ${inst} LONG de reversão/fundo barrado: BTC ${confRes.btcVar.toFixed(1)}%/h (limite -${BTC_BLOQ_REV_PCT}%)`);
      continue;
    }
    // V57: mercado lateral (BTC e ETH sem tendência): barra o 🚨 (LIGUE AGORA); só sai pra quem tem posição do lado oposto. O PREPARE passa, com aviso 🧱
    if (lat?.bloq && modo === "aviso") {
      const contra = destinos.filter((ch) => posDe(ch, inst).some((p) => p.lado !== lado));
      if (!contra.length) {
        latContar(lat, inst, lado); // conta como "barrado" sempre (estatística), mesmo em modo visual
        if (LATERAL_BARRA) {
          console.log(`🧱 final ${inst} ${lado} (${modo}) barrado: mercado lateral (BTC ADX ${fmtAdx(lat.btc)} · ETH ADX ${fmtAdx(lat.eth)})`);
          continue;
        }
      } else if (LATERAL_BARRA) {
        destinos = contra;
      }
    }
    const tipoTxt = tipoTxtDe(s.tipo, s.lado);
    const ladoTxt = lado === "long" ? "LONG (compra)" : "SHORT (venda)";
    const pctTxt = `${s.pct >= 0 ? "📈 subiu +" : "📉 caiu "}${(s.pct >= 0 ? s.pct : -s.pct).toFixed(2)}% em 24h\n`;
    const linhas = `preço agora ${fmtPrice(vivo)} | topo ${fmtPrice(hip.topo)} | fundo ${fmtPrice(hip.fundo)} (linhas projetadas pro fechamento)`;
    const foTxt = confRes?.fo ? fundingOiTxt(confRes.fo) : "";
    const linhaFo = confRes ? (foTxt ? `\n💸 ${foTxt}` : "") : await linhaFundingOI(inst);
    const linhaConf = "\n" + janelaTxt(perfil) + (confRes ? confLinha(confRes) : "");
    const nomeCurto = lado === "long" ? "LONG" : "SHORT";
    const stopAlvoFin = hip.atr > 0 ? stopAlvoTxt(lado, vivo, hip.topo, hip.fundo, hip.atr, true).replace(/^🎯 /, "") : "";
    const toqueTxt = toques > 0 ? `⚠️ já tocou a linha e recuou ${toques}x nesta vela — cruzamento pode falhar\n` : "";
    const clusterN = clusterPorLado.get(lado) ?? 0;
    const clusterTxt = clusterTotal >= CLUSTER_ALERTA_MIN
      ? `🎯 ${clusterTotal} moeda(s) do pool chegando na linha nesta rodada (${clusterN} em ${nomeCurto}) — pode ser o mercado todo se movendo junto\n`
      : "";
    const msg = modo === "aviso"
      ? `🚨 <b>${inst}</b> — VAI FECHAR CRUZADO\n${DIVISOR}\n\n${tipoTxt} · ${pctTxt}Robô abriria: <b>${ladoTxt}</b>\n` +
        subTitulo("🔌 Ligar o robô?") +
        `⏱ <b>LIGUE AGORA</b> — faltam ~${finalRestMin()} min pra vela de ${TIMEFRAME} fechar e o preço já está ${lado === "long" ? "acima" : "abaixo"} da linha (${hip.distAbs.toFixed(3)}% além). O robô entra no fechamento.\n` +
        `🔁 Se o preço recuar pra dentro antes do fechamento, eu aviso pra desligar.\n` +
        toqueTxt + velTxt + clusterTxt +
        subTitulo("📍 Onde está") + `${linhas}\n` +
        (stopAlvoFin ? subTitulo("🎯 Se for entrar") + stopAlvoFin : "")
      : `🕒 <b>${inst}</b> — PREPARE (fecha em ~${finalRestMin()} min)\n${DIVISOR}\n\n${tipoTxt} · ${pctTxt}Robô abriria: <b>${ladoTxt}</b>\n` +
        subTitulo("🔌 Ligar o robô?") +
        `🕒 <b>PREPARE</b> — ainda NÃO ligue: o preço está a ${x.dist.toFixed(3)}% da linha de ${nomeCurto} e chegando. Se cruzar antes do fechamento, eu mando o 🚨 (LIGUE AGORA).\n` +
        toqueTxt + velTxt + clusterTxt +
        subTitulo("📍 Onde está") + `${linhas}\n`;
    const botaoLiguei: Botoes = modo === "aviso" ? [[{ text: "🔔 Já liguei", callback_data: `liguei:${inst}:${lado}:${ck}` }]] : [];
    const msgIds = await enviarOuEditarFinal(SB, pendAntes, destinos, inst, async (ch) =>
      msg + linhaConf + linhaFo + (lat?.bloq && (modo === "prepare" || !LATERAL_BARRA) ? notaLat() : "") + avisoLimiteLado(posMap.get(ch) ?? null, lado) + (modo === "aviso" ? await blocoPosicao(SB, ch, posDe(ch, inst), hip, lado) : ""), botaoLiguei);
    // Auditoria #15: mesma família dos achados 4–11, aqui no pipeline paralelo do "alerta dos minutos finais".
    // `_finalPend`/`registrarAlertaFinal`/`enviados` eram todos gravados incondicionalmente, mesmo que TODOS os
    // envios/edições falhassem (Telegram fora do ar etc.) — ou seja: ninguém recebia o "LIGUE O ROBÔ AGORA", mas
    // o bot já marcava a moeda como "avisada" (_finalPend "ativo"), o que trava o loop principal de tentar de
    // novo nesta vela (linha ~2156: "já coberto pelo alerta dos minutos finais") e ainda registra acerto/erro no
    // placar (/placar) de um alerta que nunca chegou. `entregouAlgum` confere se pelo menos 1 dos chats de
    // `destinos` desta rodada terminou com id de mensagem viva (novo envio ou edição confirmada).
    const entregouAlgum = destinos.some((ch) => !!msgIds[ch]);
    if (!entregouAlgum) { console.log(`⚠️ final ${inst} ${lado} (${modo}): nenhum envio/edição confirmado, não vou marcar como avisado nem contar na cota`); continue; }
    _finalPend.set(finalKey(inst, lado, ck), {
      inst, lado, ck, linha: lado === "long" ? hip.topo : hip.fundo,
      atrPct: hip.preco > 0 ? (hip.atr / hip.preco) * 100 : 0, chats: destinos, estado: "ativo", tipo: modo,
      msgIds: Object.keys(msgIds).length ? msgIds : undefined, distPrev: distAgora, distPrevT: Date.now(), cruzouAntes: cruzouAgora, toques,
      velPrev: vel.vel,
    });
    if (modo === "aviso") await registrarAlertaFinal(SB, s, confRes?.conf ?? null);
    enviados++;
    console.log(`⏱ final ${inst} ${lado} (${modo}): avisado (${modo === "aviso" ? `${hip.distAbs.toFixed(3)}% além` : `${x.dist.toFixed(3)}% da linha`}, faltam ~${finalRestMin()} min, ${destinos.length} chat(s))`);
  }
}
// V42: trava contra sobreposição do cron — sem isso, se uma rodada demorar mais que o intervalo do
// cron (1-2 min), a próxima chamada começa em cima da anterior e as duas escrevem no mesmo estado ao mesmo
// tempo (risco de alerta duplicado / corrida no Supabase). Trava por até CRON_LOCK_TIMEOUT_MS; se destravar()
// falhar (crash no meio da rodada), ela expira sozinha depois desse tempo, então nunca fica travado pra sempre.
// V45: virou compare-and-swap de verdade — antes era ler → checar em memória → escrever (2 chamadas separadas),
// então duas rodadas quase simultâneas podiam ler as duas "livre" antes de qualquer uma escrever. Agora é 1
// UPDATE só com o prazo no WHERE (o Postgres serializa updates concorrentes na mesma linha — só quem realmente
// casar o WHERE depois da outra commitar é que ganha a trava); a 1ª vez que a linha ainda não existe cai num
// INSERT, e se duas rodadas colidirem nesse INSERT a chave duplicada decide sozinha quem perdeu.
// V54: a trava agora tem DONO. Antes, se uma rodada A passasse de CRON_LOCK_TIMEOUT_MS, a rodada B pegava a trava
// (expirada) e, quando A terminava, o destravar() dela zerava a trava de B com B ainda rodando — e uma rodada C
// podia começar por cima de B (a mesma sobreposição que a trava existe pra evitar). Agora travarCron() devolve um
// token (o timestamp gravado) e destravarCron() só libera se a linha ainda tiver ESSE token, num UPDATE condicional
// (mesmo compare-and-swap da aquisição). Se a trava já é de outra rodada, a que terminou atrasada não mexe nela.
const CRON_LOCK_ROW = "_CRON_LOCK_";
const CRON_LOCK_TIMEOUT_MS = numEnv("CRON_LOCK_TIMEOUT_MS", "110000");
// V106: prazo da rodada. Passou disso, o cron pula o que é só gravação em silêncio (sombra de volume, faca em modo sombra) pra não
// estourar a trava (CRON_LOCK_TIMEOUT_MS) e a rodada seguinte começar por cima. Fica sempre abaixo da trava.
const CRON_PRAZO_MS = Math.min(numEnv("CRON_PRAZO_MS", "85000"), CRON_LOCK_TIMEOUT_MS - 10000);
// V106: tarefas que rodam em paralelo à rodada (ex.: gravação do /radarhist às 21h). A rodada espera por elas DEPOIS de liberar a trava,
// pra plataforma não derrubar a função no meio da gravação sem segurar o cron.
const _bgTarefas: Promise<unknown>[] = [];
// devolve o token da trava; null = outra rodada está rodando (pular); "" = falha ao travar, segue sem trava (nada a liberar)
async function travarCron(SB: any): Promise<string | null> { return await travarLinha(SB, CRON_LOCK_ROW, CRON_LOCK_TIMEOUT_MS); }
async function destravarCron(SB: any, token: string) { await destravarLinha(SB, CRON_LOCK_ROW, token); }
// V106: a mesma trava (compare-and-swap com dono) pra qualquer linha
async function travarLinha(SB: any, linha: string, timeoutMs: number): Promise<string | null> {
  try {
    const agora = Date.now();
    const cutoff = String(agora - timeoutMs);
    const { data: upd, error: eUpd } = await SB.from(TAB)
      .update({ last_status: String(agora) })
      .eq("instid", linha)
      .lt("last_status", cutoff)
      .select("instid");
    if (eUpd) throw eUpd;
    if (upd && upd.length) return String(agora);
    // ninguém travado agora: ou a linha não existe ainda (1ª rodada), ou já está travada dentro do prazo
    // (update não bateu no WHERE). Tenta criar a linha; se já existir (corrida no insert), perdeu a trava.
    const { error: eIns } = await SB.from(TAB).insert({ instid: linha, last_status: String(agora) });
    if (!eIns) return String(agora);
    if (/duplicate|already exists|23505/i.test(String(eIns.message || eIns.code || ""))) return null;
    throw eIns;
  } catch (e) { console.log(`⚠️ erro travando ${linha} (seguindo sem trava)`, e); return ""; }
}
async function destravarLinha(SB: any, linha: string, token: string) {
  if (!token) return; // quem seguiu sem trava não tem o que liberar
  try {
    const { data, error } = await SB.from(TAB).update({ last_status: "0" }).eq("instid", linha).eq("last_status", token).select("instid");
    if (error) throw error;
    if (!data || !data.length) console.log(`ℹ️ trava ${linha} já era de outra execução (a minha expirou); não liberei a dela`);
  } catch (e) { console.log(`⚠️ erro destravando ${linha}`, e); }
}
async function runAlertaProativo() {
  if (!ALERT_CHAT_IDS.length) { console.log("⚠️ nenhum chat recebe alerta (ALLOWED_CHAT_IDS vazio ou todos em ALERT_EXCLUIR_IDS)"); return; }
  const SB = getSupabase();
  if (!SB) { console.log("⚠️ SUPABASE_URL/KEY nao configurados"); return; }
  await restaurarCalibracao(SB);
  const tokenCron = await travarCron(SB);
  if (tokenCron === null) { console.log("⏭️ rodada anterior do cron ainda em andamento, pulando esta"); return; }
  const inicioRodada = Date.now(); // V106: tempo REAL da rodada (o "inicio" abaixo começa depois do estado/painel e o 🏁 sai antes dos radares)
  const pulados: string[] = [];
  const noPrazo = (nome: string) => { if (Date.now() - inicioRodada < CRON_PRAZO_MS) return true; pulados.push(nome); return false; };
  let ultimoHb = "";
  try {
  await carregarEstado(SB);
  for (const k of Object.keys(_fonte)) delete _fonte[k];
  await avisarCronParado(SB).catch((e) => console.log("⚠️ erro avisarCronParado", e));
  await autoCalibrarAntecipacao(SB).catch((e) => console.log("⚠️ erro autoCalibrarAntecipacao", e));
  const inicio = Date.now();
  const silencio = emSilencio();
  await carregarPausas(SB).catch((e) => console.log("⚠️ pausas", e));
  const todosSil = ALERT_CHAT_IDS.every((ch) => silChat(ch));
  // V58: o painel do dia edita a mesma mensagem fixada (não manda nada novo), então continua atualizando de hora em
  // hora mesmo com todo mundo em silêncio/pausa — antes ele ficava parado até o fim do silêncio, junto com os alertas.
  await checarPainel(SB).catch((e) => console.log("❌ erro painel", e));
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
    ultimoHb = `silêncio | ${((Date.now() - inicio) / 1000).toFixed(1)}s`;
    await heartbeat(SB, ultimoHb);
    return;
  }
  if (todosSil) console.log(`🌙 todos em silêncio/pausa: só alertas de proteção (${nPos} posição(ões) aberta(s))`);
  const lat = await avaliarLateral(SB).catch((e) => { console.log("⚠️ filtro lateral falhou (segue liberado)", e); return lateralNovo(); });
  _latBloq = lat.bloq;
  // V74: divergência de RSI do BTC (1h/4h/diário/semanal); só reavalia quando fecha vela nova, então é leve
  await checarDivergenciaBTC(SB).catch((e) => console.log("⚠️ divergência BTC falhou", e));
  const variacoes = await getVariacoes24h();
  // V56: com os filtros ligados, o volume mínimo entra ANTES do corte top-N (igual recuaram/repicaram), senão moeda ilíquida ocupa vaga e é descartada depois
  const baseMov = ALERT_FILTROS_ON ? variacoes.filter((v) => v.volUsdt >= FILTRO_VOL_MIN_USDT) : variacoes;
  const subiram = [...baseMov].sort((a, b) => b.pct - a.pct).slice(0, ALERT_POOL);
  const cairam = [...baseMov].sort((a, b) => a.pct - b.pct).slice(0, ALERT_POOL);
  const recuaram = ALERT_POOL_RECUO > 0 ? [...variacoes].filter((v) => v.dd >= FUNDO_QUEDA_MIN && v.volUsdt >= FILTRO_VOL_MIN_USDT).sort((a, b) => b.dd - a.dd).slice(0, ALERT_POOL_RECUO) : [];
  const repicaram = TOPO_ON && ALERT_POOL_ALTA > 0 ? [...variacoes].filter((v) => v.up >= TOPO_ALTA_MIN && v.volUsdt >= FILTRO_VOL_MIN_USDT).sort((a, b) => b.up - a.up).slice(0, ALERT_POOL_ALTA) : [];
  const poolMap = new Map<string, { instId: string; pct: number; volUsdt: number; dd: number; up: number }>();
  for (const v of [...subiram, ...cairam, ...recuaram, ...repicaram]) poolMap.set(v.instId, { instId: v.instId, pct: v.pct, volUsdt: v.volUsdt, dd: v.dd, up: v.up });
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
  const ehRepique = (s: Setup) => Number((s.lado === "short" && !!(s.info as Partial<InfoFiltravel>).top?.repique) || (s.lado === "long" && !!(s.info as Partial<InfoFiltravel>).bottom?.repique));
  setups.sort((a, b) => ehRepique(b) - ehRepique(a) || Number(b.fresco) - Number(a.fresco) || prioJanela(b) - prioJanela(a) || rankStatus(b.status) - rankStatus(a.status) || a.info.distAbs - b.info.distAbs);
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
  _revSombraN = 0;
  let confBarrados = 0;
  let barradosLat = 0;
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
    // V57: com o filtro lateral ligado só o PREPARE (ainda não cruzou, sem LIGUE AGORA) passa; o resto da entrada fica barrado mais abaixo
    const soPrepareCalc = lat.bloq && c.info.idadeCandles === null && !!c.aprox && !c.ligue; // seria "só PREPARE" se o filtro estivesse barrando
    const soPrepare = LATERAL_BARRA && soPrepareCalc; // efeito real: só vale quando o filtro realmente barra
    const cruzou = ladoAtual(c.info) === c.lado;
    const chatsContra = ALERT_CHAT_IDS.filter((ch) => cruzou && posDe(ch, inst).some((p) => p.lado !== c.lado));
    const ativos = ALERT_CHAT_IDS.filter((ch) => !silChat(ch));
    const protegidos = SILENCIO_PROTECAO ? chatsContra.filter((ch) => silChat(ch)) : [];
    if (!ativos.length && !protegidos.length) continue;
    const contraPos = chatsContra.some((ch) => !silChat(ch) || SILENCIO_PROTECAO);
    if (ALERT_RETESTE_MAX_CANDLES > 0 && c.info.idadeCandles !== null && c.info.idadeCandles > ALERT_RETESTE_MAX_CANDLES && !contraPos) continue; // V68: reteste de cruzamento velho
    const row = rowsMap.get(c.info.instId) ?? null;
    const cooldownOk = !row?.last_alert_at || (agora - new Date(row.last_alert_at).getTime()) >= cooldownEfetivoMin(row, c.lado, c.status) * 60 * 1000;
    const escalouBase = rankStatus(c.status) > rankStatus(row?.last_status)
    || (c.fresco && !(row?.last_status || "").includes("🆕"));
    const escalouContra = contraPos && !(row?.last_status || "").includes("🛡️");
    if (!cooldownOk && !escalouBase && !escalouContra) continue;
    // V57: com o filtro lateral ligado, só sai o aviso de proteção pra quem tem posição do lado oposto; entrada nova fica barrada mais abaixo
    const destinosBase = LATERAL_BARRA && lat.bloq && !soPrepare ? chatsContra.filter((ch) => !silChat(ch) || SILENCIO_PROTECAO) : (cooldownOk || escalouBase) ? [...new Set([...ativos, ...protegidos])] : chatsContra.filter((ch) => !silChat(ch) || SILENCIO_PROTECAO);
    // Posição já no lado do sinal: "chegando na linha" não acrescenta nada pra quem já está posicionado (só ruído).
    const destinos = c.info.idadeCandles === null ? destinosBase.filter((ch) => !posDe(ch, inst).some((p) => p.lado === c.lado)) : destinosBase;
    if (!destinos.length) continue;
    const tipoTxt = tipoTxtDe(c.tipo, c.lado);
    const ladoTxt = c.lado === "long" ? "LONG (compra)" : "SHORT (venda)";
    const infoAtr = (c.info as InfoFiltravel).atr;
    const ckVela = Math.floor(Date.now() / (TF_MIN * 60000));
    if (_confBarrada.get(inst + c.lado) === ckVela || _confBarradaPre.get(inst + c.lado) === ckVela) continue;
    const barrarLoop = () => (c.info.idadeCandles === null ? _confBarradaPre : _confBarrada).set(inst + c.lado, ckVela);
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
    // V107: o REPIQUE segue a regra do repique (V104: ADX >= REPIQUE_ADX_MIN e DI a favor) também no alerta principal. Antes ela só valia
    // no radar: aqui o mesmo repique caía na regra da REVERSÃO (ADX <= REV_ADX_MAX) quando o dia estava perto de zero, ou em nenhuma regra
    // como oportunidade — o radar e o alerta pediam o contrário. O barrado aqui não grava sombra: o radar já grava a mesma moeda (repique_sombra).
    const ehRepC = ehRepique(c) === 1;
    if (ehRepC) {
      const fi = c.info as Partial<InfoFiltravel>;
      const rm = repMotivos(c.lado, fi.adx, fi.adxAntes, fi.diDom ?? null);
      if (rm.length) {
        barrarLoop();
        console.log(`⭐ ${inst} ${c.lado} (repique, ${c.tipo}) barrado [${rm.join("+")}]: ${repRegraTxt()} · ADX ${fi.adx != null ? fi.adx.toFixed(1) : "?"} · DI ${fi.diDom ?? "neutro"}`);
        continue;
      }
    } else if (c.tipo === "reversao") {
      // V100: regra nova da reversão (ADX baixo + DI a favor) junto com a nota; o que barrar vai pro modo sombra
      const fi = c.info as Partial<InfoFiltravel>;
      const rv = revMotivos(c.lado, fi.adx, fi.diDom ?? null, confRes?.conf ?? null, minConf);
      if (rv.length) {
        barrarLoop();
        if (rv.includes("NOTA")) confBarrados++;
        console.log(`🧭 ${inst} ${c.lado} (reversão) barrada [${rv.join("+")}]: ADX ${fi.adx != null ? fi.adx.toFixed(1) : "?"} (máx ${REV_ADX_MAX}) · DI ${fi.diDom ?? "neutro"} · nota ${confRes?.conf ?? "?"}/10 (mín ${minConf})`);
        await revSombraGravar(SB, c, confRes?.conf ?? null, rv, minConf);
        continue;
      }
    }
    if (minConf > 0 && confRes && confRes.conf < minConf) {
      barrarLoop();
      confBarrados++;
      console.log(`🧭 ${inst} ${c.lado} (${c.tipo}) barrado: confiança ${confRes.conf}/10 < ${minConf}`);
      continue;
    }
    if (BTC_BLOQ_REV_PCT > 0 && c.tipo === "reversao" && c.lado === "short" && confRes?.btcVar != null && confRes.btcVar >= BTC_BLOQ_REV_PCT) {
      barrarLoop();
      console.log(`₿ ${inst} SHORT de reversão barrado: BTC +${confRes.btcVar.toFixed(1)}% na última hora (limite ${BTC_BLOQ_REV_PCT}%)`);
      continue;
    }
    if (BTC_BLOQ_REV_PCT > 0 && c.tipo === "reversao" && c.lado === "long" && confRes?.btcVar != null && confRes.btcVar <= -BTC_BLOQ_REV_PCT) {
      barrarLoop();
      console.log(`₿ ${inst} LONG de reversão/fundo barrado: BTC ${confRes.btcVar.toFixed(1)}% na última hora (limite -${BTC_BLOQ_REV_PCT}%)`);
      continue;
    }
    const barradoPeloLateral = lat.bloq && !contraPos && !soPrepareCalc; // seria barrado pelo filtro, independente do modo
    if (barradoPeloLateral) {
      if (latContar(lat, inst, c.lado)) barradosLat++; // conta sempre (estatística), mesmo em modo visual
      if (LATERAL_BARRA) {
        console.log(`🧱 ${inst} ${c.lado} barrado: mercado lateral (BTC ADX ${fmtAdx(lat.btc)} · ETH ADX ${fmtAdx(lat.eth)})`);
        continue;
      }
    }
    const ligarTxt = c.aprox
      ? (c.ligue
        ? `🚨 <b>LIGUE AGORA</b> — ${c.ligue.alem ? `o preço já está ${c.lado === "long" ? "acima" : "abaixo"} da linha; a vela fecha em ~${c.ligue.restMin} min (o robô entra no fechamento)` : `chega na linha em ~${Math.max(1, Math.round(c.aprox.etaCandles * TF_MIN))} min, dá tempo de ligar`}\n`
        : `🕒 <b>PREPARE</b> — ainda não ligue: aviso antecipado, vou avisar de novo (🚨 LIGUE AGORA) quando estiver perto\n`)
      + `🎯 Aproximando: deve chegar na linha em ~${Math.max(1, Math.round(c.aprox.etaCandles * TF_MIN))} min (estimativa, ${c.aprox.vel.toFixed(2)}% por vela). Se recuar sem cruzar, eu aviso pra desligar\n`
      : "";
    const stopAlvoAl = typeof infoAtr === "number" ? stopAlvoTxt(c.lado, vivo ?? c.info.preco, c.info.topo, c.info.fundo, infoAtr, vivo !== null).replace(/^🎯 /, "") : "";
    const msg =
    `🔔 <b>${c.info.instId}</b> — ${c.status}${c.fresco ? " 🆕" : ""}\n${DIVISOR}\n\n` +
    `${tipoTxt} · ${c.pct >= 0 ? "📈 subiu +" : "📉 caiu "}${(c.pct >= 0 ? c.pct : -c.pct).toFixed(2)}% em 24h\n` +
    `Robô abriria: <b>${ladoTxt}</b>\n` +
    (ligarTxt ? subTitulo("🔌 Ligar o robô?") + ligarTxt : "") +
    subTitulo("📍 Onde está") +
    `${indicadorTxt(c.info)}\n${idadeTxt(c.info.idadeCandles)}\n` +
    (vivo !== null ? `preço agora ${fmtPrice(vivo)} (fech. 15m ${fmtPrice(c.info.preco)})` : `preço ${fmtPrice(c.info.preco)}`) + ` | topo ${fmtPrice(c.info.topo)} | fundo ${fmtPrice(c.info.fundo)}\n` +
    (stopAlvoAl ? subTitulo("🎯 Se for entrar") + stopAlvoAl : "");
    const foTxt = confRes?.fo ? fundingOiTxt(confRes.fo) : "";
    const linhaFo = confRes ? (foTxt ? `\n💸 ${foTxt}` : "") : await linhaFundingOI(inst);
    const prio = !!c.aprox && chegadaEmJanelaForte(c.aprox, perfilAlerta);
    const linhaConf = "\n" + (prio ? "⚡ <b>PRIORIDADE</b> — chegada prevista dentro de janela forte de movimento\n" : "") + (confRes ? confLinha(confRes) : "");
    const entregasOk = await Promise.all(destinos.map(async (ch) => !!(await enviarAlertaMoeda(SB, ch, `CRUZ_${inst}`, cortar(msg + linhaConf + linhaFo + (soPrepare || (lat.bloq && !LATERAL_BARRA) ? notaLat() : "") + avisoLimiteLado(posMap.get(ch) ?? null, c.lado) + (await blocoPosicao(SB, ch, posDe(ch, inst), c.info, c.lado))), botaoAnalisar(inst)))));
    const entregues = destinos.filter((_, idx) => entregasOk[idx]);
    if (!entregues.length) { console.log(`⚠️ ${inst} ${c.lado}: nenhum envio confirmado, não vou queimar cooldown/cota desta rodada`); continue; }
    await registrarAlerta(SB, c, confRes?.conf ?? null);
    if (c.aprox && c.info.idadeCandles === null) await registrarAntecipacao(SB, c, entregues.filter((ch) => !silChat(ch)));
    enviados++;
    const registro = {
      // V74: " ✔" = o alerta saiu com o preço JÁ além da linha (cruzado). Serve pro aviso "voltou pra dentro da faixa" (checarListaAcompanhamento);
      // rankStatus/🆕/🛡️ usam includes(), então o marcador não atrapalha nada.
      last_status: c.status + (c.fresco ? " 🆕" : "") + (contraPos ? " 🛡️" : "") + (c.info.idadeCandles !== null ? " ✔" : "") + (c.tipo === "oportunidade" ? " {O}" : " {R}") + (c.lado === "long" ? " [L]" : " [S]"),
      last_alert_at: new Date().toISOString(),
      watch_side: c.lado,
    };
    if (row) await SB.from("alertas_indicador").update(registro).eq("instid", c.info.instId);
    else await SB.from("alertas_indicador").insert({ instid: c.info.instId, ...registro });
    // V80: a vigilância (lista de acompanhamento) é por chat: só quem recebeu o alerta passa a acompanhar a moeda.
    const watchAte = new Date(Date.now() + WATCH_HORAS * 3600 * 1000).toISOString();
    for (const ch of entregues) await upsertLinha(SB, wlId(ch, c.info.instId), { last_status: registro.last_status, last_alert_at: registro.last_alert_at, watch_side: c.lado, watch_until: watchAte, watch_notificado: false });
  }
  // Fix: o alerta dos minutos finais (🚨) tem janela curta (1–5 min antes do fechamento). Antes rodava no fim da rodada, depois dos radares
  // de topo/fundo/compressão, lista de acompanhamento e antecipações; se a rodada demorava ou era pulada pela trava do cron, o 🚨 não saía.
  // Agora roda logo depois do laço principal, antes de tudo isso.
  const lastMap = new Map(variacoes.map((v) => [v.instId, v.last] as [string, number]));
  await checarAlertaFinal(SB, pool, indicadores, lastMap, posMap, perfilAlerta, lat).catch((e) => console.log("❌ erro alerta final", e));
  if (lat.sujo) await lateralSalvar(SB, lat).catch((e) => console.log("⚠️ erro salvando contador lateral", e));
  console.log(`🏁 alerta proativo em ${((Date.now() - inicio) / 1000).toFixed(1)}s - ${setups.length} setups, ${enviados} alertas enviados, ${confBarrados} barrados por confiança${lat.bloq ? `, ${barradosLat} barrados por mercado lateral` : ""}`);
  ultimoHb = `setups ${setups.length} | enviados ${enviados}`;
  await heartbeat(SB, `${((Date.now() - inicio) / 1000).toFixed(1)}s | ${ultimoHb}`);
  await avisarFonteDados(SB).catch((e) => console.log("⚠️ erro avisarFonteDados", e));
  await avisarBtcSemDados(SB).catch((e) => console.log("⚠️ erro avisarBtcSemDados", e));
  // V57: os radares são avisos antecipados (nunca LIGUE AGORA), então seguem rodando com o filtro lateral ligado — a mensagem sai com o aviso 🧱
  if (TOPO_ON) await radarTopo(SB, pool, indicadores, posMap).catch((e) => console.log("❌ erro radar de topo", e));
  if (FUNDO_ON) await radarFundo(SB, pool, indicadores, posMap).catch((e) => console.log("❌ erro radar de fundo", e));
  if (FACA_MODO !== "off" && (FACA_MODO === "alerta" || noPrazo("faca (sombra)"))) await radarFaca(SB, pool, indicadores).catch((e) => console.log("❌ erro modo faca", e));
  if (FOGUETE_MODO !== "off" && noPrazo("foguete (sombra)")) await radarFoguete(SB, pool, indicadores).catch((e) => console.log("❌ erro modo foguete", e)); // V107 // V98 (V106: em modo sombra, só dentro do prazo)
  if (COMPRESS_ON) await radarCompressao(SB, variacoes, pool, indicadores, posMap).catch((e) => console.log("❌ erro radar de compressão", e));
  if (noPrazo("sombra de volume")) await volSombraRodar(SB, variacoes, perfilAlerta).catch((e) => console.log("❌ erro sombra de volume", e)); // V106
  const poolInfoMap = new Map<string, IndicadorInfo>();
  indicadores.forEach((info, i) => { if (info) poolInfoMap.set(pool[i].instId, info); });
  // V74: sem .catch, um erro aqui pulava checarAntecipacoes, salvarEstado e processarAutoApagar da rodada
  await checarHipoteses(SB).catch((e) => console.log("❌ erro hipóteses dos radares", e)); // V74: invalidação/êxito dos alertas de radar
  await checarListaAcompanhamento(SB, poolInfoMap, posMap).catch((e) => console.log("❌ erro lista de acompanhamento", e));
  await checarAntecipacoes(SB, poolInfoMap).catch((e) => console.log("❌ erro antecipações", e));
  await salvarEstado(SB);
  await processarAutoApagar(SB).catch((e) => console.log("❌ erro autoapagar", e));
  if (todosSil) { try { await conferirPlacar(SB); } catch (e) { console.log("❌ erro placar", e); } return; }
  await extrasV13(SB, posMap).catch((e) => console.log("❌ erro extrasV13", e));
  if (noPrazo("resumo das sombras")) await checarResumoSombras(SB).catch((e) => console.log("❌ erro resumo das sombras", e)); // V107
  } finally {
    const totalMs = Date.now() - inicioRodada;
    const alerta = totalMs > CRON_LOCK_TIMEOUT_MS ? " ⚠️ PASSOU da trava: a rodada seguinte pode ter começado por cima"
      : totalMs > CRON_PRAZO_MS ? ` ⚠️ passou do prazo (${(CRON_PRAZO_MS / 1000).toFixed(0)}s)` : "";
    console.log(`⏱ rodada completa em ${(totalMs / 1000).toFixed(1)}s${pulados.length ? ` · pulou por tempo: ${pulados.join(", ")}` : ""}${alerta}`);
    await heartbeat(SB, `${(totalMs / 1000).toFixed(1)}s total${ultimoHb ? ` | ${ultimoHb}` : ""}${pulados.length ? ` | pulou ${pulados.length}` : ""}`);
    await destravarCron(SB, tokenCron);
    // V106: espera as tarefas em paralelo (ex.: /radarhist das 21h) já sem segurar a trava do cron (no finally, pra valer também na saída do silêncio)
    if (_bgTarefas.length) { const t = _bgTarefas.splice(0); await Promise.allSettled(t); }
  }
}
const X_TZ_OFFSET_H = numEnv("TZ_OFFSET_H", "-3");
const X_JANELA_FORTE = 1.15;
const X_JANELA_FRACA = 0.85;
const X_ADX_FORTE = 25;
const X_ADX_FRACO = numEnv("X_ADX_FRACO", "18"); // V61: desamarrado de FILTRO_ADX_MIN — o piso da moeda pode ser 15, mas o texto do BTC no painel continua chamando de "lateral" só abaixo de 18, igual ao filtro de mercado
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
  if (ehBtcEth(instId)) {
    const jb = await binanceKlinesBtcEth(instId, bar, bar === "1H" ? 1000 : limit);
    if (jb) { marcaFonte(_fonteBtcEth[instId] === "Binance spot" ? "Binance spot" : "Binance"); return fechada(monta(jb)); }
  }
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
    // V74: Bybit usa 240/D/W pro 4H/1D/1W (antes o 4H/1D/1W caíam em intervalo inválido e o fallback nunca funcionava)
    const iv = bar === "1H" ? "60" : bar === "4H" ? "240" : bar === "1D" ? "D" : bar === "1W" ? "W" : bar.replace("m", "");
    const r = await fetch(`https://api.bybit.com/v5/market/kline?category=linear&symbol=${instId.replace("-", "")}&interval=${iv}&limit=${bar === "1H" ? 1000 : limit}`);
    const j = await r.json();
    if (j.result?.list?.length > 100) { marcaFonte("Bybit"); return fechada(monta(j.result.list.slice().reverse())); }
  } catch { }
  try {
    const r = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${instId.replace("-", "")}&interval=${/[HDW]$/.test(bar) ? bar.toLowerCase() : bar}&limit=${bar === "1H" ? 1000 : limit}`);
    const j = await r.json();
    if (Array.isArray(j) && j.length > 100) { marcaFonte("Binance"); return fechada(monta(j)); }
  } catch { }
  { const rows = await fetchOkxRows(instId, bar, limit); if (rows) { marcaFonte("OKX"); return fechada(monta(rows)); } }
  { const rows = await fetchBinanceSpotRows(instId, bar, limit); if (rows) { marcaFonte("Binance spot"); return fechada(monta(rows)); } }
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
// V109: a série acima começa na vela 2p−1: adxS[0] é o ADX da vela 27 (p = 14), adxS[1] o da vela 28... Ler adxS[k] como se fosse a vela k
// dava o ADX de 27 velas DEPOIS (6h45 no 15m), ou seja, olhava o futuro (/juncao, /radarconf, /faca, /foguete, /radarsim regra e o histórico
// dos radares liam assim). adxNaVela devolve o ADX conhecido no fechamento da vela k (NaN antes de existir). O último valor (adxS[adxS.length − 1])
// sempre foi o da última vela: os alertas ao vivo não tinham o erro.
function adxNaVela(adxS: number[] | null | undefined, k: number, p = 14): number {
  const j = k - (2 * p - 1);
  return adxS && j >= 0 && j < adxS.length ? adxS[j] : NaN;
}
// V60: +DI/−DI (mesmo suavizado de Wilder do ADX). Uso INTERNO e oculto: o ADX continua aparecendo igual nas mensagens,
// o DI só decide quem "puxa" a força — nunca é mostrado. xAdxSerie não foi alterada (o valor do ADX é idêntico ao de antes).
const DI_OCULTO_ON = (Deno.env.get("DI_OCULTO") || "1") !== "0";
const DI_GAP_MIN = numEnv("DI_GAP_MIN", "5"); // diferença mínima |+DI − −DI| pra dizer que um lado domina (abaixo disso = null, sem opinião)
function xDiDominante(h: number[], l: number[], c: number[], p = 14): "long" | "short" | null {
  const n = c.length;
  if (n < p * 3) return null;
  const tr: number[] = [0], pdm: number[] = [0], mdm: number[] = [0];
  for (let i = 1; i < n; i++) {
    const up = h[i] - h[i - 1], dn = l[i - 1] - l[i];
    pdm.push(up > dn && up > 0 ? up : 0);
    mdm.push(dn > up && dn > 0 ? dn : 0);
    tr.push(Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])));
  }
  const suav = (a: number[]) => { let s = a.slice(1, p + 1).reduce((x, y) => x + y, 0); for (let i = p + 1; i < a.length; i++) s = s - s / p + a[i]; return s; };
  const T = suav(tr), P = suav(pdm), M = suav(mdm);
  if (!(T > 0)) return null;
  const pdi = (P / T) * 100, mdi = (M / T) * 100;
  return Math.abs(pdi - mdi) < DI_GAP_MIN ? null : pdi > mdi ? "long" : "short";
}
function xDistancia(preco: number, topo: number, fundo: number) {
  if (preco > topo) return { distAbs: ((preco - topo) / topo) * 100, regiao: "acima, já cruzou" };
  if (preco < fundo) return { distAbs: ((fundo - preco) / fundo) * 100, regiao: "abaixo, já cruzou" };
  const dT = ((topo - preco) / preco) * 100, dF = ((preco - fundo) / preco) * 100;
  return dT <= dF ? { distAbs: dT, regiao: "dentro, perto do topo" } : { distAbs: dF, regiao: "dentro, perto do fundo" };
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
type XRegime = { instId: string; adx: number; adxAntes: number; preco: number; distAbs: number; regiao: string; er: number | null; amp: number | null };
let _btcReg: { t: number; v: XRegime | null } | null = null;
async function xRegimeCache(): Promise<XRegime | null> {
  if (_btcReg && Date.now() - _btcReg.t < 4 * 60000) return _btcReg.v;
  const v = await xRegime("BTC-USDT").catch(() => null);
  _btcReg = { t: v ? Date.now() : Date.now() - 210000, v };
  return v;
}
// V41: espelho de xRegimeCache pra ETH-USDT — segunda referência de regime/ADX além do BTC.
let _ethReg: { t: number; v: XRegime | null } | null = null;
async function xRegimeCacheEth(): Promise<XRegime | null> {
  if (_ethReg && Date.now() - _ethReg.t < 4 * 60000) return _ethReg.v;
  const v = await xRegime("ETH-USDT").catch(() => null);
  _ethReg = { t: v ? Date.now() : Date.now() - 210000, v };
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
  // V57: ER (Efficiency Ratio) e caixa (amplitude em ATRs) das últimas LATERAL_JAN velas fechadas — usados pelo filtro de mercado lateral
  let er: number | null = null, amp: number | null = null;
  const n = d.c.length, N = LATERAL_JAN;
  if (n > N + 1) {
    let caminho = 0;
    for (let k = n - N; k < n; k++) caminho += Math.abs(d.c[k] - d.c[k - 1]);
    er = caminho > 0 ? Math.abs(d.c[n - 1] - d.c[n - 1 - N]) / caminho : 0;
    const atrR = calcATR(d.h, d.l, d.c, 14);
    amp = atrR > 0 ? (Math.max(...d.h.slice(n - N)) - Math.min(...d.l.slice(n - N))) / atrR : null;
  }
  return { instId, adx: adx[adx.length - 1], adxAntes: adx[adx.length - 5], preco: d.c[i], distAbs: dist.distAbs, regiao: dist.regiao, er, amp };
}
// ─── V57: FILTRO DE MERCADO LATERAL (BTC + ETH, 3 indicadores, duas faixas) ──────────────────────────
// Cada ativo (BTC e ETH, velas 15m fechadas) vota com 3 indicadores: ADX, ER (Efficiency Ratio) e caixa (amplitude de LATERAL_JAN velas em ATRs).
//  • BLOQUEIA quando os DOIS ativos têm >= LATERAL_VOTOS de 3 sinais de lateral (ADX < BLOQ · ER < BLOQ · caixa < BLOQ)
//  • LIBERA quando UM ativo tem >= LATERAL_VOTOS_LIBERA de 3 sinais de tendência (ADX >= LIBERA · ER >= LIBERA · caixa >= LIBERA)
//  • entre as duas faixas mantém o estado anterior (histerese) e, depois de liberar, espera LATERAL_HOLD_MIN min antes de bloquear de novo
//    (com 1 voto pra liberar, um indicador oscilando no limite faria o filtro piscar).
//  • enquanto bloqueia: barra o LIGUE AGORA/🚨 e o alerta de entrada; PREPARE (loop principal e minutos finais) e os radares passam com aviso 🧱.
// O estado fica no Supabase (linha _LATERAL_) porque cada rodada do cron é uma execução nova. Sem dado de BTC/ETH: mantém o estado por até
// 30 min e depois libera (nunca fica travado por falha de fonte). Só barra ENTRADA (alerta do loop principal, 🚨/PREPARE dos minutos finais e
// radares); aviso de posição aberta do lado oposto, risco, proteção de lucro, painel e comandos manuais (/agora, /analise...) seguem normais.
const LATERAL_ROW = "_LATERAL_";
type LatInd = { adx: number | null; er: number | null; amp: number | null };
type LateralEst = {
  bloq: boolean; desde: number; flip: number; btc: number | null; eth: number | null; upd: number; dadoT: number; // btc/eth = ADX
  btcEr: number | null; btcAmp: number | null; ethEr: number | null; ethAmp: number | null;
  tend: string[]; avisoT: number; avisoEntrouT: number; // sinais (ex.: "BTC|ER") que estavam em tendência na última leitura, hora do último aviso de SAÍDA da lateral e do último aviso de ENTRADA
  cont: Record<string, { n: number; ms: number }>; // por ciclo do painel (chave = início do ciclo em ms): sinais barrados e tempo bloqueado
  hk: string[]; hora: number; // chaves moeda|lado já contadas na hora atual (conta 1x por hora, não a cada rodada de 2 min)
  sujo?: boolean;
  fonte?: string; // V75: de onde vieram as velas de BTC/ETH na ultima leitura
};
const lateralNovo = (): LateralEst => ({ bloq: false, desde: Date.now(), flip: 0, btc: null, eth: null, upd: Date.now(), dadoT: 0, btcEr: null, btcAmp: null, ethEr: null, ethAmp: null, tend: [], avisoT: 0, avisoEntrouT: 0, cont: {}, hk: [], hora: 0 });
const fmtAdx = (x: number | null) => (x === null ? "?" : x.toFixed(1));
const latCiclo = (est: LateralEst, inicio = painelFase().inicio) => (est.cont[String(inicio)] ??= { n: 0, ms: 0 });
const votosLat = (x: LatInd) => Number(x.adx !== null && x.adx < LATERAL_ADX_BLOQ) + Number(x.er !== null && x.er < LATERAL_ER_BLOQ) + Number(x.amp !== null && x.amp < LATERAL_AMP_BLOQ);
const votosTend = (x: LatInd) => Number(x.adx !== null && x.adx >= LATERAL_ADX_LIBERA) + Number(x.er !== null && x.er >= LATERAL_ER_LIBERA) + Number(x.amp !== null && x.amp >= LATERAL_AMP_LIBERA);
const indBtc = (e: LateralEst): LatInd => ({ adx: e.btc, er: e.btcEr, amp: e.btcAmp });
const indEth = (e: LateralEst): LatInd => ({ adx: e.eth, er: e.ethEr, amp: e.ethAmp });
const indTxt = (x: LatInd) => `ADX ${fmtAdx(x.adx)} · ER ${x.er === null ? "?" : x.er.toFixed(2)} · caixa ${x.amp === null ? "?" : x.amp.toFixed(1)}×ATR`;
async function lateralLer(SB: any): Promise<LateralEst | null> {
  try {
    const { data } = await SB.from(TAB).select("last_status").eq("instid", LATERAL_ROW).maybeSingle();
    const j = data?.last_status ? JSON.parse(data.last_status) : null;
    if (!j || typeof j.bloq !== "boolean") return null;
    return { ...lateralNovo(), ...j, cont: j.cont && typeof j.cont === "object" ? j.cont : {}, hk: Array.isArray(j.hk) ? j.hk.map(String) : [], tend: Array.isArray(j.tend) ? j.tend.map(String) : [], sujo: false };
  } catch { return null; }
}
async function lateralSalvar(SB: any, est: LateralEst) {
  const { sujo: _s, ...limpo } = est;
  const chaves = Object.keys(limpo.cont).sort();
  for (const k of chaves.slice(0, Math.max(0, chaves.length - 2))) delete limpo.cont[k]; // guarda só o ciclo atual e o anterior
  await upsertLinha(SB, LATERAL_ROW, { last_status: JSON.stringify(limpo), last_alert_at: new Date(est.upd).toISOString() });
  est.sujo = false;
}
// ===== V74: divergência de RSI do BTC (1H, 4H, 1D, 1W) — parte pura (sem rede, testável) =====
type DivTipo = "reg-alta" | "oc-alta" | "reg-baixa" | "oc-baixa";
type DivPiv = { i: number; t: number; preco: number; rsi: number };
type DivSinal = { tipo: DivTipo; p1: DivPiv; p2: DivPiv; atraso?: number };
type DivCfg = { esq: number; dir: number; distMin: number; distMax: number; zBaixa: number; zAlta: number; zOc: number; difRsi: number; difPreco: number; porRsi?: boolean };
const DIV_TIPOS: DivTipo[] = ["reg-alta", "oc-alta", "reg-baixa", "oc-baixa"];
const divEhAlta = (t: DivTipo) => t === "reg-alta" || t === "oc-alta";

// RSI de Wilder, uma saída por vela (NaN até haver `periodo` variações)
function divRsiSerie(c: number[], periodo = 14): number[] {
  const out: number[] = new Array(c.length).fill(NaN);
  if (c.length < periodo + 1) return out;
  let g = 0, p = 0;
  for (let i = 1; i <= periodo; i++) { const d = c[i] - c[i - 1]; if (d >= 0) g += d; else p -= d; }
  let mg = g / periodo, mp = p / periodo;
  const rs = () => (mp === 0 ? (mg === 0 ? 50 : 100) : 100 - 100 / (1 + mg / mp));
  out[periodo] = rs();
  for (let i = periodo + 1; i < c.length; i++) {
    const d = c[i] - c[i - 1];
    mg = (mg * (periodo - 1) + (d > 0 ? d : 0)) / periodo;
    mp = (mp * (periodo - 1) + (d < 0 ? -d : 0)) / periodo;
    out[i] = rs();
  }
  return out;
}

// pivô = extremo da janela [i-esq, i+dir]; só existe depois de `dir` velas fechadas à direita (não repinta)
function divPivos(h: number[], l: number[], rsi: number[], t: number[], esq: number, dir: number, porRsi = false): { altos: DivPiv[]; baixos: DivPiv[] } {
  const altos: DivPiv[] = [], baixos: DivPiv[] = [];
  // porRsi=false: pivô de PREÇO (extremo da máxima/mínima) e RSI nessa vela. porRsi=true: pivô do RSI (como o ta.pivotlow/pivothigh do indicador Pine) e preço
  // = mínima/máxima da vela do pivô do RSI.
  const A = porRsi ? rsi : h, B = porRsi ? rsi : l;
  for (let i = esq; i <= h.length - 1 - dir; i++) {
    if (!isFinite(rsi[i])) continue;
    let alto = true, baixo = true;
    for (let j = i - esq; j <= i + dir; j++) {
      if (j === i) continue;
      if (porRsi && !isFinite(rsi[j])) { alto = false; baixo = false; break; }
      if (j < i ? A[j] >= A[i] : A[j] > A[i]) alto = false;
      if (j < i ? B[j] <= B[i] : B[j] < B[i]) baixo = false;
      if (!alto && !baixo) break;
    }
    if (alto) altos.push({ i, t: t[i], preco: h[i], rsi: rsi[i] });
    if (baixo) baixos.push({ i, t: t[i], preco: l[i], rsi: rsi[i] });
  }
  return { altos, baixos };
}

// p1 = pivô anterior, p2 = pivô (ou candidato) mais novo
function divCond(tipo: DivTipo, p1: DivPiv, p2: DivPiv, cfg: DivCfg): boolean {
  const dp = (p2.preco - p1.preco) / p1.preco; // >0: p2 mais alto
  const dr = p2.rsi - p1.rsi;                  // >0: RSI mais alto
  switch (tipo) {
    case "reg-alta":  return dp <= -cfg.difPreco && dr >= cfg.difRsi && p1.rsi <= cfg.zBaixa;   // preço fundo mais baixo, RSI mais alto, RSI do 1º fundo já baixo
    case "oc-alta":   return dp >= cfg.difPreco && dr <= -cfg.difRsi && p2.rsi <= cfg.zOc;      // preço fundo mais alto, RSI mais baixo (continuação de alta)
    case "reg-baixa": return dp >= cfg.difPreco && dr <= -cfg.difRsi && p1.rsi >= cfg.zAlta;    // preço topo mais alto, RSI mais baixo, RSI do 1º topo já alto
    case "oc-baixa":  return dp <= -cfg.difPreco && dr >= cfg.difRsi && p2.rsi >= 100 - cfg.zOc; // preço topo mais baixo, RSI mais alto (continuação de baixa)
  }
}

function divAnalisar(d: { t: number[]; h: number[]; l: number[]; c: number[] }, cfg: DivCfg): { conf: DivSinal[]; ant: DivSinal[]; rsi: number; n: number; rsiS: number[] } {
  const n = d.c.length, rsi = divRsiSerie(d.c, 14);
  const conf: DivSinal[] = [], ant: DivSinal[] = [];
  if (n < 60) return { conf, ant, rsi: rsi[n - 1], n, rsiS: rsi };
  const { altos, baixos } = divPivos(d.h, d.l, rsi, d.t, cfg.esq, cfg.dir, !!cfg.porRsi);
  const distOk = (a: DivPiv, b: DivPiv) => b.i - a.i >= cfg.distMin && b.i - a.i <= cfg.distMax;
  // confirmados: só o par mais recente de cada lado; quem chama decide se ainda é "fresco" (atraso)
  for (const [arr, tipos] of [[baixos, ["reg-alta", "oc-alta"]], [altos, ["reg-baixa", "oc-baixa"]]] as [DivPiv[], DivTipo[]][]) {
    if (arr.length < 2) continue;
    const p1 = arr[arr.length - 2], p2 = arr[arr.length - 1];
    if (!distOk(p1, p2)) continue;
    const atraso = (n - 1 - p2.i) - cfg.dir; // velas fechadas desde que o pivô se confirmou (0 = acabou de confirmar)
    for (const tp of tipos) if (divCond(tp, p1, p2, cfg)) conf.push({ tipo: tp, p1, p2, atraso });
  }
  // antecipados: a última vela fechada é um extremo novo da janela (candidata a pivô) em divergência com o último pivô confirmado
  const c = n - 1;
  if (isFinite(rsi[c]) && c - cfg.esq >= 0) {
    let novoBaixo = true, novoAlto = true;
    for (let j = c - cfg.esq; j < c; j++) {
      if (cfg.porRsi) { if (!(rsi[j] > rsi[c])) novoBaixo = false; if (!(rsi[j] < rsi[c])) novoAlto = false; } // candidato = RSI é o extremo da janela
      else { if (d.l[j] <= d.l[c]) novoBaixo = false; if (d.h[j] >= d.h[c]) novoAlto = false; }
    }
    if (novoBaixo && baixos.length) {
      const p1 = baixos[baixos.length - 1], p2: DivPiv = { i: c, t: d.t[c], preco: d.l[c], rsi: rsi[c] };
      if (distOk(p1, p2)) for (const tp of ["reg-alta", "oc-alta"] as DivTipo[]) if (divCond(tp, p1, p2, cfg)) ant.push({ tipo: tp, p1, p2 });
    }
    if (novoAlto && altos.length) {
      const p1 = altos[altos.length - 1], p2: DivPiv = { i: c, t: d.t[c], preco: d.h[c], rsi: rsi[c] };
      if (distOk(p1, p2)) for (const tp of ["reg-baixa", "oc-baixa"] as DivTipo[]) if (divCond(tp, p1, p2, cfg)) ant.push({ tipo: tp, p1, p2 });
    }
  }
  return { conf, ant, rsi: rsi[c], n, rsiS: rsi };
}

// ===== V74: divergência de RSI do BTC — estado, envio e cron =====
// Alerta ANTECIPADO ("👀 possível": a última vela fechada já é um extremo novo com RSI divergente, mas o pivô ainda não se confirmou) e
// CONFIRMADO ("✅": o pivô fechou DIV_PIV_DIR velas sem ser renovado), mais "❌ não se confirmou" quando o antecipado cai. Regular (reversão) e oculta (continuação),
// altista e baixista, só em vela FECHADA (não repinta). Um aviso por divergência: o confirmado substitui o antecipado (mesma chave).
const DIV_ON = (Deno.env.get("DIV_ON") ?? "1") !== "0";
const DIV_TFS = (Deno.env.get("DIV_TFS") || "1H,4H,1D,1W").split(",").map((x) => x.trim().toUpperCase()).filter((x) => ["1H", "4H", "1D", "1W"].includes(x));
const DIV_INST = "BTC-USDT";
const DIV_ROW = "_DIV_BTC";
const DIV_FETCH_MIN: Record<string, number> = { "1H": 10, "4H": 20, "1D": 60, "1W": 180 }; // de quanto em quanto tempo olha cada gráfico (só reavalia quando fecha vela nova)
const DIV_APAGAR_MIN: Record<string, number> = { "1H": 720, "4H": 1440, "1D": 0, "1W": 0 }; // 0 = fica no chat (o Telegram só apaga mensagem com menos de 48h)
const DIV_TF_NOME: Record<string, string> = { "1H": "1h", "4H": "4h", "1D": "diário", "1W": "semanal" };
const DIV_PIV_ESQ = numEnv("DIV_PIV_ESQ", "5");
const DIV_PIV_DIR = numEnv("DIV_PIV_DIR", "3");
const DIV_ZONA = numEnv("DIV_ZONA", "40");        // regular altista: RSI do 1º fundo ≤ isto; regular baixista: RSI do 1º topo ≥ 100 − isto
const DIV_ZONA_1H = numEnv("DIV_ZONA_1H", "35");  // no 1h a zona é mais rígida (diverge toda hora)
const DIV_ZONA_OCULTA = numEnv("DIV_ZONA_OCULTA", "55");
const DIV_RSI_DIF = numEnv("DIV_RSI_DIF", "1");
const DIV_PRECO_DIF_PCT = numEnv("DIV_PRECO_DIF_PCT", "0.05");
const DIV_DIST_MIN = numEnv("DIV_DIST_MIN", "6");
const DIV_DIST_MAX = numEnv("DIV_DIST_MAX", "60");
const DIV_JANELA_CONF_BASE = numEnv("DIV_JANELA_CONF", "2");
// V74: DIV_MODO=tv copia o indicador Pine (SUPREMA painel): pivô do RSI (5 à esquerda, 5 à direita), preço = mínima/máxima da vela do pivô, 5 a 60 velas entre os
// pivôs, SEM filtro de zona do RSI e sem diferença mínima (só maior/menor), e o "novo" vale 5 velas depois de confirmar. Padrão (DIV_MODO=preco): pivô de preço + zona.
const DIV_MODO_TV = String(Deno.env.get("DIV_MODO") || "preco").trim().toLowerCase() === "tv";
const DIV_TV_DIR = numEnv("DIV_TV_DIR", "5");
const DIV_TV_MIN = numEnv("DIV_TV_MIN", "5");
const DIV_TV_VALIDADE = numEnv("DIV_TV_VALIDADE", "5");
const DIV_JANELA_CONF = DIV_MODO_TV ? DIV_TV_VALIDADE : DIV_JANELA_CONF_BASE; // confirmado só é "novo" até estas velas depois de confirmar (antes disso só se já tinha sido antecipado)
const divCfg = (tf: string): DivCfg => {
  if (DIV_MODO_TV) return { esq: DIV_PIV_ESQ, dir: DIV_TV_DIR, distMin: DIV_TV_MIN, distMax: DIV_DIST_MAX, zBaixa: 100, zAlta: 0, zOc: 100, difRsi: 1e-9, difPreco: 1e-9, porRsi: true };
  const z = tf === "1H" || tf === "15m" ? DIV_ZONA_1H : DIV_ZONA;
  return { esq: DIV_PIV_ESQ, dir: DIV_PIV_DIR, distMin: DIV_DIST_MIN, distMax: DIV_DIST_MAX, zBaixa: z, zAlta: 100 - z, zOc: DIV_ZONA_OCULTA, difRsi: DIV_RSI_DIF, difPreco: DIV_PRECO_DIF_PCT / 100 };
};
type DivPend = { tf: string; tipo: DivTipo; p1: DivPiv; p2: DivPiv; desde: number };
type DivEvento = { t: number; tf: string; tipo: DivTipo; fase: "A" | "C" | "X"; preco: number; rsi: number };
type DivEst = { fetch: Record<string, number>; barra: Record<string, number>; pend: Record<string, DivPend>; done: string[]; hist: DivEvento[] };
const divNovo = (): DivEst => ({ fetch: {}, barra: {}, pend: {}, done: [], hist: [] });
async function divLer(SB: any): Promise<DivEst | null> {
  try {
    const { data, error } = await SB.from(TAB).select("last_status").eq("instid", DIV_ROW).maybeSingle();
    if (error) { console.log("⚠️ divergência BTC: leitura do estado falhou, pulo a rodada", error.message ?? error); return null; }
    if (!data?.last_status) return divNovo();
    try { return { ...divNovo(), ...JSON.parse(data.last_status) }; } catch { return divNovo(); }
  } catch (e) { console.log("⚠️ divergência BTC: leitura do estado falhou", e); return null; }
}
async function divSalvar(SB: any, est: DivEst) {
  est.done = est.done.slice(-150);
  est.hist = est.hist.slice(-80);
  await upsertLinha(SB, DIV_ROW, { last_status: JSON.stringify(est), last_alert_at: new Date().toISOString() });
}
// vela só vale se JÁ fechou de verdade: o xFechadas assume barras alinhadas ao UTC (a semanal abre na segunda e a diária pode abrir às 16h UTC)
async function divVelas(tf: string): Promise<XVelas | null> {
  const d = await xCandles(DIV_INST, tf, 300);
  if (!d) return null;
  const ms = barToMs(tf), agora = Date.now();
  let n = d.t.length;
  while (n > 0 && d.t[n - 1] + ms > agora) n--;
  if (n < 100) return null;
  return { t: d.t.slice(0, n), o: d.o.slice(0, n), h: d.h.slice(0, n), l: d.l.slice(0, n), c: d.c.slice(0, n), v: d.v.slice(0, n) };
}
const divDH = (ms: number) => { const iso = new Date(ms + X_TZ_OFFSET_H * 3600000).toISOString(); return `${iso.slice(8, 10)}/${iso.slice(5, 7)} ${iso.slice(11, 16)}`; };
const DIV_TXT: Record<DivTipo, { nome: string; icone: string; ponta: string; preco: string; rsi: string; sentido: string }> = {
  "reg-alta": { nome: "ALTISTA regular", icone: "🟢", ponta: "fundo", preco: "mais baixo", rsi: "mais alto", sentido: "possível reversão pra cima" },
  "oc-alta": { nome: "ALTISTA oculta", icone: "🟢", ponta: "fundo", preco: "mais alto", rsi: "mais baixo", sentido: "continuação da alta" },
  "reg-baixa": { nome: "BAIXISTA regular", icone: "🔴", ponta: "topo", preco: "mais alto", rsi: "mais baixo", sentido: "possível reversão pra baixo" },
  "oc-baixa": { nome: "BAIXISTA oculta", icone: "🔴", ponta: "topo", preco: "mais baixo", rsi: "mais alto", sentido: "continuação da baixa" },
};
function divMsg(fase: "A" | "C" | "X", tf: string, tipo: DivTipo, p1: DivPiv, p2: DivPiv, preco: number, rsiAtual: number, atraso = 0): string {
  const x = DIV_TXT[tipo], nome = DIV_TF_NOME[tf] ?? tf;
  const tit = fase === "A" ? `👀 <b>BTC · ${nome}</b> — possível divergência ${x.nome}`
    : fase === "C" ? `✅ <b>BTC · ${nome}</b> — divergência ${x.nome} CONFIRMADA`
    : `❌ <b>BTC · ${nome}</b> — divergência ${x.nome} não se confirmou`;
  let m = `${tit}\n${DIVISOR}\n\n${x.icone} ${x.nome}: ${x.sentido}\n`;
  m += `Preço fez ${x.ponta} ${x.preco}: ${fmtPrice(p1.preco)} (${divDH(p1.t)}) → ${fmtPrice(p2.preco)} (${divDH(p2.t)})\n`;
  m += `RSI no ${x.ponta}: ${p1.rsi.toFixed(1)} → ${p2.rsi.toFixed(1)} (${x.rsi})\n`;
  if (fase === "A") m += `\n⏳ Ainda NÃO confirmada: o ${x.ponta} só vale depois de ${divCfg(tf).dir} velas ${nome} fechadas sem renovar o extremo. Se o preço seguir e o RSI acompanhar, eu aviso que não se confirmou.\n`;
  else if (fase === "C") m += `\n${atraso > 0 ? `Confirmada há ${atraso} vela(s) ${nome}.` : `${x.ponta[0].toUpperCase()}${x.ponta.slice(1)} confirmado (${divCfg(tf).dir} velas fechadas sem renovar).`}\n`;
  else m += `\nO extremo foi renovado e o RSI acompanhou: a divergência deixou de existir.\n`;
  m += `BTC ${fmtPrice(preco)} · RSI ${nome} ${isFinite(rsiAtual) ? rsiAtual.toFixed(1) : "—"}`;
  if (LATERAL_ON) m += ` · filtro lateral: ${_latBloq ? "🧱 lateral" : "📶 tendência"}`;
  return m;
}
async function divEnviar(SB: any, fase: "A" | "C" | "X", tf: string, tipo: DivTipo, p1: DivPiv, p2: DivPiv, preco: number, rsiAtual: number, atraso = 0): Promise<boolean> {
  const dest = ALERT_CHAT_IDS.filter((ch) => !silChat(ch));
  if (!dest.length) return false;
  // 1h/4h: 1 mensagem por tipo (a nova substitui a velha, e some sozinha); diário/semanal: 1 por divergência (ficam no chat, são raras)
  const chave = tf === "1D" || tf === "1W" ? `DIV_${tf}_${tipo}_${p1.t}` : `DIV_${tf}_${tipo}`;
  const msg = divMsg(fase, tf, tipo, p1, p2, preco, rsiAtual, atraso);
  const ids = await Promise.all(dest.map((ch) => enviarAlertaMoeda(SB, ch, chave, msg, undefined, DIV_APAGAR_MIN[tf] ?? 0).catch(() => null)));
  return ids.some(Boolean);
}
async function checarDivergenciaBTC(SB: any): Promise<void> {
  if (!DIV_ON || !DIV_TFS.length || !ALERT_CHAT_IDS.length) return;
  const est = await divLer(SB);
  if (!est) return;
  const agora = Date.now();
  let mudou = false;
  for (const tf of DIV_TFS) {
    if (agora - (est.fetch[tf] || 0) < (DIV_FETCH_MIN[tf] ?? 10) * 60000) continue;
    const d = await divVelas(tf);
    est.fetch[tf] = agora; mudou = true;
    if (!d) { console.log(`⚠️ divergência BTC ${tf}: sem velas`); continue; }
    const n = d.c.length, ultT = d.t[n - 1];
    if (est.barra[tf] === ultT) continue; // nenhuma vela nova fechada desde a última avaliação
    const a = divAnalisar(d, divCfg(tf));
    const preco = d.c[n - 1];
    let falhou = false;
    for (const tp of DIV_TIPOS) {
      const pends = Object.keys(est.pend).filter((k) => est.pend[k].tf === tf && est.pend[k].tipo === tp);
      // 1) confirmada — nova (≤ DIV_JANELA_CONF velas) ou que eu já tinha antecipado (aí avisa mesmo atrasada)
      const conf = a.conf.find((x) => x.tipo === tp);
      if (conf) {
        const kc = `${tf}|${tp}|${conf.p2.t}|C`;
        const eraAntecipada = pends.some((k) => est.pend[k].p1.t === conf.p1.t);
        if (!est.done.includes(kc) && ((conf.atraso ?? 0) <= DIV_JANELA_CONF || eraAntecipada)) {
          if (await divEnviar(SB, "C", tf, tp, conf.p1, conf.p2, preco, a.rsi, conf.atraso ?? 0)) {
            est.done.push(kc);
            est.hist.push({ t: agora, tf, tipo: tp, fase: "C", preco, rsi: a.rsi });
            for (const k of pends) if (est.pend[k].p1.t === conf.p1.t) delete est.pend[k];
            mudou = true;
            console.log(`📐 divergência BTC ${tf} ${tp} CONFIRMADA`);
          } else falhou = true;
        }
      }
      // 2) antecipada — candidata na última vela fechada
      const ant = a.ant.find((x) => x.tipo === tp);
      if (ant) {
        const pk = `${tf}|${tp}|${ant.p1.t}`;
        if (est.pend[pk]) { est.pend[pk].p2 = ant.p2; mudou = true; } // mesma divergência estendida (novo extremo, RSI ainda divergente): atualiza sem avisar de novo
        else if (!est.done.includes(`${pk}|A`) && !est.done.includes(`${tf}|${tp}|${ant.p2.t}|C`)) {
          if (await divEnviar(SB, "A", tf, tp, ant.p1, ant.p2, preco, a.rsi)) {
            est.done.push(`${pk}|A`);
            est.pend[pk] = { tf, tipo: tp, p1: ant.p1, p2: ant.p2, desde: agora };
            est.hist.push({ t: agora, tf, tipo: tp, fase: "A", preco, rsi: a.rsi });
            mudou = true;
            console.log(`📐 divergência BTC ${tf} ${tp} antecipada`);
          } else falhou = true;
        }
      }
      // 3) antecipada que caiu: o extremo desde o 1º pivô JÁ virou pivô (cfg.dir velas sem ser renovado) e a divergência não se confirmou
      //    (o candidato antigo pode estar velho se a rodada atrasou; o que vale é onde está o extremo de verdade)
      for (const k of Object.keys(est.pend).filter((kk) => est.pend[kk].tf === tf && est.pend[kk].tipo === tp)) {
        const pe = est.pend[k];
        if (ant && `${tf}|${tp}|${ant.p1.t}` === k) continue; // ainda divergindo
        const i1 = d.t.lastIndexOf(pe.p1.t);
        if (i1 < 0) { delete est.pend[k]; mudou = true; continue; }
        const alto = !divEhAlta(tp), arr = alto ? d.h : d.l, cfgTf = divCfg(tf);
        const ref = cfgTf.porRsi ? a.rsiS : arr; // modo tv: o extremo que vira pivô é o do RSI; no padrão, o do preço
        let ie = i1 + 1;
        for (let j = i1 + 1; j < n; j++) if (alto ? ref[j] > ref[ie] : ref[j] < ref[ie]) ie = j; // 1ª ocorrência do extremo (igual ao divPivos)
        if (n - 1 - ie >= cfgTf.dir) {
          const p2: DivPiv = { i: ie, t: d.t[ie], preco: arr[ie], rsi: isFinite(a.rsiS[ie]) ? a.rsiS[ie] : pe.p2.rsi };
          if (await divEnviar(SB, "X", tf, tp, pe.p1, p2, preco, a.rsi)) {
            est.hist.push({ t: agora, tf, tipo: tp, fase: "X", preco, rsi: a.rsi });
            delete est.pend[k]; mudou = true;
            console.log(`📐 divergência BTC ${tf} ${tp} não se confirmou`);
          } else falhou = true;
        }
      }
    }
    if (!falhou) est.barra[tf] = ultT; // se algum envio falhou (silêncio/Telegram), reavalia na próxima rodada em vez de perder o aviso
  }
  if (mudou) await divSalvar(SB, est);
}
// V74: contexto do BTC pro /analise (só leitura do estado salvo pelo checarDivergenciaBTC — não busca vela, não mexe na nota/confiança).
// Mostra as antecipadas em aberto e as confirmadas recentes (janela por gráfico), e quantas estão a favor/contra o lado do robô daquela moeda.
const DIV_VALE_H: Record<string, number> = { "1H": 12, "4H": 48, "1D": 7 * 24, "1W": 28 * 24 };
function divBtcTexto(est: DivEst, lado: "long" | "short", agora: number): string {
  const ordem = ["1W", "1D", "4H", "1H"];
  const itens: { tf: string; tipo: DivTipo; fase: "A" | "C"; idadeH: number }[] = [];
  for (const p of Object.values(est.pend || {})) itens.push({ tf: p.tf, tipo: p.tipo, fase: "A", idadeH: (agora - p.desde) / 3_600_000 });
  const vistos = new Set<string>();
  for (const e of [...(est.hist || [])].reverse()) { // mais nova primeiro: 1 confirmada por (gráfico, tipo)
    if (e.fase !== "C") continue;
    const k = `${e.tf}|${e.tipo}`, h = (agora - e.t) / 3_600_000;
    if (vistos.has(k) || h > (DIV_VALE_H[e.tf] ?? 12)) continue;
    vistos.add(k);
    itens.push({ tf: e.tf, tipo: e.tipo, fase: "C", idadeH: h });
  }
  const aberto = new Set(itens.filter((i) => i.fase === "A").map((i) => `${i.tf}|${i.tipo}`));
  const lista = itens.filter((i) => i.fase === "A" || !aberto.has(`${i.tf}|${i.tipo}`)) // antecipada em aberto de novo > confirmada velha do mesmo tipo
    .sort((x, y) => ordem.indexOf(x.tf) - ordem.indexOf(y.tf));
  if (!lista.length) return `📐 BTC: sem divergência de RSI ativa (1h, 4h, diário, semanal)\n`;
  const idade = (h: number) => (h < 1 ? "agora" : h < 48 ? `há ${Math.round(h)}h` : `há ${Math.round(h / 24)}d`);
  let m = `📐 <b>BTC — divergência de RSI</b>\n`;
  m += lista.map((i) => `${DIV_TXT[i.tipo].icone} ${DIV_TF_NOME[i.tf] ?? i.tf} ${DIV_TXT[i.tipo].nome}: ${i.fase === "A" ? "👀 antecipada (não confirmada)" : `✅ confirmada ${idade(i.idadeH)}`}`).join("\n") + "\n";
  const aFavor = lista.filter((i) => divEhAlta(i.tipo) === (lado === "long")).length, contra = lista.length - aFavor;
  m += `Pro lado do robô (${lado === "long" ? "LONG" : "SHORT"}): ${aFavor} a favor · ${contra} contra${contra > aFavor ? " ⚠️" : ""}\n`;
  return m;
}
async function divBtcLinha(SB: any, lado: "long" | "short"): Promise<string> {
  if (!DIV_ON || !SB) return "";
  try {
    const { data, error } = await SB.from(TAB).select("last_status").eq("instid", DIV_ROW).maybeSingle();
    if (error || !data?.last_status) return "";
    return divBtcTexto({ ...divNovo(), ...JSON.parse(data.last_status) }, lado, Date.now());
  } catch { return ""; }
}
// V74: /div diag — por que o bot NÃO avisou uma divergência que você está vendo no gráfico? Mostra, por gráfico, os 2 últimos pivôs de cada lado, cada regra
// (preço, RSI, zona, distância) com ✔/✘ e se o pivô ainda está "fresco" pro aviso. Inclui o 15m só pra comparar com o TradingView (o aviso automático é 1h/4h/diário/semanal).
function divExplica(tipo: DivTipo, p1: DivPiv, p2: DivPiv, cfg: DivCfg): string {
  const dp = ((p2.preco - p1.preco) / p1.preco) * 100, dr = p2.rsi - p1.rsi, dist = p2.i - p1.i, ep = cfg.difPreco * 100;
  const alta = divEhAlta(tipo), reg = tipo.startsWith("reg");
  const precoOk = reg === alta ? dp <= -ep : dp >= ep;           // regular altista/oculta baixista: preço mais baixo; as outras: mais alto
  const rsiOk = reg === alta ? dr >= cfg.difRsi : dr <= -cfg.difRsi;
  const zonaOk = tipo === "reg-alta" ? p1.rsi <= cfg.zBaixa : tipo === "reg-baixa" ? p1.rsi >= cfg.zAlta : tipo === "oc-alta" ? p2.rsi <= cfg.zOc : p2.rsi >= 100 - cfg.zOc;
  const zonaTxt = tipo === "reg-alta" ? `RSI 1º fundo ${p1.rsi.toFixed(1)} ≤ ${cfg.zBaixa}` : tipo === "reg-baixa" ? `RSI 1º topo ${p1.rsi.toFixed(1)} ≥ ${cfg.zAlta}` : tipo === "oc-alta" ? `RSI ${p2.rsi.toFixed(1)} ≤ ${cfg.zOc}` : `RSI ${p2.rsi.toFixed(1)} ≥ ${100 - cfg.zOc}`;
  const dOk = dist >= cfg.distMin && dist <= cfg.distMax, tudo = divCond(tipo, p1, p2, cfg) && dOk;
  const v = (b: boolean) => (b ? "✔" : "✘");
  return `${tudo ? "✅" : "▫️"} ${DIV_TXT[tipo].nome}: preço ${dp >= 0 ? "+" : ""}${dp.toFixed(2)}% ${v(precoOk)} · RSI ${dr >= 0 ? "+" : ""}${dr.toFixed(1)} ${v(rsiOk)} · zona (${zonaTxt}) ${v(zonaOk)} · ${dist} velas ${v(dOk)}`;
}
async function runDivDiag(chatId: number | string) {
  const tfs = ["15m", ...DIV_TFS.filter((t) => t !== "1W")]; // semanal quase nunca é a dúvida; 15m entra só pra comparar
  let m = `🔬 <b>DIVERGÊNCIA BTC — por que avisou ou não</b>\n${DIVISOR}\n<i>✔ regra cumprida · ✘ não cumprida · ✅ = alertaria. Pivô${DIV_MODO_TV ? " do RSI (modo tv, igual ao indicador)" : " de preço"}: ${DIV_PIV_ESQ} velas à esquerda e ${divCfg("4H").dir} à direita (só existe depois de ${DIV_PIV_DIR} velas fechadas).</i>\n`;
  for (const tf of tfs) {
    const d = await divVelas(tf).catch(() => null);
    const nome = DIV_TF_NOME[tf] ?? tf;
    if (!d) { m += `\n<b>${nome}</b>: sem velas agora\n`; continue; }
    const cfg = divCfg(tf), n = d.c.length, rsi = divRsiSerie(d.c, 14);
    const { altos, baixos } = divPivos(d.h, d.l, rsi, d.t, cfg.esq, cfg.dir, !!cfg.porRsi);
    const ultN = (arr: DivPiv[]) => (arr.length >= 2 ? [arr[arr.length - 2], arr[arr.length - 1]] : null);
    m += `\n<b>${nome}${tf === "15m" ? " (só comparação)" : ""}</b> · RSI ${isFinite(rsi[n - 1]) ? rsi[n - 1].toFixed(1) : "—"} · BTC ${fmtPrice(d.c[n - 1])}\n`;
    for (const [rot, arr, tipos] of [["Fundos", baixos, ["reg-alta", "oc-alta"]], ["Topos", altos, ["reg-baixa", "oc-baixa"]]] as [string, DivPiv[], DivTipo[]][]) {
      const par = ultN(arr);
      if (!par) { m += `${rot}: poucos pivôs\n`; continue; }
      const [p1, p2] = par, idade = n - 1 - p2.i, atraso = idade - cfg.dir;
      m += `${rot}: ${fmtPrice(p1.preco)} (RSI ${p1.rsi.toFixed(1)}, ${divDH(p1.t)}) → ${fmtPrice(p2.preco)} (RSI ${p2.rsi.toFixed(1)}, ${divDH(p2.t)}) · pivô confirmado há ${atraso} vela(s) ${atraso <= DIV_JANELA_CONF ? "(ainda dentro da janela de aviso)" : "(passou da janela de aviso: o bot só avisa no começo)"}\n`;
      for (const tp of tipos) m += `  ${divExplica(tp, p1, p2, cfg)}\n`;
    }
    // candidato na última vela (aviso antecipado)
    const c = n - 1; let nb = true, na = true;
    for (let j = Math.max(0, c - cfg.esq); j < c; j++) { if (cfg.porRsi) { if (!(rsi[j] > rsi[c])) nb = false; if (!(rsi[j] < rsi[c])) na = false; } else { if (d.l[j] <= d.l[c]) nb = false; if (d.h[j] >= d.h[c]) na = false; } }
    m += `Última vela é ${nb ? "um fundo novo (candidato)" : na ? "um topo novo (candidato)" : "um extremo novo? não"} — o aviso antecipado só sai quando ela é extremo da janela.\n`;
  }
  m += `\n<i>Se o TradingView mostra divergência e aqui está ✘: a regra que falhou (zona do RSI, diferença mínima, distância) é a diferença entre o seu indicador e o bot. Se está ✅ e não avisou, me mande o horário.</i>`;
  await enviarEmPartes(chatId, m); // V107: em partes
}
// V74: /trades — histórico REAL do motor (tabela "trades", em OUTRO Supabase). O bot não tem acesso ao banco do motor: ele pergunta ao motor (action:"trades") com uma
// chave SÓ DE LEITURA (secret MOTOR_LEITURA_SECRET = o LEITURA_SECRET do motor). Secrets: MOTOR_URL (URL da função do motor), MOTOR_LEITURA_SECRET e,
// se houver mais de um usuário no motor, MOTOR_USER_EMAIL. PnL do motor = preço × tamanho, SEM taxas: a taxa abaixo é estimativa (alavancagem 1, 0,12% por perna).
const MOTOR_URL = (Deno.env.get("MOTOR_URL") || "").trim();
const MOTOR_LEITURA_SECRET = (Deno.env.get("MOTOR_LEITURA_SECRET") || "").trim();
const MOTOR_USER_EMAIL = (Deno.env.get("MOTOR_USER_EMAIL") || "").trim();
// V107: MODO ALERTA do motor (V58+). Cada alerta de FUNDO (e repique) que sai no Telegram também vai pro motor, que decide pela configuração do site
// (ligado, simulação, banca, stop/alvo/prazo, limites). Secret MOTOR_ALERTA_SECRET = o ALERTA_SECRET do motor (chave que SÓ grava o alerta como pendente).
// Sem MOTOR_URL ou sem MOTOR_ALERTA_SECRET, não manda nada. Nunca atrasa nem derruba o alerta do Telegram (roda em segundo plano, com timeout).
const MOTOR_ALERTA_SECRET = (Deno.env.get("MOTOR_ALERTA_SECRET") || "").trim();
const OPORT_MOTOR_MAX_MIN = numEnv("OPORT_MOTOR_MAX_MIN", "15"); // oportunidade: só manda pro motor se o cruzamento fechou há até isso
// V107: se a função do motor exige JWT no gateway do Supabase ("Verify JWT" ligado), o Secret MOTOR_ANON_KEY (a anon key PÚBLICA do projeto do motor,
// a mesma que o site usa) vai como Authorization. Ela não dá acesso a nada no motor: quem autoriza é a chave de leitura / do modo alerta.
const MOTOR_ANON_KEY = (Deno.env.get("MOTOR_ANON_KEY") || "").trim();
const motorHeaders = (extra: Record<string, string>): Record<string, string> => ({ "Content-Type": "application/json", ...(MOTOR_ANON_KEY ? { Authorization: `Bearer ${MOTOR_ANON_KEY}`, apikey: MOTOR_ANON_KEY } : {}), ...extra });
async function enviarAlertaMotor(o: { inst: string; side: "long" | "short"; tipo: string; preco: number; atr: number; nota: number | null; vol: number | null }) {
  if (!MOTOR_URL || !MOTOR_ALERTA_SECRET) return;
  if (!(o.preco > 0) || !(o.atr > 0)) { console.log(`⚠️ modo alerta: ${o.inst} sem preço/ATR válido, não mandei pro motor`); return; }
  try {
    const r = await fetch(MOTOR_URL, {
      method: "POST", headers: motorHeaders({ "x-alerta-secret": MOTOR_ALERTA_SECRET }),
      body: JSON.stringify({ action: "alerta", instId: o.inst, side: o.side, tipo: o.tipo, preco: o.preco, atr: o.atr, nota: o.nota, vol_usdt: o.vol }),
      signal: AbortSignal.timeout(10000),
    });
    const j: any = await r.json().catch(() => null);
    console.log(r.ok && j?.ok ? `📨 modo alerta: ${o.inst} ${o.tipo} enviado ao motor (${j.gravados ?? 0} pendente(s)${j.msg ? ` · ${j.msg}` : ""})` : `⚠️ modo alerta: o motor recusou ${o.inst} (HTTP ${r.status}${j?.error ? `: ${String(j.error).slice(0, 160)}` : ""})`);
  } catch (e) { console.log(`⚠️ modo alerta: falha ao mandar ${o.inst} pro motor (${e})`); }
}
type TradeMotor = { inst_id: string; side: string; action: "open" | "close"; size: number | null; price: number | null; cost_usdt: number | null; pnl_usdt: number | null; motivo: string | null; created_at: string };
function resumoTrades(rows: TradeMotor[], dias: number): string {
  const opens = rows.filter((r) => r.action === "open"), closes = rows.filter((r) => r.action === "close");
  const comPnl = closes.filter((r) => r.pnl_usdt != null && isFinite(Number(r.pnl_usdt)));
  const pnl = (r: TradeMotor) => Number(r.pnl_usdt), soma = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const ganhos = soma(comPnl.map(pnl).filter((x) => x > 0)), perdas = -soma(comPnl.map(pnl).filter((x) => x < 0));
  const pf = perdas > 0 ? ganhos / perdas : ganhos > 0 ? Infinity : NaN;
  const un = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(2)}`;
  const taxaEst = soma(opens.map((r) => Number(r.cost_usdt) || 0)) * (TAXA_IDA_VOLTA_PCT / 100);
  let m = `🧾 <b>TRADES REAIS DO MOTOR</b> — últimos ${dias} dia(s)\n${DIVISOR}\n`;
  if (!rows.length) return m + "Nenhum trade registrado no período (a tabela <b>trades</b> existe e está recebendo?).";
  m += `${opens.length} abertura(s) · ${closes.length} fechamento(s) (${comPnl.length} com PnL)\n`;
  if (comPnl.length) {
    const wins = comPnl.filter((r) => pnl(r) > 0).length;
    m += `Acerto ${Math.round((wins / comPnl.length) * 100)}% (${wins}/${comPnl.length}) · PnL ${un(soma(comPnl.map(pnl)))} USDT · médio ${un(soma(comPnl.map(pnl)) / comPnl.length)} · PF ${isFinite(pf) ? pf.toFixed(2) : pf === Infinity ? "∞" : "—"}\n`;
    m += `Taxa estimada ≈ ${taxaEst.toFixed(2)} USDT (0,12%/perna, alavancagem 1) → PnL líquido estimado <b>${un(soma(comPnl.map(pnl)) - taxaEst)} USDT</b>\n`;
  }
  // por motivo de fechamento
  const mot = new Map<string, { n: number; soma: number; wins: number; comPnl: number }>();
  for (const r of closes) {
    const k = String(r.motivo || "outro"), a = mot.get(k) || { n: 0, soma: 0, wins: 0, comPnl: 0 };
    a.n++; if (r.pnl_usdt != null && isFinite(Number(r.pnl_usdt))) { a.comPnl++; a.soma += pnl(r); if (pnl(r) > 0) a.wins++; }
    mot.set(k, a);
  }
  m += `\n<b>Fechamentos por motivo</b>\n` + [...mot.entries()].sort((a, b) => b[1].n - a[1].n).map(([k, a]) => `${k}: ${a.n}${a.comPnl ? ` · ${un(a.soma)} USDT · acerto ${Math.round((a.wins / a.comPnl) * 100)}%` : ""}`).join("\n") + "\n";
  const viradas = closes.filter((r) => r.motivo === "virada").length, sinais = opens.filter((r) => r.motivo === "sinal").length;
  m += `\n🔁 Viradas reais: ${viradas} · entradas por sinal (sem posição antes): ${sinais}\n`;
  // por moeda
  const porMoeda = new Map<string, { n: number; soma: number }>();
  for (const r of comPnl) { const k = String(r.inst_id), a = porMoeda.get(k) || { n: 0, soma: 0 }; a.n++; a.soma += pnl(r); porMoeda.set(k, a); }
  const ordM = [...porMoeda.entries()].sort((a, b) => b[1].soma - a[1].soma), fm = (e: [string, { n: number; soma: number }]) => `${e[0].replace("-USDT", "")} ${un(e[1].soma)} (${e[1].n})`;
  if (ordM.length === 1) m += `\n<b>Moeda:</b> ${fm(ordM[0])}\n`;
  else if (ordM.length) { const kM = Math.min(3, Math.floor(ordM.length / 2)); m += `\n<b>Melhores:</b> ${ordM.slice(0, kM).map(fm).join(" · ")}\n<b>Piores:</b> ${ordM.slice(-kM).reverse().map(fm).join(" · ")}\n`; } // metade de cada lado: com poucas moedas não repete a mesma nas duas listas
  // últimos fechamentos
  m += `\n<b>Últimos fechamentos</b>\n` + closes.slice(-8).reverse().map((r) => `${divDH(new Date(r.created_at).getTime())} ${String(r.inst_id).replace("-USDT", "")} ${r.side === "long" ? "L" : "S"} · ${r.motivo || "—"}${r.pnl_usdt != null ? ` · ${un(pnl(r))}` : ""}`).join("\n") + "\n";
  m += `\n<i>PnL do motor = preço × tamanho, sem taxas nem funding; fechamentos usam o preço ao vivo da hora, pode diferir do fill real. Compare com o /saida (simulação) pelo mesmo período.</i>`;
  return m;
}
async function runTrades(chatId: number | string, dias: number) {
  if (!MOTOR_URL || !MOTOR_LEITURA_SECRET) {
    await sendTelegram(chatId, `🧾 <b>/trades</b> precisa de 2 Secrets no bot de alertas:\n• <b>MOTOR_URL</b> = URL da função do motor\n• <b>MOTOR_LEITURA_SECRET</b> = o mesmo valor do <b>LEITURA_SECRET</b> que você criar no motor\n(opcional: MOTOR_USER_EMAIL, se o motor tiver mais de um usuário). A chave de leitura só lista trades, não opera nem lê chave da corretora.`);
    return;
  }
  try {
    const r = await fetch(MOTOR_URL, { method: "POST", headers: motorHeaders({ "x-leitura-secret": MOTOR_LEITURA_SECRET }), body: JSON.stringify({ action: "trades", dias, ...(MOTOR_USER_EMAIL ? { user_email: MOTOR_USER_EMAIL } : {}) }) });
    const j: any = await r.json().catch(() => null);
    if (!r.ok || !j?.ok) { await sendTelegram(chatId, `⚠️ O motor recusou a leitura (HTTP ${r.status}${j?.error ? `: ${String(j.error).slice(0, 160)}` : ""}). Confira MOTOR_URL, o LEITURA_SECRET do motor e se o motor já está na versão com a ação "trades".`); return; }
    for (const parte of dividirHtml(resumoTrades((j.trades || []) as TradeMotor[], Number(j.dias) || dias))) await sendTelegram(chatId, parte);
  } catch (e) { await sendTelegram(chatId, `⚠️ Não consegui falar com o motor agora (${String((e as Error)?.message || e).slice(0, 120)}).`); }
}
// ===== V74: acompanhamento das HIPÓTESES dos radares (topo, fundo, repique) =====
// Um alerta de radar é uma IDEIA de reversão ("topo" = cair, "fundo" = subir). Antes ninguém avisava quando a ideia FALHAVA (o caso da US: 3 alertas de topo e o preço
// seguiu subindo sem aviso). Agora cada alerta de radar vira uma hipótese acompanhada: INVALIDADA quando o preço anda contra a ideia mais que max(HIP_INV_ATR × ATR, HIP_INV_PCT %),
// FUNCIONOU quando anda a favor o mesmo tanto, EXPIRA depois de HIP_HORAS. O /radar mostra, com os alertas passados, o que aconteceu depois de cada tipo.
// Compressão fica de fora: o lado dela só se define no rompimento, então "contra a ideia" não existe.
const HIP_ON = (Deno.env.get("HIP_ON") ?? "1") !== "0";
const HIP_ROW = "_HIPOTESES_";
const HIP_HORAS = numEnv("HIP_HORAS", "36");
const HIP_INV_ATR = numEnv("HIP_INV_ATR", "3");
const HIP_INV_PCT = numEnv("HIP_INV_PCT", "2");
const HIP_ALVO_ATR = numEnv("HIP_ALVO_ATR", "3");
const HIP_ALVO_PCT = numEnv("HIP_ALVO_PCT", "2");
const HIP_AVISAR_FUNCIONOU = (Deno.env.get("HIP_AVISAR_FUNCIONOU") ?? "1") !== "0";
const HIP_APAGAR_MIN = numEnv("HIP_APAGAR_MIN", "720");
type HipTipo = "topo" | "fundo" | "repique" | "faca" | "foguete";
type HipLado = "long" | "short";
type HipRes = "invalida" | "funcionou" | "expirou" | "aberta";
type Hip = { inst: string; tipo: HipTipo; lado: HipLado; preco: number; atr: number; t: number; mfe: number; mae: number };
const HIP_NOME: Record<HipTipo, string> = { topo: "topo", fundo: "fundo", repique: "repique", faca: "faca", foguete: "foguete" };
const hipDist = (preco: number, atr: number, kAtr: number, pct: number): number => Math.max(atr > 0 ? kAtr * atr : 0, (preco * pct) / 100);
// com UM preço (acompanhamento ao vivo)
function hipPasso(lado: HipLado, preco0: number, atr: number, p: number, idadeMin: number): { res: HipRes; contra: number; favor: number } {
  const adv = lado === "short" ? p - preco0 : preco0 - p;
  const res: HipRes = adv >= hipDist(preco0, atr, HIP_INV_ATR, HIP_INV_PCT) ? "invalida" : -adv >= hipDist(preco0, atr, HIP_ALVO_ATR, HIP_ALVO_PCT) ? "funcionou" : idadeMin >= HIP_HORAS * 60 ? "expirou" : "aberta";
  return { res, contra: (adv / preco0) * 100, favor: (-adv / preco0) * 100 };
}
// com velas (retroativo): na MESMA vela, se o movimento contra e o a favor couberam, conta como invalidada (pior caso pro radar)
function hipAvaliar(d: { h: number[]; l: number[] }, k0: number, lado: HipLado, preco0: number, atr: number, tfMin: number): { res: HipRes; barras: number; mfe: number; mae: number } {
  const dInv = hipDist(preco0, atr, HIP_INV_ATR, HIP_INV_PCT), dAlvo = hipDist(preco0, atr, HIP_ALVO_ATR, HIP_ALVO_PCT);
  let mfe = 0, mae = 0;
  for (let k = k0 + 1; k < d.h.length; k++) {
    const advP = lado === "short" ? d.h[k] : d.l[k], favP = lado === "short" ? d.l[k] : d.h[k];
    const adv = lado === "short" ? advP - preco0 : preco0 - advP, fav = lado === "short" ? preco0 - favP : favP - preco0;
    mae = Math.max(mae, (adv / preco0) * 100); mfe = Math.max(mfe, (fav / preco0) * 100);
    if (adv >= dInv) return { res: "invalida", barras: k - k0, mfe, mae };
    if (fav >= dAlvo) return { res: "funcionou", barras: k - k0, mfe, mae };
    if ((k - k0) * tfMin >= HIP_HORAS * 60) return { res: "expirou", barras: k - k0, mfe, mae };
  }
  return { res: "aberta", barras: d.h.length - 1 - k0, mfe, mae };
}
async function hipLer(SB: any): Promise<Hip[] | null> {
  try {
    const { data, error } = await SB.from(TAB).select("last_status").eq("instid", HIP_ROW).maybeSingle();
    if (error) { console.log("⚠️ hipóteses: leitura falhou, pulo a rodada", error.message ?? error); return null; }
    if (!data?.last_status) return [];
    try { const j = JSON.parse(data.last_status); return Array.isArray(j) ? j : []; } catch { return []; }
  } catch (e) { console.log("⚠️ hipóteses: leitura falhou", e); return null; }
}
async function hipSalvar(SB: any, abertas: Hip[]) { await upsertLinha(SB, HIP_ROW, { last_status: JSON.stringify(abertas.slice(-80)), last_alert_at: new Date().toISOString() }); }
async function registrarHipotese(SB: any, inst: string, tipo: HipTipo, lado: HipLado, preco: number): Promise<void> {
  if (!HIP_ON || !(preco > 0)) return;
  try {
    const abertas = await hipLer(SB);
    if (!abertas) return;
    const d = await xCandles(inst, TIMEFRAME, 80).catch(() => null);
    const atr = d ? calcATR(d.h, d.l, d.c, 14) : 0;
    const resto = abertas.filter((h) => !(h.inst === inst && h.tipo === tipo)); // alerta novo da mesma moeda e tipo substitui o anterior
    resto.push({ inst, tipo, lado, preco, atr: isFinite(atr) ? atr : 0, t: Date.now(), mfe: 0, mae: 0 });
    await hipSalvar(SB, resto);
  } catch (e) { console.log("⚠️ registrar hipótese falhou", e); }
}
const hipIdade = (ms: number): string => { const h = ms / 3_600_000; return h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 48 ? `${h.toFixed(1)}h` : `${(h / 24).toFixed(1)} dias`; };
function hipMsg(h: Hip, res: "invalida" | "funcionou", p: number): string {
  const nome = HIP_NOME[h.tipo], lado = h.lado === "long" ? "LONG" : "SHORT", mov = ((p - h.preco) / h.preco) * 100, idade = hipIdade(Date.now() - h.t);
  const base = `O radar de ${nome} avisou ${lado} a ${fmtPrice(h.preco)} (há ${idade}). Agora ${fmtPrice(p)} (${mov >= 0 ? "+" : ""}${mov.toFixed(1)}% desde o alerta).`;
  const extremos = `Pior ponto contra: ${h.mae.toFixed(1)}% · melhor a favor: ${h.mfe.toFixed(1)}%`;
  if (res === "invalida") return `❌ <b>${h.inst}</b> — ${nome} ${lado} invalidado\n${DIVISOR}\n\n${base}\nO preço andou contra a ideia além do limite (${HIP_INV_ATR} ATR, mín. ${HIP_INV_PCT}%): a reversão falhou por enquanto.\n${extremos}\nSe você abriu ${lado}, reavalie; se não, ignore esta ideia até um novo alerta.`;
  return `✅ <b>${h.inst}</b> — ${nome} ${lado} funcionou\n${DIVISOR}\n\n${base}\nO preço andou a favor além do alvo (${HIP_ALVO_ATR} ATR, mín. ${HIP_ALVO_PCT}%). Considere proteger ou realizar: o movimento principal já veio.\n${extremos}`;
}
async function checarHipoteses(SB: any): Promise<void> {
  if (!HIP_ON || !ALERT_CHAT_IDS.length) return;
  const abertas = await hipLer(SB);
  if (!abertas || !abertas.length) return;
  const precos = await emLotes(abertas, 5, async (h) => precoAoVivo(h.inst).catch(() => null));
  const dest = ALERT_CHAT_IDS.filter((ch) => !silChat(ch));
  const agora = Date.now(), ficam: Hip[] = [];
  let mudou = false;
  for (let i = 0; i < abertas.length; i++) {
    const h = abertas[i], p = precos[i];
    if (p == null || !(p > 0)) { ficam.push(h); continue; }
    const r = hipPasso(h.lado, h.preco, h.atr, p, (agora - h.t) / 60000);
    const mfe = Math.max(h.mfe, r.favor), mae = Math.max(h.mae, r.contra);
    if (mfe !== h.mfe || mae !== h.mae) { h.mfe = mfe; h.mae = mae; mudou = true; }
    if (r.res === "aberta") { ficam.push(h); continue; }
    if (r.res === "expirou" || (r.res === "funcionou" && !HIP_AVISAR_FUNCIONOU)) { mudou = true; continue; } // encerra sem avisar
    if (!dest.length) { ficam.push(h); continue; } // silêncio: mantém e avisa depois
    const msg = hipMsg(h, r.res, p);
    const ids = await Promise.all(dest.map((ch) => enviarAlertaMoeda(SB, ch, `HIP_${h.tipo}_${h.inst}`, cortar(msg), botaoAnalisar(h.inst), HIP_APAGAR_MIN).catch(() => null)));
    if (ids.some(Boolean)) { mudou = true; console.log(`📡 hipótese ${h.tipo} ${h.inst} ${r.res}`); } else ficam.push(h);
  }
  if (mudou) await hipSalvar(SB, ficam);
}
// V74: banda da nota de confiança do alerta (o /radar compara desempenho por banda pra ver se a nota separa os bons dos maus)
type HipBanda = "alta" | "media" | "baixa" | "sem";
const hipBanda = (conf: number | null | undefined): HipBanda => (conf == null || !isFinite(Number(conf)) ? "sem" : Number(conf) >= 7 ? "alta" : Number(conf) >= 5 ? "media" : "baixa");
const HIP_BANDA_TXT: Record<HipBanda, string> = { alta: "confiança ≥ 7", media: "confiança 5–6", baixa: "confiança ≤ 4", sem: "sem nota" };
// V105: corte mínimo de MOVIMENTO (alta efetiva no topo/SHORT, queda efetiva no fundo/LONG): a mesma medida que o gatilho do radar usa (TOPO_ALTA_MIN / FUNDO_QUEDA_MIN),
// recalculada com as velas até o alerta. Mostra, de forma CUMULATIVA, quem passaria com cada corte ("≥ 15%" = todos com 15% ou mais) e lê cada passo (10→15, 15→20...).
const RADAR_CORTES: number[] = String(Deno.env.get("RADAR_CORTES") ?? "10,15,20,25").split(",").map((x: string) => Number(x.trim())).filter((x: number) => isFinite(x) && x > 0).sort((a: number, b: number) => a - b);
type HipCorteItem = { res: HipRes; f: number; a: number; v: number | null };
function hipLeituraCorte(c0: number, c1: number, cort: { res: HipRes }[], fic: { res: HipRes }[]): string {
  const base = `  → subir o corte de ${c0}% pra ${c1}%: `;
  const pc = hipPctFun(cort), pf = hipPctFun(fic);
  if (cort.length < 8 || fic.length < 8 || pc === null || pf === null) return `${base}amostra pequena (sairiam ${cort.length}, ficariam ${fic.length})\n`;
  const dif = Math.round((pf - pc) * 100);
  const txt = Math.abs(dif) < 10
    ? `quase não separa (sairiam ${cort.length}, ficam ${fic.length}; diferença &lt; 10 pontos)`
    : dif > 0
      ? `ajuda: sairiam ${cort.length} alertas (funcionam ${Math.round(pc * 100)}%) e os ${fic.length} que ficam funcionam ${Math.round(pf * 100)}% (+${dif} pontos)`
      : `atrapalha: sairiam ${cort.length} alertas que funcionam MAIS (${Math.round(pc * 100)}%) que os ${fic.length} que ficam (${Math.round(pf * 100)}%)`;
  return `${base}${txt}\n`;
}
function hipLinhasCortes(g: HipCorteItem[], rotMov: string): string {
  const com = g.filter((x) => x.v !== null) as (HipCorteItem & { v: number })[];
  if (com.length < 8 || RADAR_CORTES.length < 2) return "";
  const med = (v: number[]) => { const q = [...v].sort((a, b) => a - b); return q.length ? q[Math.floor(q.length / 2)] : 0; };
  const sgn1 = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(1)}`;
  const linha = (rot: string, x: typeof com): string => {
    if (!x.length) return "";
    const inv = x.filter((i) => i.res === "invalida").length, fun = x.filter((i) => i.res === "funcionou").length;
    return `    ${rot} (n=${x.length}): invalidou ${Math.round((inv / x.length) * 100)}% · funcionou ${Math.round((fun / x.length) * 100)}%${pmTxt(fun, x.length)} · a favor ${sgn1(med(x.map((i) => i.f)))}% · contra ${sgn1(-med(x.map((i) => i.a)))}%${x.length < 8 ? " ⚠️" : ""}\n`;
  };
  let t = `  <i>corte mínimo de ${rotMov} (cumulativo: "≥ X" = quem passaria com esse corte):</i>\n`;
  const abaixo = com.filter((x) => x.v < RADAR_CORTES[0]);
  if (abaixo.length) t += linha(`abaixo de ${RADAR_CORTES[0]}%`, abaixo);
  for (const c of RADAR_CORTES) t += linha(`≥ ${c}%`, com.filter((x) => x.v >= c));
  for (let i = 0; i < RADAR_CORTES.length - 1; i++) {
    const c0 = RADAR_CORTES[i], c1 = RADAR_CORTES[i + 1];
    t += hipLeituraCorte(c0, c1, com.filter((x) => x.v >= c0 && x.v < c1), com.filter((x) => x.v >= c1));
  }
  return t;
}
function hipLinhasBanda(g: { res: HipRes; conf: number | null }[]): string {
  const faixas: HipBanda[] = ["alta", "media", "baixa", "sem"];
  const linhas: string[] = [], pcts: Partial<Record<HipBanda, { n: number; func: number }>> = {};
  for (const b of faixas) {
    const x = g.filter((i) => hipBanda(i.conf) === b);
    if (!x.length) continue;
    const inv = x.filter((i) => i.res === "invalida").length, fun = x.filter((i) => i.res === "funcionou").length;
    pcts[b] = { n: x.length, func: fun / x.length };
    linhas.push(`  ${HIP_BANDA_TXT[b]} (n=${x.length}): invalidou ${Math.round((inv / x.length) * 100)}% · funcionou ${Math.round((fun / x.length) * 100)}%${pmTxt(fun, x.length)}${x.length < 8 ? " ⚠️" : ""}`);
  }
  if (linhas.length < 2 || (linhas.length === 1 && pcts.sem)) return linhas.length ? linhas.join("\n") + "\n" : "";
  const alta = pcts.alta, resto = [pcts.media, pcts.baixa].filter((x): x is { n: number; func: number } => !!x && x.n > 0);
  let leitura = "";
  if (alta && alta.n >= 8 && resto.reduce((t, x) => t + x.n, 0) >= 8) {
    const nResto = resto.reduce((t, x) => t + x.n, 0), fResto = resto.reduce((t, x) => t + x.func * x.n, 0) / nResto, dif = (alta.func - fResto) * 100;
    leitura = Math.abs(dif) < 10 ? "  → a nota quase não separa (diferença < 10 pontos)\n" : dif > 0 ? `  → a nota ajuda: ≥ 7 funciona ${Math.round(dif)} pontos mais que as demais\n` : `  → a nota NÃO ajuda: ≥ 7 funciona ${Math.round(-dif)} pontos MENOS que as demais\n`;
  } else leitura = "  → amostra pequena pra concluir se a nota separa\n";
  return linhas.join("\n") + "\n" + leitura;
}
// V76: fatias do /radar - separa os alertas por NOTA exata, por "esticada" (quanto o preco ja andou em 24h no sentido que o radar quer REVERTER) e por ADX antes do alerta.
// "funciona X pontos mais/menos" compara so os alertas que DECIDIRAM (funcionou ou invalidou), pra os "sem desfecho" nao enviesarem.
type HipFatiaItem = { res: HipRes; conf: number | null; ext: number | null; adx: number | null };
const hipPctFun = (x: { res: HipRes }[]): number | null => {
  const f = x.filter((i) => i.res === "funcionou").length, v = x.filter((i) => i.res === "invalida").length;
  return f + v > 0 ? f / (f + v) : null;
};
function hipLinhaFatia(rotulo: string, x: { res: HipRes }[]): string {
  if (!x.length) return "";
  const inv = x.filter((i) => i.res === "invalida").length, fun = x.filter((i) => i.res === "funcionou").length;
  return `  ${rotulo} (n=${x.length}): invalidou ${Math.round((inv / x.length) * 100)}% · funcionou ${Math.round((fun / x.length) * 100)}%${pmTxt(fun, x.length)}${x.length < 8 ? " ⚠️" : ""}\n`;
}
function hipLeituraFatia(nome: string, a: { res: HipRes }[], b: { res: HipRes }[]): string {
  const pa = hipPctFun(a), pb = hipPctFun(b);
  if (a.length < 8 || b.length < 8 || pa === null || pb === null) return "";
  const dif = (pa - pb) * 100;
  return Math.abs(dif) < 10 ? `  → ${nome}: quase nao separa (&lt; 10 pontos)\n` : dif > 0 ? `  → ${nome}: funciona ${Math.round(dif)} pontos MAIS que o resto\n` : `  → ${nome}: funciona ${Math.round(-dif)} pontos MENOS que o resto\n`;
}
function hipLinhasFatias(g: HipFatiaItem[]): string {
  let t = "";
  const notas = [...new Set(g.map((x) => x.conf).filter((c): c is number => c !== null))].sort((a, b) => a - b);
  if (notas.length > 1) for (const n of notas) t += hipLinhaFatia(`nota ${n}`, g.filter((x) => x.conf === n));
  const ext = g.filter((x) => x.ext !== null);
  if (ext.length >= 8) {
    const f1 = ext.filter((x) => (x.ext as number) < 5), f2 = ext.filter((x) => (x.ext as number) >= 5 && (x.ext as number) < 15), f3 = ext.filter((x) => (x.ext as number) >= 15);
    t += `  <i>quanto ja andou em 24h no sentido que o radar quer reverter:</i>\n` + hipLinhaFatia("menos de 5%", f1) + hipLinhaFatia("5% a 15%", f2) + hipLinhaFatia("15% ou mais", f3);
    t += hipLeituraFatia("moeda ja esticada (15% ou mais)", f3, [...f1, ...f2]);
  }
  const ax = g.filter((x) => x.adx !== null);
  if (ax.length >= 8) {
    const a1 = ax.filter((x) => (x.adx as number) < 20), a2 = ax.filter((x) => (x.adx as number) >= 20 && (x.adx as number) < 30), a3 = ax.filter((x) => (x.adx as number) >= 30);
    t += `  <i>ADX antes do alerta:</i>\n` + hipLinhaFatia("ADX menor que 20", a1) + hipLinhaFatia("ADX 20 a 30", a2) + hipLinhaFatia("ADX 30 ou mais", a3);
    t += hipLeituraFatia("ADX 30 ou mais", a3, [...a1, ...a2]);
  }
  return t;
}
// ===== V77: /radar simula "operar só no ROMPIMENTO da vela do alerta" =====
// Regra A (a que o usuário descreveu): topo (short) só entra quando uma vela seguinte ROMPE A MÍNIMA da vela do alerta; fundo (long) só quando ROMPE A MÁXIMA.
// Stop no extremo OPOSTO da vela do alerta (topo: máxima; fundo: mínima). Se o stop for tocado ANTES do rompimento, a ideia é cancelada (não entra).
// Regra B (contrária, só pra comparar): topo entra COMPRADO rompendo a máxima, fundo entra VENDIDO rompendo a mínima (seguir o movimento).
// Linha "direto": entra no preço do alerta com o mesmo stop (extremo oposto da vela do alerta), sem esperar rompimento.
// Entrada só a partir da vela SEGUINTE à do alerta (a vela do alerta ainda estava aberta). Se a vela do rompimento também tocar o stop, conta stop (pior caso).
// Alvo = RADAR_ALVO_R × risco (padrão 2R); espera máx. RADAR_ENTRADA_VELAS velas (padrão 8) pelo rompimento; depois de entrar, prazo = HIP_HORAS.
const RUP_ESPERA = numEnv("RADAR_ENTRADA_VELAS", "8");
const RUP_ALVO_R = numEnv("RADAR_ALVO_R", "2");
type RupRes = "alvo" | "stop" | "tempo" | "aberta" | "naoentrou" | "cancelou" | "semdados";
type RupSim = { res: RupRes; r: number; pct: number; esperou: number; barras: number };
const RUP_VAZIO: RupSim = { res: "semdados", r: 0, pct: 0, esperou: 0, barras: 0 };
function rupCorrer(d: { h: number[]; l: number[]; c: number[] }, kIni: number, ladoOp: HipLado, entrada: number, stop: number, alvoR: number, maxBarras: number): { res: RupRes; r: number; pct: number; barras: number } {
  const risco = Math.abs(entrada - stop);
  if (!(risco > 0) || !(entrada > 0)) return { res: "semdados", r: 0, pct: 0, barras: 0 };
  const short = ladoOp === "short", alvo = short ? entrada - alvoR * risco : entrada + alvoR * risco;
  for (let k = kIni; k < d.h.length; k++) {
    const n = k - kIni + 1;
    if (short ? d.h[k] >= stop : d.l[k] <= stop) return { res: "stop", r: -1, pct: (-risco / entrada) * 100, barras: n }; // stop antes do alvo na mesma vela (pior caso)
    if (short ? d.l[k] <= alvo : d.h[k] >= alvo) return { res: "alvo", r: alvoR, pct: ((alvoR * risco) / entrada) * 100, barras: n };
    if (n >= maxBarras) { const pnl = short ? entrada - d.c[k] : d.c[k] - entrada; return { res: "tempo", r: pnl / risco, pct: (pnl / entrada) * 100, barras: n }; }
  }
  return { res: "aberta", r: 0, pct: 0, barras: d.h.length - kIni };
}
function rupRompimento(d: { o: number[]; h: number[]; l: number[]; c: number[] }, k0: number, ladoOp: HipLado, espera: number, alvoR: number, maxBarras: number): RupSim {
  const hi = d.h[k0], lo = d.l[k0];
  if (!(hi > lo)) return RUP_VAZIO;
  const short = ladoOp === "short", nivel = short ? lo : hi, stop = short ? hi : lo;
  const ate = Math.min(k0 + espera, d.h.length - 1);
  for (let k = k0 + 1; k <= ate; k++) {
    const gatilho = short ? d.l[k] < nivel : d.h[k] > nivel;
    const stopTocou = short ? d.h[k] >= stop : d.l[k] <= stop;
    if (gatilho) {
      const entrada = short ? Math.min(nivel, d.o[k]) : Math.max(nivel, d.o[k]); // abriu além do nível: entra na abertura
      const risco = Math.abs(entrada - stop);
      if (!(risco > 0)) return RUP_VAZIO;
      if (stopTocou) return { res: "stop", r: -1, pct: (-risco / entrada) * 100, esperou: k - k0, barras: 1 };
      const r = rupCorrer(d, k + 1, ladoOp, entrada, stop, alvoR, maxBarras);
      return { ...r, esperou: k - k0 };
    }
    if (stopTocou) return { res: "cancelou", r: 0, pct: 0, esperou: k - k0, barras: 0 };
  }
  return { res: k0 + espera > d.h.length - 1 ? "aberta" : "naoentrou", r: 0, pct: 0, esperou: espera, barras: 0 };
}
function rupDireto(d: { h: number[]; l: number[]; c: number[] }, k0: number, ladoOp: HipLado, preco0: number, alvoR: number, maxBarras: number): RupSim {
  const stop = ladoOp === "short" ? d.h[k0] : d.l[k0];
  const r = rupCorrer(d, k0 + 1, ladoOp, preco0, stop, alvoR, maxBarras);
  return { ...r, esperou: 0 };
}
// V77: VIRADA. As duas ordens ficam armadas nas pontas da vela do alerta: vale o 1º rompimento (mínima = short, máxima = long). Se o stop (a ponta oposta) vier, VIRA: entra no sentido contrário
// naquela ponta, com stop na ponta de onde saiu, até RADAR_VIRADA_PERNAS pernas (padrão 3). Sai no alvo (RADAR_ALVO_R × risco), no prazo HIP_HORAS (contado da 1ª entrada) ou na última perna.
// O resultado do alerta é a SOMA das pernas (em R e em % de preço). Rompendo as duas pontas na mesma vela, conta a 1ª perna como stop (pior caso) e a virada começa na vela seguinte.
const RUP_PERNAS = Math.max(1, Math.round(numEnv("RADAR_VIRADA_PERNAS", "3")));
type VirSim = { res: "ok" | "aberta" | "naoentrou" | "semdados"; r: number; pct: number; pernas: number; fim: RupRes; esperou: number };
function rupVirada(d: { o: number[]; h: number[]; l: number[]; c: number[] }, k0: number, espera: number, alvoR: number, maxBarras: number, maxPernas: number): VirSim {
  const hi = d.h[k0], lo = d.l[k0];
  const vaz = (res: VirSim["res"]): VirSim => ({ res, r: 0, pct: 0, pernas: 0, fim: "semdados", esperou: 0 });
  if (!(hi > lo)) return vaz("semdados");
  const ate = Math.min(k0 + espera, d.h.length - 1);
  let k1 = -1;
  for (let k = k0 + 1; k <= ate; k++) if (d.l[k] < lo || d.h[k] > hi) { k1 = k; break; }
  if (k1 < 0) return vaz(k0 + espera > d.h.length - 1 ? "aberta" : "naoentrou");
  const desce = d.l[k1] < lo, sobe = d.h[k1] > hi;
  let side: HipLado = desce && sobe ? (Math.abs(d.o[k1] - lo) <= Math.abs(d.o[k1] - hi) ? "short" : "long") : desce ? "short" : "long";
  const nivelEntrada = (sd: HipLado) => (sd === "short" ? lo : hi), nivelStop = (sd: HipLado) => (sd === "short" ? hi : lo);
  const prazoFim = k1 + maxBarras;
  let totR = 0, totPct = 0, pernas = 0, kIni = k1 + 1, fim: RupRes = "tempo";
  // 1ª perna (pode abrir com gap além do nível)
  let entrada = side === "short" ? Math.min(lo, d.o[k1]) : Math.max(hi, d.o[k1]);
  let stop = nivelStop(side);
  let r: { res: RupRes; r: number; pct: number; barras: number };
  const toqueNaMesma = desce && sobe;
  if (toqueNaMesma) { const risco = Math.abs(entrada - stop); r = risco > 0 ? { res: "stop", r: -1, pct: (-risco / entrada) * 100, barras: 1 } : { res: "semdados", r: 0, pct: 0, barras: 0 }; }
  else r = rupCorrer(d, kIni, side, entrada, stop, alvoR, Math.max(1, prazoFim - kIni + 1));
  for (;;) {
    if (r.res === "semdados") return vaz("semdados");
    pernas++; totR += r.r; totPct += r.pct;
    if (r.res === "aberta") return { res: "aberta", r: 0, pct: 0, pernas, fim: "aberta", esperou: k1 - k0 };
    fim = r.res;
    if (r.res !== "stop" || pernas >= maxPernas) break;
    const kProx = pernas === 1 && toqueNaMesma ? kIni : kIni + r.barras; // 1ª perna da mesma vela: a virada já começa na vela seguinte (kIni)
    if (kProx > prazoFim) break; // acabou o prazo
    side = side === "short" ? "long" : "short";
    entrada = nivelEntrada(side); stop = nivelStop(side); kIni = kProx;
    r = rupCorrer(d, kIni, side, entrada, stop, alvoR, Math.max(1, prazoFim - kIni + 1));
  }
  return { res: "ok", r: totR, pct: totPct, pernas, fim, esperou: k1 - k0 };
}
function virLinha(x: VirSim[], pernas: number = RUP_PERNAS): string {
  const ok = x.filter((i) => i.res !== "semdados");
  if (!ok.length) return "";
  const dec = ok.filter((i) => i.res === "ok");
  const c = (r: VirSim["res"]) => ok.filter((i) => i.res === r).length;
  const sg = (v: number, nd = 2) => `${v >= 0 ? "+" : ""}${v.toFixed(nd)}`;
  let t = `  <b>Virada (entra no 1º rompimento; se o stop vier, vira pro outro lado · até ${pernas} ${pernas === 1 ? "perna" : "pernas"})</b>\n`;
  t += `    entrou ${dec.length + c("aberta")} de ${ok.length} · não rompeu em ${RUP_ESPERA} velas ${c("naoentrou")}${c("aberta") ? ` · em aberto ${c("aberta")}` : ""}\n`;
  if (!dec.length) return t + `    sem operação concluída ainda\n`;
  const a = dec.filter((i) => i.fim === "alvo").length, te = dec.filter((i) => i.fim === "tempo").length, st = dec.filter((i) => i.fim === "stop").length;
  const virou = dec.filter((i) => i.pernas > 1).length, perna1 = dec.filter((i) => i.pernas === 1), perna23 = dec.filter((i) => i.pernas > 1);
  const med = (v: VirSim[]) => (v.length ? v.reduce((u, i) => u + i.r, 0) / v.length : 0);
  const rs = dec.map((i) => i.r), mediaR = rs.reduce((u, v) => u + v, 0) / rs.length, mediaP = dec.reduce((u, i) => u + i.pct, 0) / dec.length;
  const semMelhor = rs.length > 1 ? (rs.reduce((u, v) => u + v, 0) - Math.max(...rs)) / (rs.length - 1) : null;
  t += `    ${dec.length} concluídas: terminou em alvo ${a} · prazo ${te} · stop na última perna ${st} · virou em ${virou} (${Math.round((virou / dec.length) * 100)}%)\n`;
  t += `    sem virar (n=${perna1.length}): média ${sg(med(perna1))}R · com virada (n=${perna23.length}): média ${sg(med(perna23))}R\n`;
  t += `    média ${sg(mediaR)}R (${sg(mediaP, 1)}% de preço)${semMelhor !== null ? ` · sem a melhor ${sg(semMelhor)}R` : ""}${dec.length < 15 ? " ⚠️ amostra pequena" : ""}\n`;
  return t;
}
// V77: a linha da virada quebrada por ADX antes do alerta (< 30 contra >= 30), pra ver se o ganho some quando a tendência já está forte
function virFatiaAdx(g: { v: VirSim; adx: number | null }[]): string {
  const dec = g.filter((i) => i.v.res === "ok" && i.adx !== null);
  if (dec.length < 8) return "";
  const sg = (v: number, nd = 2) => `${v >= 0 ? "+" : ""}${v.toFixed(nd)}`;
  const linha = (rotulo: string, x: typeof dec): string => {
    if (!x.length) return "";
    const mR = x.reduce((u, i) => u + i.v.r, 0) / x.length, mP = x.reduce((u, i) => u + i.v.pct, 0) / x.length;
    const alvo = x.filter((i) => i.v.fim === "alvo").length, virou = x.filter((i) => i.v.pernas > 1).length;
    return `    ${rotulo} (n=${x.length}): média ${sg(mR)}R (${sg(mP, 1)}% de preço) · terminou em alvo ${Math.round((alvo / x.length) * 100)}% · virou ${Math.round((virou / x.length) * 100)}%${x.length < 8 ? " ⚠️" : ""}\n`;
  };
  return `    <i>virada por ADX antes do alerta:</i>\n` + linha("ADX menor que 30", dec.filter((i) => (i.adx as number) < 30)) + linha("ADX 30 ou mais", dec.filter((i) => (i.adx as number) >= 30));
}
function rupLinha(nome: string, x: RupSim[], comEspera: boolean): string {
  const ok = x.filter((i) => i.res !== "semdados");
  if (!ok.length) return "";
  const dec = ok.filter((i) => i.res === "alvo" || i.res === "stop" || i.res === "tempo");
  const c = (r: RupRes) => ok.filter((i) => i.res === r).length;
  const ent = dec.length + c("aberta");
  const sg = (v: number, nd = 2) => `${v >= 0 ? "+" : ""}${v.toFixed(nd)}`;
  let t = `  <b>${nome}</b>\n`;
  if (comEspera) {
    t += `    entrou ${ent} de ${ok.length} (${Math.round((ent / ok.length) * 100)}%) · stop antes de romper ${c("cancelou")} · não rompeu em ${RUP_ESPERA} velas ${c("naoentrou")}${c("aberta") ? ` · ainda esperando/aberta ${c("aberta")}` : ""}\n`;
    const esp = dec.length ? _med(dec.map((i) => i.esperou)) : null;
    if (esp !== null) t += `    rompeu em ~${esp} vela(s) depois do alerta (mediana)\n`;
  }
  if (!dec.length) return t + `    sem operação concluída ainda\n`;
  const a = c("alvo"), st = c("stop"), te = c("tempo");
  const rs = dec.map((i) => i.r), mediaR = rs.reduce((u, v) => u + v, 0) / rs.length, mediaP = dec.map((i) => i.pct).reduce((u, v) => u + v, 0) / dec.length;
  const semMelhor = rs.length > 1 ? (rs.reduce((u, v) => u + v, 0) - Math.max(...rs)) / (rs.length - 1) : null;
  t += `    ${dec.length} concluídas: alvo ${a} (${Math.round((a / dec.length) * 100)}%) · stop ${st} (${Math.round((st / dec.length) * 100)}%) · tempo ${te}\n`;
  t += `    média ${sg(mediaR)}R (${sg(mediaP, 1)}% de preço)${semMelhor !== null ? ` · sem a melhor ${sg(semMelhor)}R` : ""}${dec.length < 15 ? " ⚠️ amostra pequena" : ""}\n`;
  return t;
}
// /radar [dias] — com os alertas de radar JÁ enviados (alertas_log) e as velas seguintes, o que aconteceu depois de cada tipo
async function runRadarStats(chatId: number | string, dias: number, opt?: { pernas?: number; alvo?: number; fonte?: "faca" | "foguete" }) {
  const alvoR = opt?.alvo && opt.alvo > 0 ? opt.alvo : RUP_ALVO_R, pernasMax = opt?.pernas && opt.pernas >= 1 ? Math.round(opt.pernas) : RUP_PERNAS; // V77: /radar [dias] pernasX alvoX
  const SB = getSupabase();
  if (!SB) { await sendTelegram(chatId, "⚠️ Supabase não configurado."); return; }
  const dd = Math.min(9, Math.max(1, Math.round(dias || 7)));
  const desde = new Date(Date.now() - dd * 86400000).toISOString();
  let rows: any[] = [];
  if (opt?.fonte === "faca") { // V98: os candidatos do modo faca vêm da linha própria (_FACA_SOMBRA_), não do log do placar
    const lista = await facaLer(SB);
    if (!lista) { await sendTelegram(chatId, "⚠️ Não consegui ler o modo faca no Supabase."); return; }
    const corteMs = Date.now() - dd * 86400000;
    rows = lista.filter((r) => r.t > corteMs && Number(r.p) > 0 && desdeOk(desdeDoChat(chatId), r.t, r.v)).map((r) => ({ instid: r.i, lado: "short", tipo: "faca", status: "🔪 FACA", preco: r.p, criado_em: new Date(r.t).toISOString(), conf: r.c, efe: r.q }));
  } else if (opt?.fonte === "foguete") { // V107: espelho da faca (linha própria _FOGUETE_SOMBRA_), LONG de continuação
    const lista = await fogueteLer(SB);
    if (!lista) { await sendTelegram(chatId, "⚠️ Não consegui ler o modo foguete no Supabase."); return; }
    const corteMs = Date.now() - dd * 86400000;
    rows = lista.filter((r) => r.t > corteMs && Number(r.p) > 0 && desdeOk(desdeDoChat(chatId), r.t, r.v)).map((r) => ({ instid: r.i, lado: "long", tipo: "foguete", status: "🚀 FOGUETE", preco: r.p, criado_em: new Date(r.t).toISOString(), conf: r.c, efe: r.q }));
  } else {
    const busca = (cols: string) => SB.from(PLACAR_TABELA).select(cols).gt("criado_em", desde).in("tipo", ["topo", "fundo"]).order("criado_em", { ascending: false }).limit(500);
    let { data, error } = await busca("instid, lado, tipo, status, preco, criado_em, conf, versao"); // V107: versao pro filtro "desde"
    if (error && /versao/i.test(String(error.message || ""))) ({ data, error } = await busca("instid, lado, tipo, status, preco, criado_em, conf"));
    if (error && /conf/i.test(String(error.message || ""))) ({ data, error } = await busca("instid, lado, tipo, status, preco, criado_em")); // coluna conf ausente: segue sem a quebra por nota
    if (error) { await sendTelegram(chatId, `⚠️ Não consegui ler os alertas de radar: ${String(error.message || error).slice(0, 120)}`); return; }
    rows = aplicarDesde(chatId, ((data || []) as any[]).filter((r) => Number(r.preco) > 0 && r.criado_em)); // V107
  }
  if (!rows.length && opt?.fonte === "foguete") { await sendTelegram(chatId, `🚀 <b>MODO FOGUETE</b> (${FOGUETE_MODO})\n\nNenhum candidato gravado nos últimos ${dd} dia(s). Topo com ADX ≥ ${FOGUETE_ADX_MIN} e nota de topo ≥ ${FOGUETE_GRAVA_MIN}/10 vira candidato LONG de continuação, gravado em silêncio a cada rodada do cron (começa a partir do deploy da V107).`); return; }
  if (!rows.length) { await sendTelegram(chatId, opt?.fonte === "faca" ? `🔪 <b>MODO FACA</b> (${FACA_MODO})\n\nNenhum candidato gravado nos últimos ${dd} dia(s). Modo atual: ${FACA_MODO} · ADX ≥ ${FACA_ADX_MIN} · grava nota ≥ ${FACA_GRAVA_MIN}/10 · avisa nota ≥ ${FACA_CONF_MIN}/10. Ele grava sozinho a cada rodada do cron.` : `📡 <b>RADARES</b>\n\nNenhum alerta de topo ou fundo nos últimos ${dd} dia(s).`); return; }
  const porMoeda = new Map<string, any[]>();
  for (const r of rows) { const a = porMoeda.get(r.instid) || []; a.push(r); porMoeda.set(r.instid, a); }
  const TFMS = TF_MIN * 60000;
  type Item = { tipo: HipTipo; inst: string; lado: HipLado; emMs: number; preco: number; res: HipRes; barras: number; mfe: number; mae: number; conf: number | null; ext: number | null; efe: number | null; adx: number | null; rA: RupSim; rB: RupSim; rD: RupSim; rV: VirSim; btc: RegimeBtc | null };
  const itens: Item[] = [];
  const regimeBtc = await btcRegimeFn(); // V107: humor do BTC na hora de cada alerta
  await emLotes([...porMoeda.keys()], 5, async (id) => {
    const d = await xCandles(id, TIMEFRAME, SAIDA_CANDLES).catch(() => null);
    if (!d) return;
    const adxS = xAdxSerie(d.h, d.l, d.c, 14); // V76: ADX por vela, lido na vela ANTERIOR ao alerta (sem olhar o futuro)
    for (const r of porMoeda.get(id)!) {
      const emMs = new Date(r.criado_em).getTime();
      let k0 = -1;
      for (let i = d.t.length - 1; i >= 0; i--) { if (d.t[i] <= emMs && emMs < d.t[i] + TFMS) { k0 = i; break; } }
      if (k0 < 20) continue;
      const preco0 = Number(r.preco), atr = calcATR(d.h.slice(0, k0 + 1), d.l.slice(0, k0 + 1), d.c.slice(0, k0 + 1), 14);
      const tipo: HipTipo = r.tipo === "faca" ? "faca" : r.tipo === "foguete" ? "foguete" : String(r.status).includes("REPIQUE") ? "repique" : r.tipo === "fundo" ? "fundo" : "topo";
      const lado: HipLado = r.lado === "long" ? "long" : "short";
      const k24 = k0 - Math.round(1440 / TF_MIN), c24 = k24 >= 0 ? d.c[k24] : 0, mov24 = c24 > 0 ? (preco0 / c24 - 1) * 100 : null; // V76: variacao de 24h ate o alerta
      const ext = mov24 === null ? null : tipo === "faca" ? -mov24 : tipo === "foguete" ? mov24 : lado === "short" ? mov24 : -mov24; // faca: quanto a moeda já CAIU (positivo) // positivo = ja andou NO sentido que o radar quer reverter (topo: subiu; fundo: caiu)
      // V105: movimento EFETIVO (o do gatilho do radar): SHORT = max(alta 24h, alta desde a mínima recente); LONG = max(queda 24h, queda desde a máxima recente). Recalculado com as velas até o alerta.
      const jn = Math.max(0, k0 + 1 - FUNDO_JAN_PICO);
      const efeRetro = mov24 === null ? null : lado === "short" ? Math.max(mov24, altaDoVale(d.l.slice(jn, k0 + 1), preco0), 0) : Math.max(-mov24, ddDoPico(d.h.slice(jn, k0 + 1), preco0), 0);
      const efeV = tipo === "faca" || tipo === "foguete" ? (r.efe == null ? null : Number(r.efe)) : efeRetro; // faca: a queda efetiva já vem gravada
      const efe = efeV === null || !isFinite(efeV) ? null : Math.round(efeV * 10) / 10;
      const adxA = adxNaVela(adxS, k0 - 1), adxAlerta = Number.isFinite(adxA) ? adxA : null; // V109: alinhado à vela (antes lia 27 velas à frente)
      const opostoLado: HipLado = lado === "long" ? "short" : "long", maxB = Math.max(1, Math.round((HIP_HORAS * 60) / TF_MIN)); // V77: simulação do rompimento da vela do alerta
      itens.push({ tipo, inst: id, lado, emMs, preco: preco0, conf: r.conf == null ? null : Number(r.conf), ext, efe, adx: adxAlerta, ...hipAvaliar(d, k0, lado, preco0, isFinite(atr) ? atr : 0, TF_MIN),
        rA: rupRompimento(d, k0, lado, RUP_ESPERA, alvoR, maxB), rB: rupRompimento(d, k0, opostoLado, RUP_ESPERA, alvoR, maxB), rD: rupDireto(d, k0, lado, preco0, alvoR, maxB), rV: rupVirada(d, k0, RUP_ESPERA, alvoR, maxB, pernasMax), btc: regimeBtc(emMs) });
    }
  });
  const fm = (ms: number) => { const iso = new Date(ms + X_TZ_OFFSET_H * 3600000).toISOString(); return `${iso.slice(8, 10)}/${iso.slice(5, 7)} ${iso.slice(11, 16)}`; };
  const sg = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(1)}`;
  let m = `${opt?.fonte === "foguete" ? `🚀 <b>MODO FOGUETE (${FOGUETE_MODO}) — o que aconteceu depois do candidato</b> · LONG de continuação em topo com ADX ≥ ${FOGUETE_ADX_MIN}` : opt?.fonte === "faca" ? `🔪 <b>MODO FACA (${FACA_MODO}) — o que aconteceu depois do candidato</b> · SHORT de continuação em fundo com ADX ≥ ${FACA_ADX_MIN}` : "📡 <b>RADARES — o que aconteceu depois do alerta</b>"} · ${dd} dia(s)${opt?.pernas || opt?.alvo ? ` · 🚪 teste: ${pernasMax} ${pernasMax === 1 ? "perna" : "pernas"} · alvo ${alvoR}R` : ""}\n${DIVISOR}\n<i>Invalidado = o preço andou ≥ max(${HIP_INV_ATR} ATR, ${HIP_INV_PCT}%) contra a ideia · funcionou = o mesmo a favor · prazo ${HIP_HORAS}h. Se os dois cabem na mesma vela, conta invalidado (pior caso).</i>\n\n`;
  for (const tipo of (opt?.fonte === "faca" ? ["faca"] : opt?.fonte === "foguete" ? ["foguete"] : ["topo", "fundo", "repique"]) as HipTipo[]) {
    const g = itens.filter((x) => x.tipo === tipo);
    if (!g.length) continue;
    const c = (r: HipRes) => g.filter((x) => x.res === r).length, pc = (n: number) => `${Math.round((n / g.length) * 100)}%`;
    const inval = g.filter((x) => x.res === "invalida");
    m += `${tipo === "topo" ? "🔴" : tipo === "fundo" ? "🟢" : tipo === "faca" ? "🔪" : tipo === "foguete" ? "🚀" : "⭐"} <b>${HIP_NOME[tipo][0].toUpperCase()}${HIP_NOME[tipo].slice(1)}</b> (n=${g.length})\n`;
    m += `invalidou ${c("invalida")} (${pc(c("invalida"))}) · funcionou ${c("funcionou")} (${pc(c("funcionou"))}${pmTxt(c("funcionou"), g.length)}) · sem desfecho ${c("expirou") + c("aberta")}\n`;
    m += `a favor mediano ${sg(_med(g.map((x) => x.mfe)))}% · contra mediano ${sg(-_med(g.map((x) => x.mae)))}%${inval.length ? ` · invalida em ~${(_med(inval.map((x) => x.barras)) * TF_MIN / 60).toFixed(1)}h` : ""}\n`;
    m += hipLinhasFatias(g); // V76: por nota exata, esticada em 24h e ADX
    { // V107: humor do BTC na hora do alerta (o radar depende do regime de mercado?)
      const com = g.filter((x) => x.btc !== null);
      if (com.length >= 8) {
        m += `  <i>humor do BTC nas 24h antes do alerta:</i>\n`;
        for (const rg of ["sobe", "cai", "lado"] as RegimeBtc[]) m += hipLinhaFatia(REGIME_TXT[rg], com.filter((x) => x.btc === rg));
        m += hipLeituraFatia("com o BTC subindo", com.filter((x) => x.btc === "sobe"), com.filter((x) => x.btc !== "sobe"));
        m += hipLeituraFatia("com o BTC caindo", com.filter((x) => x.btc === "cai"), com.filter((x) => x.btc !== "cai"));
      }
    }
    m += hipLinhasCortes(g.map((x) => ({ res: x.res, f: x.mfe, a: x.mae, v: x.efe })), tipo === "topo" ? "alta efetiva" : tipo === "fundo" || tipo === "faca" ? "queda efetiva" : tipo === "foguete" ? "alta efetiva" : "movimento efetivo (alta p/ SHORT, queda p/ LONG)"); // V105
    m += hipLinhasBanda(g); // V74: por nota de confiança do alerta
    { // V77: operar só no rompimento da vela do alerta
      const regraA = tipo === "foguete" ? "foguete (LONG, a alta continua) só entra rompendo a MÁXIMA da vela do alerta" : tipo === "faca" ? "faca (SHORT, a queda continua) só entra rompendo a MÍNIMA da vela do alerta" : tipo === "fundo" ? "fundo (LONG) só entra rompendo a MÁXIMA da vela do alerta" : "topo (SHORT) só entra rompendo a MÍNIMA da vela do alerta";
      const regraB = tipo === "foguete" ? "contrária: entra VENDIDO rompendo a mínima (o SHORT que o topo clássico apostaria)" : tipo === "faca" ? "contrária: entra COMPRADO rompendo a máxima (a reversão que o fundo clássico apostaria)" : tipo === "fundo" ? "contrária: fundo entra VENDIDO rompendo a mínima" : "contrária: topo entra COMPRADO rompendo a máxima";
      m += `\n🚪 <b>Só no rompimento da vela do alerta</b> (stop no extremo oposto · alvo ${alvoR}R · espera até ${RUP_ESPERA} velas)\n`;
      m += rupLinha(`A) ${regraA}`, g.map((x) => x.rA), true);
      m += rupLinha(`B) ${regraB}`, g.map((x) => x.rB), true);
      m += virLinha(g.map((x) => x.rV), pernasMax);
      m += virFatiaAdx(g.map((x) => ({ v: x.rV, adx: x.adx })));
      m += rupLinha("Direto no alerta (mesmo stop, sem esperar rompimento)", g.map((x) => x.rD), false);
    }
    if (g.length < 15) m += `<i>amostra pequena (n&lt;15)</i>\n`;
    m += "\n";
  }
  const piores = itens.filter((x) => x.res === "invalida").sort((a, b) => b.mae - a.mae).slice(0, 5);
  if (piores.length) m += `<b>Maiores invalidações</b>\n` + piores.map((x) => `${x.inst.replace("-USDT", "")} ${HIP_NOME[x.tipo]} ${fm(x.emMs)} → ${x.mae.toFixed(1)}% contra em ${(x.barras * TF_MIN / 60).toFixed(1)}h`).join("\n") + "\n\n";
  m += `<i>🚪 R = distância da entrada até o stop; alvo/stop na mesma vela conta stop (pior caso). "Direto" usa a máxima/mínima final da vela do alerta como stop, então o risco dele tem outra base: compare pela média em % de preço também. Virada: o resultado é a soma de todas as pernas. Teste sem mexer nos secrets: /radar 9 pernas2 alvo3. Padrões: RADAR_ENTRADA_VELAS (8), RADAR_ALVO_R (2), RADAR_VIRADA_PERNAS (3).</i>\n\n` + `<i>Corte mínimo = alta efetiva (SHORT: maior entre a alta em 24h e a alta desde a mínima recente) ou queda efetiva (LONG), a mesma do gatilho do radar, recalculada com as velas; cumulativo, pra comparar TOPO_ALTA_MIN/FUNDO_QUEDA_MIN em 10/15/20/25 (RADAR_CORTES). Esticada = variacao do preco em 24h ate o alerta; ADX medido na vela anterior ao alerta. Só alertas com vela e ATR disponíveis (até 9 dias). Aviso ao vivo: HIP_ON (1), limites HIP_INV_ATR/HIP_INV_PCT/HIP_ALVO_ATR/HIP_ALVO_PCT, prazo HIP_HORAS.</i>`;
  for (const parte of dividirHtml(m)) await sendTelegram(chatId, parte);
}
// ===== V78: histórico do /radar guardado no Supabase (não depende mais da janela de 9 dias das velas) =====
// Todo dia, na virada do painel (21h), e também com /radarhist gravar, cada alerta de topo/fundo/repique dos últimos 9 dias é reavaliado
// com as velas e GRAVADO de forma compacta na linha _RADAR_HIST_ (mesma tabela alertas_indicador, sem coluna nova). Alerta já gravado é
// atualizado (o desfecho de um alerta recente ainda pode mudar); alerta mais velho que RADARH_DIAS dias sai. /radarhist [dias] lê tudo e
// mostra o desempenho por tipo, por esticada em 24h (inclui a faixa ≥ 25%) e por ADX, acumulando semanas.
const RADARH_ROW = "_RADAR_HIST_";
const RADARH_DIAS = numEnv("RADARH_DIAS", "60");
const RADARH_MAX = 1500;
type RadarReg = { i: string; t: number; k: HipTipo; r: HipRes; f: number; a: number; c: number | null; e: number | null; x: number | null; m?: number | null }; // V105: m = alta/queda efetiva (movimento do gatilho) recalculada com as velas
async function radarColetarReg(SB: any, dd: number): Promise<RadarReg[] | null> {
  const desde = new Date(Date.now() - dd * 86400000).toISOString();
  const busca = (cols: string) => SB.from(PLACAR_TABELA).select(cols).gt("criado_em", desde).in("tipo", ["topo", "fundo"]).order("criado_em", { ascending: false }).limit(500);
  let { data, error } = await busca("instid, lado, tipo, status, preco, criado_em, conf");
  if (error && /conf/i.test(String(error.message || ""))) ({ data, error } = await busca("instid, lado, tipo, status, preco, criado_em"));
  if (error) { console.log("⚠️ radarhist: leitura dos alertas falhou", error.message ?? error); return null; }
  const rows = ((data || []) as any[]).filter((r) => Number(r.preco) > 0 && r.criado_em);
  const porMoeda = new Map<string, any[]>();
  for (const r of rows) { const a = porMoeda.get(r.instid) || []; a.push(r); porMoeda.set(r.instid, a); }
  const TFMS = TF_MIN * 60000, out: RadarReg[] = [];
  await emLotes([...porMoeda.keys()], 5, async (id) => {
    const d = await xCandles(id, TIMEFRAME, SAIDA_CANDLES).catch(() => null);
    if (!d) return;
    const adxS = xAdxSerie(d.h, d.l, d.c, 14);
    for (const r of porMoeda.get(id)!) {
      const emMs = new Date(r.criado_em).getTime();
      let k0 = -1;
      for (let i = d.t.length - 1; i >= 0; i--) { if (d.t[i] <= emMs && emMs < d.t[i] + TFMS) { k0 = i; break; } }
      if (k0 < 20) continue;
      const preco0 = Number(r.preco), atr = calcATR(d.h.slice(0, k0 + 1), d.l.slice(0, k0 + 1), d.c.slice(0, k0 + 1), 14);
      const tipo: HipTipo = String(r.status).includes("REPIQUE") ? "repique" : r.tipo === "fundo" ? "fundo" : "topo";
      const lado: HipLado = r.lado === "long" ? "long" : "short";
      const k24 = k0 - Math.round(1440 / TF_MIN), c24 = k24 >= 0 ? d.c[k24] : 0, mov24 = c24 > 0 ? (preco0 / c24 - 1) * 100 : null;
      const ext = mov24 === null ? null : lado === "short" ? mov24 : -mov24;
      const jn = Math.max(0, k0 + 1 - FUNDO_JAN_PICO); // V105: movimento efetivo (alta desde a mínima / queda desde a máxima recente), como no /radar
      const efeR = mov24 === null ? null : lado === "short" ? Math.max(mov24, altaDoVale(d.l.slice(jn, k0 + 1), preco0), 0) : Math.max(-mov24, ddDoPico(d.h.slice(jn, k0 + 1), preco0), 0);
      const adxA = adxNaVela(adxS, k0 - 1); // V109: alinhado à vela (antes lia 27 velas à frente)
      const av = hipAvaliar(d, k0, lado, preco0, isFinite(atr) ? atr : 0, TF_MIN);
      out.push({ i: id, t: emMs, k: tipo, r: av.res, f: Math.round(av.mfe * 100) / 100, a: Math.round(av.mae * 100) / 100, c: r.conf == null ? null : Number(r.conf), e: ext === null ? null : Math.round(ext * 10) / 10, x: Number.isFinite(adxA) ? Math.round(adxA * 10) / 10 : null, m: efeR === null || !isFinite(efeR) ? null : Math.round(efeR * 10) / 10 });
    }
  });
  return out;
}
async function radarHistLer(SB: any): Promise<RadarReg[] | null> {
  try {
    const { data, error } = await SB.from(TAB).select("last_status").eq("instid", RADARH_ROW).maybeSingle();
    if (error) { console.log("⚠️ radarhist: leitura falhou", error.message ?? error); return null; }
    if (!data?.last_status) return [];
    try { const j = JSON.parse(data.last_status); return Array.isArray(j) ? j : []; } catch { return []; }
  } catch (e) { console.log("⚠️ radarhist: leitura falhou", e); return null; }
}
// reavalia os alertas dos últimos 9 dias e junta com o que já estava gravado. Devolve quantos registros ficaram (ou null se falhou).
const RADARH_LOCK_ROW = "_RADAR_HIST_LOCK_";
const RADARH_LOCK_MS = numEnv("RADARH_LOCK_MS", "300000");
// V106: com trava própria — a gravação das 21h e o /radarhist gravar não podem ler/escrever a lista ao mesmo tempo (um apagaria o do outro)
async function radarHistGravar(SB: any): Promise<{ total: number; novos: number; ocupado?: boolean } | null> {
  const tk = await travarLinha(SB, RADARH_LOCK_ROW, RADARH_LOCK_MS);
  if (tk === null) { console.log("⏳ radarhist: outra gravação em andamento, pulei"); return { total: 0, novos: 0, ocupado: true }; }
  try { return await radarHistGravarSemTrava(SB); } finally { await destravarLinha(SB, RADARH_LOCK_ROW, tk); }
}
async function radarHistGravarSemTrava(SB: any): Promise<{ total: number; novos: number } | null> {
  const velhos = await radarHistLer(SB);
  if (velhos === null) return null; // sem ler o histórico, não grava (não pode sobrescrever o que já existe)
  const novos = await radarColetarReg(SB, 9);
  if (novos === null) return null;
  const mapa = new Map<string, RadarReg>();
  for (const v of velhos) mapa.set(`${v.i}|${v.t}|${v.k}`, v);
  let adicionados = 0;
  for (const n of novos) {
    const k = `${n.i}|${n.t}|${n.k}`, ant = mapa.get(k);
    if (!ant) adicionados++;
    if (ant && ant.m == null && n.m != null) ant.m = n.m; // V105: preenche a alta/queda efetiva em registro antigo (dentro dos 9 dias de velas)
    if (ant && n.r === "aberta" && ant.r !== "aberta") continue; // já tinha desfecho: não volta pra "aberta"
    mapa.set(k, n);
  }
  const corte = Date.now() - RADARH_DIAS * 86400000;
  const todos = [...mapa.values()].filter((x) => x.t >= corte).sort((a, b) => a.t - b.t).slice(-RADARH_MAX);
  await upsertLinha(SB, RADARH_ROW, { last_status: JSON.stringify(todos), last_alert_at: new Date().toISOString() });
  return { total: todos.length, novos: adicionados };
}
// /radarhist [dias] — lê o histórico gravado e mostra por tipo / esticada / ADX. "gravar" força a gravação agora.
async function runRadarHist(chatId: number | string, dias: number, gravar: boolean) {
  const SB = getSupabase();
  if (!SB) { await sendTelegram(chatId, "⚠️ Supabase não configurado."); return; }
  let aviso = "";
  if (gravar) {
    const g = await radarHistGravar(SB);
    aviso = g?.ocupado ? "⏳ Outra gravação do histórico está em andamento (a automática das 21h ou outro /radarhist gravar). Mostrando o que já está gravado; tente gravar de novo em alguns minutos.\n\n"
      : g ? `💾 Gravado agora: ${g.novos} alerta(s) novo(s), ${g.total} no histórico.\n\n` : "⚠️ Não consegui gravar agora (veja os logs).\n\n";
  }
  const todos = await radarHistLer(SB);
  if (todos === null) { await sendTelegram(chatId, aviso + "⚠️ Não consegui ler o histórico do radar."); return; }
  const dd = Math.min(RADARH_DIAS, Math.max(1, Math.round(dias || 30)));
  // hipLinhaFatia/hipLeituraFatia leem o desfecho no campo "res"; o registro gravado usa "r" (compacto). Sem esse espelho as fatias saíam todas 0%/0%.
  const itens = todos.filter((x) => x.t >= Date.now() - dd * 86400000).map((x) => ({ ...x, res: x.r }));
  if (!itens.length) { await sendTelegram(chatId, aviso + `📚 <b>HISTÓRICO DOS RADARES</b>\n\nNada gravado ainda nos últimos ${dd} dia(s). Ele é gravado sozinho na virada das 21h; pra começar já, use /radarhist gravar.`); return; }
  const primeiro = Math.min(...itens.map((x) => x.t));
  const fm = (ms: number) => { const iso = new Date(ms + X_TZ_OFFSET_H * 3600000).toISOString(); return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`; };
  const med = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
  const sg = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(1)}`;
  let m = `📚 <b>HISTÓRICO DOS RADARES</b> · ${itens.length} alertas · desde ${fm(primeiro)}\n${DIVISOR}\n<i>Mesmas regras do /radar (invalidado = andou contra ≥ max(${HIP_INV_ATR} ATR, ${HIP_INV_PCT}%) · funcionou = o mesmo a favor · prazo ${HIP_HORAS}h), mas acumulando além dos 9 dias. A esticada é a variação de 24h no sentido que o radar quer reverter. O corte mínimo usa a alta/queda efetiva (a mesma do gatilho do radar), recalculada com as velas.</i>\n\n`;
  for (const tipo of ["topo", "fundo", "repique"] as HipTipo[]) {
    const g = itens.filter((x) => x.k === tipo);
    if (!g.length) continue;
    const c = (r: HipRes) => g.filter((x) => x.r === r).length, pc = (n: number) => `${Math.round((n / g.length) * 100)}%`;
    m += `${tipo === "topo" ? "🔴" : tipo === "fundo" ? "🟢" : "⭐"} <b>${HIP_NOME[tipo][0].toUpperCase()}${HIP_NOME[tipo].slice(1)}</b> (n=${g.length})\n`;
    m += `invalidou ${c("invalida")} (${pc(c("invalida"))}) · funcionou ${c("funcionou")} (${pc(c("funcionou"))}${pmTxt(c("funcionou"), g.length)}) · sem desfecho ${c("expirou") + c("aberta")}\n`;
    m += `a favor mediano ${sg(med(g.map((x) => x.f)))}% · contra mediano ${sg(-med(g.map((x) => x.a)))}%\n`;
    const ext = g.filter((x) => x.e !== null);
    if (ext.length >= 8) {
      const fx = (a: number, b: number) => ext.filter((x) => (x.e as number) >= a && (x.e as number) < b);
      const f1 = fx(-1e9, 5), f2 = fx(5, 15), f3 = fx(15, 25), f4 = fx(25, 1e9);
      m += `  <i>esticada em 24h:</i>\n` + hipLinhaFatia("menos de 5%", f1) + hipLinhaFatia("5% a 15%", f2) + hipLinhaFatia("15% a 25%", f3) + hipLinhaFatia("25% ou mais", f4);
      m += hipLeituraFatia("moeda MUITO forte no dia (25% ou mais)", f4, [...f1, ...f2, ...f3]);
      m += hipLeituraFatia("moeda esticada (15% ou mais)", [...f3, ...f4], [...f1, ...f2]);
    }
    { // V105: corte mínimo cumulativo (10/15/20/25) pela alta/queda efetiva gravada
      const semM = g.filter((x) => x.m == null).length;
      m += hipLinhasCortes(g.map((x) => ({ res: x.r, f: x.f, a: x.a, v: x.m ?? null })), tipo === "topo" ? "alta efetiva" : tipo === "fundo" ? "queda efetiva" : "movimento efetivo (alta p/ SHORT, queda p/ LONG)");
      if (semM > 0 && semM < g.length) m += `  <i>(${semM} alerta(s) sem o movimento gravado ficaram fora dessa parte; /radarhist gravar completa os dos últimos 9 dias)</i>\n`;
    }
    const ax = g.filter((x) => x.x !== null);
    if (ax.length >= 8) {
      const a1 = ax.filter((x) => (x.x as number) < 20), a2 = ax.filter((x) => (x.x as number) >= 20 && (x.x as number) < 30), a3 = ax.filter((x) => (x.x as number) >= 30);
      m += `  <i>ADX antes do alerta:</i>\n` + hipLinhaFatia("ADX menor que 20", a1) + hipLinhaFatia("ADX 20 a 30", a2) + hipLinhaFatia("ADX 30 ou mais", a3);
    }
    if (g.length < 15) m += `<i>amostra pequena (n&lt;15)</i>\n`;
    m += "\n";
  }
  m += `<i>⚠️ Alerta com desfecho ainda aberto entra em "sem desfecho". Use /radarhist 14 pra ver só as últimas 2 semanas. Guarda até ${RADARH_DIAS} dias (RADARH_DIAS).</i>`;
  for (const parte of dividirHtml(aviso + m)) await sendTelegram(chatId, parte);
}
async function runDiv(chatId: number | string) {
  const SB = getSupabase();
  if (!SB) { await sendTelegram(chatId, "⚠️ Supabase não configurado."); return; }
  const est = await divLer(SB);
  if (!est) { await sendTelegram(chatId, "⚠️ Não consegui ler o estado das divergências agora."); return; }
  const agoraPreco = await precoAoVivo(DIV_INST).catch(() => null);
  let m = `📐 <b>DIVERGÊNCIA DE RSI — BTC</b>\n${DIVISOR}\n`;
  m += DIV_ON ? `Gráficos: ${DIV_TFS.map((t) => DIV_TF_NOME[t] ?? t).join(", ") || "nenhum"} · ${DIV_MODO_TV ? "modo tv (igual ao indicador): pivô do RSI" : "pivô de preço"} ${DIV_PIV_ESQ} velas à esquerda / ${divCfg("4H").dir} à direita\n` : `⏸️ Desligado (DIV_ON=0)\n`;
  const pend = Object.values(est.pend);
  m += `\n⏳ <b>Antecipadas em aberto</b> (${pend.length})\n`;
  m += pend.length ? pend.map((p) => `${DIV_TXT[p.tipo].icone} ${DIV_TF_NOME[p.tf] ?? p.tf} ${DIV_TXT[p.tipo].nome} · desde ${divDH(p.desde)}`).join("\n") + "\n" : "nenhuma\n";
  const ult = est.hist.slice(-12).reverse();
  m += `\n🧾 <b>Últimos avisos</b> (o que o BTC fez depois, no sentido do aviso)\n`;
  if (!ult.length) m += "ainda nenhum\n";
  else m += ult.map((e) => {
    const alta = divEhAlta(e.tipo);
    const mov = agoraPreco && e.preco > 0 ? ((agoraPreco - e.preco) / e.preco) * 100 * (alta ? 1 : -1) : NaN;
    const fi = e.fase === "A" ? "👀" : e.fase === "C" ? "✅" : "❌";
    return `${fi} ${DIV_TF_NOME[e.tf] ?? e.tf} ${DIV_TXT[e.tipo].nome} · ${divDH(e.t)} · BTC ${fmtPrice(e.preco)}${e.fase !== "X" && isFinite(mov) ? ` → ${mov >= 0 ? "+" : ""}${mov.toFixed(2)}% ${mov >= 0 ? "a favor" : "contra"}` : ""}`;
  }).join("\n") + "\n";
  m += `\n<i>Divergência é contexto, não entrada: em tendência forte o RSI diverge várias vezes antes do preço virar. "A favor" = na direção do aviso (altista sobe, baixista cai). Compare por gráfico antes de confiar.</i>`;
  await enviarEmPartes(chatId, m); // V107: em partes
}
// V75: status/resumo/painel mostravam os numeros GRAVADOS pelo cron (de ate 15 min atras, ou de antes da Binance), enquanto o /analise recalcula na hora.
// Quem so EXIBE o filtro agora refaz a leitura ao vivo (ADX/ER/caixa de BTC e ETH; cache de 4 min). O ESTADO (bloqueando/liberado, desde quando, avisos)
// continua sendo o gravado pelo cron - isto nao decide nada nem grava nada.
async function lateralComLeituraViva(est: LateralEst | null): Promise<LateralEst | null> {
  if (!est || !LATERAL_ON) return est;
  try {
    const [b, e] = await Promise.all([xRegimeCache().catch(() => null), xRegimeCacheEth().catch(() => null)]);
    if (!b && !e) return est;
    const v: LateralEst = { ...est };
    if (b) { v.btc = b.adx; v.btcEr = b.er; v.btcAmp = b.amp; }
    if (e) { v.eth = e.adx; v.ethEr = e.er; v.ethAmp = e.amp; }
    v.fonte = `BTC ${_fonteBtcEth["BTC-USDT"] ?? "?"} · ETH ${_fonteBtcEth["ETH-USDT"] ?? "?"}`;
    return v;
  } catch { return est; }
}
async function avaliarLateral(SB: any): Promise<LateralEst> {
  const est = (await lateralLer(SB)) ?? lateralNovo();
  if (!LATERAL_ON) { est.bloq = false; return est; }
  const agora = Date.now();
  if (est.bloq) latCiclo(est).ms += Math.min(Math.max(agora - est.upd, 0), 6 * 60000); // passo limitado: cron parado não conta o buraco
  const [b, e] = await Promise.all([xRegimeCache().catch(() => null), xRegimeCacheEth().catch(() => null)]);
  const ib: LatInd | null = b ? { adx: b.adx, er: b.er, amp: b.amp } : null;
  const ie: LatInd | null = e ? { adx: e.adx, er: e.er, amp: e.amp } : null;
  const inds = [ib, ie].filter((x): x is LatInd => x !== null);
  const antes = est.bloq;
  if (inds.length) est.dadoT = agora;
  const semTend = (x: LatInd) => votosTend(x) < LATERAL_VOTOS_LIBERA; // quem já tem sinal de tendência não conta como lateral
  const podeBloquear = agora - est.flip >= LATERAL_HOLD_MIN * 60000; // recém-liberado: espera antes de bloquear de novo
  if (!est.bloq && podeBloquear && ib && ie && votosLat(ib) >= LATERAL_VOTOS && votosLat(ie) >= LATERAL_VOTOS && semTend(ib) && semTend(ie)) est.bloq = true;
  else if (est.bloq && inds.some((x) => votosTend(x) >= LATERAL_VOTOS_LIBERA)) est.bloq = false;
  else if (est.bloq && !inds.length && agora - est.dadoT > 30 * 60000) est.bloq = false; // sem dado há 30 min: solta
  if (est.bloq !== antes) { est.desde = agora; est.flip = agora; }
  est.btc = ib?.adx ?? null; est.btcEr = ib?.er ?? null; est.btcAmp = ib?.amp ?? null;
  est.eth = ie?.adx ?? null; est.ethEr = ie?.er ?? null; est.ethAmp = ie?.amp ?? null;
  est.fonte = `BTC ${_fonteBtcEth["BTC-USDT"] ?? "?"} · ETH ${_fonteBtcEth["ETH-USDT"] ?? "?"}`;
  est.upd = agora;
  // V57: quais dos 6 sinais (3 indicadores × BTC/ETH) estão em tendência agora; "novos" = entraram em tendência desde a última leitura
  const tendAgora: string[] = [];
  for (const [nome, x] of [["BTC", ib], ["ETH", ie]] as const) {
    if (!x) continue;
    if (x.adx !== null && x.adx >= LATERAL_ADX_LIBERA) tendAgora.push(`${nome}|ADX`);
    if (x.er !== null && x.er >= LATERAL_ER_LIBERA) tendAgora.push(`${nome}|ER`);
    if (x.amp !== null && x.amp >= LATERAL_AMP_LIBERA) tendAgora.push(`${nome}|caixa`);
  }
  const novos = tendAgora.filter((k) => !est.tend.includes(k));
  est.tend = tendAgora;
  // V70: dois avisos. 👀 "querendo sair": ainda lateral, mas 1 requisito (de BTC ou ETH) chegou no mínimo (só quando surge sinal novo, com intervalo LATERAL_AVISO_MIN).
  //      📈 "saindo": liberou (2 de 3 no mínimo em BTC ou ETH). Mudança de estado: não espera o intervalo e substitui o aviso 👀 (mesma chave LATERAL).
  const nMax = Math.max(0, ...inds.map((x) => votosTend(x)));
  const liberou = LATERAL_AVISO_ON && antes && !est.bloq && nMax >= LATERAL_VOTOS_LIBERA;
  const querSair = LATERAL_AVISO_ON && antes && est.bloq && novos.length > 0 && nMax >= LATERAL_VOTOS_QUER && nMax < LATERAL_VOTOS_LIBERA && agora - est.avisoT >= LATERAL_AVISO_MIN * 60000;
  const c = latCiclo(est);
  console.log(`🧱 lateral: BTC ${ib ? `${indTxt(ib)} (${votosLat(ib)}/3 lateral, ${votosTend(ib)}/3 tendência)` : "sem dado"} | ETH ${ie ? `${indTxt(ie)} (${votosLat(ie)}/3 lateral, ${votosTend(ie)}/3 tendência)` : "sem dado"} → ${est.bloq ? "BLOQUEANDO" : "liberado"}${est.bloq !== antes ? " (mudou agora)" : ""} | votos bloqueia ${LATERAL_VOTOS}/3 · libera ${LATERAL_VOTOS_LIBERA}/3 | ciclo: ${c.n} barrado(s)`);
  await lateralSalvar(SB, est);
  if (liberou || querSair) {
    const msg = liberou ? msgSaiuLateral(est) : msgQuerSairLateral(est, novos);
    const ids = await Promise.all(ALERT_CHAT_IDS.filter((ch) => !silChat(ch)).map((ch) => enviarAlertaMoeda(SB, ch, "LATERAL", msg).catch(() => null)));
    if (ids.some(Boolean)) { est.avisoT = agora; await lateralSalvar(SB, est); }
    console.log(`${liberou ? "📈 saindo da lateral (liberado)" : "👀 querendo sair da lateral"}: ${(liberou ? est.tend : novos).join(", ")} (aviso ${ids.some(Boolean) ? "enviado" : "não confirmado"})`);
  }
  // V59: espelho do aviso de saída — o filtro acabou de virar false → true (BTC e ETH entraram em lateral). Mesmo intervalo mínimo (LATERAL_AVISO_MIN), contador próprio
  const querAvisoEntrou = LATERAL_AVISO_ENTROU_ON && est.bloq && !antes && agora - est.avisoEntrouT >= LATERAL_AVISO_MIN * 60000;
  if (querAvisoEntrou) {
    const msg = msgEntrouLateral(est);
    const ids = await Promise.all(ALERT_CHAT_IDS.filter((ch) => !silChat(ch)).map((ch) => enviarAlertaMoeda(SB, ch, "LATERAL_IN", msg).catch(() => null)));
    if (ids.some(Boolean)) { est.avisoEntrouT = agora; await lateralSalvar(SB, est); }
    console.log(`📉 entrou na lateral: BTC ${votosLat(indBtc(est))}/3 · ETH ${votosLat(indEth(est))}/3 (aviso ${ids.some(Boolean) ? "enviado" : "não confirmado"})`);
  }
  return est;
}
// V59: aviso quando o mercado ENTRA em lateral (BTC e ETH com sinais de lateral) — espelho do msgSaiuLateral
function msgEntrouLateral(est: LateralEst): string {
  const b = indBtc(est), e = indEth(est);
  return `📉 <b>Mercado entrando em lateral</b>\n${DIVISOR}\n\n` +
    `BTC: ${indTxt(b)} → ${votosLat(b)}/3 lateral\nETH: ${indTxt(e)} → ${votosLat(e)}/3 lateral\n\n` +
    (LATERAL_BARRA
      ? `🛑 O filtro passa a bloquear o LIGUE AGORA até liberar (precisa de ${latQtdLibera()} em BTC ou ETH).`
      : `🧱 Aviso visual: nenhum alerta é barrado, mas BTC e ETH perderam direção.`) +
    `\n<i>Sem tendência, o cruzamento tende a ser falso. Considere desligar o robô nas moedas sem posição e confirme no gráfico.</i>` +
    (est.fonte ? `\n<i>Velas: ${est.fonte}</i>` : "");
}
// V70: marca ✅ quando o requisito está no mínimo (ou acima), ❌ quando ainda está lateral, ❔ sem dado
const latOk = (v: number | null, min: number) => (v === null ? "❔" : v >= min ? "✅" : "❌");
const latDetalhe = (x: LatInd) => `ADX ${fmtAdx(x.adx)} ${latOk(x.adx, LATERAL_ADX_LIBERA)} · ER ${x.er === null ? "?" : x.er.toFixed(2)} ${latOk(x.er, LATERAL_ER_LIBERA)} · caixa ${x.amp === null ? "?" : x.amp.toFixed(1)}×ATR ${latOk(x.amp, LATERAL_AMP_LIBERA)}`;
const latLinhaAtivo = (nome: string, x: LatInd) => `<b>${nome}</b> — ${votosTend(x)}/3 no mínimo\n   ${latDetalhe(x)}\n`;
const latDescSinal = (est: LateralEst, k: string) => {
  const [n, i] = k.split("|");
  const x = n === "BTC" ? indBtc(est) : indEth(est);
  const v = i === "ADX" ? `ADX ${fmtAdx(x.adx)} (≥ ${LATERAL_ADX_LIBERA})` : i === "ER" ? `ER ${x.er === null ? "?" : x.er.toFixed(2)} (≥ ${LATERAL_ER_LIBERA})` : `caixa ${x.amp === null ? "?" : x.amp.toFixed(1)}×ATR (≥ ${LATERAL_AMP_LIBERA})`;
  return `• ${n}: ${v}`;
};
// V70: LIBEROU — pelo menos LATERAL_VOTOS_LIBERA (2) dos 3 requisitos no mínimo em BTC ou ETH
function msgSaiuLateral(est: LateralEst): string {
  const b = indBtc(est), e = indEth(est);
  const nb = votosTend(b), ne = votosTend(e), quem = nb >= ne ? "BTC" : "ETH";
  return `📈 <b>Mercado saindo da lateral</b>\n${DIVISOR}\n\n` +
    `${quem} já tem <b>${Math.max(nb, ne)} de 3</b> requisitos no mínimo.\n\n` +
    `<i>Mínimo: ${latRegrasTend()}</i>\n${latLinhaAtivo("BTC", b)}${latLinhaAtivo("ETH", e)}\n` +
    (LATERAL_BARRA ? `✅ Filtro liberado: o LIGUE AGORA e os alertas de entrada voltam ao normal.` : `✅ Liberado: o aviso 🧱 de mercado lateral sai dos alertas.`) +
    `\n<i>O mercado pode estar começando a andar. Confirme no gráfico antes de ligar o robô.</i>` +
    (est.fonte ? `\n<i>Velas: ${est.fonte}</i>` : "");
}
// V70: QUERENDO SAIR — ainda lateral, mas um requisito já chegou no mínimo (precisa de LATERAL_VOTOS_LIBERA pra liberar)
function msgQuerSairLateral(est: LateralEst, novos: string[]): string {
  const b = indBtc(est), e = indEth(est);
  const nMax = Math.max(votosTend(b), votosTend(e)), falta = Math.max(1, LATERAL_VOTOS_LIBERA - nMax);
  return `👀 <b>Mercado querendo sair da lateral</b>\n${DIVISOR}\n\n` +
    `${novos.length === 1 ? "1 requisito chegou" : `${novos.length} requisitos chegaram`} no mínimo:\n${novos.map((k) => latDescSinal(est, k)).join("\n")}\n\n` +
    `<i>Mínimo: ${latRegrasTend()}</i>\n${latLinhaAtivo("BTC", b)}${latLinhaAtivo("ETH", e)}\n` +
    `🧱 Ainda lateral: falta${falta > 1 ? "m" : ""} ${falta} requisito${falta > 1 ? "s" : ""} em BTC ou ETH pra liberar (precisa de ${LATERAL_VOTOS_LIBERA} de 3).` +
    `\n<i>Pode ser só o começo de um movimento. Ainda não confie em cruzamento novo; confirme no gráfico.</i>` +
    (est.fonte ? `\n<i>Velas: ${est.fonte}</i>` : "");
}
// conta 1 sinal barrado (1x por moeda|lado por hora). Devolve true se contou agora.
function latContar(est: LateralEst, inst: string, lado: string): boolean {
  const hora = Math.floor(Date.now() / 3600000);
  if (est.hora !== hora) { est.hora = hora; est.hk = []; }
  const k = `${inst}|${lado}`;
  if (est.hk.includes(k)) return false;
  est.hk.push(k);
  latCiclo(est).n++;
  est.sujo = true;
  return true;
}
const latDur = (ms: number) => { const m = Math.round(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}` : `${m} min`; };
const latRegras = () => `ADX &lt; ${LATERAL_ADX_BLOQ} · ER &lt; ${LATERAL_ER_BLOQ} · caixa ${LATERAL_JAN / 4}h &lt; ${LATERAL_AMP_BLOQ}×ATR`; // &lt; porque a mensagem vai em HTML do Telegram
const latRegrasTend = () => `ADX ≥ ${LATERAL_ADX_LIBERA} · ER ≥ ${LATERAL_ER_LIBERA} · caixa ≥ ${LATERAL_AMP_LIBERA}×ATR`;
const latQtdLibera = () => `${LATERAL_VOTOS_LIBERA} de 3 requisitos no mínimo`; // V70
// V57: aviso colado nos PREPARE/radares que passam enquanto o filtro bloqueia (o LIGUE AGORA fica barrado)
let _latBloq = false;
// V74: estado do filtro lateral NO MOMENTO do alerta, gravado no fim do `status` do log (sem mexer no banco; tudo que lê o status usa includes()).
// " 🧱" = saiu com o mercado lateral · " 📶" = saiu com tendência. Sem marca = alerta antigo (ou filtro desligado). Alimenta os grupos do /saida e dos placares.
const LAT_MARCA = " 🧱", TEND_MARCA = " 📶";
const marcaLatLog = (): string => (LATERAL_ON ? (_latBloq ? LAT_MARCA : TEND_MARCA) : "");
const temMarca = (r: any, m: string): boolean => String(r?.status || "").includes(m);
const notaLat = () => (!_latBloq ? "" : LATERAL_BARRA
  ? `\n\n🧱 <b>Mercado lateral</b> (BTC e ETH sem tendência): é só aviso antecipado — o LIGUE AGORA fica barrado até o filtro liberar.`
  : `\n\n🧱 <b>Mercado lateral</b> (BTC e ETH sem tendência): aviso visual — o filtro não está barrando nada, confirme no gráfico antes de ligar o robô.`);
// bloco do PAINEL DO DIA (inicio = início do ciclo do painel, pra o "FIM DO RESUMO" mostrar o placar do ciclo que acabou)
function lateralTxt(est: LateralEst | null, inicio: number): string {
  const titulo = "🧱 <b>Filtro de mercado lateral</b>";
  if (!LATERAL_ON) return `${titulo}: desligado\n\n`;
  if (!est) return `${titulo}: <i>aguardando a primeira leitura do cron</i>\n\n`;
  const velho = Date.now() - est.upd > 15 * 60000 ? ` <i>(leitura das ${horaLocal(est.upd)})</i>` : "";
  const c = est.cont[String(inicio)];
  const placar = LATERAL_BARRA
    ? (c && (c.n > 0 || c.ms >= 60000) ? `📊 Neste ciclo: ${c.n} sinal(is) de entrada barrado(s) · ${latDur(c.ms)} com o filtro ligado\n` : `📊 Neste ciclo: nenhum sinal barrado até agora\n`)
    : `📊 Modo visual: nenhum sinal é barrado, só o aviso 🧱${c && c.n > 0 ? ` (${c.n} teria(m) sido barrado(s) no modo bloqueia)` : ""}\n`;
  // V70: tudo em "requisitos no mínimo" (ADX ≥ · ER ≥ · caixa ≥). Liberado = pelo menos LATERAL_VOTOS_LIBERA em BTC ou ETH.
  const b = indBtc(est), e = indEth(est);
  const nb = votosTend(b), ne = votosTend(e), nMax = Math.max(nb, ne), quem = nb >= ne ? "BTC" : "ETH";
  const rotuloLat = LATERAL_BARRA ? "🛑 <b>BLOQUEANDO alertas de entrada</b>" : "🧱 <b>Lateral (aviso visual, sem barrar)</b>";
  const estado = !est.bloq
    ? `✅ <b>liberado</b>${nMax >= LATERAL_VOTOS_LIBERA ? ` — ${quem} com ${nMax} de 3 no mínimo` : ""}`
    : nMax >= LATERAL_VOTOS_QUER
      ? `${rotuloLat} · 🟡 <b>querendo sair</b> (${quem} com ${nMax} de 3 no mínimo) desde ${horaLocal(est.desde)}`
      : `${rotuloLat} desde ${horaLocal(est.desde)}`;
  const regra = est.bloq
    ? `Libera quando BTC ou ETH tiver ${LATERAL_VOTOS_LIBERA} de 3 no mínimo${LATERAL_BARRA ? " · PREPARE e radares seguem, com aviso 🧱" : ""}`
    : `${LATERAL_BARRA ? "Volta a bloquear" : "Volta a marcar lateral"} quando BTC e ETH ficarem com até ${3 - LATERAL_VOTOS} de 3 no mínimo`;
  return `${titulo}: ${estado}\n<i>Mínimo: ${latRegrasTend()}</i>\n${latLinhaAtivo("BTC", b)}${latLinhaAtivo("ETH", e)}${regra}${velho}\n${est.fonte ? `<i>Velas: ${est.fonte}</i>\n` : ""}${placar}\n`;
}
function lateralStatusTxt(est: LateralEst | null): string {
  if (!LATERAL_ON) return "🧱 Filtro lateral: desligado\n";
  if (!est) return "🧱 Filtro lateral: ainda sem leitura do cron\n";
  const c = est.cont[String(painelFase().inicio)];
  const barr = c && c.n > 0 ? ` · ${c.n} barrado(s) no ciclo` : "";
  const velho = Date.now() - est.upd > 15 * 60000 ? ` · leitura das ${horaLocal(est.upd)}` : "";
  const nMaxSt = Math.max(votosTend(indBtc(est)), votosTend(indEth(est)));
  const quer = est.bloq && nMaxSt >= LATERAL_VOTOS_QUER ? ` · 🟡 querendo sair (${nMaxSt} de 3 no mínimo)` : "";
  const cab = est.bloq
    ? (LATERAL_BARRA ? `🧱 Filtro lateral: 🛑 bloqueando desde ${horaLocal(est.desde)}${quer}` : `🧱 Filtro lateral: lateral desde ${horaLocal(est.desde)} (modo visual, sem barrar)${quer}`)
    : `🧱 Filtro lateral: ✅ liberado`;
  return `${cab}${barr}${velho}\n   BTC ${indTxt(indBtc(est))}\n   ETH ${indTxt(indEth(est))}\n${est.fonte ? `   <i>Velas: ${est.fonte}</i>\n` : ""}`;
}
async function runLista(chatId: number | string, tudo = false) {
  const SB = getSupabase();
  if (!SB) { await sendTelegram(chatId, "⚠️ Supabase não configurado (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)."); return; }
  const { data, error } = await SB.from(TAB).select("*").like("instid", `${WL_PREFIXO}%`)
  .not("watch_until", "is", null).gt("watch_until", new Date().toISOString()).eq("watch_notificado", false);
  if (error) { await sendTelegram(chatId, `⚠️ Não consegui ler a lista de acompanhamento: ${String(error.message || error).replace(/</g, "&lt;")}`); return; }
  // V80: só as vigilâncias DESTE chat; a linha ganha instid = moeda pra o resto da função funcionar igual.
  const rows = ((data || []) as any[]).map((r) => ({ r, p: parseWL(r) })).filter((x) => x.p && x.p.chat === String(chatId)).map((x) => ({ ...x.r, instid: x.p!.inst })) as any[];
  // V80: moeda SEGUIDA por este chat que ainda não tem vigilância (ex.: está dentro da faixa, sem lado) aparece mesmo assim, marcada como seguida.
  try {
    const tem = new Set(rows.map((r) => String(r.instid)));
    (await listarSeguidas(SB, chatId)).filter((x) => !tem.has(x.inst)).forEach((x) => rows.push({ instid: x.inst, _soSeguida: true }));
  } catch (e) { console.log("⚠️ /lista: não consegui ler as seguidas", e); }
  if (rows.length === 0) {
    await sendTelegram(chatId, `📋 <b>LISTA DE ACOMPANHAMENTO</b>\n\nNenhuma moeda em acompanhamento agora. Cada alerta enviado coloca a moeda na lista por ${WATCH_HORAS}h.`);
    return;
  }
  const [infos, variacoes, perfil] = await Promise.all([
    emLotes(rows.map((r) => r.instid as string), 20, calcIndicador500),
    getVariacoes24h().catch(() => [] as VarInfo[]),
    xPerfilHoras().catch(() => null),
  ]);
  const pctMap = new Map(variacoes.map((v) => [v.instId, v.pct] as [string, number]));
  const agora = Date.now();
  const itens = rows.map((r, i) => {
    const info = infos[i];
    const atual = info ? ladoAtual(info) : null;
    return { r, info, contra: atual !== null && atual !== r.watch_side };
  }).sort((a, b) => Number(b.contra) - Number(a.contra) || Number(!!a.r._soSeguida) - Number(!!b.r._soSeguida) || (a.info ? a.info.distAbs : 999) - (b.info ? b.info.distAbs : 999));
  // V79: a lista pode crescer (cada virada renova a janela). Mostra as LISTA_MAX mais relevantes (já ordenadas: quem cruzou contra primeiro, depois as mais perto da linha); "/lista tudo" mostra todas.
  const totalRows = itens.length;
  if (!tudo && LISTA_MAX > 0 && itens.length > LISTA_MAX) itens.length = LISTA_MAX;
  const ocultas = totalRows - itens.length;
  const cab = `📋 <b>LISTA DE ACOMPANHAMENTO</b> — ${rows.length} moeda(s), janela de ${WATCH_HORAS}h${ocultas > 0 ? ` · mostrando as ${itens.length} mais relevantes` : ""}\n⏰ Agora: ${xTxtJanela(perfil)}\n${DIVISOR}\n<i>quem já cruzou contra vem primeiro, depois as mais perto da linha</i>\n\n`;
  const blocos = itens.map(({ r, info, contra }, i) => {
    const horasDesde = r.last_alert_at ? ((agora - new Date(r.last_alert_at).getTime()) / 3600000).toFixed(1) : "?";
    const faltamH = (new Date(r.watch_until).getTime() - agora) / 3600000;
    const falta = faltamH >= 1 ? `${Math.round(faltamH)}h` : `${Math.max(0, Math.round(faltamH * 60))}min`;
    const pct = pctMap.get(r.instid);
    let b = i > 0 ? `${MINI_DIVISOR}\n` : "";
    if (r._soSeguida) {
      b += `⭐ <b>${r.instid}</b> — seguida, ainda sem lado pra vigiar (dentro da faixa)\n`;
      const pctS = pctMap.get(r.instid);
      if (pctS !== undefined) b += `${pctS >= 0 ? "📈 +" : "📉 "}${pctS.toFixed(2)}% (24h)\n`;
      if (!info) return b + `Indicador: sem dado agora\n\n`;
      return b + `📍 ${indicadorTxt(info)}\n${idadeTxt(info.idadeCandles)}\npreço ${fmtPrice(info.preco)} | topo ${fmtPrice(info.topo)} | fundo ${fmtPrice(info.fundo)}\n\n`;
    }
    // V79: com WATCH_REPETIR, cada virada troca o watch_side e renova o watch_until, mas o last_alert_at continua sendo o do alerta original.
    // Antes a lista juntava "lado atual" + "há (alerta original)" + "faltam (da última virada)" na mesma frase e ficava contraditória
    // (ex.: "alerta SHORT há 135.9h (faltam 93h)" numa janela de 96h). Agora separa: o lado vigiado e o prazo numa linha, o alerta original na outra.
    const ladoAl = ladoUltimoAlerta(r), ladoVig = r.watch_side === "long" ? "LONG" : "SHORT";
    const inicioMs = new Date(r.watch_until).getTime() - WATCH_HORAS * 3600000;
    const horasVirada = Math.max(0, (agora - inicioMs) / 3600000);
    const virou = !!ladoAl && ladoAl !== r.watch_side;
    b += `🪙 <b>${r.instid}</b> — vigiando ${ladoVig} (faltam ${falta})\n`;
    b += r.last_alert_at
      ? `🔔 alerta ${ladoAl === "long" ? "LONG" : ladoAl === "short" ? "SHORT" : ladoVig}${tipoAlertaTxt(r) ? ` (${tipoAlertaTxt(r)})` : ""} há ${horasDesde}h${virou ? ` · virou pra ${ladoVig} há ~${horasVirada.toFixed(1)}h` : ""}\n`
      : `⭐ seguida por você (sem alerta ainda)\n`;
    if (pct !== undefined) b += `${pct >= 0 ? "📈 +" : "📉 "}${pct.toFixed(2)}% (24h)\n`;
    if (!info) return b + `Indicador: sem dado agora\n\n`;
    if (contra) b += `🔁 JÁ CRUZOU CONTRA o alerta — o aviso 🔁 sai na próxima varredura\n`;
    b += `📍 ${indicadorTxt(info)}\n${idadeTxt(info.idadeCandles)}\npreço ${fmtPrice(info.preco)} | topo ${fmtPrice(info.topo)} | fundo ${fmtPrice(info.fundo)}\n\n`;
    return b;
  });
  let parte = cab;
  for (const b of blocos) {
    if (parte.length + b.length > 3800) { await sendTelegram(chatId, parte); parte = ""; }
    parte += b;
  }
  if (parte.trim()) await sendTelegram(chatId, parte + `${ocultas > 0 ? `<i>+${ocultas} moeda(s) ocultas (as mais longe da linha). Use /lista tudo pra ver todas.</i>\n` : ""}<i>Toque em 🔎 para a análise completa.</i>`, botoesAnalisarLista(itens.map((x) => String(x.r.instid))));
}
const PLACAR_TABELA = "alertas_log";
const PLACAR_HORIZONTES = [15, 60, 240, 1440];
const PLACAR_HORIZ_EXIBE = [60, 240, 1440]; // V66: o 15m sai do /placar e vive no /15min (a coleta segue com PLACAR_HORIZONTES)
const colH = (m: number) => (m < 60 ? `preco_${m}m` : `preco_${m / 60}h`);
const rotH = (m: number) => (m < 60 ? `${m}m` : `${m / 60}h`);
const PLACAR_RETRO_DIAS = Math.max(0, Math.min(numEnv("PLACAR_RETRO_DIAS", "4"), Math.floor((CANDLES_LIMIT_PRECISO * TF_MIN) / 1440) - 1));
// O Supabase corta cada consulta em 1000 linhas (o padrão do servidor), mesmo com .limit(2000): com mais alertas que isso no período,
// o /placar, o /15min e o resumo da noite calculavam as taxas só com as 1000 mais recentes (ou mais antigas) sem avisar.
// Lê em páginas de 1000 até `max` linhas. `montar(de, ate)` devolve a consulta já com .order() e .range(de, ate).
async function lerPaginado(montar: (de: number, ate: number) => any, max = 2000): Promise<{ data: any[] | null; error: any }> {
  const out: any[] = [];
  for (let de = 0; de < max; de += 1000) {
    const r = await montar(de, Math.min(de + 999, max - 1));
    if (r.error) return { data: out.length ? out : null, error: r.error };
    const lote = (r.data || []) as any[];
    out.push(...lote);
    if (lote.length < 1000) break;
  }
  return { data: out, error: null };
}
const PLACAR_MAX_RETRO = numEnv("PLACAR_MAX_RETRO", "150"); // V61: era 40 fixo; o horizonte de 15m só entra no placar via retroativo, então 40/rodada deixava a amostra de 15m bem menor que a de 1h/4h/24h
// V61: MFE/MAE por janela curta (quanto andou a favor/contra em 15, 30 e 60 min desde a entrada). Precisa das colunas do ALTER TABLE em
// migracao-v61.sql; sem elas o bot segue igual (detecta pelo select *).
const JAN_MFE_MIN = [15, 30, 60];
let _placarTemJanMfe = false;
let _placarTem15m = true;
const PLACAR_MAX_CONFERE = 60;
const PLACAR_RESGATE_H = Math.min(numEnv("PLACAR_RESGATE_H", "72"), Math.floor((CANDLES_LIMIT_PRECISO * TF_MIN) / 60) - 6); // V107: até quantas horas atrás o placar ainda confere um alerta pendente
const ANALISE_TARDE_CANDLES = 8;
const ANALISE_MUITO_TARDE_CANDLES = 16;
type VarInfo = { instId: string; pct: number; last: number; volUsdt: number; volMoeda?: number; dd: number; up: number };
let _logTemConf = true;
let _logTemFeat = true; // V87: coluna opcional comp_feat (texto) com as características da compressão no momento do alerta
let _logTemVol = true; // V106: colunas opcionais vol_usdt, vol_moeda (numeric) e sombra_vol (boolean)
let _logTemVersao = true; // V107: coluna opcional versao (texto)
async function inserirLogAlerta(SB: any, linha: Record<string, unknown>, conf: number | null, feat: string | null = null) {
  for (let tent = 0; tent < 5; tent++) {
    const payload: Record<string, unknown> = { ...linha };
    const sombraVol = payload.sombra_vol === true;
    delete payload.sombra_vol;
    if (_logTemConf && conf !== null) payload.conf = conf;
    if (_logTemFeat && feat) payload.comp_feat = feat;
    if (_logTemVol) {
      const v = volDe(String(linha.instid || ""));
      payload.vol_usdt = v ? Math.round(v.u) : null;
      payload.vol_moeda = v ? v.m : null;
      payload.sombra_vol = sombraVol;
    }
    if (_logTemVersao) payload.versao = BOT_VERSAO;
    const { error } = await SB.from(PLACAR_TABELA).insert(payload);
    if (!error) return;
    const msg = String(error.message || "");
    if (payload.versao !== undefined && /versao/i.test(msg)) {
      _logTemVersao = false;
      console.log("⚠️ alertas_log sem a coluna versao: rode  ALTER TABLE alertas_log ADD COLUMN IF NOT EXISTS versao text;  pro filtro \"desde V107\" funcionar");
      continue;
    }
    if (payload.vol_usdt !== undefined && /vol_usdt|vol_moeda|sombra_vol/i.test(msg)) {
      _logTemVol = false;
      console.log("⚠️ alertas_log sem as colunas de volume: rode  ALTER TABLE alertas_log ADD COLUMN IF NOT EXISTS vol_usdt numeric, ADD COLUMN IF NOT EXISTS vol_moeda numeric, ADD COLUMN IF NOT EXISTS sombra_vol boolean DEFAULT false;  pro /volconf funcionar (o alerta segue gravado sem o volume)");
      continue;
    }
    if (payload.comp_feat !== undefined && /comp_feat/i.test(msg)) {
      _logTemFeat = false;
      console.log("⚠️ alertas_log sem a coluna comp_feat: rode  ALTER TABLE alertas_log ADD COLUMN IF NOT EXISTS comp_feat text;  pra guardar os componentes da compressão");
      continue;
    }
    if (payload.conf !== undefined && /conf/i.test(msg)) {
      _logTemConf = false;
      console.log("⚠️ alertas_log sem a coluna conf: rode o ALTER TABLE do arquivo setup-supabase.sql pra medir acerto por confianca");
      continue;
    }
    console.log("⚠️ registrarAlerta:", msg);
    return;
  }
}
async function registrarAlerta(SB: any, c: Setup, conf: number | null = null) {
  try {
    const f = c.info as Partial<InfoFiltravel>;
    await inserirLogAlerta(SB, {
      instid: c.info.instId, lado: c.lado, tipo: c.tipo, status: c.status + marcaLatLog(), fresco: c.fresco,
      idade_candles: c.info.idadeCandles, pct24: c.pct, preco: c.info.preco,
      adx: f.adx ?? null, rsi: f.rsi ?? null,
    }, conf);
  } catch (e) { console.log("⚠️ registrarAlerta erro", e); }
}
// V100: motivos pelos quais uma REVERSÃO é barrada pela regra nova: "ADX" (acima de REV_ADX_MAX), "DI-" (DI puxa pro lado contrário), "DI0" (DI neutro), "NOTA" (abaixo do corte de confiança)
function revMotivos(lado: "long" | "short", adx: number | null | undefined, di: "long" | "short" | null | undefined, conf: number | null, minConf: number): string[] {
  const m: string[] = [];
  if (REV_ADX_MAX > 0 && !(typeof adx === "number" && isFinite(adx) && adx <= REV_ADX_MAX)) m.push("ADX");
  if (REV_DI_OBRIGA && di !== lado) m.push(di == null ? "DI0" : "DI-");
  if (minConf > 0 && conf !== null && conf < minConf) m.push("NOTA");
  return m;
}
let _revSombraN = 0;
async function revSombraGravar(SB: any, s: Setup, conf: number | null, motivos: string[], minConf: number) {
  if (!REV_SOMBRA_ON || !motivos.length) return;
  if (conf !== null && minConf > 0 && conf < minConf - REV_SOMBRA_FOLGA_CONF) return; // nota muito abaixo do corte: ruído, não vale gravar
  if (_revSombraN >= REV_SOMBRA_MAX_POR_RODADA) return;
  const chave = `_REVSOMBRA_${s.info.instId}_${s.lado}`;
  try {
    const { data } = await SB.from(TAB).select("last_alert_at").eq("instid", chave).maybeSingle();
    const ult = data?.last_alert_at ? new Date(data.last_alert_at).getTime() : 0;
    if (ult && Date.now() - ult < REV_SOMBRA_COOLDOWN_MIN * 60000) return;
    const f = s.info as Partial<InfoFiltravel>;
    await inserirLogAlerta(SB, {
      instid: s.info.instId, lado: s.lado, tipo: REV_SOMBRA_TIPO, status: `${s.status} 🌑SOMBRA[${motivos.join("+")}]`, fresco: s.fresco,
      idade_candles: s.info.idadeCandles, pct24: s.pct, preco: s.info.preco, adx: f.adx ?? null, rsi: f.rsi ?? null,
    }, conf);
    await upsertLinha(SB, chave, { last_alert_at: new Date().toISOString(), last_status: motivos.join("+") });
    _revSombraN++;
    console.log(`🌑 sombra reversão: ${s.info.instId} ${s.lado} [${motivos.join("+")}] nota ${conf ?? "?"}/10 · ADX ${f.adx != null ? Math.round(f.adx) : "?"} · DI ${f.diDom ?? "neutro"}`);
  } catch (e) { console.log("⚠️ sombra reversão falhou", e); }
}
const TAXA_TAKER_PCT = numEnv("TAXA_TAKER_PCT", "0.06");
const TAXA_IDA_VOLTA_PCT = numEnv("TAXA_IDA_VOLTA_PCT", String(TAXA_TAKER_PCT * 2));
function retornoLog(r: any, h: number): number | null {
  const p = r[colH(h)], p0 = r.preco;
  if (p == null || p0 == null || Number(p0) <= 0) return null;
  const bruto = ((Number(p) - Number(p0)) / Number(p0)) * 100;
  return (r.lado === "long" ? bruto : -bruto) - TAXA_IDA_VOLTA_PCT;
}
const PLACAR_ENTRADA_ON = (Deno.env.get("PLACAR_ENTRADA") || "1") !== "0";
const ehFinalLog = (r: any) => String(r?.status || "").includes("VAI FECHAR");
const ehInvalidoLog = (r: any) => r?.ent_status === "repetido" || r?.ent_status === "invalido";
const ehSombraRep = (r: any) => r?.tipo === REP_SOMBRA_TIPO; // V104: linhas do modo sombra do repique — só o /repsombra as lê
const ehSombraRev = (r: any) => r?.tipo === REV_SOMBRA_TIPO; // V100: linhas do modo sombra da reversão — só o /reversaoconf as lê
const ehSombraVol = (r: any) => r?.tipo === VOL_SOMBRA_TIPO || r?.sombra_vol === true; // V106: modo sombra de volume — só o /volconf lê
const ehDescartadoLog = (r: any) => ehInvalidoLog(r) || ehSombraRev(r) || ehSombraRep(r) || ehSombraVol(r); // V68: fora de todas as estatísticas (V100: inclui a sombra; V106: e a de volume)
const ENTRADA_MAX_CANDLES = numEnv("ENTRADA_MAX_CANDLES", "8");
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
    // V107: duas filas separadas. Antes era UMA consulta (os 60 mais antigos das últimas 30h com preco_24h vazio): os alertas que já entraram
    // e só esperavam completar 24h ocupavam as 60 vagas sem ter nada a fazer, os novos ficavam na fila e, passadas 30h, saíam da janela
    // com ent_status vazio PRA SEMPRE (ex.: a sombra da reversão inteira). Agora: (1) quem ainda não teve a entrada conferida, até
    // PLACAR_RESGATE_H (72h, dentro das 500 velas); (2) quem entrou e tem um horizonte VENCIDO (já dá pra gravar o preço).
    const iso = (h: number) => new Date(agora - h * 3600000).toISOString();
    const qEnt = SB.from(PLACAR_TABELA).select("*").is("ent_status", null).gt("criado_em", iso(PLACAR_RESGATE_H))
      .order("criado_em", { ascending: true }).limit(PLACAR_MAX_CONFERE);
    const vencidos = [...(_placarTem15m ? [15] : []), 60, 240, 1440].map((m) => `and(${colH(m)}.is.null,ent_em.lt.${iso(m / 60)})`).join(",");
    const qHor = SB.from(PLACAR_TABELA).select("*").eq("ent_status", "entrou").is("preco_24h", null).gt("criado_em", iso(PLACAR_RESGATE_H)).or(vencidos)
      .order("criado_em", { ascending: true }).limit(PLACAR_MAX_CONFERE);
    const [r1, r2] = await Promise.all([qEnt, qHor]);
    if (r1.error || r2.error) {
      res = r1.error ? r1 : r2; // cai no tratamento antigo abaixo (coluna ausente etc.)
      if (!/ent_status/i.test(String(res.error.message || ""))) {
        console.log("⚠️ conferirPlacar (filas V107) falhou, usando a consulta antiga:", res.error.message);
        res = await SB.from(PLACAR_TABELA).select("*")
          .is("preco_24h", null).gt("criado_em", desde).or("ent_status.is.null,ent_status.eq.entrou")
          .order("criado_em", { ascending: true }).limit(PLACAR_MAX_CONFERE);
      }
    } else {
      const vistos = new Set<any>(), juntos: any[] = [];
      for (const r of [...(r1.data || []), ...(r2.data || [])] as any[]) if (!vistos.has(r.id)) { vistos.add(r.id); juntos.push(r); }
      res = { data: juntos, error: null };
    }
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
  if (data && data.length) {
    const tem = "preco_15m" in (data[0] as any);
    if (!tem && _placarTem15m) console.log("⚠️ alertas_log sem a coluna preco_15m: rode o ALTER TABLE do horizonte de 15m (placar segue só com 1h/4h/24h)");
    _placarTem15m = tem;
  }
  const HOR = _placarTem15m ? PLACAR_HORIZONTES : PLACAR_HORIZONTES.filter((m) => m >= 60);
  let retro: any[] = [];
  if (_placarTem15m && PLACAR_RETRO_DIAS > 0) {
    let q = SB.from(PLACAR_TABELA).select("*").is("preco_15m", null).not("preco_24h", "is", null)
      .gt("criado_em", new Date(agora - PLACAR_RETRO_DIAS * 86400000).toISOString());
    if (modoEntrada) q = q.eq("ent_status", "entrou");
    const rr = await q.order("criado_em", { ascending: false }).limit(PLACAR_MAX_RETRO);
    if (rr.error) console.log("⚠️ conferirPlacar (retroativo 15m):", rr.error.message);
    else { const ids = new Set(((data || []) as any[]).map((x) => x.id)); retro = ((rr.data || []) as any[]).filter((x) => !ids.has(x.id)); }
  }
  { const a0 = (data && data[0]) || retro[0]; if (a0) _placarTemJanMfe = "mfe_15m" in (a0 as any); }
  const pend = [...((data || []) as any[]), ...retro].filter((r) =>
    (modoEntrada && r.ent_status == null) ||
    HOR.some((m) => r[colH(m)] == null && agora >= t0De(r) + m * 60000));
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
        const e: EntradaRes & { lado?: "long" | "short" } = r.tipo === "compressao" ? achaEntradaCompressao(d, jd!, r) : achaEntrada(d, jd!, r);
        if (e.st === "pendente") continue;
        if (e.st !== "entrou") {
          const { error: e3 } = await SB.from(PLACAR_TABELA).update({ ent_status: e.st }).eq("id", r.id);
          if (e3) console.log("⚠️ update entrada:", e3.message); else atualizados++;
          continue;
        }
        // V68: entrada com data absurda (série de velas velha/errada) não vira entrada
        const criadoMsV = new Date(r.criado_em).getTime();
        if (e.emMs < criadoMsV - ENT_MAX_ATRASO_H * 3600000 || e.emMs > criadoMsV + (ENTRADA_MAX_CANDLES + 2) * TF_MIN * 60000) {
          const { error: e4 } = await SB.from(PLACAR_TABELA).update({ ent_status: "invalido" }).eq("id", r.id);
          if (e4) console.log("⚠️ update entrada inválida:", e4.message); else { atualizados++; console.log(`⚠️ placar: ${r.instid} ent_em fora da janela (${new Date(e.emMs).toISOString()}), marcado inválido`); }
          continue;
        }
        // V68: o mesmo cruzamento já contado por outro alerta (aviso repetido / reteste) fica de fora do placar
        if (!ehFinalLog(r)) {
          let qJa = SB.from(PLACAR_TABELA).select("id").eq("instid", r.instid).eq("lado", e.lado ?? r.lado)
            .eq("ent_em", new Date(e.emMs).toISOString()).eq("ent_status", "entrou").neq("id", r.id);
          qJa = ehSombraRev(r) ? qJa.eq("tipo", REV_SOMBRA_TIPO) : ehSombraRep(r) ? qJa.eq("tipo", REP_SOMBRA_TIPO) : ehSombraVol(r) ? qJa.eq("tipo", VOL_SOMBRA_TIPO) : qJa.neq("tipo", REV_SOMBRA_TIPO).neq("tipo", REP_SOMBRA_TIPO).neq("tipo", VOL_SOMBRA_TIPO); // V100: a sombra não pode tornar um alerta real "repetido"
          const { data: ja } = await qJa.limit(1);
          if (ja && ja.length) {
            const { error: e5 } = await SB.from(PLACAR_TABELA).update({ ent_status: "repetido" }).eq("id", r.id);
            if (e5) console.log("⚠️ update entrada repetida:", e5.message); else atualizados++;
            continue;
          }
        }
        upd.ent_status = "entrou"; upd.ent_em = new Date(e.emMs).toISOString(); upd.preco_alerta = r.preco; upd.preco = e.preco;
        if (e.lado) { upd.lado = e.lado; r.lado = e.lado; }
        // V107: modo alerta do motor - OPORTUNIDADE entra no fechamento da vela que cruzou (a mesma entrada do /radarsim cruz). Só se o cruzamento
        // é recente (OPORT_MOTOR_MAX_MIN, 15 min); o motor ainda recusa se o preço já andou mais de 0,5 ATR desde esse fechamento.
        if (r.tipo === "oportunidade" && agora - e.emMs <= OPORT_MOTOR_MAX_MIN * 60000 && MOTOR_URL && MOTOR_ALERTA_SECRET) {
          const kE = d.t.findIndex((t) => t + TF_MIN * 60000 === e.emMs);
          const atrE = kE >= 14 ? calcATR(d.h.slice(0, kE + 1), d.l.slice(0, kE + 1), d.c.slice(0, kE + 1), 14) : 0;
          _bgTarefas.push(enviarAlertaMotor({ inst: r.instid, side: (e.lado ?? r.lado) === "short" ? "short" : "long", tipo: "oportunidade", preco: e.preco, atr: atrE, nota: r.conf != null ? Number(r.conf) : null, vol: r.vol_usdt != null ? Number(r.vol_usdt) : null }).catch((x) => console.log("⚠️ modo alerta (oportunidade) falhou", x)));
        }
        t0 = e.emMs; p0 = e.preco;
      }
      let maiorTH = 0;
      for (const m of HOR) {
        if (r[colH(m)] != null || agora < t0 + m * 60000) continue;
        const tH = t0 + m * 60000;
        let k = -1;
        for (let i = d.t.length - 1; i >= 0; i--) { if (d.t[i] + TF_MIN * 60000 <= tH) { k = i; break; } }
        if (k < 0) continue;
        if (d.t[k] + TF_MIN * 60000 <= t0) continue; // V61: a vela do horizonte ainda não saiu na API; sem isso gravava o preço da própria entrada (retorno = só a taxa)
        upd[colH(m)] = d.c[k];
        if (m >= 60) maiorTH = Math.max(maiorTH, tH);
      }
      if (_placarTemJanMfe && p0 > 0) {
        for (const w of JAN_MFE_MIN) {
          if (r[`mfe_${w}m`] != null || agora < t0 + w * 60000) continue;
          const tW = t0 + w * 60000;
          let mx = -Infinity, mn = Infinity;
          for (let i = 0; i < d.t.length; i++) {
            const fim = d.t[i] + TF_MIN * 60000;
            if (fim > t0 && fim <= tW) { mx = Math.max(mx, d.h[i]); mn = Math.min(mn, d.l[i]); }
          }
          if (!isFinite(mx) || !isFinite(mn)) continue;
          const up = ((mx - p0) / p0) * 100, dn = ((p0 - mn) / p0) * 100;
          upd[`mfe_${w}m`] = Math.max(0, r.lado === "long" ? up : dn);
          upd[`mae_${w}m`] = Math.max(0, r.lado === "long" ? dn : up);
        }
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
  console.log(`📊 placar: ${pend.length} alerta(s) pendentes${retro.length ? ` (${retro.length} retroativos de 15m)` : ""}, ${atualizados} atualizados${modoEntrada ? " (entrada = fechamento da vela do cruzamento)" : ""}`);
}
// V36: entrada de um aviso de compressão = 1º fechamento 15m fora da faixa (o lado é o que o robô ligado pegaria); sem rompimento em ENTRADA_MAX_CANDLES = alarme falso
function achaEntradaCompressao(d: XVelas, jd: { suprema: number; j6: number }[], r: any): EntradaRes & { lado?: "long" | "short" } {
  const TFMS = TF_MIN * 60000;
  const t0 = new Date(r.criado_em).getTime();
  let kA = -1;
  for (let i = d.t.length - 1; i >= 0; i--) { if (d.t[i] + TFMS <= t0) { kA = i; break; } }
  if (kA < 0) return { st: "pendente" };
  const ladoEm = (k: number): "long" | "short" | null =>
    d.c[k] > Math.max(jd[k].suprema, jd[k].j6) ? "long" : d.c[k] < Math.min(jd[k].suprema, jd[k].j6) ? "short" : null;
  const l0 = ladoEm(kA);
  if (r.idade_candles != null && l0) {
    const kC = Math.max(0, kA - Number(r.idade_candles));
    const k = ladoEm(kC) === l0 ? kC : kA;
    return { st: "entrou", preco: d.c[k], emMs: d.t[k] + TFMS, lado: l0 };
  }
  const kUlt = d.t.length - 1;
  const kFim = Math.min(kUlt, kA + ENTRADA_MAX_CANDLES);
  for (let k = kA + 1; k <= kFim; k++) {
    const l = ladoEm(k);
    if (l) return { st: "entrou", preco: d.c[k], emMs: d.t[k] + TFMS, lado: l };
  }
  return kUlt >= kA + ENTRADA_MAX_CANDLES ? { st: "nao_entrou" } : { st: "pendente" };
}
// V61: helpers estatísticos. A média simples do placar era dominada por poucos casos extremos (ex.: 15m com -9,9% / +91% de média),
// então o placar agora mostra a MEDIANA (e o detalhe de 15m mostra também a média aparada e o profit factor).
const _med = (a: number[]): number => {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y), n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};
const _mediaAparada = (a: number[], p = 0.1): number => {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y), cut = a.length >= 10 ? Math.floor(a.length * p) : 0;
  const m = s.slice(cut, s.length - cut);
  return m.reduce((t, x) => t + x, 0) / m.length;
};
const _profitFactor = (a: number[]): number => {
  const g = a.filter((x) => x > 0).reduce((t, x) => t + x, 0), l = -a.filter((x) => x < 0).reduce((t, x) => t + x, 0);
  return l > 0 ? g / l : g > 0 ? Infinity : NaN;
};
const _sg = (x: number, d = 2) => (isFinite(x) ? `${x >= 0 ? "+" : ""}${x.toFixed(d)}%` : "—");
function linhaStats(rows: any[], hs: number[] = PLACAR_HORIZ_EXIBE): string {
  const partes = hs.map((h) => {
    const rs = rows.map((r) => retornoLog(r, h)).filter((x): x is number => x !== null);
    if (!rs.length) return `${rotH(h)}: —`;
    const ac = rs.filter((x) => x > 0).length;
    return `${rotH(h)}: ${Math.round((ac / rs.length) * 100)}%${pmTxt(ac, rs.length)} (${ac}/${rs.length}) ${_sg(_med(rs))}`;
  });
  return partes.join(" · ");
}
// V61: detalhe do horizonte de 15m só com alertas FRESCOS (cruzou agora), que é o que o robô de fato opera em 15m.
function placar15mTxt(rows: any[]): string {
  const ok = (r: any) => !ehFinalLog(r) && (r.ent_status == null || r.ent_status === "entrou");
  const item = (r: any) => ({ r, x: retornoLog(r, 15) });
  const frescos = rows.filter((r) => ok(r) && r.fresco === true).map(item).filter((o): o is { r: any; x: number } => o.x !== null);
  const velhos = rows.filter((r) => ok(r) && r.fresco !== true).map(item).filter((o): o is { r: any; x: number } => o.x !== null);
  if (!frescos.length) return "";
  const lin = (nome: string, its: { r: any; x: number }[]) => {
    if (!its.length) return "";
    const xs = its.map((o) => o.x), ac = xs.filter((x) => x > 0).length, pf = _profitFactor(xs);
    return `<b>${nome}</b> (n=${xs.length})\nacerto ${Math.round((ac / xs.length) * 100)}%${pmTxt(ac, xs.length)} · mediana ${_sg(_med(xs))} · aparada ${_sg(_mediaAparada(xs))} · PF ${isFinite(pf) ? pf.toFixed(2) : pf === Infinity ? "∞" : "—"}\n\n`;
  };
  // V69: mesma reorganização em categorias do /placar — antes eram 10 blocos seguidos sem separação.
  let m = `⏱️ <b>DETALHE 15m — só alertas frescos</b>\n${DIVISOR}\n<i>retorno em 15 min desde o fechamento da vela do cruzamento, já com a taxa. PF = ganhos ÷ perdas (acima de 1 é lucro). Aparada = média sem os 10% mais extremos de cada ponta.</i>\n\n`;
  m += lin("Frescos (todos)", frescos);
  m += lin("Não frescos (comparação)", velhos);
  const secao = (titulo: string, linhas: string[]) => { const t = linhas.join(""); return t ? `${MINI_DIVISOR}\n<b>${titulo}</b>\n${MINI_DIVISOR}\n\n${t}` : ""; };
  m += secao("Por confiança", [
    lin("🟢 Confiança ≥ " + CONF_VERDE, frescos.filter((o) => o.r.conf != null && Number(o.r.conf) >= CONF_VERDE)),
    lin(CONF_VERDE - CONF_AMARELO > 1 ? "🟡 Confiança " + CONF_AMARELO + "–" + (CONF_VERDE - 1) : "🟡 Confiança " + CONF_AMARELO, frescos.filter((o) => o.r.conf != null && Number(o.r.conf) >= CONF_AMARELO && Number(o.r.conf) < CONF_VERDE)),
    lin("🔴 Confiança &lt; " + CONF_AMARELO, frescos.filter((o) => o.r.conf != null && Number(o.r.conf) < CONF_AMARELO)),
  ]);
  m += secao("Por tipo de sinal e lado", [
    lin("🚀 Oportunidade", frescos.filter((o) => o.r.tipo === "oportunidade")),
    lin("🔄 Reversão", frescos.filter((o) => o.r.tipo === "reversao")),
    lin("🟢 LONG", frescos.filter((o) => o.r.lado === "long")),
    lin("🔴 SHORT", frescos.filter((o) => o.r.lado === "short")),
  ]);
  m += secao("Por mercado (filtro lateral)", [
    lin("🧱 Em lateral", frescos.filter((o) => temMarca(o.r, LAT_MARCA))),
    lin("📶 Com tendência", frescos.filter((o) => temMarca(o.r, TEND_MARCA))),
  ]);
  m += secao("Por força da tendência (ADX)", [
    lin("💪 ADX ≥ 25", frescos.filter((o) => o.r.adx != null && Number(o.r.adx) >= 25)),
    lin("😐 ADX &lt; 25", frescos.filter((o) => o.r.adx != null && Number(o.r.adx) < 25)),
  ]);
  // MFE/MAE por janela (só existe pra alertas novos, depois do ALTER TABLE)
  const jan = JAN_MFE_MIN.map((w) => {
    const g = rows.filter((r) => ok(r) && r.fresco === true && r[`mfe_${w}m`] != null && r[`mae_${w}m`] != null);
    if (g.length < 5) return "";
    const mf = _med(g.map((r) => Number(r[`mfe_${w}m`]))), ma = _med(g.map((r) => Number(r[`mae_${w}m`])));
    return `${w}m: a favor ${mf.toFixed(2)}% · contra ${ma.toFixed(2)}% (n=${g.length})`;
  }).filter(Boolean);
  if (jan.length) m += `↕️ <b>Quanto andou (mediana, frescos)</b>\n${jan.join("\n")}\n<i>o movimento a favor precisa passar de ~3× o custo (${TAXA_IDA_VOLTA_PCT.toFixed(2)}% + slippage) e ficar acima do movimento contra pra valer a entrada</i>\n\n`;
  const ord = [...frescos].sort((a, b) => a.x - b.x);
  const fmtI = (o: { r: any; x: number }) => `${String(o.r.instid)} ${o.r.lado === "long" ? "L" : "S"} ${_sg(o.x)}`;
  // V74: com poucos frescos (n<10) os 5 piores e os 5 melhores se sobrepunham (a mesma entrada saía nas duas listas): usa no máx. metade de cada lado
  const kExt = Math.min(5, Math.floor(ord.length / 2));
  if (kExt > 0) m += `🔎 <b>Extremos (confira se são dado ruim)</b>\npiores: ${ord.slice(0, kExt).map(fmtI).join(" · ")}\nmelhores: ${ord.slice(-kExt).reverse().map(fmtI).join(" · ")}\n\n`;
  if (frescos.length < 30) m += `⚠️ <i>Só ${frescos.length} frescos com 15m conferido: ruído domina, não tire conclusão ainda.</i>\n`;
  return m;
}
// V83: /compressao [dias] — a compressão aberta por confiança, ADX e lado, pra saber QUAL faixa contribui melhor (o /placar mistura tudo e já sai cortado).
// Retorno = a favor do lado do 1º fechamento fora da faixa (só entradas que realmente "entraram"), contado desde esse fechamento, já com a taxa.
async function runCompressao(chatId: number | string, dias: number) {
  const SB = getSupabase();
  if (!SB) { await sendTelegram(chatId, "⚠️ Supabase não configurado."); return; }
  const desde = new Date(Date.now() - dias * 86400000).toISOString();
  const { data, error } = await lerPaginadoDesde(chatId, (a, b) => SB.from(PLACAR_TABELA).select("*").gt("criado_em", desde).order("criado_em", { ascending: false }).range(a, b));
  if (error) { await sendTelegram(chatId, `⚠️ Não consegui ler o placar: ${String(error.message || error).replace(/</g, "&lt;")}`); return; }
  const comp = ((data || []) as any[]).filter((r) => !ehFinalLog(r) && !ehDescartadoLog(r) && r.tipo === "compressao");
  const ent = comp.filter((r) => r.ent_status === "entrou");
  if (!comp.length) { await sendTelegram(chatId, `🗜️ <b>COMPRESSÃO POR FAIXA</b>\n\nNenhum alerta de compressão nos últimos ${dias} dia(s).`); return; }
  const rets = (g: any[], h: number) => g.map((r) => retornoLog(r, h)).filter((x): x is number => x !== null);
  // V84: tempo até o rompimento = do horário do alerta (criado_em) até o fechamento da vela que saiu da faixa (ent_em). Negativo = dado estranho, fora.
  const minAteRomper = (g: any[]) => g.map((r) => (r.ent_em && r.criado_em ? (new Date(r.ent_em).getTime() - new Date(r.criado_em).getTime()) / 60000 : NaN)).filter((x) => isFinite(x) && x >= 0);
  const tempoTxt = (g: any[]) => {
    const t = minAteRomper(g);
    if (t.length < 5) return "";
    const pct = (lim: number) => Math.round((t.filter((x) => x <= lim).length / t.length) * 100);
    return `\n⏱ rompe em ~${Math.round(_med(t))} min (mediana) · ${pct(30)}% em até 30 min · ${pct(60)}% em até 60 min`;
  };
  const comMov = (g: any[]) => g.filter((r) => r.mfe_pct != null && r.mae_pct != null);
  const movTxt = (g: any[]) => {
    const mv = comMov(g);
    if (mv.length < 5) return "";
    const grande = mv.filter((r) => Math.max(Number(r.mfe_pct), Number(r.mae_pct)) >= COMPRESS_ROMPE_PCT);
    const limpo = grande.filter((r) => Math.min(Number(r.mfe_pct), Number(r.mae_pct)) < COMPRESS_LIMPO_PCT);
    return `\n🚀 andou ${COMPRESS_ROMPE_PCT}%+ pra algum lado (24h): ${Math.round((grande.length / mv.length) * 100)}% (${grande.length}/${mv.length}) · limpo (outro lado &lt; ${COMPRESS_LIMPO_PCT}%): ${Math.round((limpo.length / mv.length) * 100)}% (${limpo.length}/${mv.length})`;
  };
  const linha = (nome: string, g: any[]) => {
    const r4 = rets(g, 240), pf = _profitFactor(r4);
    return `<b>${nome}</b> (n=${g.length})\n${linhaStats(g, [15, ...PLACAR_HORIZ_EXIBE])}${r4.length >= 5 && isFinite(pf) ? ` · PF 4h ${pf.toFixed(2)}` : ""}${tempoTxt(g)}${movTxt(g)}${g.length < 30 ? "\n<i>amostra pequena</i>" : ""}\n\n`;
  };
  const faixasConf: [string, (r: any) => boolean][] = [
    ["Confiança ≤ 5", (r) => r.conf != null && Number(r.conf) <= 5],
    ["Confiança 6", (r) => Number(r.conf) === 6],
    ["Confiança 7", (r) => Number(r.conf) === 7],
    ["Confiança 8", (r) => Number(r.conf) === 8],
    ["Confiança 9–10", (r) => r.conf != null && Number(r.conf) >= 9],
  ];
  let m = `🗜️ <b>COMPRESSÃO POR FAIXA</b> — últimos ${dias} dia(s)\n${DIVISOR}\n<i>Regra atual do alerta (V102): nota ${COMPRESS_CONF_MAX > 0 ? `${COMPRESS_CONF_MIN} a ${COMPRESS_CONF_MAX}` : `≥ ${COMPRESS_CONF_MIN}`}${compAdxTxt() ? ` · ${compAdxTxt()}` : ""}. Alertas anteriores a ela entram nas faixas abaixo.</i>\n${comp.length} alerta(s), ${ent.length} com rompimento (entrada)\n<i>acerto = preço a favor do lado do 1º fechamento fora da faixa; % = retorno mediano já com taxa (${TAXA_IDA_VOLTA_PCT.toFixed(2)}% ida e volta). Colunas: 15m · 1h · 4h · 24h</i>\n\n`;
  m += `<b>Geral (compressão com rompimento)</b>\n${linhaStats(ent, [15, ...PLACAR_HORIZ_EXIBE])}${tempoTxt(ent)}${movTxt(ent)}\n\n`;
  m += `${MINI_DIVISOR}\n<b>Por confiança</b>\n${MINI_DIVISOR}\n\n`;
  const ranque: { nome: string; n: number; med: number }[] = [];
  const rapidez: { nome: string; n: number; min: number }[] = [];
  const movRank: { nome: string; n: number; pct: number }[] = [];
  for (const [nome, fn2] of faixasConf) {
    const g = ent.filter(fn2);
    if (!g.length) continue;
    m += linha(nome, g);
    const r4 = rets(g, 240);
    if (r4.length >= 20) ranque.push({ nome, n: r4.length, med: _med(r4) });
    const tm = minAteRomper(g);
    if (tm.length >= 20) rapidez.push({ nome, n: tm.length, min: _med(tm) });
    const mv = comMov(g);
    if (mv.length >= 20) movRank.push({ nome, n: mv.length, pct: mv.filter((r) => Math.max(Number(r.mfe_pct), Number(r.mae_pct)) >= COMPRESS_ROMPE_PCT).length / mv.length });
  }
  // V88: por quanto a moeda já se mexeu no dia (|variação 24h| no momento do alerta). Os outros alertas só olham o pool das que mais se mexeram;
  // a compressão olha o pool + um rodízio de moedas FORA dele (as mais calmas). Isso mostra quantos alertas vêm de moeda calma e como se saem.
  m += `${MINI_DIVISOR}\n<b>Por movimento da moeda no dia (|variação 24h| ao alertar)</b>\n${MINI_DIVISOR}\n\n`;
  const comP24 = ent.filter((r) => r.pct24 != null && isFinite(Number(r.pct24)));
  const bk: [string, (x: number) => boolean][] = [["🐢 parada (< 3%)", (x) => x < 3], ["⚖️ 3% a 8%", (x) => x >= 3 && x < 8], ["🚀 forte (≥ 8%)", (x) => x >= 8]];
  for (const [nome, f] of bk) {
    const g = comP24.filter((r) => f(Math.abs(Number(r.pct24))));
    if (g.length) m += linha(nome, g);
  }
  m += `<i>Dos ${comP24.length} alertas com a variação gravada, ${comP24.length ? Math.round((comP24.filter((r) => Math.abs(Number(r.pct24)) < 3).length / comP24.length) * 100) : 0}% vieram de moeda parada (&lt; 3% no dia).</i>\n\n`;
  // V87: por componente do sinal (só alertas com o detalhe gravado em comp_feat; começa a acumular depois do ALTER TABLE)
  const feats = ent.map((r) => { try { return { r, f: JSON.parse(String(r.comp_feat)) as any }; } catch { return null; } }).filter((x): x is { r: any; f: any } => !!x && !!x.f);
  m += `${MINI_DIVISOR}\n<b>Por componente do sinal</b>\n${MINI_DIVISOR}\n\n`;
  if (feats.length < 30) {
    m += `<i>Ainda sem dados (${feats.length} alerta(s) com o detalhe gravado). Rode no Supabase: ALTER TABLE alertas_log ADD COLUMN IF NOT EXISTS comp_feat text; — os novos alertas passam a guardar largura da faixa, tempo comprimida, volume, velas, inclinação e ADX.</i>\n\n`;
  } else {
    const num = (x: any) => (typeof x === "number" && isFinite(x) ? x : null);
    const grupos: [string, [string, (f: any) => boolean][]][] = [
      ["Largura da faixa (vs típica)", [["≤ 40%", (f) => num(f.lr) !== null && f.lr <= 0.4], ["40–50%", (f) => num(f.lr) !== null && f.lr > 0.4 && f.lr <= 0.5], ["> 50%", (f) => num(f.lr) !== null && f.lr > 0.5]]],
      ["Tempo comprimida", [["< 2h", (f) => (f.cc ?? 0) < 8], ["2–4h", (f) => (f.cc ?? 0) >= 8 && (f.cc ?? 0) < 16], ["≥ 4h", (f) => (f.cc ?? 0) >= 16]]],
      ["Volume (× a média)", [["< 1.1×", (f) => num(f.vr) !== null && f.vr < 1.1], ["1.1–1.5×", (f) => num(f.vr) !== null && f.vr >= 1.1 && f.vr < 1.5], ["≥ 1.5×", (f) => num(f.vr) !== null && f.vr >= 1.5]]],
      ["Tamanho das velas", [["minúsculas (≤ 70%)", (f) => num(f.rng) !== null && f.rng <= 0.7], ["normais (> 70%)", (f) => num(f.rng) !== null && f.rng > 0.7]]],
      ["Faixa achatada", [["plana", (f) => num(f.inc) !== null && Math.abs(f.inc) <= INCLINA_PLANA], ["inclinada", (f) => num(f.inc) !== null && Math.abs(f.inc) > INCLINA_PLANA]]],
      ["ADX", [["saindo do fundo (↗)", (f) => (f.dadx ?? 0) > 0.5], ["parado/caindo", (f) => (f.dadx ?? 0) <= 0.5]]],
      ["Volatilidade da moeda (amplitude 24h)", [["< 5%", (f) => num(f.amp) !== null && f.amp < 5], ["5% a 7,5%", (f) => num(f.amp) !== null && f.amp >= 5 && f.amp < 7.5], ["≥ 7,5%", (f) => num(f.amp) !== null && f.amp >= 7.5]]],
      ["Preço vs faixa", [["já cruzou", (f) => f.idade !== null && f.idade !== undefined], ["ainda dentro", (f) => f.idade === null || f.idade === undefined]]],
    ];
    m += `<i>${feats.length} alertas com detalhe. Mesma régua: andou ${COMPRESS_ROMPE_PCT}%+ pra algum lado em 24h.</i>\n\n`;
    for (const [titulo, faixas] of grupos) {
      let bloco = "";
      for (const [nome, fp] of faixas) {
        const g = feats.filter((x) => fp(x.f)).map((x) => x.r);
        const mv = comMov(g);
        if (mv.length < 10) { if (g.length) bloco += `• ${nome}: n=${g.length} (poucos conferidos)\n`; continue; }
        const gr = mv.filter((r) => Math.max(Number(r.mfe_pct), Number(r.mae_pct)) >= COMPRESS_ROMPE_PCT);
        const lp = gr.filter((r) => Math.min(Number(r.mfe_pct), Number(r.mae_pct)) < COMPRESS_LIMPO_PCT);
        bloco += `• ${nome}: ${Math.round((gr.length / mv.length) * 100)}% (${gr.length}/${mv.length}) · limpo ${Math.round((lp.length / mv.length) * 100)}%\n`;
      }
      if (bloco) m += `<b>${titulo}</b>\n${bloco}\n`;
    }
  }
  m += `${MINI_DIVISOR}\n<b>Por força da tendência (ADX)</b>\n${MINI_DIVISOR}\n\n`;
  const adxA = ent.filter((r) => r.adx != null && Number(r.adx) >= 25), adxB = ent.filter((r) => r.adx != null && Number(r.adx) < 25);
  if (adxA.length) m += linha("💪 ADX ≥ 25", adxA);
  if (adxB.length) m += linha("😐 ADX < 25", adxB);
  m += `${MINI_DIVISOR}\n<b>Por lado do rompimento</b>\n${MINI_DIVISOR}\n\n`;
  const lg = ent.filter((r) => r.lado === "long"), sh = ent.filter((r) => r.lado === "short");
  if (lg.length) m += linha("🟢 LONG", lg);
  if (sh.length) m += linha("🔴 SHORT", sh);
  if (ranque.length >= 2) {
    ranque.sort((a, b) => b.med - a.med);
    const mel = ranque[0], pior = ranque[ranque.length - 1];
    m += `🏆 <b>Leitura (4h, só faixas com 20+ conferidos):</b> melhor ${mel.nome} (${_sg(mel.med)}, n=${mel.n}) · pior ${pior.nome} (${_sg(pior.med)}, n=${pior.n})\n`;
  } else m += `⚠️ <i>Poucos conferidos por faixa ainda (precisa de 20+ em 4h pra ranquear). Tente /compressao 60.</i>\n`;
  if (movRank.length >= 2) {
    movRank.sort((a, b) => b.pct - a.pct);
    m += `🚀 <b>Mais movimento de ${COMPRESS_ROMPE_PCT}%+ (20+ alertas):</b> ${movRank[0].nome} (${Math.round(movRank[0].pct * 100)}%) · menos ${movRank[movRank.length - 1].nome} (${Math.round(movRank[movRank.length - 1].pct * 100)}%)\n`;
  }
  if (rapidez.length >= 2) {
    rapidez.sort((a, b) => a.min - b.min);
    m += `⏱ <b>Rompe mais rápido (mediana, 20+ alertas):</b> ${rapidez[0].nome} (~${Math.round(rapidez[0].min)} min) · mais devagar ${rapidez[rapidez.length - 1].nome} (~${Math.round(rapidez[rapidez.length - 1].min)} min)\n`;
  }
  m += `<i>Se uma faixa for claramente pior, suba o COMPRESS_CONF_MIN até cortá-la; se for tudo parecido, o spam se resolve com COMPRESS_MAX_POR_RODADA. Uso: /compressao 30</i>`;
  for (const parte of dividirHtml(m)) await sendTelegram(chatId, parte);
}
// V86: /compressao base — compara o que a compressão faz com o que as MESMAS moedas fazem em qualquer hora, sem alerta nenhum.
// Base = pra cada moeda que teve compressão, de hora em hora nas velas disponíveis (≈9-10 dias), o preço andou COMPRESS_ROMPE_PCT% pra algum lado nas 24h seguintes?
// Compressão = os alertas dessas moedas no mesmo período (maior excursão pra cada lado em ~24h, do placar). Janelas vizinhas se sobrepõem: não são independentes.
async function runCompressaoBase(chatId: number | string) {
  const SB = getSupabase();
  if (!SB) { await sendTelegram(chatId, "⚠️ Supabase não configurado."); return; }
  const diasJ = Math.max(2, Math.floor((SAIDA_CANDLES * TF_MIN) / 1440) - 1);
  const desde = new Date(Date.now() - diasJ * 86400000).toISOString();
  const { data, error } = await lerPaginado((a, b) => SB.from(PLACAR_TABELA).select("*").gt("criado_em", desde).order("criado_em", { ascending: false }).range(a, b));
  if (error) { await sendTelegram(chatId, `⚠️ Não consegui ler o placar: ${String(error.message || error).replace(/</g, "&lt;")}`); return; }
  const comp = ((data || []) as any[]).filter((r) => !ehFinalLog(r) && !ehDescartadoLog(r) && r.tipo === "compressao" && r.ent_status === "entrou" && r.mfe_pct != null && r.mae_pct != null);
  if (comp.length < 20) { await sendTelegram(chatId, `🗜️ <b>COMPRESSÃO × BASE</b>\n\nPoucos alertas de compressão com resultado de 24h nos últimos ${diasJ} dias (${comp.length}). Tente de novo mais tarde.`); return; }
  const cont = new Map<string, number>();
  for (const r of comp) cont.set(r.instid, (cont.get(r.instid) || 0) + 1);
  const insts = [...cont.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map((x) => x[0]);
  const seleciona = new Set(insts);
  const passo = Math.max(1, Math.round(60 / TF_MIN)), jan = Math.round(1440 / TF_MIN); // uma janela por hora, olhando 24h à frente
  let nJan = 0, nGrande = 0, nLimpo = 0, nMoedas = 0;
  const porMoedaVol: { id: string; vol: number; cj: number; cg: number; cq: number; cqg: number }[] = []; // V88: por moeda, pra separar por volatilidade
  let qJan = 0, qGrande = 0, qLimpo = 0; // janelas "quietas": faixa comprimida e preço perto dela, as mesmas condições que o radar de compressão exige (largura ≤ SQUEEZE_REL da típica e distância ≤ COMPRESS_DIST_MAX_PCT)
  await emLotes(insts, 5, async (id) => {
    const d = await xCandles(id, TIMEFRAME, SAIDA_CANDLES).catch(() => null);
    if (!d || d.c.length < jan + 10) return;
    nMoedas++;
    const amps: number[] = [];
    let cj = 0, cg = 0, cq = 0, cqg = 0;
    const jd = superV2(d.c, PESO_SUPREMA);
    const larg = (k: number) => ((Math.max(jd[k].suprema, jd[k].j6) - Math.min(jd[k].suprema, jd[k].j6)) / d.c[k]) * 100;
    for (let k = 0; k + jan < d.c.length; k += passo) {
      const p0 = d.c[k];
      if (!(p0 > 0)) continue;
      // essa hora é "quieta"? (precisa de histórico pra largura típica: 96 velas)
      let quieta = false;
      if (k >= 100) {
        const w = larg(k), hist: number[] = [];
        for (let q = k - 96; q < k; q++) { const x = larg(q); if (isFinite(x) && x > 0) hist.push(x); }
        const med = xMediana(hist);
        const tp = Math.max(jd[k].suprema, jd[k].j6), fn = Math.min(jd[k].suprema, jd[k].j6);
        if (med > 0 && isFinite(w) && isFinite(tp) && isFinite(fn) && w / med <= SQUEEZE_REL) {
          const dist = p0 > tp ? ((p0 - tp) / tp) * 100 : p0 < fn ? ((fn - p0) / fn) * 100 : Math.min(((tp - p0) / p0) * 100, ((p0 - fn) / p0) * 100);
          quieta = dist <= COMPRESS_DIST_MAX_PCT;
        }
      }
      let mx = -Infinity, mn = Infinity;
      for (let i = k + 1; i <= k + jan; i++) { if (d.h[i] > mx) mx = d.h[i]; if (d.l[i] < mn) mn = d.l[i]; }
      const up = ((mx - p0) / p0) * 100, dn = ((p0 - mn) / p0) * 100;
      nJan++;
      amps.push(up + dn); // amplitude das 24h seguintes: serve de medida de volatilidade da moeda
      cj++;
      const grande = Math.max(up, dn) >= COMPRESS_ROMPE_PCT, limpo = grande && Math.min(up, dn) < COMPRESS_LIMPO_PCT;
      if (grande) cg++;
      if (quieta) { cq++; if (grande) cqg++; }
      if (grande) nGrande++;
      if (limpo) nLimpo++;
      if (quieta) { qJan++; if (grande) qGrande++; if (limpo) qLimpo++; }
    }
    if (amps.length >= 20) porMoedaVol.push({ id, vol: _med(amps), cj, cg, cq, cqg });
  });
  if (nJan < 50) { await sendTelegram(chatId, "⚠️ Não consegui velas suficientes pra montar a base agora. Tente de novo."); return; }
  const mesmas = comp.filter((r) => seleciona.has(r.instid));
  const pctG = (g: any[]) => g.filter((r) => Math.max(Number(r.mfe_pct), Number(r.mae_pct)) >= COMPRESS_ROMPE_PCT);
  const pctL = (g: any[]) => pctG(g).filter((r) => Math.min(Number(r.mfe_pct), Number(r.mae_pct)) < COMPRESS_LIMPO_PCT);
  const pc = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
  const baseG = pc(nGrande, nJan), baseL = pc(nLimpo, nJan), cG = pc(pctG(mesmas).length, mesmas.length), cL = pc(pctL(mesmas).length, mesmas.length);
  const sg = (x: number) => `${x >= 0 ? "+" : ""}${x}`;
  let m = `🗜️ <b>COMPRESSÃO × BASE</b> — últimos ~${diasJ} dias\n${DIVISOR}\n<i>Mesmas ${nMoedas} moedas que tiveram compressão. "Andou ${COMPRESS_ROMPE_PCT}%+" = o preço foi ${COMPRESS_ROMPE_PCT}% ou mais pra algum lado nas 24h seguintes; "limpo" = o outro lado ficou abaixo de ${COMPRESS_LIMPO_PCT}%.</i>\n\n`;
  m += `📊 <b>Sem alerta (qualquer hora)</b>: andou ${COMPRESS_ROMPE_PCT}%+ em ${baseG}% das janelas (${nGrande}/${nJan}) · limpo ${baseL}%\n`;
  const qOk = qJan >= 30, quietaG = pc(qGrande, qJan), quietaL = pc(qLimpo, qJan);
  m += qOk
    ? `🤫 <b>Moeda quieta, sem alerta</b> (faixa comprimida e preço perto dela, como o radar exige): ${quietaG}% (${qGrande}/${qJan}) · limpo ${quietaL}%\n`
    : `🤫 Moeda quieta, sem alerta: poucas janelas (${qJan}) pra comparar.\n`;
  m += `🗜️ <b>Depois de um alerta de compressão</b>: ${cG}% (${pctG(mesmas).length}/${mesmas.length}) · limpo ${cL}%\n`;
  m += `↔️ Contra qualquer hora: ${sg(cG - baseG)} pontos no movimento · ${sg(cL - baseL)} pontos no limpo\n`;
  if (qOk) m += `↔️ <b>Contra moeda quieta</b>: ${sg(cG - quietaG)} pontos no movimento · ${sg(cL - quietaL)} pontos no limpo\n`;
  m += `\n`;
  for (const [nome, f] of [["Confiança 6", (r: any) => Number(r.conf) === 6], ["Confiança 7", (r: any) => Number(r.conf) === 7], ["Confiança 8", (r: any) => Number(r.conf) === 8]] as [string, (r: any) => boolean][]) {
    const g = mesmas.filter(f);
    if (g.length >= 10) m += `• ${nome}: ${pc(pctG(g).length, g.length)}% (${pctG(g).length}/${g.length}) · limpo ${pc(pctL(g).length, g.length)}%\n`;
  }
  // V88: separar por volatilidade da moeda (terços). Pergunta: o alerta se sai melhor nas moedas mais voláteis? E o peso das moedas calmas distorce a comparação?
  if (porMoedaVol.length >= 9) {
    const ord = [...porMoedaVol].sort((a, b) => a.vol - b.vol), t = Math.ceil(ord.length / 3);
    const grupos: [string, typeof ord][] = [["🐢 Menos voláteis", ord.slice(0, t)], ["⚖️ Médias", ord.slice(t, 2 * t)], ["🚀 Mais voláteis", ord.slice(2 * t)]];
    m += `\n${MINI_DIVISOR}\n<b>Por volatilidade da moeda</b> (amplitude mediana em 24h)\n${MINI_DIVISOR}\n`;
    for (const [nome, g] of grupos) {
      if (!g.length) continue;
      const ids = new Set(g.map((x) => x.id)), al = mesmas.filter((r) => ids.has(r.instid));
      const cj2 = g.reduce((a, x) => a + x.cj, 0), cg2 = g.reduce((a, x) => a + x.cg, 0), cq2 = g.reduce((a, x) => a + x.cq, 0), cqg2 = g.reduce((a, x) => a + x.cqg, 0);
      const volMin = g[0].vol.toFixed(1), volMax = g[g.length - 1].vol.toFixed(1);
      const aG = pctG(al).length;
      m += `\n<b>${nome}</b> (${g.length} moedas, amplitude ${volMin}–${volMax}%)\n`;
      m += `• qualquer hora: ${pc(cg2, cj2)}% · moeda quieta: ${cq2 >= 20 ? pc(cqg2, cq2) + "%" : "poucas janelas"}\n`;
      m += `• depois do alerta: ${al.length ? pc(aG, al.length) + "% (" + aG + "/" + al.length + ")" : "sem alertas"}${al.length && al.length < 30 ? " <i>(amostra pequena)</i>" : ""}\n`;
    }
    const totAl = mesmas.length;
    const pesos = grupos.map(([, g]) => { const ids = new Set(g.map((x) => x.id)); return mesmas.filter((r) => ids.has(r.instid)).length; });
    if (totAl > 0) m += `\n<i>Onde ficam os alertas: ${grupos.map(([n], i) => `${n.replace(/^\S+ /, "")} ${pc(pesos[i], totAl)}%`).join(" · ")} (o ideal pra uma comparação justa seria 33% em cada).</i>\n`;
  }
  // V90: simulação do filtro COMPRESS_AMP_MIN_PCT com os alertas que já existem (amplitude medida nas mesmas velas, então tem um pouco de "visão do futuro": serve de ordem de grandeza)
  if (porMoedaVol.length >= 9 && mesmas.length >= 30) {
    m += `\n${MINI_DIVISOR}\n<b>Simulação do filtro de amplitude</b>\n${MINI_DIVISOR}\n<i>Se o bot só mandasse compressão de moeda com amplitude de 24h ≥ X (COMPRESS_AMP_MIN_PCT):</i>\n`;
    m += `• sem filtro: ${mesmas.length} alertas · ${pc(pctG(mesmas).length, mesmas.length)}% andaram ${COMPRESS_ROMPE_PCT}%+ · limpo ${pc(pctL(mesmas).length, mesmas.length)}%\n`;
    for (const T of [5, 6, 7, 8, 10]) {
      const ids = new Set(porMoedaVol.filter((x) => x.vol >= T).map((x) => x.id));
      const al = mesmas.filter((r) => ids.has(r.instid));
      if (al.length < 15) { m += `• ≥ ${T}%: poucos alertas (${al.length})\n`; continue; }
      m += `• ≥ ${T}%: ${al.length} alertas (${pc(al.length, mesmas.length)}% do total) · ${pc(pctG(al).length, al.length)}% andaram ${COMPRESS_ROMPE_PCT}%+ · limpo ${pc(pctL(al).length, al.length)}% · ${ids.size} moedas\n`;
    }
    m += `<i>Um alerta de moeda volátil andar 5%+ não prova que o SINAL é bom — só que a moeda se mexe. Pro robô, que quer moeda em movimento, isso já vale.</i>\n`;
  }
  const dif = qOk ? cG - quietaG : cG - baseG, refNome = qOk ? "uma moeda quieta qualquer (sem alerta)" : "essas moedas em qualquer hora";
  m += `\n<b>Leitura (contra ${refNome}):</b> ${Math.abs(dif) < 5 ? `a compressão do bot anda praticamente o MESMO que ${refNome}: o alerta não está separando o que vai se mexer do que não vai — o filtro de confiança e de volume não acrescenta nada visível.` : dif > 0 ? `depois do alerta a moeda anda ${dif} pontos a MAIS que ${refNome}: o alerta (confiança e volume) acrescenta valor sobre só achar faixa comprimida.` : `depois do alerta a moeda anda ${-dif} pontos a MENOS que ${refNome}: o alerta não só não ajuda como parece pegar casos piores que a calmaria comum.`}\n`;
  m += `<i>Cuidado: janelas de hora em hora se sobrepõem (não são independentes), a base só cobre ~${diasJ} dias de velas e a lista é das moedas que já tiveram alerta. Serve de ordem de grandeza, não de prova.</i>`;
  for (const parte of dividirHtml(m)) await sendTelegram(chatId, parte);
}
// V91: /radarconf [dias] — radar de TOPO e de FUNDO por nota de confiança (cada nota separada + faixas baixa/média/alta), pra ver se nota maior acerta mais.
// Mesma régua do /placar: acerto = preço a favor do lado do robô na hora do alerta (topo = SHORT, fundo = LONG), % = retorno mediano já com taxa.
async function runRadarConf(chatId: number | string, dias: number) {
  const SB = getSupabase();
  if (!SB) { await sendTelegram(chatId, "⚠️ Supabase não configurado."); return; }
  const desde = new Date(Date.now() - dias * 86400000).toISOString();
  const { data, error } = await lerPaginadoDesde(chatId, (a, b) => SB.from(PLACAR_TABELA).select("*").gt("criado_em", desde).order("criado_em", { ascending: false }).range(a, b));
  if (error) { await sendTelegram(chatId, `⚠️ Não consegui ler o placar: ${String(error.message || error).replace(/</g, "&lt;")}`); return; }
  const todas = ((data || []) as any[]).filter((r) => !ehFinalLog(r) && !ehDescartadoLog(r) && !String(r.status || "").includes("REPIQUE"));
  const rets = (g: any[], h: number) => g.map((r) => retornoLog(r, h)).filter((x): x is number => x !== null);
  const bloco = (nome: string, g: any[]) => {
    const r4 = rets(g, 240), pf = _profitFactor(r4);
    return `<b>${nome}</b> (n=${g.length})\n${linhaStats(g, [15, ...PLACAR_HORIZ_EXIBE])}${r4.length >= 5 && isFinite(pf) ? ` · PF 4h ${pf.toFixed(2)}` : ""}${g.length < 15 ? "\n<i>amostra pequena</i>" : ""}\n\n`;
  };
  let m = `🎯 <b>RADAR POR CONFIANÇA</b> — últimos ${dias} dia(s)\n${DIVISOR}\n<i>Colunas: 15m · 1h · 4h · 24h. Acerto = preço a favor do lado do robô (topo = SHORT, fundo = LONG) desde o alerta; % = retorno mediano com taxa.</i>\n\n`;
  for (const [tipo, titulo] of [["topo", "🔴 RADAR DE TOPO"], ["fundo", "🟢 RADAR DE FUNDO"]] as [string, string][]) {
    const g = todas.filter((r) => r.tipo === tipo && r.conf != null);
    if (!g.length) { m += `${titulo}: sem alertas com confiança gravada.\n\n`; continue; }
    m += `${MINI_DIVISOR}\n<b>${titulo}</b> — ${g.length} alertas\n${MINI_DIVISOR}\n\n`;
    const niveis = [...new Set(g.map((r) => Number(r.conf)))].sort((a, b) => a - b);
    for (const n of niveis) m += bloco(`Confiança ${n}/10`, g.filter((r) => Number(r.conf) === n));
    const faixas: [string, (n: number) => boolean][] = [["⬇️ baixa (≤ 4)", (n) => n <= 4], ["➖ média (5–6)", (n) => n >= 5 && n <= 6], ["⬆️ alta (≥ 7)", (n) => n >= 7]];
    m += `<b>Resumo por faixa</b>\n`;
    const resumo: { nome: string; n: number; med: number }[] = [];
    for (const [nome, f] of faixas) {
      const gg = g.filter((r) => f(Number(r.conf)));
      if (!gg.length) continue;
      m += `${bloco(nome, gg)}`;
      const r24 = rets(gg, 1440);
      if (r24.length >= 15) resumo.push({ nome, n: r24.length, med: _med(r24) });
    }
    const resumo15: { nome: string; n: number; med: number }[] = [];
    for (const [nome, f] of faixas) {
      const gg = g.filter((r) => f(Number(r.conf))), r15 = rets(gg, 15);
      if (r15.length >= 15) resumo15.push({ nome, n: r15.length, med: _med(r15) });
    }
    if (resumo15.length >= 2) {
      resumo15.sort((a, b) => b.med - a.med);
      m += `⏱ <b>Melhor em 15 min (15+ conferidos):</b> ${resumo15[0].nome} (${_sg(resumo15[0].med)}, n=${resumo15[0].n}) · pior ${resumo15[resumo15.length - 1].nome} (${_sg(resumo15[resumo15.length - 1].med)}, n=${resumo15[resumo15.length - 1].n})\n`;
    }
    if (resumo.length >= 2) {
      resumo.sort((a, b) => b.med - a.med);
      m += `🏆 <b>Melhor em 24h (15+ conferidos):</b> ${resumo[0].nome} (${_sg(resumo[0].med)}, n=${resumo[0].n}) · pior ${resumo[resumo.length - 1].nome} (${_sg(resumo[resumo.length - 1].med)}, n=${resumo[resumo.length - 1].n})\n`;
    }
    m += `\n`;
  }
  m += `<i>Cuidado: cada nota isolada tem poucos alertas; olhe o resumo por faixa e espere o n crescer antes de mudar o corte de confiança do radar. Uso: /radarconf 30</i>`;
  for (const parte of dividirHtml(m)) await sendTelegram(chatId, parte);
}
// V99: /reversaoconf [dias] — alertas de REVERSÃO (virada contra o dia) abertos por nota de confiança, lado (LONG = fundo / SHORT = topo), ADX e esticada em 24h.
// Mesmo molde do /radarconf. Esticada = quanto a moeda já andou em 24h NO SENTIDO que a reversão quer desfazer (SHORT: alta; LONG: queda), de r.pct24.
// Cada fatia é calculada separada (não cruzada): com corte de nota 7 (SHORT) / 6 (LONG) a amostra por fatia já é pequena. Só lê o log, não muda o banco.
async function runReversaoConf(chatId: number | string, dias: number) {
  const SB = getSupabase();
  if (!SB) { await sendTelegram(chatId, "⚠️ Supabase não configurado."); return; }
  const desde = new Date(Date.now() - dias * 86400000).toISOString();
  const { data, error } = await lerPaginadoDesde(chatId, (a, b) => SB.from(PLACAR_TABELA).select("*").gt("criado_em", desde).order("criado_em", { ascending: false }).range(a, b));
  if (error) { await sendTelegram(chatId, `⚠️ Não consegui ler o placar: ${String(error.message || error).replace(/</g, "&lt;")}`); return; }
  const rev = ((data || []) as any[]).filter((r) => !ehFinalLog(r) && !ehDescartadoLog(r) && r.tipo === "reversao" && !String(r.status || "").includes("REPIQUE"));
  // V100: modo sombra — o que a regra nova (ADX baixo + DI a favor) ou a nota barrou, gravado em silêncio
  const somb = ((data || []) as any[]).filter((r) => !ehFinalLog(r) && !ehInvalidoLog(r) && ehSombraRev(r));
  const motivosDe = (r: any): string[] => { const m = /SOMBRA\[([^\]]*)\]/.exec(String(r.status || "")); return m ? m[1].split("+").filter(Boolean) : []; };
  if (!rev.length && !somb.length) { await sendTelegram(chatId, `🔄 <b>REVERSÃO POR CONFIANÇA</b>\n\nNenhum alerta de reversão nos últimos ${dias} dia(s).`); return; }
  const rets = (g: any[], h: number) => g.map((r) => retornoLog(r, h)).filter((x): x is number => x !== null);
  const bloco = (nome: string, g: any[]) => {
    const r4 = rets(g, 240), pf = _profitFactor(r4);
    return `<b>${nome}</b> (n=${g.length})\n${linhaStats(g, [15, ...PLACAR_HORIZ_EXIBE])}${r4.length >= 5 && isFinite(pf) ? ` · PF 4h ${pf.toFixed(2)}` : ""}${g.length < 15 ? "\n<i>amostra pequena</i>" : ""}\n\n`;
  };
  const sec = (t: string) => `${MINI_DIVISOR}\n<b>${t}</b>\n${MINI_DIVISOR}\n\n`;
  const ext = (r: any): number | null => {
    if (r.pct24 == null || !isFinite(Number(r.pct24))) return null;
    return r.lado === "short" ? Number(r.pct24) : -Number(r.pct24);
  };
  const ranque = (titulo: string, itens: { nome: string; g: any[] }[], h: number, rot: string) => {
    const lista = itens.map(({ nome, g }) => { const x = rets(g, h); return { nome, n: x.length, med: _med(x) }; }).filter((o) => o.n >= 15 && isFinite(o.med));
    if (lista.length < 2) return "";
    lista.sort((a, b) => b.med - a.med);
    const mel = lista[0], pior = lista[lista.length - 1];
    return `🏆 <b>${titulo} (${rot}, 15+ conferidos):</b> melhor ${mel.nome} (${_sg(mel.med)}, n=${mel.n}) · pior ${pior.nome} (${_sg(pior.med)}, n=${pior.n})\n`;
  };
  const ent = rev.filter((r) => r.ent_status === "entrou");
  let m = `🔄 <b>REVERSÃO POR CONFIANÇA</b> — últimos ${dias} dia(s)\n${DIVISOR}\n${rev.length} alerta(s) de reversão, ${ent.length} em que o robô entrou · 🌑 ${somb.length} na sombra\n<i>Colunas: 15m · 1h · 4h · 24h. Acerto = preço a favor do lado do alerta (LONG = fundo, SHORT = topo) desde o alerta; % = retorno mediano já com taxa (${TAXA_IDA_VOLTA_PCT.toFixed(2)}% ida e volta). Cada fatia é separada das outras (não cruzada).</i>\n\n`;
  m += bloco("Todas as reversões", rev);
  // V100: sombra por motivo (cada linha é separada; "só X" = barrada apenas por esse motivo, pra ver qual filtro pesa)
  m += sec(`🌑 Sombra — barradas pela regra nova (ADX ≤ ${REV_ADX_MAX}${REV_DI_OBRIGA ? " e DI a favor" : ""})`);
  if (!somb.length) m += `<i>Ainda sem alertas na sombra${REV_SOMBRA_ON ? " (começa a gravar a partir do deploy da V100)" : " (REV_SOMBRA=0, desligada)"}.</i>\n\n`;
  else {
    m += bloco("Todas as barradas", somb);
    const so = (f: (x: string[]) => boolean) => somb.filter((r) => { const x = motivosDe(r); return x.length > 0 && f(x); });
    const gS: [string, any[]][] = [
      ["Só ADX alto (DI estava a favor)", so((x) => x.length === 1 && x[0] === "ADX")],
      ["Só DI (contra ou neutro; ADX ok)", so((x) => x.every((k) => k.startsWith("DI")))],
      ["  ↳ DI contra", so((x) => x.includes("DI-"))],
      ["  ↳ DI neutro", so((x) => x.includes("DI0"))],
      ["ADX alto + DI errado", so((x) => x.includes("ADX") && x.some((k) => k.startsWith("DI")))],
      ["Só nota baixa (passaria no ADX e no DI)", so((x) => x.length === 1 && x[0] === "NOTA")],
    ];
    for (const [nome, g] of gS) if (g.length) m += bloco(nome, g);
    m += `<i>Compare com o bloco "Todas as reversões": se a sombra render igual ou melhor, a regra está cortando sinal bom; se render pior, está filtrando certo. Os alertas reais acima incluem os de antes da V100 (sem a regra).</i>\n\n`;
  }
  // 1) por nota exata + faixas
  const comConf = rev.filter((r) => r.conf != null);
  m += sec("Por confiança");
  if (!comConf.length) m += `<i>Sem confiança gravada nesses alertas.</i>\n\n`;
  else {
    const niveis = [...new Set(comConf.map((r) => Number(r.conf)))].sort((a, b) => a - b);
    for (const n of niveis) m += bloco(`Confiança ${n}/10`, comConf.filter((r) => Number(r.conf) === n));
    const faixas: { nome: string; g: any[] }[] = [
      { nome: "➖ 6–7", g: comConf.filter((r) => Number(r.conf) <= 7) },
      { nome: "⬆️ 8", g: comConf.filter((r) => Number(r.conf) === 8) },
      { nome: "🔝 9–10", g: comConf.filter((r) => Number(r.conf) >= 9) },
    ];
    // V100: com um corte só na prática (6–7) a faixa repetia tudo; só mostra o resumo quando há 2+ faixas com alerta
    if (faixas.filter((f) => f.g.length).length >= 2) {
      m += `<b>Resumo por faixa</b>\n`;
      for (const f of faixas) if (f.g.length) m += bloco(f.nome, f.g);
    }
    m += ranque("Melhor faixa", faixas, 1440, "24h") + ranque("Melhor faixa", faixas, 240, "4h") + ranque("Melhor faixa", faixas, 15, "15 min");
    m += `\n`;
  }
  // 2) por lado
  const lados = [{ nome: "🟢 LONG (virada pra cima, fundo)", g: rev.filter((r) => r.lado === "long") }, { nome: "🔴 SHORT (virada pra baixo, topo)", g: rev.filter((r) => r.lado === "short") }];
  m += sec("Por lado");
  for (const l of lados) if (l.g.length) m += bloco(l.nome, l.g);
  // 3) por ADX
  const adxF = [
    { nome: "😴 ADX ≤ 20 (regra nova)", g: rev.filter((r) => r.adx != null && Number(r.adx) <= 20) },
    { nome: "😐 ADX 20–30", g: rev.filter((r) => r.adx != null && Number(r.adx) > 20 && Number(r.adx) <= 30) },
    { nome: "💪 ADX > 30", g: rev.filter((r) => r.adx != null && Number(r.adx) > 30) },
  ];
  m += sec("Por força da tendência (ADX)");
  for (const f of adxF) if (f.g.length) m += bloco(f.nome, f.g);
  m += ranque("Melhor ADX", adxF, 1440, "24h");
  // 4) por esticada
  const estF = [
    { nome: "esticada < 5%", g: rev.filter((r) => { const e = ext(r); return e !== null && e < 5; }) },
    { nome: "esticada 5% a 15%", g: rev.filter((r) => { const e = ext(r); return e !== null && e >= 5 && e < 15; }) },
    { nome: "esticada 15% a 25%", g: rev.filter((r) => { const e = ext(r); return e !== null && e >= 15 && e < 25; }) },
    { nome: "esticada ≥ 25%", g: rev.filter((r) => { const e = ext(r); return e !== null && e >= 25; }) },
  ];
  m += `\n` + sec("Por esticada em 24h (andou no sentido que a reversão quer desfazer)");
  for (const f of estF) if (f.g.length) m += bloco(f.nome, f.g);
  m += ranque("Melhor esticada", estF, 1440, "24h");
  m += `\n<i>Cuidado: com corte de nota ${CONF_MIN_REVERSAO} (SHORT) e ${CONF_MIN_FUNDO_LONG} (LONG) cada fatia tem poucos alertas; só confie onde n ≥ 15 e espere crescer antes de mudar CONF_MIN_REVERSAO. Uso: /reversaoconf 30</i>`;
  for (const parte of dividirHtml(m)) await sendTelegram(chatId, parte);
}
// ===== V106: MODO SOMBRA DE VOLUME =====
// Pega as moedas com volume entre FILTRO_VOL_SOMBRA_MIN e FILTRO_VOL_MIN_USDT que mais andaram e passa pelas mesmas regras dos radares
// (topo, fundo, repique) e do alerta de oportunidade/reversão. Quem passaria vira uma linha tipo vol_sombra (sombra_vol=true) no alertas_log.
// Não manda aviso, não registra hipótese, não entra no /placar. O volume (USDT e unidades) vai junto pelo inserirLogAlerta.
async function volSombraRodar(SB: any, variacoes: VarInfo[], perfil: XPerfil | null) {
  if (!(FILTRO_VOL_SOMBRA_MIN > 0) || FILTRO_VOL_SOMBRA_MIN >= FILTRO_VOL_MIN_USDT || !(VOL_SOMBRA_POOL > 0)) return;
  const faixa = variacoes.filter((v) => v.volUsdt >= FILTRO_VOL_SOMBRA_MIN && v.volUsdt < FILTRO_VOL_MIN_USDT);
  if (!faixa.length) return;
  const mov = (v: VarInfo) => Math.max(Math.abs(v.pct), v.dd || 0, v.up || 0);
  const pool = [...faixa].sort((a, b) => mov(b) - mov(a)).slice(0, VOL_SOMBRA_POOL);
  const infos = await emLotes(pool.map((p) => p.instId), 10, calcIndicadorFiltro);
  type Cand = { inst: string; lado: "long" | "short"; cat: string; status: string; conf: number | null; info: InfoFiltravel; pct: number; idade: number | null; fresco: boolean };
  const cands: Cand[] = [];
  for (let i = 0; i < pool.length; i++) {
    const info = infos[i] as InfoFiltravel | null, p = pool[i];
    if (!info) continue;
    const inst = p.instId;
    // radar de FUNDO / repique LONG (mesmas regras do radarFundo, sem o volume)
    if (FUNDO_ON && info.bottom && ladoAtual(info) !== "long") {
      const queda = quedaEfetiva(p.pct, Math.max(p.dd ?? 0, info.ddPico ?? 0));
      const rep = !!info.bottom.repique;
      const preOk = info.bottom.pts >= (rep ? Math.max(1, FUNDO_PRE_MIN - 1) : FUNDO_PRE_MIN);
      const regraOk = rep ? repMotivos("long", info.adx, info.adxAntes, info.diDom ?? null).length === 0
        : !(FUNDO_ADX_MAX > 0 && typeof info.adx === "number" && isFinite(info.adx) && info.adx >= FUNDO_ADX_MAX);
      if (queda >= FUNDO_QUEDA_MIN && preOk && regraOk) {
        const fin = await fundoFinal(info.bottom, inst).catch(() => null);
        const minConf = fin?.repique && !fin.caindoFaca ? REPIQUE_CONF_MIN : FUNDO_CONF_MIN;
        if (fin && fin.conf >= minConf) cands.push({ inst, lado: "long", cat: fin.repique ? "repique" : "fundo", status: fin.repique ? "🟢 REPIQUE LONG" : "🟢 FUNDO", conf: fin.conf, info, pct: p.pct, idade: info.idadeCandles, fresco: false });
      }
    }
    // radar de TOPO / repique SHORT
    if (TOPO_ON && info.top && ladoAtual(info) !== "short") {
      const alta = altaEfetiva(p.pct, Math.max(p.up ?? 0, info.altaVale ?? 0));
      const rep = !!info.top.repique;
      const preOk = info.top.pts >= (rep ? Math.max(1, TOPO_PRE_MIN - 1) : TOPO_PRE_MIN);
      const regraOk = rep ? repMotivos("short", info.adx, info.adxAntes, info.diDom ?? null).length === 0
        : !(TOPO_ADX_MAX > 0 && typeof info.adx === "number" && isFinite(info.adx) && info.adx >= TOPO_ADX_MAX);
      if (alta >= TOPO_ALTA_MIN && preOk && regraOk) {
        const fin = await topoFinal(info.top, inst).catch(() => null);
        const minConf = fin?.repique && !fin.caindoFaca ? REPIQUE_CONF_MIN : TOPO_CONF_MIN;
        if (fin && fin.conf >= minConf) cands.push({ inst, lado: "short", cat: fin.repique ? "repique" : "topo", status: fin.repique ? "🔴 REPIQUE SHORT" : "🔴 TOPO", conf: fin.conf, info, pct: p.pct, idade: info.idadeCandles, fresco: false });
      }
    }
    // alerta de OPORTUNIDADE / REVERSÃO (classificar + filtros, com o volume dado como aprovado)
    const s = classificar(info, p.pct);
    if (s && !motivoDescarte(info, FILTRO_VOL_MIN_USDT, false, s.lado)) {
      if (ALERT_RETESTE_MAX_CANDLES > 0 && s.info.idadeCandles !== null && s.info.idadeCandles > ALERT_RETESTE_MAX_CANDLES) continue;
      // V107: a nota NÃO pode ver o volume abaixo do filtro ("volume baixo" tira 2 pontos): a sombra mede SÓ o filtro de volume; se a nota
      // também punisse, quase nenhum setup da faixa passaria e a comparação sairia viciada. Pontua como se estivesse no limite do filtro.
      const confRes = await calcConfiancaAlerta(s, Math.max(p.volUsdt, FILTRO_VOL_MIN_USDT), perfil).catch(() => null);
      const conf = confRes?.conf ?? null;
      const minConf = s.tipo === "reversao" ? (s.lado === "long" ? CONF_MIN_FUNDO_LONG : CONF_MIN_REVERSAO) : CONF_MIN_OPORT;
      const ehRepS = (s.lado === "long" && !!info.bottom?.repique) || (s.lado === "short" && !!info.top?.repique); // V107: repique segue a regra do repique, como no alerta real
      const barra = ehRepS ? (repMotivos(s.lado, info.adx, info.adxAntes, info.diDom ?? null).length > 0 || (minConf > 0 && conf !== null && conf < minConf))
        : s.tipo === "reversao" ? revMotivos(s.lado, info.adx, info.diDom ?? null, conf, minConf).length > 0 : minConf > 0 && conf !== null && conf < minConf;
      if (!barra) cands.push({ inst, lado: s.lado, cat: s.tipo, status: s.status, conf, info, pct: p.pct, idade: s.info.idadeCandles, fresco: s.fresco });
    }
  }
  if (!cands.length) { console.log(`🌑 sombra de volume: ${pool.length} moeda(s) entre ${fmtVol(FILTRO_VOL_SOMBRA_MIN)} e ${fmtVol(FILTRO_VOL_MIN_USDT)} avaliadas, nenhuma passaria`); return; }
  cands.sort((a, b) => (b.conf ?? 0) - (a.conf ?? 0));
  let n = 0;
  for (const c of cands) {
    if (n >= VOL_SOMBRA_MAX_POR_RODADA) break;
    const chave = `_VOLSOMBRA_${c.inst}_${c.cat}`;
    try {
      const { data } = await SB.from(TAB).select("last_alert_at").eq("instid", chave).maybeSingle();
      const ult = data?.last_alert_at ? new Date(data.last_alert_at).getTime() : 0;
      if (ult && Date.now() - ult < VOL_SOMBRA_COOLDOWN_MIN * 60000) continue;
      await inserirLogAlerta(SB, {
        instid: c.inst, lado: c.lado, tipo: VOL_SOMBRA_TIPO, status: `🌑VOL[${c.cat}] ${c.status}`, fresco: c.fresco,
        idade_candles: c.idade, pct24: c.pct, preco: c.info.preco, adx: c.info.adx ?? null, rsi: c.info.rsi ?? null, sombra_vol: true,
      }, c.conf);
      await upsertLinha(SB, chave, { last_alert_at: new Date().toISOString(), last_status: c.cat });
      n++;
      console.log(`🌑 sombra de volume: ${c.inst} ${c.cat} ${c.lado} nota ${c.conf ?? "?"}/10 · volume ${fmtVol(volDe(c.inst)?.u)} USDT`);
    } catch (e) { console.log("⚠️ sombra de volume falhou", e); }
  }
}
// ===== V106: /volconf [dias] — resultado por volume (USDT x unidades) =====
// Mesma régua do /radar (hipAvaliar): funcionou = andou a favor ≥ max(HIP_ALVO_ATR × ATR, HIP_ALVO_PCT%) antes de andar contra
// ≥ max(HIP_INV_ATR × ATR, HIP_INV_PCT%); prazo HIP_HORAS. Usa as velas, então no máximo ~9 dias.
async function runVolConf(chatId: number | string, dias: number) {
  const SB = getSupabase();
  if (!SB) { await sendTelegram(chatId, "⚠️ Supabase não configurado."); return; }
  const dd = Math.min(9, Math.max(1, Math.round(dias || 7)));
  const desdeMs = Date.now() - dd * 86400000;
  const { data, error } = await lerPaginadoDesde(chatId, (a, b) => SB.from(PLACAR_TABELA).select("*").gt("criado_em", new Date(desdeMs).toISOString()).order("criado_em", { ascending: false }).range(a, b));
  if (error) { await sendTelegram(chatId, `⚠️ Não consegui ler o placar: ${String(error.message || error).replace(/</g, "&lt;")}`); return; }
  type Linha = { inst: string; lado: HipLado; cat: string; sombra: boolean; u: number; m: number | null; preco: number; emMs: number };
  const catDe = (r: any): string | null => {
    if (r.tipo === VOL_SOMBRA_TIPO) { const x = /VOL\[([^\]]+)\]/.exec(String(r.status || "")); return x ? x[1] : null; }
    if (r.tipo === "fundo" || r.tipo === "topo") return String(r.status || "").includes("REPIQUE") ? "repique" : r.tipo;
    if (r.tipo === "oportunidade" || r.tipo === "reversao") return r.tipo;
    return null; // compressão (lado indefinido), sombras de ADX/DI etc.
  };
  const todas = (data || []) as any[];
  const semColuna = todas.length > 0 && todas.every((r) => !("vol_usdt" in r));
  const linhas: Linha[] = [];
  for (const r of todas) {
    if (ehFinalLog(r) || ehInvalidoLog(r) || ehSombraRev(r) || ehSombraRep(r)) continue;
    const cat = catDe(r), u = r.vol_usdt == null ? NaN : Number(r.vol_usdt);
    if (!cat || !isFinite(u) || !(Number(r.preco) > 0)) continue;
    linhas.push({ inst: r.instid, lado: r.lado === "long" ? "long" : "short", cat, sombra: ehSombraVol(r), u, m: r.vol_moeda == null ? null : Number(r.vol_moeda), preco: Number(r.preco), emMs: new Date(r.criado_em).getTime() });
  }
  const faca = await facaLer(SB).catch(() => null); // o modo faca guarda numa linha própria
  for (const f of faca || []) if (f.t > desdeMs && f.u != null && Number(f.p) > 0 && desdeOk(desdeDoChat(chatId), f.t, f.v)) linhas.push({ inst: f.i, lado: "short", cat: "faca", sombra: false, u: Number(f.u), m: f.m == null ? null : Number(f.m), preco: Number(f.p), emMs: f.t });
  if (!linhas.length) {
    await sendTelegram(chatId, `💧 <b>RESULTADO POR VOLUME</b>\n\nNenhum alerta com volume gravado nos últimos ${dd} dia(s).${semColuna ? "\n\n⚠️ A tabela alertas_log ainda não tem as colunas de volume. Rode no Supabase:\n<code>ALTER TABLE alertas_log ADD COLUMN IF NOT EXISTS vol_usdt numeric, ADD COLUMN IF NOT EXISTS vol_moeda numeric, ADD COLUMN IF NOT EXISTS sombra_vol boolean DEFAULT false;</code>" : "\nOs alertas de antes da V106 não têm volume. Deixe acumular alguns dias."}`);
    return;
  }
  // desfecho de cada alerta com as velas
  const porMoeda = new Map<string, Linha[]>();
  for (const l of linhas) { const a = porMoeda.get(l.inst) || []; a.push(l); porMoeda.set(l.inst, a); }
  const TFMS = TF_MIN * 60000;
  type Item = Linha & { res: HipRes };
  const itens: Item[] = [];
  await emLotes([...porMoeda.keys()], 5, async (id) => {
    const d = await xCandles(id, TIMEFRAME, SAIDA_CANDLES).catch(() => null);
    if (!d) return;
    for (const l of porMoeda.get(id)!) {
      let k0 = -1;
      for (let i = d.t.length - 1; i >= 0; i--) { if (d.t[i] <= l.emMs && l.emMs < d.t[i] + TFMS) { k0 = i; break; } }
      if (k0 < 20) continue;
      const atr = calcATR(d.h.slice(0, k0 + 1), d.l.slice(0, k0 + 1), d.c.slice(0, k0 + 1), 14);
      itens.push({ ...l, res: hipAvaliar(d, k0, l.lado, l.preco, isFinite(atr) ? atr : 0, TF_MIN).res });
    }
  });
  if (!itens.length) { await sendTelegram(chatId, "💧 <b>RESULTADO POR VOLUME</b>\n\nNão consegui as velas dos alertas com volume. Tente de novo em alguns minutos."); return; }
  const F = FILTRO_VOL_MIN_USDT;
  const reais = itens.filter((x) => !x.sombra), somb = itens.filter((x) => x.sombra);
  const CAT_NOME: Record<string, string> = { topo: "🔴 topo", fundo: "🟢 fundo", repique: "⭐ repique", oportunidade: "📈 oportunidade", reversao: "🔄 reversão", faca: "🔪 faca" };
  const sec = (t: string) => `${MINI_DIVISOR}\n<b>${t}</b>\n${MINI_DIVISOR}\n`;
  const porCat = (g: Item[]) => {
    let t = "";
    for (const c of Object.keys(CAT_NOME)) { const x = g.filter((i) => i.cat === c); if (x.length) t += hipLinhaFatia(`  ${CAT_NOME[c]}`, x); }
    return t;
  };
  const pp = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)}%`);
  let m = `💧 <b>RESULTADO POR VOLUME</b> — últimos ${dd} dia(s)\n${DIVISOR}\n<i>${itens.length} alertas com volume (${reais.length} reais · 🌑 ${somb.length} na sombra abaixo de ${fmtVol(F)} USDT). Funcionou = andou a favor ${HIP_ALVO_ATR} ATR (mín. ${HIP_ALVO_PCT}%) antes de andar contra ${HIP_INV_ATR} ATR (mín. ${HIP_INV_PCT}%), em até ${HIP_HORAS}h. ⚠️ = menos de 8.</i>\n\n`;
  // A. alinhado ao filtro
  const A = reais.filter((x) => x.u >= F);
  m += sec(`A. Alinhado ao filtro (volume ≥ ${fmtVol(F)} USDT)`);
  m += A.length ? hipLinhaFatia("Todos", A) + porCat(A) : "<i>nenhum</i>\n";
  // B. sem filtro
  m += "\n" + sec("B. Sem filtro (inclui a 🌑 sombra)");
  m += hipLinhaFatia("Todos", itens) + porCat(itens);
  if (somb.length) m += hipLinhaFatia("só a 🌑 sombra", somb);
  else m += `<i>Sombra ainda vazia${FILTRO_VOL_SOMBRA_MIN > 0 ? ` (grava de ${fmtVol(FILTRO_VOL_SOMBRA_MIN)} até ${fmtVol(F)})` : " (FILTRO_VOL_SOMBRA_MIN=0, desligada)"}.</i>\n`;
  // C. faixas de USDT
  const faixasU: [string, number, number][] = [["abaixo de 500k", 0, 5e5], ["500k a 1M", 5e5, 1e6], ["1M a 3M", 1e6, 3e6], ["3M a 10M", 3e6, 1e7], ["mais de 10M", 1e7, Infinity]];
  m += "\n" + sec("C. Por faixa de volume em USDT");
  for (const [nome, a, b] of faixasU) { const x = itens.filter((i) => i.u >= a && i.u < b); if (x.length) m += hipLinhaFatia(nome, x); }
  m += `<i>Corte mínimo (cumulativo: quem passaria com esse filtro):</i>\n`;
  for (const c of [5e5, 1e6, 3e6]) { const x = itens.filter((i) => i.u >= c); if (x.length) m += hipLinhaFatia(`≥ ${fmtVol(c)}`, x); }
  // D. quartis de unidades
  const comM = itens.filter((i) => i.m !== null && isFinite(i.m as number)) as (Item & { m: number })[];
  const qs = (v: number[], p: number) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };
  m += "\n" + sec("D. Por quartis de volume em unidades da moeda");
  let medM = 0;
  if (comM.length >= 4) {
    const vm = comM.map((i) => i.m), q1 = qs(vm, 0.25), q2 = qs(vm, 0.5), q3 = qs(vm, 0.75);
    medM = q2;
    m += hipLinhaFatia(`Q1 (até ${fmtVol(q1)})`, comM.filter((i) => i.m < q1));
    m += hipLinhaFatia(`Q2 (${fmtVol(q1)} a ${fmtVol(q2)})`, comM.filter((i) => i.m >= q1 && i.m < q2));
    m += hipLinhaFatia(`Q3 (${fmtVol(q2)} a ${fmtVol(q3)})`, comM.filter((i) => i.m >= q2 && i.m < q3));
    m += hipLinhaFatia(`Q4 (${fmtVol(q3)} ou mais)`, comM.filter((i) => i.m >= q3));
    m += `<i>Unidades dependem do preço da moeda (1 BTC ≠ 1 PEPE): moeda barata cai nos quartis altos mesmo com pouco dinheiro girando.</i>\n`;
  } else m += "<i>amostra pequena (menos de 4 alertas com unidades)</i>\n";
  // E. os dois filtros juntos
  const corteM = FILTRO_VOL_MIN_MOEDA > 0 ? FILTRO_VOL_MIN_MOEDA : medM;
  m += "\n" + sec(`E. Os dois filtros juntos (USDT ≥ ${fmtVol(F)} e unidades ≥ ${fmtVol(corteM)}${FILTRO_VOL_MIN_MOEDA > 0 ? "" : ", a mediana"})`);
  if (comM.length >= 4 && corteM > 0) {
    const uOk = (i: Item) => i.u >= F, mOk = (i: Item & { m: number }) => i.m >= corteM;
    m += hipLinhaFatia("✅ USDT ok + ✅ unidades ok", comM.filter((i) => uOk(i) && mOk(i)));
    m += hipLinhaFatia("✅ USDT ok + ❌ unidades baixas", comM.filter((i) => uOk(i) && !mOk(i)));
    m += hipLinhaFatia("❌ USDT baixo + ✅ unidades ok", comM.filter((i) => !uOk(i) && mOk(i)));
    m += hipLinhaFatia("❌ USDT baixo + ❌ unidades baixas", comM.filter((i) => !uOk(i) && !mOk(i)));
    const soU = comM.filter(uOk), ambos = comM.filter((i) => uOk(i) && mOk(i));
    const pU = hipPctFun(soU), pA = hipPctFun(ambos);
    if (soU.length >= 8 && ambos.length >= 8 && pU !== null && pA !== null) {
      const dif = Math.round((pA - pU) * 100);
      m += `  → somar o filtro de unidades ao de USDT: ${Math.abs(dif) < 10 ? "quase não muda" : dif > 0 ? `melhora ${dif} pontos` : `piora ${-dif} pontos`} (${pp(pU)} → ${pp(pA)}) e deixa ${ambos.length} de ${soU.length} alertas\n`;
    } else m += "  → amostra pequena pra concluir\n";
  } else m += "<i>amostra pequena</i>\n";
  // leitura final: quanto cada medida separa (metade de cima x metade de baixo, só os que decidiram)
  const separa = (g: Item[], val: (i: Item) => number | null): { pts: number | null; n: number } => {
    const x = g.filter((i) => val(i) !== null && isFinite(val(i) as number));
    if (x.length < 16) return { pts: null, n: x.length };
    const med = qs(x.map((i) => val(i) as number), 0.5);
    const a = hipPctFun(x.filter((i) => (val(i) as number) >= med)), b = hipPctFun(x.filter((i) => (val(i) as number) < med));
    return { pts: a === null || b === null ? null : Math.round((a - b) * 100), n: x.length };
  };
  const sU = separa(itens, (i) => i.u), sM = separa(itens, (i) => i.m);
  const txtS = (s: { pts: number | null }) => (s.pts === null ? "?" : `${s.pts >= 0 ? "+" : ""}${s.pts}`);
  m += `\n📌 <b>Leitura:</b> USDT separa ${txtS(sU)} pontos, unidades separam ${txtS(sM)} <i>(metade de cima − metade de baixo, % funcionou entre os que decidiram)</i>`;
  if (sU.pts === null || sM.pts === null) m += `\n<i>Amostra pequena (precisa de 16+ alertas; tem ${Math.min(sU.n, sM.n)}). Deixe acumular.</i>`;
  m += `\n\n<i>Uso: /volconf 7 (máx. 9 dias, usa as velas). Os alertas de antes da V106 não têm volume.</i>`;
  for (const parte of dividirHtml(m)) await sendTelegram(chatId, parte);
}
// ===== V107: filtro "desde" nos comandos de estatística =====
// "/radarconf 90 desde V104" = só alertas gravados pela V104 em diante (coluna versao). Alerta antigo sem versão entra se for posterior à data
// da versão no Secret VERSAO_DATAS (ex.: V104=2026-10-01,V105=2026-10-08). "/placar 30 desde 05/10" = só alertas desde essa data (hora local).
type Desde = { ms: number | null; v: number | null; rot: string };
const _desdePorChat = new Map<string, Desde>();
const versaoNum = (x: unknown): number | null => { const m = /v?(\d+)/i.exec(String(x ?? "")); return m ? Number(m[1]) : null; };
const dataLocalMs = (y: number, mo: number, d: number): number => Date.UTC(y, mo - 1, d) - X_TZ_OFFSET_H * 3600000;
let _versaoDatas: Map<number, number> | null = null;
function versaoData(v: number): number | null {
  if (!_versaoDatas) {
    _versaoDatas = new Map();
    for (const par of String(Deno.env.get("VERSAO_DATAS") || "").split(",")) {
      const m = /^\s*v?(\d+)\s*=\s*(\d{4})-(\d{1,2})-(\d{1,2})\s*$/i.exec(par);
      if (m) _versaoDatas.set(Number(m[1]), dataLocalMs(Number(m[2]), Number(m[3]), Number(m[4])));
    }
  }
  return _versaoDatas.get(v) ?? null;
}
function parseDesde(t: string): { resto: string; d: Desde | null } {
  const m = /\s+desde\s+(v\d+|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)(?=\s|$)/i.exec(t);
  if (!m) return { resto: t, d: null };
  const resto = (t.slice(0, m.index) + t.slice(m.index + m[0].length)).trim();
  const arg = m[1].toLowerCase();
  if (arg.startsWith("v")) {
    const v = Number(arg.slice(1)), dt = versaoData(v);
    return { resto, d: { v, ms: dt, rot: `da V${v} em diante${dt === null ? " (alertas sem versão gravada ficam de fora: defina VERSAO_DATAS pra incluir os antigos)" : ""}` } };
  }
  const [dd, mm, aa] = arg.split("/").map(Number);
  const agoraLocal = new Date(Date.now() + X_TZ_OFFSET_H * 3600000);
  let ano = aa ? (aa < 100 ? 2000 + aa : aa) : agoraLocal.getUTCFullYear();
  let ms = dataLocalMs(ano, mm, dd);
  if (!aa && ms > Date.now()) ms = dataLocalMs(--ano, mm, dd); // "desde 20/12" em janeiro = dezembro passado
  if (!(mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31)) return { resto, d: null };
  return { resto, d: { v: null, ms, rot: `desde ${String(dd).padStart(2, "0")}/${String(mm).padStart(2, "0")}/${ano}` } };
}
function desdeOk(d: Desde | null | undefined, criadoMs: number, versao: unknown): boolean {
  if (!d) return true;
  if (d.v !== null) {
    const vr = versaoNum(versao);
    if (vr !== null) return vr >= d.v;
    return d.ms !== null && criadoMs >= d.ms;
  }
  return d.ms === null || criadoMs >= d.ms;
}
const desdeDoChat = (chatId: number | string) => _desdePorChat.get(String(chatId)) ?? null;
function aplicarDesde<T extends { criado_em?: any; versao?: any }>(chatId: number | string, rows: T[]): T[] {
  const d = desdeDoChat(chatId);
  return d ? rows.filter((r) => desdeOk(d, new Date(r.criado_em).getTime(), r.versao)) : rows;
}
async function lerPaginadoDesde(chatId: number | string, montar: (de: number, ate: number) => any, max = 2000): Promise<{ data: any[] | null; error: any }> {
  const r = await lerPaginado(montar, max);
  return r.data ? { data: aplicarDesde(chatId, r.data), error: r.error } : r;
}
// ===== V107: margem de erro (intervalo de Wilson, 95%) =====
// "62% ±13" = com essa amostra, o valor verdadeiro provavelmente está entre ~49% e ~75%. Duas fatias cujas faixas se cruzam ainda podem ser a mesma coisa.
function wilson(k: number, n: number): { lo: number; hi: number } | null {
  if (!(n > 0)) return null;
  const z = 1.96, p = k / n, z2 = z * z;
  const centro = (p + z2 / (2 * n)) / (1 + z2 / n), meia = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n);
  return { lo: Math.max(0, centro - meia), hi: Math.min(1, centro + meia) };
}
function pmTxt(k: number, n: number): string {
  if (n < 5) return "";
  const w = wilson(k, n);
  if (!w) return "";
  const p = k / n;
  return ` ±${Math.round(Math.max(p - w.lo, w.hi - p) * 100)}`;
}
// ===== V107: /config mudou — só o que está diferente do padrão =====
function montarConfigMudou(): string {
  const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const num: string[] = [], invalidos: string[] = [];
  for (const [nome, c] of [..._cfgNum.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (c.bruto === undefined || c.bruto === "") continue;
    const v = Number(c.bruto);
    if (!isFinite(v)) invalidos.push(`• ${esc(nome)} = "${esc(c.bruto.slice(0, 40))}" → usando o padrão ${esc(c.padrao)}`);
    else if (v !== Number(c.padrao)) num.push(`• ${esc(nome)} = <b>${esc(c.bruto)}</b> <i>(padrão ${esc(c.padrao)})</i>`);
  }
  const outros: string[] = [];
  try {
    const sensivel = /TOKEN|KEY|SECRET|PASS|SENHA|AUTH|URL|JWT|CHAT_IDS|_IDS$/i;
    const sistema = /^(SUPABASE_|SB_|DENO_|PATH$|HOME$|HOSTNAME$|PWD$|TZ$|LANG|EDGE_|VERCEL|NODE_)/i;
    for (const [nome, val] of Object.entries(Deno.env.toObject()).sort((a, b) => a[0].localeCompare(b[0]))) {
      if (_cfgNum.has(nome) || sistema.test(nome)) continue;
      outros.push(sensivel.test(nome) ? `• ${esc(nome)} <i>(definido, valor oculto)</i>` : `• ${esc(nome)} = <b>${esc(String(val).slice(0, 60))}</b>`);
    }
  } catch { outros.push("<i>(não consegui listar as demais variáveis neste ambiente)</i>"); }
  let m = `⚙️ <b>CONFIG — só o que mudou</b> · ${BOT_VERSAO}\n${DIVISOR}\n`;
  m += `<b>Números diferentes do padrão</b> (${num.length} de ${_cfgNum.size} parâmetros)\n${num.length ? num.join("\n") : "<i>nenhum: tudo no padrão</i>"}\n`;
  if (invalidos.length) m += `\n⚠️ <b>Valores inválidos (ignorados)</b>\n${invalidos.join("\n")}\n`;
  if (outros.length) m += `\n<b>Outros Secrets definidos</b> (liga/desliga, modos, listas)\n${outros.join("\n")}\n`;
  m += `\n<i>/config mostra tudo por seção. Tokens, chaves e listas de chat ficam ocultos.</i>`;
  return m;
}
// ===== V107: RESUMO DAS SOMBRAS (real x sombra), semanal automático e /sombras [dias] =====
// Só lê o placar (retorno em 4h já com taxa), sem buscar velas. Pra detalhe: /reversaoconf, /repsombra e /volconf.
const SOMBRA_RESUMO_ON = (Deno.env.get("SOMBRA_RESUMO") ?? "1") !== "0";
const SOMBRA_RESUMO_DIA = numEnv("SOMBRA_RESUMO_DIA", "0"); // 0 = domingo … 6 = sábado (hora local)
const SOMBRA_RESUMO_H = numEnv("SOMBRA_RESUMO_H", "20");
const SOMBRA_RESUMO_ROW = "_SOMBRA_SEMANAL_";
async function montarResumoSombras(SB: any, dias: number, rowsIn?: any[]): Promise<string> {
  let todas = rowsIn;
  if (!todas) {
    const { data, error } = await lerPaginado((a, b) => SB.from(PLACAR_TABELA).select("*").gt("criado_em", new Date(Date.now() - dias * 86400000).toISOString()).order("criado_em", { ascending: false }).range(a, b), 4000);
    if (error) return `⚠️ Não consegui ler o placar: ${String(error.message || error).replace(/</g, "&lt;")}`;
    todas = (data || []) as any[];
  }
  const base = todas.filter((r) => !ehFinalLog(r) && !ehInvalidoLog(r));
  const ehRepiqueReal = (r: any) => (r.tipo === "fundo" || r.tipo === "topo") && String(r.status || "").includes("REPIQUE");
  const real = (r: any) => !ehSombraRev(r) && !ehSombraRep(r) && !ehSombraVol(r);
  const familias: { nome: string; regra: string; cmd: string; real: any[]; somb: any[] }[] = [
    { nome: "🔄 Reversão", regra: `ADX ≤ ${REV_ADX_MAX}${REV_DI_OBRIGA ? " e DI a favor" : ""}`, cmd: "/reversaoconf",
      real: base.filter((r) => real(r) && r.tipo === "reversao" && !String(r.status || "").includes("REPIQUE")), somb: base.filter(ehSombraRev) },
    { nome: "⭐ Repique", regra: repRegraTxt(), cmd: "/repsombra", real: base.filter((r) => real(r) && ehRepiqueReal(r)), somb: base.filter(ehSombraRep) },
    { nome: "💧 Volume", regra: `volume ≥ ${fmtVol(FILTRO_VOL_MIN_USDT)} USDT`, cmd: "/volconf",
      real: base.filter((r) => real(r) && ["topo", "fundo", "oportunidade", "reversao"].includes(r.tipo) && r.vol_usdt != null && Number(r.vol_usdt) >= FILTRO_VOL_MIN_USDT), somb: base.filter(ehSombraVol) },
  ];
  const est = (g: any[]) => {
    const rs = g.map((r) => retornoLog(r, 240)).filter((x): x is number => x !== null);
    const ac = rs.filter((x) => x > 0).length;
    return { n: rs.length, total: g.length, ac, p: rs.length ? ac / rs.length : NaN, med: _med(rs), w: wilson(ac, rs.length) };
  };
  const lin = (rot: string, e: ReturnType<typeof est>) => e.n ? `  ${rot} (n=${e.n}): acerto 4h ${Math.round(e.p * 100)}%${pmTxt(e.ac, e.n)} · mediana ${_sg(e.med)}\n` : `  ${rot}: ${e.total ? `${e.total} gravado(s), ainda sem 4h conferido` : "nenhum"}\n`;
  let m = `🌑 <b>RESUMO DAS SOMBRAS</b> — últimos ${dias} dia(s)\n${DIVISOR}\n<i>Real = alertou · Sombra = a regra barrou e ficou gravado em silêncio. Acerto em 4h com taxa; ± = margem de erro (95%).</i>\n\n`;
  for (const f of familias) {
    const a = est(f.real), b = est(f.somb);
    m += `<b>${f.nome}</b> · regra: ${f.regra}\n` + lin("real", a) + lin("🌑 sombra", b);
    if (a.n >= 15 && b.n >= 15 && a.w && b.w) {
      const cruza = a.w.lo <= b.w.hi && b.w.lo <= a.w.hi;
      m += cruza ? `  → ainda dentro da margem de erro: não dá pra dizer se a regra ajuda\n`
        : b.p > a.p ? `  → ⚠️ a sombra acerta MAIS: a regra pode estar cortando sinal bom (confira no ${f.cmd})\n`
        : `  → ✅ a regra está filtrando certo (a sombra acerta menos)\n`;
    } else m += `  → amostra pequena (precisa de 15+ com 4h em cada lado)\n`;
    m += "\n";
  }
  m += `<i>Detalhe: /reversaoconf · /repsombra · /volconf. Pra julgar só depois de uma mudança: acrescente "desde V107" ou "desde dd/mm".</i>`;
  return m;
}
async function checarResumoSombras(SB: any) {
  if (!SOMBRA_RESUMO_ON) return;
  const local = new Date(Date.now() + X_TZ_OFFSET_H * 3600000);
  if (local.getUTCDay() !== SOMBRA_RESUMO_DIA || local.getUTCHours() < SOMBRA_RESUMO_H) return;
  const { data } = await SB.from(TAB).select("last_alert_at").eq("instid", SOMBRA_RESUMO_ROW).maybeSingle();
  const ult = data?.last_alert_at ? new Date(data.last_alert_at).getTime() : 0;
  if (ult && Date.now() - ult < 6 * 86400000) return; // já mandou esta semana
  const destinos = ALERT_CHAT_IDS.filter((ch) => !silChat(ch));
  if (!destinos.length) return; // todo mundo em silêncio/pausa: tenta de novo na próxima rodada (ainda hoje)
  const msg = await montarResumoSombras(SB, 7);
  let ok = false;
  for (const ch of destinos) for (const parte of dividirHtml(msg)) { if (await sendTelegram(ch, parte).catch(() => null)) ok = true; }
  if (ok) await upsertLinha(SB, SOMBRA_RESUMO_ROW, { last_alert_at: new Date().toISOString(), last_status: "enviado" });
  console.log(`🌑 resumo semanal das sombras ${ok ? "enviado" : "falhou (tento na próxima rodada)"}`);
}
// ===== V107: /radarsim [dias] [regra] — "operar só pelos radares, segurando X horas" =====
// Mesma régua do /saida: 1R = 1×ATR na entrada, taxa ida e volta descontada, sem funding. Pra comparar com o robô no cruzamento.
// Entrada: DIRETO (preço do alerta, a partir da vela seguinte) ou ROMPIMENTO (rompe a máxima da vela do alerta no LONG / a mínima no
// SHORT, em até RADAR_ENTRADA_VELAS velas; se romper antes o lado oposto da vela, cancela — igual ao /radar).
// Saída: no prazo (fechamento da vela que completa X horas) ou no stop de SAIDA_STOP_ATR×ATR; "sem stop" = só o prazo (como o motor hoje).
// Stop e prazo na mesma vela: conta o stop (pior caso). "regra" = só os alertas que passariam no ADX das regras atuais (topo < TOPO_ADX_MAX,
// fundo < FUNDO_ADX_MAX, repique ≥ REPIQUE_ADX_MIN), com o ADX da vela anterior ao alerta. O DI não entra (não dá pra refazer com fidelidade).
const qsArr = (v: number[], p: number): number => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };
const RADARSIM_CONTRA_VELAS = Math.max(1, Math.round(numEnv("RADARSIM_CONTRA_VELAS", "8"))); // V107: /radarsim cruz — até quantas velas depois do alerta conta o cruzamento "contra o alerta"
const RADARSIM_HORAS: number[] = String(Deno.env.get("RADARSIM_HORAS") || "4,8,24").split(",").map((x: string) => Number(x.trim())).filter((x: number) => x > 0 && x <= 72);
// V107: cada simulação devolve também o MAE (quanto o preço andou CONTRA, em % do preço de entrada, até a saída) pra mostrar a cauda
type SimRes = { r: number; pct: number; saida: "stop" | "alvo" | "prazo" | "cruz" | "trail"; mae: number; pernas?: number } | null; // null = ainda em aberto / sem dados
// stopAtr 0 = sem stop · alvoR 0 = sem alvo (1R = 1×ATR) · trailAtr = stop móvel a X ATR do melhor preço (0 = sem), armado depois de armaAtr ATR a favor
// (padrão = trailAtr) · beAtr = depois de X ATR a favor o stop vai pra entrada (0 = sem). O stop móvel só muda no FIM da vela (vale a partir da seguinte).
type SimCfg = { stopAtr: number; alvoR: number; trailAtr?: number; armaAtr?: number; beAtr?: number };
const simCfgTxt = (c: SimCfg): string => `${c.stopAtr > 0 ? `stop ${c.stopAtr} ATR` : "sem stop"} · ${c.alvoR > 0 ? `alvo ${c.alvoR}R` : "sem alvo"}${(c.trailAtr ?? 0) > 0 ? ` · stop móvel ${c.trailAtr} ATR${(c.armaAtr ?? 0) > 0 && c.armaAtr !== c.trailAtr ? ` (arma em +${c.armaAtr} ATR)` : ""}` : ""}${(c.beAtr ?? 0) > 0 ? ` · zero a zero em +${c.beAtr} ATR` : ""}`;
function simSegurar(d: XVelas, kIni: number, lado: HipLado, entrada: number, atr: number, barras: number, cfg: SimCfg, checaVelaEntrada: boolean): SimRes {
  if (!(atr > 0) || !(entrada > 0)) return null;
  const long = lado === "long";
  const temStop = cfg.stopAtr > 0, temAlvo = cfg.alvoR > 0;
  const trail = cfg.trailAtr ?? 0, arma = (cfg.armaAtr ?? 0) > 0 ? cfg.armaAtr! : trail, be = cfg.beAtr ?? 0;
  const stop0 = long ? entrada - cfg.stopAtr * atr : entrada + cfg.stopAtr * atr;
  let stopAt = temStop ? stop0 : long ? -Infinity : Infinity; // V107: stop que pode subir (móvel / zero a zero)
  let moveu = false, pico = entrada;
  const alvo = long ? entrada + cfg.alvoR * atr : entrada - cfg.alvoR * atr;
  const taxaPx = (entrada * TAXA_IDA_VOLTA_PCT) / 100;
  let mae = 0;
  const contraEm = (k: number) => Math.max(0, ((long ? entrada - d.l[k] : d.h[k] - entrada) / entrada) * 100);
  const fecha = (px: number, saida: "stop" | "alvo" | "prazo" | "trail") => {
    const bruto = long ? px - entrada : entrada - px, liq = bruto - taxaPx;
    return { r: liq / atr, pct: (liq / entrada) * 100, saida, mae };
  };
  const kFim = kIni + barras - 1;
  if (kFim > d.c.length - 1) return null; // o prazo ainda não terminou
  const tocouStop = (k: number) => (long ? d.l[k] <= stopAt : d.h[k] >= stopAt);
  const tocouAlvo = (k: number) => temAlvo && (long ? d.h[k] >= alvo : d.l[k] <= alvo);
  if (checaVelaEntrada) { // vela do rompimento: só o stop inicial conta (pior caso), o alvo não
    mae = Math.max(mae, contraEm(kIni - 1));
    if (temStop && tocouStop(kIni - 1)) return fecha(stop0, "stop");
  }
  for (let k = kIni; k <= kFim; k++) {
    if (tocouStop(k)) { // stop antes do alvo na mesma vela (pior caso)
      if (!moveu) mae = Math.max(mae, (cfg.stopAtr * atr / entrada) * 100); else mae = Math.max(mae, contraEm(k));
      return fecha(long ? Math.min(stopAt, d.o[k]) : Math.max(stopAt, d.o[k]), moveu ? "trail" : "stop");
    }
    mae = Math.max(mae, contraEm(k));
    if (tocouAlvo(k)) return fecha(long ? Math.max(alvo, d.o[k]) : Math.min(alvo, d.o[k]), "alvo");
    // fim da vela: atualiza o melhor preço e sobe o stop (zero a zero / móvel) pra valer a partir da próxima vela
    pico = long ? Math.max(pico, d.h[k]) : Math.min(pico, d.l[k]);
    const fav = long ? pico - entrada : entrada - pico;
    if (be > 0 && fav >= be * atr) { const n2 = long ? Math.max(stopAt, entrada) : Math.min(stopAt, entrada); if (n2 !== stopAt) { stopAt = n2; moveu = true; } }
    if (trail > 0 && fav >= arma * atr) { const s2 = long ? pico - trail * atr : pico + trail * atr; const n2 = long ? Math.max(stopAt, s2) : Math.min(stopAt, s2); if (n2 !== stopAt) { stopAt = n2; moveu = true; } }
  }
  return fecha(d.c[kFim], "prazo");
}
// V107: uma perna que também sai quando a moeda FECHA cruzada do outro lado da faixa (cruzouContra(k) = true no fechamento da vela k)
function simPerna(d: XVelas, kIni: number, lado: HipLado, entrada: number, atr: number, barras: number, cfg: SimCfg, cruzouContra: (k: number) => boolean): (NonNullable<SimRes> & { kSaida: number }) | null {
  if (!(atr > 0) || !(entrada > 0)) return null;
  const long = lado === "long";
  const stop = long ? entrada - cfg.stopAtr * atr : entrada + cfg.stopAtr * atr, alvo = long ? entrada + cfg.alvoR * atr : entrada - cfg.alvoR * atr;
  const taxaPx = (entrada * TAXA_IDA_VOLTA_PCT) / 100;
  let mae = 0;
  const fecha = (px: number, saida: "stop" | "alvo" | "prazo" | "cruz", k: number) => {
    const liq = (long ? px - entrada : entrada - px) - taxaPx;
    return { r: liq / atr, pct: (liq / entrada) * 100, saida, mae, kSaida: k };
  };
  const kFim = kIni + barras - 1;
  for (let k = kIni; k <= Math.min(kFim, d.c.length - 1); k++) {
    if (cfg.stopAtr > 0 && (long ? d.l[k] <= stop : d.h[k] >= stop)) { mae = Math.max(mae, ((cfg.stopAtr * atr) / entrada) * 100); return fecha(long ? Math.min(stop, d.o[k]) : Math.max(stop, d.o[k]), "stop", k); }
    mae = Math.max(mae, Math.max(0, ((long ? entrada - d.l[k] : d.h[k] - entrada) / entrada) * 100));
    if (cfg.alvoR > 0 && (long ? d.h[k] >= alvo : d.l[k] <= alvo)) return fecha(long ? Math.max(alvo, d.o[k]) : Math.min(alvo, d.o[k]), "alvo", k);
    if (cruzouContra(k)) return fecha(d.c[k], "cruz", k);
    if (k === kFim) return fecha(d.c[k], "prazo", k);
  }
  return null; // acabaram as velas antes de sair
}
async function runRadarSim(chatId: number | string, dias: number, soRegra: boolean, cfg: SimCfg, horas: number[], porBtc: { ent: "direto" | "romp"; por?: "btc" | "mov" } | null = null, cruz = false, viradasLista: number[] = []) {
  // V107: cruz = em vez dos radares, os alertas do CRUZAMENTO (oportunidade, reversão, compressão), entrando no MESMO preço em que o robô entrou
  // (fechamento da vela do cruzamento) e saindo pelo stop/alvo/prazo escolhido: mede "ligo no alerta, o robô entra, desligo e sigo com stop manual".
  const SB = getSupabase();
  if (!SB) { await sendTelegram(chatId, "⚠️ Supabase não configurado."); return; }
  const dd = Math.min(9, Math.max(1, Math.round(dias || 9)));
  const { data, error } = await lerPaginadoDesde(chatId, (a, b) => SB.from(PLACAR_TABELA).select("*").gt("criado_em", new Date(Date.now() - dd * 86400000).toISOString()).in("tipo", cruz ? ["oportunidade", "reversao", "compressao"] : ["topo", "fundo"]).order("criado_em", { ascending: false }).range(a, b));
  if (error) { await sendTelegram(chatId, `⚠️ Não consegui ler os alertas: ${String(error.message || error).replace(/</g, "&lt;")}`); return; }
  // cruz: só o que o robô de fato entrou (ent_status 'entrou'); o alerta dos minutos finais conta (o repetido do mesmo cruzamento já sai pelo ehDescartadoLog)
  const rows = ((data || []) as any[]).filter((r) => Number(r.preco) > 0 && r.criado_em && !ehDescartadoLog(r) && (cruz ? (r.ent_status === "entrou" && !!r.ent_em) || r.ent_status === "contra" : !ehFinalLog(r)));
  if (!rows.length) { await sendTelegram(chatId, cruz ? `🧪 <b>SIMULAÇÃO DO CRUZAMENTO</b>\n\nNenhuma entrada conferida nos últimos ${dd} dia(s).` : `🧪 <b>SIMULAÇÃO DOS RADARES</b>\n\nNenhum alerta de radar nos últimos ${dd} dia(s).`); return; }
  const porMoeda = new Map<string, any[]>();
  for (const r of rows) { const a = porMoeda.get(r.instid) || []; a.push(r); porMoeda.set(r.instid, a); }
  const TFMS = TF_MIN * 60000;
  const chave = (ent: string, h: number) => `${ent}|${h}`;
  type Item = { tipo: string; fresco: boolean; soContra: boolean; contra: Map<number, SimRes> | null; vir: Map<string, SimRes>; res: Map<string, SimRes>; naoEntrou: number; btc: RegimeBtc | null; mov: number | null };
  const itens: Item[] = [];
  let foraRegra = 0;
  const regimeBtc = porBtc && porBtc.por !== "mov" ? await btcRegimeFn() : () => null; // V107: só busca o BTC quando pedido (/radarsim ... btc)
  await emLotes([...porMoeda.keys()], 5, async (id) => {
    const d = await xCandles(id, TIMEFRAME, SAIDA_CANDLES).catch(() => null);
    if (!d) return;
    const adxS = soRegra && !cruz ? xAdxSerie(d.h, d.l, d.c, 14) : [];
    const jd = cruz ? superV2(d.c, PESO_SUPREMA) : null; // V107: faixa do robô, pra achar o cruzamento CONTRA o alerta
    const alem = (k: number, l: HipLado) => !!jd && (l === "long" ? d.c[k] > Math.max(jd[k].suprema, jd[k].j6) : d.c[k] < Math.min(jd[k].suprema, jd[k].j6));
    for (const r of porMoeda.get(id)!) {
      const emMs = new Date(r.criado_em).getTime();
      let k0 = -1;
      const soContra = cruz && r.ent_status === "contra"; // o robô nem entrou: cruzou do outro lado antes
      if (cruz && !soContra) { // vela do cruzamento: a que FECHA em ent_em
        const entMs = new Date(r.ent_em).getTime();
        for (let i = d.t.length - 1; i >= 0; i--) { if (d.t[i] < entMs && entMs <= d.t[i] + TFMS) { k0 = i; break; } }
      } else if (soContra) { // última vela já fechada na hora do alerta
        for (let i = d.t.length - 1; i >= 0; i--) { if (d.t[i] + TFMS <= emMs) { k0 = i; break; } }
      } else for (let i = d.t.length - 1; i >= 0; i--) { if (d.t[i] <= emMs && emMs < d.t[i] + TFMS) { k0 = i; break; } }
      if (k0 < 20 || k0 >= d.c.length - 1) continue;
      const tipo: string = cruz ? String(r.tipo) : String(r.status).includes("REPIQUE") ? "repique" : r.tipo === "fundo" ? "fundo" : "topo";
      const lado: HipLado = r.lado === "long" ? "long" : "short";
      if (soRegra && !cruz) {
        const a = adxNaVela(adxS, k0 - 1); // V109: alinhado à vela (antes lia 27 velas à frente)
        const ok = !Number.isFinite(a) ? true
          : tipo === "repique" ? !(REPIQUE_ADX_MIN > 0) || a >= REPIQUE_ADX_MIN
          : tipo === "topo" ? !(TOPO_ADX_MAX > 0) || a < TOPO_ADX_MAX
          : !(FUNDO_ADX_MAX > 0) || a < FUNDO_ADX_MAX;
        if (!ok) { foraRegra++; continue; }
      }
      const atr = calcATR(d.h.slice(0, k0 + 1), d.l.slice(0, k0 + 1), d.c.slice(0, k0 + 1), 14);
      if (!(atr > 0)) continue;
      const hi = d.h[k0], lo = d.l[k0], long = lado === "long";
      let kR = -1, pxR = 0, cancelou = false;
      for (let k = k0 + 1; k <= Math.min(k0 + RUP_ESPERA, d.c.length - 1); k++) {
        const gat = long ? d.h[k] > hi : d.l[k] < lo, contra = long ? d.l[k] < lo : d.h[k] > hi;
        if (gat) { kR = k; pxR = long ? Math.max(hi, d.o[k]) : Math.min(lo, d.o[k]); break; }
        if (contra) { cancelou = true; break; }
      }
      const res = new Map<string, SimRes>();
      for (const h of horas) {
        const barras = Math.max(1, Math.round((h * 60) / TF_MIN));
        res.set(chave("direto", h), soContra ? null : simSegurar(d, k0 + 1, lado, Number(r.preco), atr, barras, cfg, false));
        res.set(chave("romp", h), !soContra && kR > 0 ? simSegurar(d, kR + 1, lado, pxR, atr, barras, cfg, true) : null);
      }
      // V107: CONTRA O ALERTA — se em até RADARSIM_CONTRA_VELAS velas a moeda fecha cruzada do OUTRO lado da faixa (o alerta falhou),
      // entra a favor desse cruzamento (no fechamento dele), uma vez só, com o mesmo stop/alvo/prazo. Não é a cadeia de viradas do /saida.
      let contra: Map<number, SimRes> | null = null;
      if (cruz && jd) {
        const oposto: HipLado = lado === "long" ? "short" : "long";
        for (let k = k0 + 1; k <= Math.min(k0 + RADARSIM_CONTRA_VELAS, d.c.length - 2); k++) {
          if (alem(k, oposto)) {
            const atrC = calcATR(d.h.slice(0, k + 1), d.l.slice(0, k + 1), d.c.slice(0, k + 1), 14);
            contra = new Map();
            for (const h of horas) contra.set(h, simSegurar(d, k + 1, oposto, d.c[k], atrC, Math.max(1, Math.round((h * 60) / TF_MIN)), cfg, false));
            break;
          }
        }
      }
      // V107: CADEIA com até N viradas: cada perna sai no stop/alvo/prazo ou no cruzamento contra; só vira se saiu pelo cruzamento e ainda sobra virada
      const vir = new Map<string, SimRes>();
      if (cruz && jd && viradasLista.length) {
        const cruzou = (l: HipLado) => (k: number) => alem(k, l === "long" ? "short" : "long");
        for (const nV of viradasLista) for (const h of horas) {
          const barras = Math.max(1, Math.round((h * 60) / TF_MIN));
          let ladoP = lado, entP = Number(r.preco), kP = k0 + 1, atrP = atr, usadas = 0, pernas = 0, somaR = 0, somaPct = 0, maeMax = 0;
          let ult: "stop" | "alvo" | "prazo" | "cruz" | "trail" = "prazo", aberta = false;
          if (soContra) { // o robô nem entrou: a 1ª perna já é a virada (precisa de pelo menos 1)
            let kC = -1;
            for (let k = k0 + 1; k <= Math.min(k0 + RADARSIM_CONTRA_VELAS, d.c.length - 2); k++) if (alem(k, lado === "long" ? "short" : "long")) { kC = k; break; }
            if (nV < 1 || kC < 0) continue;
            ladoP = lado === "long" ? "short" : "long"; entP = d.c[kC]; kP = kC + 1; usadas = 1;
            atrP = calcATR(d.h.slice(0, kC + 1), d.l.slice(0, kC + 1), d.c.slice(0, kC + 1), 14);
          }
          for (;;) {
            const pp = simPerna(d, kP, ladoP, entP, atrP, barras, cfg, cruzou(ladoP));
            if (!pp) { aberta = true; break; }
            pernas++; somaR += pp.r; somaPct += pp.pct; maeMax = Math.max(maeMax, pp.mae); ult = pp.saida;
            if (pp.saida !== "cruz" || usadas >= nV || pp.kSaida >= d.c.length - 2) break;
            usadas++;
            ladoP = ladoP === "long" ? "short" : "long"; entP = d.c[pp.kSaida]; kP = pp.kSaida + 1;
            atrP = calcATR(d.h.slice(0, pp.kSaida + 1), d.l.slice(0, pp.kSaida + 1), d.c.slice(0, pp.kSaida + 1), 14);
          }
          vir.set(`${nV}|${h}`, aberta ? null : { r: somaR, pct: somaPct, saida: ult, mae: maeMax, pernas });
        }
      }
      itens.push({ tipo, fresco: r.fresco === true, soContra, contra, vir, res, naoEntrou: kR > 0 ? 0 : cancelou || k0 + RUP_ESPERA <= d.c.length - 1 ? 1 : 0, btc: regimeBtc(emMs), mov: r.pct24 != null && isFinite(Number(r.pct24)) ? Math.abs(Number(r.pct24)) : null });
    }
  });
  if (!itens.length) { await sendTelegram(chatId, "🧪 <b>SIMULAÇÃO DOS RADARES</b>\n\nNão consegui as velas dos alertas. Tente de novo em alguns minutos."); return; }
  const hTxt = (h: number) => (h < 1 ? `${Math.round(h * 60)}min` : `${h}h`);
  const linha = (g: Item[], ent: string, h: number): string => linhaXs(g.map((i) => i.res.get(chave(ent, h))), h);
  const linhaXs = (lista: (SimRes | undefined)[], h: number): string => {
    const xs = lista.filter((x): x is NonNullable<SimRes> => !!x);
    if (!xs.length) return `  ${hTxt(h)}: <i>ainda sem resultado</i>\n`;
    const rs = xs.map((x) => x.r), ac = rs.filter((x) => x > 0).length, pf = _profitFactor(rs);
    const media = rs.reduce((t, x) => t + x, 0) / rs.length;
    const sem3 = rs.length > 5 ? [...rs].sort((a, b) => b - a).slice(3) : null;
    const st = xs.filter((x) => x.saida === "stop").length, al = xs.filter((x) => x.saida === "alvo").length, tr = xs.filter((x) => x.saida === "trail").length;
    const maes = xs.map((x) => x.mae);
    return `  ${hTxt(h)} (n=${xs.length}): acerto ${Math.round((ac / xs.length) * 100)}%${pmTxt(ac, xs.length)} · média ${media >= 0 ? "+" : ""}${media.toFixed(2)}R · PF ${isFinite(pf) ? pf.toFixed(2) : pf === Infinity ? "∞" : "—"}${sem3 ? ` · sem os 3 melhores ${(sem3.reduce((t, x) => t + x, 0) / sem3.length).toFixed(2)}R` : ""}${cfg.stopAtr > 0 ? ` · ${st} stop` : ""}${cfg.alvoR > 0 ? ` · ${al} alvo` : ""}${tr ? ` · ${tr} stop móvel/zero a zero` : ""}${xs.length < 15 ? " ⚠️" : ""}\n` +
      `     pior ${Math.min(...rs).toFixed(2)}R · contra máx.: mediana ${_med(maes).toFixed(1)}% · 90% até ${qsArr(maes, 0.9).toFixed(1)}% · pior ${Math.max(...maes).toFixed(1)}%\n`;
  };
  const bloco = (titulo: string, gTodos: Item[]): string => {
    const g = gTodos.filter((i) => !i.soContra); // os que o robô nem entrou só aparecem no "contra o alerta"
    if (!gTodos.length) return "";
    if (porBtc) { // V107: separado pelo humor do BTC ou pelo movimento da moeda no dia, uma forma de entrada só (pra caber)
      let t = `${MINI_DIVISOR}\n<b>${titulo}</b> (n=${g.length}) · ${porBtc.ent === "direto" ? "direto no alerta" : "no rompimento da vela"}\n${MINI_DIVISOR}\n`;
      const fatias: [string, (i: Item) => boolean][] = porBtc.por === "mov"
        ? MOV_FAIXAS.map(([nome, a, b]) => [`📏 |24h| ${nome}`, (i: Item) => i.mov !== null && i.mov >= a && i.mov < b] as [string, (i: Item) => boolean])
        : (["sobe", "cai", "lado"] as RegimeBtc[]).map((rg) => [REGIME_TXT[rg], (i: Item) => i.btc === rg] as [string, (i: Item) => boolean]);
      for (const [nome, f] of fatias) {
        const gg = g.filter(f);
        if (!gg.length) continue;
        t += `<b>${nome}</b> (n=${gg.length})\n`;
        for (const h of horas) t += linha(gg, porBtc.ent, h);
      }
      const sem = g.filter((i) => (porBtc.por === "mov" ? i.mov === null : i.btc === null)).length;
      return t + (sem ? `<i>${sem} sem ${porBtc.por === "mov" ? "a variação de 24h gravada" : "o BTC da hora (fora da janela de velas)"}</i>\n` : "") + "\n";
    }
    const ne = g.reduce((t, i) => t + i.naoEntrou, 0);
    let t = `${MINI_DIVISOR}\n<b>${titulo}</b> (n=${g.length})\n${MINI_DIVISOR}\n`;
    for (const ent of ["direto", "romp"] as const) {
      t += `<b>${ent === "direto" ? "Direto no alerta" : "No rompimento da vela"}</b>${ent === "romp" ? ` <i>(não rompeu/cancelou: ${ne})</i>` : ""}\n`;
      for (const h of horas) t += linha(g, ent, h);
    }
    if (cruz) {
      const viraram = gTodos.filter((i) => i.contra);
      t += `<b>↩️ Contra o alerta</b> <i>(a moeda fechou cruzada do outro lado em até ${RADARSIM_CONTRA_VELAS} velas: ${viraram.length} de ${gTodos.length} alertas${gTodos.length - g.length ? `, ${gTodos.length - g.length} deles antes do robô entrar` : ""}; entra a favor do novo cruzamento, uma vez só)</i>\n`;
      if (viraram.length) for (const h of horas) t += linhaXs(viraram.map((i) => i.contra!.get(h) ?? null), h);
      for (const nV of viradasLista) { // V107: comparação por número máximo de viradas
        const xsN = (h: number) => gTodos.map((i) => i.vir.get(`${nV}|${h}`));
        const pern = gTodos.map((i) => i.vir.get(`${nV}|${horas[0]}`)).filter((x): x is NonNullable<SimRes> => !!x).map((x) => x.pernas ?? 1);
        t += `<b>🔁 Até ${nV} virada(s)</b> <i>(cada perna sai no stop/alvo/prazo ou no cruzamento contra; resultado = soma das pernas${pern.length ? ` · ${(pern.reduce((a2, b2) => a2 + b2, 0) / pern.length).toFixed(1)} perna(s)/alerta em ${hTxt(horas[0])}` : ""})</i>\n`;
        for (const h of horas) t += linhaXs(xsN(h), h);
      }
    }
    return t + "\n";
  };
  const cfgTxt = `${simCfgTxt(cfg)} · prazo ${horas.map(hTxt).join("/")}`;
  let m = cruz ? `🧪 <b>SIMULAÇÃO: LIGO NO ALERTA, O ROBÔ ENTRA, DESLIGO E SIGO COM STOP</b> — ${dd} dia(s)${porBtc ? (porBtc.por === "mov" ? " · por movimento da moeda no dia" : " · por humor do BTC") : ""}\n<b>${cfgTxt}</b> (velas de 15m)\n${DIVISOR}\n<i>Entrada = preço em que o robô entrou (fechamento da vela do cruzamento), uma operação por alerta, SEM virar. "Direto" = a partir daí; "rompimento" = só se a vela seguinte romper o extremo da vela do cruzamento.</i>\n` : `🧪 <b>SIMULAÇÃO: OPERAR SÓ PELOS RADARES</b> — ${dd} dia(s)${soRegra ? " · só o que passa no ADX das regras atuais" : ""}${porBtc ? (porBtc.por === "mov" ? " · por movimento da moeda no dia" : " · por humor do BTC") : ""}\n<b>${cfgTxt}</b> (velas de 15m)\n${DIVISOR}\n`;
  if (porBtc && porBtc.por !== "mov") m += `<i>Humor do BTC = variação nas 24h até a vela anterior ao alerta: subindo ≥ +${REGIME_BTC_PCT}% · caindo ≤ −${REGIME_BTC_PCT}% · resto = de lado (REGIME_BTC_PCT).</i>\n`;
  m += `<i>Mesma régua do /saida: 1R = 1×ATR do 15m na entrada, taxa de ${TAXA_IDA_VOLTA_PCT.toFixed(2)}% descontada, sem funding. Sai no stop, no alvo ou no prazo, o que vier primeiro; stop e alvo na mesma vela = stop (pior caso). "Contra máx." = quanto o preço andou contra (em % do preço, sem alavancagem) antes de sair: multiplique pela alavancagem pra ver o tamanho do susto. ± = margem de erro do acerto.</i>\n`;
  if (soRegra && !cruz) m += `<i>${foraRegra} alerta(s) ficaram de fora por ADX (topo &lt; ${TOPO_ADX_MAX} · fundo &lt; ${FUNDO_ADX_MAX} · repique ≥ ${REPIQUE_ADX_MIN}); o DI não entra no filtro.</i>\n`;
  m += "\n";
  if (cruz) {
    m += bloco("🚀 Oportunidade", itens.filter((i) => i.tipo === "oportunidade"));
    m += bloco("🔄 Reversão", itens.filter((i) => i.tipo === "reversao"));
    m += bloco("🆕 Oportunidade + reversão, só cruzou agora", itens.filter((i) => i.tipo !== "compressao" && i.fresco));
    m += bloco("🗜️ Compressão", itens.filter((i) => i.tipo === "compressao"));
    m += bloco("📊 Oportunidade + reversão", itens.filter((i) => i.tipo !== "compressao"));
  } else {
    m += bloco("🔴 Topo (SHORT)", itens.filter((i) => i.tipo === "topo"));
    m += bloco("🟢 Fundo (LONG)", itens.filter((i) => i.tipo === "fundo"));
    m += bloco("⭐ Repique", itens.filter((i) => i.tipo === "repique"));
    m += bloco("📡 Todos os radares", itens);
  }
  m += `<i>Os alertas entram em sequência, sem limite de posições nem de capital. Prazo ainda não terminado = fora da conta. Ex.: /radarsim 9 regra stop1 alvo2 horas 1,2,4 · /radarsim 9 stop3 horas 4,8,24 · stop0 = sem stop · alvo0 = sem alvo · trailX = stop móvel · armaY = arma depois de +Y ATR · beX = zero a zero · btc = separa pelo humor do BTC · mov = separa pelo movimento da moeda no dia (com "romp", no rompimento) · cruz = alertas do cruzamento (ligo no alerta, o robô entra, desligo e sigo com stop) · com cruz, viradas 0,1,3 = compara até N viradas. Stop de 2 a 3 ATR do 15m ≈ 1 ATR do 1h.</i>`;
  await enviarEmPartes(chatId, m);
}
// ===== V107: /facasim [dias] [foguete] [stopX] [alvoX] [horas a,b] — onde entrar no modo faca (ou foguete) =====
// Compara três entradas nos MESMOS candidatos, a partir das velas (não precisa gravar nada novo; vale pros candidatos já guardados):
// (1) direto no preço do candidato; (2) rompendo a mínima da vela do candidato (máxima no foguete) em até RUP_ESPERA velas, cancela se romper o outro
// lado antes (a ideia que o alerta da faca descreve); (3) rompendo o ÚLTIMO FUNDO ANTERIOR ainda não perdido (topo no foguete): o pivô mais recente
// (FACASIM_PIVO_ESQ velas à esquerda e FACASIM_PIVO_DIR à direita, já confirmado na vela do candidato, até FACASIM_PIVO_VELAS velas pra trás) que
// nenhuma vela depois dele furou; espera até FACASIM_ESPERA velas. Entrada no nível (ou na abertura, se abrir além) e o stop é conferido já na vela do
// rompimento (pior caso). 1R = 1×ATR da vela do candidato, taxa descontada. Pra comparar em pé de igualdade, também mostra o "direto" só nos que romperam.
const FACASIM_PIVO_ESQ = numEnv("FACASIM_PIVO_ESQ", "5");
const FACASIM_PIVO_DIR = numEnv("FACASIM_PIVO_DIR", "3");
const FACASIM_PIVO_VELAS = numEnv("FACASIM_PIVO_VELAS", "96");
const FACASIM_ESPERA = numEnv("FACASIM_ESPERA", "16");
// V107: sem stop/alvo no comando, compara este pacote (apertado, padrão, solto, alvo curto, zero a zero e stop móvel sem alvo)
const FACASIM_PACOTE: SimCfg[] = [
  { stopAtr: 0.5, alvoR: 2 }, { stopAtr: 1, alvoR: 2 }, { stopAtr: 2, alvoR: 2 }, { stopAtr: 1, alvoR: 1 },
  { stopAtr: 1, alvoR: 2, beAtr: 1 }, { stopAtr: 1, alvoR: 0, trailAtr: 1, armaAtr: 1 },
];
async function runFacaSim(chatId: number | string, dias: number, foguete: boolean, cfgs: SimCfg[], horas: number[]) {
  const SB = getSupabase();
  if (!SB) { await sendTelegram(chatId, "⚠️ Supabase não configurado."); return; }
  const dd = Math.min(9, Math.max(1, Math.round(dias || 7)));
  const lista = foguete ? await fogueteLer(SB) : await facaLer(SB);
  const titulo = foguete ? "🚀 <b>FOGUETE: ONDE ENTRAR</b>" : "🔪 <b>FACA: ONDE ENTRAR</b>";
  if (!lista) { await sendTelegram(chatId, `⚠️ Não consegui ler o modo ${foguete ? "foguete" : "faca"} no Supabase.`); return; }
  const corteMs = Date.now() - dd * 86400000;
  const cands = lista.filter((r) => r.t > corteMs && Number(r.p) > 0 && desdeOk(desdeDoChat(chatId), r.t, r.v));
  if (!cands.length) { await sendTelegram(chatId, `${titulo}\n\nNenhum candidato gravado nos últimos ${dd} dia(s).`); return; }
  const lado: HipLado = foguete ? "long" : "short", long = foguete;
  const porMoeda = new Map<string, FacaReg[]>();
  for (const r of cands) { const a = porMoeda.get(r.i) || []; a.push(r); porMoeda.set(r.i, a); }
  const TFMS = TF_MIN * 60000, E = Math.max(1, FACASIM_PIVO_ESQ), D = Math.max(1, FACASIM_PIVO_DIR);
  type It = { dir: Map<string, SimRes>; vela: Map<string, SimRes> | null; piv: Map<string, SimRes> | null; temPiv: boolean; distAtr: number | null; velasAte: number | null };
  const itens: It[] = [];
  await emLotes([...porMoeda.keys()], 5, async (id) => {
    const d = await xCandles(id, TIMEFRAME, SAIDA_CANDLES).catch(() => null);
    if (!d) return;
    for (const r of porMoeda.get(id)!) {
      let k0 = -1;
      for (let i = d.t.length - 1; i >= 0; i--) { if (d.t[i] <= r.t && r.t < d.t[i] + TFMS) { k0 = i; break; } }
      if (k0 < E + D + 20 || k0 >= d.c.length - 1) continue;
      const atr = calcATR(d.h.slice(0, k0 + 1), d.l.slice(0, k0 + 1), d.c.slice(0, k0 + 1), 14);
      if (!(atr > 0)) continue;
      const px = Number(r.p);
      const sim = (kIni: number, ent: number, checa: boolean) => {
        const mp = new Map<string, SimRes>();
        cfgs.forEach((cf, ci) => { for (const h of horas) mp.set(`${ci}|${h}`, simSegurar(d, kIni, lado, ent, atr, Math.max(1, Math.round((h * 60) / TF_MIN)), cf, checa)); });
        return mp;
      };
      // (2) rompimento da vela do candidato
      const hi = d.h[k0], lo = d.l[k0];
      let kV = -1, pxV = 0;
      for (let k = k0 + 1; k <= Math.min(k0 + RUP_ESPERA, d.c.length - 1); k++) {
        const gat = long ? d.h[k] > hi : d.l[k] < lo, contra = long ? d.l[k] < lo : d.h[k] > hi;
        if (gat) { kV = k; pxV = long ? Math.max(hi, d.o[k]) : Math.min(lo, d.o[k]); break; }
        if (contra) break;
      }
      // (3) último fundo (topo no foguete) anterior ainda não perdido: pivô confirmado até a vela do candidato
      let nivel: number | null = null;
      for (let j = k0 - D; j >= Math.max(E, k0 - FACASIM_PIVO_VELAS); j--) {
        let ehPiv = true;
        for (let x = j - E; x <= j + D && ehPiv; x++) if (x !== j && (long ? d.h[x] >= d.h[j] : d.l[x] <= d.l[j])) ehPiv = false;
        if (!ehPiv) continue;
        const nv = long ? d.h[j] : d.l[j];
        let furado = false;
        for (let x = j + 1; x <= k0 && !furado; x++) if (long ? d.h[x] > nv : d.l[x] < nv) furado = true;
        if (!furado) { nivel = nv; break; }
      }
      let kP = -1, pxP = 0;
      if (nivel !== null) for (let k = k0 + 1; k <= Math.min(k0 + FACASIM_ESPERA, d.c.length - 1); k++) {
        if (long ? d.h[k] > nivel : d.l[k] < nivel) { kP = k; pxP = long ? Math.max(nivel, d.o[k]) : Math.min(nivel, d.o[k]); break; }
      }
      itens.push({
        dir: sim(k0 + 1, px, false),
        vela: kV > 0 ? sim(kV + 1, pxV, true) : null,
        piv: kP > 0 ? sim(kP + 1, pxP, true) : null,
        temPiv: nivel !== null,
        distAtr: nivel !== null ? Math.abs(px - nivel) / atr : null,
        velasAte: kP > 0 ? kP - k0 : null,
      });
    }
  });
  if (!itens.length) { await sendTelegram(chatId, `${titulo}\n\nNão consegui as velas dos candidatos. Tente de novo em alguns minutos.`); return; }
  const fmt = (xs: SimRes[]): string => {
    const v = xs.filter((x): x is NonNullable<SimRes> => !!x);
    if (!v.length) return "<i>sem resultado</i>";
    const rs = v.map((x) => x.r), ac = rs.filter((x) => x > 0).length, med = rs.reduce((t, x) => t + x, 0) / rs.length;
    const sem3 = rs.length > 5 ? [...rs].sort((a, b) => b - a).slice(3) : null;
    const sg = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(2)}`;
    return `${Math.round((ac / rs.length) * 100)}% ${sg(med)}R${sem3 ? ` (s/3 ${sg(sem3.reduce((t, x) => t + x, 0) / sem3.length)})` : ""}${rs.length < 15 ? "⚠️" : ""}`;
  };
  const hTxt = (h: number) => (h < 1 ? `${Math.round(h * 60)}min` : `${h}h`);
  const linha = (rot: string, g: It[], pega: (i: It) => Map<string, SimRes> | null, ci: number) =>
    `  ${rot} (n=${g.filter((i) => pega(i)).length}): ${horas.map((h) => `${hTxt(h)} ${fmt(g.map((i) => pega(i)?.get(`${ci}|${h}`) ?? null))}`).join(" · ")}\n`;
  const nVela = itens.filter((i) => i.vela).length, comPiv = itens.filter((i) => i.temPiv), nPiv = itens.filter((i) => i.piv).length;
  const dists = comPiv.map((i) => i.distAtr!).filter((x) => isFinite(x)), vAte = itens.map((i) => i.velasAte).filter((x): x is number => x !== null);
  const ext = foguete ? "topo" : "fundo", romp = foguete ? "máxima" : "mínima";
  const romperam = itens.filter((i) => i.piv), naoRomperam = itens.filter((i) => !i.piv);
  let m = `${titulo} — ${dd} dia(s) · ${itens.length} candidato(s) · ${foguete ? "LONG" : "SHORT"} de continuação\n${DIVISOR}\n`;
  m += `<i>1R = 1×ATR da vela do candidato · taxa de ${TAXA_IDA_VOLTA_PCT.toFixed(2)}% descontada · stop e alvo contados a partir da entrada. Rompimento: entra no nível (ou na abertura, se abrir além) e o stop já vale na vela do rompimento (pior caso). Último ${ext} anterior = pivô ${E}/${D} velas ainda não perdido, até ${FACASIM_PIVO_VELAS} velas pra trás; espera até ${FACASIM_ESPERA} velas. Cada célula: acerto · média em R (s/3 = sem os 3 melhores); ⚠️ = menos de 15.</i>\n\n`;
  m += `📍 Último ${ext} anterior: achado em ${comPiv.length} de ${itens.length} · distância mediana do preço do candidato ${dists.length ? `${_med(dists).toFixed(1)} ATR` : "—"} · rompeu em ${nPiv}${vAte.length ? ` (mediana ${Math.round(_med(vAte))} velas depois)` : ""} · rompeu a ${romp} da vela em ${nVela}\n`;
  m += `1️⃣ direto no candidato · 2️⃣ rompendo a ${romp} da vela · 3️⃣ rompendo o último ${ext} anterior · ⚖️ direto, só nos que romperam o ${ext} (compare com o 3️⃣) · ✖️ direto, nos que não romperam\n\n`;
  cfgs.forEach((cf, ci) => {
    m += `${MINI_DIVISOR}\n<b>${simCfgTxt(cf)}</b>\n`;
    m += linha("1️⃣", itens, (i) => i.dir, ci);
    m += linha("2️⃣", itens, (i) => i.vela, ci);
    m += linha("3️⃣", itens, (i) => i.piv, ci);
    m += linha("⚖️", romperam, (i) => i.dir, ci);
    m += linha("✖️", naoRomperam, (i) => i.dir, ci);
  });
  m += `\n<i>O justo é 3️⃣ x ⚖️ (mesmas moedas, entrada diferente); 1️⃣ x 3️⃣ favorece o 3️⃣, porque ele só existe quando a queda continua. Sem stop/alvo no comando, compara o pacote: apertado (0,5 ATR), padrão (1), solto (2), alvo curto (1R), zero a zero em +1 ATR e stop móvel sem alvo. Ou escolha: /facasim 7 stop0.5,1,2 alvo1,2,3 (todas as combinações, até 8) · trail1 = stop móvel a 1 ATR do melhor preço · arma1 = só começa a seguir depois de +1 ATR · be1 = zero a zero em +1 ATR · stop0 = sem stop · alvo0 = sem alvo · horas 2,4,8 · foguete = o espelho LONG. Pivô e espera nos Secrets FACASIM_PIVO_ESQ/DIR (${E}/${D}), FACASIM_PIVO_VELAS (${FACASIM_PIVO_VELAS}), FACASIM_ESPERA (${FACASIM_ESPERA}).</i>`;
  await enviarEmPartes(chatId, m);
}
// ===== V107: /juncao [dias] [stopX] [alvoX] [horas a,b] — compara a junção CLÁSSICA x RÁPIDA (J6_MODO) =====
// Os alertas foram gerados num modo só, então aqui a faixa é recalculada NOS DOIS MODOS a partir das velas, nas mesmas moedas (as que tiveram
// alerta no período), e cada cruzamento vira uma entrada (fechamento da vela que fechou do outro lado da faixa, como o robô).
// Três jeitos de operar: (1) robô ligado direto — entra em todo cruzamento e sai no próximo (vira sozinho, sem stop); (2) saída do robô com stop
// (sai no cruzamento contrário ou no stop de SAIDA_STOP_ATR × ATR); (3) a rotina "liga no alerta e segue com stop/alvo/prazo" (ignora o cruzamento contra).
// Duas fatias: todos os cruzamentos e só os "de alerta" (|24h| ≥ SAIDA_MOV_PADRAO e ADX ≥ SAIDA_ADX_PADRAO na vela do cruzamento).
// V108: "/juncao 7 pura" acrescenta, logo depois de cada modo, a versão "J6 pura" dele (a faixa vira só a linha da J6, sem a SUPREMA) - ver bandaPura.
const JUNCAO_MAX_MOEDAS = numEnv("JUNCAO_MAX_MOEDAS", "40");
type ModoJ6 = "classica" | "rapida" | "rapida144" | "custom";
// V107: J6 personalizada (/juncao ... medias 9,20,21,30): só a J6 muda; a J3 continua 21/50/60, como no indicador
function bandaCustom(closes: number[], periodos: number[], peso: number = PESO_SUPREMA): { sup: number; j6: number }[] {
  const es = periodos.map((p) => ma(closes, p)), e21 = ma(closes, 21), e50 = ma(closes, 50), e60 = ma(closes, 60);
  return closes.map((_, i) => {
    const j3 = (e21[i] + e50[i] + e60[i]) / 3;
    const j6 = es.reduce((t, e) => t + e[i], 0) / es.length;
    return { sup: ((j3 + j6) / 2) * peso + j6 * (1 - peso), j6 };
  });
}
function bandaModo(closes: number[], modo: Exclude<ModoJ6, "custom">, peso: number = PESO_SUPREMA): { sup: number; j6: number }[] {
  const e9 = ma(closes, 9), e20 = ma(closes, 20), e21 = ma(closes, 21), e50 = ma(closes, 50), e60 = ma(closes, 60), e100 = ma(closes, 100), e200 = ma(closes, 200), e144 = ma(closes, 144);
  return closes.map((_, i) => {
    const j3 = (e21[i] + e50[i] + e60[i]) / 3;
    const j6 = modo === "rapida144" ? (e9[i] + e20[i] + e21[i] + e50[i] + e60[i] + e144[i]) / 6 : modo === "rapida" ? (e9[i] + e20[i] + e21[i] + e50[i] + e60[i]) / 5 : (e20[i] + e21[i] + e50[i] + e60[i] + e100[i] + e200[i]) / 6;
    return { sup: ((j3 + j6) / 2) * peso + j6 * (1 - peso), j6 };
  });
}
// V108: "J6 pura" (/juncao ... pura) = a faixa vira SÓ a linha da J6, sem a SUPREMA (que mistura a J3 21/50/60). Topo e fundo da faixa passam a ser a
// própria J6: o lado é "acima" ou "abaixo" da J6 e o cruzamento é a vela fechar do outro lado dela. Todo o resto da conta (robô, motor, rotina) não muda.
const bandaPura = (b: { sup: number; j6: number }[]): { sup: number; j6: number }[] => b.map((x) => ({ sup: x.j6, j6: x.j6 }));
const PURA_SUF = "_pura"; // chave do modo: "classica_pura", "rapida_pura", "rapida144_pura", "c0_pura"...
// ===== V109: /juncao novos e filtros =====
// Todo modo do /juncao vira duas linhas por vela: TOPO (a vela fecha acima = lado LONG) e FUNDO (a vela fecha abaixo = lado SHORT); entre as duas,
// segue o lado anterior. Faixa: topo = máx(SUPREMA, J6), fundo = mín(SUPREMA, J6). J6 pura: topo = fundo = J6. Os modos novos (SuperTrend, faixa
// com folga, Chandelier, Donchian) passam pela MESMA conta (robô ligado, saída do robô, motor real com reentrada, rotina), então dá pra comparar
// linha a linha com a faixa. Só teste: o bot e o motor continuam operando a faixa.
type LinhasJ = { topo: number[]; fundo: number[] };
const linhasDeBanda = (b: { sup: number; j6: number }[]): LinhasJ => ({ topo: b.map((x) => Math.max(x.sup, x.j6)), fundo: b.map((x) => Math.min(x.sup, x.j6)) });
// ATR de Wilder vela a vela: atrSerie(...)[k] = calcATR(h[0..k], l[0..k], c[0..k], p) (0 antes de ter p+1 velas). Uma conta por moeda, em vez de uma por cruzamento.
function atrSerie(h: number[], l: number[], c: number[], p = 14): number[] {
  const n = c.length, out = new Array<number>(n).fill(0);
  if (n < p + 1) return out;
  const trEm = (i: number) => Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1]));
  let soma = 0;
  for (let i = 1; i <= p; i++) soma += trEm(i);
  let a = soma / p;
  out[p] = a;
  for (let i = p + 1; i < n; i++) { a = (a * (p - 1) + trEm(i)) / p; out[i] = a; }
  return out;
}
// SuperTrend igual ao ta.supertrend do TradingView (fonte hl2, ATR de Wilder): as duas bandas finais de cada vela. Vira LONG quando a vela fecha acima
// da banda de cima e SHORT quando fecha abaixo da de baixo. A banda de cima só desce (e a de baixo só sobe) enquanto o preço não fecha além dela.
function linhasSuperTrend(d: XVelas, periodo: number, mult: number): LinhasJ {
  const n = d.c.length, atr = atrSerie(d.h, d.l, d.c, periodo);
  const topo = new Array<number>(n).fill(NaN), fundo = new Array<number>(n).fill(NaN);
  for (let k = 1; k < n; k++) {
    if (!(atr[k] > 0)) continue;
    const hl2 = (d.h[k] + d.l[k]) / 2;
    let cima = hl2 + mult * atr[k], baixo = hl2 - mult * atr[k];
    const cimaAnt = topo[k - 1], baixoAnt = fundo[k - 1];
    if (Number.isFinite(cimaAnt) && !(cima < cimaAnt || d.c[k - 1] > cimaAnt)) cima = cimaAnt;
    if (Number.isFinite(baixoAnt) && !(baixo > baixoAnt || d.c[k - 1] < baixoAnt)) baixo = baixoAnt;
    topo[k] = cima;
    fundo[k] = baixo;
  }
  return { topo, fundo };
}
// Chandelier Exit (LeBeau, como o script mais usado do TradingView): stop do LONG = máxima das N velas − mult × ATR(N); stop do SHORT = mínima das
// N velas + mult × ATR(N). Cada stop só anda a favor enquanto o preço não fecha além dele. Vira LONG quando a vela fecha acima do stop do SHORT da
// vela anterior e SHORT quando fecha abaixo do stop do LONG da vela anterior (as duas linhas podem se cruzar; o LONG é conferido primeiro, como no script).
function linhasChandelier(d: XVelas, periodo: number, mult: number): LinhasJ {
  const n = d.c.length, atr = atrSerie(d.h, d.l, d.c, periodo);
  const stLong = new Array<number>(n).fill(NaN), stShort = new Array<number>(n).fill(NaN);
  for (let k = periodo; k < n; k++) {
    if (!(atr[k] > 0)) continue;
    let hh = -Infinity, ll = Infinity;
    for (let i = k - periodo + 1; i <= k; i++) { if (d.h[i] > hh) hh = d.h[i]; if (d.l[i] < ll) ll = d.l[i]; }
    let sl = hh - mult * atr[k], ss = ll + mult * atr[k];
    const slAnt = stLong[k - 1], ssAnt = stShort[k - 1];
    if (Number.isFinite(slAnt) && d.c[k - 1] > slAnt) sl = Math.max(sl, slAnt);
    if (Number.isFinite(ssAnt) && d.c[k - 1] < ssAnt) ss = Math.min(ss, ssAnt);
    stLong[k] = sl;
    stShort[k] = ss;
  }
  const topo = new Array<number>(n).fill(NaN), fundo = new Array<number>(n).fill(NaN);
  for (let k = 1; k < n; k++) { topo[k] = stShort[k - 1]; fundo[k] = stLong[k - 1]; }
  return { topo, fundo };
}
// Donchian: vira LONG quando a vela fecha acima da máxima das N velas ANTERIORES e SHORT quando fecha abaixo da mínima delas.
function linhasDonchian(d: XVelas, periodo: number): LinhasJ {
  const n = d.c.length, topo = new Array<number>(n).fill(NaN), fundo = new Array<number>(n).fill(NaN);
  for (let k = periodo; k < n; k++) {
    let hh = -Infinity, ll = Infinity;
    for (let i = k - periodo; i < k; i++) { if (d.h[i] > hh) hh = d.h[i]; if (d.l[i] < ll) ll = d.l[i]; }
    topo[k] = hh;
    fundo[k] = ll;
  }
  return { topo, fundo };
}
// Faixa com folga: a mesma faixa, mas a vela precisa fechar além dela por f × ATR(14) pra contar (corta os cruzamentos de raspão).
const linhasFolga = (b: { sup: number; j6: number }[], atr: number[], f: number): LinhasJ => ({
  topo: b.map((x, k) => Math.max(x.sup, x.j6) + f * atr[k]),
  fundo: b.map((x, k) => Math.min(x.sup, x.j6) - f * atr[k]),
});
type NovoJ = { chave: string; tipo: "st" | "folga" | "chand" | "donch"; a: number; b: number };
const JUNCAO_NOVOS_PADRAO: NovoJ[] = [
  { chave: "st_10_3", tipo: "st", a: 10, b: 3 },
  { chave: "st_10_2", tipo: "st", a: 10, b: 2 },
  { chave: "folga_0.25", tipo: "folga", a: 0, b: 0.25 },
  { chave: "folga_0.5", tipo: "folga", a: 0, b: 0.5 },
  { chave: "chand_22_3", tipo: "chand", a: 22, b: 3 },
  { chave: "donch_20", tipo: "donch", a: 20, b: 0 },
];
// "novos" = o pacote acima; st10x3, folga0.25, chand22x3 e donch20 = um modo de cada (pode repetir com outros números). Até 8 modos novos.
function juncaoNovosDeArgs(args: string[]): NovoJ[] {
  const out: NovoJ[] = [];
  const add = (n: NovoJ) => { if (!out.some((x) => x.chave === n.chave)) out.push(n); };
  const num = (s: string) => Number(s.replace(",", "."));
  for (const a of args) {
    let m: RegExpExecArray | null;
    if (/^(novos?|viradas?)$/.test(a)) JUNCAO_NOVOS_PADRAO.forEach(add);
    else if ((m = /^st(\d{1,3})x(\d+(?:[.,]\d+)?)$/.exec(a))) { const p = Math.round(num(m[1])), f = num(m[2]); if (p >= 2 && p <= 100 && f > 0 && f <= 10) add({ chave: `st_${p}_${f}`, tipo: "st", a: p, b: f }); }
    else if ((m = /^folga(\d+(?:[.,]\d+)?)$/.exec(a))) { const f = num(m[1]); if (f > 0 && f <= 3) add({ chave: `folga_${f}`, tipo: "folga", a: 0, b: f }); }
    else if ((m = /^chand(?:elier)?(\d{1,3})x(\d+(?:[.,]\d+)?)$/.exec(a))) { const p = Math.round(num(m[1])), f = num(m[2]); if (p >= 2 && p <= 100 && f > 0 && f <= 10) add({ chave: `chand_${p}_${f}`, tipo: "chand", a: p, b: f }); }
    else if ((m = /^donch(?:ian)?(\d{1,3})$/.exec(a))) { const p = Math.round(num(m[1])); if (p >= 2 && p <= 200) add({ chave: `donch_${p}`, tipo: "donch", a: p, b: 0 }); }
  }
  return out.slice(0, 8);
}
function novoJNome(n: NovoJ, faixaBot: string): string {
  if (n.tipo === "st") return `📈 SUPERTREND (ATR ${n.a} × ${n.b})`;
  if (n.tipo === "folga") return `🧱 FAIXA ${faixaBot.toUpperCase()} + FOLGA ${n.b} ATR · a vela fecha além da faixa por ${n.b} ATR pra virar`;
  if (n.tipo === "chand") return `🕯️ CHANDELIER (${n.a} velas · ${n.b} ATR)`;
  return `📦 DONCHIAN ${n.a} · rompe a máxima/mínima das ${n.a} velas anteriores`;
}
function novoJCurto(n: NovoJ): string {
  if (n.tipo === "st") return `📈 supertrend ${n.a}×${n.b}`;
  if (n.tipo === "folga") return `🧱 faixa + ${n.b} ATR`;
  if (n.tipo === "chand") return `🕯️ chandelier ${n.a}×${n.b}`;
  return `📦 donchian ${n.a}`;
}
// Choppiness Index (n): 100 × log10(soma do TR das n velas ÷ (máxima − mínima das n velas)) ÷ log10(n). Acima de 61,8 = lateral; abaixo de 38,2 = tendência.
function chopSerie(d: XVelas, n = 14): number[] {
  const len = d.c.length, out = new Array<number>(len).fill(NaN);
  const tr = d.c.map((_, i) => (i === 0 ? d.h[0] - d.l[0] : Math.max(d.h[i] - d.l[i], Math.abs(d.h[i] - d.c[i - 1]), Math.abs(d.l[i] - d.c[i - 1]))));
  for (let k = n - 1; k < len; k++) {
    let s = 0, hh = -Infinity, ll = Infinity;
    for (let i = k - n + 1; i <= k; i++) { s += tr[i]; if (d.h[i] > hh) hh = d.h[i]; if (d.l[i] < ll) ll = d.l[i]; }
    const rng = hh - ll;
    if (rng > 0 && s > 0) out[k] = (100 * Math.log10(s / rng)) / Math.log10(n);
  }
  return out;
}
// Efficiency Ratio de Kaufman (n): |fechamento − fechamento de n velas atrás| ÷ soma dos |passos| no caminho. 1 = andou em linha reta; perto de 0 = foi e voltou.
function erSerie(c: number[], n = 20): number[] {
  const out = new Array<number>(c.length).fill(NaN);
  for (let k = n; k < c.length; k++) {
    let caminho = 0;
    for (let i = k - n + 1; i <= k; i++) caminho += Math.abs(c[i] - c[i - 1]);
    out[k] = caminho > 0 ? Math.abs(c[k] - c[k - n]) / caminho : 0;
  }
  return out;
}
// Filtro de regime do /juncao ... filtros: "alerta" = |24h| ≥ SAIDA_MOV_PADRAO e ADX ≥ SAIDA_ADX_PADRAO; "adx" = ADX(14) ≥ v; "chop" = Choppiness(14) < v; "er" = ER(20) ≥ v.
type FiltroJ = { tipo: "alerta" | "adx" | "chop" | "er"; v: number };
function juncaoFiltrosDeArgs(args: string[]): FiltroJ[] | null {
  const pediu = args.some((a) => /^filtros?$/.test(a));
  const lista = (pref: RegExp, max: number, decimalVirgula = false): number[] => {
    const a = args.find((x) => pref.test(x));
    if (!a) return [];
    let s = a.replace(pref, "");
    if (decimalVirgula) s = s.replace(/(^|[;,])0,(\d)/g, "$10.$2"); // "er0,3" = 0.3
    return [...new Set(s.split(/[;,]/).map((x) => Number(x)).filter((v) => Number.isFinite(v) && v > 0 && v <= max))].slice(0, 3);
  };
  const adx = lista(/^adx/, 60), chop = lista(/^chop/, 100), er = lista(/^er/, 1, true);
  if (!pediu && !adx.length && !chop.length && !er.length) return null;
  const out: FiltroJ[] = [{ tipo: "alerta", v: 0 }];
  if (!adx.length && !chop.length && !er.length) {
    out.push({ tipo: "adx", v: 20 }, { tipo: "adx", v: 25 }, { tipo: "chop", v: 50 }, { tipo: "er", v: 0.3 });
    return out;
  }
  adx.forEach((v) => out.push({ tipo: "adx", v }));
  chop.forEach((v) => out.push({ tipo: "chop", v }));
  er.forEach((v) => out.push({ tipo: "er", v }));
  return out;
}
const filtroJTxt = (f: FiltroJ): string =>
  f.tipo === "alerta" ? `de alerta (|24h| ≥ ${SAIDA_MOV_PADRAO}% e ADX ≥ ${SAIDA_ADX_PADRAO})` : f.tipo === "adx" ? `ADX ≥ ${f.v}` : f.tipo === "chop" ? `Choppiness < ${f.v}` : `ER(20) ≥ ${f.v}`;
// V107: o motor de verdade (bot-engine V47+), vela a vela: sinal = a vela FECHA além da faixa e a anterior não fechava (igual ao crossover do TradingView;
// inclui voltar pra dentro da faixa e romper de novo do MESMO lado). Posicionado: sinal do mesmo lado é ignorado, sinal oposto vira a mão no fechamento,
// voltar pra dentro da faixa NÃO tira da posição; o stop (aqui SAIDA_STOP_ATR × ATR da entrada) fecha no meio da vela. Depois de um stop automático, um
// sinal novo do MESMO lado numa vela posterior reabre (reentrada, V47 #18). Só conta operação com entrada desde desdeMs e já encerrada.
// V109: recebe as linhas (topo/fundo) de qualquer modo, o ATR já calculado por vela e um filtro de regime opcional (podeAbrir). Filtro reprovado na vela
// do sinal = não abre nem vira a mão; a posição anterior sai no sinal contrário (ou no stop) do mesmo jeito.
type TrMotorJ = { filtro: boolean; r: number; reent: boolean; mov: number; adxOk: boolean };
function simMotor(d: XVelas, lin: LinhasJ, kIni: number, desdeMs: number, stopAtr: number, atrS: number[], filtroEm: (k: number) => boolean, movEm: (k: number) => number = () => 0, adxOkEm: (k: number) => boolean = () => true, podeAbrir: (k: number) => boolean = () => true): TrMotorJ[] {
  const out: TrMotorJ[] = [];
  const topo = (k: number) => lin.topo[k], fundo = (k: number) => lin.fundo[k];
  const sinal = (k: number): HipLado | null => {
    if (d.c[k] > topo(k) && !(d.c[k - 1] > topo(k - 1))) return "long";
    if (d.c[k] < fundo(k) && !(d.c[k - 1] < fundo(k - 1))) return "short";
    return null;
  };
  type PosM = { lado: HipLado; k: number; px: number; atr: number; stop: number; filtro: boolean; reent: boolean; mov: number; adxOk: boolean };
  const st: { pos: PosM | null } = { pos: null }; // objeto (não let) pra o TS não estreitar pra null por causa das closures
  let ultSaidaStop: HipLado | null = null; // lado da última posição fechada no stop (pra marcar a reentrada)
  const fechar = (px: number) => {
    const p = st.pos!;
    const liq = (p.lado === "long" ? px - p.px : p.px - px) - (p.px * TAXA_IDA_VOLTA_PCT) / 100;
    if (d.t[p.k] >= desdeMs) out.push({ filtro: p.filtro, r: liq / p.atr, reent: p.reent, mov: p.mov, adxOk: p.adxOk });
    st.pos = null;
  };
  const abrir = (k: number, lado: HipLado, reent: boolean) => {
    if (!podeAbrir(k)) return; // V109: filtro de regime reprovado: fica de fora
    const atr = atrS[k];
    if (!(atr > 0)) return;
    st.pos = { lado, k, px: d.c[k], atr, stop: lado === "long" ? d.c[k] - stopAtr * atr : d.c[k] + stopAtr * atr, filtro: filtroEm(k), reent, mov: movEm(k), adxOk: adxOkEm(k) };
  };
  for (let k = Math.max(1, kIni); k < d.c.length; k++) {
    const p0 = st.pos;
    if (p0 && stopAtr > 0 && k > p0.k) {
      const p = p0;
      if (p.lado === "long" ? d.l[k] <= p.stop : d.h[k] >= p.stop) { ultSaidaStop = p.lado; fechar(p.lado === "long" ? Math.min(p.stop, d.o[k]) : Math.max(p.stop, d.o[k])); }
    }
    const sg = sinal(k);
    if (!sg) continue;
    const pa = st.pos;
    if (pa) {
      if (pa.lado === sg) continue; // já posicionado do mesmo lado: ignora
      fechar(d.c[k]); // virada de mão no fechamento
      ultSaidaStop = null;
      abrir(k, sg, false);
    } else {
      abrir(k, sg, ultSaidaStop === sg);
      ultSaidaStop = null;
    }
  }
  return out; // a posição ainda aberta no fim fica fora da conta
}
async function runJuncao(chatId: number | string, dias: number, cfgs: SimCfg[], horas: number[], customs: number[][] = [], porMov = false, pura = false, novos: NovoJ[] = [], filtros: FiltroJ[] | null = null) {
  // V107: até 4 J6 personalizadas no mesmo teste (chaves c0..c3)
  // V108: com "pura", cada modo vem seguido da versão J6 pura dele (classica, classica_pura, rapida, rapida_pura, ...), pra comparar lado a lado
  // V109: com "novos", compara a faixa que o bot usa (J6_MODO) com os modos novos; com "filtros", o motor real roda de novo com cada filtro de regime
  const modoBot: Exclude<ModoJ6, "custom"> = J6_R144 ? "rapida144" : J6_RAPIDA ? "rapida" : "classica";
  const faixaBot = modoBot === "rapida144" ? "rápida + 144" : modoBot === "rapida" ? "rápida" : "clássica";
  const modosBase: string[] = [...(novos.length ? [modoBot] : ["classica", "rapida", "rapida144"]), ...customs.map((_, i) => `c${i}`)];
  const modosAtivos: string[] = [...(pura ? modosBase.flatMap((k) => [k, k + PURA_SUF]) : modosBase), ...novos.map((n) => n.chave)];
  const filtrosJ: FiltroJ[] = filtros ?? [];
  const SB = getSupabase();
  if (!SB) { await sendTelegram(chatId, "⚠️ Supabase não configurado."); return; }
  const dd = Math.min(7, Math.max(1, Math.round(dias || 7))); // as médias são exponenciais: as 300 primeiras das 1000 velas ficam de aquecimento (≈ 7 dias úteis)
  const desdeMs = Date.now() - dd * 86400000;
  const { data, error } = await lerPaginado((a, b) => SB.from(PLACAR_TABELA).select("instid").gt("criado_em", new Date(desdeMs).toISOString()).range(a, b), 4000);
  if (error) { await sendTelegram(chatId, `⚠️ Não consegui ler o placar: ${String(error.message || error).replace(/</g, "&lt;")}`); return; }
  const cont = new Map<string, number>();
  for (const r of (data || []) as any[]) if (r.instid) cont.set(r.instid, (cont.get(r.instid) || 0) + 1);
  const moedas = [...cont.entries()].sort((a, b) => b[1] - a[1]).slice(0, Math.max(5, JUNCAO_MAX_MOEDAS)).map(([i]) => i);
  if (!moedas.length) { await sendTelegram(chatId, "🔀 <b>JUNÇÃO CLÁSSICA x RÁPIDA</b>\n\nNenhuma moeda com alerta no período."); return; }
  const n24 = Math.round(1440 / TF_MIN);
  type Ev = { filtro: boolean; ligado: number | null; robo: number | null; rot: Map<string, SimRes>; mov: number; adxOk: boolean };
  const modos: Record<string, Ev[]> = Object.fromEntries(modosAtivos.map((k) => [k, [] as Ev[]]));
  const minutosEntre: Record<string, number[]> = Object.fromEntries(modosAtivos.map((k) => [k, [] as number[]]));
  const motorTr: Record<string, TrMotorJ[]> = Object.fromEntries(modosAtivos.map((k) => [k, [] as TrMotorJ[]]));
  const motorFil: Record<string, TrMotorJ[][]> = Object.fromEntries(modosAtivos.map((k) => [k, filtrosJ.map(() => [] as TrMotorJ[])])); // V109
  let moedasOk = 0;
  await emLotes(moedas, 5, async (id) => {
    const d = await xCandles(id, TIMEFRAME, SAIDA_CANDLES).catch(() => null);
    if (!d || d.c.length < 300) return;
    moedasOk++;
    const adxS = xAdxSerie(d.h, d.l, d.c, 14);
    const atrS = atrSerie(d.h, d.l, d.c, 14); // V109: o mesmo ATR de antes, calculado uma vez por moeda
    const adxEm = (k: number) => adxNaVela(adxS, k); // V109: ADX conhecido no fechamento da vela k (até a V108 vinha o de 27 velas depois)
    const movEm = (k: number) => (k - n24 >= 0 ? Math.abs((d.c[k] / d.c[k - n24] - 1) * 100) : 0);
    const adxOkEm = (k: number) => { const a = adxEm(k); return Number.isFinite(a) && a >= SAIDA_ADX_PADRAO; };
    const filtroEm = (k: number) => movEm(k) >= SAIDA_MOV_PADRAO && adxOkEm(k);
    const chopS = filtrosJ.some((f) => f.tipo === "chop") ? chopSerie(d, 14) : null;
    const erS = filtrosJ.some((f) => f.tipo === "er") ? erSerie(d.c, 20) : null;
    const passa = (f: FiltroJ, k: number): boolean => {
      if (f.tipo === "alerta") return filtroEm(k);
      const x = f.tipo === "adx" ? adxEm(k) : f.tipo === "chop" ? (chopS ? chopS[k] : NaN) : erS ? erS[k] : NaN;
      if (!Number.isFinite(x)) return false;
      return f.tipo === "chop" ? x < f.v : x >= f.v;
    };
    // V108: a versão pura usa a MESMA J6 do modo base (calculada uma vez por moeda), só sem a SUPREMA
    const bandas = new Map<string, { sup: number; j6: number }[]>();
    const bandaBase = (base: string): { sup: number; j6: number }[] => {
      let bb = bandas.get(base);
      if (!bb) { bb = /^c\d+$/.test(base) ? bandaCustom(d.c, customs[Number(base.slice(1))]) : bandaModo(d.c, base as Exclude<ModoJ6, "custom">); bandas.set(base, bb); }
      return bb;
    };
    const linhasDe = (modo: string): LinhasJ => {
      const nv = novos.find((x) => x.chave === modo);
      if (nv) return nv.tipo === "st" ? linhasSuperTrend(d, nv.a, nv.b) : nv.tipo === "chand" ? linhasChandelier(d, nv.a, nv.b) : nv.tipo === "donch" ? linhasDonchian(d, nv.a) : linhasFolga(bandaBase(modoBot), atrS, nv.b);
      const base = modo.endsWith(PURA_SUF) ? modo.slice(0, -PURA_SUF.length) : modo;
      return linhasDeBanda(base === modo ? bandaBase(base) : bandaPura(bandaBase(base)));
    };
    for (const modo of modosAtivos) {
      const lin = linhasDe(modo);
      const ladoEm = (k: number): HipLado | null => (d.c[k] > lin.topo[k] ? "long" : d.c[k] < lin.fundo[k] ? "short" : null);
      // cruzamentos: a vela fecha do lado oposto ao último lado definido
      const evs: { k: number; lado: HipLado }[] = [];
      let ult: HipLado | null = null;
      for (let k = 300; k < d.c.length; k++) {
        const l = ladoEm(k);
        if (!l) continue;
        if (ult && l !== ult) evs.push({ k, lado: l });
        ult = l;
      }
      for (let i = 1; i < evs.length; i++) if (d.t[evs[i].k] >= desdeMs) minutosEntre[modo].push((evs[i].k - evs[i - 1].k) * TF_MIN);
      for (let i = 0; i < evs.length; i++) {
        const { k, lado } = evs[i];
        if (d.t[k] < desdeMs || k >= d.c.length - 2) continue;
        const atr = atrS[k];
        if (!(atr > 0)) continue;
        const taxa = (d.c[k] * TAXA_IDA_VOLTA_PCT) / 100;
        // (1) ligado direto: sai no próximo cruzamento (que já é a entrada contrária), sem stop
        const prox = evs[i + 1];
        const ligado = prox ? ((lado === "long" ? d.c[prox.k] - d.c[k] : d.c[k] - d.c[prox.k]) - taxa) / atr : null;
        // (2) saída do robô com stop: cruzamento contrário ou stop
        const oposto: HipLado = lado === "long" ? "short" : "long";
        const pr = simPerna(d, k + 1, lado, d.c[k], atr, d.c.length, { stopAtr: SAIDA_STOP_ATR, alvoR: 0 }, (kk) => ladoEm(kk) === oposto);
        const rot = new Map<string, SimRes>(); // chave "combinação|horas"
        cfgs.forEach((cf, ci) => { for (const h of horas) rot.set(`${ci}|${h}`, simSegurar(d, k + 1, lado, d.c[k], atr, Math.max(1, Math.round((h * 60) / TF_MIN)), cf, false)); });
        modos[modo].push({ filtro: filtroEm(k), ligado, robo: pr ? pr.r : null, rot, mov: movEm(k), adxOk: adxOkEm(k) });
      }
      for (const t of simMotor(d, lin, 300, desdeMs, SAIDA_STOP_ATR, atrS, filtroEm, movEm, adxOkEm)) motorTr[modo].push(t);
      filtrosJ.forEach((f, fi) => { for (const t of simMotor(d, lin, 300, desdeMs, SAIDA_STOP_ATR, atrS, filtroEm, movEm, adxOkEm, (k) => passa(f, k))) motorFil[modo][fi].push(t); });
    }
  });
  if (!moedasOk) { await sendTelegram(chatId, "🔀 <b>JUNÇÃO CLÁSSICA x RÁPIDA</b>\n\nNão consegui as velas das moedas. Tente de novo em alguns minutos."); return; }
  const fmtR = (rs: number[]): string => {
    if (!rs.length) return "<i>sem dados</i>";
    const ac = rs.filter((x) => x > 0).length, pf = _profitFactor(rs), media = rs.reduce((t, x) => t + x, 0) / rs.length;
    const sem3 = rs.length > 5 ? [...rs].sort((a, b) => b - a).slice(3) : null;
    return `n=${rs.length} · acerto ${Math.round((ac / rs.length) * 100)}%${pmTxt(ac, rs.length)} · média ${media >= 0 ? "+" : ""}${media.toFixed(2)}R · PF ${isFinite(pf) ? pf.toFixed(2) : pf === Infinity ? "∞" : "—"}${sem3 ? ` · sem os 3 melhores ${(sem3.reduce((t, x) => t + x, 0) / sem3.length).toFixed(2)}R` : ""}`;
  };
  const hTxt = (h: number) => (h < 1 ? `${Math.round(h * 60)}min` : `${h}h`);
  const nome: Record<string, string> = { classica: "🐢 CLÁSSICA (20/21/50/60/100/200)", rapida: "⚡ RÁPIDA (9/20/21/50/60)", rapida144: "⚡➕ RÁPIDA + EMA 144 (9/20/21/50/60/144)" };
  customs.forEach((c, i) => { nome[`c${i}`] = `🧪 PERSONALIZADA ${customs.length > 1 ? `${i + 1} ` : ""}(J6 = ${c.join("/")}; J3 = 21/50/60)`; });
  // V108: nomes da versão J6 pura de cada modo (a personalizada pura nao tem J3)
  nome["classica" + PURA_SUF] = "🎯 J6 PURA CLÁSSICA (20/21/50/60/100/200) · só a linha da J6, sem a SUPREMA";
  nome["rapida" + PURA_SUF] = "🎯 J6 PURA RÁPIDA (9/20/21/50/60) · só a linha da J6, sem a SUPREMA";
  nome["rapida144" + PURA_SUF] = "🎯 J6 PURA RÁPIDA + 144 (9/20/21/50/60/144) · só a linha da J6, sem a SUPREMA";
  customs.forEach((c, i) => { nome[`c${i}${PURA_SUF}`] = `🎯 J6 PURA PERSONALIZADA ${customs.length > 1 ? `${i + 1} ` : ""}(J6 = ${c.join("/")}) · só a linha da J6, sem a SUPREMA`; });
  for (const n of novos) nome[n.chave] = novoJNome(n, faixaBot); // V109
  const titulo = novos.length
    ? `🔀 <b>JUNÇÃO: FAIXA ${faixaBot.toUpperCase()} (a do bot) x ${novos.length} MODO(S) NOVO(S)${customs.length ? ` x ${customs.length} PERSONALIZADA(S)` : ""}${pura ? " · com a J6 PURA" : ""}</b>`
    : `🔀 <b>JUNÇÃO: CLÁSSICA x RÁPIDA x RÁPIDA + 144${customs.length ? ` x ${customs.length} PERSONALIZADA(S)` : ""}${pura ? " · cada uma também com a J6 PURA" : ""}</b>`;
  let m = `${titulo} — ${dd} dia(s) · ${moedasOk} moeda(s) com alerta no período\n${DIVISOR}\n`;
  m += `<i>Faixa recalculada em todos os modos com as mesmas velas de 15m; entrada no fechamento da vela que cruzou. 1R = 1×ATR, taxa de ${TAXA_IDA_VOLTA_PCT.toFixed(2)}% descontada. "De alerta" = |24h| ≥ ${SAIDA_MOV_PADRAO}% e ADX ≥ ${SAIDA_ADX_PADRAO} na vela do cruzamento (desde a V109 o ADX é o da própria vela; até a V108 vinha o de 27 velas depois, e o "de alerta" saía melhor do que era). Hoje o bot usa a ${faixaBot} (J6_MODO).${pura ? " 🎯 J6 pura = a faixa vira só a linha da J6 (sem a SUPREMA): o cruzamento é a vela fechar do outro lado da J6. Cada J6 aparece logo antes da versão pura dela." : ""}${novos.length ? " 📈 SuperTrend = linha a N×ATR do preço que só anda a favor; vira quando a vela fecha do outro lado (igual ao Supertrend do TradingView). 🧱 Folga = a faixa do bot, mas a vela precisa fechar além dela por X ATR pra virar. 🕯️ Chandelier = stop a N×ATR da máxima (ou mínima) das últimas velas; vira quando fecha além do stop do lado oposto. 📦 Donchian = vira quando fecha acima da máxima (ou abaixo da mínima) das N velas anteriores." : ""}</i>\n\n`;
  if (filtros) {
    // V109: /juncao ... filtros — o motor real com cada filtro de regime, lado a lado com o "sem filtro"
    m += `<b>🚦 FILTROS DE REGIME</b>\n<i>🔂 motor real (stop ${SAIDA_STOP_ATR} ATR + reentrada no mesmo lado), rodado de novo com cada filtro. Filtro reprovado na vela do sinal = o robô não abre nem vira a mão; a posição que já estava aberta sai no sinal contrário ou no stop. ADX(14), Choppiness(14) e ER(20) lidos no fechamento da vela do sinal.</i>\n\n`;
    for (const modo of modosAtivos) {
      m += `${MINI_DIVISOR}\n<b>${nome[modo]}</b>\n${(modos[modo].length / Math.max(1, moedasOk) / dd).toFixed(1)} cruzamentos por moeda por dia\n`;
      m += `  sem filtro: ${fmtR(motorTr[modo].map((t) => t.r))}\n`;
      filtrosJ.forEach((f, fi) => { m += `  ${filtroJTxt(f)}: ${fmtR(motorFil[modo][fi].map((t) => t.r))}\n`; });
      m += "\n";
    }
    m += `<i>Compare cada filtro com o "sem filtro" do mesmo modo: o filtro ajuda quando a média, o PF e o "sem os 3 melhores" sobem sem o n cair demais. Aqui o "de alerta" é filtro de verdade (o robô só abre nele), por isso não bate com o "Só os de alerta" do detalhe, que separa depois as entradas do motor sempre ligado. Uso: /juncao 7 filtros · /juncao 7 novos filtros · adx20,25 · chop50,61.8 · er0.2,0.3 (decimais com ponto; até 3 valores de cada).</i>`;
    await enviarEmPartes(chatId, m);
    return;
  }
  if (porMov) {
    // V107: /juncao ... mov — a mesma conta, separada pelo quanto a moeda andou nas 24h (subindo OU caindo) na vela da entrada, com ADX ≥ SAIDA_ADX_PADRAO
    const curto: Record<string, string> = { classica: "🐢 clássica", rapida: "⚡ rápida", rapida144: "⚡➕ rápida+144" };
    customs.forEach((c, i) => { curto[`c${i}`] = `🧪 ${c.join("/")}`; });
    for (const k of modosBase) curto[k + PURA_SUF] = `🎯 ${curto[k].replace(/^\S+\s+/u, "")} pura`; // V108: "🎯 clássica pura", "🎯 9/20/21/30 pura"...
    for (const n of novos) curto[n.chave] = novoJCurto(n); // V109
    const fmtC = (rs: number[]): string => {
      if (rs.length < 5) return `n=${rs.length} <i>(pouco)</i>`;
      const media = rs.reduce((t, x) => t + x, 0) / rs.length, sem3 = rs.length > 5 ? [...rs].sort((a, b) => b - a).slice(3) : rs;
      const s3 = sem3.reduce((t, x) => t + x, 0) / sem3.length;
      return `n=${rs.length} ${media >= 0 ? "+" : ""}${media.toFixed(2)}R (s/3 ${s3 >= 0 ? "+" : ""}${s3.toFixed(2)})`;
    };
    const cf0 = cfgs[0], h0 = horas[0];
    m += `<b>📏 POR MOVIMENTO DA MOEDA NO DIA</b>\n<i>|24h| na vela da entrada (subindo ou caindo) e ADX ≥ ${SAIDA_ADX_PADRAO}. 🔂 = motor real (stop ${SAIDA_STOP_ATR} ATR + reentrada) · 🧭 = rotina ${simCfgTxt(cf0)} · até ${hTxt(h0)}. "s/3" = sem os 3 melhores.</i>\n\n`;
    for (const [nomeF, a, bF] of MOV_FAIXAS) {
      m += `${MINI_DIVISOR}\n<b>|24h| ${nomeF}</b>\n${MINI_DIVISOR}\n`;
      for (const modo of modosAtivos) {
        const mt = motorTr[modo].filter((t) => t.adxOk && t.mov >= a && t.mov < bF).map((t) => t.r);
        const rt = modos[modo].filter((e) => e.adxOk && e.mov >= a && e.mov < bF).map((e) => e.rot.get(`0|${h0}`)).filter((x): x is NonNullable<SimRes> => !!x).map((x) => x.r);
        m += `${curto[modo]}\n  🔂 ${fmtC(mt)} · 🧭 ${fmtC(rt)}\n`;
      }
      m += "\n";
    }
    // V109: as entradas com ADX abaixo do mínimo ficam fora das faixas acima; aqui elas aparecem juntas (qualquer |24h|)
    m += `${MINI_DIVISOR}\n<b>ADX abaixo de ${SAIDA_ADX_PADRAO}</b> (qualquer |24h|)\n${MINI_DIVISOR}\n`;
    for (const modo of modosAtivos) {
      const mt = motorTr[modo].filter((t) => !t.adxOk).map((t) => t.r);
      const rt = modos[modo].filter((e) => !e.adxOk).map((e) => e.rot.get(`0|${h0}`)).filter((x): x is NonNullable<SimRes> => !!x).map((x) => x.r);
      m += `${curto[modo]}\n  🔂 ${fmtC(mt)} · 🧭 ${fmtC(rt)}\n`;
    }
    m += "\n";
    m += `<i>Sem o "mov", o /juncao mostra o detalhe completo de cada modo. A faixa "abaixo de 8%" fica fora do filtro "de alerta". Cada faixa tem menos amostra: olhe a tendência entre as faixas, não um número isolado.</i>`;
    await enviarEmPartes(chatId, m);
    return;
  }
  for (const modo of modosAtivos) {
    const evs = modos[modo], me = minutosEntre[modo];
    m += `${MINI_DIVISOR}\n<b>${nome[modo]}</b>\n${MINI_DIVISOR}\n`;
    m += `${evs.length} cruzamentos (${(evs.length / Math.max(1, moedasOk) / dd).toFixed(1)} por moeda por dia) · tempo mediano entre cruzamentos ${me.length ? `${Math.round(_med(me))} min` : "—"}\n`;
    for (const [rot, f] of [["Todos os cruzamentos", () => true], ["Só os \"de alerta\"", (e: Ev) => e.filtro]] as [string, (e: Ev) => boolean][]) {
      const g = evs.filter(f);
      m += `<b>${rot}</b> (n=${g.length})\n`;
      m += `  🔁 robô ligado direto (vira a cada cruzamento): ${fmtR(g.map((e) => e.ligado).filter((x): x is number => x !== null))}\n`;
      m += `  🤖 saída do robô (cruzamento contrário ou stop ${SAIDA_STOP_ATR} ATR): ${fmtR(g.map((e) => e.robo).filter((x): x is number => x !== null))}\n`;
      const mt = motorTr[modo].filter((t) => (rot.startsWith("Todos") ? true : t.filtro));
      m += `  🔂 motor real (stop ${SAIDA_STOP_ATR} ATR + reentrada no mesmo lado): ${fmtR(mt.map((t) => t.r))}\n`;
      m += `     ↳ só as reentradas depois do stop: ${fmtR(mt.filter((t) => t.reent).map((t) => t.r))}\n`;
      cfgs.forEach((cf, ci) => { for (const h of horas) m += `  🧭 ${simCfgTxt(cf)} · até ${hTxt(h)}: ${fmtR(g.map((e) => e.rot.get(`${ci}|${h}`)).filter((x): x is NonNullable<SimRes> => !!x).map((x) => x.r))}\n`; });
    }
    m += "\n";
  }
  m += `<i>${customs.length ? "A personalizada é um teste: só a J6 muda (a J3 21/50/60 continua na faixa); o bot e o motor não têm esse modo. " : ""}${pura ? "A J6 pura também é só teste: o bot e o motor operam a faixa (SUPREMA + J6). Sem a faixa, o preço cruza mais vezes: compare cada J6 com a versão pura logo abaixo dela (cruzamentos por dia, tempo entre eles e o resultado). " : ""}${novos.length ? "Os modos novos também são só teste: o bot e o motor continuam operando a faixa. " : ""}Menos cruzamentos por dia e mais tempo entre eles = faixa menos "serrada". Compare os dois modos linha a linha; a diferença só vale onde as margens (±) não se cruzam. 🔂 motor real = como o bot-engine V47: sinal quando a vela fecha além da faixa e a anterior não fechava, posição mantida dentro da faixa, vira no sinal oposto, sai no stop e REENTRA se romper de novo do mesmo lado (operações seguidas, sem sobreposição; "de alerta" medido na vela de cada entrada). Uso: /juncao 7 · /juncao 7 stop1,1.5 alvo1.5,2 horas 1,2 (listas: compara todas as combinações, até 8) · trail1,2 = stop móvel · arma2 = só arma depois de +2 ATR · be1 = zero a zero em +1 ATR · stop0 = sem stop · alvo0 = sem alvo · mov = separa pelo movimento da moeda no dia · pura = cada J6 também sozinha, sem a SUPREMA · novos = SuperTrend, faixa com folga, Chandelier e Donchian contra a faixa do bot (ou um de cada: st10x3, folga0.25, chand22x3, donch20) · filtros = o motor com ADX, Choppiness e ER · máx. de moedas no Secret JUNCAO_MAX_MOEDAS (${JUNCAO_MAX_MOEDAS}).</i>`;
  await enviarEmPartes(chatId, m);
}
// ===== V109: /velas [dias] [moedas60] — as velas de 15m das moedas do /juncao num arquivo CSV =====
// Pra testar muitas combinações fora do bot (no Claude, por exemplo) com as mesmas velas que o /juncao usa. Moedas = as que mais tiveram alerta no
// período (como no /juncao), até JUNCAO_MAX_MOEDAS (ou moedasN). Vai o período pedido + VELAS_AQUEC velas de aquecimento das médias. Colunas: instid,
// t (abertura da vela, ms UTC), o, h, l, c, v. A BloFin dá até 1440 velas por pedido e o "after" pagina pra trás; se a paginação falhar, vão as velas
// de sempre do xCandles (1000). Só lê: não grava nada.
const VELAS_MAX_DIAS = 60, VELAS_MAX_MOEDAS = 80, VELAS_AQUEC = 300;
async function blofinVelasHistorico(instId: string, bar: string, quantas: number): Promise<XVelas | null> {
  const linhas: any[][] = [];
  let after = 0;
  for (let pag = 0; pag < 8 && linhas.length < quantas; pag++) {
    let lote: any[][] | null = null;
    for (let t = 0; t < 3 && lote === null; t++) {
      try {
        const r = await fetch(`https://openapi.blofin.com/api/v1/market/candles?instId=${instId}&bar=${bar}&limit=1440${after ? `&after=${after}` : ""}`, { headers: { "User-Agent": "Mozilla/5.0" } });
        const j = await J(r);
        if (j?.code == "0" && Array.isArray(j.data)) lote = j.data;
        else if (t < 2) await sleep(600 + Math.random() * 900);
      } catch { if (t < 2) await sleep(600); }
    }
    if (!lote || !lote.length) break;
    const maisVelha = Number(lote[lote.length - 1][0]);
    if (!(maisVelha > 0) || (after && !(maisVelha < after))) break; // a paginação não voltou no tempo: para aqui
    linhas.push(...lote);
    after = maisVelha;
    if (lote.length < 200) break; // acabou o histórico da moeda
  }
  if (linhas.length < 100) return null;
  const vistas = new Set<number>();
  const rows = linhas.filter((r) => { const t = Number(r[0]); if (!(t > 0) || vistas.has(t)) return false; vistas.add(t); return true; }).sort((a, b) => Number(a[0]) - Number(b[0]));
  const d: XVelas = { t: rows.map((r) => Number(r[0])), o: rows.map((r) => parseFloat(r[1])), h: rows.map((r) => parseFloat(r[2])), l: rows.map((r) => parseFloat(r[3])), c: rows.map((r) => parseFloat(r[4])), v: rows.map((r) => parseFloat(r[5])) };
  return xFechadas(d, barToMs(bar));
}
// Manda um arquivo pelo Telegram (sendDocument). Legenda até 1024 caracteres.
async function tgEnviarArquivo(chatId: number | string, nomeArq: string, conteudo: string, legenda = ""): Promise<boolean> {
  if (ehCaptura(chatId)) { const cap = _capturas.get(String(chatId))!; cap.msgs.push(`📎 [arquivo ${nomeArq}, ${(conteudo.length / 1048576).toFixed(1)} MB: no pedido de análise o arquivo não vai]`); return true; }
  try {
    const fd = new FormData();
    fd.append("chat_id", String(chatId));
    fd.append("document", new Blob([conteudo], { type: "text/csv" }), nomeArq);
    if (legenda) { fd.append("caption", legenda.slice(0, 1000)); fd.append("parse_mode", "HTML"); }
    const r = await fetch(`${TG_API}/sendDocument`, { method: "POST", body: fd });
    const j: any = await J(r);
    if (j?.ok === false) { console.log(`⚠️ sendDocument falhou: ${JSON.stringify(j).slice(0, 200)}`); return false; }
    return true;
  } catch (e) { console.log("Erro sendDocument", e); return false; }
}
async function runVelasExport(chatId: number | string, dias: number, maxMoedas: number) {
  const SB = getSupabase();
  if (!SB) { await sendTelegram(chatId, "⚠️ Supabase não configurado."); return; }
  const dd = Math.min(VELAS_MAX_DIAS, Math.max(1, Math.round(dias || 30)));
  const desdeMs = Date.now() - dd * 86400000;
  const { data, error } = await lerPaginado((a, b) => SB.from(PLACAR_TABELA).select("instid").gt("criado_em", new Date(desdeMs).toISOString()).range(a, b), 8000);
  if (error) { await sendTelegram(chatId, `⚠️ Não consegui ler o placar: ${String(error.message || error).replace(/</g, "&lt;")}`); return; }
  const cont = new Map<string, number>();
  for (const r of (data || []) as any[]) if (r.instid) cont.set(r.instid, (cont.get(r.instid) || 0) + 1);
  const moedas = [...cont.entries()].sort((a, b) => b[1] - a[1]).slice(0, Math.max(1, maxMoedas)).map(([i]) => i);
  if (!moedas.length) { await sendTelegram(chatId, "🕯️ <b>VELAS</b>\n\nNenhuma moeda com alerta no período."); return; }
  const quantas = Math.round((dd * 1440) / TF_MIN) + VELAS_AQUEC;
  const blocos: string[] = [];
  let curtas = 0, planoB = 0;
  await emLotes(moedas, 4, async (id) => {
    let d = await blofinVelasHistorico(id, TIMEFRAME, quantas).catch(() => null);
    if (!d || d.c.length < 300) { d = await xCandles(id, TIMEFRAME, SAIDA_CANDLES).catch(() => null); if (d) planoB++; }
    if (!d || !d.c.length) return;
    const ini = Math.max(0, d.c.length - quantas);
    if (d.c.length - ini < quantas) curtas++;
    const ls: string[] = [];
    for (let k = ini; k < d.c.length; k++) ls.push(`${id},${d.t[k]},${d.o[k]},${d.h[k]},${d.l[k]},${d.c[k]},${d.v[k]}`);
    blocos.push(ls.join("\n"));
  });
  if (!blocos.length) { await sendTelegram(chatId, "🕯️ <b>VELAS</b>\n\nNão consegui as velas das moedas. Tente de novo em alguns minutos."); return; }
  const csv = `instid,t,o,h,l,c,v\n${blocos.join("\n")}\n`;
  const hoje = new Date().toISOString().slice(0, 10);
  const nomeArq = `velas_${TIMEFRAME}_${dd}d_${blocos.length}moedas_${hoje}.csv`;
  const legenda = `🕯️ <b>Velas de ${TIMEFRAME}</b> · ${dd} dia(s) + ${VELAS_AQUEC} velas de aquecimento · ${blocos.length} moeda(s) com alerta no período (${(csv.length / 1048576).toFixed(1)} MB)${curtas ? ` · ${curtas} com menos histórico que o pedido` : ""}${planoB ? ` · ${planoB} pelo plano B (1000 velas)` : ""}. Colunas: instid, t (abertura, ms UTC), o, h, l, c, v.`;
  const ok = await tgEnviarArquivo(chatId, nomeArq, csv, legenda);
  if (!ok) await sendTelegram(chatId, `⚠️ Não consegui mandar o arquivo (${(csv.length / 1048576).toFixed(1)} MB). Tente com menos dias ou moedas: /velas 15 moedas20`);
}
// ===== V109: pedidos de análise sem Telegram (tabela analises_pedidos) =====
// Quem tem acesso ao banco (o dono, ou o Claude pelo conector do Supabase) grava um comando de análise na tabela analises_pedidos (status
// "pendente"). A cada rodada do cron (2 min), se houver pedido, a function chama a si mesma numa requisição separada (x-tarefa: pedidos, com o
// CRON_SECRET), pra não pesar no tempo do alerta. Essa requisição pega UM pedido, roda o comando como se tivesse chegado pelo Telegram (mesmo
// roteador, mesmas opções), só que com um chat falso "cap_<uuid>": as mensagens ficam na coluna resultado em vez de ir pro Telegram. Só comandos
// de leitura (PEDIDOS_CMDS). Pedido "rodando" há mais de PEDIDOS_TRAVADO_MIN minutos (function encerrada no meio) vira "erro". Sem a tabela,
// nada acontece (o cron só tenta ler e segue).
// Tabela: id (identity), criado_em, comando, status (pendente | rodando | feito | erro), iniciado_em, terminado_em, segundos, versao, resultado.
const PEDIDOS_TABELA = "analises_pedidos";
const PEDIDOS_CMDS = ["/juncao", "/saida", "/radarsim", "/radarconf", "/radarhist", "/radar", "/facasim", "/faca", "/foguete", "/placar", "/15min", "/reversaoconf", "/repsombra", "/volconf", "/compressao", "/sombras"];
const PEDIDOS_TRAVADO_MIN = 15;
const FUNCAO_NOME = (Deno.env.get("FUNCAO_NOME") || "telegram-bot").trim(); // nome (slug) desta function, pra ela chamar a si mesma
async function executarComandoCapturado(comando: string): Promise<string> {
  const cmd = String(comando || "").trim().replace(/\s+/g, " ");
  const base = cmd.toLowerCase().split(" ")[0].replace(/@\w+$/, "");
  if (!PEDIDOS_CMDS.includes(base)) throw new Error(`"${base}" não roda por pedido. Só os de leitura: ${PEDIDOS_CMDS.join(" ")}`);
  if (base === "/radarhist" && /\sgravar\b/i.test(cmd)) throw new Error("/radarhist gravar não roda por pedido (só a leitura).");
  const id = `cap_${crypto.randomUUID()}`;
  _capturas.set(id, { msgs: [] });
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (WEBHOOK_SECRET) headers["x-telegram-bot-api-secret-token"] = WEBHOOK_SECRET;
    const corpo = { update_id: 0, message: { message_id: 0, date: Math.floor(Date.now() / 1000), chat: { id, type: "private" }, from: { id }, text: cmd } };
    await tratarRequisicao(new Request("http://pedido.interno/", { method: "POST", headers, body: JSON.stringify(corpo) }));
    return (_capturas.get(id)?.msgs || []).filter((x): x is string => typeof x === "string").join("\n\n");
  } finally { _capturas.delete(id); }
}
async function rodarPedidosAnalise(): Promise<void> {
  const SB = getSupabase();
  if (!SB) return;
  const agoraIso = () => new Date().toISOString();
  await SB.from(PEDIDOS_TABELA).update({ status: "erro", terminado_em: agoraIso(), resultado: `⚠️ passou de ${PEDIDOS_TRAVADO_MIN} min rodando (a function foi encerrada no meio). Grave o pedido de novo.` })
    .eq("status", "rodando").lt("iniciado_em", new Date(Date.now() - PEDIDOS_TRAVADO_MIN * 60000).toISOString());
  const { data: fila, error } = await SB.from(PEDIDOS_TABELA).select("id, comando").eq("status", "pendente").order("id", { ascending: true }).limit(1);
  if (error) { console.log("⚠️ pedidos de análise: não li a fila", error.message ?? error); return; }
  const p = (fila || [])[0] as { id: number; comando: string } | undefined;
  if (!p) return;
  const { data: pego } = await SB.from(PEDIDOS_TABELA).update({ status: "rodando", iniciado_em: agoraIso(), versao: BOT_VERSAO }).eq("id", p.id).eq("status", "pendente").select("id");
  if (!pego || !pego.length) return; // outra requisição pegou este pedido
  const t0 = Date.now();
  let status = "feito", resultado = "";
  try {
    resultado = await executarComandoCapturado(p.comando);
    if (!resultado.trim()) { status = "erro"; resultado = "⚠️ o comando não devolveu nada (veja os logs da function)."; }
  } catch (e) { status = "erro"; resultado = `⚠️ ${String((e as any)?.message ?? e)}`; }
  const segundos = Math.round((Date.now() - t0) / 1000);
  const { error: eFim } = await SB.from(PEDIDOS_TABELA).update({ status, resultado, terminado_em: agoraIso(), segundos }).eq("id", p.id);
  if (eFim) console.log("⚠️ pedidos de análise: não gravei o resultado", eFim.message ?? eFim);
  console.log(`📝 pedido de análise ${p.id} (${p.comando}): ${status} em ${segundos}s`);
}
// Chamado na rodada do cron: se tem pedido pendente, abre uma requisição separada pra ele (a rodada do alerta não espera a análise).
async function chutarPedidosAnalise(): Promise<void> {
  if (!SUPABASE_URL || !CRON_SECRET) return;
  const SB = getSupabase();
  if (!SB) return;
  const { data, error } = await SB.from(PEDIDOS_TABELA).select("id").eq("status", "pendente").limit(1);
  if (error || !data?.length) return; // sem a tabela ou sem pedido: nada a fazer
  await fetch(`${SUPABASE_URL}/functions/v1/${FUNCAO_NOME}`, { method: "POST", headers: { "x-cron-secret": CRON_SECRET, "x-tarefa": "pedidos" } })
    .then((r) => r.text()).catch((e) => console.log("⚠️ pedidos de análise: não consegui chamar a function", e));
}
// V104: /repsombra [dias] — repique (⭐) real x modo sombra (o que a regra de ADX/DI barrou). Mesmo molde do /reversaoconf: só lê o log, não muda o banco.
async function runRepiqueSombra(chatId: number | string, dias: number) {
  const SB = getSupabase();
  if (!SB) { await sendTelegram(chatId, "⚠️ Supabase não configurado."); return; }
  const desde = new Date(Date.now() - dias * 86400000).toISOString();
  const { data, error } = await lerPaginadoDesde(chatId, (a, b) => SB.from(PLACAR_TABELA).select("*").gt("criado_em", desde).order("criado_em", { ascending: false }).range(a, b));
  if (error) { await sendTelegram(chatId, `⚠️ Não consegui ler o placar: ${String(error.message || error).replace(/</g, "&lt;")}`); return; }
  const todos = (data || []) as any[];
  const reais = todos.filter((r) => !ehFinalLog(r) && !ehDescartadoLog(r) && (r.tipo === "fundo" || r.tipo === "topo") && String(r.status || "").includes("REPIQUE"));
  const somb = todos.filter((r) => !ehFinalLog(r) && !ehInvalidoLog(r) && ehSombraRep(r));
  const motivosDe = (r: any): string[] => { const m = /SOMBRA\[([^\]]*)\]/.exec(String(r.status || "")); return m ? m[1].split("+").filter(Boolean) : []; };
  const regra = repRegraTxt();
  if (!reais.length && !somb.length) { await sendTelegram(chatId, `⭐ <b>REPIQUE: REAL x SOMBRA</b>\n\nNenhum repique (real ou sombra) nos últimos ${dias} dia(s).\nRegra atual: ${regra}${REPIQUE_SOMBRA_ON ? "" : " · sombra DESLIGADA (REPIQUE_SOMBRA=0)"}.`); return; }
  const rets = (g: any[], h: number) => g.map((r) => retornoLog(r, h)).filter((x): x is number => x !== null);
  const bloco = (nome: string, g: any[]) => {
    const r4 = rets(g, 240), pf = _profitFactor(r4);
    return `<b>${nome}</b> (n=${g.length})\n${linhaStats(g, [15, ...PLACAR_HORIZ_EXIBE])}${r4.length >= 5 && isFinite(pf) ? ` · PF 4h ${pf.toFixed(2)}` : ""}${g.length < 15 ? "\n<i>amostra pequena</i>" : ""}\n\n`;
  };
  const sec = (t: string) => `${MINI_DIVISOR}\n<b>${t}</b>\n${MINI_DIVISOR}\n\n`;
  let m = `⭐ <b>REPIQUE: REAL x SOMBRA</b> — últimos ${dias} dia(s)\n${DIVISOR}\n${reais.length} repique(s) que alertaram · 🌑 ${somb.length} na sombra\n<i>Regra atual (V104): ${regra}. Colunas: 15m · 1h · 4h · 24h. Acerto = preço a favor do lado do repique (LONG = fundo, SHORT = topo) desde o alerta; % = retorno mediano já com taxa (${TAXA_IDA_VOLTA_PCT.toFixed(2)}% ida e volta).</i>\n\n`;
  m += sec("Alertas reais (⭐)");
  if (!reais.length) m += `<i>Nenhum repique alertou no período.</i>\n\n`;
  else {
    m += bloco("Todos os repiques reais", reais);
    const comAdx = reais.filter((r) => r.adx != null && isFinite(Number(r.adx)));
    if (REPIQUE_ADX_MIN > 0 && comAdx.length) {
      const alto = comAdx.filter((r) => Number(r.adx) >= REPIQUE_ADX_MIN), baixo = comAdx.filter((r) => Number(r.adx) < REPIQUE_ADX_MIN);
      if (alto.length) m += bloco(`ADX ≥ ${REPIQUE_ADX_MIN} (o que a regra deixa passar)`, alto);
      if (baixo.length) m += bloco(`ADX abaixo de ${REPIQUE_ADX_MIN} (alertou antes da regra V104)`, baixo);
    }
    const lL = reais.filter((r) => r.lado === "long"), lS = reais.filter((r) => r.lado === "short");
    if (lL.length) m += bloco("🟢 LONG (repique no fundo)", lL);
    if (lS.length) m += bloco("🔴 SHORT (repique no topo)", lS);
  }
  m += sec(`🌑 Sombra — repique barrado pela regra (${regra})`);
  if (!somb.length) m += `<i>Ainda sem repique na sombra${REPIQUE_SOMBRA_ON ? " (começa a gravar a partir do deploy da V104)" : " (REPIQUE_SOMBRA=0, desligada)"}.</i>\n\n`;
  else {
    m += bloco("Todas as barradas", somb);
    const so = (f: (x: string[]) => boolean) => somb.filter((r) => { const x = motivosDe(r); return x.length > 0 && f(x); });
    const gS: [string, any[]][] = [
      ["Só ADX baixo (DI estava a favor)", so((x) => x.length === 1 && x[0] === "ADX")],
      ["Só DI (contra ou neutro; ADX ok)", so((x) => x.every((k) => k.startsWith("DI")))],
      ["  ↳ DI contra", so((x) => x.includes("DI-"))],
      ["  ↳ DI neutro", so((x) => x.includes("DI0"))],
      ["ADX baixo + DI errado", so((x) => x.includes("ADX") && x.some((k) => k.startsWith("DI")))],
      ["Só ADX não subindo (ADX e DI ok)", so((x) => x.length === 1 && x[0] === "ADX-")],
    ];
    for (const [nome, g] of gS) if (g.length) m += bloco(nome, g);
    const sL = somb.filter((r) => r.lado === "long"), sS = somb.filter((r) => r.lado === "short");
    if (sL.length && sS.length) { m += bloco("🟢 Sombra LONG", sL); m += bloco("🔴 Sombra SHORT", sS); }
    m += `<i>Compare com os alertas reais: se a sombra render igual ou melhor, a regra está cortando sinal bom (afrouxe o REPIQUE_ADX_MIN ou o REPIQUE_DI_OBRIGA); se render pior, está filtrando certo. Só confie onde n ≥ 15. Os reais abaixo do ADX mínimo são de antes da V104.</i>\n\n`;
  }
  m += `<i>Uso: /repsombra 30</i>`;
  for (const parte of dividirHtml(m)) await sendTelegram(chatId, parte);
}
// V92: /radarconf retro — refaz, com as velas dos últimos ~9 dias, a nota do RADAR DE TOPO (calcTopoPre) de cada moeda de tempos em tempos e mede o que aconteceu depois (SHORT),
// pra comparar 2/10, 3/10, 4/10 e 5/10 SEM esperar alerta novo. Aproximação: a nota usa só as velas (o bot ao vivo ainda soma funding/OI/BTC, que não dá pra reconstruir);
// moedas = as que já tiveram alerta no placar (até 60); amostras com intervalo mínimo de 4h por moeda e por faixa de nota.
async function runTopoRetro(chatId: number | string, tipo: "topo" | "fundo" = "topo") {
  const ehTopo = tipo === "topo", NOME = ehTopo ? "TOPO" : "FUNDO", EMO = ehTopo ? "🔴" : "🟢", LADO = ehTopo ? "SHORT" : "LONG";
  const SB = getSupabase();
  if (!SB) { await sendTelegram(chatId, "⚠️ Supabase não configurado."); return; }
  const desde = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data, error } = await lerPaginado((a, b) => SB.from(PLACAR_TABELA).select("instid, tipo").gt("criado_em", desde).range(a, b));
  if (error) { await sendTelegram(chatId, `⚠️ Não consegui ler o placar: ${String(error.message || error).replace(/</g, "&lt;")}`); return; }
  const cont = new Map<string, number>();
  for (const r of (data || []) as any[]) if (r.instid && r.tipo !== VOL_SOMBRA_TIPO) cont.set(r.instid, (cont.get(r.instid) || 0) + (r.tipo === tipo ? 3 : 1));
  const insts = [...cont.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60).map((x) => x[0]);
  if (insts.length < 5) { await sendTelegram(chatId, `${EMO} <b>${NOME} RETROATIVO</b>\n\nPoucas moedas no placar pra montar o teste.`); return; }
  const H4 = Math.round(240 / TF_MIN), H24 = Math.round(1440 / TF_MIN), JAN = 200;
  type Am = { conf: number; pts: number; r15: number; r1: number; r4: number; r24: number };
  const amostras: Am[] = [];
  let moedas = 0, portas = 0;
  await emLotes(insts, 4, async (id) => {
    const d = await xCandles(id, TIMEFRAME, SAIDA_CANDLES).catch(() => null);
    if (!d || d.c.length < JAN + H24 + 10) return;
    moedas++;
    const adxS = xAdxSerie(d.h, d.l, d.c, 14);
    let livreBaixa = 0, livreAlta = 0;
    for (let k = JAN; k + H24 < d.c.length; k += 4) {
      try {
        const sl = (a: number[]) => a.slice(k - JAN + 1, k + 1);
        const dk: XVelas = { t: sl(d.t), o: sl(d.o), h: sl(d.h), l: sl(d.l), c: sl(d.c), v: sl(d.v) };
        const info = calcIndicadorDeCloses(id, dk.c);
        if (!info) continue;
        if (ehTopo ? altaDoVale(dk.l, info.preco) < TOPO_ALTA_MIN : ddDoPico(dk.h, info.preco) < FUNDO_QUEDA_MIN) continue;
        const adx = adxNaVela(adxS, k), adx4 = adxNaVela(adxS, k - 4), adxAntes = Number.isFinite(adx4) ? adx4 : adx; // V109: alinhado à vela
        if (!isFinite(adx)) continue;
        const atr = calcATR(dk.h, dk.l, dk.c, 14);
        const top = ehTopo ? calcTopoPre(dk, info, atr, adx, adxAntes) : calcFundoPre(dk, info, atr, adx, adxAntes);
        if (!top || top.caindoFaca || top.conf < 2) continue;
        portas++;
        const alta = top.conf >= 5;
        if (alta ? k < livreAlta : k < livreBaixa) continue; // intervalo de 4h por moeda e por faixa de nota
        if (alta) livreAlta = k + H4; else livreBaixa = k + H4;
        const p0 = d.c[k];
        const ret = (k2: number) => (ehTopo ? (p0 - d.c[k2]) / p0 : (d.c[k2] - p0) / p0) * 100 - TAXA_IDA_VOLTA_PCT; // já com a taxa
        amostras.push({ conf: top.conf, pts: top.pts, r15: ret(k + 1), r1: ret(k + 4), r4: ret(k + H4), r24: ret(k + H24) });
      } catch { /* vela estranha: pula */ }
    }
  });
  if (amostras.length < 20) { await sendTelegram(chatId, `${EMO} <b>${NOME} RETROATIVO</b>\n\nSó ${amostras.length} situações achadas em ${moedas} moedas (precisa de ${ehTopo ? `uma alta de ${TOPO_ALTA_MIN}%+` : `uma queda de ${FUNDO_QUEDA_MIN}%+ do pico`} antes). Tente mais tarde.`); return; }
  const pc = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
  const linha = (nome: string, g: Am[]) => {
    if (!g.length) return "";
    const a4 = g.filter((x) => x.r4 > 0).length, a24 = g.filter((x) => x.r24 > 0).length;
    const w4 = g.filter((x) => x.r4 > 0).reduce((s2, x) => s2 + x.r4, 0), l4 = -g.filter((x) => x.r4 <= 0).reduce((s2, x) => s2 + x.r4, 0);
    const pf = l4 > 0 ? w4 / l4 : Infinity;
    const a15 = g.filter((x) => x.r15 > 0).length, a1 = g.filter((x) => x.r1 > 0).length;
    return `<b>${nome}</b> (n=${g.length})\n15m: ${pc(a15, g.length)}% ${_sg(_med(g.map((x) => x.r15)))} · 1h: ${pc(a1, g.length)}% ${_sg(_med(g.map((x) => x.r1)))} · 4h: ${pc(a4, g.length)}% ${_sg(_med(g.map((x) => x.r4)))} · 24h: ${pc(a24, g.length)}% ${_sg(_med(g.map((x) => x.r24)))}${isFinite(pf) ? ` · PF 4h ${pf.toFixed(2)}` : ""}${g.length < 20 ? " <i>(amostra pequena)</i>" : ""}\n\n`;
  };
  let m = `${EMO} <b>${NOME} RETROATIVO</b> — velas dos últimos ~${Math.floor((SAIDA_CANDLES * TF_MIN) / 1440) - 1} dias\n${DIVISOR}\n<i>Refeito com as velas: ${moedas} moedas, só quando a moeda ${ehTopo ? `tinha subido ${TOPO_ALTA_MIN}%+ da mínima` : `tinha caído ${FUNDO_QUEDA_MIN}%+ do pico`}, no máximo uma amostra a cada 4h por moeda e por faixa. ${LADO} a partir do fechamento da vela, já com a taxa (${TAXA_IDA_VOLTA_PCT.toFixed(2)}%). Em 15m a taxa pesa muito: o retorno mediano pequeno é esperado.</i>\n\n`;
  for (const n of [2, 3, 4, 5, 6, 7]) m += linha(`Nota ${n}/10`, amostras.filter((x) => x.conf === n));
  m += `${MINI_DIVISOR}\n`;
  const baixa = amostras.filter((x) => x.conf <= 4), alta = amostras.filter((x) => x.conf >= 5);
  m += linha("⬇️ Notas 2–4 (hoje NÃO alertam)", baixa) + linha("⬆️ Notas 5+ (hoje alertam)", alta);
  if (baixa.length >= 20 && alta.length >= 20) {
    const d24 = pc(baixa.filter((x) => x.r24 > 0).length, baixa.length) - pc(alta.filter((x) => x.r24 > 0).length, alta.length);
    const d4 = pc(baixa.filter((x) => x.r4 > 0).length, baixa.length) - pc(alta.filter((x) => x.r4 > 0).length, alta.length);
    const d15 = pc(baixa.filter((x) => x.r15 > 0).length, baixa.length) - pc(alta.filter((x) => x.r15 > 0).length, alta.length);
    m += `<b>Em 15 min</b> (onde você opera): as notas 2–4 acertam ${d15 >= 0 ? "+" : ""}${d15} pontos em relação às 5+.\n`;
    m += `<b>Leitura:</b> as notas 2–4 acertam ${d4 >= 0 ? "+" : ""}${d4} pontos em 4h e ${d24 >= 0 ? "+" : ""}${d24} pontos em 24h em relação às 5+. ${Math.abs(d4) < 5 && Math.abs(d24) < 5 ? "Praticamente não separam: a nota, nessa faixa, não prevê o resultado." : d24 > 5 || d4 > 5 ? "As notas baixas se saem MELHOR que as altas nesse recorte." : "As notas altas se saem melhor que as baixas nesse recorte."}\n`;
  }
  m += `<i>⚠️ Aproximação: sem funding/OI/BTC (a nota ao vivo pode ser até 4 pontos maior ou 3 menor), só moedas que já tiveram alerta e só ~9 dias de velas. Serve pra decidir se vale ligar o alerta 2/10 (${ehTopo ? "TOPO_PRE_MIN=3 e TOPO_CONF_MIN=2" : "FUNDO_PRE_MIN=3 e FUNDO_CONF_MIN=2"}) e conferir ao vivo — não como prova. Uso: /radarconf retro (topo) ou /radarconf retro fundo</i>`;
  for (const parte of dividirHtml(m)) await sendTelegram(chatId, parte);
}
async function runPlacar(chatId: number | string, dias: number) {
  const SB = getSupabase();
  if (!SB) { await sendTelegram(chatId, "⚠️ Supabase não configurado."); return; }
  const desde = new Date(Date.now() - dias * 86400000).toISOString();
  const { data, error } = await lerPaginadoDesde(chatId, (a, b) => SB.from(PLACAR_TABELA).select("*").gt("criado_em", desde).order("criado_em", { ascending: false }).range(a, b));
  if (error) { await sendTelegram(chatId, `⚠️ Não consegui ler o placar (a tabela ${PLACAR_TABELA} existe?): ${String(error.message || error).replace(/</g, "&lt;")}`); return; }
  const todas = (data || []) as any[];
  const rows = todas.filter((r) => !ehFinalLog(r) && !ehDescartadoLog(r));
  const finais = todas.filter(ehFinalLog);
  if (todas.length === 0) { await sendTelegram(chatId, `📊 <b>PLACAR</b>\n\nNenhum alerta registrado nos últimos ${dias} dia(s). Os alertas passam a ser registrados a partir de agora.`); return; }
  const comResultado = rows.filter((r) => r.preco_1h != null).length;
  // V69: cada grupo agora carrega uma CATEGORIA (3º item da tupla). Antes os 19 grupos saíam numa lista
  // só, sem separação visual — tipo de sinal, confiança, frescor e lado ficavam todos iguais, um embaixo do
  // outro, e no celular virava uma parede de bolinhas coloridas sem dar pra saber onde cada bloco começa.
  // Agora, ao trocar de categoria, entra um mini cabeçalho (mesmo MINI_DIVISOR usado no /estudo).
  const grupos: [string, (r: any) => boolean, string][] = [
    ["🚀 Oportunidade", (r) => r.tipo === "oportunidade", "Por tipo de sinal"],
    ["🔄 Reversão", (r) => r.tipo === "reversao", "Por tipo de sinal"],
    ["🟢 Fundo (radar)", (r) => r.tipo === "fundo", "Por tipo de sinal"],
    ["🔴 Topo (radar)", (r) => r.tipo === "topo", "Por tipo de sinal"],
    ["⭐ Repique SHORT (radar de topo)", (r) => String(r.status || "").includes("REPIQUE SHORT"), "Por tipo de sinal"],
    ["⭐ Repique LONG (radar de fundo)", (r) => String(r.status || "").includes("REPIQUE LONG"), "Por tipo de sinal"],
    ["🗜️ Compressão (radar)", (r) => r.tipo === "compressao", "Por tipo de sinal"],
    // V54: faixas iguais às bolinhas da confiança (🟢 ≥ CONF_VERDE, 🟡 = CONF_AMARELO..CONF_VERDE-1, 🔴 abaixo) — antes era 8–10 / 6–7 / ≤5,
    // e a confiança 7 (🟢 nas mensagens) caía junto com a 6 (🟡), então o placar não respondia "o verde acerta mais que o amarelo?".
    [`🟢 Confiança ${CONF_VERDE}–10`, (r) => r.conf != null && Number(r.conf) >= CONF_VERDE, "Por confiança"],
    [CONF_VERDE - CONF_AMARELO > 1 ? `🟡 Confiança ${CONF_AMARELO}–${CONF_VERDE - 1}` : `🟡 Confiança ${CONF_AMARELO}`, (r) => r.conf != null && Number(r.conf) >= CONF_AMARELO && Number(r.conf) < CONF_VERDE, "Por confiança"],
    [`🔴 Confiança ≤ ${CONF_AMARELO - 1}`, (r) => r.conf != null && Number(r.conf) < CONF_AMARELO, "Por confiança"],
    ["🆕 Cruzou agora", (r) => r.fresco === true, "Por frescor e distância"],
    ["⌛ Não fresco", (r) => r.fresco !== true, "Por frescor e distância"],
    ["🔥 Muito perto", (r) => String(r.status || "").includes("MUITO PERTO"), "Por frescor e distância"],
    ["🎯 Chegando (antecipado)", (r) => String(r.status || "").includes("CHEGANDO"), "Por frescor e distância"],
    ["🟡 Perto", (r) => String(r.status || "").includes("PERTO") && !String(r.status || "").includes("MUITO PERTO"), "Por frescor e distância"],
    ["💪 ADX ≥ 25", (r) => r.adx != null && Number(r.adx) >= 25, "Por força da tendência (ADX)"],
    ["😐 ADX &lt; 25", (r) => r.adx != null && Number(r.adx) < 25, "Por força da tendência (ADX)"],
    ["🧱 Em lateral (filtro lateral ligado na hora)", (r) => temMarca(r, LAT_MARCA), "Por mercado (filtro lateral)"],
    ["📶 Com tendência (filtro liberado na hora)", (r) => temMarca(r, TEND_MARCA), "Por mercado (filtro lateral)"],
    ["🟢 LONG", (r) => r.lado === "long" && !(r.tipo === "compressao" && r.ent_status !== "entrou"), "Por lado"],
    ["🔴 SHORT", (r) => r.lado === "short" && !(r.tipo === "compressao" && r.ent_status !== "entrou"), "Por lado"], // V54: mesmo filtro do LONG (compressão sem rompimento não tem lado)
  ];
  let msg = `📊 <b>PLACAR DOS ALERTAS</b> — últimos ${dias} dia(s)\n${DIVISOR}\n${rows.length} alerta(s), ${comResultado} já conferidos\n<i>acerto = preço andou a favor do lado que o robô abriria, contado desde o FECHAMENTO da vela que cruzou a linha (entrada do robô); % = retorno MEDIANO já descontada a taxa (${TAXA_IDA_VOLTA_PCT.toFixed(2)}% ida e volta)</i>\n\n`;
  msg += `<b>Geral</b>\n${linhaStats(rows)}\n\n`;
  let categoriaAnterior = "";
  for (const [nome, fn, categoria] of grupos) {
    const g = rows.filter(fn);
    if (g.length === 0) continue;
    if (categoria !== categoriaAnterior) { msg += `${MINI_DIVISOR}\n<b>${categoria}</b>\n${MINI_DIVISOR}\n\n`; categoriaAnterior = categoria; }
    msg += `<b>${nome}</b> (n=${g.length})\n${linhaStats(g)}\n\n`;
  }
  const resolvidos = rows.filter((r) => r.ent_status != null);
  if (resolvidos.length) {
    const nao = resolvidos.filter((r) => r.ent_status === "nao_entrou").length;
    const contraN = resolvidos.filter((r) => r.ent_status === "contra").length;
    msg += `🚫 <b>Não viraram entrada</b>: ${nao + contraN} de ${resolvidos.length} avisos (${nao} não cruzaram · ${contraN} cruzaram pro lado oposto)\n<i>é o alarme falso: aviso em que o robô não entraria naquele lado</i>\n\n`;
  }
  const comp = rows.filter((r) => r.tipo === "compressao" && r.ent_status != null);
  if (comp.length) {
    const rompeu = comp.filter((r) => r.ent_status === "entrou").length;
    msg += `🗜️ <b>Compressão</b>: ${rompeu} de ${comp.length} tiveram um fechamento fora da faixa em até ${ENTRADA_MAX_CANDLES * TF_MIN} min (${Math.round((rompeu / comp.length) * 100)}%)\n<i>o lado é o do 1º fechamento fora da faixa e o retorno conta desde ele: um 1º cruzamento falso aparece como resultado ruim</i>\n\n`;
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
  msg += `<i>Já desconta a taxa da BloFin; não considera funding, stop nem o tamanho da posição. Uso: /placar 30 (30 dias). O 15m está no /15min e a saída real do robô no /saida</i>`;
  await enviarEmPartes(chatId, msg); // V107: em partes
}
// ─────────────────────────────────────────────────────────────
// V66: /15min — placar do horizonte de 15m, separado do /placar
async function run15min(chatId: number | string, dias: number) {
  const SB = getSupabase();
  if (!SB) { await sendTelegram(chatId, "⚠️ Supabase não configurado."); return; }
  const desde = new Date(Date.now() - dias * 86400000).toISOString();
  const { data, error } = await lerPaginadoDesde(chatId, (a, b) => SB.from(PLACAR_TABELA).select("*").gt("criado_em", desde).order("criado_em", { ascending: false }).range(a, b));
  if (error) { await sendTelegram(chatId, `⚠️ Não consegui ler o placar (a tabela ${PLACAR_TABELA} existe?): ${String(error.message || error).replace(/</g, "&lt;")}`); return; }
  const rows = ((data || []) as any[]).filter((r) => !ehFinalLog(r) && !ehDescartadoLog(r));
  if (!rows.length) { await sendTelegram(chatId, `⏱️ <b>PLACAR 15m</b>\n\nNenhum alerta registrado nos últimos ${dias} dia(s).`); return; }
  if (!rows.some((r) => "preco_15m" in r)) { await sendTelegram(chatId, "⚠️ alertas_log sem a coluna preco_15m: rode o ALTER TABLE do horizonte de 15m."); return; }
  const conf = rows.filter((r) => retornoLog(r, 15) !== null).length;
  let msg = `⏱️ <b>PLACAR 15m</b> — últimos ${dias} dia(s)\n${DIVISOR}\n${rows.length} alerta(s), ${conf} com 15m conferido\n<i>retorno em 15 min desde o fechamento da vela do cruzamento, já com a taxa. Serve pra medir o ruído de curto prazo; trade que dura horas ou dias não cabe aqui, veja o /saida.</i>\n\n`;
  msg += `<b>Geral (todos os alertas)</b>\n${linhaStats(rows, [15])}\n`;
  await enviarEmPartes(chatId, msg); // V107: em partes
  try {
    const t15 = placar15mTxt(rows);
    await enviarEmPartes(chatId, t15 || "⏱️ Ainda sem alertas frescos (cruzou agora) com 15m conferido nesse período."); // V107: em partes
  } catch (e) { console.log("⚠️ /15min:", e); }
}

// V66: /saida — simula a saída REAL do robô em vez de horizonte fixo.
// Saída = 1º fechamento 15m do lado contrário da faixa (espelho da regra de entrada) OU stop de SAIDA_STOP_ATR×ATR (o que vier primeiro).
// Variante B soma o trailing por degraus de TRAIL_ATR_MULT×ATR (mesma regra do calcTrailing). Resultado em múltiplos de risco (R), já com a taxa.
const SAIDA_CANDLES = numEnv("SAIDA_CANDLES", "1000");
const SAIDA_STOP_ATR = numEnv("SAIDA_STOP_ATR", "1");
type SaidaSim = { r: number; barras: number; motivo: "stop" | "trail" | "cruzou" | "aberto" };
function simularSaida(d: XVelas, jd: { suprema: number; j6: number }[], kE: number, lado: "long" | "short", p0: number, atr: number, trail: boolean): SaidaSim | null {
  const risco = atr * SAIDA_STOP_ATR;
  if (!(risco > 0) || !(p0 > 0)) return null;
  const long = lado === "long";
  const stopIni = long ? p0 - risco : p0 + risco;
  let stop = stopIni;
  const R2 = atr * TRAIL_ATR_MULT;
  const feeR = (p0 * TAXA_IDA_VOLTA_PCT / 100) / risco;
  const fim = (preco: number, k: number, motivo: SaidaSim["motivo"]): SaidaSim => ({ r: ((long ? preco - p0 : p0 - preco) / risco) - feeR, barras: k - kE, motivo });
  let melhor = p0;
  const n = d.c.length;
  for (let k = kE + 1; k < n; k++) {
    if (long ? d.l[k] <= stop : d.h[k] >= stop) {
      const px = long ? Math.min(stop, d.o[k]) : Math.max(stop, d.o[k]);
      return fim(px, k, stop === stopIni ? "stop" : "trail");
    }
    const contra = long ? d.c[k] < Math.min(jd[k].suprema, jd[k].j6) : d.c[k] > Math.max(jd[k].suprema, jd[k].j6);
    if (contra) return fim(d.c[k], k, "cruzou");
    if (trail && R2 > 0) {
      melhor = long ? Math.max(melhor, d.h[k]) : Math.min(melhor, d.l[k]);
      const ganho = long ? melhor - p0 : p0 - melhor;
      const nn = Math.floor(ganho / R2);
      if (nn >= 1) { const novo = long ? p0 + (nn - 1) * R2 : p0 - (nn - 1) * R2; stop = long ? Math.max(stop, novo) : Math.min(stop, novo); }
    }
  }
  return fim(d.c[n - 1], n - 1, "aberto");
}
// V74: trailing do MOTOR (bot-engine) simulado em % de preço. Copia a regra de verdade: o robô arma o trailing quando o lucro (preço, sem alavancagem)
// chega em `trava`%, guarda o pico e fecha quando o preço cai `cb`% desde o pico (E, contínuo); SL = fecha em −sl% (só se sl > 0). Também sai no
// cruzamento contrário, como o robô. F = degrau: piso = floor(pico%/trava)×trava − cb (sobe de `trava` em `trava`%, parado entre os degraus).
// Vela a vela (sem tick): o stop checa com o pico das velas ANTERIORES (assume que a mínima veio antes da máxima, que é a hipótese pior) e na vela em que
// o trailing arma não conta saída (ordem máxima/mínima desconhecida — aproximação otimista, só nessa vela). SL/trailing em % de preço (alavancagem 1).
const SAIDA_E_TRAVA = numEnv("SAIDA_E_TRAVA", "0.5");
const SAIDA_E_CB = numEnv("SAIDA_E_CB", "0.3");
const SAIDA_E_SL = numEnv("SAIDA_E_SL", "0");
// V74: /saida simplificado. Filtro PADRÃO (o que você usa): moeda com |24h| ≥ 8% e ADX ≥ 14 SUBINDO (ADX da vela da entrada > ADX de 4 velas antes, igual ao scanner),
// tudo medido NA HORA do alerta (sem olhar o futuro). "tudo" no comando mostra todas as entradas. Trailing comparado por padrão: 5/3.5 (SAIDA_CFG_PADRAO).
const SAIDA_FILTRO_PADRAO = (Deno.env.get("SAIDA_FILTRO_PADRAO") ?? "1") !== "0";
// V107: faixas de |variação 24h| usadas no /saida e no /radarsim ("por movimento no dia")
const MOV_FAIXAS: [string, number, number][] = [["abaixo de 8%", 0, 8], ["8% a 15%", 8, 15], ["15% a 25%", 15, 25], ["25% ou mais", 25, Infinity]];
const SAIDA_MOV_PADRAO = numEnv("SAIDA_MOV_PADRAO", "8");
const SAIDA_ADX_PADRAO = numEnv("SAIDA_ADX_PADRAO", "14");
const SAIDA_ADX_SUBINDO = (Deno.env.get("SAIDA_ADX_SUBINDO") ?? "1") !== "0";
const SAIDA_ADX_JAN = numEnv("SAIDA_ADX_JAN", "4");
const SAIDA_CFG_PADRAO = (() => {
  const m = String(Deno.env.get("SAIDA_CFG_PADRAO") ?? "5/3.5").match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)(?:\/(\d+(?:\.\d+)?))?$/);
  return m ? { trava: Number(m[1]), cb: Number(m[2]), sl: m[3] ? Number(m[3]) : 0 } : { trava: 5, cb: 3.5, sl: 0 };
})();
type MotorCfg = { trava: number; cb: number; sl: number; degrau: boolean };
function simularLegMotor(d: XVelas, jd: { suprema: number; j6: number }[], kE: number, lado: "long" | "short", p0: number, cfg: MotorCfg): SaidaSim | null {
  if (!(p0 > 0) || !(cfg.trava > 0) || !(cfg.cb > 0)) return null;
  const long = lado === "long", n = d.c.length;
  const pnlDe = (px: number) => ((long ? px - p0 : p0 - px) / p0) * 100;
  const pxDePnl = (pnl: number) => (long ? p0 * (1 + pnl / 100) : p0 * (1 - pnl / 100));
  const fim = (px: number, k: number, motivo: SaidaSim["motivo"]): SaidaSim => ({ r: pnlDe(px) - TAXA_IDA_VOLTA_PCT, barras: k - kE, motivo });
  const abre = (k: number) => d.o[k];
  let armado = false, pico = p0;
  for (let k = kE + 1; k < n; k++) {
    if (cfg.sl > 0) {
      const nivel = pxDePnl(-cfg.sl);
      if (long ? d.l[k] <= nivel : d.h[k] >= nivel) return fim(long ? Math.min(nivel, abre(k)) : Math.max(nivel, abre(k)), k, "stop");
    }
    if (armado) {
      const nivel = cfg.degrau
        ? pxDePnl(Math.floor(pnlDe(pico) / cfg.trava + 1e-9) * cfg.trava - cfg.cb)
        : long ? pico * (1 - cfg.cb / 100) : pico * (1 + cfg.cb / 100);
      if (long ? d.l[k] <= nivel : d.h[k] >= nivel) return fim(long ? Math.min(nivel, abre(k)) : Math.max(nivel, abre(k)), k, "trail");
    }
    const contra = long ? d.c[k] < Math.min(jd[k].suprema, jd[k].j6) : d.c[k] > Math.max(jd[k].suprema, jd[k].j6);
    if (contra) return fim(d.c[k], k, "cruzou");
    pico = long ? Math.max(pico, d.h[k]) : Math.min(pico, d.l[k]);
    if (!armado && pnlDe(long ? d.h[k] : d.l[k]) >= cfg.trava) armado = true;
  }
  return fim(d.c[n - 1], n - 1, "aberto");
}
// V71: virada encadeada. Veio da análise do ZRO (10:30 SHORT → 12:00 LONG sem alerta): o ESTRATEGIA_PUMP filtra o
// ALERTA (decide se avisa), mas o robô, depois de ligado, "vira sozinho nos dois sentidos" — ele entra em todo
// cruzamento, avisado ou não. O /saida (A/B) media só a 1ª perna de cada entrada registrada, então nunca via essas
// viradas silenciosas. simularSaidaEncadeada reproduz o que o robô faria de fato a partir da 1ª entrada:
// • saiu no CRUZAMENTO → abre a posição contrária no mesmo fechamento (sem esperar alerta, sem olhar o ESTRATEGIA_PUMP).
// • saiu no STOP → não vira sozinho; fica de fora até o próximo cruzamento (de qualquer lado) e só então reentra.
// Cada perna nova recalcula o ATR (risco e trailing mudam com a volatilidade do momento). Limite de pernas evita
// cadeia sem fim num ativo andando de lado.
type PernaSim = SaidaSim & { lado: "long" | "short"; kE: number };
function simularSaidaEncadeada(
  d: XVelas, jd: { suprema: number; j6: number }[], kEini: number, ladoIni: "long" | "short",
  p0ini: number, atrIni: number, trail: boolean, maxPernas = 12,
  legFn?: (k: number, lado: "long" | "short", p0: number) => SaidaSim | null, // V74: perna alternativa (trailing do motor); sem ela usa a simularSaida em R
): { pernas: PernaSim[]; rTotal: number; cortou: boolean } {
  const pernas: PernaSim[] = [];
  let cortou = false; // V74: true só se a cadeia TINHA mais pernas pela frente quando bateu no limite (antes: qualquer cadeia com exatamente maxPernas)
  let kE = kEini, lado = ladoIni, p0 = p0ini, atr = atrIni, rTotal = 0;
  const n = d.c.length;
  const atrEm = (k: number) => calcATR(d.h.slice(0, k + 1), d.l.slice(0, k + 1), d.c.slice(0, k + 1), 14);
  for (let i = 0; i < maxPernas; i++) {
    const sim = legFn ? legFn(kE, lado, p0) : simularSaida(d, jd, kE, lado, p0, atr, trail);
    if (!sim) break;
    pernas.push({ ...sim, lado, kE });
    rTotal += sim.r;
    if (sim.motivo === "aberto") break; // fim dos dados, posição segue aberta
    const kSaida = kE + sim.barras;
    if (sim.motivo === "cruzou") {
      if (i === maxPernas - 1) cortou = true;
      lado = lado === "long" ? "short" : "long";
      kE = kSaida; p0 = d.c[kSaida]; atr = atrEm(kE) || atr; // sem histórico suficiente aqui: reaproveita o ATR anterior
      continue;
    }
    // stop: espera o PRÓXIMO cruzamento DE VERDADE (transição), de qualquer lado — não reentra só porque o preço
    // "já estava" do lado favorável desde antes do stop (senão reentraria na mesma vela toda vez, sem esperar nada).
    // Mesma ideia do idadeCandles (linha ~850): cruzamento = a vela anterior NÃO satisfazia e esta satisfaz.
    const ladoDe = (k: number) => (d.c[k] > Math.max(jd[k].suprema, jd[k].j6) ? "long" : d.c[k] < Math.min(jd[k].suprema, jd[k].j6) ? "short" : null);
    let kNovo = -1, novoLado: "long" | "short" | null = null;
    let ladoAntes = ladoDe(kSaida);
    for (let k = kSaida + 1; k < n; k++) {
      const ladoAgora = ladoDe(k);
      if (ladoAgora && ladoAgora !== ladoAntes) { novoLado = ladoAgora; kNovo = k; break; }
      ladoAntes = ladoAgora;
    }
    if (novoLado === null) break; // não cruzou mais até o fim dos dados
    if (i === maxPernas - 1) cortou = true;
    lado = novoLado; kE = kNovo; p0 = d.c[kNovo]; atr = atrEm(kE) || atr;
  }
  return { pernas, rTotal, cortou };
}
function statsR(xs: number[], un = "R"): string {
  if (!xs.length) return "sem dados";
  const ac = xs.filter((x) => x > 0).length, pf = _profitFactor(xs), media = xs.reduce((a, b) => a + b, 0) / xs.length;
  const s3 = [...xs].sort((a, b) => b - a).slice(3);
  const sem3 = s3.length ? s3.reduce((a, b) => a + b, 0) / s3.length : NaN;
  const f = (x: number) => (isFinite(x) ? `${x >= 0 ? "+" : ""}${x.toFixed(2)}${un}` : "—");
  return `acerto ${Math.round((ac / xs.length) * 100)}% (${ac}/${xs.length}) · ${un === "R" ? "R médio" : "médio"} ${f(media)} · mediana ${f(_med(xs))} · PF ${isFinite(pf) ? pf.toFixed(2) : pf === Infinity ? "∞" : "—"} · sem os 3 melhores ${xs.length > 3 ? f(sem3) : "—"}`;
}
async function runSaida(chatId: number | string, dias: number, opc?: { tipos?: string[]; moeda?: string; cfg?: { trava: number; cb: number; sl: number }; filtro?: { mov: number; adx: number; subindo: boolean } | null }) {
  const SB = getSupabase();
  if (!SB) { await sendTelegram(chatId, "⚠️ Supabase não configurado."); return; }
  const maxDias = Math.max(1, Math.floor((SAIDA_CANDLES * TF_MIN) / 1440) - 1);
  const dd = Math.min(dias, maxDias);
  const desde = new Date(Date.now() - dd * 86400000).toISOString();
  const { data, error } = await SB.from(PLACAR_TABELA).select("*").gt("criado_em", desde).eq("ent_status", "entrou").order("criado_em", { ascending: false }).limit(600);
  if (error) { await sendTelegram(chatId, `⚠️ Não consegui ler o placar: ${String(error.message || error).replace(/</g, "&lt;")}`); return; }
  const truncou600 = (data || []).length >= 600; // V74: o .limit(600) cortava em silêncio
  const baseDe = (id: string) => String(id).split("-")[0];
  const rowsBase = ((data || []) as any[]).filter((r) => (!opc?.tipos?.length || opc.tipos.includes(String(r.tipo))) && !ehFinalLog(r) && !ehSombraRev(r) && !ehSombraRep(r) && !ehSombraVol(r) && r.ent_em && Number(r.preco) > 0 && desdeOk(desdeDoChat(chatId), new Date(r.criado_em).getTime(), r.versao))
    .filter((r) => !opc?.moeda || baseDe(r.instid) === opc.moeda || baseDe(r.instid) === `1000${opc.moeda}`);
  const filtro = opc?.filtro ?? null;
  const rows = rowsBase.filter((r) => !filtro || !(filtro.mov > 0) || (r.pct24 != null && Math.abs(Number(r.pct24)) >= filtro.mov)); // |24h| da hora do alerta
  const filtroBase = filtro ? `🔎 Filtro (valores da hora do alerta): |24h| ≥ ${filtro.mov}%${filtro.adx > 0 ? ` · ADX ≥ ${filtro.adx}${filtro.subindo ? " e subindo" : ""}` : ""}` : "";
  let filtroTxt = filtro ? `${filtroBase}\n` : "";
  let passaramFiltro = 0, passaramAdx = 0;
  if (!rows.length) { await sendTelegram(chatId, `🚪 <b>SAÍDA REAL</b>\n\n${filtroTxt}Nenhuma entrada registrada${opc?.moeda ? ` de ${opc.moeda}` : ""} nos últimos ${dd} dia(s)${filtro ? ` com esse filtro (tudo: /saida ${dd} tudo)` : ""}.`); return; }
  // V74: variantes do trailing do motor (% de preço): "Hoje" = SAIDA_E_* (0.5/0.3 sem SL); com config no comando, E (contínuo) e F (degrau)
  const fmtCfg = (c: { trava: number; cb: number; sl: number }) => `${c.trava}/${c.cb}${c.sl > 0 ? ` · SL ${c.sl}%` : " · sem SL"}`;
  const baseMot: MotorCfg = { trava: SAIDA_E_TRAVA, cb: SAIDA_E_CB, sl: SAIDA_E_SL, degrau: false };
  const varsMot: { id: string; nome: string; cfg: MotorCfg }[] = [{ id: "H", nome: `Hoje (${fmtCfg(baseMot)})`, cfg: baseMot }];
  let notaF = "";
  if (opc?.cfg) {
    const u: MotorCfg = { ...opc.cfg, degrau: false };
    if (!(u.trava === baseMot.trava && u.cb === baseMot.cb && u.sl === baseMot.sl)) varsMot.push({ id: "E", nome: `E contínuo (${fmtCfg(u)})`, cfg: u });
    if (u.cb < u.trava) varsMot.push({ id: "F", nome: `F degrau de ${u.trava}% em ${u.trava}% (${fmtCfg(u)})`, cfg: { ...u, degrau: true } });
    else notaF = "F (degrau) não roda: o callback precisa ser menor que a trava.";
  }
  const motor: Record<string, { primeira: number[]; cadeia: number[]; pernas: number[]; mot: Record<string, number> }> = {};
  varsMot.forEach((v) => { motor[v.id] = { primeira: [], cadeia: [], pernas: [], mot: {} }; });
  const porMoeda = new Map<string, any[]>();
  rows.forEach((r) => { const a = porMoeda.get(r.instid) || []; a.push(r); porMoeda.set(r.instid, a); });
  type Res = { r: any; a: SaidaSim; b: SaidaSim; c: { rTotal: number; pernas: number; flips: number; bateuLimite: boolean; dup: boolean }; d: { rTotal: number; pernas: number; flips: number; bateuLimite: boolean; dup: boolean } };
  const res: Res[] = [];
  const viradas: { inst: string; de: "long" | "short"; para: "long" | "short"; emMs: number; r: number; semAlerta: boolean }[] = [];
  const viradasVistas = new Set<string>(); // V74: a MESMA virada (moeda + vela + lado) vinha 2x quando duas cadeias convergiam pro mesmo cruzamento (ex.: STRK S→L 21:45 repetida na lista e somada 2x)
  let semHist = 0;
  const TFMS = TF_MIN * 60000;
  await emLotes([...porMoeda.keys()], 5, async (id) => {
    const d = await xCandles(id, TIMEFRAME, SAIDA_CANDLES);
    if (!d) { semHist += porMoeda.get(id)!.length; return; }
    const jd = superV2(d.c, PESO_SUPREMA);
    const adxS = filtro && filtro.adx > 0 ? xAdxSerie(d.h, d.l, d.c, 14) : null;
    const adxEm = (k: number): number => { const j = k - (2 * 14 - 1); return adxS && j >= 0 && j < adxS.length ? adxS[j] : NaN; }; // a série só começa na vela 2p−1
    const rowsM: { r: any; kE: number }[] = [];
    for (const r of porMoeda.get(id)!) {
      const emMs = new Date(r.ent_em).getTime();
      let kE = -1;
      for (let i = d.t.length - 1; i >= 0; i--) { if (Math.abs(d.t[i] + TFMS - emMs) <= TFMS / 2) { kE = i; break; } }
      if (kE < 100) { semHist++; continue; }
      rowsM.push({ r, kE });
    }
    // V74: em ordem de entrada, pra detectar entrada que já está dentro da cadeia (virada) de outra da mesma moeda — sem isso C/D contavam as mesmas pernas 2x
    rowsM.sort((x, y) => x.kE - y.kE);
    const covC = new Set<string>(), covD = new Set<string>();
    const covM: Record<string, Set<string>> = {};
    varsMot.forEach((v) => { covM[v.id] = new Set<string>(); });
    const alertados = new Set(rowsM.map((x) => `${x.kE}|${x.r.lado === "long" ? "long" : "short"}`));
    for (const { r, kE } of rowsM) {
      const atr = calcATR(d.h.slice(0, kE + 1), d.l.slice(0, kE + 1), d.c.slice(0, kE + 1), 14);
      const lado: "long" | "short" = r.lado === "long" ? "long" : "short";
      if (adxS && filtro) { // ADX ≥ mínimo e (se pedido) subindo: ADX da vela da entrada maior que o de SAIDA_ADX_JAN velas antes
        const a0 = adxEm(kE), a4 = adxEm(kE - SAIDA_ADX_JAN);
        if (isFinite(a0) && a0 >= filtro.adx) passaramAdx++;
        if (!(isFinite(a0) && a0 >= filtro.adx && (!filtro.subindo || (isFinite(a4) && a0 > a4)))) continue;
      }
      passaramFiltro++;
      const a = simularSaida(d, jd, kE, lado, Number(r.preco), atr, false);
      const b = simularSaida(d, jd, kE, lado, Number(r.preco), atr, true);
      if (!(a && b)) continue;
      const MAX_PERNAS_SAIDA = 12;
      const ced = simularSaidaEncadeada(d, jd, kE, lado, Number(r.preco), atr, false, MAX_PERNAS_SAIDA);
      const ded = simularSaidaEncadeada(d, jd, kE, lado, Number(r.preco), atr, true, MAX_PERNAS_SAIDA);
      const chave = `${kE}|${lado}`;
      for (const v of varsMot) { // V74: trailing do motor — 1ª perna e cadeia (vira no cruzamento; depois de trail/SL espera o próximo cruzamento)
        const leg = (k: number, l: "long" | "short", pr: number) => simularLegMotor(d, jd, k, l, pr, v.cfg);
        const s1 = leg(kE, lado, Number(r.preco));
        if (!s1) continue;
        const chm = simularSaidaEncadeada(d, jd, kE, lado, Number(r.preco), atr, false, 12, leg);
        const dupM = covM[v.id].has(chave);
        chm.pernas.forEach((pp) => covM[v.id].add(`${pp.kE}|${pp.lado}`));
        const acc = motor[v.id];
        acc.primeira.push(s1.r);
        acc.mot[s1.motivo] = (acc.mot[s1.motivo] || 0) + 1;
        if (!dupM) { acc.cadeia.push(chm.rTotal); acc.pernas.push(chm.pernas.length); }
      }
      const dupC = covC.has(chave), dupD = covD.has(chave);
      ced.pernas.forEach((pp) => covC.add(`${pp.kE}|${pp.lado}`));
      ded.pernas.forEach((pp) => covD.add(`${pp.kE}|${pp.lado}`));
      const c = { rTotal: ced.rTotal, pernas: ced.pernas.length, flips: ced.pernas.length - 1, bateuLimite: ced.cortou, dup: dupC };
      const dd2 = { rTotal: ded.rTotal, pernas: ded.pernas.length, flips: ded.pernas.length - 1, bateuLimite: ded.cortou, dup: dupD };
      res.push({ r, a, b, c, d: dd2 });
      if (!dupC) {
        for (let i = 1; i < ced.pernas.length; i++) {
          const ant = ced.pernas[i - 1], pp = ced.pernas[i];
          if (ant.motivo !== "cruzou") continue; // só virada de verdade (saiu no cruzamento e entrou na contrária)
          const kVir = `${id}|${pp.kE}|${pp.lado}`;
          if (viradasVistas.has(kVir)) continue;
          viradasVistas.add(kVir);
          viradas.push({ inst: id, de: ant.lado, para: pp.lado, emMs: d.t[pp.kE] + TFMS, r: pp.r, semAlerta: !alertados.has(`${pp.kE}|${pp.lado}`) });
        }
      }
    }
  });
  if (!res.length) { await sendTelegram(chatId, `🚪 <b>SAÍDA REAL</b>\n\nNão consegui simular nenhuma entrada (${semHist} sem histórico de velas suficiente).`); return; }
  const grupos: [string, (x: Res) => boolean][] = [
    ["Geral", () => true],
    ["🆕 Cruzou agora", (x) => x.r.fresco === true],
    ["⌛ Não fresco", (x) => x.r.fresco !== true],
    ["🟢 LONG", (x) => x.r.lado === "long"],
    ["🔴 SHORT", (x) => x.r.lado === "short"],
    ["🧱 Em lateral", (x) => temMarca(x.r, LAT_MARCA)],
    ["📶 Com tendência", (x) => temMarca(x.r, TEND_MARCA)],
    // V107: por movimento da moeda no dia (|24h| na hora do alerta): o cruzamento funciona melhor nas moedas MUITO movimentadas?
    ...MOV_FAIXAS.map(([nome, a, b]) => [`📏 |24h| ${nome}`, (x: Res) => { const v = Math.abs(Number(x.r.pct24)); return x.r.pct24 != null && isFinite(v) && v >= a && v < b; }] as [string, (x: Res) => boolean]),
  ];
  const abertos = res.filter((x) => x.a.motivo === "aberto").length;
  if (filtro) filtroTxt = `${filtroBase} · ${passaramFiltro} de ${rowsBase.length} entradas passaram (todas: /saida ${dd} tudo)\nFunil: ${rowsBase.length} → ${rows.length} com |24h| ≥ ${filtro.mov}%${filtro.adx > 0 ? ` → ${passaramAdx} com ADX ≥ ${filtro.adx} → ${passaramFiltro}${filtro.subindo ? " subindo" : ""}` : ""}\n`;
  const TIPO_TXT: Record<string, string> = { compressao: "🗜️ compressão", oportunidade: "🚀 oportunidade", reversao: "🔄 reversão", fundo: "🟢 fundo", topo: "🔴 topo" };
  let msg = `🚪 <b>SAÍDA REAL DO ROBÔ</b> — últimos ${dd} dia(s)${opc?.moeda ? ` · ${opc.moeda}` : ""}${opc?.tipos?.length ? ` · só ${opc.tipos.map((t) => TIPO_TXT[t] ?? t).join(" + ")}` : ""}\n${DIVISOR}\n${filtroTxt}${res.length} entrada(s) simuladas${abertos ? `, ${abertos} ainda aberta(s) (contadas ao preço atual)` : ""}${semHist ? `, ${semHist} sem velas suficientes` : ""}\n<i>Entrada = fechamento da vela do cruzamento. 1R = ${SAIDA_STOP_ATR}×ATR da entrada. A = sai no cruzamento contrário da faixa ou no stop. B = A + trailing por degraus de ${TRAIL_ATR_MULT}×ATR. Já desconta a taxa (${TAXA_IDA_VOLTA_PCT.toFixed(2)}%); sem funding.</i>\n\n`;
  for (const [nome, fn] of grupos) {
    const g = res.filter(fn);
    if (!g.length) continue;
    msg += `<b>${nome}</b> (n=${g.length})\nA: ${statsR(g.map((x) => x.a.r))}\nB: ${statsR(g.map((x) => x.b.r))}\n`;
    const ehLatGrupo = nome.startsWith("🧱") || nome.startsWith("📶") || nome.startsWith("📏"); // V107: as faixas de movimento também mostram a cadeia C/D (as viradas)
    if (nome === "Geral" || ehLatGrupo) {
      const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
      const comVirada = (xs: Res[]) => xs.filter((x) => x.c.flips > 0).length;
      const gc = g.filter((x) => !x.c.dup), gd = g.filter((x) => !x.d.dup);
      const noLimiteC = gc.filter((x) => x.c.bateuLimite).length, noLimiteD = gd.filter((x) => x.d.bateuLimite).length;
      if (!gc.length || !gd.length) msg += `C/D: as ${g.length} entrada(s) deste grupo já estavam dentro da cadeia de outra (contadas no Geral)\n`;
      else {
      msg += `C (viradas, sem trailing): ${statsR(gc.map((x) => x.c.rTotal))} · ${avg(gc.map((x) => x.c.pernas)).toFixed(1)} perna(s)/entrada em média, ${comVirada(gc)} entrada(s) viraram pelo menos 1x${noLimiteC ? ` · ⚠️ ${noLimiteC} bateu(ram) no limite de 12 pernas (o R real dessas pode ser diferente do mostrado)` : ""}\n`;
      msg += `D (viradas, com trailing): ${statsR(gd.map((x) => x.d.rTotal))} · ${avg(gd.map((x) => x.d.pernas)).toFixed(1)} perna(s)/entrada em média${noLimiteD ? ` · ⚠️ ${noLimiteD} bateu(ram) no limite` : ""}\n`;
      }
      const dupsC = g.length - gc.length, dupsD = g.length - gd.length;
      if (nome === "Geral" && (dupsC || dupsD)) msg += `↪️ ${dupsC === dupsD ? dupsC : `${dupsC} em C e ${dupsD} em D`} entrada(s) já estavam dentro da cadeia de outra da mesma moeda e entram em C/D uma vez só\n`;
    }
    msg += `\n`;
  }
  {
    const gl = res.filter((x) => temMarca(x.r, LAT_MARCA) && !x.c.dup), gt = res.filter((x) => temMarca(x.r, TEND_MARCA) && !x.c.dup);
    if (gl.length + gt.length > 0) {
      const mR = (xs: Res[]) => xs.reduce((t, x) => t + x.c.rTotal, 0) / xs.length;
      msg += `<i>🧱/📶 = filtro lateral no momento do alerta (só alertas novos; ${res.length - res.filter((x) => temMarca(x.r, LAT_MARCA) || temMarca(x.r, TEND_MARCA)).length} sem marca ficam fora desses dois grupos)</i>\n`;
      if (gl.length >= 20 && gt.length >= 20) {
        const dif = mR(gt) - mR(gl);
        msg += `🧱 Leitura (cadeia C): em lateral ${mR(gl) >= 0 ? "+" : ""}${mR(gl).toFixed(2)}R/entrada (n=${gl.length}) vs com tendência ${mR(gt) >= 0 ? "+" : ""}${mR(gt).toFixed(2)}R (n=${gt.length}) → ${Math.abs(dif) < 0.3 ? "sem diferença clara: o filtro não mudaria muito" : dif > 0 ? "lateral rende pior: a favor de LATERAL_MODO=bloqueia" : "lateral NÃO rende pior: bloquear tiraria entradas boas"}\n`;
      } else msg += `🧱 Leitura: amostra pequena (lateral n=${gl.length} · tendência n=${gt.length}); espere ao menos 20 de cada pra comparar.\n`;
      msg += `\n`;
    }
  }
  const durH = (x: Res) => (x.a.barras * TF_MIN) / 60;
  const mot = (m: string) => res.filter((x) => x.a.motivo === m).length;
  msg += `⏳ Duração mediana (A): ${_med(res.map(durH)).toFixed(1)}h · maior ${Math.max(...res.map(durH)).toFixed(1)}h\nSaídas (A): ${mot("cruzou")} no cruzamento · ${mot("stop")} no stop · ${mot("aberto")} abertas\n\n`;
  if (viradas.length) {
    const fm = (ms: number) => { const iso = new Date(ms + X_TZ_OFFSET_H * 3600000).toISOString(); return `${iso.slice(8, 10)}/${iso.slice(5, 7)} ${iso.slice(11, 16)}`; };
    const somaV = viradas.reduce((t, v) => t + v.r, 0), semA = viradas.filter((v) => v.semAlerta).length;
    msg += `🔁 <b>Viradas</b> (${viradas.length}, ${semA} sem alerta) · R somado das pernas novas ${somaV >= 0 ? "+" : ""}${somaV.toFixed(1)}R\n`;
    msg += [...viradas].sort((x, y) => Math.abs(y.r) - Math.abs(x.r)).slice(0, 5).map((v) => `${String(v.inst).replace("-USDT", "")} ${v.de === "long" ? "L" : "S"}→${v.para === "long" ? "L" : "S"} ${fm(v.emMs)} ${v.r >= 0 ? "+" : ""}${v.r.toFixed(1)}R${v.semAlerta ? " 🔕" : ""}`).join("\n") + `\n<i>🔕 = o robô viraria, mas não saiu alerta (5 maiores pelo |R| da perna nova; sem trailing)</i>\n\n`;
  }
  const ord = [...res].sort((x, y) => y.a.r - x.a.r);
  const fmtI = (x: Res) => `${String(x.r.instid).replace("-USDT", "")} ${x.r.lado === "long" ? "L" : "S"} ${x.a.r >= 0 ? "+" : ""}${x.a.r.toFixed(1)}R em ${durH(x) >= 48 ? (durH(x) / 24).toFixed(1) + "d" : durH(x).toFixed(1) + "h"}`;
  msg += `🏆 <b>Melhores (A)</b>\n${ord.slice(0, 5).map(fmtI).join("\n")}\n\n`;
  if (truncou600) msg += `⚠️ <i>Há 600 entradas ou mais no período: só as 600 mais recentes entram. Use menos dias pra ver tudo.</i>\n`;
  if (res.length < 30) msg += `⚠️ <i>Só ${res.length} entradas: se poucos trades sustentam o resultado, ele é frágil. Compare "R médio" com "sem os 3 melhores".</i>\n`;
  msg += `<i>A/B = só a 1ª perna. C/D = virada encadeada: sai no cruzamento → entra na contrária no mesmo fechamento; sai no stop → espera o próximo cruzamento (robô "vira sozinho" depois de ligado, com ou sem alerta).</i>\n`;
  msg += `<i>Uso: /saida 7 (até ${maxDias} dias, limitado pelas ${SAIDA_CANDLES} velas de 15m) · /saida 9 mov15 (só |24h| ≥ 15%, mantém o ADX do filtro) · /saida 9 tudo mov15 (só o corte de movimento) · /saida 9 tudo comp (só um tipo de alerta: comp, oport, rev, fundo, topo) · 📏 = faixas de movimento no dia</i>`;
  for (const parte of dividirHtml(msg)) await sendTelegram(chatId, parte); // V74: em partes, sem cortar o fim
  // V74: trailing do motor numa mensagem à parte (a principal já enche a tela do Telegram)
  {
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
    let m2 = `🤖 <b>TRAILING DO MOTOR</b> — ${opc?.moeda ? `${opc.moeda} · ` : ""}últimos ${dd} dia(s)\n${DIVISOR}\n${filtroTxt}<i>% de preço por entrada, taxa ${TAXA_IDA_VOLTA_PCT}%/perna já descontada. Regra copiada do motor: arma na trava, fecha no callback do pico; também sai no cruzamento contrário.</i>\n\n`;
    for (const v of varsMot) {
      const a = motor[v.id];
      if (!a.primeira.length) continue;
      const mo = (k: string) => a.mot[k] || 0;
      m2 += `<b>${v.nome}</b> (n=${a.primeira.length})\n1ª perna: ${statsR(a.primeira, "%")}\nCadeia: ${statsR(a.cadeia, "%")} · ${avg(a.pernas).toFixed(1)} perna(s)/entrada\nSaídas (1ª perna): ${mo("trail")} trailing · ${mo("stop")} SL · ${mo("cruzou")} cruzamento · ${mo("aberto")} abertas\n${a.primeira.length < 30 ? "⚠️ <i>poucas entradas (n&lt;30): resultado frágil, não decida por isto</i>\n" : ""}\n`;
    }
    if (notaF) m2 += `⚠️ <i>${notaF}</i>\n`;
    m2 += `<i>Vela a vela: o stop usa o pico das velas anteriores (pior caso) e na vela em que arma não conta saída (aproximação). SL e trailing em % de preço (alavancagem 1). Poucas entradas = resultado frágil: compare "médio" com "sem os 3 melhores".</i>\n`;
    m2 += `<i>Uso: /saida (padrão) · /saida 9 (dias) · /saida QNT (moeda) · /saida 5/3.5 ou 5/3.5/3 (trava/callback e SL) · /saida tudo (sem filtro). Ex.: /saida 9 QNT 5/3.5</i>`;
    for (const parte of dividirHtml(m2)) await sendTelegram(chatId, parte);
  }
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
// ─────────────────────────────────────────────────────────────
// /analise reorganizada: cabeçalho + "quem está de FORA" + "quem já está DENTRO"
// ─────────────────────────────────────────────────────────────
const subTitulo = (t: string) => `\n<b>${t}</b>\n`;

// motivos agrupados: a favor (maior peso primeiro) → contra → neutros numa linha só
function motivosTxt(motivos: Motivo[]): string {
  const pos = motivos.filter((m) => m.pts > 0).sort((a, b) => b.pts - a.pts);
  const neg = motivos.filter((m) => m.pts < 0).sort((a, b) => a.pts - b.pts);
  const neu = motivos.filter((m) => m.pts === 0);
  let t = "";
  for (const m of pos) t += `✅ ${m.txt} (+${m.pts})\n`;
  for (const m of neg) t += `⚠️ ${m.txt} (${m.pts})\n`;
  if (neu.length) t += `➖ ${neu.map((m) => m.txt).join(" · ")}\n`;
  return t;
}

type CtxDentro = {
  lado: "long" | "short"; info: IndicadorInfo; preco: number; adx: number; adxDif: number; rsi: number; atr: number;
  fo: FoInfo | null; lado1h: "long" | "short" | null; entradaRobo: number | null; trocas: number; btcAdx: number | null;
};
// O robô só vira quando uma vela FECHADA passa da linha oposta; dentro da faixa ele mantém a posição que já tem.
function viraQuandoTxt(ladoPos: "long" | "short", info: IndicadorInfo, preco: number, atr: number): string {
  const longP = ladoPos === "long";
  const linhaOpos = longP ? info.fundo : info.topo;
  const dist = preco > 0 ? (Math.abs(preco - linhaOpos) / preco) * 100 : 0;
  const emAtr = atr > 0 ? ` ≈ ${(Math.abs(preco - linhaOpos) / atr).toFixed(1)}×ATR` : "";
  return `🔄 <b>Vira pra ${longP ? "SHORT" : "LONG"}</b> se uma vela 15m FECHAR ${longP ? "abaixo" : "acima"} de ${fmtPrice(linhaOpos)} (faltam ${dist.toFixed(2)}%${emAtr}). Dentro da faixa segue ${longP ? "LONG" : "SHORT"}.\n`;
}
// mercado lateral: a virada falha mais (serrote). Mostra o que já está acontecendo agora.
function pausarTxt(adx: number, trocas: number, btcAdx: number | null): string {
  const agora: string[] = [];
  if (adx < FILTRO_ADX_MIN) agora.push(`ADX ${adx.toFixed(0)} abaixo do mínimo`);
  if (trocas >= SERROTE_AVISO) agora.push(`vai e vem (${trocas} trocas em 4h)`);
  if (btcAdx !== null && btcAdx < X_ADX_FRACO) agora.push(`BTC lateral (ADX ${btcAdx.toFixed(0)})`);
  let t = `\n⏸ <b>Considere desligar o robô se o mercado ficar lateral</b> <i>(a virada falha mais)</i>\n`;
  t += `• ADX &lt; ${FILTRO_ADX_MIN} · vai e vem (${SERROTE_AVISO}+ trocas em 4h, contando entrar/sair da faixa) · BTC lateral (ADX &lt; ${X_ADX_FRACO})\n`;
  if (agora.length) t += `⚠️ já acontece agora: ${agora.join(" · ")}\n`;
  return t;
}
// Guia para quem JÁ está na operação com o robô ligado (sem saber a entrada exata).
function guiaDentro(x: CtxDentro): string {
  const { lado, info, preco, adx, adxDif, rsi, atr, fo, lado1h, entradaRobo, trocas, btcAdx } = x;
  const longP = lado === "long";
  const nome = longP ? "LONG" : "SHORT";
  const oposto = longP ? "SHORT" : "LONG";
  const confirmado = ladoAtual(info) === lado;
  if (!confirmado) {
    return `🟡 <b>Dentro da faixa: o robô mantém a posição que já tem</b>\nSem sinal novo. Vira LONG se uma vela 15m fechar acima de ${fmtPrice(info.topo)} e vira SHORT se fechar abaixo de ${fmtPrice(info.fundo)}.\n` + pausarTxt(adx, trocas, btcAdx);
  }
  const limRsi = longP ? ESTICADO_RSI : 100 - ESTICADO_RSI;
  const esticado = longP ? rsi >= limRsi : rsi <= limRsi;
  const fraco = adx < FILTRO_ADX_MIN;
  const perdendo = !fraco && adxDif <= -3;
  const forte = adx >= ADX_REF;
  const forca = `ADX ${adx.toFixed(0)} ${adxDif > 0.5 ? "↗" : adxDif < -0.5 ? "↘" : "→"}, RSI ${rsi.toFixed(0)}`;

  let emoji: string, titulo: string, dica: string;
  if (esticado) {
    emoji = "🟠"; titulo = "A favor, mas esticado";
    dica = `${forca}. Risco de correção: realize uma parte e proteja o resto com stop.`;
  } else if (fraco) {
    emoji = "🟠"; titulo = "A favor, mas sem força";
    dica = `${forca} (mínimo do filtro: ${FILTRO_ADX_MIN}). Os filtros não abririam essa entrada agora: realize boa parte se estiver no lucro, ou aperte o stop.`;
  } else if (perdendo) {
    emoji = "🟡"; titulo = "A favor, mas perdendo força";
    dica = `${forca}. Momentum esfriando: bom momento para realizar parte ou subir o stop.`;
  } else if (forte) {
    emoji = "🟢"; titulo = "Dentro do movimento, pode manter";
    dica = `${forca}. Tendência forte a favor: deixe correr, com o stop protegendo.`;
  } else {
    emoji = "🟢"; titulo = "A favor, força moderada";
    dica = `${forca}. Mantenha com o stop de proteção; se o ADX cair abaixo de ${FILTRO_ADX_MIN}, realize.`;
  }

  let t = `${emoji} <b>${titulo}</b>\n${dica}\n`;
  if (lado1h !== null && lado1h !== lado) t += `⚠️ 1H está CONTRA (${lado1h === "long" ? "acima" : "abaixo"} da faixa): aperte o stop.\n`;
  if (fo && fo.funding !== null && (longP ? fo.funding > FUNDING_ALTO_PCT : fo.funding < -FUNDING_ALTO_PCT)) {
    t += `⚠️ Funding ${sgn(fo.funding, 3)}%: multidão esticada do mesmo lado, correção pode ser brusca. Realize parte mais cedo.\n`;
  }

  t += `\n` + viraQuandoTxt(lado, info, preco, atr);

  t += `\n🛡️ <b>Proteger (manual)</b>\n`;
  const sa = calcStopAlvo(lado, preco, info.topo, info.fundo, atr);
  if (sa) t += `• stop de segurança na corretora: ${fmtPrice(sa.stop)} (faixa ${longP ? "−" : "+"} ${STOP_ATR_MULT}×ATR). O robô só reage no fechamento da vela; o stop cobre pavio e queda rápida\n`;
  if (atr > 0 && TRAIL_ATR_MULT > 0 && preco > 0) {
    const R = atr * TRAIL_ATR_MULT;
    t += `• trailing: a cada ${Number(R.toPrecision(3))} (~${((R / preco) * 100).toFixed(2)}%) a favor da sua entrada, suba o stop 1 degrau (1º degrau = stop na entrada, zero a zero)\n`;
  }

  t += `\n💰 <b>Realizar parte se</b>\n`;
  t += `• RSI ${longP ? "≥" : "≤"} ${limRsi} (hoje ${rsi.toFixed(0)}) · ADX caindo forte (−3 ou mais em ~1h) · volume das velas secando\n`;

  t += pausarTxt(adx, trocas, btcAdx);

  if (entradaRobo !== null && entradaRobo > 0) {
    const ganho = ((longP ? preco - entradaRobo : entradaRobo - preco) / entradaRobo) * 100;
    const saR = calcStopAlvo(lado, entradaRobo, info.topo, info.fundo, atr);
    const tr = calcTrailing({ instId: info.instId, lado, entrada: entradaRobo, mark: preco, pnl: 0, pnlPct: 0, lev: 0, liq: 0 }, atr);
    t += `\n📍 <b>Entrada do robô no cruzamento</b> (${fmtPrice(entradaRobo)}): ${sgn(ganho)}% agora`;
    if (saR) t += ` · stop ${fmtPrice(saR.stop)} · alvo ${fmtPrice(saR.alvo)} (RR ${ALVO_RR}:1)`;
    t += `\n`;
    if (tr) t += `🔒 Trailing: ${tr.n === 1 ? `suba o stop para a entrada (${fmtPrice(tr.stop)})` : `suba o stop para ${fmtPrice(tr.stop)} (trava +${tr.travaPct.toFixed(2)}%)`}\n`;
  }

  t += `\n↔️ <i>Se sua posição está ${oposto} apesar do sinal ${nome}: o robô vira no fechamento da vela. Confira se ele virou e se está ligado.</i>\n`;
  return t;
}

// "Ligar o robô?": mesmas regras dos alertas 🕒 PREPARE e 🚨 LIGUE AGORA (o robô entra no FECHAMENTO da vela que cruzou)
function ligarRoboTxt(x: { info: IndicadorInfo; lado: "long" | "short"; vivo: number | null; apChega: Aprox | null; conf: number; entradaRobo: number | null }): string {
  const { info, lado, vivo, apChega, conf, entradaRobo } = x;
  const nome = (l: "long" | "short") => (l === "long" ? "LONG" : "SHORT");
  let t = "";
  if (info.idadeCandles !== null) {
    t += `⌛ <b>Já cruzou</b> pra ${nome(lado)} há ~${info.idadeCandles * TF_MIN} min: a entrada do robô foi no fechamento daquela vela${entradaRobo ? ` (≈${fmtPrice(entradaRobo)})` : ""}. Já não é caso de ligar antes do cruzamento.\n`;
    if (conf >= CONF_AMARELO && info.idadeCandles <= ANTEC_LIGUE_ETA_CANDLES) {
      t += `💡 Perdeu a entrada? Sinal bom, entre pelo manual se estiver muito próximo do indicador.\n`;
    }
  } else if (apChega) {
    const dViva = vivo !== null ? distLinha(apChega.alvo, vivo, info.topo, info.fundo) : apChega.dist;
    const eta = dViva <= 0 ? 0 : (apChega.vel > 0 ? dViva / apChega.vel : apChega.etaCandles);
    const min = Math.max(1, Math.round(eta * TF_MIN));
    if (dViva <= 0) t += `🚨 <b>LIGUE AGORA</b> — o preço já está ${apChega.alvo === "long" ? "acima" : "abaixo"} da linha de ${nome(apChega.alvo)}; a vela fecha em ~${finalRestMin()} min e o robô entra no fechamento.\n`;
    else if (eta <= ANTEC_LIGUE_ETA_CANDLES) t += `🚨 <b>LIGUE AGORA</b> — chega na linha de ${nome(apChega.alvo)} em ~${min} min (${dViva.toFixed(2)}% de distância): dá tempo de ligar.\n`;
    else t += `🕒 <b>PREPARE</b> — ainda não ligue: a ${dViva.toFixed(2)}% da linha de ${nome(apChega.alvo)}, chegando em ~${min} min.\n`;
  } else {
    const d = distLinha(lado, vivo ?? info.preco, info.topo, info.fundo);
    if (d <= 0) t += `🚨 <b>LIGUE AGORA</b> — o preço já está ${lado === "long" ? "acima" : "abaixo"} da linha de ${nome(lado)}; a vela fecha em ~${finalRestMin()} min e o robô entra no fechamento.\n`;
    else t += `⏳ <b>Ainda não</b> — a ${d.toFixed(2)}% da linha de ${nome(lado)}, sem aproximação consistente.\n`;
  }
  t += `🧭 Qualidade do sinal: ${confEmoji(conf)} <b>${conf}/10</b>${conf < CONF_AMARELO ? " — confiança baixa: o cruzamento pode falhar, considere esperar" : ""}\n`;
  return t;
}

// posição REAL na BloFin (quando houver): reaproveita a sugestão que o robô já usa nos alertas
async function posicaoRealTxt(chatId: number | string, ps: Pos[], inf: any, alvo?: "long" | "short"): Promise<string> {
  const SB = getSupabase();
  let t = "";
  for (const p of ps) {
    const s = await sugestaoPosicaoComSeta(SB, chatId, p, inf, alvo);
    t += `📌 <b>Você está ${p.lado === "long" ? "LONG" : "SHORT"}</b> — entrada ${fmtPrice(p.entrada)}${p.lev ? ` | ${p.lev}x` : ""}\n${p.pnl >= 0 ? "➕" : "➖"} PnL ${sgn(p.pnl)} USDT (${sgn(p.pnlPct, 1)}% da margem)\n${s.emoji} <b>${s.titulo}</b>\n${s.seta ? `Movimento: ${s.seta}\n` : ""}${s.dica}\n`;
    t += trailingTxt(p, typeof inf.atr === "number" ? inf.atr : 0) || stopAlvoPosTxt(p, inf);
    const atual = ladoAtual(inf as IndicadorInfo);
    if (atual !== null && atual !== p.lado) t += `🔄 A vela já fechou do lado ${atual === "long" ? "LONG" : "SHORT"}. <i>O robô vira no fechamento. Se sua posição continua ${p.lado === "long" ? "LONG" : "SHORT"}, confira se ele virou e se está ligado.</i>\n`;
    else t += viraQuandoTxt(p.lado, inf as IndicadorInfo, p.mark > 0 ? p.mark : (inf as IndicadorInfo).preco, typeof inf.atr === "number" ? inf.atr : 0);
    t += `\n`;
  }
  return t;
}

// cabe em 1 mensagem? manda junto; senão separa nas seções (limite do Telegram ≈ 4096)
async function enviarPartes(chatId: number | string, partes: string[]) {
  const LIM = 3900;
  let atual = "";
  for (const p of partes) {
    if (atual && (atual + p).length > LIM) { await sendTelegram(chatId, cortar(atual)); atual = p.replace(/^\n+/, ""); }
    else atual += p;
  }
  if (atual) await sendTelegram(chatId, cortar(atual));
}

// V54: /agora e /comparar pontuavam sem vários ingredientes que o /analise e os alertas usam (tendência do funding, confiabilidade
// histórica da moeda, ETH, desequilíbrio do book, perfil de horário → "janela forte"), então a MESMA moeda mostrava confiança
// diferente em cada comando (e o /comparar ainda passava h1: null, perdendo os ±2 do 1H). Aqui fica o pacote que faltava, na mesma
// forma que calcConfiancaAlerta() monta pros alertas — os campos têm o nome exato de CtxPontos pra entrarem com "...ex".
async function extrasConfianca(instId: string, fo: { funding: number | null; oiChg: number | null } | null, apChega: Aprox | null) {
  const [perfil, ethReg, ethV, bookImb, confiabInst, fundingTend] = await Promise.all([
    xPerfilHoras().catch(() => null), xRegimeCacheEth().catch(() => null), ethVar1h().catch(() => null), getBookImbalance(instId).catch(() => null),
    confiabilidadeMoeda(instId).catch(() => null), fundingTendencia(instId, fo ?? { funding: null, oiChg: null }),
  ]);
  return {
    perfil, chegadaForte: chegadaEmJanelaForte(apChega, perfil), fundingTend, confiabInst,
    ethAdx: ethReg ? ethReg.adx : null, ethVar: ethV, bookImb,
  };
}
// /comparar MOEDA1 MOEDA2 — calcula o mesmo retrato do /agora pras duas moedas (indicador, ADX, RSI,
// distância até a linha, confiança) e mostra lado a lado, com o veredito de qual tem a confiança mais alta
// agora. Cada lado usa o lado (LONG/SHORT) que o robô abriria PRA AQUELA moeda especificamente — não é uma
// comparação crua de ADX ou variação, é "qual sinal está mais forte pro lado que faz sentido pra cada uma".
type SnapComparar = { instId: string; info: IndicadorInfo; lado: "long" | "short"; atual: "long" | "short" | null; conf: number; total: number; pct: number; vivo: number; adx: number; adxAntes: number; rsi: number };
type SnapComparaErro = { erro: string };
async function snapshotComparar(
  entrada: string,
  variacoes: VarInfo[],
  btc: Awaited<ReturnType<typeof xRegime>>,
  btcV: number | null,
): Promise<SnapComparar | SnapComparaErro> {
  const instId = await resolverPar(entrada);
  if (!instId) return { erro: `Não achei a moeda "${entrada.replace(/[<>&]/g, "").slice(0, 20)}" na lista de futuros.` };
  const [d15, vivo] = await Promise.all([xCandles(instId, TIMEFRAME, CANDLES_LIMIT_PRECISO), precoAoVivo(instId)]);
  if (!d15 || d15.c.length < 100 || vivo === null) return { erro: `Sem dados de velas para ${instId} agora.` };
  const info = calcIndicadorDeCloses(instId, d15.c);
  if (!info) return { erro: `Não consegui calcular o indicador de ${instId}.` };
  const atual = ladoAtual(info);
  const dTopo = distLinha("long", vivo, info.topo, info.fundo);
  const dFundo = distLinha("short", vivo, info.topo, info.fundo);
  const lado: "long" | "short" = atual ?? (dTopo <= dFundo ? "long" : "short");
  const adxS = xAdxSerie(d15.h, d15.l, d15.c, 14);
  const adx = adxS.length ? adxS[adxS.length - 1] : 0;
  const adxAntes = adxS.length > 5 ? adxS[adxS.length - 5] : adx;
  const rsi = calcRSI(d15.c, 14);
  const atr = calcATR(d15.h, d15.l, d15.c, 14);
  const trocas = contarTrocas(d15.c);
  const volRatio = volAcel(d15.v);
  const v = variacoes.find((x) => x.instId === instId);
  const pct = v ? v.pct : 0;
  const infoAtr = { ...info, atr };
  const apChega = chegandoNaLinha(infoAtr);
  const bottomA = FUNDO_ON ? calcFundoPre(d15, info, atr, adx, adxAntes) : null;
  const topA = TOPO_ON ? calcTopoPre(d15, info, atr, adx, adxAntes) : null;
  const [fo, d1h] = await Promise.all([getFundingOI(instId), xCandles(instId, "1H", 500)]);
  const h1 = d1h ? calcIndicadorDeCloses(instId, d1h.c) : null;
  const ex = await extrasConfianca(instId, fo, apChega);
  const { conf, total } = pontuar({
    info, lado, adx, adxDif: adx - adxAntes, diDom: xDiDominante(d15.h, d15.l, d15.c, 14), rsi, volUsdt: v ? v.volUsdt : null, trocas, h1, ...ex,
    btcAdx: btc ? btc.adx : null, fo, volRatio, apChega,
    tipo: tipoDoLado(lado, pct, devolveuMovimento({ ddPico: ddDoPico(d15.h, info.preco), altaVale: altaDoVale(d15.l, info.preco) }, lado)), pct24: pct, bottom: bottomA, top: topA, btcVar: btcV,
  });
  return { instId, info, lado, atual, conf, total, pct, vivo, adx, adxAntes, rsi };
}
async function runComparar(chatId: number | string, entradaA: string, entradaB: string) {
  const [variacoes, btc, btcV] = await Promise.all([
    getVariacoes24h().catch(() => [] as VarInfo[]),
    xRegime("BTC-USDT").catch(() => null),
    btcVar1h().catch(() => null),
  ]);
  const [a, b] = await Promise.all([
    snapshotComparar(entradaA, variacoes, btc, btcV),
    snapshotComparar(entradaB, variacoes, btc, btcV),
  ]);
  if ("erro" in a) { await sendTelegram(chatId, `⚠️ ${a.erro}`); return; }
  if ("erro" in b) { await sendTelegram(chatId, `⚠️ ${b.erro}`); return; }
  if (a.instId === b.instId) { await sendTelegram(chatId, `⚠️ Escolha duas moedas diferentes. Exemplo: /comparar one sui`); return; }
  const nome = (l: "long" | "short") => (l === "long" ? "LONG" : "SHORT");
  const bloco = (x: SnapComparar) => {
    const s = x.info;
    let t = `<b>${x.instId}</b>\n`;
    t += `${x.atual ? `✅ já cruzou pra ${nome(x.lado)}` : "↔️ dentro da faixa"} · alvo ${nome(x.lado)}\n`;
    t += `🧭 Confiança: ${confEmoji(x.conf)} <b>${x.conf}/10</b>\n`;
    t += `📍 ${indicadorTxt(s)}\n`;
    t += forcaLinha({ adx: x.adx, adxAntes: x.adxAntes, rsi: x.rsi });
    t += `📊 ${x.pct >= 0 ? "+" : ""}${x.pct.toFixed(2)}% em 24h\n`;
    t += `preço ${fmtPrice(x.vivo)} | topo ${fmtPrice(s.topo)} | fundo ${fmtPrice(s.fundo)}\n`;
    return t;
  };
  let msg = `⚖️ <b>Comparar</b> — ${a.instId} × ${b.instId}\n${DIVISOR}\n\n`;
  msg += bloco(a) + `${MINI_DIVISOR}\n` + bloco(b) + `${MINI_DIVISOR}\n`;
  const DESEMPATE_MARGEM_TOTAL = 3; // conf é total arredondado numa escala 0-10 (~4.8 pontos brutos por degrau);
  // diferença de total abaixo disso é considerada empate real mesmo com um total maior que o outro.
  if (a.conf === b.conf && Math.abs(a.total - b.total) < DESEMPATE_MARGEM_TOTAL) {
    msg += `🤝 Empate em confiança (${a.conf}/10) — sinal parecido nas duas agora; olhe a distância até a linha e o ADX acima pra desempatar.`;
  } else if (a.conf === b.conf) {
    const melhor = a.total > b.total ? a : b;
    const pior = a.total > b.total ? b : a;
    msg += `🏆 <b>${melhor.instId}</b> leva por pouco (${a.conf}/10 nas duas, mas ${melhor.total} vs ${pior.total} pontos por trás do arredondamento) pro lado ${nome(melhor.lado)} agora.`;
  } else {
    const melhor = a.conf > b.conf ? a : b;
    const pior = a.conf > b.conf ? b : a;
    msg += `🏆 <b>${melhor.instId}</b> tem a confiança mais alta (${melhor.conf}/10 vs ${pior.conf}/10) pro lado ${nome(melhor.lado)} agora.`;
  }
  await enviarEmPartes(chatId, msg, [...botaoAnalisar(a.instId), ...botaoAnalisar(b.instId)]);
}
async function runAnalise(chatId: number | string, entrada: string, capturar?: (p: string[]) => void) {
  const instId = await resolverPar(entrada);
  if (!instId) { await sendTelegram(chatId, `⚠️ Não achei a moeda "${entrada.replace(/[<>&]/g, "").slice(0, 20)}" na lista de futuros. Exemplo: /analise ONE`); return; }
  const [d15, d1h, vars, perfil, btc, fo, vivo, btcV, posLista] = await Promise.all([
    xCandles(instId, TIMEFRAME, CANDLES_LIMIT_PRECISO),
    xCandles(instId, "1H", 500),
    getVariacoes24h().catch(() => [] as VarInfo[]),
    xPerfilHoras().catch(() => null),
    xRegime("BTC-USDT").catch(() => null),
    getFundingOI(instId),
    precoAoVivo(instId),
    btcVar1h().catch(() => null),
    getPosicoes(chatId).catch(() => null),
  ]);
  if (!d15 || d15.c.length < 100) { await sendTelegram(chatId, `⚠️ Sem dados de velas para ${instId} agora.`); return; }
  const info = calcIndicadorDeCloses(instId, d15.c);
  if (!info) { await sendTelegram(chatId, `⚠️ Não consegui calcular o indicador de ${instId}.`); return; }
  const adxS = xAdxSerie(d15.h, d15.l, d15.c, 14);
  const adx = adxS.length ? adxS[adxS.length - 1] : 0;
  const adxAntes = adxS.length > 5 ? adxS[adxS.length - 5] : adx;
  const adxDif = adx - adxAntes;
  const rsi = calcRSI(d15.c, 14);
  const atr = calcATR(d15.h, d15.l, d15.c, 14);
  const v = (vars as VarInfo[]).find((x) => x.instId === instId);
  const pct = v ? v.pct : null;
  const volUsdt = v ? v.volUsdt : null;
  // V47: mesma correção do /agora — sem o atr anexado ao info, chegandoNaLinha() caía sempre no limiar fixo
  // ANTEC_DIST_MAX_PCT (1%) em vez do limiar relativo ao ATR que o radar automático usa (calcIndicadorFiltro
  // já devolve o atr dentro do info) — moeda volátil perto da linha (ex. 1.05%) não gerava PREPARE aqui,
  // mesmo quando geraria no radar, pra exatamente a mesma distância.
  const infoAtr = { ...info, atr };
  const apChega = chegandoNaLinha(infoAtr);
  const lado: "long" | "short" = info.preco > info.topo ? "long" : info.preco < info.fundo ? "short" : apChega ? apChega.alvo : (info.regiao.includes("topo") ? "long" : "short");
  const ddPicoA = ddDoPico(d15.h, info.preco);
  const altaValeA = altaDoVale(d15.l, info.preco);
  const topA = TOPO_ON ? calcTopoPre(d15, info, atr, adx, adxAntes) : null;
  // V48: segunda instância do mesmo bug do V47, dentro da mesma função — este objeto espalhava `info` (sem atr)
  // em vez de `infoAtr`, então o chegandoNaLinha() chamado por DENTRO do classificar() (pra decidir "🎯 CHEGANDO")
  // caía no limiar fixo de 1% de novo, mesmo já corrigido o cálculo de apChega/lado acima.
  const setup = pct !== null ? classificar({ ...infoAtr, ddPico: ddPicoA, altaVale: altaValeA, top: topA, bottom: FUNDO_ON ? calcFundoPre(d15, info, atr, adx, adxAntes) : null } as InfoFiltravel, pct) : null;
  const h1 = d1h ? calcIndicadorDeCloses(instId, d1h.c) : null;
  const lado1h = h1 ? ladoAtual(h1) : null;
  const trocas = contarTrocas(d15.c);
  const largura = ((info.topo - info.fundo) / info.preco) * 100;
  const volRatio = volAcel(d15.v);
  const chegadaForte = chegadaEmJanelaForte(apChega, perfil);
  const bottomA = FUNDO_ON ? calcFundoPre(d15, info, atr, adx, adxAntes) : null;
  const [fundingTendA, confiabInstA, ethRegA, ethVA, bookImbA] = await Promise.all([
    fundingTendencia(instId, fo ?? { funding: null, oiChg: null }), confiabilidadeMoeda(instId), xRegimeCacheEth(), ethVar1h(), getBookImbalance(instId),
  ]);
  const { motivos, total, veredito, conf } = pontuar({
    info, lado, adx, adxDif, diDom: xDiDominante(d15.h, d15.l, d15.c, 14), rsi, volUsdt, trocas, h1, btcAdx: btc ? btc.adx : null, perfil, fo, volRatio, chegadaForte, apChega, tipo: setup?.tipo ?? null, pct24: pct, bottom: bottomA, top: topA, btcVar: btcV,
    fundingTend: fundingTendA, confiabInst: confiabInstA, ethAdx: ethRegA ? ethRegA.adx : null, ethVar: ethVA, bookImb: bookImbA,
  });
  let invalida: string;
  const nTopo = fmtPrice(info.topo), nFundo = fmtPrice(info.fundo);
  if (lado === "long") {
    invalida = info.preco > info.topo
      ? `se uma vela 15m fechar de volta abaixo de ${nTopo}, o sinal enfraquece (o robô segue LONG); ele só vira pra SHORT se fechar abaixo de ${nFundo}.`
      : `ainda não confirmou: precisa fechar 15m acima de ${nTopo}; se fechar abaixo de ${nFundo}, o robô vai pra SHORT.`;
  } else {
    invalida = info.preco < info.fundo
      ? `se uma vela 15m fechar de volta acima de ${nFundo}, o sinal enfraquece (o robô segue SHORT); ele só vira pra LONG se fechar acima de ${nTopo}.`
      : `ainda não confirmou: precisa fechar 15m abaixo de ${nFundo}; se fechar acima de ${nTopo}, o robô vai pra LONG.`;
  }
  const preco = vivo ?? info.preco;
  const SBseta = getSupabase();
  const seta = SBseta ? await setaGeral(SBseta, chatId, instId, conf, lado) : "";
  const divBtc = await divBtcLinha(SBseta, lado); // V74: contexto do BTC (divergência de RSI), só leitura

  // ── 1) CABEÇALHO: veredito e números-chave ──
  let cab = `🔎 <b>ANÁLISE — ${instId}</b>\n${DIVISOR}\n\n`;
  cab += `${veredito} (${total >= 0 ? "+" : ""}${total} pts)\nConfiança: <b>${conf}/10</b> ${confEmoji(conf)}${seta ? `\nMovimento: ${seta}` : ""}\nRobô abriria: <b>${lado === "long" ? "LONG (compra)" : "SHORT (venda)"}</b>\n${placarFiltros(motivos)}\n`;
  cab += `💰 <b>${fmtPrice(preco)}</b>${vivo !== null ? " agora" : ""}${pct !== null ? ` · ${pct >= 0 ? "📈 +" : "📉 "}${pct.toFixed(2)}% (24h)` : ""}${volUsdt !== null ? ` · vol ${(volUsdt / 1e6).toFixed(2)}M` : ""}\n`;
  { const refP = vivo ?? preco; const distInd = refP ? Math.min(Math.abs(refP - info.topo), Math.abs(refP - info.fundo)) / refP * 100 : null; cab += `⏱ vela fecha em ~${finalRestMin()} min${distInd !== null ? ` · 📏 ${distInd.toFixed(2)}% do Indicador` : ""}\n`; }
  if (divBtc) cab += `\n${divBtc}`;

  // ── 2) QUEM ESTÁ DE FORA ──
  const idadeC = info.idadeCandles;
  const entradaRobo = idadeC !== null && idadeC <= ANALISE_MUITO_TARDE_CANDLES && idadeC < d15.c.length ? d15.c[d15.c.length - 1 - idadeC] : null;
  let fora = `\n${DIVISOR}\n🚪 <b>PARA QUEM ESTÁ DE FORA</b>\n<i>robô desligado: vale ligar agora?</i>\n`;
  fora += subTitulo("🔌 Ligar o robô?") + ligarRoboTxt({ info, lado, vivo, apChega, conf, entradaRobo });
  fora += subTitulo("🧮 Por quê") + motivosTxt(motivos);
  let radarMostrado = false; // V59: pra saber se o meio-termo "esticou mas nenhum radar de reversão acendeu" precisa do aviso ⚠️
  const quedaA = pct !== null ? quedaEfetiva(pct, Math.max(v ? v.dd : 0, ddPicoA)) : ddPicoA;
  if (bottomA && quedaA >= FUNDO_QUEDA_MIN && ladoAtual(info) !== "long") {
    radarMostrado = true;
    const finA = await fundoFinal(bottomA, instId, fo, info.inclinaRel);
    fora += `\n🟢 <b>Radar de fundo</b> (${pct !== null ? quedaTxt(pct, quedaA) : `recuou ${quedaA.toFixed(1)}% desde a máxima recente`})\n${fundoTxt(finA)}\n`;
  }
  const altaA = pct !== null ? altaEfetiva(pct, Math.max(v ? v.up : 0, altaValeA)) : altaValeA;
  if (topA && altaA >= TOPO_ALTA_MIN && ladoAtual(info) !== "short") {
    radarMostrado = true;
    const finT = await topoFinal(topA, instId, fo, info.inclinaRel);
    fora += `\n🔴 <b>Radar de topo</b> (${pct !== null ? altaTxt(pct, altaA) : `subiu ${altaA.toFixed(1)}% desde a mínima recente`})\n${topoTxt(finT)}\n`;
  }
  // V59: meio-termo — o preço já está fora da faixa, esticado (≥ 3× ATR) a favor do lado do robô, e nenhum radar de reversão acendeu:
  // não é reversão, e entrar agora seria continuação tardia. Antes esse "esticada" ficava só dentro da pontuação.
  if (!radarMostrado && ladoAtual(info) === lado && atr > 0) {
    const dEst = lado === "long" ? (info.preco - info.topo) / atr : (info.fundo - info.preco) / atr;
    if (dEst >= 3) {
      fora += `\n⚠️ <b>Já esticou</b> ${dEst.toFixed(1)}× ATR além da faixa${dEst >= 5 ? " (muito esticada)" : ""} e nenhum radar de reversão acendeu: <i>não é reversão nem continuação segura — ligar agora é entrada tardia.</i>\n`;
    }
  }
  fora += subTitulo("📍 Onde está");
  fora += `${indicadorTxt(info)}\n${idadeTxt(info.idadeCandles)}\nfech. 15m ${fmtPrice(info.preco)} | topo ${nTopo} | fundo ${nFundo}\n`;
  fora += `📏 faixa ${largura.toFixed(2)}% de largura${info.larguraRel !== undefined ? ` (${Math.round(info.larguraRel * 100)}% da típica${info.larguraRel <= SQUEEZE_REL ? " — comprimida" : ""})` : ""}\n`;
  if (info.inclinaRel !== undefined) fora += `📐 inclinação da faixa: ${inclinaTxt(info)}\n`;
  if (info.aprox && info.idadeCandles === null) fora += `🎯 aproximação: ${info.aprox.vel.toFixed(2)}%/vela rumo à linha de ${info.aprox.alvo === "long" ? "LONG" : "SHORT"} (~${Math.max(1, Math.round(info.aprox.etaCandles * TF_MIN))} min)\n`;
  fora += subTitulo("💪 Força");
  fora += `ADX ${adx.toFixed(1)} ${adxDif > 0.5 ? "↗" : adxDif < -0.5 ? "↘" : "→"} | RSI ${rsi.toFixed(0)}\n`;
  if (volRatio !== null) fora += `📊 volume das velas: ${volRatio.toFixed(1)}× a média${volRatio >= VOL_ACEL_RATIO ? " ↗ acelerando" : volRatio <= VOL_SECO_RATIO ? " ↘ secando" : ""}\n`;
  if (h1) fora += `⏱ 1H: ${lado1h === null ? "dentro da faixa" : lado1h === "long" ? "acima da faixa" : "abaixo da faixa"} (${h1.distAbs.toFixed(2)}%)\n`;
  const foTxt = fundingOiTxt(fo);
  if (foTxt) fora += `💸 ${foTxt}\n`;
  fora += subTitulo("🎯 Se for entrar");
  fora += stopAlvoTxt(lado, preco, info.topo, info.fundo, atr, vivo !== null).replace(/^🎯 /, "");
  fora += `❌ <b>Invalidaria:</b> <i>${invalida}</i>\n`;
  fora += `${setup ? `🤖 Bot classificaria: ${setup.tipo === "oportunidade" ? "🚀 OPORTUNIDADE" : "🔄 REVERSÃO"}` : `🤖 Bot: não geraria alerta agora <i>(movimento de 24h fraco ou longe da linha)</i>`}\n`;
  fora += `⏰ ${xTxtJanela(perfil)}${btc ? ` | BTC ADX ${btc.adx.toFixed(1)}` : ""}\n`;

  // ── 3) QUEM JÁ ESTÁ DENTRO ──
  const minhas = posDaMoeda(posLista, instId);
  let dentro = `\n${DIVISOR}\n`;
  const confirmadoDentro = ladoAtual(info) === lado;
  if (minhas.length) { // posição real: o próprio "📌 Você está…" já é o título da seção
    dentro += await posicaoRealTxt(chatId, minhas, { ...info, adx, rsi, adxAntes, atr }, apChega ? apChega.alvo : undefined);
  } else {
    dentro += `📌 <b>PARA QUEM JÁ ESTÁ DENTRO</b>\n`;
    dentro += confirmadoDentro
      ? `<i>robô ligado e posicionado ${lado === "long" ? "LONG" : "SHORT"} (sinal atual), sem saber seu preço de entrada</i>\n\n`
      : `<i>robô ligado, preço dentro da faixa (sem sinal novo)</i>\n\n`;
    dentro += guiaDentro({ lado, info, preco, adx, adxDif, rsi, atr, fo, lado1h, entradaRobo, trocas, btcAdx: btc ? btc.adx : null });
  }

  // ── 4) HISTÓRICO + AVISO ──
  let rodape = "";
  try {
    const SB = getSupabase();
    if (SB) {
      const { data } = await SB.from(PLACAR_TABELA).select("*").eq("instid", instId).neq("tipo", REV_SOMBRA_TIPO).neq("tipo", REP_SOMBRA_TIPO).neq("tipo", VOL_SOMBRA_TIPO).order("criado_em", { ascending: false }).limit(3);
      const hist = (data || []) as any[];
      if (hist.length) {
        rodape += `📜 <b>Alertas anteriores</b>\n`;
        for (const r of hist) {
          const horas = ((Date.now() - new Date(r.criado_em).getTime()) / 3600000).toFixed(1);
          const res = PLACAR_HORIZ_EXIBE.map((h) => ({ h, x: retornoLog(r, h) })).filter((o) => o.x !== null).map((o) => `${rotH(o.h)} ${(o.x as number) >= 0 ? "+" : ""}${(o.x as number).toFixed(1)}%`).join(" · ");
          rodape += `• há ${horas}h ${r.lado === "long" ? "LONG" : "SHORT"} ${r.tipo} — ${res || "aguardando resultado"}\n`;
        }
      }
    }
  } catch { }
  rodape += `${rodape ? "\n" : ""}<i>Estatístico, não é recomendação.</i>`;

  if (capturar) { capturar([cab, fora, dentro, rodape]); return; }
  await enviarPartes(chatId, [cab, fora, dentro, rodape]);
}
type Motivo = { pts: number; txt: string };
type FoInfo = { funding: number | null; oiChg: number | null };
type CtxPontos = {
  info: IndicadorInfo; lado: "long" | "short"; adx: number; adxDif: number; rsi: number; volUsdt: number | null;
  trocas: number; h1: IndicadorInfo | null; btcAdx: number | null; perfil: XPerfil | null; fo: FoInfo | null;
  volRatio: number | null; chegadaForte: boolean; apChega: Aprox | null;
  tipo?: "oportunidade" | "reversao" | null; pct24?: number | null; bottom?: FundoRes | null; top?: FundoRes | null; btcVar?: number | null;
  velSinal?: VelSinal; fundingTend?: FundingTend; confiabInst?: ConfiabInfo | null;
  ethAdx?: number | null; ethVar?: number | null; bookImb?: number | null;
  diDom?: "long" | "short" | null; // V60: lado que domina pelo +DI/−DI (oculto, só pesa na pontuação)
};
// V43: CONFIANCA_TOTAL_MIN/MAX são o piso e o teto reais de `total` em pontuar(), somando TODOS os add()
// possíveis (1H, ADX, RSI, volume, idade do cruzamento, velocidade, chegada em janela forte, squeeze,
// inclinação, distância, trocas, BTC/ETH, perfil de janela, funding×2, OI, histórico da moeda, bônus de
// fundo/topo), respeitando as exclusões mútuas entre blocos (ex.: ADX forte x squeeze-com-ADX-subindo; ou
// idade "cruzamento muito velho" x squeeze, que só dispara com idade nula/fresca). O teto real é +23 (SHORT
// em reversão com funding subindo rápido a favor + sinais de topo com repique + chegada em janela forte;
// CONFIAB_PTS=1, não 2) e o piso é -30 (LONG em reversão com tudo contra, incluindo o bônus de fundo indo a
// -3; sem contar o -1 do squeeze, que não pode coexistir com o -2 de "cruzamento muito velho"). [Auditoria:
// os valores anteriores, -31/+24, foram recalculados — o teto tinha 1 ponto a mais do que CONFIAB_PTS=1
// permite (talvez datando de quando esse peso era 2), e o piso tinha 1 ponto a mais por somar duas condições
// mutuamente exclusivas. Isso nunca disparava o aviso de deriva do V45 abaixo, porque o erro deixava a
// margem mais larga que a real, não mais estreita — nenhum total observado escapava dela.] A fórmula antiga
// assumia -3 a +8 — qualquer sinal decente já estourava e travava em 10/10 (ou em 0/10 do lado ruim),
// achatando a escala bem mais que o caso do FUNDO_PTS_MAX. CONF_MIN_OPORT e CONF_AMARELO subiram de 5 pra 6
// pra continuar exigindo (aproximadamente) os mesmos pontos brutos de antes — a escala de 0-10 ficou ~5x
// mais "grossa" por ponto, então não dá pra preservar o corte exato ponto a ponto; onde não deu pra bater
// exato, o ajuste ficou do lado mais permissivo (nunca mais rígido) pra não atrasar alerta que já disparava.
// CONF_MIN_FUNDO_LONG e CONF_MIN_REVERSAO ficaram com os mesmos números (6 e 7), mas por causa da escala mais
// larga eles passam a disparar um pouco mais cedo (mais sensível, não menos).
const CONFIANCA_TOTAL_MIN = -30;
const CONFIANCA_TOTAL_MAX = 23;
const confiancaDe = (total: number) =>
  Math.max(0, Math.min(10, Math.round(((total - CONFIANCA_TOTAL_MIN) * 10) / (CONFIANCA_TOTAL_MAX - CONFIANCA_TOTAL_MIN))));
// V45: autoconferência da escala — CONFIANCA_TOTAL_MIN/MAX acima foram calculados na mão somando o pior/melhor
// caso de todos os add() de pontuar(); se algum dia um peso mudar (ex.: funding de -2 pra -3) sem recalcular
// esses dois números, a escala 0-10 desalinha em silêncio (satura em 0 ou 10 igual ao bug que o V43 corrigiu).
// Só loga quando o total observado bate um recorde fora da faixa assumida — 1x por recorde, sem spam.
let _confExtremoMin = CONFIANCA_TOTAL_MIN, _confExtremoMax = CONFIANCA_TOTAL_MAX;
function checarDerivaConfianca(total: number) {
  if (total < CONFIANCA_TOTAL_MIN && total < _confExtremoMin) {
    _confExtremoMin = total;
    const msg = `⚠️ pontuar(): total ${total} abaixo do piso assumido (CONFIANCA_TOTAL_MIN=${CONFIANCA_TOTAL_MIN}) — recalcule as constantes (comentário V43 acima de CONFIANCA_TOTAL_MIN/MAX)`;
    console.log(msg);
    avisarAdmin(msg);
  } else if (total > CONFIANCA_TOTAL_MAX && total > _confExtremoMax) {
    _confExtremoMax = total;
    const msg = `⚠️ pontuar(): total ${total} acima do teto assumido (CONFIANCA_TOTAL_MAX=${CONFIANCA_TOTAL_MAX}) — recalcule as constantes (comentário V43 acima de CONFIANCA_TOTAL_MIN/MAX)`;
    console.log(msg);
    avisarAdmin(msg);
  }
}
const confEmoji = (n: number) => (n >= CONF_VERDE ? "🟢" : n >= CONF_AMARELO ? "🟡" : "🔴");
// V53: seta 🟢→🟡 / 🔴→🟡 etc. mostrando se a confiança melhorou ou piorou desde a última leitura da mesma
// moeda — antes /analise, /agora e os alertas automáticos eram uma "foto" isolada, sem noção de "piorou desde
// a última vez que olhei essa moeda". Guarda a cor (🟢/🟡/🔴) da última leitura reaproveitando o campo
// last_status no formato "conf/10" (já escrito nas chaves _FUNDO_/_TOPO_/_COMP_ pro cooldown, mas até aqui
// nunca lido de volta) e mostra a seta só quando a COR muda — dois números diferentes na mesma faixa (ex. 7→8,
// os dois 🟢) não geram seta, pra não virar ruído a cada ponto que oscila.
function parseUltimaConf(status: string | null | undefined): number | null {
  if (!status) return null;
  const m = /^(-?\d+(?:\.\d+)?)\/10$/.exec(String(status).trim());
  return m ? Number(m[1]) : null;
}
function setaTxt(statusAnterior: string | null | undefined, confAtual: number): string {
  const prevConf = parseUltimaConf(statusAnterior);
  if (prevConf === null) return "";
  const corAntes = confEmoji(prevConf), corAgora = confEmoji(confAtual);
  return corAntes === corAgora ? "" : `${corAntes}→${corAgora}`;
}
// Pra /analise e /agora: chave própria (_CONFGER_instId) compartilhada entre os dois comandos — eles pontuam
// separado (lado/contexto podem diferir), mas quem olha pensa em "essa moeda", não "esse comando"; consultar
// no /agora e depois no /analise (ou vice-versa) já conta como "última leitura" pra efeito da seta. Lê a leitura
// anterior, já grava a atual por cima (então cada chamada consome a leitura passada uma vez) e devolve o texto
// pronto pra encaixar do lado da confiança.
// Auditoria (achado #19): a chave era só "_CONFGER_"+instId — global por moeda, não por chat. Com vários
// chats usando o bot (BLOFIN_USERS por chat), se o chat A consultasse BTC-USDT e, minutos depois, o chat B
// consultasse a mesma moeda, a seta do chat B comparava com a leitura do chat A (que ele nunca viu), em vez
// de aparecer sem seta na primeira vez dele. Agora a chave inclui o chatId, então cada chat só compara com a
// própria última leitura daquela moeda.
// Auditoria (achado #20, achada pelo usuário): faltava o lado nessa comparação. /agora calcula o lado por
// distância pura (a linha mais perto) e /analise calcula por velocidade/direção (apChega.alvo, com fallback
// pra região da faixa) — heurísticas diferentes, então a mesma moeda no mesmo instante pode sair com lados
// opostos em cada comando. A confiança do pontuar() não é uma escala universal: é calculada PRO LADO (bônus
// de fundo só pontua LONG, bônus de topo só pontua SHORT etc.), então comparar a confiança de "LONG agora" com
// a de "SHORT de uma leitura anterior" não é "melhorou/piorou" — são duas coisas diferentes, a seta podia sair
// invertida (parecer melhora quando só mudou o lado sendo pontuado). Agora guarda o lado junto e só mostra a
// seta quando os dois lados batem; se mudou o lado, fica em silêncio (mesmo critério de "sem seta" já usado
// pra cor igual, pra não virar ruído/informação enganosa).
function parseUltimaConfLado(status: string | null | undefined): { conf: number; lado: "long" | "short" } | null {
  if (!status) return null;
  const m = /^(-?\d+(?:\.\d+)?)\/10:(long|short)$/.exec(String(status).trim());
  return m ? { conf: Number(m[1]), lado: m[2] as "long" | "short" } : null;
}
async function setaGeral(SB: any, chatId: number | string, instId: string, confAtual: number, lado: "long" | "short"): Promise<string> {
  try {
    const chave = "_CONFGER_" + chatId + "_" + instId;
    const { data } = await SB.from(TAB).select("last_status").eq("instid", chave).maybeSingle();
    const prev = parseUltimaConfLado(data?.last_status);
    const seta = prev && prev.lado === lado ? setaTxt(`${prev.conf}/10`, confAtual) : "";
    await upsertLinha(SB, chave, { last_status: `${confAtual}/10:${lado}` });
    return seta;
  } catch (e) { console.log(`⚠️ setaGeral(${instId}) falhou:`, e); return ""; }
}
// Auditoria (achado #21, pedido do usuário): a seta de confiança (setaGeral) não alcançava quem já tem uma
// posição real aberta — nem em /analise ("PARA QUEM JÁ ESTÁ DENTRO"), nem em /robo, nem nos alertas automáticos
// de posição — que é justamente onde ela mais ajuda: perceber que o ADX/RSI virou (a posição "esfriou") é o
// sinal pra subir o stop, ativar trailing ou realizar parte. sugestaoPosicao já devolve um emoji de estado
// (🟢/🟡/🟠/🔴/🎯); guarda esse emoji por chat+moeda+lado e mostra a seta quando ele muda — mesmo princípio
// da seta de confiança, sem tentar julgar se é "melhora" ou "piora" (o próprio emoji já carrega esse sentido).
async function setaPosicao(SB: any, chatId: number | string, instId: string, lado: "long" | "short", emojiAtual: string): Promise<string> {
  try {
    const chave = "_SETAPOS_" + chatId + "_" + instId + "_" + lado;
    const { data } = await SB.from(TAB).select("last_status").eq("instid", chave).maybeSingle();
    const antes = data?.last_status || null;
    await upsertLinha(SB, chave, { last_status: emojiAtual });
    return antes && antes !== emojiAtual ? `${antes}→${emojiAtual}` : "";
  } catch (e) { console.log(`⚠️ setaPosicao(${instId}) falhou:`, e); return ""; }
}
async function sugestaoPosicaoComSeta(SB: any, chatId: number | string, p: Pos, info: IndicadorInfo & { adx?: number; rsi?: number; adxAntes?: number }, alvo?: "long" | "short"): Promise<Sugestao> {
  const s = sugestaoPosicao(p, info, alvo);
  if (!SB) return s;
  const seta = await setaPosicao(SB, chatId, p.instId, p.lado, s.emoji);
  return seta ? { ...s, seta } : s;
}
function pontuar(x: CtxPontos) {
  const { info, lado, adx, adxDif, rsi, volUsdt, trocas, h1, btcAdx, perfil, fo, volRatio, chegadaForte, apChega, tipo, pct24, bottom, top, btcVar } = x;
  const lado1h = h1 ? ladoAtual(h1) : null;
  const motivos: Motivo[] = [];
  const add = (pts: number, txt: string) => motivos.push({ pts, txt });
  if (!h1) add(0, "1H sem dados");
  else if (lado1h === null) add(0, "1H: preço dentro da faixa (sem tendência definida)");
  else if (lado1h === lado) add(2, `1H alinhada com o ${lado === "long" ? "LONG" : "SHORT"}`);
  else add(-2, `1H CONTRA (1H está ${lado1h === "long" ? "acima" : "abaixo"} da faixa)`);
  // V60 (oculto): em continuação, se o +DI/−DI diz que a força vem do lado OPOSTO ao do robô, o ADX alto não conta a favor
  // (o texto e o número do ADX ficam iguais; só o peso muda). Em reversão não se aplica: a tendência velha é contra por definição.
  const diContra = DI_OCULTO_ON && tipo !== "reversao" && x.diDom != null && x.diDom !== lado;
  if (adx >= X_ADX_FORTE) add(diContra ? 1 : 2, `ADX ${adx.toFixed(1)} (tendência forte)`);
  else if (adx >= FILTRO_ADX_MIN) add(1, `ADX ${adx.toFixed(1)} (moderado)`);
  else add(-2, `ADX ${adx.toFixed(1)} (lateral, cruzamentos falham mais)`);
  if (adxDif > 0.5) { if (diContra) add(0, "ADX subindo, mas puxado pelo lado oposto"); else add(1, "ADX subindo"); }
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
  if (chegadaForte) add(1, "chegada estimada dentro de janela historicamente forte de movimento");
  // V41: velocidade de aproximação só pontua quando CONFIRMOU 2 rodadas seguidas (🚀🚀/🐢🐢) — 1 rodada isolada
  // é sinal fraco demais (pode ser ruído), fica só no texto do alerta.
  if (x.velSinal === "acelerando2x") add(1, "🚀🚀 acelerando de verdade rumo à linha (ganhando ritmo 2 rodadas seguidas)");
  else if (x.velSinal === "devagar2x") add(-1, "🐢🐢 devagar 2 rodadas seguidas: chance real de não chegar a tempo");
  if (info.larguraRel !== undefined && info.larguraRel <= SQUEEZE_REL && (idade === null || idade <= ALERT_FRESCO_CANDLES)) {
    const pctTip = `${Math.round(info.larguraRel * 100)}% da largura típica`;
    const volConfirma = volRatio !== null && volRatio >= VOL_ACEL_RATIO;
    if (idade !== null && !volConfirma) add(-1, `cruzou com a faixa comprimida (${pctTip}) e o volume não confirmou: o 1º cruzamento em compressão costuma ser falso`);
    else if (adxDif > 0.5 && adx < X_ADX_FORTE) add(1, `faixa comprimida (${pctTip}) + ADX subindo: costuma vir antes do rompimento`);
    else add(0, `faixa comprimida (${pctTip}), ADX ainda não confirma`);
  }
  if (info.inclinaRel !== undefined && isFinite(info.inclinaRel)) {
    const contra = lado === "long" ? -info.inclinaRel : info.inclinaRel;
    const revApoiada = (lado === "long" && FUNDO_ON && fundoOk(bottom)) || (lado === "short" && TOPO_ON && topoOk(top));
    const ladoTxt = lado === "long" ? "LONG" : "SHORT";
    if (contra >= INCLINA_FORTE) add(revApoiada ? -1 : -2, `inclinação da faixa ${inclinaTxt(info)}: ${ladoTxt} contra a inclinação, cruzamento contra a tendência costuma falhar${revApoiada ? " (aliviado: há sinais de virada)" : ""}`);
    else if (contra >= INCLINA_MOD && !revApoiada) add(-1, `inclinação da faixa ${inclinaTxt(info)}: ${ladoTxt} contra a inclinação`);
    else if (-contra >= INCLINA_MOD) add(1, `inclinação da faixa ${inclinaTxt(info)}: ${ladoTxt} a favor da inclinação`);
  }
  if (info.distAbs > FILTRO_DIST_MAX_PCT) add(-2, `${info.distAbs.toFixed(2)}% longe da faixa`);
  if (trocas >= SERROTE_AVISO) add(-1, `vai e vem: ${trocas} trocas de posição em 4h`);
  if (btcAdx !== null && btcAdx < X_ADX_FRACO) add(-1, `BTC lateral (ADX ${btcAdx.toFixed(1)})`);
  // V41: ETH como segunda referência de mercado — só reforça (não duplica) quando o BTC já não pegou o mesmo alerta
  else if (x.ethAdx != null && x.ethAdx < X_ADX_FRACO) add(-1, `ETH também lateral (ADX ${x.ethAdx.toFixed(1)})`);
  if (perfil) {
    const j = xInfoJanela(perfil, Date.now());
    if (j.idxAgora >= X_JANELA_FORTE) add(1, "janela forte de movimento");
    else if (j.idxAgora <= X_JANELA_FRACA) add(-1, "janela fraca de movimento");
  }
  if (fo && fo.funding !== null && ((lado === "long" && fo.funding > FUNDING_ALTO_PCT) || (lado === "short" && fo.funding < -FUNDING_ALTO_PCT))) {
    // V41: por tendência — subindo rápido rumo ao extremo pesa mais que já estar parado lá há horas
    const ft = x.fundingTend;
    if (ft?.subindoRapido) add(-2, `funding ${fo.funding >= 0 ? "+" : ""}${fo.funding.toFixed(3)}% e esticando rápido (multidão do mesmo lado, correção pode vir logo)`);
    else if (ft?.parado) add(0, `funding ${fo.funding >= 0 ? "+" : ""}${fo.funding.toFixed(3)}% já parado no extremo há horas (multidão esticada, mas sinal mais velho)`);
    else add(-1, `funding ${fo.funding >= 0 ? "+" : ""}${fo.funding.toFixed(3)}% (multidão esticada do mesmo lado)`);
  }
  if (BTC_DIR_ON && btcVar != null && isFinite(btcVar)) {
    const f = BTC_DIR_PCT;
    if (lado === "short" && btcVar >= f) add(tipo === "reversao" ? -2 : -1, `BTC subindo +${btcVar.toFixed(1)}% na última hora: pump de altcoin tende a continuar, SHORT arriscado`);
    else if (lado === "short" && btcVar <= -f && tipo === "reversao") add(1, `BTC caindo ${btcVar.toFixed(1)}% na última hora: ajuda o SHORT de reversão`);
    else if (lado === "long" && btcVar <= -f && !(pct24 != null && pct24 < 0)) add(-1, `BTC caindo ${btcVar.toFixed(1)}% na última hora: o pump pode perder força`);
  }
  // V41: ETH como segunda referência (peso menor que o BTC, só reforça o risco de curto prazo)
  if (ETH_DIR_ON && x.ethVar != null && isFinite(x.ethVar)) {
    const f = ETH_DIR_PCT;
    if (lado === "short" && x.ethVar >= f) add(-1, `ETH subindo +${x.ethVar.toFixed(1)}% na última hora: reforça risco pro SHORT`);
    else if (lado === "long" && x.ethVar <= -f && !(pct24 != null && pct24 < 0)) add(-1, `ETH caindo ${x.ethVar.toFixed(1)}% na última hora: reforça risco pro LONG`);
  }
  // V41: CVD / desequilíbrio do book — proxy via profundidade do livro (bid vs ask), único dado que antecipa
  // antes do fechamento da vela; positivo = mais volume comprador no book, negativo = mais vendedor.
  if (x.bookImb != null && isFinite(x.bookImb)) {
    const IMB = BOOK_IMB_MIN_PCT;
    if (lado === "long" && x.bookImb >= IMB) add(1, `book desequilibrado pra compra (${x.bookImb >= 0 ? "+" : ""}${x.bookImb.toFixed(0)}%): mais gente comprando que vendendo agora`);
    else if (lado === "short" && x.bookImb <= -IMB) add(1, `book desequilibrado pra venda (${x.bookImb.toFixed(0)}%): mais gente vendendo que comprando agora`);
    else if (lado === "long" && x.bookImb <= -IMB) add(-1, `book pesando pro lado vendedor (${x.bookImb.toFixed(0)}%): contra o LONG`);
    else if (lado === "short" && x.bookImb >= IMB) add(-1, `book pesando pro lado comprador (${x.bookImb >= 0 ? "+" : ""}${x.bookImb.toFixed(0)}%): contra o SHORT`);
  }
  if (fo && fo.funding !== null && lado === "short" && fo.funding > FUNDING_ALTO_PCT) {
    const ft = x.fundingTend;
    if (ft?.parado) add(0, `funding +${fo.funding.toFixed(3)}% já parado no alto há horas: sinal de reversão mais fraco (multidão comprada, mas não é fresco)`);
    else if (ft?.subindoRapido) add(2, `funding +${fo.funding.toFixed(3)}% subindo rápido: multidão comprada e esticando, combustível forte pra queda`);
    else add(1, `funding +${fo.funding.toFixed(3)}%: multidão comprada, combustível pra queda`);
  }
  if (fo && fo.oiChg !== null) {
    if (fo.oiChg >= OI_SUBINDO_PCT) add(1, `OI subindo ${fo.oiChg >= 0 ? "+" : ""}${fo.oiChg.toFixed(1)}% (4h): posição nova entrando, movimento tem combustível`);
    else if (fo.oiChg <= OI_CAINDO_PCT) add(-1, `OI caindo ${fo.oiChg.toFixed(1)}% (4h): parece fechamento de posição (squeeze), não gente nova entrando`);
  }
  if (x.confiabInst) {
    const c = x.confiabInst;
    if (c.pts > 0) add(c.pts, `histórico da moeda: confirma bem os cruzamentos (${Math.round(c.taxa * 100)}% em ${c.n} casos)`);
    else if (c.pts < 0) add(c.pts, `histórico da moeda: é "serrote" — cruza e volta com frequência (${Math.round(c.taxa * 100)}% acerto em ${c.n} casos)`);
  }
  if (ESTRAT_PUMP && lado === "long" && ((pct24 != null && pct24 < 0) || tipo === "reversao")) {
    if (FUNDO_ON && FUNDO_LIBERA_LONG && bottom) {
      if (fundoOk(bottom)) add(2, `sinais de fundo (${bottom.conf}/10)${bottom.repique ? " ⭐ repique segurando na faixa" : ": queda esgotando"}, ${bottom.repique ? "retomada da alta com apoio" : "reversão com apoio"}`);
      else if (bottom.conf >= FUNDO_CONF_MIN - 2) add(0, `sinais de fundo parciais (${bottom.conf}/10)`);
      else add(-2, `${pct24 != null && pct24 < 0 ? "moeda em queda (no dia ou desde o topo)" : `moeda sem alta clara no dia (dentro de ±${REPIQUE_PCT_ZONA}%)`} sem sinais claros de fundo (${bottom.conf}/10)`);
    } else add(-3, pct24 != null && pct24 < 0 ? "moeda em queda no dia: LONG seria reversão de baixa pra alta (fora da estratégia)" : `moeda sem alta clara no dia (dentro de ±${REPIQUE_PCT_ZONA}%): LONG sem confirmação de alta (fora da estratégia)`);
  }
  // V54: espelho do bloco de topo abaixo — o +2 de "sinais de fundo" vale pro LONG em qualquer tipo. Antes só entrava
  // com pct24 < 0 ou tipo "reversao", então o repique LONG que virou "oportunidade" (V44) perdia o ponto e o SHORT não.
  // As penalidades (-2/-3) continuam só no contexto de reversão, onde faz sentido cobrar sinal de fundo.
  else if (FUNDO_ON && FUNDO_LIBERA_LONG && lado === "long" && fundoOk(bottom)) add(2, `sinais de fundo (${bottom!.conf}/10)${bottom!.repique ? " ⭐ repique segurando na faixa, retomada da alta com apoio" : ": queda esgotando"}`);
  if (TOPO_ON && lado === "short" && topoOk(top)) add(2, `sinais de topo (${top!.conf}/10)${top!.repique ? " ⭐ repique rejeitado na faixa" : ": alta esgotando"}, ${top!.repique ? "retomada da queda com apoio" : "virada SHORT com apoio"}`);
  const total = motivos.reduce((s, m) => s + m.pts, 0);
  checarDerivaConfianca(total);
  // V54: o veredito usava cortes próprios em pontos brutos (ANALISE_VERDE=5 / ANALISE_AMARELO=2) que ficaram pra trás quando a
  // escala de confiança mudou (V43): total 0 ou 1 já dá confiança 6/10 (🟡), mas o veredito dizia 🔴 EVITAR / ESPERAR. Agora
  // sai da própria confiança, com os mesmos CONF_VERDE/CONF_AMARELO da bolinha, e os dois nunca mais divergem.
  const conf = confiancaDe(total);
  const veredito = conf >= CONF_VERDE ? "✅ <b>FAVORÁVEL</b>" : conf >= CONF_AMARELO ? "⚠️ <b>COM ATENÇÃO</b>" : "⛔ <b>EVITAR / ESPERAR</b>";
  return { motivos, total, veredito, conf };
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
async function calcConfiancaAlerta(c: Setup, volUsdt: number | null, perfil: XPerfil | null, velSinal?: VelSinal) {
  try {
    const f = c.info as InfoFiltravel;
    const inst = c.info.instId;
    const [d1h, btc, fo, btcV, ethReg, ethV, bookImb] = await Promise.all([
      xCandles(inst, "1H", 500), xRegimeCache(), getFundingOI(inst), btcVar1h(), xRegimeCacheEth(), ethVar1h(), getBookImbalance(inst),
    ]);
    const h1 = d1h ? calcIndicadorDeCloses(inst, d1h.c) : null;
    const ap = c.aprox ?? null;
    const fundingTend = await fundingTendencia(inst, fo);
    const confiabInst = await confiabilidadeMoeda(inst);
    const r = pontuar({
      info: c.info, lado: c.lado, adx: f.adx ?? 0, adxDif: (f.adx ?? 0) - (f.adxAntes ?? f.adx ?? 0), diDom: f.diDom ?? null, rsi: f.rsi ?? 50,
      volUsdt, trocas: f.trocas ?? 0, h1, btcAdx: btc ? btc.adx : null, perfil, fo, volRatio: f.volRatio ?? null,
      chegadaForte: chegadaEmJanelaForte(ap, perfil), apChega: ap, tipo: c.tipo, pct24: c.pct, bottom: f.bottom ?? null, top: f.top ?? null, btcVar: btcV,
      velSinal: velSinal ?? null, fundingTend, confiabInst, ethAdx: ethReg ? ethReg.adx : null, ethVar: ethV, bookImb,
    });
    return { ...r, fo, btcVar: btcV };
  } catch (e) { console.log("⚠️ confiança do alerta falhou", e); return null; }
}

async function registrarAntecipacao(SB: any, c: Setup, chats: string[]) {
  try {
    const ap = c.aprox;
    if (!ap) return;
    // V45: dedupe por moeda+lado (antes era só por moeda) — uma previsão pendente de LONG não bloqueia mais o
    // registro de uma aproximação nova de SHORT na mesma moeda (raro, já que só existe 1 `aprox` por vez — a
    // linha mais próxima — mas evita perder o registro se algum dia isso deixar de valer).
    const { data: pend } = await SB.from(ANTEC_TABELA).select("id").eq("instid", c.info.instId).eq("lado", c.lado).is("resultado", null).limit(1);
    if (pend && pend.length) return;
    // V41: grava também o ATR% do momento (distância normalizada pela volatilidade típica da moeda), pra dar pra
    // calibrar ANTEC_DIST_MAX_ATR sozinho depois (não só ANTEC_DIST_MAX_PCT). Exige a coluna atr_pct (numeric,
    // nullable) na tabela antecipacoes_log — se ainda não existir, cai pro insert antigo sem travar o registro.
    const atrRaw = (c.info as { atr?: number }).atr;
    const atrPct = typeof atrRaw === "number" && atrRaw > 0 && c.info.preco > 0 ? (atrRaw / c.info.preco) * 100 : null;
    const campos: Record<string, unknown> = {
      instid: c.info.instId, lado: c.lado, eta_prev_min: Math.max(1, Math.round(ap.etaCandles * TF_MIN)),
      dist_pct: ap.dist, chats: chats.join(","),
    };
    if (atrPct !== null) campos.atr_pct = atrPct;
    let { error } = await SB.from(ANTEC_TABELA).insert(campos);
    if (error && atrPct !== null && /atr_pct/i.test(error.message || "")) {
      // coluna ainda não existe no banco: registra sem ela em vez de perder o registro
      delete campos.atr_pct;
      ({ error } = await SB.from(ANTEC_TABELA).insert(campos));
      console.log("⚠️ coluna atr_pct não existe em antecipacoes_log ainda — registrado sem ela (veja nota no /calibracao)");
    }
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
    // Auditoria: aqui o update() com .is("resultado", null) é ao mesmo tempo "salva o resultado" E o trava de
    // concorrência (compare-and-swap) que evita duas rodadas do emLotes processarem a mesma previsão duas vezes.
    // Consequência aceita: se o enviarAlertaMoeda abaixo falhar (Telegram fora do ar etc.), a previsão já saiu
    // da lista de pendentes e não tem retry — a pessoa não fica sabendo se "chegando na linha" cruzou/foi
    // contra/recuou/expirou. Diferente do bug do Achado #3 (cooldown/estado de alerta principal, watchlist,
    // posições): aqui é só o rodapé informativo da calibração de /calibracao, então a perda é rara e de baixo
    // impacto. Um fix "correto" pediria trocar o CAS direto por um esquema de reivindicação com prazo de
    // validade (peça nova de estado, com sua própria limpeza de reivindicações expiradas) — decisão consciente
    // de não fazer essa troca aqui pra não trocar um bug pequeno por uma peça nova que pode falhar de outro jeito.
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
    await Promise.all(chats.map((ch) => enviarAlertaMoeda(SB, ch, `ANTEC_${inst}`, cortar(msg), botaoAnalisar(inst))));
  });
}
async function montarCalibracao(SB: any, dias: number): Promise<string> {
  const desde = new Date(Date.now() - dias * 86400000).toISOString();
  const { data, error } = await SB.from(ANTEC_TABELA).select("*").gt("criado_em", desde).not("resultado", "is", null).order("criado_em", { ascending: false }).limit(2000);
  // Auditoria (varredura de não usadas): "error" era lido do Supabase e descartado — se a consulta falhasse,
  // "rows" virava null e o primeiro rows.filter(...) abaixo estourava; o /placar chama isto com
  // .catch(() => "") então o erro sumia em silêncio (a seção de calibração só desaparecia da mensagem, sem log).
  if (error) { console.log("⚠️ montarCalibracao:", error.message); return ""; }
  const rows = (data || []) as any[];
  if (rows.length === 0) return ""; // V54: sem amostra, a conta de % dividia por zero e saía "NaN%"
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
  // V41: status do ATR — só existe amostra se a coluna atr_pct já estiver criada em antecipacoes_log
  const comAtr = rows.filter((r) => isFinite(Number(r.atr_pct)) && Number(r.atr_pct) > 0);
  t += comAtr.length
    ? `📐 ANTEC_DIST_MAX_ATR=${ANTEC_DIST_MAX_ATR} (${comAtr.length} amostra(s) com ATR registrado — a auto-calibração já ajusta este limiar sozinha)\n`
    : `📐 ANTEC_DIST_MAX_ATR=${ANTEC_DIST_MAX_ATR}: ainda sem amostra com ATR — crie a coluna <code>atr_pct numeric</code> em <code>antecipacoes_log</code> no Supabase pra esse limiar também se auto-calibrar (os outros dois já ajustam sozinhos, este continua fixo até a coluna existir).\n`;
  return t + "\n";
}
// V41: calibração automática das janelas de antecipação — antes o /calibracao só MOSTRAVA o erro; agora, uma vez
// por AUTO_CALIB_INTERVALO_H horas (gatilho salvo na mesma tabela de estado, sobrevive a cold start), recalcula
// e AJUSTA ANTEC_ETA_MAX_CANDLES / ANTEC_DIST_MAX_PCT sozinho, com a mesma regra de "maior faixa com ≥60% de
// acerto" que o /calibracao já sugeria — só que agora aplica, em vez de só sugerir. Avisa o dono quando muda algo.
const AUTO_CALIB_ON = (Deno.env.get("AUTO_CALIB") || "1") !== "0";
const AUTO_CALIB_INTERVALO_H = numEnv("AUTO_CALIB_INTERVALO_H", "24");
const AUTO_CALIB_DIAS = numEnv("AUTO_CALIB_DIAS", "14");
const AUTO_CALIB_ROW = "_auto_calib_antecipacao";
// V42: limites de segurança — mesmo com amostra pequena/enviesada, a auto-calibração nunca pode levar os
// parâmetros pra fora dessa faixa, e o tamanho do passo por ciclo é limitado (evita salto brusco de uma vez).
const ANTEC_ETA_MIN_LIM = numEnv("ANTEC_ETA_MIN_LIM", "2");
const ANTEC_ETA_MAX_LIM = numEnv("ANTEC_ETA_MAX_LIM", "15");
const ANTEC_ETA_PASSO_MAX = numEnv("ANTEC_ETA_PASSO_MAX", "3");
const ANTEC_DIST_MIN_LIM = numEnv("ANTEC_DIST_MIN_LIM", "0.2");
const ANTEC_DIST_MAX_LIM = numEnv("ANTEC_DIST_MAX_LIM", "3");
const ANTEC_ATR_MIN_LIM = numEnv("ANTEC_ATR_MIN_LIM", "0.5");
const ANTEC_ATR_MAX_LIM = numEnv("ANTEC_ATR_MAX_LIM", "3");
const ANTEC_CALIB_PASSO_PCT = numEnv("ANTEC_CALIB_PASSO_PCT", "30");
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
let _calibRestaurada = false;
// V42: as três variáveis só existem em memória — sem restaurar, todo cold start (deploy novo, isolate
// reciclado) volta em silêncio pro padrão das env vars, enquanto o registro "já calibrei hoje" no Supabase
// segue impedindo recalcular por até AUTO_CALIB_INTERVALO_H horas. Roda 1x por isolate, bem no início da rodada.
async function restaurarCalibracao(SB: any) {
  if (_calibRestaurada) return;
  try {
    const { data: row, error: eRest } = await SB.from(TAB).select("last_status").eq("instid", AUTO_CALIB_ROW).maybeSingle();
    // V74: a flag só vira true se a leitura FUNCIONOU. Antes ela subia antes de ler: um erro passageiro do Supabase deixava os valores do env
    // em memória e a próxima auto-calibração (marcarRodou) gravava esses padrões por cima da calibração salva.
    if (eRest) { console.log("⚠️ restaurarCalibracao: leitura falhou, tento de novo na próxima rodada", eRest.message ?? eRest); return; }
    _calibRestaurada = true;
    if (!row?.last_status) return;
    const j = JSON.parse(row.last_status);
    if (isFinite(Number(j.eta))) ANTEC_ETA_MAX_CANDLES = clamp(Math.round(Number(j.eta)), ANTEC_ETA_MIN_LIM, ANTEC_ETA_MAX_LIM);
    if (isFinite(Number(j.dist))) ANTEC_DIST_MAX_PCT = clamp(Number(j.dist), ANTEC_DIST_MIN_LIM, ANTEC_DIST_MAX_LIM);
    if (isFinite(Number(j.atr))) ANTEC_DIST_MAX_ATR = clamp(Number(j.atr), ANTEC_ATR_MIN_LIM, ANTEC_ATR_MAX_LIM);
    console.log(`♻️ calibração restaurada: ETA=${ANTEC_ETA_MAX_CANDLES} DIST=${ANTEC_DIST_MAX_PCT}% ATR=${ANTEC_DIST_MAX_ATR}`);
  } catch (e) { console.log("⚠️ erro restaurando calibração", e); }
}
async function autoCalibrarAntecipacao(SB: any) {
  if (!AUTO_CALIB_ON) return;
  try {
    const { data: row } = await SB.from(TAB).select("last_status").eq("instid", AUTO_CALIB_ROW).maybeSingle();
    const ultimo = row?.last_status ? Number(JSON.parse(row.last_status).t) || 0 : 0;
    if (Date.now() - ultimo < AUTO_CALIB_INTERVALO_H * 3600000) return;
    const desde = new Date(Date.now() - AUTO_CALIB_DIAS * 86400000).toISOString();
    const { data, error } = await SB.from(ANTEC_TABELA).select("*").gt("criado_em", desde).not("resultado", "is", null).order("criado_em", { ascending: false }).limit(2000);
    const marcarRodou = async () => upsertLinha(SB, AUTO_CALIB_ROW, { last_status: JSON.stringify({ t: Date.now(), eta: ANTEC_ETA_MAX_CANDLES, dist: ANTEC_DIST_MAX_PCT, atr: ANTEC_DIST_MAX_ATR }) });
    if (error || !data || data.length < ANTEC_CALIB_MIN) { await marcarRodou(); return; }
    const rows = data as any[];
    const maxC = Math.max(ANTEC_ETA_MAX_CANDLES, 8);
    let sugEta: number | null = null;
    for (let k = 1; k <= maxC; k++) {
      const acum = rows.filter((r) => Number(r.eta_prev_min) <= k * TF_MIN);
      if (acum.length >= 5 && acum.filter((r) => r.resultado === "cruzou").length / acum.length >= 0.6) sugEta = k;
    }
    const dists = [...new Set(rows.map((r) => Math.round(Number(r.dist_pct) * 100) / 100))].filter((d) => isFinite(d) && d > 0).sort((a, b) => a - b);
    let sugDist: number | null = null;
    for (const d of dists) {
      const acum = rows.filter((r) => Number(r.dist_pct) <= d);
      if (acum.length >= 5 && acum.filter((r) => r.resultado === "cruzou").length / acum.length >= 0.6) sugDist = d;
    }
    // V41: distância normalizada pela volatilidade (dist_pct / atr_pct) — só usa linhas que já têm atr_pct
    // gravado (registros a partir da V41); com poucas linhas ainda, simplesmente não ajusta esse limiar.
    const comAtr = rows.filter((r) => isFinite(Number(r.atr_pct)) && Number(r.atr_pct) > 0);
    let sugAtr: number | null = null;
    if (comAtr.length >= ANTEC_CALIB_MIN) {
      const razoes = [...new Set(comAtr.map((r) => Math.round((Number(r.dist_pct) / Number(r.atr_pct)) * 100) / 100))].filter((v) => isFinite(v) && v > 0).sort((a, b) => a - b);
      for (const ratio of razoes) {
        const acum = comAtr.filter((r) => Number(r.dist_pct) / Number(r.atr_pct) <= ratio);
        if (acum.length >= 5 && acum.filter((r) => r.resultado === "cruzou").length / acum.length >= 0.6) sugAtr = ratio;
      }
    }
    const antes = { eta: ANTEC_ETA_MAX_CANDLES, dist: ANTEC_DIST_MAX_PCT, atr: ANTEC_DIST_MAX_ATR };
    // V42: toda sugestão passa por dois filtros — (1) nunca sai da faixa absoluta (ANTEC_*_MIN_LIM/MAX_LIM),
    // (2) mudança por ciclo limitada a ANTEC_ETA_PASSO_MAX velas / ANTEC_CALIB_PASSO_PCT% do valor atual, pra
    // uma amostra pequena/enviesada não conseguir "puxar" o parâmetro pra um valor estranho de uma vez só.
    if (sugEta !== null && sugEta !== ANTEC_ETA_MAX_CANDLES) {
      const alvo = clamp(sugEta, ANTEC_ETA_MIN_LIM, ANTEC_ETA_MAX_LIM);
      ANTEC_ETA_MAX_CANDLES = Math.round(clamp(alvo, antes.eta - ANTEC_ETA_PASSO_MAX, antes.eta + ANTEC_ETA_PASSO_MAX));
    }
    if (sugDist !== null && Math.abs(sugDist - ANTEC_DIST_MAX_PCT) / Math.max(ANTEC_DIST_MAX_PCT, 0.01) > 0.1) {
      const alvo = clamp(sugDist, ANTEC_DIST_MIN_LIM, ANTEC_DIST_MAX_LIM);
      const passoMax = antes.dist * (ANTEC_CALIB_PASSO_PCT / 100);
      ANTEC_DIST_MAX_PCT = Math.round(clamp(alvo, antes.dist - passoMax, antes.dist + passoMax) * 100) / 100;
    }
    if (sugAtr !== null && Math.abs(sugAtr - ANTEC_DIST_MAX_ATR) / Math.max(ANTEC_DIST_MAX_ATR, 0.01) > 0.1) {
      const alvo = clamp(sugAtr, ANTEC_ATR_MIN_LIM, ANTEC_ATR_MAX_LIM);
      const passoMax = antes.atr * (ANTEC_CALIB_PASSO_PCT / 100);
      ANTEC_DIST_MAX_ATR = Math.round(clamp(alvo, antes.atr - passoMax, antes.atr + passoMax) * 100) / 100;
    }
    await marcarRodou();
    if (antes.eta !== ANTEC_ETA_MAX_CANDLES || antes.dist !== ANTEC_DIST_MAX_PCT || antes.atr !== ANTEC_DIST_MAX_ATR) {
      console.log(`🛠️ auto-calibração: ETA ${antes.eta}→${ANTEC_ETA_MAX_CANDLES} velas, DIST ${antes.dist}→${ANTEC_DIST_MAX_PCT}%, ATR ${antes.atr}→${ANTEC_DIST_MAX_ATR} (amostra ${rows.length}, ${comAtr.length} com atr_pct)`);
      if (DONO_CHAT) {
        const msg = `🛠️ <b>Auto-calibração das janelas de antecipação</b> (amostra ${rows.length}, últimos ${AUTO_CALIB_DIAS}d)\n` +
          `ANTEC_ETA_MAX_CANDLES: ${antes.eta} → <b>${ANTEC_ETA_MAX_CANDLES}</b> velas (${ANTEC_ETA_MAX_CANDLES * TF_MIN} min)\n` +
          `ANTEC_DIST_MAX_PCT: ${antes.dist}% → <b>${ANTEC_DIST_MAX_PCT}%</b>` +
          (antes.atr !== ANTEC_DIST_MAX_ATR ? `\nANTEC_DIST_MAX_ATR: ${antes.atr} → <b>${ANTEC_DIST_MAX_ATR}</b> (${comAtr.length} amostras com ATR)` : "");
        await sendTelegram(DONO_CHAT, msg, undefined, { semUi: true }).catch(() => {});
      }
    }
  } catch (e) { console.log("⚠️ autoCalibrarAntecipacao falhou", e); }
}
function botaoAnalisar(instId: string): Botoes {
  const s = instId.replace("-USDT", "");
  return [[{ text: `🔎 Analisar ${s}`, callback_data: `/analise ${s.toLowerCase()}` }]];
}
// botões "🔎 MOEDA" (3 por linha) que abrem o /analise de cada moeda da lista
function botoesAnalisarLista(insts: string[]): Botoes {
  const uni = [...new Set(insts)];
  const linhas: Botoes = [];
  for (let i = 0; i < uni.length; i += 3) {
    linhas.push(uni.slice(i, i + 3).map((x) => {
      const c = x.replace("-USDT", "").toLowerCase();
      return { text: `🔎 ${c.toUpperCase()}`, callback_data: `/analise ${c}` };
    }));
  }
  return linhas;
}
// linha "💪 ADX 25.9 ↘ · RSI 49" usada nas listas
const forcaLinha = (x: { adx?: number; adxAntes?: number; rsi?: number }): string => {
  if (typeof x.adx !== "number" || typeof x.rsi !== "number") return "";
  const d = typeof x.adxAntes === "number" ? x.adx - x.adxAntes : 0;
  return `💪 ADX ${x.adx.toFixed(1)} ${d > 0.5 ? "↗" : d < -0.5 ? "↘" : "→"} · RSI ${x.rsi.toFixed(0)}\n`;
};
const TAB = "alertas_indicador";
// V46: antes era select → depois insert OU update (2 chamadas), a mesma corrida "ler→checar→escrever"
// que o V45 corrigiu especificamente pro lock do cron — mas upsertLinha é usada em dezenas de outros
// lugares (_FUNDO_, _MSG_, _MODO_, _PAUSA_, autoapagar...) que podem receber chamadas concorrentes vindas
// de callbacks do Telegram. upsert() nativo do Postgres/Supabase faz isso num INSERT ... ON CONFLICT DO
// UPDATE só, sem a janela de corrida (requer unique constraint em "instid", que a tabela já trata como
// chave de fato em todo o resto do arquivo).
async function upsertLinha(SB: any, instid: string, campos: Record<string, unknown>) {
  // Antes o erro do insert/update nem era lido (nenhum dos dois branches checava `.error`), então já era
  // efetivamente "loga e segue" pra quem chama sem try/catch. Mantém esse contrato aqui dentro em vez de
  // lançar, pra não mudar o comportamento dos vários call sites que não envolvem isso em try/catch.
  const { error } = await SB.from(TAB).upsert({ instid, ...campos }, { onConflict: "instid" });
  if (error) console.log(`⚠️ upsertLinha(${instid}) falhou:`, error.message ?? error);
}
const FUNDING_ALTO_PCT = 0.05;
// V40: OI (open interest) já era buscado (getFundingOI) mas só aparecia como texto — nunca pontuava.
// OI subindo junto com o preço = posição nova entrando (movimento com "combustível" real).
// OI caindo com o preço subindo = short squeeze fechando posição alavancada: sobe rápido, mas tende a perder força sem gente nova entrando.
const OI_SUBINDO_PCT = numEnv("OI_SUBINDO_PCT", "2");
const OI_CAINDO_PCT = numEnv("OI_CAINDO_PCT", "-2");
// V41: CVD/desequilíbrio do book. CVD "puro" (soma de trades agressores) exigiria assinar o stream de trades,
// pesado demais pra rodar em toda moeda do pool a cada rodada; em vez disso usa a profundidade do livro agora
// (bid vs ask nos primeiros níveis) como proxy — mesma ideia (pressão compradora x vendedora), mais leve.
const BOOK_IMB_MIN_PCT = numEnv("BOOK_IMB_MIN_PCT", "15");
async function getBookImbalance(instId: string): Promise<number | null> {
  try {
    const sym = instId.replace("-", "");
    let bids: [string, string][] | undefined, asks: [string, string][] | undefined;
    if (ehBtcEth(instId)) {
      const jb = await binanceGet(`/fapi/v1/depth?symbol=${sym}&limit=50`);
      bids = jb?.bids; asks = jb?.asks;
    }
    if (!bids?.length || !asks?.length) {
      const r = await fetch(`https://api.bybit.com/v5/market/orderbook?category=linear&symbol=${sym}&limit=50`);
      const j = await r.json();
      bids = j?.result?.b as [string, string][] | undefined;
      asks = j?.result?.a as [string, string][] | undefined;
    }
    if (!bids?.length || !asks?.length) return null;
    const soma = (arr: [string, string][]) => arr.reduce((s, [, q]) => s + (parseFloat(q) || 0), 0);
    const bidVol = soma(bids), askVol = soma(asks);
    const total = bidVol + askVol;
    if (total <= 0) return null;
    return ((bidVol - askVol) / total) * 100;
  } catch { return null; }
}
async function getFundingOI(instId: string): Promise<{ funding: number | null; oiChg: number | null }> {
  const sym = instId.replace("-", "");
  let funding: number | null = null, oiChg: number | null = null;
  if (ehBtcEth(instId)) {
    const jf = await binanceGet(`/fapi/v1/premiumIndex?symbol=${sym}`);
    const fb = parseFloat(jf?.lastFundingRate);
    if (isFinite(fb)) funding = fb * 100;
    const jo = await binanceGet(`/futures/data/openInterestHist?symbol=${sym}&period=1h&limit=5`);
    if (Array.isArray(jo) && jo.length >= 5) {
      const a = parseFloat(jo[jo.length - 1].sumOpenInterest), b = parseFloat(jo[0].sumOpenInterest); // Binance: mais antigo primeiro
      if (isFinite(a) && isFinite(b) && b > 0) oiChg = ((a - b) / b) * 100;
    }
    if (funding !== null && oiChg !== null) return { funding, oiChg };
  }
  try {
    const r = await fetch(`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${sym}`);
    const j = await r.json();
    const fr = parseFloat(j?.result?.list?.[0]?.fundingRate);
    if (funding === null && isFinite(fr)) funding = fr * 100;
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
      if (oiChg === null && isFinite(a) && isFinite(b) && b > 0) oiChg = ((a - b) / b) * 100;
    }
  } catch { }
  return { funding, oiChg };
}
// V41: funding por TENDÊNCIA, não só valor atual. Guarda a última leitura de cada moeda em memória (zera a
// cada cold start, degrada bem — sem histórico, simplesmente não classifica tendência) e compara com a leitura
// agora: "subindoRapido" = ficou mais esticado rumo ao extremo desde a última rodada (sinal preditivo melhor);
// "parado" = já estava no extremo e continua lá, sem se mover, há pelo menos 2h (sinal mais fraco/velho).
type FundingTend = { subindoRapido: boolean; parado: boolean } | null;
const _fundingHist = new Map<string, { funding: number; t: number }>();
async function fundingTendencia(instId: string, fo: { funding: number | null; oiChg: number | null }): Promise<FundingTend> {
  if (!fo || fo.funding === null) return null;
  const prev = _fundingHist.get(instId);
  if (!prev) { _fundingHist.set(instId, { funding: fo.funding, t: Date.now() }); return null; }
  const horas = (Date.now() - prev.t) / 3600000;
  if (horas < 0.25) return null; // rodadas muito próximas: medida instável — mantém o baseline antigo, não atualiza ainda
  _fundingHist.set(instId, { funding: fo.funding, t: Date.now() }); // só atualiza o baseline quando o gate já foi cumprido
  const jaExtremo = Math.abs(prev.funding) >= FUNDING_ALTO_PCT;
  const aindaExtremo = Math.abs(fo.funding) >= FUNDING_ALTO_PCT;
  const mesmoLado = Math.sign(fo.funding) === Math.sign(prev.funding) || prev.funding === 0;
  const subindoRapido = aindaExtremo && mesmoLado && Math.abs(fo.funding) > Math.abs(prev.funding) * 1.15;
  const parado = jaExtremo && aindaExtremo && mesmoLado && horas >= 2 && Math.abs(fo.funding - prev.funding) < Math.abs(fo.funding) * 0.1;
  return { subindoRapido, parado };
}
// V41: confiabilidade por moeda — algumas moedas são cronicamente mais "serrote" (cruzam a linha e voltam) que
// outras. Usa o próprio histórico de antecipações (antecipacoes_log) da moeda: "cruzou" conta como acerto,
// "contra"/"recuou" como erro. Só ajusta com amostra mínima, pra não reagir a 2-3 casos isolados.
type ConfiabInfo = { pts: number; taxa: number; n: number };
const CONFIAB_MIN_AMOSTRA = numEnv("CONFIAB_MIN_AMOSTRA", "6");
// V45: janela configurável (antes fixa em 20). Nunca menor que CONFIAB_MIN_AMOSTRA — senão uma configuração
// errada (janela < mínimo) faria a amostra nunca bater o mínimo e a função sempre voltar null.
const CONFIAB_JANELA_N = Math.max(numEnv("CONFIAB_JANELA_N", "20"), CONFIAB_MIN_AMOSTRA);
const CONFIAB_PTS = 1;
async function confiabilidadeMoeda(instId: string): Promise<ConfiabInfo | null> {
  try {
    const SB = getSupabase();
    if (!SB) return null;
    const { data } = await SB.from(ANTEC_TABELA).select("resultado").eq("instid", instId).not("resultado", "is", null).order("criado_em", { ascending: false }).limit(CONFIAB_JANELA_N);
    const rows = (data || []) as any[];
    const acertos = rows.filter((r) => r.resultado === "cruzou").length;
    const erros = rows.filter((r) => r.resultado === "contra" || r.resultado === "recuou").length;
    const n = acertos + erros;
    if (n < CONFIAB_MIN_AMOSTRA) return null;
    const taxa = acertos / n;
    const pts = taxa >= 0.65 ? CONFIAB_PTS : taxa <= 0.35 ? -CONFIAB_PTS : 0;
    return { pts, taxa, n };
  } catch { return null; }
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
const SEG_MAX = numEnv("SEG_MAX", "10");
const SEG_MAX_GLOBAL = numEnv("SEG_MAX_GLOBAL", "40");
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
    // V79/V80: a /lista é do chat: ao parar de seguir, a moeda sai da lista DESTE chat — a não ser que a vigilância venha de um alerta recente (aí segue até o prazo).
    let saiuLista = false;
    try {
      if (tinha) {
        const { data: ex } = await SB.from(TAB).select("last_alert_at, watch_until").eq("instid", wlId(chatId, inst)).maybeSingle();
        const recente = !!ex?.last_alert_at && Date.now() - new Date(ex.last_alert_at).getTime() < WATCH_HORAS * 3600000;
        if (ex?.watch_until && !recente) { await SB.from(TAB).update({ watch_until: null }).eq("instid", wlId(chatId, inst)); saiuLista = true; }
      }
    } catch (e) { console.log("⚠️ /parar: não consegui tirar da lista de acompanhamento", e); }
    await sendTelegram(chatId, tinha ? `🛑 Parei de seguir <b>${inst}</b>. (restam ${antes.length - 1}/${SEG_MAX})${saiuLista ? "\n📋 Saiu da /lista de acompanhamento." : ""}` : `ℹ️ <b>${inst}</b> não estava na sua lista de seguidas.`);
    return;
  }
  const lista = await listarSeguidas(SB, chatId);
  const jaSegue = lista.some((x) => x.inst === inst);
  if (lista.length >= SEG_MAX && !jaSegue) { await sendTelegram(chatId, `⚠️ Limite de ${SEG_MAX} moedas seguidas (você segue ${lista.length}). Use /parar MOEDA antes.`); return; }
  const unicas = new Set((await listarSeguidas(SB)).map((x) => x.inst));
  if (!unicas.has(inst) && unicas.size >= SEG_MAX_GLOBAL) { await sendTelegram(chatId, `⚠️ O bot já acompanha ${SEG_MAX_GLOBAL} moedas seguidas no total (limite para o robô rodar dentro do tempo). Tente mais tarde ou peça ao administrador para aumentar SEG_MAX_GLOBAL.`); return; }
  if (legado) await SB.from(TAB).delete().eq("instid", SEG_PREFIXO + inst);
  await upsertLinha(SB, id, { last_status: "novo", last_alert_at: null });
  // V79: moeda seguida também entra na LISTA DE ACOMPANHAMENTO (/lista): vigia o lado atual dela por WATCH_HORAS e avisa se cruzar CONTRA.
  // Se ela já está na lista (alerta recente ou virada pendente), não mexe: sobrescrever o lado apagaria um "cruzou contra" ainda não avisado.
  let notaLista = "";
  try {
    const info = await calcIndicador500(inst);
    const atual = info ? ladoAtual(info) : null;
    const { data: ex } = await SB.from(TAB).select("instid, watch_until, watch_notificado").eq("instid", wlId(chatId, inst)).maybeSingle();
    const jaNaLista = !!ex && !!ex.watch_until && new Date(ex.watch_until).getTime() > Date.now() && ex.watch_notificado === false;
    if (jaNaLista) notaLista = "\n📋 Já está na /lista de acompanhamento.";
    else if (!atual) notaLista = "\n📋 Ela está dentro da faixa agora, então ainda não tem lado pra vigiar. Aparece na /lista como seguida e passa a ser vigiada assim que sair da faixa.";
    else {
      const w = { watch_side: atual, watch_notificado: false, watch_until: new Date(Date.now() + WATCH_HORAS * 3600 * 1000).toISOString() };
      const gr = ex ? await SB.from(TAB).update(w).eq("instid", wlId(chatId, inst)) : await SB.from(TAB).insert({ instid: wlId(chatId, inst), last_status: "novo", ...w });
      if (gr?.error) { console.log("⚠️ /seguir: gravar na lista falhou", gr.error); notaLista = `\n⚠️ Não consegui gravar na /lista: ${String(gr.error.message || gr.error).replace(/</g, "&lt;")}`; }
      else notaLista = `\n📋 Entrou na /lista de acompanhamento vigiando ${atual === "long" ? "LONG" : "SHORT"} enquanto você seguir.`;
    }
  } catch (e) { console.log("⚠️ /seguir: não consegui colocar na lista de acompanhamento", e); }
  await sendTelegram(chatId, `⭐ Seguindo <b>${inst}</b> (${jaSegue ? lista.length : lista.length + 1}/${SEG_MAX}). Aviso quando cruzar a linha ou chegar PERTO (mesmo fora do top 40 do dia).${notaLista}`, botaoAnalisar(inst));
}
async function runSeguidas(chatId: number | string) {
  const SB = getSupabase();
  if (!SB) { await sendTelegram(chatId, "⚠️ Supabase não configurado."); return; }
  const rows = (await listarSeguidas(SB, chatId)).map((x) => x.inst).sort();
  if (!rows.length) { await sendTelegram(chatId, "⭐ <b>SEGUIDAS</b>\n\nNenhuma moeda seguida. Use /seguir ONE."); return; }
  const [infos, perfilSeg] = await Promise.all([emLotes(rows, 10, calcIndicador500), xPerfilHoras().catch(() => null)]);
  let msg = `⭐ <b>MOEDAS SEGUIDAS</b> — ${rows.length}/${SEG_MAX}\n⏰ Agora: ${xTxtJanela(perfilSeg)}\n${DIVISOR}\n\n`;
  rows.forEach((inst, i) => {
    const info = infos[i];
    if (i > 0) msg += `${MINI_DIVISOR}\n`;
    msg += `<b>${i + 1}. ${inst}</b>\n${info ? `📍 ${indicadorTxt(info)}\n${idadeTxt(info.idadeCandles)}\npreço ${fmtPrice(info.preco)} | topo ${fmtPrice(info.topo)} | fundo ${fmtPrice(info.fundo)}` : "sem dado agora"}\n\n`;
  });
  const botoesSeg: Botoes = rows.map((inst) => {
    const s = inst.replace("-USDT", "").toLowerCase();
    return [{ text: `🔎 Analisar ${s.toUpperCase()}`, callback_data: `/analise ${s}` }, { text: `❌ Parar ${s.toUpperCase()}`, callback_data: `/parar ${s}` }];
  });
  botoesSeg.push([{ text: "🧹 Parar todas", callback_data: "/parar todas" }]);
  await enviarEmPartes(chatId, msg + "<i>Toque em 🔎 para analisar ou em ❌ para deixar de seguir uma moeda.</i>", botoesSeg); // V107: em partes
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
      aviso += await blocoPosicao(SB, sg.chat, posDaMoeda(await getPosicoes(sg.chat), inst), info, ladoAtual(info) ?? chegandoNaLinha(info)?.alvo);
      const id = await enviarAlertaMoeda(SB, sg.chat, `SEG_${inst}`, cortar(aviso), botaoSeguida(inst));
      if (!id) { console.log(`⚠️ seguidas: ${inst} — envio não confirmado, não vou consumir o cruzamento/cooldown`); return; }
      await SB.from(TAB).update({ last_status: atual, last_alert_at: new Date().toISOString() }).eq("instid", r.instid);
    } else {
      await SB.from(TAB).update({ last_status: atual }).eq("instid", r.instid);
    }
  });
}
const RESUMO_ON = (Deno.env.get("RESUMO") || "1") !== "0";
const RESUMO_MANHA_H = numEnv("RESUMO_MANHA_H", "8");
const RESUMO_NOITE_H = numEnv("RESUMO_NOITE_H", "21");
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
async function montarResumoNoite(SB: any, chat?: string | number, inicioMs?: number): Promise<string> {
  const tzMs = X_TZ_OFFSET_H * 3600000;
  const inicioDia = inicioMs ?? Math.floor((Date.now() + tzMs) / 86400000) * 86400000 - tzMs; // início do ciclo (painel: 21h)
  const { data, error } = await SB.from(PLACAR_TABELA).select("*").gt("criado_em", new Date(inicioDia).toISOString()).order("criado_em", { ascending: true }).limit(500);
  // as 2 primeiras linhas (cabeçalho + divisor) são removidas pelo painel; o resto é o fechamento do ciclo
  let msg = `🌙 <b>BOA NOITE — alertas do dia</b>\n${DIVISOR}\n\n<b>── 🏁 Fechamento do ciclo ──</b>\n`;
  const rows = ((error ? [] : (data || [])) as any[]).filter((r) => !ehFinalLog(r) && !ehDescartadoLog(r));
  let lista = "";
  if (!rows.length) msg += error ? `⚠️ Não consegui ler o placar (tabela ${PLACAR_TABELA} existe?).\n` : `Nenhum alerta neste ciclo.\n`;
  else {
    const c15 = rows.filter((r) => retornoLog(r, 15) !== null).length;
    msg += `${rows.length} alerta(s) · ${c15} com 15m conferido\n\n`;
    msg += `⏱️ <b>15m</b> <i>(seu horizonte)</i>\n${linhaStats(rows, [15])}\n\n`;
    msg += `📊 <b>1h · 4h · 24h</b>\n${linhaStats(rows)}\n<i>— = horário que ainda não fechou · cada taxa mostra (acertos/amostra) e a mediana do retorno</i>\n`;
    lista = `\n📜 <b>Alertas do ciclo</b>${rows.length > 10 ? ` <i>(os 10 últimos de ${rows.length})</i>` : ""}\n`;
    for (const r of rows.slice(-10)) {
      const hora = new Date(new Date(r.criado_em).getTime() + tzMs).toISOString().slice(11, 16);
      const res = [15, ...PLACAR_HORIZ_EXIBE].map((h) => { const x = retornoLog(r, h); return `${rotH(h)} ${x === null ? "—" : (x >= 0 ? "+" : "") + x.toFixed(1) + "%"}`; }).join(" · ");
      lista += `• ${hora} ${String(r.instid).replace("-USDT", "")} ${r.lado === "long" ? "LONG" : "SHORT"} — ${res}\n`;
    }
  }
  let real = "";
  const credR = chat !== undefined ? credDe(chat) : null;
  if (credR) {
    try {
      const { fills } = await buscarFills(credR, inicioDia);
      const fech = fills.filter((f) => numOr0(f.fillPnl) !== 0);
      const soma = fech.reduce((s, f) => s + numOr0(f.fillPnl), 0);
      const gan = fech.filter((f) => numOr0(f.fillPnl) > 0).length;
      real = `\n💼 <b>Seu resultado real</b>: ${sgn(soma)} USDT${fech.length ? ` (${gan} ganho(s) × ${fech.length - gan} perda(s))` : " (nenhum fechamento)"}\n<i>sem taxas e funding</i>\n`;
    } catch (e) { console.log("⚠️ resumo noite (fills)", e); }
  }
  let anterior = "";
  try {
    const { data: d14 } = await lerPaginado((a, b) => SB.from(PLACAR_TABELA).select("*").gt("criado_em", new Date(Date.now() - 14 * 86400000).toISOString()).order("criado_em", { ascending: false }).range(a, b));
    const r14 = ((d14 || []) as any[]).filter((r) => !ehFinalLog(r) && !ehDescartadoLog(r));
    const ontem = r14.filter((r) => { const t = new Date(r.criado_em).getTime(); return t >= inicioDia - 86400000 && t < inicioDia; });
    if (ontem.length) anterior = `\n📆 <b>Ciclo anterior</b> (${ontem.length} alerta(s), já conferido)\n⏱️ ${linhaStats(ontem, [15])}\n📊 ${linhaStats(ontem)}\n`;
  } catch (e) { console.log("⚠️ resumo noite (14d)", e); }
  const { data: w } = await SB.from(TAB).select("instid").like("instid", `${WL_PREFIXO}%`).not("watch_until", "is", null).gt("watch_until", new Date().toISOString()).eq("watch_notificado", false);
  const nAcomp = new Set(((w || []) as any[]).map((r) => parseWL(r)?.inst).filter(Boolean)).size; // moedas distintas (cada chat tem a própria lista)
  msg += real + lista + anterior + `\n📋 ${nAcomp} moeda(s) seguem em acompanhamento.`;
  return cortar(msg);
}
// ─── V55: AGENDA ECONÔMICA ────────────────────────────────────────────────────────────────────────
// Avisa antes dos dados de ALTO impacto (CPI, payroll, FOMC...) pra você não abrir operação na hora em
// que o preço dispara e volta em segundos. Fonte: calendário semanal público do Forex Factory (JSON,
// grátis, sem chave). Ele limita requisições (429), então tudo passa por cache: memória + Supabase
// (_AGENDA_CACHE_), e se a fonte cair o bot usa o último cache e AVISA que está desatualizado.
//  • aviso automático 60 e 15 min antes (o de 15 substitui o de 60 — mesma mensagem, sem poluir)
//  • bloco "Agenda — próximas 24h" dentro do painel do dia (sem mensagem extra = sem duplicar)
//  • comando /agenda (hoje + amanhã)
// Env: AGENDA=0 desliga · AGENDA_PAISES=USD,EUR · AGENDA_IMPACTOS=High,Medium · AGENDA_AVISOS_MIN=60,15
//      AGENDA_QUARENTENA_MIN=30 (até quando o texto manda evitar operar depois do horário) · AGENDA_CACHE_MIN=60
const AGENDA_ON = (Deno.env.get("AGENDA") || "1") !== "0";
const AGENDA_PAISES = (Deno.env.get("AGENDA_PAISES") || "USD").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
const AGENDA_IMPACTOS = (Deno.env.get("AGENDA_IMPACTOS") || "High").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
const AGENDA_AVISOS_MIN = (Deno.env.get("AGENDA_AVISOS_MIN") || "60,15").split(",").map((s) => Number(s.trim())).filter((n) => isFinite(n) && n > 0).sort((a, b) => b - a);
const AGENDA_QUARENTENA_MIN = numEnv("AGENDA_QUARENTENA_MIN", "30");
// Só entram (avisos, marca nos alertas de entrada, agenda e painel) os dados que de fato movem o mercado cripto:
// payroll, CPI, PCE, decisão de juros/comunicado/coletiva do Fed e discurso do presidente do Fed.
// Ajuste com AGENDA_TITULOS (regex, ex.: "cpi|non-farm|ppi|retail sales") ou AGENDA_TITULOS=TODOS pra liberar todos do impacto escolhido.
const AGENDA_TITULOS: RegExp | null = (() => {
  const v = (Deno.env.get("AGENDA_TITULOS") || "non-farm|\\bnfp\\b|\\bcpi\\b|\\bpce\\b|federal funds rate|fomc statement|fomc press conference|fed chair|powell").trim();
  if (/^(todos|all)$/i.test(v)) return null;
  try { return new RegExp(v, "i"); } catch { console.log("⚠️ AGENDA_TITULOS inválido — usando filtro padrão"); return /non-farm|\bnfp\b|\bcpi\b|\bpce\b|federal funds rate|fomc statement|fomc press conference|fed chair|powell/i; }
})();
const AGENDA_CACHE_V = 3; // muda quando o filtro muda: cache antigo (com outros critérios) é ignorado
const AGENDA_CACHE_MIN = numEnv("AGENDA_CACHE_MIN", "60");
const AGENDA_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";
const AGENDA_CACHE_ROW = "_AGENDA_CACHE_";
const AGENDA_AVISO_ROW = "_AGENDA_AVISO_";
// V64: resultado do dado. Depois que o dado sai, o bot busca a fonte de novo (sem o cache) e manda UMA mensagem comparando
// o valor real (actual) com a projeção. Env: AGENDA_RESULTADO=0 desliga · AGENDA_RESULTADO_APOS_MIN=3 (quando começa a checar)
//      AGENDA_RESULTADO_JAN_MIN=180 (desiste depois disso) · AGENDA_RESULTADO_POLL_MIN=4 (intervalo mínimo entre consultas à fonte)
const AGENDA_RESULTADO_ON = (Deno.env.get("AGENDA_RESULTADO") || "1") !== "0";
const AGENDA_RESULTADO_APOS_MIN = numEnv("AGENDA_RESULTADO_APOS_MIN", "3");
const AGENDA_RESULTADO_JAN_MIN = numEnv("AGENDA_RESULTADO_JAN_MIN", "180");
const AGENDA_RESULTADO_POLL_MIN = numEnv("AGENDA_RESULTADO_POLL_MIN", "4");
const AGENDA_RESULT_ROW = "_AGENDA_RESULT_";
type AgEv = { ts: number; pais: string; imp: string; titulo: string; proj: string; ant: string; atual: string };
let _agCache: { t: number; ev: AgEv[] } | null = null;
const _agEnviados = new Set<string>();
const _agResEnviados = new Set<string>();
let _agForcadoT = 0;
const agEsc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const AG_BANDEIRA: Record<string, string> = { USD: "🇺🇸", EUR: "🇪🇺", GBP: "🇬🇧", JPY: "🇯🇵", CNY: "🇨🇳", CAD: "🇨🇦", AUD: "🇦🇺", CHF: "🇨🇭", NZD: "🇳🇿" };
// Tradução dos títulos mais comuns (ordem importa: o mais específico primeiro). O que não bater fica no original.
const AG_TRAD: [RegExp, string][] = [
  [/Non-Farm Employment Change/i, "Payroll (NFP) — empregos fora do setor agrícola"],
  [/ADP Non-Farm/i, "Emprego privado ADP"],
  [/Unemployment Claims/i, "Pedidos de seguro-desemprego"],
  [/Unemployment Rate/i, "Taxa de desemprego"],
  [/Average Hourly Earnings/i, "Salário médio por hora"],
  [/JOLTS/i, "Vagas em aberto (JOLTS)"],
  [/Core CPI/i, "CPI núcleo (inflação ao consumidor)"],
  [/CPI/i, "CPI (inflação ao consumidor)"],
  [/Core PPI/i, "PPI núcleo (inflação ao produtor)"],
  [/PPI/i, "PPI (inflação ao produtor)"],
  [/Core PCE/i, "PCE núcleo (inflação preferida do Fed)"],
  [/PCE Price/i, "PCE (inflação preferida do Fed)"],
  [/Federal Funds Rate/i, "Decisão de juros do Fed"],
  [/FOMC Statement/i, "Comunicado do FOMC"],
  [/FOMC Press Conference/i, "Coletiva do FOMC"],
  [/FOMC Meeting Minutes/i, "Ata do FOMC"],
  [/FOMC Economic Projections/i, "Projeções econômicas do FOMC"],
  [/Fed Chair .*Speaks|Powell/i, "Discurso do presidente do Fed"],
  [/FOMC Member .*Speaks|Fed .*Speaks/i, "Discurso de membro do Fed"],
  [/Advance GDP|Prelim GDP|Final GDP|Second Estimate GDP|GDP/i, "PIB"],
  [/Retail Sales/i, "Vendas no varejo"],
  [/ISM Manufacturing/i, "PMI industrial (ISM)"],
  [/ISM Services/i, "PMI de serviços (ISM)"],
  [/Flash Manufacturing PMI/i, "PMI industrial (prévia)"],
  [/Flash Services PMI/i, "PMI de serviços (prévia)"],
  [/Consumer Sentiment/i, "Confiança do consumidor (Michigan)"],
  [/Durable Goods/i, "Bens duráveis"],
  [/Crude Oil Inventories/i, "Estoques de petróleo"],
  [/Treasury Currency Report/i, "Relatório cambial do Tesouro"],
  [/(10|30)-y Bond Auction/i, "Leilão de títulos do Tesouro"],
];
const agTraduzir = (t: string) => { for (const [re, pt] of AG_TRAD) if (re.test(t)) return pt; return t; };
function agInicioDia(offsetDias = 0): number {
  const tzMs = X_TZ_OFFSET_H * 3600000;
  return Math.floor((Date.now() + tzMs) / 86400000) * 86400000 - tzMs + offsetDias * 86400000;
}
function agParse(j: any): AgEv[] {
  if (!Array.isArray(j)) return [];
  const out: AgEv[] = [];
  for (const x of j) {
    const ts = new Date(String(x?.date ?? "")).getTime();
    const pais = String(x?.country ?? "").toUpperCase();
    const imp = String(x?.impact ?? "").toLowerCase();
    if (!isFinite(ts) || !AGENDA_PAISES.includes(pais) || !AGENDA_IMPACTOS.includes(imp)) continue;
    if (AGENDA_TITULOS && !AGENDA_TITULOS.test(String(x?.title ?? ""))) continue;
    out.push({ ts, pais, imp, titulo: String(x?.title ?? "").trim(), proj: String(x?.forecast ?? "").trim(), ant: String(x?.previous ?? "").trim(), atual: String(x?.actual ?? "").trim() });
  }
  return out.sort((a, b) => a.ts - b.ts);
}
// Devolve a agenda (com cache). velho=true quando a fonte falhou e estamos usando cache vencido; ev=null se não há nada.
async function buscarAgenda(SB: any, forcar = false): Promise<{ ev: AgEv[] | null; velho: boolean }> {
  const fresco = (t: number) => !forcar && Date.now() - t < AGENDA_CACHE_MIN * 60000;
  if (forcar) _agForcadoT = Date.now();
  if (_agCache && fresco(_agCache.t)) return { ev: _agCache.ev, velho: false };
  let doBanco: { t: number; ev: AgEv[] } | null = null;
  try {
    const { data } = await SB.from(TAB).select("last_status").eq("instid", AGENDA_CACHE_ROW).maybeSingle();
    const p = data?.last_status ? JSON.parse(data.last_status) : null;
    if (p && p.v === AGENDA_CACHE_V && Array.isArray(p.ev) && isFinite(p.t)) doBanco = { t: Number(p.t), ev: p.ev as AgEv[] };
  } catch { }
  if (doBanco && fresco(doBanco.t)) { _agCache = doBanco; return { ev: doBanco.ev, velho: false }; }
  try {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 8000);
    const r = await fetch(AGENDA_URL, { signal: ctl.signal, headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" } });
    clearTimeout(to);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const ev = agParse(await r.json());
    _agCache = { t: Date.now(), ev };
    await upsertLinha(SB, AGENDA_CACHE_ROW, { last_status: JSON.stringify({ v: AGENDA_CACHE_V, ..._agCache }), last_alert_at: new Date().toISOString() });
    return { ev, velho: false };
  } catch (e) {
    console.log("⚠️ agenda: fonte falhou, usando cache", e);
    // Fonte fora (ex.: 429): renova o carimbo por 10 min pra não martelar o servidor a cada rodada do cron.
    const velhoCache = _agCache ?? doBanco;
    if (velhoCache) { _agCache = { t: Date.now() - (AGENDA_CACHE_MIN - 10) * 60000, ev: velhoCache.ev }; return { ev: velhoCache.ev, velho: true }; }
    return { ev: null, velho: true };
  }
}
// Linha de "entrada de risco" pros alertas de entrada (síncrona: lê o cache que o cron já mantém).
function agRiscoLinha(): string {
  if (!AGENDA_ON || !_agCache) return "";
  const agora = Date.now(), q = AGENDA_QUARENTENA_MIN * 60000;
  const perto = _agCache.ev.filter((e) => agora >= e.ts - q && agora <= e.ts + q).sort((a, b) => Math.abs(a.ts - agora) - Math.abs(b.ts - agora))[0];
  if (!perto) return "";
  const nome = agEsc(agTraduzir(perto.titulo).split(" — ")[0]);
  const min = Math.round((perto.ts - agora) / 60000);
  return min > 0
    ? `⚠️ <b>Dado importante às ${horaLocal(perto.ts)} (${nome}) — em ${min} min.</b> Entrada de risco: o preço pode disparar e voltar.\n\n`
    : `⚠️ <b>Dado importante saiu às ${horaLocal(perto.ts)} (${nome}) há ${Math.max(0, -min)} min.</b> Mercado volátil, entrada de risco.\n\n`;
}
// Posições abertas do chat (null = sem chave da BloFin ou consulta falhou). Usado no aviso de dado e no painel.
async function agPosicoes(chat: string | number): Promise<{ lista: string[]; total: number } | null> {
  const ps = await getPosicoes(chat).catch(() => null);
  if (ps === null) return null;
  return { lista: ps.map((p) => `${p.instId.replace("-USDT", "")} ${p.lado === "long" ? "LONG" : "SHORT"} ${p.pnl >= 0 ? "➕" : "➖"}${Math.abs(p.pnl).toFixed(2)}`), total: ps.reduce((s, p) => s + p.pnl, 0) };
}
type AgGrupo = { ts: number; itens: AgEv[] };
function agAgrupar(ev: AgEv[]): AgGrupo[] {
  const m = new Map<number, AgEv[]>();
  for (const e of ev) m.set(e.ts, [...(m.get(e.ts) || []), e]);
  return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([ts, itens]) => ({ ts, itens }));
}
function agEscopoTxt(): string {
  return `${AGENDA_IMPACTOS.map((i) => i === "high" ? "alto" : i === "medium" ? "médio" : "baixo").join("/")} impacto · ${AGENDA_PAISES.join("/")}`;
}
// Bloco de texto de um dia (usado no /agenda, no resumo da manhã e no da noite).
function agBlocoDia(ev: AgEv[], offsetDias: number, rotulo: string, comAviso: boolean): string {
  const ini = agInicioDia(offsetDias), fim = ini + 86400000;
  const grupos = agAgrupar(ev.filter((e) => e.ts >= ini && e.ts < fim));
  let t = `📅 <b>Agenda econômica — ${rotulo}</b> <i>(${agEscopoTxt()})</i>\n`;
  if (!grupos.length) return t + `✅ Nenhum dado importante marcado.\n`;
  for (const g of grupos) t += `• <b>${horaLocal(g.ts)}</b> — ${g.itens.map((i) => { const r = agClassificar(i); return agEsc(agTraduzir(i.titulo)) + (r ? ` ${r.tom} saiu ${agEsc(i.atual)} (${r.sentido})` : ""); }).join(" · ")}\n`;
  if (comAviso) t += `⚠️ <i>Evite abrir operação de ~${AGENDA_QUARENTENA_MIN} min antes até ~${AGENDA_QUARENTENA_MIN} min depois desses horários: o preço dispara nos dois sentidos, o spread abre e os stops são varridos.</i>\n`;
  return t;
}
// Bloco do painel: eventos das próximas 24h. Nunca lança erro (um problema na agenda não pode derrubar o painel).
async function agBlocoProximas(SB: any): Promise<string> {
  if (!AGENDA_ON) return "";
  try {
    const { ev, velho } = await buscarAgenda(SB);
    if (!ev) return `📅 ⚠️ <b>Não consegui ler a agenda econômica</b> — confira o calendário manualmente antes de operar.\n`;
    const tzMs = X_TZ_OFFSET_H * 3600000, agora = Date.now();
    const diaDe = (ms: number) => Math.floor((ms + tzMs) / 86400000);
    const grupos = agAgrupar(ev.filter((e) => e.ts >= agora - AGENDA_QUARENTENA_MIN * 60000 && e.ts < agora + 86400000));
    let t = `📅 <b>Agenda — próximas 24h</b> <i>(${agEscopoTxt()})</i>\n`;
    if (!grupos.length) t += `✅ Nenhum dado importante marcado.\n`;
    for (const g of grupos) t += `• <b>${horaLocal(g.ts)}</b>${diaDe(g.ts) > diaDe(agora) ? " (amanhã)" : ""} — ${g.itens.map((i) => agEsc(agTraduzir(i.titulo))).join(" · ")}\n`;
    if (grupos.length) t += `⚠️ <i>Evite operar ~${AGENDA_QUARENTENA_MIN} min antes e depois desses horários.</i>\n`;
    return t + (velho ? `<i>⚠️ fonte fora do ar — dados do último cache</i>\n` : "");
  } catch (e) { console.log("⚠️ agenda (painel)", e); return ""; }
}
async function runAgenda(chatId: number | string) {
  const SB = getSupabase();
  if (!SB) { await sendTelegram(chatId, "⚠️ Supabase não configurado."); return; }
  if (!AGENDA_ON) { await sendTelegram(chatId, "📅 Agenda econômica desligada (AGENDA=0)."); return; }
  const { ev, velho } = await buscarAgenda(SB);
  if (!ev) { await sendTelegram(chatId, "⚠️ Não consegui ler a agenda econômica agora (fonte fora do ar e sem cache). Confira o calendário manualmente antes de operar."); return; }
  let msg = agBlocoDia(ev, 0, "hoje", true) + `\n` + agBlocoDia(ev, 1, "amanhã", false);
  if (velho) msg += `\n<i>⚠️ fonte fora do ar — dados do último cache, podem estar desatualizados</i>`;
  msg += `\n<i>Horários em UTC${X_TZ_OFFSET_H >= 0 ? "+" : ""}${X_TZ_OFFSET_H}. Você recebe um aviso ${AGENDA_AVISOS_MIN.join(" e ")} min antes de cada dado.</i>`;
  await enviarEmPartes(chatId, msg); // V107: em partes
}
async function checarAgenda(SB: any) {
  if (!AGENDA_ON || !AGENDA_AVISOS_MIN.length || !ALERT_CHAT_IDS.length) return;
  const { ev } = await buscarAgenda(SB);
  if (!ev || !ev.length) return;
  const agora = Date.now();
  const maxMin = AGENDA_AVISOS_MIN[0];
  const proximos = agAgrupar(ev).filter((g) => { const m = (g.ts - agora) / 60000; return m > 0 && m <= maxMin; });
  if (!proximos.length) return;
  // Chaves já enviadas (memória + Supabase, porque o cron não guarda memória entre rodadas).
  if (!_agEnviados.size) {
    try {
      const { data } = await SB.from(TAB).select("last_status").eq("instid", AGENDA_AVISO_ROW).maybeSingle();
      const arr = data?.last_status ? JSON.parse(data.last_status) : [];
      for (const k of arr) _agEnviados.add(String(k));
    } catch { }
  }
  const destinos = ALERT_CHAT_IDS.filter((c) => !silChat(c));
  if (!destinos.length) return;
  let mudou = false;
  for (const g of proximos) {
    const min = (g.ts - agora) / 60000;
    // menor nível que ainda cobre o tempo restante (se a rodada pegou em 10 min, manda o de 15 e pronto — sem o de 60)
    const nivel = [...AGENDA_AVISOS_MIN].reverse().find((l) => l >= min) ?? maxMin;
    const chave = `${g.ts}:${nivel}`;
    if (_agEnviados.has(chave)) continue;
    let msg = `📅 <b>DADO IMPORTANTE em ${Math.max(1, Math.round(min))} min</b> — ${horaLocal(g.ts)}\n${DIVISOR}\n`;
    for (const i of g.itens) {
      msg += `${AG_BANDEIRA[i.pais] || i.pais} <b>${agEsc(agTraduzir(i.titulo))}</b>\n`;
      if (i.proj || i.ant) msg += `<i>${[i.proj ? `projeção ${agEsc(i.proj)}` : "", i.ant ? `anterior ${agEsc(i.ant)}` : ""].filter(Boolean).join(" · ")}</i>\n`;
    }
    const ate = horaLocal(g.ts + AGENDA_QUARENTENA_MIN * 60000);
    msg += `\n⚠️ <b>Evite operar até ~${ate}.</b> Na hora do dado o preço dispara nos dois sentidos, o spread abre e os stops são varridos.`;
    const ids = await Promise.all(destinos.map(async (ch) => {
      const pos = await agPosicoes(ch);
      const linhaPos = pos === null ? `\n🛡️ Com posição aberta: considere reduzir ou proteger antes.`
        : pos.lista.length ? `\n🛡️ <b>Você tem ${pos.lista.length} posição(ões) aberta(s):</b> ${pos.lista.join(" · ")}\nConsidere reduzir ou proteger antes do dado.`
        : `\n✅ Você não tem posição aberta agora — é só ficar de fora até ~${ate}.`;
      return enviarAlertaMoeda(SB, ch, `AGENDA_${g.ts}`, cortar(msg + linhaPos));
    }));
    if (!ids.some((id) => !!id)) continue; // ninguém confirmou: tenta de novo na próxima rodada
    // marca este nível e os maiores como enviados (o de 60 não deve sair depois que o de 15 já saiu)
    for (const l of AGENDA_AVISOS_MIN) if (l >= nivel) _agEnviados.add(`${g.ts}:${l}`);
    mudou = true;
    console.log(`📅 aviso de agenda enviado (${chave})`);
  }
  if (mudou) {
    const limite = agora - 2 * 86400000;
    const manter = [..._agEnviados].filter((k) => Number(k.split(":")[0]) > limite);
    _agEnviados.clear(); manter.forEach((k) => _agEnviados.add(k));
    await upsertLinha(SB, AGENDA_AVISO_ROW, { last_status: JSON.stringify(manter), last_alert_at: new Date().toISOString() });
  }
}
// ─── V64: RESULTADO DO DADO (actual x projeção) ─────────────────────────────────────────────────────
// "12.5K" → 12500 · "0.3%" → 0.3 · "<0.5%" → 0.5 · "" / "—" → null. Só compara valores na mesma escala, então o fator não importa.
function agNum(s: string): number | null {
  const t = String(s ?? "").replace(/[<>≤≥~\s,]/g, "").replace("%", "");
  if (!t) return null;
  const m = t.match(/^(-?\d+(?:\.\d+)?)([kmbt])?$/i);
  if (!m) return null;
  const f: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9, t: 1e12 };
  return Number(m[1]) * (m[2] ? f[m[2].toLowerCase()] : 1);
}
type AgTipo = "inflacao" | "emprego" | "desemprego" | "salario" | "juros" | "outro";
function agTipo(titulo: string): AgTipo {
  if (/cpi|ppi|pce/i.test(titulo)) return "inflacao";
  if (/unemployment/i.test(titulo)) return "desemprego";
  if (/hourly earnings/i.test(titulo)) return "salario";
  if (/non-farm|employment change|payroll/i.test(titulo)) return "emprego";
  if (/federal funds rate/i.test(titulo)) return "juros";
  return "outro";
}
type AgRes = { sentido: "acima" | "abaixo" | "em linha"; contra: "projeção" | "anterior"; tom: "🟢" | "🔴" | "🟡" | "⚪"; leitura: string };
// Compara o valor real com a projeção (se não houver projeção, com o anterior). null = ainda sem resultado ou sem base de comparação.
function agClassificar(e: AgEv): AgRes | null {
  const a = agNum(e.atual);
  if (a === null) return null;
  const pr = agNum(e.proj), an = agNum(e.ant);
  const base = pr !== null ? pr : an;
  if (base === null) return null;
  const contra = pr !== null ? "projeção" : "anterior";
  const dif = a - base;
  const eps = Math.max(1e-9, Math.abs(base) * 1e-6);
  const sentido = Math.abs(dif) <= eps ? "em linha" : dif > 0 ? "acima" : "abaixo";
  const tipo = agTipo(e.titulo);
  if (sentido === "em linha") return { sentido, contra, tom: "⚪", leitura: "dentro do esperado — sem surpresa, a reação costuma ser fraca." };
  const acima = sentido === "acima";
  switch (tipo) {
    case "inflacao":
      return acima
        ? { sentido, contra, tom: "🔴", leitura: "inflação mais quente que o esperado → juros altos por mais tempo, tende a pesar em cripto." }
        : { sentido, contra, tom: "🟢", leitura: "inflação mais fria que o esperado → alivia a pressão por juros, tende a ajudar cripto." };
    case "juros":
      return acima
        ? { sentido, contra, tom: "🔴", leitura: "juros mais altos que o esperado → postura mais dura do Fed, tende a pesar." }
        : { sentido, contra, tom: "🟢", leitura: "juros mais baixos que o esperado → postura mais leve do Fed, tende a ajudar." };
    case "desemprego":
      return acima
        ? { sentido, contra, tom: "🟡", leitura: "desemprego maior → mercado de trabalho mais fraco: aumenta a aposta em cortes de juros, mas também o medo de recessão. Leitura mista." }
        : { sentido, contra, tom: "🟡", leitura: "desemprego menor → mercado de trabalho forte: reduz a aposta em cortes de juros. Leitura mista." };
    case "emprego":
    case "salario":
      return acima
        ? { sentido, contra, tom: "🟡", leitura: "economia/trabalho mais forte que o esperado → pode adiar cortes de juros, mas mostra saúde econômica. Leitura mista." }
        : { sentido, contra, tom: "🟡", leitura: "mais fraco que o esperado → aumenta a aposta em cortes de juros, mas também o medo de recessão. Leitura mista." };
    default:
      return { sentido, contra, tom: "🟡", leitura: `veio ${sentido} do esperado — a leitura para cripto depende do contexto.` };
  }
}
// Quais itens do grupo têm número a comparar (discursos, por exemplo, nunca têm actual).
const agEsperaResultado = (e: AgEv) => !!(e.proj || e.ant);
function agLinhaResultado(e: AgEv, r: AgRes): string {
  const cmp = r.contra === "projeção" ? `esperado ${agEsc(e.proj)}` : `anterior ${agEsc(e.ant)}`;
  return `${r.tom} <b>${agEsc(agTraduzir(e.titulo))}</b>: saiu <b>${agEsc(e.atual)}</b> (${cmp}) → <b>${r.sentido} do esperado</b>${r.contra === "anterior" ? " (sem projeção: comparado ao anterior)" : ""}\n<i>${r.leitura}</i>\n`;
}
async function checarResultadoAgenda(SB: any) {
  if (!AGENDA_ON || !AGENDA_RESULTADO_ON || !ALERT_CHAT_IDS.length) return;
  const agora = Date.now();
  const ini = AGENDA_RESULTADO_APOS_MIN * 60000, jan = AGENDA_RESULTADO_JAN_MIN * 60000;
  // Usa o cache (sem custo) só pra saber se há algum dado esperando resultado; a consulta fresca só acontece se houver.
  const { ev: evCache } = await buscarAgenda(SB);
  if (!evCache || !evCache.length) return;
  if (!_agResEnviados.size) {
    try {
      const { data } = await SB.from(TAB).select("last_status").eq("instid", AGENDA_RESULT_ROW).maybeSingle();
      const arr = data?.last_status ? JSON.parse(data.last_status) : [];
      for (const k of arr) _agResEnviados.add(String(k));
    } catch { }
  }
  const pendente = (ev: AgEv[]) => agAgrupar(ev.filter(agEsperaResultado)).filter((g) => {
    const d = agora - g.ts;
    return d >= ini && d <= jan && !_agResEnviados.has(String(g.ts));
  });
  if (!pendente(evCache).length) return;
  // Não martela a fonte (429): no máximo uma consulta fresca a cada AGENDA_RESULTADO_POLL_MIN min. O carimbo fica na memória;
  // como o cron reinicia a function de vez em quando, o pior caso é uma consulta a mais — a fonte tolera.
  if (agora - _agForcadoT < AGENDA_RESULTADO_POLL_MIN * 60000) return;
  const { ev, velho } = await buscarAgenda(SB, true);
  if (!ev || velho) return; // fonte fora: tenta de novo na próxima janela de consulta
  const destinos = ALERT_CHAT_IDS.filter((c) => !silChat(c));
  if (!destinos.length) return;
  let mudou = false;
  for (const g of pendente(ev)) {
    const esperados = g.itens.filter(agEsperaResultado);
    const prontos = esperados.filter((i) => agClassificar(i) !== null);
    if (!prontos.length) continue;
    // espera todos do horário chegarem (ex.: CPI e CPI núcleo saem juntos); passou de 20 min, manda o que já tem
    if (prontos.length < esperados.length && agora - g.ts < 20 * 60000) continue;
    let msg = `📊 <b>RESULTADO DO DADO</b> — ${horaLocal(g.ts)}\n${DIVISOR}\n`;
    for (const i of prontos) msg += `${AG_BANDEIRA[i.pais] || i.pais} ${agLinhaResultado(i, agClassificar(i)!)}\n`;
    const sem = esperados.length - prontos.length;
    if (sem > 0) msg += `<i>+${sem} item(ns) do mesmo horário ainda sem resultado na fonte.</i>\n\n`;
    msg += `⚠️ <i>A 1ª reação do preço costuma ser exagerada e reverter. Espere a vela pós-dado fechar antes de confiar em cruzamento novo. Estatístico, não é recomendação.</i>`;
    const ids = await Promise.all(destinos.map((ch) => enviarAlertaMoeda(SB, ch, `AGENDA_RES_${g.ts}`, cortar(msg))));
    if (!ids.some((id) => !!id)) continue; // ninguém confirmou: tenta de novo na próxima consulta
    _agResEnviados.add(String(g.ts));
    mudou = true;
    console.log(`📊 resultado de agenda enviado (${g.ts})`);
  }
  if (mudou) {
    const limite = agora - 2 * 86400000;
    const manter = [..._agResEnviados].filter((k) => Number(k) > limite);
    _agResEnviados.clear(); manter.forEach((k) => _agResEnviados.add(k));
    await upsertLinha(SB, AGENDA_RESULT_ROW, { last_status: JSON.stringify(manter), last_alert_at: new Date().toISOString() });
  }
}
// Linha "inteligente" do /estudo: olha a agenda agora e diz se o item 7 pesa ou não. Nunca lança erro.
async function agEstudoBloco(SB: any): Promise<string> {
  if (!AGENDA_ON || !SB) return "";
  try {
    const { ev } = await buscarAgenda(SB);
    if (!ev) return `📅 <b>Agora:</b> ⚠️ não consegui ler a agenda — confira o calendário manualmente.\n`;
    const agora = Date.now(), q = AGENDA_QUARENTENA_MIN * 60000, jan = AGENDA_RESULTADO_JAN_MIN * 60000;
    const grupos = agAgrupar(ev.filter((e) => e.ts >= agora - jan && e.ts <= agora + 6 * 3600000));
    if (!grupos.length) return `📅 <b>Agora:</b> ✅ nenhum dado importante nas próximas 6h nem nas últimas ${Math.round(AGENDA_RESULTADO_JAN_MIN / 60)}h — este ponto não pesa agora.\n`;
    let t = "";
    for (const g of grupos) {
      const nome = g.itens.map((i) => agEsc(agTraduzir(i.titulo).split(" — ")[0])).join(" · ");
      const min = Math.round((g.ts - agora) / 60000);
      if (min > 0) { t += `📅 <b>Agora:</b> ⏳ ${nome} às ${horaLocal(g.ts)} (em ${min} min). ${g.ts - agora <= q ? "Você está na quarentena: NÃO ligue o robô agora." : "Espere passar antes de ligar o robô."}\n`; continue; }
      const dentro = agora - g.ts <= q;
      const cls = g.itens.map((i) => ({ i, r: agClassificar(i) })).filter((x) => x.r);
      if (cls.length) {
        t += `📅 <b>Agora:</b> ${nome} já saiu (${horaLocal(g.ts)}):\n`;
        for (const { i, r } of cls) t += `  ${r!.tom} ${agEsc(agTraduzir(i.titulo).split(" — ")[0])}: ${agEsc(i.atual)} vs ${r!.contra === "projeção" ? agEsc(i.proj) : agEsc(i.ant)} → ${r!.sentido}\n`;
        t += dentro ? `  Ainda dentro da quarentena de ${AGENDA_QUARENTENA_MIN} min: cruzamentos agora podem ser só a reação ao dado.\n` : `  Já passou da quarentena: o cruzamento vale mais se vier depois da vela pós-dado fechar.\n`;
      } else if (g.itens.some(agEsperaResultado)) {
        t += `📅 <b>Agora:</b> ${nome} saiu às ${horaLocal(g.ts)}, mas a fonte ainda não trouxe o resultado.${dentro ? " Segue em quarentena." : ""}\n`;
      }
    }
    return t;
  } catch (e) { console.log("⚠️ agenda (estudo)", e); return ""; }
}
// ─── V69: NOTÍCIAS (/noticia) ──────────────────────────────────────────────────────────────────────
// Além dos dados da agenda: falas do Trump e manchetes de cripto/macro que mexem com o mercado. Fontes (RSS, grátis, sem chave):
//  • Trump: espelho público do Truth Social (trumpstruth.org/feed) — não é oficial, pode atrasar uns minutos ou sair do ar
//  • cripto/macro: CoinDesk e Cointelegraph
// Filtro por palavra-chave (pode deixar passar algo ou pegar post sem importância): 🔴 = palavra de alto impacto, 🟡 = só relevante.
// Env: NOTICIAS=0 desliga · NOTICIAS_FEEDS="Nome|url|tipo;Nome|url|tipo" (tipo: trump ou cripto) · NOTICIAS_CACHE_MIN=5
//      NOTICIAS_JANELA_H=12 (padrão do /noticia) · NOTICIAS_PAINEL_H=6 · NOTICIAS_TRADUZIR=0 desliga a tradução (usa o Gemini)
//      NOTICIAS_ALERTA=0 desliga o aviso automático · NOTICIAS_ALERTA_TIPOS=trump,cripto · NOTICIAS_ALERTA_MAX_MIN=30 (idade máxima do post) · NOTICIAS_ALERTA_MAX_HORA=3 (Trump) · NOTICIAS_ALERTA_MAX_HORA_CRIPTO=2
//      NOTICIAS_PALAVRAS / NOTICIAS_FORTE (regex, posts do Trump) · NOTICIAS_PALAVRAS_CRIPTO / NOTICIAS_FORTE_CRIPTO (regex, manchetes de cripto)
const NOTICIAS_ON = (Deno.env.get("NOTICIAS") || "1") !== "0";
type NtTipo = "trump" | "cripto";
type NtFeed = { nome: string; url: string; tipo: NtTipo };
type NtItem = { id: string; ts: number; fonte: string; tipo: NtTipo; texto: string; link: string; forte: boolean; pt?: string }; // pt = tradução PT-BR (Gemini), guardada no cache
const NT_FEEDS_PADRAO = "Trump (Truth Social)|https://trumpstruth.org/feed|trump;CoinDesk|https://www.coindesk.com/arc/outboundfeeds/rss/|cripto;Cointelegraph|https://cointelegraph.com/rss|cripto";
const NT_FEEDS: NtFeed[] = (Deno.env.get("NOTICIAS_FEEDS") || NT_FEEDS_PADRAO).split(";").map((s) => s.trim()).filter(Boolean).map((s) => {
  const [nome, url, tipo] = s.split("|").map((x) => x.trim());
  return { nome: nome || "", url: url || "", tipo: (tipo || "cripto").toLowerCase() === "trump" ? "trump" : "cripto" } as NtFeed;
}).filter((f) => f.nome && /^https?:\/\//i.test(f.url));
const ntRegex = (env: string, padrao: string): RegExp => {
  const v = (Deno.env.get(env) || padrao).trim();
  try { return new RegExp(v, "i"); } catch { console.log(`⚠️ ${env} inválido — usando o padrão`); return new RegExp(padrao, "i"); }
};
const NT_REL_TRUMP = ntRegex("NOTICIAS_PALAVRAS", "\\b(tariffs?|trade (war|deal|deals)|china|chinese|fed|federal reserve|powell|interest rates?|rate (cut|cuts|hike|hikes)|inflation|recession|dollar|treasury|bessent|bitcoin|btc|crypto\\w*|stablecoins?|strategic (bitcoin )?reserve|digital assets?|sanctions?|iran|russia|ukraine|israel|gaza|war|oil|opec|taxes|tax cuts?|shutdown|debt ceiling|default|stock market|sec|cftc|etfs?|ban|banned|hack(ed)?|binance|tether|coinbase|blackrock)\\b");
const NT_FORTE_TRUMP = ntRegex("NOTICIAS_FORTE", "\\b(tariffs?|trade (war|deal|deals)|fed|federal reserve|powell|interest rates?|rate (cut|cuts|hike|hikes)|bitcoin|btc|crypto\\w*|stablecoins?|strategic (bitcoin )?reserve|digital assets?|sanctions?|iran|war|shutdown|default|sec|cftc|etfs?)\\b");
const NT_REL_CRIPTO = ntRegex("NOTICIAS_PALAVRAS_CRIPTO", "\\b(trump|fed|federal reserve|powell|tariffs?|sec|cftc|etfs?|hack(ed|s)?|exploit(ed|s)?|liquidat\\w*|ban(s|ned)?|sanctions?|regulat\\w*|lawsuit|bankrupt\\w*|strategic (bitcoin )?reserve|treasury|stablecoins?|tether|binance|coinbase|blackrock|crash(es|ed)?|plunge[sd]?|rate cuts?|rate hikes?|inflation|jobs report|cpi)\\b");
const NT_FORTE_CRIPTO = ntRegex("NOTICIAS_FORTE_CRIPTO", "\\b(trump|fed|federal reserve|powell|tariffs?|sec|cftc|etfs?|hack(ed|s)?|exploit(ed|s)?|ban(s|ned)?|sanctions?|bankrupt\\w*|lawsuit|strategic (bitcoin )?reserve|crash(es|ed)?|plunge[sd]?|liquidat\\w*)\\b");
const NOTICIAS_CACHE_MIN = numEnv("NOTICIAS_CACHE_MIN", "5");
const NOTICIAS_JANELA_H = numEnv("NOTICIAS_JANELA_H", "12");
const NOTICIAS_PAINEL_H = numEnv("NOTICIAS_PAINEL_H", "6");
const NOTICIAS_TRADUZIR_ON = (Deno.env.get("NOTICIAS_TRADUZIR") || "1") !== "0";
const NT_TRAD_LOTE = numEnv("NOTICIAS_TRAD_LOTE", "15"); // V70: máx. de manchetes traduzidas por chamada do Gemini
const NT_SEM_PT = "🌐 tradução indisponível agora — toque em \"ver original\"."; // V70: nunca mostra o texto em inglês
const NOTICIAS_ALERTA_ON = (Deno.env.get("NOTICIAS_ALERTA") || "1") !== "0";
const NT_ALERTA_TIPOS = (Deno.env.get("NOTICIAS_ALERTA_TIPOS") || "trump,cripto").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
const NOTICIAS_ALERTA_MAX_MIN = numEnv("NOTICIAS_ALERTA_MAX_MIN", "30");
const NOTICIAS_ALERTA_MAX_HORA = numEnv("NOTICIAS_ALERTA_MAX_HORA", "3");
const NOTICIAS_ALERTA_MAX_HORA_CRIPTO = numEnv("NOTICIAS_ALERTA_MAX_HORA_CRIPTO", "2"); // limite próprio: manchete de cripto nunca come a vaga de um post do Trump
const NT_CACHE_ROW = "_NOTICIAS_CACHE_";
const NT_AVISO_ROW = "_NOTICIAS_AVISO_";
const NT_CACHE_V = 1;
// Tira CDATA, HTML e entidades de um trecho de RSS e devolve texto simples numa linha só.
function ntLimpar(s: string): string {
  return String(s ?? "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/<br\s*\/?>|<\/p>|<\/div>/gi, " ")
    .replace(/<\/?[a-z][a-z0-9]*\b[^<>]*>/gi, "")
    .replace(/&nbsp;/g, " ").replace(/&quot;/g, "\"").replace(/&#0*39;|&apos;|&#x27;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_m, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return ""; } })
    .replace(/&#(\d+);/g, (_m, n) => { try { return String.fromCodePoint(Number(n)); } catch { return ""; } })
    .replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}
function ntTag(x: string, nome: string): string {
  const n = nome.replace(/[:.]/g, "\\$&");
  const m = x.match(new RegExp(`<${n}\\b[^>]*>([\\s\\S]*?)</${n}>`, "i"));
  return m ? m[1] : "";
}
const ntCortar = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
// ─── Duplicatas entre fontes (a mesma manchete no CoinDesk e no Cointelegraph) ───────────────────────
// Compara as palavras de conteúdo dos títulos (sem acento, sem palavras comuns, plural simplificado). Parecido = pelo menos 3 palavras
// em comum e (Jaccard ≥ 0.5 ou 70% do título mais curto). Só vale entre manchetes de CRIPTO: post do Trump nunca é fundido.
const NT_STOP = new Set("the and for with from that this into over after amid about than more says said will could would may might its are was were has have had not but you your their there here how why what who when where also new now just out off per via report reports reported".split(" "));
function ntTokens(texto: string): string[] {
  const t = String(texto ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9$%. ]+/g, " ").replace(/\.(?=\s|$)/g, " ");
  const out = new Set<string>();
  for (let w of t.split(/\s+/)) {
    if (w.length < 3 || NT_STOP.has(w)) continue;
    if (w.length > 4 && w.endsWith("s")) w = w.slice(0, -1);
    out.add(w);
  }
  return [...out];
}
function ntParecido(a: string[], b: string[]): boolean {
  if (!a.length || !b.length) return false;
  const sb = new Set(b);
  let inter = 0;
  for (const w of a) if (sb.has(w)) inter++;
  if (inter < 3) return false;
  return inter / (a.length + b.length - inter) >= 0.5 || inter / Math.min(a.length, b.length) >= 0.7;
}
// Mantém a manchete mais antiga de cada grupo de cripto parecido (a original); o resto passa direto.
function ntSemDuplicatas(itens: NtItem[]): NtItem[] {
  const asc = [...itens].sort((a, b) => a.ts - b.ts);
  const mantidos: { it: NtItem; tok: string[] }[] = [];
  const saida: NtItem[] = [];
  for (const it of asc) {
    if (it.tipo !== "cripto") { saida.push(it); continue; }
    const tok = ntTokens(it.texto);
    if (mantidos.some((m) => ntParecido(m.tok, tok))) continue;
    mantidos.push({ it, tok });
    saida.push(it);
  }
  return saida;
}
function ntQuando(ts: number): string {
  const tzMs = X_TZ_OFFSET_H * 3600000, dia = (ms: number) => Math.floor((ms + tzMs) / 86400000);
  if (dia(ts) === dia(Date.now())) return horaLocal(ts);
  const iso = new Date(ts + tzMs).toISOString();
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)} ${horaLocal(ts)}`;
}
function ntParse(xml: string, f: NtFeed): NtItem[] {
  const out: NtItem[] = [];
  const rel = f.tipo === "trump" ? NT_REL_TRUMP : NT_REL_CRIPTO, forte = f.tipo === "trump" ? NT_FORTE_TRUMP : NT_FORTE_CRIPTO;
  for (const m of xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)) {
    const x = m[0];
    const titulo = ntLimpar(ntTag(x, "title")), desc = ntLimpar(ntTag(x, "description"));
    const ts = new Date(ntLimpar(ntTag(x, "pubDate"))).getTime();
    if (!isFinite(ts)) continue;
    const orig = ntLimpar(ntTag(x, "truth:originalUrl"));
    const lk = orig || ntLimpar(ntTag(x, "link")) || ntLimpar(ntTag(x, "guid"));
    const link = /^https?:\/\//i.test(lk) ? lk : "";
    const texto = f.tipo === "trump" ? (desc || titulo) : (titulo || desc);
    if (!texto) continue;
    const base = `${titulo} ${desc}`;
    if (!rel.test(base)) continue;
    out.push({ id: link || `${f.nome}_${ts}`, ts, fonte: f.nome, tipo: f.tipo, texto, link, forte: forte.test(base) });
  }
  return out;
}
async function ntBaixar(f: NtFeed): Promise<NtItem[]> {
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(f.url, { signal: ctl.signal, headers: { "User-Agent": "Mozilla/5.0 (compatible; telegram-bot)", "Accept": "application/rss+xml, application/xml, text/xml, */*" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return ntParse(await r.text(), f);
  } finally { clearTimeout(to); }
}
type NtCache = { t: number; itens: NtItem[]; falhas: string[] };
let _ntCache: NtCache | null = null;
// Devolve as notícias (com cache de memória + Supabase). velho=true quando todas as fontes falharam e estamos usando cache vencido; itens=null se não há nada.
async function buscarNoticias(SB: any): Promise<{ itens: NtItem[] | null; velho: boolean; falhas: string[] }> {
  const fresco = (t: number) => Date.now() - t < NOTICIAS_CACHE_MIN * 60000;
  if (_ntCache && fresco(_ntCache.t)) return { itens: _ntCache.itens, velho: false, falhas: _ntCache.falhas };
  let doBanco: NtCache | null = null;
  try {
    const { data } = await SB.from(TAB).select("last_status").eq("instid", NT_CACHE_ROW).maybeSingle();
    const p = data?.last_status ? JSON.parse(data.last_status) : null;
    if (p && p.v === NT_CACHE_V && Array.isArray(p.itens) && isFinite(p.t)) doBanco = { t: Number(p.t), itens: p.itens as NtItem[], falhas: Array.isArray(p.falhas) ? p.falhas : [] };
  } catch { }
  if (doBanco && fresco(doBanco.t)) { _ntCache = doBanco; return { itens: doBanco.itens, velho: false, falhas: doBanco.falhas }; }
  const anterior = _ntCache ?? doBanco;
  const res = await Promise.allSettled(NT_FEEDS.map((f) => ntBaixar(f)));
  const falhas: string[] = [];
  let todos: NtItem[] = [];
  let ok = 0;
  res.forEach((r, i) => {
    if (r.status === "fulfilled") { ok++; todos = todos.concat(r.value); }
    else { falhas.push(NT_FEEDS[i].nome); console.log(`⚠️ notícias: ${NT_FEEDS[i].nome} falhou`, r.reason); }
  });
  if (ok === 0) {
    if (anterior) { _ntCache = { t: Date.now() - (NOTICIAS_CACHE_MIN - 2) * 60000, itens: anterior.itens, falhas }; return { itens: anterior.itens, velho: true, falhas }; }
    return { itens: null, velho: true, falhas };
  }
  if (anterior && falhas.length) todos = todos.concat(anterior.itens.filter((i) => falhas.includes(i.fonte)));
  const limite = Date.now() - 72 * 3600000;
  const vistos = new Set<string>();
  const itens = ntSemDuplicatas(todos.filter((i) => i.ts >= limite && !vistos.has(i.id) && vistos.add(i.id))).sort((a, b) => b.ts - a.ts).slice(0, 80);
  // V70: a tradução já traduzida não se refaz (vem do cache anterior) e as manchetes de alto impacto do painel/aviso são traduzidas aqui, uma vez só
  const ptPorId = new Map<string, string>();
  for (const src of [doBanco, _ntCache]) src?.itens.forEach((i) => { if (i.pt) ptPorId.set(i.id, i.pt); });
  itens.forEach((i) => { const t = ptPorId.get(i.id); if (t) i.pt = t; });
  await ntTraduzirFaltantes(SB, itens.filter((i) => i.forte && i.ts >= Date.now() - NOTICIAS_PAINEL_H * 3600000));
  _ntCache = { t: Date.now(), itens, falhas };
  try { await upsertLinha(SB, NT_CACHE_ROW, { last_status: JSON.stringify({ v: NT_CACHE_V, ..._ntCache }), last_alert_at: new Date().toISOString() }); } catch (e) { console.log("⚠️ notícias: não salvei o cache", e); }
  return { itens, velho: false, falhas };
}
// V70: tradução pelo Gemini para o português do Brasil. Traduz só quem ainda não tem `pt` (até NT_TRAD_LOTE por chamada), grava o resultado
// no próprio item (e, via ntSalvarCache, no cache do Supabase) e devolve quantas traduziu. Respeita o limite diário de IA; se falhar, o item
// fica sem `pt` e as telas mostram NT_SEM_PT em vez do texto em inglês.
async function ntTraduzirFaltantes(SB: any, itens: NtItem[]): Promise<number> {
  if (!NOTICIAS_TRADUZIR_ON || !Deno.env.get("GEMINI_API_KEY")) return 0;
  const falta = itens.filter((i) => !i.pt).slice(0, Math.max(1, NT_TRAD_LOTE));
  if (!falta.length) return 0;
  try {
    if (IA_LIMITE_DIARIO_GEMINI > 0 && (await iaUsoHoje(SB, "gemini")) >= IA_LIMITE_DIARIO_GEMINI) return 0;
    const sistema = "Você traduz manchetes e posts do inglês para o português do Brasil (pt-BR), de forma fiel e curta, sem comentar. Mantenha nomes próprios, siglas e tickers (BTC, SEC, CFTC...). Responda só com as traduções, uma por linha, no formato \"N. tradução\", mantendo a numeração. Se um texto já estiver em português, repita-o como está. Nunca responda em inglês.";
    const usuario = falta.map((it, i) => `${i + 1}. ${ntCortar(it.texto, 450)}`).join("\n");
    const resp = await Promise.race([chamarGemini(sistema, usuario), new Promise<null>((r) => setTimeout(() => r(null), 20000))]);
    if (!resp) return 0;
    await iaRegistrarUso(SB, "gemini");
    let n = 0;
    for (const linha of resp.split("\n")) {
      const m = linha.match(/^\s*(\d+)[.)]\s*(.+)$/);
      if (!m) continue;
      const i = Number(m[1]) - 1, t = m[2].trim();
      if (i >= 0 && i < falta.length && t) { falta[i].pt = t; n++; }
    }
    return n;
  } catch (e) { console.log("⚠️ notícias: tradução falhou", e); return 0; }
}
// grava o cache atual (com as traduções novas) pra outra execução do cron não traduzir de novo
async function ntSalvarCache(SB: any) {
  if (!_ntCache) return;
  try { await upsertLinha(SB, NT_CACHE_ROW, { last_status: JSON.stringify({ v: NT_CACHE_V, ..._ntCache }), last_alert_at: new Date().toISOString() }); } catch (e) { console.log("⚠️ notícias: não salvei o cache", e); }
}
const ntPt = (it: NtItem) => it.pt ?? NT_SEM_PT;
// /noticia [trump|cripto] [horas]
async function runNoticia(chatId: number | string, arg: string) {
  const SB = getSupabase();
  if (!SB) { await sendTelegram(chatId, "⚠️ Supabase não configurado."); return; }
  if (!NOTICIAS_ON) { await sendTelegram(chatId, "📰 Notícias desligadas (NOTICIAS=0)."); return; }
  let horas = NOTICIAS_JANELA_H, tipo: "" | NtTipo = "";
  for (const t of arg.toLowerCase().split(/\s+/).filter(Boolean)) {
    const n = Number(t.replace(/h$/, ""));
    if (t === "trump") tipo = "trump";
    else if (t === "cripto" || t === "crypto") tipo = "cripto";
    else if (isFinite(n) && n > 0) horas = Math.min(72, Math.max(1, Math.round(n)));
  }
  const { itens, velho, falhas } = await buscarNoticias(SB);
  if (!itens) { await sendTelegram(chatId, "⚠️ Não consegui ler as fontes de notícias agora. Confira Trump, Fed e cripto manualmente antes de operar."); return; }
  const lim = Date.now() - horas * 3600000;
  const lista = itens.filter((i) => i.ts >= lim && (!tipo || i.tipo === tipo)).sort((a, b) => Number(b.forte) - Number(a.forte) || b.ts - a.ts).slice(0, 8);
  let msg = `📰 <b>NOTÍCIAS QUE MEXEM COM O MERCADO</b>\n<i>últimas ${horas}h${tipo === "trump" ? " · só Trump" : tipo === "cripto" ? " · só cripto/macro" : ""}</i>\n${DIVISOR}\n\n`;
  if (!lista.length) msg += `✅ Nenhuma notícia relevante nesse período.\n<i>Tente /noticia 24 para ampliar a janela.</i>\n`;
  if ((await ntTraduzirFaltantes(SB, lista)) > 0) await ntSalvarCache(SB);
  lista.forEach((it) => {
    const txt = ntCortar(ntPt(it), it.tipo === "trump" ? 380 : 280);
    msg += `${it.forte ? "🔴" : "🟡"} <b>${ntQuando(it.ts)}</b> · ${agEsc(it.fonte)}\n${it.tipo === "trump" && it.pt ? `“${agEsc(txt)}”` : agEsc(txt)}\n${it.link ? `<a href="${agEsc(it.link)}">ver original</a>\n` : ""}\n`;
  });
  if (lista.length) msg += `<i>🔴 = palavra de alto impacto (tarifa, Fed/juros, cripto, sanções, guerra...) · 🟡 = relevante.${lista.some((it) => it.pt) ? " Tradução automática: o link leva ao original." : ""}</i>\n`;
  msg += `<i>O filtro é por palavra-chave: pode deixar passar algo ou mostrar post sem importância. Posts podem ser apagados ou desmentidos, e a 1ª reação do preço costuma reverter. Não é recomendação.</i>`;
  if (falhas.length) msg += `\n<i>⚠️ fonte(s) fora do ar agora: ${agEsc(falhas.join(", "))}${velho ? " — mostrando o último cache" : ""}</i>`;
  await enviarEmPartes(chatId, msg); // V107: em partes
}
// Bloco do painel: notícias de alto impacto das últimas NOTICIAS_PAINEL_H horas. Nunca lança erro.
async function ntBlocoPainel(SB: any): Promise<string> {
  if (!NOTICIAS_ON) return "";
  try {
    const { itens, velho } = await buscarNoticias(SB);
    if (!itens) return `📰 ⚠️ <b>Não consegui ler as notícias</b> — confira Trump, Fed e cripto manualmente antes de operar.\n`;
    const lim = Date.now() - NOTICIAS_PAINEL_H * 3600000;
    const fortes = itens.filter((i) => i.forte && i.ts >= lim).sort((a, b) => b.ts - a.ts).slice(0, 3);
    if ((await ntTraduzirFaltantes(SB, fortes)) > 0) await ntSalvarCache(SB);
    let t = `📰 <b>Notícias — últimas ${NOTICIAS_PAINEL_H}h</b>\n`;
    if (!fortes.length) t += `✅ Nada de alto impacto. <i>(/noticia mostra o resto)</i>\n`;
    for (const i of fortes) t += `• <b>${ntQuando(i.ts)}</b> ${agEsc(i.fonte.split(" (")[0])}: ${agEsc(ntCortar(ntPt(i), 110))}\n`;
    return t + (velho ? `<i>⚠️ fontes fora do ar — dados do último cache</i>\n` : "");
  } catch (e) { console.log("⚠️ notícias (painel)", e); return ""; }
}
// Aviso automático: post de alto impacto recente (tipos em NOTICIAS_ALERTA_TIPOS, padrão Trump e cripto). Limite por hora separado: Trump 3, cripto 2.
let _ntEnvCarregado = false;
const _ntEnviados = new Set<string>();
let _ntEnvios: number[] = [];
let _ntEnviosCripto: number[] = [];
let _ntSigs: { t: number; k: string[] }[] = []; // palavras das manchetes de cripto já avisadas (48h): barra a mesma notícia vinda de outra fonte em outra rodada
async function checarNoticias(SB: any) {
  if (!NOTICIAS_ON || !NOTICIAS_ALERTA_ON || !ALERT_CHAT_IDS.length) return;
  const { itens } = await buscarNoticias(SB);
  if (!itens || !itens.length) return;
  const agora = Date.now();
  const novos = itens.filter((i) => i.forte && NT_ALERTA_TIPOS.includes(i.tipo) && agora - i.ts <= NOTICIAS_ALERTA_MAX_MIN * 60000 && i.ts - agora <= 5 * 60000).sort((a, b) => Number(b.tipo === "trump") - Number(a.tipo === "trump") || a.ts - b.ts); // Trump primeiro
  if (!novos.length) return;
  if (!_ntEnvCarregado) {
    const { data, error } = await SB.from(TAB).select("last_status").eq("instid", NT_AVISO_ROW).maybeSingle();
    if (error) return; // sem saber o que já foi avisado, não arrisca repetir
    try {
      const p = data?.last_status ? JSON.parse(data.last_status) : null;
      for (const k of Array.isArray(p?.ids) ? p.ids : []) _ntEnviados.add(String(k));
      _ntEnvios = Array.isArray(p?.envios) ? p.envios.map(Number).filter((n: number) => isFinite(n)) : [];
      _ntEnviosCripto = Array.isArray(p?.enviosCripto) ? p.enviosCripto.map(Number).filter((n: number) => isFinite(n)) : [];
      _ntSigs = Array.isArray(p?.sigs) ? p.sigs.filter((x: any) => x && isFinite(x.t) && Array.isArray(x.k)).map((x: any) => ({ t: Number(x.t), k: x.k.map(String) })) : [];
    } catch { }
    _ntEnvCarregado = true;
  }
  const destinos = ALERT_CHAT_IDS.filter((c) => !silChat(c));
  if (!destinos.length) return;
  if ((await ntTraduzirFaltantes(SB, novos.filter((i) => !_ntEnviados.has(i.id)))) > 0) await ntSalvarCache(SB);
  let mudou = false;
  for (const it of novos) {
    if (_ntEnviados.has(it.id)) continue;
    // V70: sem tradução ainda: espera até 6 min (3 rodadas); depois avisa mesmo assim, sem o texto em inglês
    if (!it.pt && NOTICIAS_TRADUZIR_ON && Deno.env.get("GEMINI_API_KEY") && agora - it.ts < 6 * 60000) continue;
    const tok = it.tipo === "cripto" ? ntTokens(it.texto) : [];
    if (tok.length && _ntSigs.some((x) => agora - x.t < 48 * 3600000 && ntParecido(x.k, tok))) { _ntEnviados.add(it.id); mudou = true; continue; } // mesma notícia de outra fonte: já avisei
    const lista = it.tipo === "cripto" ? _ntEnviosCripto : _ntEnvios, lim = it.tipo === "cripto" ? NOTICIAS_ALERTA_MAX_HORA_CRIPTO : NOTICIAS_ALERTA_MAX_HORA;
    if (lista.filter((t) => agora - t < 3600000).length >= lim) continue;
    const msg = `📰 <b>NOTÍCIA — ${agEsc(it.fonte)}</b> · ${horaLocal(it.ts)}\n${DIVISOR}\n\n${it.tipo === "trump" && it.pt ? `“${agEsc(ntCortar(ntPt(it), 500))}”` : `<b>${agEsc(ntCortar(ntPt(it), 500))}</b>`}\n\n${it.link ? `<a href="${agEsc(it.link)}">ver original</a>\n\n` : ""}⚠️ <i>Palavra de alto impacto (tarifa, juros/Fed, cripto, sanções, guerra...). A 1ª reação do preço costuma ser exagerada e pode reverter: espere a vela fechar antes de confiar em cruzamento novo. Pode ser apagado ou desmentido depois. /noticia mostra as outras.</i>`;
    const ids = await Promise.all(destinos.map((ch) => enviarAlertaMoeda(SB, ch, `NOTICIA_${it.ts}`, cortar(msg))));
    if (!ids.some((id) => !!id)) continue; // ninguém confirmou: tenta de novo na próxima rodada
    _ntEnviados.add(it.id);
    lista.push(agora);
    if (tok.length) _ntSigs.push({ t: agora, k: tok });
    mudou = true;
    console.log(`📰 aviso de notícia enviado (${it.fonte} ${it.ts})`);
  }
  if (mudou) {
    const ids = [..._ntEnviados].slice(-200);
    _ntEnviados.clear(); ids.forEach((k) => _ntEnviados.add(k));
    _ntEnvios = _ntEnvios.filter((t) => agora - t < 24 * 3600000);
    _ntEnviosCripto = _ntEnviosCripto.filter((t) => agora - t < 24 * 3600000);
    _ntSigs = _ntSigs.filter((x) => agora - x.t < 48 * 3600000).slice(-60);
    await upsertLinha(SB, NT_AVISO_ROW, { last_status: JSON.stringify({ ids, envios: _ntEnvios, enviosCripto: _ntEnviosCripto, sigs: _ntSigs }), last_alert_at: new Date().toISOString() });
  }
}
// Seção do painel: título + conteúdo (some se o conteúdo vier vazio) e uma linha em branco depois.
const painelSec = (t: string, c: string): string => (c.trim() ? `<b>── ${t} ──</b>\n${c.replace(/\n+$/, "")}\n\n` : "");
// ─── V55: PAINEL DO DIA (substitui os resumos soltos) ────────────────────────────────────────────────
// UMA mensagem por ciclo de 24h (das RESUMO_NOITE_H — padrão 21h — até as 21h do dia seguinte, = virada da vela
// diária em UTC-3), EDITADA no lugar a cada PAINEL_MIN min. Nada de mensagem nova a cada hora.
//  • mostra BTC (subindo/caindo), posições, comparação "desde as 21h" e "desde as 8h", janelas fortes e agenda das
//    próximas 24h; o placar do ciclo (alertas + seu resultado real) só aparece no fechamento (🏁 FIM DO RESUMO DO DIA)
//  • na virada das 21h o painel vira "🏁 FIM DO RESUMO DO DIA" (congelado, desafixado) e o próximo começa
// Env: RESUMO_NOITE_H=21 (começo do ciclo) · RESUMO_MANHA_H=8 (2ª referência) · PAINEL_MIN=60 · PAINEL_PIN=1 · PAINEL_BTC_PCT=0.3
const PAINEL_MIN = numEnv("PAINEL_MIN", "60");
const PAINEL_PIN = (Deno.env.get("PAINEL_PIN") || "1") !== "0";
const PAINEL_BTC_PCT = numEnv("PAINEL_BTC_PCT", "0.3");
const PAINEL_ROW = "_PAINEL_";
const PAINEL_FIM_APAGAR_H = numEnv("PAINEL_FIM_APAGAR_H", "24"); // V59: o "🏁 FIM DO RESUMO DO DIA" some sozinho depois de X horas (0 = nunca apaga)
type PainelBase = { t: number; btc: number | null; adx: number | null };
type PainelEstado = { key: string; inicio: number; ids: Record<string, number>; base: PainelBase; base8?: PainelBase; upd: number; fim?: boolean };
type PainelSnap = { btc: number; p1: number | null; p4: number | null; p24: number | null; adx: number | null };

// ── ciclo atual (21h → 21h) ──
function painelFase(): { key: string; inicio: number } {
  const tzMs = X_TZ_OFFSET_H * 3600000;
  const loc = new Date(Date.now() + tzMs);
  const dia = new Date(loc.getTime() - (loc.getUTCHours() >= RESUMO_NOITE_H ? 0 : 86400000)).toISOString().slice(0, 10); // dia em que o ciclo começou
  return { key: dia, inicio: Date.parse(dia + "T00:00:00Z") + RESUMO_NOITE_H * 3600000 - tzMs };
}
const painelDiurno = () => { const h = new Date(Date.now() + X_TZ_OFFSET_H * 3600000).getUTCHours(); return h >= RESUMO_MANHA_H && h < RESUMO_NOITE_H; };

// ── dados ──
let _btcUltimo: { btc: number; t: number } | null = null;
async function painelSnap(): Promise<PainelSnap | null> {
  try {
    const bruto = await xCandles("BTC-USDT", TIMEFRAME, 500);
    if (!bruto || bruto.c.length < 100) return null;
    const c = bruto.c, n = c.length, last = c[n - 1];
    const pct = (k: number) => (n > k ? ((last - c[n - 1 - k]) / c[n - 1 - k]) * 100 : null);
    const d = xFechadas(bruto, TF_MIN * 60000);
    const adx = xAdxSerie(d.h, d.l, d.c, 14);
    _btcUltimo = { btc: last, t: Date.now() };
    return { btc: last, p1: pct(4), p4: pct(16), p24: pct(96), adx: adx.length ? adx[adx.length - 1] : null };
  } catch (e) { console.log("⚠️ painel: BTC", e); return null; }
}
const baseDe = (s: PainelSnap | null): PainelBase => ({ t: Date.now(), btc: s?.btc ?? null, adx: s?.adx ?? null });

// ── texto ──
const pSgn = (x: number | null, d = 1) => (x === null || !isFinite(x) ? "—" : `${x >= 0 ? "+" : ""}${x.toFixed(d)}%`);
const pUsd = (x: number) => `$${Math.round(x).toLocaleString("en-US")}`;
function painelDesde(s: PainelSnap, b: PainelBase | undefined): string {
  if (!b || b.btc === null || b.t > Date.now() - 5 * 60000) return "";
  const adx = b.adx !== null && s.adx !== null ? ` · ADX ${b.adx.toFixed(0)}→${s.adx.toFixed(0)}` : "";
  return `📈 Desde as ${horaLocal(b.t)}: BTC ${pSgn(((s.btc - b.btc) / b.btc) * 100, 2)} (${pUsd(b.btc)} → ${pUsd(s.btc)})${adx}\n`;
}
function painelBtcBloco(s: PainelSnap | null, est: Pick<PainelEstado, "base" | "base8">): string {
  if (!s) {
    const cands = [_btcUltimo, est.base?.btc != null ? { btc: est.base.btc, t: est.base.t } : null, est.base8?.btc != null ? { btc: est.base8.btc, t: est.base8.t } : null].filter((x): x is { btc: number; t: number } => !!x).sort((a, b) => b.t - a.t);
    const ult = cands.length ? ` (último: ${pUsd(cands[0].btc)} às ${horaLocal(cands[0].t)})` : "";
    return `₿ <b>Bitcoin</b>: ⚠️ sem dados agora${ult}\n\n`;
  }
  const T = PAINEL_BTC_PCT, p1 = s.p1 ?? 0, p4 = s.p4 ?? 0;
  const dir = p1 >= T && p4 > -T ? "🟢⬆️ subindo" : p1 <= -T && p4 < T ? "🔴⬇️ caindo" : "⚪➡️ lateral";
  let t = `₿ <b>Bitcoin</b> ${pUsd(s.btc)} — ${dir}\n1h ${pSgn(s.p1)} · 4h ${pSgn(s.p4)} · 24h ${pSgn(s.p24)}\n`;
  if (!LATERAL_ON && s.adx !== null) t += `Tendência: ${s.adx >= X_ADX_FORTE ? "forte" : s.adx >= X_ADX_FRACO ? "moderada" : "lateral"} (ADX ${s.adx.toFixed(0)})\n`;
  const d1 = painelDesde(s, est.base), d8 = painelDesde(s, est.base8);
  t += d1 || d8 ? d1 + d8 : `📈 <i>Foto inicial das ${horaLocal(est.base.t)} — a comparação aparece na próxima atualização.</i>\n`;
  return t + "\n";
}
async function painelJanelas(): Promise<string> {
  const perfil = await xPerfilHoras().catch(() => null);
  if (!perfil) return "";
  const js = xJanelasFortes(perfil);
  return `🔥 <b>Janelas fortes</b> (${perfil.tipo}, UTC${X_TZ_OFFSET_H >= 0 ? "+" : ""}${X_TZ_OFFSET_H}): ${js.length ? js.map((j) => `${xHH(j.ini)}–${xHH(j.fim)}`).join(" · ") : "nenhuma bem definida"}\n\n`;
}
async function montarPainel(SB: any, chat: string | number, est: Pick<PainelEstado, "base" | "base8" | "inicio">, snap: PainelSnap | null, fim: boolean): Promise<string> {
  const [janelas, agenda, noticias, placarBruto, pos, lat] = await Promise.all([painelJanelas().catch(() => ""), agBlocoProximas(SB), ntBlocoPainel(SB), fim ? montarResumoNoite(SB, chat, est.inicio) : Promise.resolve(""), agPosicoes(chat), lateralLer(SB).then(lateralComLeituraViva)]); // placar (alertas + resultado real) só no fechamento das 21h
  const linhaPos = pos === null ? "" : pos.lista.length ? `💼 <b>Posições abertas (${pos.lista.length})</b>: ${pos.lista.join(" · ")}\nTotal agora: ${pos.total >= 0 ? "➕" : "➖"}${Math.abs(pos.total).toFixed(2)} USDT\n\n` : `💼 Sem posição aberta.\n\n`;
  const placar = placarBruto
    ? placarBruto.replace(/^[^\n]*\n[^\n]*\n\n?/, "") // tira o cabeçalho antigo ("BOA NOITE…" + divisor)
    : `<i>📊 O fechamento do ciclo (15m em destaque, alertas e seu resultado real) chega às ${xHH(RESUMO_NOITE_H)}.</i>`;
  const titulo = fim ? "🏁 <b>FIM DO RESUMO DO DIA</b>" : "🌎 <b>PAINEL DO DIA</b>";
  const carimbo = fim ? `🔒 encerrado às ${horaLocal(Date.now())} · não atualiza mais` : `🕒 atualizado às ${horaLocal(Date.now())} · a cada ${PAINEL_MIN} min · ciclo desde ${horaLocal(est.inicio)}`;
  return cortar(`${titulo}\n${carimbo}\n${DIVISOR}\n\n${painelSec("⚠️ Atenção", agenda + noticias)}${painelSec("📈 Mercado", painelBtcBloco(snap, est) + lateralTxt(lat, est.inicio))}${painelSec("💼 Carteira", linhaPos)}${painelSec("🔥 Horários", janelas)}${placar}`);
}

// ── estado e envio ──
async function painelLer(SB: any): Promise<PainelEstado | null> {
  try {
    const { data } = await SB.from(TAB).select("last_status").eq("instid", PAINEL_ROW).maybeSingle();
    const p = data?.last_status ? JSON.parse(data.last_status) : null;
    return p && p.key && p.base && p.inicio ? (p as PainelEstado) : null;
  } catch { return null; }
}
const painelSalvar = (SB: any, est: PainelEstado) => upsertLinha(SB, PAINEL_ROW, { last_status: JSON.stringify(est), last_alert_at: new Date().toISOString() });
async function painelEnviarNovo(SB: any, ch: string, est: PainelEstado, snap: PainelSnap | null): Promise<void> {
  const id = await sendTelegram(ch, await montarPainel(SB, ch, est, snap, false), undefined, { semUi: true });
  if (!id) return;
  est.ids[ch] = id;
  if (PAINEL_PIN) tgPost("pinChatMessage", { chat_id: ch, message_id: id, disable_notification: true }).catch(() => {});
}
// Edita os painéis existentes (e cria pra chat que ainda não tem). fim=true: última edição do ciclo — congela e desafixa.
async function painelAtualizar(SB: any, est: PainelEstado, fim: boolean): Promise<void> {
  const snap = await painelSnap();
  if (!fim && !est.base8 && painelDiurno() && snap) est.base8 = baseDe(snap); // 2ª referência: primeira foto depois das 8h
  for (const ch of ALERT_CHAT_IDS) {
    const id = est.ids[ch];
    if (id) {
      if (fim && silChat(ch)) {
        // V74: em horário de silêncio o fim continua sendo só uma edição (não notifica); mensagem nova só fora do silêncio
        await editarTelegram(ch, id, await montarPainel(SB, ch, est, snap, true));
        if (PAINEL_PIN) tgPost("unpinChatMessage", { chat_id: ch, message_id: id }).catch(() => {});
        continue;
      }
      if (fim) {
        // V74: o FIM DO RESUMO sai como mensagem NOVA (edição não notifica). Desafixa e apaga o painel velho só depois de o novo sair;
        // est.ids passa a apontar pra mensagem final, que é a que o PAINEL_FIM_APAGAR_H apaga depois.
        const novoId = await sendTelegram(ch, await montarPainel(SB, ch, est, snap, true), undefined, { semUi: true });
        if (novoId) {
          if (PAINEL_PIN) await tgPost("unpinChatMessage", { chat_id: ch, message_id: id }).catch(() => {});
          await apagarMsg(ch, id);
          est.ids[ch] = novoId;
        } else {
          console.log(`⚠️ painel: não consegui mandar o fim como mensagem nova em ${ch}, editando o painel existente`);
          await editarTelegram(ch, id, await montarPainel(SB, ch, est, snap, true));
          if (PAINEL_PIN) tgPost("unpinChatMessage", { chat_id: ch, message_id: id }).catch(() => {});
        }
        continue;
      }
      const ok = await editarTelegram(ch, id, await montarPainel(SB, ch, est, snap, fim));
      if (!ok && !silChat(ch)) { // edição falhou: apaga o painel velho (se ainda existir) ANTES de recriar, pra não ficar mensagem sobrando
        console.log(`⚠️ painel: edição falhou em ${ch}, recriando (apagando o anterior)`);
        await apagarMsg(ch, id);
        delete est.ids[ch];
        await painelEnviarNovo(SB, ch, est, snap);
      }
    } else if (!fim && !silChat(ch)) await painelEnviarNovo(SB, ch, est, snap);
  }
  est.upd = Date.now();
}
async function checarPainel(SB: any) {
  if (!RESUMO_ON || !ALERT_CHAT_IDS.length) return;
  const fase = painelFase();
  const est = await painelLer(SB);
  // 1) ciclo novo: encerra o painel antigo (uma vez só)
  if (est && est.key !== fase.key && !est.fim) {
    await painelAtualizar(SB, est, true);
    est.fim = true;
    await painelSalvar(SB, est);
    // V59: agenda a exclusão do FIM DO RESUMO (usa o mesmo autoapagar do cron) pra o do dia anterior não acumular no chat
    if (PAINEL_FIM_APAGAR_H > 0) for (const ch of ALERT_CHAT_IDS) { const id = est.ids[ch]; if (id) await agendarAutoApagar(SB, ch, id, PAINEL_FIM_APAGAR_H * 3600000); }
    console.log(`🏁 painel ${est.key} encerrado${PAINEL_FIM_APAGAR_H > 0 ? ` (some em ${PAINEL_FIM_APAGAR_H}h)` : ""}`);
    // V78: na virada do ciclo, grava o histórico dos radares no Supabase (best-effort; falha não atrapalha o painel)
    _bgTarefas.push(radarHistGravar(SB).then((g) => console.log(g?.ocupado ? "⏳ radarhist: outra gravação em andamento, pulei" : g ? `📚 radarhist: ${g.novos} novo(s), ${g.total} gravado(s)` : "⚠️ radarhist: não gravou")).catch((e) => console.log("⚠️ radarhist falhou", e))); // V106: a rodada espera por ela depois de liberar a trava
  }
  // 2) sem painel neste ciclo: cria
  if (!est || est.key !== fase.key) {
    if (ALERT_CHAT_IDS.every((ch) => silChat(ch))) return;
    const snap = await painelSnap();
    const novo: PainelEstado = { key: fase.key, inicio: fase.inicio, ids: {}, base: baseDe(snap), upd: Date.now() };
    for (const ch of ALERT_CHAT_IDS) if (!silChat(ch)) await painelEnviarNovo(SB, ch, novo, snap);
    if (!Object.keys(novo.ids).length) return; // ninguém confirmou: tenta de novo no próximo ciclo do cron
    await painelSalvar(SB, novo);
    console.log(`🗓️ painel ${novo.key} iniciado`);
    return;
  }
  // 3) painel do ciclo já existe: atualiza de hora em hora
  const latPn = LATERAL_ON ? await lateralComLeituraViva(await lateralLer(SB)) : null;
  const mudouLateral = !!latPn && latPn.flip > est.upd; // V57: filtro ligou/desligou desde a última edição → edita já (edição não notifica)
  if (mudouLateral || Date.now() - est.upd >= (PAINEL_MIN - 2) * 60000) {
    await painelAtualizar(SB, est, false);
    await painelSalvar(SB, est);
    console.log(`🔄 painel ${est.key} atualizado`);
  }
}
// /resumo: uma mensagem com o painel de agora (não mexe no painel fixo).
async function runResumo(chatId: number | string) {
  const SB = getSupabase();
  if (!SB) { await sendTelegram(chatId, "⚠️ Supabase não configurado."); return; }
  const fase = painelFase();
  const est = await painelLer(SB);
  const snap = await painelSnap();
  const ref = est && est.key === fase.key ? est : { inicio: fase.inicio, base: baseDe(snap), base8: undefined };
  await sendTelegram(chatId, await montarPainel(SB, chatId, ref, snap, false));
}
async function extrasV13(SB: any, posMap: Map<string, Pos[] | null>) {
  const partes: [string, () => Promise<void>][] = [
    ["placar", () => conferirPlacar(SB)],
    ["seguidas", () => checarSeguidas(SB)],
    ["posições", () => checarPosicoes(SB, posMap)],
    ["agenda", () => checarAgenda(SB)],
    ["agenda-resultado", () => checarResultadoAgenda(SB)],
    ["notícias", () => checarNoticias(SB)],
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
const SILENCIO_INI_H = numEnv("SILENCIO_INI_H", "3");
const SILENCIO_FIM_H = numEnv("SILENCIO_FIM_H", "6");
const SILENCIO_PROTECAO = (Deno.env.get("SILENCIO_PROTECAO") || "1") !== "0";
// V107: SILENCIO_MODO=mudo (padrão) = no horário do silêncio TUDO continua rodando (radares, alertas, placar, modo alerta do motor), só que as
// mensagens chegam SEM SOM (disable_notification). SILENCIO_MODO=pausa = o comportamento antigo (nada de alerta novo no horário, só proteção).
const SILENCIO_MODO: "mudo" | "pausa" = String(Deno.env.get("SILENCIO_MODO") || "mudo").trim().toLowerCase() === "pausa" ? "pausa" : "mudo";
function emSilencio(): boolean {
  if (!SILENCIO_ON) return false;
  const h = new Date(Date.now() + X_TZ_OFFSET_H * 3600000).getUTCHours();
  return SILENCIO_INI_H <= SILENCIO_FIM_H ? (h >= SILENCIO_INI_H && h < SILENCIO_FIM_H) : (h >= SILENCIO_INI_H || h < SILENCIO_FIM_H);
}
const MSG_PREFIXO = "_MSG_";
async function enviarAlertaMoeda(SB: any, chat: string, instId: string, msg: string, botoes?: Botoes, autoApagarMin?: number): Promise<number | null> {
  const chave = `${MSG_PREFIXO}${chat}_${instId}`;
  let antigo: number | null = null;
  try {
    const { data } = await SB.from(TAB).select("last_status").eq("instid", chave).maybeSingle();
    const n = Number(data?.last_status);
    if (isFinite(n) && n > 0) antigo = n;
  } catch { }
  // Alertas de ENTRADA ganham a linha "dado importante perto" (alertas de posição e o próprio aviso de agenda não).
  let risco = "";
  if (/^(FUNDO|TOPO|COMPRESSAO|ACOMP|FINAL|CRUZ|ANTEC|SEG)_/.test(instId)) {
    try { await buscarAgenda(SB); risco = agRiscoLinha(); } catch { }
  }
  const novo = await sendTelegram(chat, cortar(ALERTA_MARCA + risco + msg), botoes, { semUi: true });
  if (novo) {
    if (antigo) await apagarMsg(chat, antigo);
    // NOTICIA_<ts> e AGENDA_RES_<ts> são chaves únicas (nunca substituem nada): gravar o id só criaria uma linha nova por aviso, pra sempre.
    if (!/^(NOTICIA|AGENDA_RES)_/.test(instId)) { try { await upsertLinha(SB, chave, { last_status: String(novo) }); } catch (e) { console.log("⚠️ não salvei id da mensagem", e); } }
    // autoApagarMin (opcional) substitui o padrão global só pra essa chamada — usado no aviso de "cruzou CONTRA" (V72), que é
    // informativo (não é uma entrada/saída real) e some mais rápido pra não acumular tela com WATCH_REPETIR mandando de novo a cada virada.
    const apagarMin = autoApagarMin ?? ALERTA_AUTOAPAGAR_MIN;
    if (apagarMin > 0) await agendarAutoApagar(SB, chat, novo, apagarMin * 60000).catch(() => {});
  }
  return novo;
}
// Autoapagar dos alertas proativos: fica registrado no Supabase com a hora de expirar, e o cron
// (que já roda a cada 1-2 min) apaga quem já passou da hora. Não dá pra confiar num timer guardado
// na memória por 15 min — a function serverless não fica viva tanto tempo — então o apagão sempre
// passa pela próxima rodada do cron; o atraso real fica perto do intervalo do cron, não cravado.
const AUTOAPAGAR_PREFIXO = "_DEL_";
const AUTOAPAGAR_RETRY_MIN = numEnv("AUTOAPAGAR_RETRY_MIN", "30");
async function agendarAutoApagar(SB: any, chat: string, msgId: number, ms: number) {
  try { await upsertLinha(SB, `${AUTOAPAGAR_PREFIXO}${chat}_${msgId}`, { last_status: String(Date.now() + ms) }); } catch { }
}
async function processarAutoApagar(SB: any) {
  try {
    const { data } = await SB.from(TAB).select("instid,last_status").like("instid", `${AUTOAPAGAR_PREFIXO}%`);
    if (!data?.length) return;
    const agora = Date.now();
    let apagadas = 0, falhas = 0, pendentes = 0;
    for (const r of data as { instid: string; last_status: string }[]) {
      const quando = Number(r.last_status);
      if (!isFinite(quando)) { await SB.from(TAB).delete().eq("instid", r.instid); continue; }
      if (quando > agora) { pendentes++; continue; }
      const resto = r.instid.slice(AUTOAPAGAR_PREFIXO.length);
      const pos = resto.lastIndexOf("_");
      if (pos > 0) {
        const st = await apagarMsgStatus(resto.slice(0, pos), Number(resto.slice(pos + 1)));
        // V74: erro temporário (429/5xx/rede) mantém a linha pra tentar na próxima rodada, por até AUTOAPAGAR_RETRY_MIN após vencer
        if (st === "retry" && agora - quando < AUTOAPAGAR_RETRY_MIN * 60000) { pendentes++; continue; }
        if (st === "ok") apagadas++; else falhas++;
      }
      await SB.from(TAB).delete().eq("instid", r.instid);
    }
    if (apagadas || falhas) console.log(`🗑️ autoapagar: ${apagadas} apagada(s), ${falhas} falha(s) (provavelmente já tinham sido apagadas antes, ex. substituídas por um alerta mais novo)${pendentes ? `, ${pendentes} ainda dentro do prazo` : ""}`);
  } catch (e) { console.log("⚠️ processarAutoApagar", e); }
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
type Sugestao = { emoji: string; titulo: string; dica: string; contra: boolean; seta?: string }; // seta: "🟡→🟢" quando o estado da posição mudou (vai numa linha "Movimento:" própria)
function sugestaoPosicao(p: Pos, info: IndicadorInfo & { adx?: number; rsi?: number; adxAntes?: number }, alvo?: "long" | "short"): Sugestao {
  const atual = ladoAtual(info);
  const adx = typeof info.adx === "number" ? info.adx : null;
  const rsi = typeof info.rsi === "number" ? info.rsi : null;
  const adxAntes = typeof info.adxAntes === "number" ? info.adxAntes : null;
  const longP = p.lado === "long";
  const oposto = longP ? "SHORT" : "LONG";
  const fraco = adx !== null && adx < FILTRO_ADX_MIN;
  const forte = adx !== null && adx >= ADX_REF;
  // V49: usava FILTRO_RSI_MAX-10/FILTRO_RSI_MIN+10 (75/25) só aqui — divergia do limiar ESTICADO_RSI (80/20)
  // usado por guiaDentro (mesma seção do /analise, mas sem posição real), pelo alerta automático real de
  // checarProtecaoLucro e pelo texto do /menu. Resultado: com RSI=77 numa LONG real, /analise dizia "esticado,
  // realize parte" mas o alerta automático da proteção de lucro (a mesma posição) não teria disparado ainda.
  const limEstic = longP ? ESTICADO_RSI : 100 - ESTICADO_RSI;
  const esticado = rsi !== null && (longP ? rsi >= limEstic : rsi <= limEstic);
  const perdendoForca = !fraco && adx !== null && adxAntes !== null && (adx - adxAntes) <= -3;
  const lucroGrande = p.pnl > 0 && p.pnlPct >= 15;
  const forca = [adx !== null ? `ADX ${adx.toFixed(0)}` : "", rsi !== null ? `RSI ${rsi.toFixed(0)}` : ""].filter(Boolean).join(", ");
  // V54: com lucro, a dica mandava "suba o stop para o preço de entrada" mesmo quando o trailing (linha logo abaixo, em /robo,
  // /analise e nos alertas) já mandava subir o stop pra um preço com ganho travado — duas ordens diferentes pro mesmo stop.
  // Agora: trailing ativo → a dica manda seguir o trailing; lucro ainda abaixo do 1º degrau → mantém o stop (o trailing avisa
  // quando subir); trailing desligado (TRAIL_ATR_MULT=0) → cai no texto antigo.
  const atrPos = typeof (info as any).atr === "number" ? (info as any).atr : 0;
  const stopTxt = p.pnl <= 0 ? "mantenha o stop original e não aumente a posição"
    : calcTrailing(p, atrPos) ? "siga o stop do trailing logo abaixo"
    : TRAIL_ATR_MULT > 0 ? `mantenha o stop de proteção (o trailing sobe o stop quando o ganho passar de ${TRAIL_ATR_MULT}×ATR)`
    : "suba o stop para o preço de entrada";
  if (atual === p.lado) {
    if (esticado) return { emoji: "🟠", titulo: "A favor, mas esticado", contra: false, dica: `${forca}. Risco de correção: realize uma parte e proteja o resto com stop.` };
    if (fraco) return { emoji: "🟠", titulo: "A favor, mas sem força", contra: false, dica: `${forca} (mínimo do filtro: ${FILTRO_ADX_MIN}). Os filtros não abririam essa entrada agora: ${p.pnl > 0 ? "realize tudo ou boa parte" : "aperte o stop"}.` };
    if (perdendoForca) return { emoji: "🟡", titulo: "A favor, mas perdendo força", contra: false, dica: `ADX caiu de ${adxAntes!.toFixed(0)} para ${adx!.toFixed(0)} na última ~1h${rsi !== null ? `, RSI ${rsi.toFixed(0)}` : ""}. Momentum esfriando${lucroGrande ? `, e você já tem ${sgn(p.pnlPct, 1)}% de lucro` : ""}: bom momento para realizar parte ou subir o stop antes que caia abaixo de ${FILTRO_ADX_MIN}.` };
    if (forte) return { emoji: "🟢", titulo: "Dentro do movimento, pode manter", contra: false, dica: `${forca}. Tendência forte a favor: deixe correr e ${stopTxt}.` };
    return { emoji: "🟢", titulo: "A favor, força moderada", contra: false, dica: `${forca ? forca + ". " : ""}Mantenha com o stop de proteção; se o ADX cair abaixo de ${FILTRO_ADX_MIN}, realize.` };
  }
  if (atual !== null) {
    if (!fraco) return { emoji: "🔴", titulo: "Linha virou CONTRA a posição", contra: true, dica: `A vela de 15m fechou do lado ${oposto}${forca ? " (" + forca + ")" : ""}: o robô vira no fechamento. Se sua posição continua ${longP ? "LONG" : "SHORT"}, confira se ele virou e se está ligado${p.pnl < 0 ? ". Nada de aumentar a posição" : ""}.` };
    return { emoji: "🟡", titulo: "Virou contra, mas sem força", contra: true, dica: `A vela fechou do lado ${oposto}, mas sem força (${forca}): a virada tem mais chance de falhar. O robô vira mesmo assim; se não quiser esse trade, desligue o robô.` };
  }
  if (alvo && alvo === p.lado) return { emoji: "🎯", titulo: "Chegando na linha do seu lado", contra: false, dica: `Se uma vela fechar além dela, o movimento a seu favor se confirma. Mantenha o stop${forca ? ". " + forca : ""}.` };
  if (alvo && alvo !== p.lado) return { emoji: "🟠", titulo: "Chegando na linha OPOSTA à posição", contra: false, dica: `Se uma vela fechar além dela, o robô vira pra ${oposto}. Considere realizar parte ou apertar o stop antes${forca ? ". " + forca : ""}.` };
  return { emoji: "🟡", titulo: "Preço dentro das linhas, sem sinal", contra: false, dica: `O robô mantém a posição dentro da faixa e só vira se uma vela fechar ${longP ? "abaixo" : "acima"} de ${fmtPrice(longP ? info.fundo : info.topo)}. Mantenha o stop.` };
}
const STOP_ATR_RESERVA = numEnv("STOP_ATR_RESERVA", "2");
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
  const pctTxt = (pct: number, sinal: string) => (p.lev > 0 ? `${sinal}${(pct * p.lev).toFixed(0)}% margem` : `${sinal}${pct.toFixed(2)}%`);
  const batido = p.mark > 0 && (longP ? p.mark >= sa.alvo : p.mark <= sa.alvo);
  return `🎯 Stop ${fmtPrice(sa.stop)} (${pctTxt(sa.riscoPct, "-")}) · Alvo ${fmtPrice(sa.alvo)} (${pctTxt(sa.retornoPct, "+")}) · RR ${ALVO_RR}:1${porAtr ? ` · stop de reserva ${STOP_ATR_RESERVA}×ATR` : ""}${batido ? " — alvo já atingido, considere realizar/subir o stop" : ""}\n`;
}
async function blocoPosicao(SB: any, chatId: number | string, ps: Pos[], info: IndicadorInfo, alvo?: "long" | "short"): Promise<string> {
  if (!ps.length) return "";
  let inf: any = info;
  if (typeof inf.adx !== "number") inf = (await calcIndicadorFiltro(info.instId).catch(() => null)) ?? info;
  let out = `\n\n${DIVISOR}`;
  for (const p of ps) {
    const s = await sugestaoPosicaoComSeta(SB, chatId, p, inf, alvo);
    out += `\n📌 <b>Você já está ${p.lado === "long" ? "LONG" : "SHORT"}</b> — entrada ${fmtPrice(p.entrada)} | ${p.pnl >= 0 ? "➕" : "➖"} PnL ${sgn(p.pnl)} USDT (${sgn(p.pnlPct, 1)}% da margem)\n${s.emoji} <b>${s.titulo}</b>\n${s.seta ? `Movimento: ${s.seta}\n` : ""}${s.dica}\n` + (trailingTxt(p, typeof inf.atr === "number" ? inf.atr : 0) || stopAlvoPosTxt(p, inf));
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
  const salvar: Record<string, { e: number; p: number }> = { ...atual };
  if (antes) {
    for (const k of Object.keys(atual)) {
      if (antes[k]) continue;
      const p = posList.find((x) => `${x.instId}|${x.lado}` === k)!;
      const info = await calcIndicadorFiltro(p.instId).catch(() => null);
      const msg = `🟢 <b>${p.instId}</b> — posição ABERTA (${p.lado === "long" ? "LONG" : "SHORT"})\n${DIVISOR}\n\nentrada ${fmtPrice(p.entrada)}${p.lev ? ` | ${p.lev}x` : ""}` + (info ? await blocoPosicao(SB, chat, [p], info) : "");
      const id = await enviarAlertaMoeda(SB, chat, `POSCHAT_${p.instId}`, cortar(msg), botaoAnalisar(p.instId));
      if (!id) delete salvar[k]; // não confirmou: tira do snapshot pra detectar "abriu" de novo na próxima rodada
    }
    for (const k of Object.keys(antes)) {
      if (atual[k]) continue;
      const [inst, lado] = k.split("|");
      const msg = `⚪ <b>${inst}</b> — posição FECHADA (${lado === "long" ? "LONG" : "SHORT"})\n${DIVISOR}\n\nÚltimo PnL aberto visto: ${sgn(antes[k].p)} USDT (estimativa; o resultado real está no /robo).`;
      const id = await enviarAlertaMoeda(SB, chat, `POSCHAT_${inst}`, msg, botaoAnalisar(inst));
      if (!id) salvar[k] = antes[k]; // não confirmou: mantém no snapshot pra detectar "fechou" de novo na próxima rodada
    }
  }
  await upsertLinha(SB, POS_ROW_CHAT, { last_status: JSON.stringify(salvar), last_alert_at: new Date().toISOString() });
}

const PROT_LUCRO_ON = (Deno.env.get("PROT_LUCRO") || "1") !== "0";
const TRAIL_ATR_MULT = numEnv("TRAIL_ATR_MULT", "2");
const ESTICADO_RSI = numEnv("ESTICADO_RSI", "80");
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
    ? `🔒 Trailing: o trade já andou ${TRAIL_ATR_MULT}×ATR a seu favor (+${t.ganhoPct.toFixed(2)}%). Suba o stop para o preço de entrada (${fmtPrice(t.stop)})<i> e não deixe o lucro virar prejuízo</i>.\n`
    : `🔒 Trailing: suba o stop para ${fmtPrice(t.stop)} — trava +${t.travaPct.toFixed(2)}% de ganho${mg} — o preço já andou +${t.ganhoPct.toFixed(2)}%.\n`;
}
// V54: texto de stop pros alertas de radar (fundo/topo) com posição aberta — usa o mesmo cálculo do trailing, em vez de mandar
// "stop no preço de entrada" com o trailing já pedindo mais (esses alertas não mostram a linha do trailing).
function stopSugeridoTxt(p: Pos, atr: number): string {
  const t = calcTrailing(p, atr);
  if (t) return t.n === 1 ? "subir o stop pro preço de entrada" : `subir o stop para ${fmtPrice(t.stop)} (trailing, trava +${t.travaPct.toFixed(2)}%)`;
  return TRAIL_ATR_MULT > 0 ? "manter o stop de proteção" : "subir o stop pro preço de entrada";
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
        const cab = `entrada ${fmtPrice(p.entrada)} | agora ${fmtPrice(p.mark)} | ${p.pnl >= 0 ? "➕" : "➖"} PnL ${sgn(p.pnl)} USDT (${sgn(p.pnlPct, 1)}% da margem)`;
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
const FRACO_COOLDOWN_MIN = numEnv("FRACO_COOLDOWN_MIN", "45");
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
        } else if (n > prevN || (n === prevN && agora - prevT >= FRACO_COOLDOWN_MIN * 60000)) {
          const ladoTxt = p.lado === "long" ? "LONG" : "SHORT";
          const cab = `entrada ${fmtPrice(p.entrada)} | agora ${fmtPrice(p.mark)} | ${p.pnl >= 0 ? "➕" : "➖"} PnL ${sgn(p.pnl)} USDT (${sgn(p.pnlPct, 1)}% da margem)`;
          const msg = `${sug.emoji} <b>${p.instId}</b> ${ladoTxt} — ${sug.titulo}\n${sug.seta ? `Movimento: ${sug.seta}\n` : ""}${DIVISOR}\n\n${cab}\n\n${sug.dica}\n` +
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
const BTC_FALHAS_AVISO = numEnv("BTC_FALHAS_AVISO", "3");
async function avisarBtcSemDados(SB: any) {
  const ok = (await btcVar1h().catch(() => null)) !== null;
  let prev: { n?: number; av?: boolean } = {};
  try {
    const { data } = await SB.from(TAB).select("last_status").eq("instid", "_BTC_").maybeSingle();
    prev = JSON.parse(data?.last_status || "{}") || {};
  } catch { prev = {}; }
  const n = ok ? 0 : (prev.n ?? 0) + 1;
  const eraAv = !!prev.av;
  let av = eraAv;
  const quer = !ok && n >= BTC_FALHAS_AVISO && !eraAv ? "falha" : ok && eraAv ? "volta" : "";
  if (quer) {
    const ativos = ALERT_CHAT_IDS.filter((ch) => !silChat(ch));
    const msg = quer === "falha"
      ? `⚠️ <b>BTC sem dados</b>\n${DIVISOR}\n\nO BTC ficou sem dados por ${n} rodadas seguidas (todas as fontes falharam). Enquanto isso, os filtros de direção do BTC nos alertas podem ficar sem efeito — olhe os alertas de reversão com mais cuidado.`
      : `✅ <b>BTC voltou a ter dados</b> — filtros de direção do BTC normalizados.`;
    const ids = await Promise.all(ativos.map((ch) => sendTelegram(ch, msg, undefined, { semUi: true })));
    if (ids.some((id) => !!id)) av = quer === "falha";
  }
  if (n !== (prev.n ?? 0) || av !== eraAv) await upsertLinha(SB, "_BTC_", { last_status: JSON.stringify({ n, av }) });
}
const FONTE_FALLBACK_PCT = numEnv("FONTE_FALLBACK_PCT", "40");
// Histerese: o aviso liga em FONTE_FALLBACK_PCT e só desliga abaixo de FONTE_NORMALIZA_PCT (evita o par "modo reserva"/"normalizado" repetido quando a taxa fica rondando o limite).
const FONTE_NORMALIZA_PCT = Math.min(numEnv("FONTE_NORMALIZA_PCT", "25"), FONTE_FALLBACK_PCT);
const FONTE_MIN_CHAMADAS = 10;
const FONTE_AUTOAPAGAR_MIN = numEnv("FONTE_AUTOAPAGAR_MIN", "2");
async function avisarFonteDados(SB: any) {
  const blofin = _fonte["BloFin"] ?? 0, falhas = _fonte["FALHA"] ?? 0;
  const alt = Object.entries(_fonte).filter(([k]) => k !== "BloFin" && k !== "FALHA");
  const fb = alt.reduce((n, [, v]) => n + v, 0);
  const total = blofin + fb + falhas;
  if (total < FONTE_MIN_CHAMADAS) return;
  const pctRuim = ((fb + falhas) / total) * 100;
  const nomes = alt.sort((a, b) => b[1] - a[1]).map(([k]) => k).join("/") || "outra fonte";
  let prev: { e?: string; t?: number } = {};
  try {
    const { data } = await SB.from(TAB).select("last_status").eq("instid", "_FONTE_").maybeSingle();
    prev = JSON.parse(data?.last_status || "{}") || {};
  } catch { prev = {}; }
  const estavaDeg = prev.e === "deg";
  const degradado = estavaDeg ? pctRuim >= FONTE_NORMALIZA_PCT : pctRuim >= FONTE_FALLBACK_PCT;
  const transicao = degradado !== estavaDeg;
  const ativos = ALERT_CHAT_IDS.filter((ch) => !silChat(ch));
  if (transicao && !ativos.length) return;
  // Auditoria (achado #16): a mudança de estado (e/t) era gravada incondicionalmente ao envio — se TODOS os
  // sendTelegram falhassem no ciclo da transição, o aviso "único" se perdia pra sempre (próximo ciclo já via
  // estavaDeg === degradado e nunca mais tentava). Mesma família dos achados #4-#11. Corrigido: só marca a
  // transição (e salva) se pelo menos um chat confirmar o envio; senão retorna sem gravar, pra tentar de novo
  // no próximo ciclo do cron.
  if (transicao) {
    const msg = cortar(degradado
      ? `📡 <b>Dados de mercado em modo reserva</b>\n${DIVISOR}\n\nA BloFin não respondeu direito neste ciclo: <b>${pctRuim.toFixed(0)}%</b> das consultas vieram de ${nomes}${falhas ? ` ou falharam (${falhas})` : ""} (${fb + falhas} de ${total}).\n⚠️ Preços e velas dessas fontes podem diferir um pouco da BloFin, onde você opera. Confira o preço na corretora antes de entrar.\n<i>Aviso único: você recebe outro quando normalizar.</i>`
      : `📡 <b>Dados de mercado normalizados</b> — voltaram a vir da BloFin.`);
    const idsFonte = await Promise.all(ativos.map((ch) => sendTelegram(ch, msg, undefined, { semUi: true })));
    const entregouFonte = idsFonte.some((id) => !!id);
    if (!entregouFonte) return; // nenhum chat confirmou: mantém o estado anterior e tenta de novo no próximo ciclo
    if (FONTE_AUTOAPAGAR_MIN > 0) {
      await Promise.all(ativos.map((ch, i) => {
        const id = idsFonte[i];
        return id ? agendarAutoApagar(SB, ch, id, FONTE_AUTOAPAGAR_MIN * 60000).catch(() => {}) : Promise.resolve();
      }));
    }
    console.log(`📡 fonte de dados: ${degradado ? "DEGRADADA" : "normalizada"} (${pctRuim.toFixed(0)}% fora da BloFin, ${total} consultas)`);
  }
  await upsertLinha(SB, "_FONTE_", { last_status: JSON.stringify({ e: degradado ? "deg" : "ok", t: transicao ? Date.now() : (prev.t ?? Date.now()), p: Math.round(pctRuim), f: nomes }), last_alert_at: new Date().toISOString() });
}

const RISCO_ON = (Deno.env.get("RISCO") || "1") !== "0";
const RISCO_LIQ_PCT = numEnv("RISCO_LIQ_PCT", "8");
const RISCO_LIQ_CRITICO_PCT = numEnv("RISCO_LIQ_CRITICO_PCT", "3");
const RISCO_PERDA_PCT = numEnv("RISCO_PERDA_PCT", "30");
const RISCO_PERDA_CRITICA_PCT = numEnv("RISCO_PERDA_CRITICA_PCT", "60");
const RISCO_COOLDOWN_MIN = numEnv("RISCO_COOLDOWN_MIN", "120");
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
          (info ? await blocoPosicao(SB, chat, [p], info) : "");
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
    if (p === maxPag - 1) {
      // última página do laço veio cheia (100): confirma com 1 chamada leve (limit=1) se há mais dados
      // antes de marcar "cortado", pra não avisar falso limite quando aquela era, por coincidência, a página final.
      try {
        const probe = await blofinPrivado(`/api/v1/trade/fills-history?begin=${desdeMs}&end=${Date.now()}&limit=1&after=${apos}`, cred);
        cortado = probe.length > 0;
      } catch { cortado = true; } // se a checagem falhar, assume o pior (comportamento anterior)
    }
  }
  return { fills: out, cortado };
}
const MEUPLACAR_ANTES_MIN = 15;
const MEUPLACAR_DEPOIS_H = 6;
// V54: ganhos/perdas por ORDEM de fechamento (uma ordem costuma vir em várias execuções/fills; contar cada fill inflava o placar).
// Recebe só as execuções com fillPnl != 0. Sem orderId usa o tradeId (cada execução vira uma "ordem").
function contaPorOrdem(fech: any[]): { ordens: number; ganhos: number; perdas: number } {
  const m = new Map<string, number>();
  fech.forEach((f, i) => { const k = String(f.orderId ?? f.tradeId ?? `sem-id-${i}`); m.set(k, (m.get(k) ?? 0) + numOr0(f.fillPnl)); });
  const v = [...m.values()];
  return { ordens: v.length, ganhos: v.filter((x) => x > 0).length, perdas: v.filter((x) => x < 0).length };
}
async function runMeuPlacar(chatId: number | string, dias: number) {
  const cred = credDe(chatId);
  if (!cred) { await sendTelegram(chatId, `🧾 <b>/meuplacar</b> precisa da sua chave BloFin (só leitura) ligada a este chat.\nSeu chat_id: <b>${chatId}</b>`); return; }
  const SB = getSupabase();
  if (!SB) { await sendTelegram(chatId, "⚠️ Supabase não configurado."); return; }
  const desdeMs = Date.now() - dias * 86400000;
  let fills: any[] = [], cortado = false;
  try { ({ fills, cortado } = await buscarFills(cred, desdeMs)); }
  catch (e) { await sendTelegram(chatId, `⚠️ Não consegui ler seus trades: ${String((e as Error).message || e).replace(/[<>&]/g, "").slice(0, 160)}`); return; }
  const { data, error } = await lerPaginadoDesde(chatId, (a, b) => SB.from(PLACAR_TABELA).select("*").gt("criado_em", new Date(desdeMs).toISOString()).order("criado_em", { ascending: true }).range(a, b));
  if (error) { await sendTelegram(chatId, `⚠️ Não consegui ler os alertas: ${String(error.message || error).replace(/[<>&]/g, "").slice(0, 160)}`); return; }
  const alertas = ((data || []) as any[]).filter((r) => !ehFinalLog(r) && !ehDescartadoLog(r));
  // fills-history da BloFin não traz reduceOnly/orderCategory (só existe em order-history);
  // fillPnl===0 é o único sinal disponível aqui pra identificar abertura, e por isso classificaria
  // errado um fechamento que, por coincidência, saiu no mesmo preço de entrada (pnl exato 0) —
  // caso extremamente raro em cripto e não vale o custo de 1 chamada extra de API por fill pra descartar.
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
  const gp = (l: any[]) => { const c = contaPorOrdem(l); return `${c.ganhos} ganho(s) × ${c.perdas} perda(s)`; };
  let msg = `🧾 <b>MEU PLACAR</b> — últimos ${dias} dia(s)\n${DIVISOR}\n\n`;
  msg += `🔔 ${alertas.length} alerta(s) do bot no período\n✅ Você entrou em ${seguidos.length}\n⏭️ Não entrou em ${ignorados.length - contra}\n↔️ Entrou contra o lado do alerta em ${contra}\n\n`;
  msg += `💰 <b>Resultado realizado</b>: ${sgn(soma(fech))} USDT (${gp(fech)})\n`;
  msg += `• Moedas em que você seguiu um alerta: ${sgn(soma(fSeg))} USDT (${gp(fSeg)})\n`;
  msg += `• Outras moedas: ${sgn(soma(fOut))} USDT (${gp(fOut)})\n\n`;
  msg += `🤖 <b>O que o bot registrou nesses alertas</b>\n`;
  msg += `Seguidos: ${seguidos.length ? linhaStats(seguidos) : "—"}\nNão seguidos: ${ignorados.length ? linhaStats(ignorados) : "—"}\n\n`;
  msg += `<i>Aproximação: conta como "seguiu" uma abertura na mesma moeda e lado entre ${MEUPLACAR_ANTES_MIN} min antes e ${MEUPLACAR_DEPOIS_H}h depois do alerta. Sem taxas e funding. O resultado por moeda soma todos os trades naquela moeda no período.</i>`;
  if (cortado) msg += `\n<i>(limite de execuções lidas atingido; use menos dias)</i>`;
  await enviarEmPartes(chatId, msg); // V107: em partes
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
  return (SILENCIO_MODO === "pausa" && emSilencio()) || (_pausas.get(String(ch)) ?? 0) > Date.now(); // V107: no modo mudo o horário não pausa nada
}
const horaLocal = (ms: number) => new Date(ms + X_TZ_OFFSET_H * 3600000).toISOString().slice(11, 16);
async function heartbeat(SB: any, txt: string) {
  try { await upsertLinha(SB, "_CRON_", { last_status: txt, last_alert_at: new Date().toISOString() }); } catch { }
}
const CRON_AVISO_MIN = numEnv("CRON_AVISO_MIN", "20");
async function avisarCronParado(SB: any) {
  try {
    const { data: r } = await SB.from(TAB).select("last_alert_at").eq("instid", "_CRON_").maybeSingle();
    if (!r?.last_alert_at) return;
    const min = Math.round((Date.now() - new Date(r.last_alert_at).getTime()) / 60000);
    if (min <= CRON_AVISO_MIN) return;
    const msg = `⚠️ <b>Cron estava parado</b> — ficou ~${min} min sem rodar, voltando agora.\n<i>Nesse período os alertas automáticos e a proteção de posições não rodaram.</i>`;
    await Promise.all(ALERT_CHAT_IDS.map((ch) => sendTelegram(ch, msg, undefined, { semUi: true })));
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
    await sendTelegram(chatId, `${estado}⏸ <b>Pausar alertas</b> por quanto tempo?\n(${SILENCIO_MODO === "mudo" ? `Das ${SILENCIO_INI_H}h às ${SILENCIO_FIM_H}h os alertas continuam, só que sem som.` : `O silêncio das ${SILENCIO_INI_H}h às ${SILENCIO_FIM_H}h continua funcionando sozinho.`})`,
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
const CRON_ALERTA_MIN = numEnv("CRON_ALERTA_MIN", "15");
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
    teste("Velas do BTC (painel)", async () => { const c = await xCandles("BTC-USDT", TIMEFRAME, 500); if (!c || c.c.length < 100) throw new Error("sem velas"); }),
    cred ? teste("Sua conta BloFin", async () => { await blofinPrivado("/api/v1/account/positions", cred); }) : Promise.resolve("➖ Conta BloFin: sem chave ligada a este chat"),
  ]);
  let cron = "❓ Cron: ainda sem registro";
  let pausa = "";
  let fonte = "";
  let nSeg = 0;
  let nDel = 0;
  let lateral = "";
  if (SB) {
    const { data: r } = await SB.from(TAB).select("last_status, last_alert_at").eq("instid", "_CRON_").maybeSingle();
    if (r?.last_alert_at) {
      const min = Math.round((Date.now() - new Date(r.last_alert_at).getTime()) / 60000);
      cron = `${min > CRON_ALERTA_MIN ? "⚠️" : "✅"} Cron: último ciclo há ${min} min (${r.last_status || "?"})${min > CRON_ALERTA_MIN ? " — pode estar parado" : ""}`;
    }
    const { data: p } = await SB.from(TAB).select("last_status").eq("instid", `_PAUSA_${chatId}`).maybeSingle();
    const ate = Number(p?.last_status);
    if (ate > Date.now()) pausa = `⏸ Alertas pausados até ${horaLocal(ate)}\n`;
    lateral = lateralStatusTxt(await lateralComLeituraViva(await lateralLer(SB)));
    nSeg = (await listarSeguidas(SB, chatId)).length;
    const { count: nDelCount } = await SB.from(TAB).select("instid", { count: "exact", head: true }).like("instid", `${AUTOAPAGAR_PREFIXO}%`);
    nDel = nDelCount ?? 0;
    try {
      const { data: f } = await SB.from(TAB).select("last_status").eq("instid", "_FONTE_").maybeSingle();
      const fj = JSON.parse(f?.last_status || "{}");
      if (fj.e === "deg") fonte = `📡 ⚠️ Dados em modo reserva (${fj.f || "fallback"}, ${fj.p ?? "?"}% das consultas) desde ${horaLocal(Number(fj.t) || Date.now())}\n`;
      else if (fj.e === "ok") fonte = `📡 ✅ Dados de mercado vindo da BloFin\n`;
    } catch { }
  }
  const msg = `🩺 <b>STATUS</b>\n${DIVISOR}\n\n${testes.join("\n")}\n${cron}\n${fonte}${lateral}\n` +
    pausa + (emSilencio() ? (SILENCIO_MODO === "mudo" ? `🌙 Horário mudo agora (${SILENCIO_INI_H}h–${SILENCIO_FIM_H}h): tudo rodando, alertas chegam sem som\n` : `🌙 Silêncio automático agora (${SILENCIO_INI_H}h–${SILENCIO_FIM_H}h)\n`) : "") +
    `⭐ Seguidas: ${nSeg}/${SEG_MAX}\n` +
    (ALERTA_AUTOAPAGAR_MIN > 0 ? `🗑️ Auto-apagar: ${nDel} alerta(s) na fila (some${nDel ? "m" : ""} em até ${ALERTA_AUTOAPAGAR_MIN} min)\n` : "") +
    `🔔 Este chat ${ALERT_CHAT_IDS.includes(String(chatId)) ? "recebe" : "NÃO recebe"} os alertas automáticos\n` +
    `🔑 Chave BloFin: ${cred ? "vinculada" : "não vinculada"}`;
  const falhou = testes.some((t) => t.startsWith("❌"));
  await enviarEmPartes(chatId, msg, falhou ? [[{ text: "🔄 Tentar de novo", callback_data: "/status" }]] : undefined);
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
  let instsPos: string[] = [];
  if (posicoes === null) msg += `⚠️ Não consegui ler as posições: ${esc(erroPos)}\n\n`;
  else if (!posicoes.length) msg += `📭 Nenhuma posição aberta.\n\n`;
  else {
    const ps = posicoes.filter((p) => numOr0(p.positions) !== 0)
      .sort((a, b) => numOr0(b.unrealizedPnl) - numOr0(a.unrealizedPnl));
    const total = ps.reduce((s, p) => s + numOr0(p.unrealizedPnl), 0);
    instsPos = ps.slice(0, 15).map((p) => String(p.instId));
    msg += `📌 <b>${ps.length} posição(ões) aberta(s)</b> — PnL aberto ${sgn(total)} USDT\n\n`;
    const infosRobo = await emLotes(ps.slice(0, 15).map((p) => String(p.instId)), 5, (i) => calcIndicadorFiltro(i).catch(() => null));
    const mostrar = ps.slice(0, 15);
    const SBrobo = getSupabase();
    for (const [idx, p] of mostrar.entries()) {
      const q = numOr0(p.positions);
      const lado = p.positionSide === "long" ? "LONG" : p.positionSide === "short" ? "SHORT" : (q > 0 ? "LONG" : "SHORT");
      const pnl = numOr0(p.unrealizedPnl);
      if (idx > 0) msg += `${MINI_DIVISOR}\n`;
      msg += `🪙 <b>${String(p.instId).replace("-USDT", "")}</b> — ${lado} ${numOr0(p.leverage) || ""}x ${p.marginMode === "cross" ? "cross" : "isolada"}\n` +
        `   entrada ${fmtPrice(numOr0(p.averagePrice))} → agora ${fmtPrice(numOr0(p.markPrice))}\n` +
        `   ${pnl >= 0 ? "😎" : "🤧"} PnL <b>${sgn(pnl)} USDT</b> (${sgn(numOr0(p.unrealizedPnlRatio) * 100, 1)}% da margem)\n` +
        (numOr0(p.liquidationPrice) > 0 ? `   liq ${fmtPrice(numOr0(p.liquidationPrice))}\n` : "");
      const pp = paraPos(p), inf = infosRobo[idx];
      if (pp && inf) {
        const sug = await sugestaoPosicaoComSeta(SBrobo, chatId, pp, inf);
        msg += `   ${sug.emoji} <b>${sug.titulo}</b>\n${sug.seta ? `   Movimento: ${sug.seta}\n` : ""}`;
        if (mostrar.length <= 5) msg += `   <i>${sug.dica}</i>\n`;
        const trl = trailingTxt(pp, typeof inf.atr === "number" ? inf.atr : 0);
        if (trl) msg += `   ${trl}`;
      }
    }
    if (ps.length > 15) msg += `${MINI_DIVISOR}\n<i>(mostrando 15 de ${ps.length})</i>\n`;
    msg += `\n${DIVISOR}\n\n`;
  }
  if (fills === null) msg += `⚠️ Não consegui ler o resultado do dia: ${esc(erroFills)}\n`;
  else {
    const fech = fills.filter((f) => numOr0(f.fillPnl) !== 0);
    const soma = fech.reduce((s, f) => s + numOr0(f.fillPnl), 0);
    const cnt = contaPorOrdem(fech); // V54: por ordem de fechamento, não por execução
    msg += `📅 <b>Hoje</b> (desde 00h, UTC${X_TZ_OFFSET_H >= 0 ? "+" : ""}${X_TZ_OFFSET_H})\n`;
    if (!fills.length) msg += `Nenhuma execução hoje.\n`;
    else msg += `${fills.length} execução(ões), ${cnt.ordens} ordem(ns) de fechamento\nResultado realizado: <b>${sgn(soma)} USDT</b>` +
      (cnt.ordens ? ` | ${cnt.ganhos} ganho(s) × ${cnt.perdas} perda(s)` : "") + `\n`;
    if (fills.length >= 500) msg += `<i>(limite de 500 execuções lidas)</i>\n`;
  }
  msg += `\n<i>Só leitura. O resultado usa o fillPnl informado pela BloFin e pode não incluir taxas e funding. As sugestões usam Indicador + ADX + RSI e não são ordem de compra ou venda.</i>`;
  const falhouRobo = posicoes === null || fills === null;
  const botoesRobo = instsPos.length ? botoesAnalisarLista(instsPos) : [];
  await enviarEmPartes(chatId, msg, falhouRobo ? [...botoesRobo, [{ text: "🔄 Tentar de novo", callback_data: "/robo" }]] : (botoesRobo.length ? botoesRobo : undefined));
}
const ADMIN_CHAT_ID = String(Deno.env.get("ADMIN_CHAT_ID") || DONO_CHAT || "");
const ehAdmin = (chatId: number | string, remetente?: number | string | null) =>
  ADMIN_CHAT_ID !== "" && String(chatId) === ADMIN_CHAT_ID && String(remetente ?? chatId) === ADMIN_CHAT_ID;
const modoPicker: Botoes = [[{ text: "🎓 Novato", callback_data: "/modo novato" }, { text: "⚡ Experiente", callback_data: "/modo experiente" }]];
function textoEscolhaModo(): string {
  return "🎛️ <b>Antes de começar, escolha seu modo</b>\n" + MINI_DIVISOR + "\n\n" +
    "🎓 <b>Novato</b>\nAlertas e comandos vêm com a explicação completa — o quê, por quê e o que fazer.\n\n" +
    "⚡ <b>Experiente</b>\nSó as confirmações e os números, sem o texto explicando.\n\n" +
    "Dá pra trocar a qualquer hora com /modo.";
}
// V65: /help e /comandos separados.
// • /start: boas-vindas curtas, apontando pros dois.
// • /help: só o informativo — como o robô e os alertas funcionam (igual pros dois modos).
// • /comandos: só a lista de comandos, agrupada por assunto; Novato = explicação completa, Experiente = uma linha curta por comando.
function textoBoasVindas(chatId: number | string, modoAtual: Modo): string {
  return "🤖 <b>Pronto, já pode chamar as moedas</b>\n" + MINI_DIVISOR + "\n\n" +
    "🔎 <code>/analise ONE</code> — veredito completo de uma moeda\n" +
    "📖 <code>/comandos</code> — lista de todos os comandos\n" +
    "ℹ️ <code>/help</code> — como o robô e os alertas funcionam\n\n" +
    `🎛️ Modo: <b>${modoAtual === "experiente" ? "⚡ Experiente" : "🎓 Novato"}</b> (troque com /modo)\n` +
    `🆔 Seu chat_id: <b>${chatId}</b>`;
}
function textoHelp(chatId: number | string): string {
  let t = `ℹ️ <b>Como o robô e os alertas funcionam</b>\n${DIVISOR}\n\n`;

  t += "<b>🔌 O robô</b>\n";
  t += "Vira sozinho quando uma vela de 15m FECHA acima ou abaixo da linha; dentro da faixa, mantém a posição.\n\n";

  t += `${MINI_DIVISOR}\n<b>🔔 Os alertas</b>\n`;
  t += "Servem pra saber a hora de ligar o robô (PREPARE → LIGUE AGORA). São avisos, não ordens.\n";
  t += "🧭 Todo alerta traz a confiança X/10 (mesmos pontos do /analise).\n";
  t += "↩️ Se um aviso \"chegando\" não se confirmar (preço recuou), eu aviso pra você desligar o robô.\n";
  if (ALERT_CHAT_IDS.length) {
    t += `🔔 Alerta proativo ATIVO: aviso sozinho quando OPORTUNIDADE (≥${ALERT_OPORT_PCT_MIN}%) ou REVERSÃO (≥${ALERT_REV_PCT_MIN}%) estiver CHEGANDO, PERTO ou MUITO PERTO da linha`;
    if (ANTEC_ETA_MAX_CANDLES > 0) t += ` (aviso antecipado até ${ANTEC_ETA_MAX_CANDLES * TF_MIN} min antes)`;
    if (ALERT_FILTROS_ON) t += ", só com liquidez e tendência";
    t += `. Toda mensagem assim vem marcada com 🔔 na frente do título e some sozinha em até ${ALERTA_AUTOAPAGAR_MIN} min depois de enviada.\n`;
  } else {
    t += "🔔 Alerta proativo desativado (adicione seu ID em ALLOWED_CHAT_IDS + cron).\n";
  }
  t += "\n";

  if (FINAL_ON) {
    t += `${MINI_DIVISOR}\n<b>⏱ Minutos finais da vela</b>\n`;
    t += `🕒 Aos ~${FINAL_PREPARE_MAX_MIN} min do fechamento: PREPARE (moeda colada na linha).\n`;
    t += `🚨 Nos últimos ${FINAL_JANELA_MAX_MIN} min, com o preço já além da linha: "vai fechar cruzado, ligue o robô" (⚡ quando o fechamento cai em janela forte).\n`;
    t += "✅ Depois eu confirmo · 🛑 aviso se recuar · ❌ aviso se não cruzou.\n";
    t += "🔜 Se a vela fechar sem cruzar mas seguir perto, a chance passa pra próxima.\n\n";
  }

  if (ESTRAT_PUMP) {
    t += `${MINI_DIVISOR}\n<b>🎯 Modo pump</b>\n`;
    t += `🚀 Continuação: LONG em moeda que subiu e SHORT em moeda que caiu (confiança mín. ${CONF_MIN_OPORT}/10).\n`;
    t += `🔄 Reversão: SHORT em moeda que subiu (mín. ${CONF_MIN_REVERSAO}/10) e LONG em moeda que caiu só com sinais de fundo (mín. ${CONF_MIN_FUNDO_LONG}/10).\n\n`;
  }

  if (FUNDO_ON || TOPO_ON) {
    t += `${MINI_DIVISOR}\n<b>📡 Radares de fundo e topo</b>\n`;
    if (FUNDO_ON) t += `🟢 Fundo: aviso antecipado quando moeda que caiu ≥${FUNDO_QUEDA_MIN}% (em 24h ou desde o topo, inclusive depois de pump) mostra sinais de exaustão (confiança ≥${FUNDO_CONF_MIN}/10). Não é entrada: o robô só abre LONG ao cruzar acima do indicador.\n`;
    if (TOPO_ON) t += `🔴 Topo: espelho do de fundo — aviso antecipado quando moeda que subiu ≥${TOPO_ALTA_MIN}% (em 24h ou desde o fundo, inclusive depois de disparada) mostra sinais de exaustão (confiança ≥${TOPO_CONF_MIN}/10). Não é entrada: o robô só abre SHORT ao cruzar abaixo do indicador.\n`;
    t += "\n";
  }

  if (PROT_LUCRO_ON || RISCO_ON) {
    t += `${MINI_DIVISOR}\n<b>🛡️ Proteção das suas posições</b>\n`;
    if (PROT_LUCRO_ON) t += `🔒 No lucro: aviso pra subir o stop a cada ${TRAIL_ATR_MULT}×ATR de ganho e pra realizar parte se o RSI esticar (≥${ESTICADO_RSI}).\n`;
    if (RISCO_ON) t += `🚨 Risco: aviso quando a liquidação estiver a menos de ${RISCO_LIQ_PCT}% ou o prejuízo passar de ${RISCO_PERDA_PCT}% da margem.\n`;
    t += "\n";
  }

  if (LATERAL_ON) {
    t += `${MINI_DIVISOR}\n<b>🧱 Filtro de mercado lateral</b>\n`;
    t += `Lateral = mercado sem direção: o cruzamento tende a ser falso. O bot mede BTC e ETH (15m) com 3 requisitos; cada um que chega no mínimo vale ✅: ADX ≥ ${LATERAL_ADX_LIBERA} · ER ≥ ${LATERAL_ER_LIBERA} · caixa ${LATERAL_JAN / 4}h ≥ ${LATERAL_AMP_LIBERA}×ATR.\n`;
    t += `• 🛑 Lateral: BTC e ETH com no máximo ${3 - LATERAL_VOTOS} de 3 no mínimo.\n`;
    t += `• 👀 Querendo sair: ${LATERAL_VOTOS_QUER} requisito chegou no mínimo → aviso automático, mas ainda não confie.\n`;
    t += `• ✅ Liberado: ${LATERAL_VOTOS_LIBERA} de 3 no mínimo em BTC ou ETH → aviso automático 📈 "saindo da lateral".\n`;
    t += `Modo ${LATERAL_BARRA ? "bloqueia: o LIGUE AGORA fica barrado enquanto estiver lateral" : "visual: nada é barrado, os alertas só ganham a nota 🧱"}. Estado e números agora: /resumo · como funciona em detalhe: /estudo.\n\n`;
  }

  if (NOTICIAS_ON) {
    t += `${MINI_DIVISOR}\n<b>📰 Notícias</b>\n`;
    t += `Falas do Trump e manchetes de cripto/macro que mexem no mercado, sempre em português do Brasil${NOTICIAS_TRADUZIR_ON ? " (traduzidas pelo Gemini)" : ""}. Aparecem no /resumo e no /noticia, e o bot avisa sozinho quando sai algo de alto impacto.\n`;
    t += `Se a tradução não estiver disponível, o texto em inglês não aparece: vem só o link "ver original". Espere a vela fechar antes de confiar em cruzamento depois de uma notícia.\n\n`;
  }

  if (SILENCIO_ON) {
    t += `${MINI_DIVISOR}\n<b>🌙 Silêncio</b>\n`;
    t += SILENCIO_MODO === "mudo" ? `Das ${SILENCIO_INI_H}h às ${SILENCIO_FIM_H}h (horário local): tudo continua (alertas, placar, modo alerta do motor), só que as mensagens chegam sem som.\n\n` : `Das ${SILENCIO_INI_H}h às ${SILENCIO_FIM_H}h (horário local)${SILENCIO_PROTECAO ? ": só passa alerta de proteção de posição aberta" : ""}.\n\n`;
  }

  t += `${DIVISOR}\n📖 Lista de comandos: /comandos\n🆔 Seu chat_id: <b>${chatId}</b>`;
  return t;
}
// V107: /comandos reescrito — descrições curtas e diretas, comandos agrupados pelo que fazem (consultar, mercado, resultado dos
// alertas, simulações, motor) e as opções das simulações explicadas uma vez só, numa legenda.
function textoComandos(chatId: number | string, modoAtual: Modo, remetente: number | string): string {
  const c = modoAtual === "experiente"; // compacto: uma linha curta por comando
  let t = `📖 <b>Comandos</b>\n${DIVISOR}\n`;
  let primeiro = true;
  const sec = (titulo: string, itens: [string, string, string][], nota = "") => {
    t += primeiro ? `\n<b>${titulo}</b>\n` : `\n${MINI_DIVISOR}\n<b>${titulo}</b>\n`;
    primeiro = false;
    if (nota) t += `<i>${nota}</i>\n`;
    for (const [cmd, curto, longo] of itens) t += `${cmd} — ${c ? curto : longo}\n`;
  };

  sec("🔎 Consultar uma moeda", [
    ["🔎 /analise ONE", "veredito completo", "diz se é hora de ligar o robô (PREPARE / LIGUE AGORA), quanto falta pro fechamento da vela, a distância até a linha e o que fazer se você está de fora ou já dentro"],
    ["⚖️ /comparar ONE SOL", "qual das duas está mais forte", "calcula a nota de confiança das duas moedas e mostra lado a lado qual sinal está mais forte agora"],
    ["🤖 /pergunta ONE [pergunta]", "pergunta ao Gemini", "manda o /analise da moeda pro Gemini; sem pergunta, ele diz se é hora de ligar, esperar ou evitar"],
    ["🧠 /veredito ONE [pergunta]", "pergunta ao Claude", "igual ao /pergunta, mas quem responde é o Claude"],
    ["🏆 /melhor", "a IA escolhe a melhor da varredura", "roda /oportunidade e /reversao e pede pro Gemini apontar a moeda mais bem posicionada. É um primeiro filtro: confirme com /pergunta"],
    ["🎓 /estudo", "checklist antes de ligar", "os 8 pontos pra conferir no /analise antes de ligar o robô, mais a aula do filtro de mercado lateral"],
  ]);

  const varreduras: [string, string, string][] = [
    ["🚀 /oportunidade", "a favor do dia, perto da linha", "moedas perto da linha a favor do dia: LONG nas que subiram, SHORT nas que caíram (com liquidez e tendência)"],
    ["🔄 /reversao", "contra o dia, perto da linha", "moedas perto da linha contra o dia: SHORT nas que subiram e LONG nas que caíram (este só com sinal de fundo)"],
  ];
  if (FUNDO_ON) varreduras.push(["🟢 /fundo", "caíram e mostram sinal de fundo", `caíram ${FUNDO_QUEDA_MIN}%+ e já mostram sinal de fundo (possível virada pra LONG). ⭐ Repique vem primeiro: disparou, voltou até a faixa e está segurando`]);
  if (TOPO_ON) varreduras.push(["🔴 /topo", "subiram e mostram sinal de topo", `subiram ${TOPO_ALTA_MIN}%+ e já mostram sinal de topo (possível virada pra SHORT). ⭐ Repique vem primeiro: despencou, voltou até a faixa e foi rejeitada`]);
  sec("📡 Procurar moedas", varreduras);

  sec("⭐ Acompanhar", [
    ["📋 /lista", "moedas em acompanhamento", "moedas que o bot está acompanhando depois de um alerta: como era no alerta e como estão agora"],
    ["⭐ /seguir ONE", "seguir uma moeda", "o bot avisa dessa moeda mesmo fora das que mais andaram. Sem moeda, mostra as que você segue (com botões 🔎 e ❌)"],
    ["❌ /parar ONE", "parar de seguir", "deixa de seguir a moeda"],
  ]);

  sec("📰 Mercado", [
    ["🌅 /resumo", "painel do dia", "painel do dia (21h a 21h), atualizado a cada hora: agenda, notícias, BTC, suas posições e janelas fortes. Às 21h fecha o dia com seu resultado real e o comparativo com o dia anterior"],
    ["📰 /noticia", "notícias que mexem no mercado", "falas do Trump e manchetes de cripto/macro de impacto, em português. Filtre com /noticia trump, /noticia cripto ou /noticia 24 (horas). Avisa sozinho quando sai algo forte"],
    ["📅 /agenda", "dados econômicos de hoje e amanhã", "CPI, payroll, Fed e outros dados de hoje e amanhã. Avisa 60 e 15 min antes e depois compara o resultado com a projeção"],
    ["📐 /div", "divergência de RSI do BTC", "divergências de RSI do BTC (normal e oculta) em 1h, 4h, diário e semanal: as que estão em aberto e o que o BTC fez depois de cada uma. /div diag explica por que avisou ou não"],
  ]);

  sec("📊 Como os alertas se saíram", [
    ["📊 /placar 7", "acerto dos alertas", "acerto dos alertas em 1h, 4h e 24h"],
    ["⏱ /15min 7", "acerto em 15 min", "acerto só em 15 min: alertas frescos, profit factor e extremos"],
    ["📡 /radar 7", "o que veio depois dos radares", "pros alertas de topo e fundo: quantos funcionaram, quantos foram invalidados e quanto o preço andou, separado pelo humor do BTC e pelo movimento da moeda no dia"],
    ["🎯 /radarconf 30", "radares por nota", "acerto dos radares de topo e de fundo em cada nota de confiança, pra ver se nota maior acerta mais"],
    ["🔄 /reversaoconf 30", "reversão por nota, lado e ADX", "acerto só da reversão, por nota, lado, força do ADX e quanto a moeda já tinha esticado, comparando com o que a regra de ADX/DI barrou (🌑 sombra)"],
    ["⭐ /repsombra 30", "repique: alertou x barrado", "repiques que alertaram x os que a regra de ADX/DI barrou: acerto e retorno de cada grupo, pra ver se a regra está cortando sinal bom"],
    ["🗜️ /compressao 30", "compressão por nota, ADX e lado", "qual nota, ADX e lado rendem mais na compressão, pra decidir se vale subir a nota mínima"],
    ["💧 /volconf 7", "resultado por volume", "como os alertas se saem por faixa de volume (em USDT e em unidades da moeda), incluindo os que ficaram abaixo do filtro (🌑 sombra). Até 9 dias"],
    ["🌑 /sombras 7", "o que as regras barraram x o que alertou", "num lugar só (reversão, repique e volume): o que alertou x o que a regra barrou e se a regra está ajudando, atrapalhando ou se ainda é cedo pra dizer. Chega sozinho uma vez por semana"],
    ["📚 /radarhist 30", "histórico longo dos radares", "o mesmo do /radar, guardado dia a dia (passa dos 9 dias de velas). Grava sozinho às 21h; /radarhist gravar força agora"],
    ["🔪 /faca 7", "fundos com ADX alto (SHORT)", "fundos com ADX alto que podem continuar caindo, gravados em silêncio: o que aconteceu depois. Fica fora do /placar"],
    ["🚀 /foguete 7", "topos com ADX alto (LONG)", "espelho da faca: topos com ADX alto que podem continuar subindo. A nota mede o quanto parece topo, então nota alta não é LONG melhor"],
    ["🔎 ... desde V107", "só depois de uma versão ou data", "coloque \"desde V107\" ou \"desde 05/10\" no fim de qualquer comando desta lista pra julgar uma regra só com dados depois dela. Ex.: /radarconf 90 desde V104"],
  ], c ? "o número é a quantidade de dias" : "O número é a quantidade de dias. O ± nas porcentagens é a margem de erro: se as faixas de duas fatias se cruzam, a diferença ainda pode ser sorte.");

  sec("🧪 Simulações", [
    ["🚪 /saida 7", "o robô virando a cada cruzamento", "simula o robô ligado nos alertas, virando a cada cruzamento e com o trailing do motor. Já filtra do seu jeito (moeda 8%+ no dia e ADX 14+ subindo). Extras: tudo (sem filtro), mov15, comp/oport/rev/fundo/topo, ou uma moeda (/saida QNT)"],
    ["🧪 /radarsim 9", "operar os alertas com stop, alvo e prazo", "entra nos alertas de topo, fundo e repique e sai no stop, no alvo ou no prazo. Extras: romp (entra no rompimento da vela), regra, btc, mov. Com cruz usa os alertas de cruzamento: entra junto com o robô e segue com stop, sem virar (viradas 0,1,3 compara deixar virar até N vezes)"],
    ["🔪 /facasim 7", "faca: onde entrar no SHORT", "compara entrar direto, no rompimento da vela ou no rompimento do último fundo, com várias saídas (stop apertado, normal e solto, alvo curto, zero a zero, stop móvel). /facasim 7 foguete faz o mesmo pro LONG"],
    ["🔀 /juncao 7", "compara as junções da faixa", "recalcula a faixa nas versões clássica, rápida e rápida + 144 (e nas suas, com medias 9,20,21,30) e compara serrote, robô virando e rotina com stop e alvo. Com pura, cada J6 também sozinha, sem a SUPREMA (/juncao 7 pura). Com mov no fim, separa pelo quanto a moeda andou no dia. Com novos, compara a faixa do bot com SuperTrend, faixa com folga, Chandelier e Donchian (/juncao 7 novos). Com filtros, roda o motor com ADX, Choppiness e ER (/juncao 7 novos filtros)"],
    ["🕯️ /velas 30", "as velas num arquivo", "manda as velas de 15m das moedas do /juncao num arquivo CSV (até 60 dias; moedas60 escolhe quantas moedas), pra testar combinações fora do bot"],
  ], c ? "stop1 · alvo2 · horas 1,2,4 · trail1 · arma1 · be1 · stop0/alvo0 = sem · listas comparam tudo" : "Opções: stop1 = stop a 1 ATR do 15m · alvo2 = alvo em 2R · horas 1,2,4 = prazo · trail1 = stop móvel a 1 ATR · arma1 = o stop móvel só começa depois de +1 ATR · be1 = zero a zero depois de +1 ATR · stop0/alvo0 = sem. Com listas (stop1,1.5) compara todas as combinações. 2 a 3 ATR do 15m ≈ 1 ATR do 1h.");

  sec("🤖 Motor", [
    ["🧾 /trades 7", "trades reais do motor", "histórico real do motor: acertos, resultado, taxas, por que cada operação saiu (virada, trailing, stop, alvo, prazo) e as melhores e piores moedas"],
    ["🧪 /motorteste", "testa a ligação com o motor", "manda um alerta de teste (BTC, ou /motorteste SOL). O motor grava e recusa de propósito, sem abrir ordem. Se aparecer no site em \"não entraram\", a ligação está ok"],
  ]);

  const temChave = !!credDe(chatId);
  sec("💼 Sua conta BloFin", [
    ["💼 /robo", `posições e sugestões${temChave ? "" : " 🔒"}`, "suas posições abertas, uma sugestão pra cada uma e o resultado do dia (só leitura)"],
    ["🧾 /meuplacar 7", `seus trades x alertas${temChave ? "" : " 🔒"}`, "seus trades reais comparados com os alertas do bot"],
  ]);
  if (!c) t += temChave ? "🔑 chave vinculada a este chat\n" : "🔒 nenhuma chave BloFin vinculada a este chat: esses dois ficam desativados aqui\n";

  const ajustes: [string, string, string][] = [
    ["⏸ /pausar", "pausa os alertas", "pausa os alertas por 1h, 2h ou 3h"],
    ["▶️ /retomar", "volta os alertas", "volta os alertas antes do fim da pausa"],
    ["⌨️ /menu", "teclado fixo", "mostra o teclado de atalhos aqui embaixo"],
    ["🎛️ /modo", `agora: ${c ? "⚡ Experiente" : "🎓 Novato"}`, `troca entre Novato (explicações completas) e Experiente (resumido). Agora: ${c ? "⚡ Experiente" : "🎓 Novato"}`],
    ["🩺 /status", "testa as conexões", "testa Supabase, corretora, sua conta BloFin e o cron"],
  ];
  if (ehAdmin(chatId, remetente)) {
    ajustes.push(["⚙️ /config", "configuração em uso", "tudo o que está valendo agora, por assunto (só admin)"]);
    ajustes.push(["⚙️ /config mudou", "só o que difere do padrão", "os Secrets que você mudou (com o padrão ao lado), os valores inválidos que o bot está ignorando e os demais definidos (tokens e chaves ocultos)"]);
    ajustes.push(["📜 /logs", "nível de log", "quanto a função escreve no log (tudo, normal, erro ou mudo), quantos foram ocultados e como mudar"]);
  }
  sec("⚙️ Ajustes", ajustes);

  t += `\n${DIVISOR}\nℹ️ Como o robô e os alertas funcionam: /help\n`;
  t += c ? `🆔 chat_id: ${chatId}${ALERT_CHAT_IDS.length ? ` · 🔔 alertas ativos (${ALERT_OPORT_PCT_MIN}%+ / ${ALERT_REV_PCT_MIN}%+)` : " · 🔔 alertas desativados"}` : `🆔 Seu chat_id: <b>${chatId}</b>`;
  return t;
}
function textoEstudo(blocoAgenda = ""): string {
  // V70: tudo numa mensagem só (≤ ~3,3k caracteres sem a agenda); itens curtos, separados por linha em branco
  let t = `🎓 <b>CHECKLIST — antes de ligar o robô</b>\n${DIVISOR}\n`;
  t += `Baseado no que já sai no /analise. Leia de cima pra baixo.\n\n`;
  t += `<b>1. Cruzou há quanto tempo?</b>\nFresco (até 2 velas) = ok. \"Cruzada há Xh (já passou)\" é caso de atraso: redobre a atenção nos próximos pontos.\n\n`;
  t += `<b>2. Apareceu ⚠️ \"já esticou\"?</b>\nO preço foi longe demais a favor do robô sem radar de reversão aceso: o sinal mais direto de \"não é hora\".\n\n`;
  t += `<b>3. \"ADX subindo, mas puxado pelo lado oposto\"?</b>\nO ADX engana: a força real é do lado contrário. Não bloqueia sozinho, mas pesa contra.\n\n`;
  t += `<b>4. Radar de fundo ou topo aceso?</b>\nSe sim, o esticado é sinal de possível reversão, não de continuação (diferente do item 2).\n\n`;
  t += `<b>5. O filtro de lateral está bloqueando?</b>\nSe apareceu o aviso 🧱, o cruzamento tende a ser falso: segure. Aula completa no fim 📚\n\n`;
  t += `<b>6. Funding e BTC/ETH a favor ou contra?</b>\nFunding esticado do seu lado = multidão lotada, risco de virada brusca. BTC/ETH fortes contra = espere.\n\n`;
  t += `<b>7. Dado econômico saindo ou que acabou de sair?</b>\nCPI, payroll, PCE e Fed movem o preço nos dois sentidos. Cruzamento perto do dado costuma ser só a reação, não tendência.\n${blocoAgenda ? blocoAgenda : ""}\n`;
  t += `<b>8. A confiança do /analise está alta?</b>\nConfira se a nota bate com os itens acima. Se tudo pede cautela e a nota saiu alta, entenda por quê.\n\n`;
  t += textoAulaLateral();
  t += `${DIVISOR}\n<i>Estatístico, não é recomendação.</i>`;
  return t;
}
// V70: aula do filtro de mercado lateral (o que é e como funciona). Texto fixo, usa os mínimos em uso. O estado AGORA fica no /resumo.
function textoAulaLateral(): string {
  if (!LATERAL_ON) return "";
  let t = `${DIVISOR}\n📚 <b>ENTENDENDO O FILTRO DE LATERAL</b>\n${DIVISOR}\n`;
  t += `Lateral = preço indo e voltando sem direção; aí o cruzamento do robô costuma ser falso. O bot mede <b>BTC e ETH</b> (15m) com 3 requisitos, e cada um que chega no mínimo ganha ✅:\n`;
  t += `• <b>ADX ≥ ${LATERAL_ADX_LIBERA}</b> — força da tendência\n`;
  t += `• <b>ER ≥ ${LATERAL_ER_LIBERA}</b> — eficiência: perto de 0 o preço vai e volta, perto de 1 anda reto\n`;
  t += `• <b>Caixa ≥ ${LATERAL_AMP_LIBERA}×ATR</b> — quanto o preço andou nas últimas ${LATERAL_JAN / 4}h; menos que isso = preso numa caixa\n\n`;
  t += `<b>Estados</b> (BTC e ETH têm de 0 a 3 ✅):\n`;
  t += `🛑 <b>Lateral</b> — BTC e ETH com até ${3 - LATERAL_VOTOS} de 3 ✅. ${LATERAL_BARRA ? "O LIGUE AGORA fica barrado." : "Os alertas saem com a nota 🧱."}\n`;
  t += `🟡 <b>Querendo sair</b> — ${LATERAL_VOTOS_QUER} ✅ chegou. Aviso 👀 automático; ainda não confie.\n`;
  t += `✅ <b>Liberado</b> — ${LATERAL_VOTOS_LIBERA} de 3 ✅ em BTC <i>ou</i> ETH. Aviso 📈 automático.\n`;
  t += `Depois de liberar, espera ${LATERAL_HOLD_MIN} min antes de marcar lateral de novo (evita piscar).\n\n`;
  t += `<b>Modo atual: ${LATERAL_BARRA ? "bloqueia" : "visual"}</b> — ${LATERAL_BARRA ? "enquanto lateral, o LIGUE AGORA e as entradas ficam barrados (PREPARE e radares seguem)." : "nada é barrado, a decisão é sua."}\n`;
  t += `<b>Na prática:</b> lateral → segure · querendo sair → espere a vela fechar · liberado → siga o checklist.\n`;
  t += `Estado agora: /resumo\n`;
  return t;
}
// V107: /config reescrito — organizado por assunto, em linguagem direta, sem número de versão nem nome de Secret no meio do texto
// (os nomes dos Secrets ficam no /config mudou). Antes terminava com cortar(), que jogava fora tudo depois de ~4000 caracteres.
function montarConfig(): string {
  const est = (b: boolean) => (b ? "ligado" : "desligado");
  const tit = (emoji: string, nome: string, ligado?: boolean, extra = "") =>
    `${emoji} <b>${nome}</b>${ligado === undefined ? "" : ` · ${est(ligado)}`}${extra}\n`;
  const tz = `UTC${X_TZ_OFFSET_H >= 0 ? "+" : ""}${X_TZ_OFFSET_H}`;
  const adminFixo = !!Deno.env.get("ADMIN_CHAT_ID") || !!Deno.env.get("BLOFIN_OWNER_CHAT_ID");
  const hJan = Math.round(FUNDO_JAN_PICO / 4);
  const fmtMin = (min: number) => (min >= 60 && min % 60 === 0 ? `${min / 60}h` : `${min} min`);
  let m = `⚙️ <b>CONFIGURAÇÃO</b> · ${BOT_VERSAO}\n`;
  m += `<i>O que está valendo agora. Pra mudar, edite o Secret no Supabase e publique de novo. Nomes dos Secrets e o que difere do padrão: /config mudou</i>\n${DIVISOR}\n\n`;

  // ── alertas ──
  m += tit("🔔", "Alertas de cruzamento");
  m += `• Oportunidade (a favor do dia): moeda com ${ALERT_OPORT_PCT_MIN}%+ em 24h\n`;
  m += `• Reversão (contra o dia): moeda com ${ALERT_REV_PCT_MIN}%+ em 24h\n`;
  m += `• Aviso antecipado até ${ANTEC_ETA_MAX_CANDLES * TF_MIN} min antes (${ANTEC_ETA_MAX_CANDLES} velas), com o preço a até ${ANTEC_DIST_MAX_PCT}% da linha\n`;
  m += `• Alarme falso: cancela se a distância até a linha crescer ${Math.round((ANTEC_CANCELA_RECUO - 1) * 100)}%+ ou o prazo passar do dobro\n`;
  m += `• Só cruzamento recente: até ${ALERT_FRESCO_CANDLES} velas${ALERT_IDADE_MAX_CANDLES ? ` (idade máxima ${ALERT_IDADE_MAX_CANDLES} velas)` : ""}\n`;
  m += `• Até ${ALERT_MAX_POR_RODADA} alertas por rodada, entre as ${ALERT_POOL} moedas que mais andaram\n`;
  m += `• Mesma moeda: espera ${fmtMin(ALERT_COOLDOWN_MIN)} (alerta idêntico: ${fmtMin(ALERT_COOLDOWN_REPETIDO_MIN)})\n`;
  m += `• Acompanha a moeda por ${WATCH_HORAS}h depois do alerta${WATCH_REPETIR ? ", avisando de novo a cada virada" : ""}\n`;
  m += `• /oportunidade e /reversao: as ${LISTA_POOL_LADO} que mais subiram + as ${LISTA_POOL_LADO} que mais caíram\n`;
  m += `• Alertas somem sozinhos: ${ALERTA_AUTOAPAGAR_MIN > 0 ? `depois de ${fmtMin(ALERTA_AUTOAPAGAR_MIN)}` : "não (ficam no chat)"}\n\n`;

  m += tit("⏱", "Minutos finais da vela", FINAL_ON);
  if (FINAL_ON) {
    m += `• 🕒 PREPARE: de ${FINAL_PREPARE_MAX_MIN} a ${FINAL_JANELA_MAX_MIN} min antes do fechamento, moeda a até ${FINAL_PREPARE_DIST_PCT}% da linha e chegando (até ${FINAL_PREPARE_MAX} por rodada)\n`;
    m += `• 🚨 LIGUE AGORA: de ${FINAL_JANELA_MAX_MIN} a ${FINAL_JANELA_MIN_MIN} min antes, com o preço já ${FINAL_ENTRADA_PCT}%+ além da linha\n`;
    m += `• Só cancela se o preço voltar ${FINAL_CANCELA_PCT}% (ou ${FINAL_CANCELA_ATR}×ATR) pra dentro da linha\n`;
    m += `• 🔜 Fechou sem cruzar mas segue a até ${FINAL_PROXIMA_DIST_PCT}% da linha: avisa que a chance passa pra próxima vela\n`;
    m += `• Olha só moedas a até ${FINAL_PREFILTRO_PCT}% da linha · até ${FINAL_MAX_POR_RODADA} por rodada · ✅/❌ no fechamento\n`;
    m += `• ⚡ marca quando o fechamento cai numa janela forte de horário · placar próprio no /placar: ${FINAL_PLACAR_ON ? "sim" : "não"}\n`;
  }
  m += "\n";

  // ── nota ──
  m += tit("🧮", "Nota de confiança (0 a 10)");
  m += `• 🟢 verde a partir de ${CONF_VERDE} · 🟡 amarelo a partir de ${CONF_AMARELO}\n`;
  if (ESTRAT_PUMP) m += `• Modo pump: nota mínima ${CONF_MIN_OPORT} na oportunidade e ${CONF_MIN_REVERSAO} na reversão · até ${LIMITE_LADO} alertas por lado\n`;
  m += `• LONG em moeda que caiu: ${FUNDO_LIBERA_LONG ? `só com sinal de fundo (nota mínima ${CONF_MIN_FUNDO_LONG})` : "bloqueado"}\n`;
  m += `• Moeda serrilhando (${SERROTE_MAX}+ trocas de lado em 4h): barrada\n`;
  m += `• BTC: ${BTC_DIR_ON ? `andar ${BTC_DIR_PCT}%+ em 1h conta ponto` : "não conta"}${BTC_BLOQ_REV_PCT > 0 ? ` · reversão contra um BTC andando ${BTC_BLOQ_REV_PCT}%+ em 1h é barrada (SHORT com BTC subindo, LONG com BTC caindo)` : ""}\n`;
  m += `• Inclinação da faixa (${INCLINA_JAN} velas): forte (${INCLINA_FORTE}+) tira 2 pontos de quem vai contra · moderada (${INCLINA_MOD}+) tira 1 contra e dá 1 a favor · plana até ${INCLINA_PLANA}. Com sinal de fundo/topo, pesa menos\n`;
  m += `• 1º cruzamento com a faixa comprimida e sem volume (abaixo de ${VOL_ACEL_RATIO}× a média): −1\n`;
  m += `• Squeeze: faixa até ${Math.round(SQUEEZE_REL * 100)}% da típica · volume forte ${VOL_ACEL_RATIO}×+ · seco até ${VOL_SECO_RATIO}×\n`;
  m += `• Book (desequilíbrio de ${BOOK_IMB_MIN_PCT}%+) e inclinação também contam a favor ou contra a virada\n`;
  m += `• Força escondida (+DI/−DI): ${DI_OCULTO_ON ? `se o ADX está forte mas puxado pelo lado oposto, vale +1 em vez de +2 (diferença mínima ${DI_GAP_MIN}). Não mexe na reversão` : "desligada"}\n\n`;

  // ── radares ──
  m += tit("🟢", "Radar de fundo", FUNDO_ON);
  if (FUNDO_ON) {
    m += `• Moeda que caiu ${FUNDO_QUEDA_MIN}%+ (em 24h ou desde a máxima das últimas ${hJan}h), incluindo as ${ALERT_POOL_RECUO} que mais recuaram\n`;
    m += `• Toque na faixa depois de recuar ${FUNDO_TOQUE_PICO_MIN}%+ conta ponto · nota mínima ${FUNDO_CONF_MIN} (pré-seleção ${FUNDO_PRE_MIN} pts)\n`;
    m += `• ADX: ${FUNDO_ADX_MAX > 0 ? `não alerta com ADX ${FUNDO_ADX_MAX}+ (queda forte demais)` : "sem corte"} · BTC caindo ${FUNDO_BTC_QUEDA_PCT}%+ em 1h tira ponto\n`;
    m += `• Mesma moeda: espera ${fmtMin(FUNDO_COOLDOWN_MIN)} · até ${FUNDO_MAX_POR_RODADA} por rodada\n`;
    m += `• 🔪 Modo faca: ${FACA_MODO === "off" ? "desligado" : `fundo com ADX ${FACA_ADX_MIN}+ e nota ${FACA_CONF_MIN}+ vira candidato a SHORT de continuação (${FACA_MODO === "alerta" ? "grava e avisa" : "só grava, sem avisar"}) · /faca`}\n`;
  }
  m += "\n";

  m += tit("🔴", "Radar de topo", TOPO_ON);
  if (TOPO_ON) {
    m += `• Moeda que subiu ${TOPO_ALTA_MIN}%+ (em 24h ou desde a mínima das últimas ${hJan}h), incluindo as ${ALERT_POOL_ALTA} que mais subiram\n`;
    m += `• Rejeição na faixa depois de subir ${TOPO_TOQUE_VALE_MIN}%+ conta ponto · nota mínima ${TOPO_CONF_MIN} (pré-seleção ${TOPO_PRE_MIN} pts)\n`;
    m += `• ADX: ${TOPO_ADX_MAX > 0 ? `só alerta com ADX abaixo de ${TOPO_ADX_MAX} (o repique não entra nesse corte)` : "sem corte"} · mesma moeda: espera ${fmtMin(TOPO_COOLDOWN_MIN)}\n`;
    m += `• 🚀 Modo foguete: ${FOGUETE_MODO === "off" ? "desligado" : `topo com ADX ${FOGUETE_ADX_MIN}+ e nota ${FOGUETE_GRAVA_MIN}+ vira candidato a LONG de continuação (só grava, sem avisar) · /foguete`}\n`;
  }
  m += "\n";

  m += tit("⭐", "Repique");
  m += `• Nos dois lados: SHORT no radar de topo, LONG no de fundo\n`;
  m += repRegraTxt().startsWith("sem") ? `• Sem corte por ADX/DI\n` : `• Só alerta com ${repRegraTxt()}; o que a regra barra fica gravado na 🌑 sombra (/repsombra)\n`;
  m += `• +${REPIQUE_BONUS} na nota · nota mínima ${REPIQUE_CONF_MIN} · espera ${fmtMin(REPIQUE_COOLDOWN_MIN)} · até ${REPIQUE_MAX_POR_RODADA} por rodada\n`;
  m += `• Oportunidade x reversão só conta se o dia andou mais de ±${REPIQUE_PCT_ZONA}% (perto de 0% é ruído)\n\n`;

  m += tit("🗜️", "Compressão", COMPRESS_ON);
  if (COMPRESS_ON) {
    m += `• Faixa até ${Math.round(SQUEEZE_REL * 100)}% da típica (muito comprimida: até ${Math.round(COMPRESS_REL * 100)}%) · volume ${COMPRESS_VOL_MIN}×+ · nota mínima ${COMPRESS_CONF_MIN}\n`;
    m += `• Olha ${COMPRESS_ROT_N} moedas por rodada (em rodízio) · espera ${fmtMin(COMPRESS_COOLDOWN_MIN)} · até ${COMPRESS_MAX_POR_RODADA} por rodada\n`;
    m += `• Entra no /placar pelo lado da 1ª vela que fechar fora da faixa (em até ${ENTRADA_MAX_CANDLES * TF_MIN} min)\n`;
  }
  m += "\n";

  // ── filtros ──
  m += tit("🧹", "Filtros", ALERT_FILTROS_ON);
  m += `• Volume de ${(FILTRO_VOL_MIN_USDT / 1e6).toFixed(1)}M USDT+ em 24h\n`;
  m += `• ADX ${FILTRO_ADX_MIN}+${FILTRO_ADX_SUBINDO ? ` e subindo${FILTRO_ADX_SUBINDO_ATE > 0 ? ` (só exige subir enquanto estiver abaixo de ${FILTRO_ADX_SUBINDO_ATE})` : ""}` : ""}\n`;
  m += `• RSI: ${ESTRAT_PUMP ? `LONG barrado acima de ${FILTRO_RSI_MAX_LONG} · SHORT barrado abaixo de ${FILTRO_RSI_MIN}` : `entre ${FILTRO_RSI_MIN} e ${FILTRO_RSI_MAX}`}\n`;
  m += `• Distância até a linha: até ${FILTRO_DIST_MAX_PCT}% (só nas listas)${FILTRO_AMPLITUDE_MIN > 0 ? ` · amplitude mínima ${FILTRO_AMPLITUDE_MIN}%` : ""}\n`;
  m += `• 🚫 Moedas bloqueadas: ${BLACKLIST_MOEDAS.size ? [...BLACKLIST_MOEDAS].sort().join(", ") : "nenhuma"}\n\n`;

  m += tit("🧱", "Mercado lateral", LATERAL_ON, LATERAL_ON ? ` · ${LATERAL_BARRA ? "bloqueia" : "só avisa"}` : "");
  if (LATERAL_ON) {
    m += `• Mede BTC e ETH no 15m com 3 sinais: ADX, eficiência (ER) e caixa (quanto andou em ${LATERAL_JAN / 4}h, em ATRs)\n`;
    m += LATERAL_BARRA
      ? `• Bloqueia o LIGUE AGORA e as entradas quando os dois têm ${LATERAL_VOTOS} de 3 sinais de lateral (${latRegras()}) e nenhum de tendência\n• Libera quando um deles tem ${latQtdLibera()} (${latRegrasTend()}); depois espera ${LATERAL_HOLD_MIN} min antes de bloquear de novo\n• PREPARE e radares continuam saindo, com a nota 🧱\n`
      : `• Nada é barrado: os alertas ganham a nota 🧱 quando os dois têm ${LATERAL_VOTOS} de 3 sinais de lateral (${latRegras()}) e nenhum de tendência\n`;
    m += `• Avisos: 📈 saindo da lateral ${LATERAL_AVISO_ON ? "sim" : "não"} · 📉 entrando ${LATERAL_AVISO_ENTROU_ON ? "sim" : "não"} · no máximo 1 a cada ${LATERAL_AVISO_MIN} min\n`;
  }
  m += "\n";

  // ── posições ──
  m += tit("🎯", "Stop, alvo e proteção");
  m += `• Stop: faixa + ${STOP_ATR_MULT}×ATR (reserva ${STOP_ATR_RESERVA}×ATR) · alvo ${ALVO_RR}R\n`;
  m += `• Avisos de lucro: ${PROT_LUCRO_ON ? `subir o stop a cada ${TRAIL_ATR_MULT}×ATR de ganho · realizar parte com RSI ${ESTICADO_RSI}+ (LONG) ou até ${100 - ESTICADO_RSI} (SHORT)` : "desligados"}\n`;
  m += `• 🚨 Risco: ${RISCO_ON ? `liquidação a menos de ${RISCO_LIQ_PCT}% (crítico ${RISCO_LIQ_CRITICO_PCT}%) · prejuízo de ${RISCO_PERDA_PCT}%+ (crítico ${RISCO_PERDA_CRITICA_PCT}%) · repete a cada ${fmtMin(RISCO_COOLDOWN_MIN)}` : "desligado"}\n\n`;

  m += tit("📏", "Placar");
  m += `• Entrada no fechamento da vela que cruzou: ${est(PLACAR_ENTRADA_ON && _placarTemEntrada)}${PLACAR_ENTRADA_ON && !_placarTemEntrada ? " ⚠️ faltam colunas no Supabase (rode o ALTER TABLE da V30)" : ""}\n`;
  m += `• O cruzamento vale até ${ENTRADA_MAX_CANDLES * TF_MIN} min (${ENTRADA_MAX_CANDLES} velas) depois do aviso\n`;
  m += `• Taxa descontada: ${TAXA_IDA_VOLTA_PCT.toFixed(3)}% ida e volta (${TAXA_TAKER_PCT}% por ordem)\n`;
  m += `• Aviso antecipado se auto-ajusta: ${AUTO_CALIB_ON ? `a cada ${AUTO_CALIB_INTERVALO_H}h, com ${AUTO_CALIB_DIAS} dias de dados (mínimo ${ANTEC_CALIB_MIN} amostras)` : "não"}\n`;
  m += `• Confiabilidade por moeda: mínimo ${CONFIAB_MIN_AMOSTRA} entre as últimas ${CONFIAB_JANELA_N} previsões\n\n`;

  m += tit("🤖", "Motor · modo alerta");
  m += MOTOR_URL && MOTOR_ALERTA_SECRET
    ? `• Alertas de fundo e oportunidades que cruzaram (até ${OPORT_MOTOR_MAX_MIN} min depois) vão pro motor\n• Ligar, simular, tipos, tamanho e limites: no site\n\n`
    : `• ⚠️ Não envia: faltam os Secrets MOTOR_URL e/ou MOTOR_ALERTA_SECRET\n\n`;

  // ── rotina ──
  m += tit("🌙", "Horários");
  m += `• Silêncio: ${SILENCIO_ON ? `das ${SILENCIO_INI_H}h às ${SILENCIO_FIM_H}h (${tz}) · ${SILENCIO_MODO === "mudo" ? "modo mudo: tudo continua, só chega sem som" : `modo pausa: alertas param${SILENCIO_PROTECAO ? ", só passa proteção de posição" : ""}`}` : "desligado"}\n`;
  m += `• Resumos: ${RESUMO_ON ? `manhã ${RESUMO_MANHA_H}h · noite ${RESUMO_NOITE_H}h` : "desligados"} · "FIM DO RESUMO" some ${PAINEL_FIM_APAGAR_H > 0 ? `em ${PAINEL_FIM_APAGAR_H}h` : "nunca"}\n`;
  m += `• ⭐ Até ${SEG_MAX} moedas seguidas por pessoa\n\n`;

  m += tit("🧠", "IA");
  const ia = (nome: string, cmds: string, temChave: boolean, lim: number) =>
    `• ${nome} (${cmds}): ${temChave ? "✅ pronta" : "⚠️ sem chave"} · ${lim > 0 ? `até ${lim}/dia` : "sem limite diário"}\n`;
  m += ia("Gemini", "/pergunta, /melhor", !!Deno.env.get("GEMINI_API_KEY"), IA_LIMITE_DIARIO_GEMINI);
  m += ia("Claude", "/veredito", !!Deno.env.get("ANTHROPIC_API_KEY"), IA_LIMITE_DIARIO_CLAUDE);
  m += `• Avisa quando faltarem ${IA_AVISO_RESTANTE} consultas\n\n`;

  m += tit("🔧", "Sistema");
  m += `• Cron: avisa se parar por ${CRON_AVISO_MIN}+ min (/status marca a partir de ${CRON_ALERTA_MIN} min) · trava de ${(CRON_LOCK_TIMEOUT_MS / 1000).toFixed(0)}s contra rodada dupla\n`;
  m += `• Fonte reserva de dados: avisa quando passa de ${FONTE_FALLBACK_PCT}% das consultas, normaliza abaixo de ${FONTE_NORMALIZA_PCT}%\n`;
  m += `• Segurança: webhook ${WEBHOOK_SECRET ? "protegido ✅" : "sem senha ⚠️"} · cron ${CRON_SO_HEADER ? "só aceita senha no cabeçalho ✅" : "aceita senha na URL ⚠️"}\n\n`;

  m += tit("👥", "Acesso");
  m += `• ${ALLOWED_CHAT_IDS.length} chat(s) liberado(s) · ${ALERT_CHAT_IDS.length} recebem alertas${ALERT_EXCLUIR.length ? ` (${ALERT_EXCLUIR.length} fora)` : ""} · ${Object.keys(BLOFIN_USERS).length + (BLOFIN_LEGADO ? 1 : 0)} com chave BloFin\n`;
  m += `• 🔑 Admin: <b>${ADMIN_CHAT_ID || "não definido"}</b>${adminFixo ? "" : " ⚠️ vem do 1º da lista de chats; fixe com o Secret ADMIN_CHAT_ID"}\n`;
  m += `\n<i>Tokens e chaves nunca aparecem aqui.</i>`;
  return m;
}
// V109: o tratamento da requisição virou uma função com nome (antes era anônima dentro do Deno.serve) pra os pedidos de análise poderem
// chamar o mesmo roteador de comandos por dentro (executarComandoCapturado). Pro Telegram e pro cron nada muda.
async function tratarRequisicao(req: Request): Promise<Response> {
  try {
    const urlObj = new URL(req.url);
    const cronQuery = urlObj.searchParams.get("cron_secret");
    const cronHeader = req.headers.get("x-cron-secret");
    const cronOk = !!CRON_SECRET && (
      (cronHeader !== null && igualSeguro(cronHeader, CRON_SECRET)) ||
      (!CRON_SO_HEADER && cronQuery !== null && igualSeguro(cronQuery, CRON_SECRET)));
    if (cronOk) {
      // V109: requisição separada só pros pedidos de análise (aberta pela rodada do cron quando há pedido na tabela)
      if (req.headers.get("x-tarefa") === "pedidos") {
        const tp = rodarPedidosAnalise().catch((e) => console.log("❌ erro nos pedidos de análise", e));
        if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) { EdgeRuntime.waitUntil(tp); return new Response("ok - pedidos iniciados"); }
        await tp;
        return new Response("ok - pedidos executados");
      }
      if (cronHeader === null) console.log("⚠️ cron chamado com o segredo na URL (aparece em log): passe pro header x-cron-secret e ligue CRON_SO_HEADER=1");
      const tarefa = runAlertaProativo().catch((e) => console.log("❌ erro alerta proativo", e));
      const pedidos = chutarPedidosAnalise().catch((e) => console.log("⚠️ pedidos de análise", e)); // V109
      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
        EdgeRuntime.waitUntil(tarefa);
        EdgeRuntime.waitUntil(pedidos);
        return new Response("ok - alerta proativo iniciado");
      }
      await tarefa;
      await pedidos;
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
    const textoBruto0 = String(cq?.data ?? message?.text ?? "").trim().toLowerCase();
    const pd = cq ? { resto: textoBruto0, d: null as Desde | null } : parseDesde(textoBruto0); // V107: "... desde V104" / "... desde 05/10"
    const textoBruto = pd.resto;
    const text = TECLADO_CMD[textoBruto] ?? textoBruto;
    if (!chatId) return new Response("ok");
    const remetente = cq?.from?.id ?? update?.message?.from?.id ?? chatId;
    if (!ALLOWED_CHAT_IDS.includes(String(chatId)) && !ehCaptura(chatId)) { // V109: o chat falso de um pedido de análise em andamento também passa
      console.log(`⛔ chat_id ${chatId} nao autorizado (fora de ALLOWED_CHAT_IDS) - ignorando mensagem "${text}"`);
      if (!cq && (text === "/start" || text === "/help" || /^\/comandos?(@\w+)?$/i.test(text))) {
        await fetch(`${TG_API}/sendMessage`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: `🔒 Acesso restrito.\nSeu chat_id: ${chatId}\nPasse esse número ao administrador para ser liberado.` }),
        }).catch(() => {});
      }
      return new Response("ok");
    }
    // V107: filtro "desde" vale pro comando desta mensagem (as leituras dos comandos de estatística olham este mapa)
    if (pd.d) {
      _desdePorChat.set(String(chatId), pd.d);
      await sendTelegram(chatId, `🔎 Filtro: só alertas ${pd.d.rot}. Vale em /placar, /15min, /meuplacar, /saida, /radar, /radarconf, /reversaoconf, /repsombra, /volconf e /compressao.`);
    } else _desdePorChat.delete(String(chatId));
    // V39: botão "🔔 Já liguei" nos alertas dos minutos finais — registra a hora real que a pessoa ligou o
    // robô (nem todo PREPARE/LIGUE AGORA vira ação da pessoa), pra depois cruzar com o resultado real da vela.
    const ligueiMatch = cq && /^liguei:/.test(textoBruto) ? textoBruto.match(/^liguei:(.+):(long|short):(\d+)$/) : null;
    let respostaCq = "";
    if (ligueiMatch) {
      const [, instLig, ladoLig, ckLig] = ligueiMatch;
      const agoraIso = new Date().toISOString();
      // V74: o Supabase devolve o erro no retorno (não lança), então o try/catch antigo nunca pegava falha de gravação e o botão mostrava
      // "Registrado" mesmo sem gravar. Agora checa o retorno; se falhar, avisa e mantém o botão pra tentar de novo.
      let gravou = false;
      try {
        const sbLig = getSupabase();
        if (!sbLig) console.log("⚠️ registrar 'já liguei': Supabase não configurado");
        else {
          const { error: eLig } = await sbLig.from("ligacoes_robo").insert({ instid: instLig.toUpperCase(), lado: ladoLig, ck: Number(ckLig), chat_id: String(chatId), clicado_em: agoraIso });
          if (eLig) console.log("⚠️ registrar 'já liguei' falhou:", eLig.message ?? eLig);
          else gravou = true;
        }
      } catch (e) { console.log("⚠️ registrar 'já liguei' falhou", e); }
      const hhmm = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      respostaCq = gravou ? `🔔 Registrado às ${hhmm}` : "⚠️ Não consegui registrar — tente de novo";
      const msgId = cq?.message?.message_id;
      // só troca o teclado (não mexe no texto, pra não perder a formatação HTML original ao reeditar)
      if (gravou && msgId) {
        const markup = { inline_keyboard: [[{ text: `✅ Ligado às ${hhmm}`, callback_data: "noop" }], ...botaoAnalisar(instLig.toUpperCase())] };
        await fetch(`${TG_API}/editMessageReplyMarkup`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, message_id: msgId, reply_markup: markup }),
        }).catch(() => {});
      }
    }

    if (cq?.id) {
      await fetch(`${TG_API}/answerCallbackQuery`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callback_query_id: cq.id, ...(respostaCq ? { text: respostaCq } : {}) }),
      }).catch(() => {});
    }
    if (ligueiMatch) return new Response("ok");
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
    if (text.startsWith("/") && !ehCaptura(chatId)) { // V109: pedido de análise não tem mensagens de tela pra limpar
      await uiLimpar(chatId, cq ? [] : [message?.message_id]).catch((e) => console.log("⚠️ uiLimpar", e));
    }
    const rodarEmBackground = (tarefa: Promise<void>) => {
      if (ehCaptura(chatId)) return tarefa; // V109: no pedido de análise, espera terminar (a resposta vai pra tabela)
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
    const ehComandos = /^\/comandos?(@\w+)?$/i.test(text);
    if (text === "/start" || text === "/help" || ehComandos) {
      const modoAtual = await getModo(chatId);
      if (text === "/start" && !(await modoJaEscolhido(chatId))) {
        await sendTelegram(chatId, textoEscolhaModo(), modoPicker);
      }
      if (text === "/start") {
        await sendTelegram(chatId, textoBoasVindas(chatId, modoAtual));
        await sendTelegram(chatId, "⌨️ Atalhos fixos ativados aqui embaixo 👇");
      } else if (text === "/help") {
        for (const parte of dividirTexto(textoHelp(chatId), 4090)) await sendTelegram(chatId, parte); // V70: 4090 (antes 3800): uma mensagem só quando cabe
      } else {
        // em partes se passar do limite do Telegram (modo Novato fica perto de 4k caracteres)
        for (const parte of dividirTexto(textoComandos(chatId, modoAtual, remetente))) await sendTelegram(chatId, parte);
      }
      return new Response("ok");
    }
    if (text.startsWith("/oportunidade")) {
      await comAguarde("🔍 Procurando oportunidades (a favor do dia) perto do Indicador, aguarde...", () => runCruzado(chatId, "oportunidade"));
      return new Response("ok");
    }
    if (text === "/reversaoconf" || text.startsWith("/reversaoconf ") || text.startsWith("/reversaoconf@")) {
      // V99 (fica ANTES do /reversao, que casa por startsWith e engolia este comando): /reversaoconf [dias] — reversão por nota, lado, ADX e esticada
      const diasRv = Math.min(90, Math.max(1, Math.round(Number(text.split(/\s+/)[1]) || 30)));
      await rodarEmBackground(runReversaoConf(chatId, diasRv));
      return new Response("ok");
    }
    if (text === "/juncao" || text.startsWith("/juncao ") || text.startsWith("/juncao@") || text === "/junção" || text.startsWith("/junção ")) {
      // V107: /juncao [dias] [stopX] [alvoX] [horas a,b] — junção clássica x rápida, recalculada nas mesmas velas
      const argsJ = text.split(/\s+/).slice(1);
      const iHJ = argsJ.findIndex((a) => a.startsWith("horas"));
      const diasJ = Math.min(7, Math.max(1, Math.round(Number(argsJ.find((a, i) => /^\d+$/.test(a) && !(iHJ >= 0 && argsJ[iHJ] === "horas" && i === iHJ + 1) && !(i > 0 && /^m[eé]dias$/.test(argsJ[i - 1])))) || 7)));
      // V107: stop e alvo aceitam lista (stop1,1.5 alvo1.5,2): compara todas as combinações nas mesmas velas (máx. 6)
      const listaJ = (pref: string, padrao: number, max: number) => {
        const a = argsJ.find((x) => x.startsWith(pref));
        const vs = a ? a.slice(pref.length).split(/[;,]/).map((x) => Number(x)).filter((v) => isFinite(v) && v >= 0 && v <= max) : [];
        return vs.length ? [...new Set(vs)].slice(0, 3) : [padrao];
      };
      const hJ = iHJ >= 0 ? (argsJ[iHJ] === "horas" ? argsJ[iHJ + 1] : argsJ[iHJ].slice(5)) : "";
      const horasJ = (hJ ? hJ.split(/[,;]/).map((x) => Number(x.replace(",", "."))) : [1, 2]).filter((x) => x > 0 && x <= 24).slice(0, 3);
      const cfgsJ: SimCfg[] = [];
      const umJ = (pref: string) => { const a = argsJ.find((x) => x.startsWith(pref)); const v = a ? Number(a.slice(pref.length)) : NaN; return isFinite(v) && v >= 0 ? Math.min(20, v) : 0; };
      for (const st of listaJ("stop", SAIDA_STOP_ATR, 10)) for (const al of listaJ("alvo", 1.5, 20)) for (const tr of listaJ("trail", 0, 10)) cfgsJ.push({ stopAtr: st, alvoR: al, trailAtr: tr, armaAtr: umJ("arma"), beAtr: umJ("be") });
      // V107: medias 9,20,21,30 = J6 personalizada (2 a 8 médias, de 2 a 200 períodos) como 4º modo
      // V107: "medias 9,20,21,30" (pode repetir até 4x, ou separar conjuntos com |): cada um vira uma J6 personalizada
      const customsJ: number[][] = [];
      argsJ.forEach((a, i) => {
        if (!/^m[eé]dias/.test(a)) return;
        const bruto = /^m[eé]dias$/.test(a) ? argsJ[i + 1] || "" : a.replace(/^m[eé]dias/, "");
        for (const conj of bruto.split("|")) {
          const ps = [...new Set(conj.split(/[,;\/]/).map((x) => Math.round(Number(x))).filter((x) => Number.isFinite(x) && x >= 2 && x <= 200))].slice(0, 8);
          if (ps.length >= 2) customsJ.push(ps);
        }
      });
      if (argsJ.some((a) => /^m[eé]dias/.test(a)) && !customsJ.length) { await sendTelegram(chatId, "⚠️ Passe pelo menos 2 médias entre 2 e 200. Ex.: /juncao 7 medias 9,20,21,30"); return new Response("ok"); }
      // V108: "pura" (ou "j6pura") = cada J6 também na versão pura, só a linha da J6 sem a SUPREMA
      const puraJ = argsJ.some((a) => /^(j6)?pur[ao]$/.test(a));
      // V109: "novos" = SuperTrend, faixa com folga, Chandelier e Donchian contra a faixa do bot (ou um de cada: st10x3, folga0.25, chand22x3, donch20)
      // "filtros" = o motor real com ADX, Choppiness e ER (adx20,25 · chop50,61.8 · er0.2,0.3 escolhem os valores)
      const novosJ = juncaoNovosDeArgs(argsJ), filtrosJ = juncaoFiltrosDeArgs(argsJ);
      const extraJ = [puraJ ? "com a J6 pura" : "", novosJ.length ? `com ${novosJ.length} modo(s) novo(s)` : "", filtrosJ ? "com os filtros" : ""].filter(Boolean).join(", ");
      await comAguarde(`🔀 Recalculando a faixa nos modos da junção${extraJ ? ` (${extraJ})` : ""}, aguarde (pode levar 1 a 3 min${extraJ ? ", um pouco mais com os extras" : ""})...`, () => runJuncao(chatId, diasJ, cfgsJ.slice(0, 8), horasJ.length ? horasJ : [1, 2], customsJ.slice(0, 4), argsJ.includes("mov"), puraJ, novosJ, filtrosJ));
      return new Response("ok");
    }
    if (text === "/velas" || text.startsWith("/velas ") || text.startsWith("/velas@")) {
      // V109: /velas [dias] [moedas60] — manda as velas de 15m das moedas do /juncao num arquivo CSV (pra testar combinações fora do bot)
      const argsV = text.split(/\s+/).slice(1);
      const diasV = Math.min(VELAS_MAX_DIAS, Math.max(1, Math.round(Number(argsV.find((a) => /^\d+$/.test(a))) || 30)));
      const mV = argsV.find((a) => /^moedas?\d+$/.test(a));
      const maxV = Math.min(VELAS_MAX_MOEDAS, Math.max(1, mV ? Number(mV.replace(/\D/g, "")) : JUNCAO_MAX_MOEDAS));
      await comAguarde(`🕯️ Juntando as velas de ${TIMEFRAME} de ${diasV} dia(s) de até ${maxV} moeda(s), aguarde (1 a 3 min)...`, () => runVelasExport(chatId, diasV, maxV));
      return new Response("ok");
    }
    if (text === "/radarsim" || text.startsWith("/radarsim ") || text.startsWith("/radarsim@")) {
      // V107: /radarsim [dias] [regra] [stopX] [alvoX] [horas a,b,c] — operar só pelos radares, na régua do /saida
      const argsRs = text.split(/\s+/).slice(1);
      const iH = argsRs.findIndex((a) => a.startsWith("horas"));
      const iV0 = argsRs.findIndex((a) => a === "viradas");
      const diasRs = Math.min(9, Math.max(1, Math.round(Number(argsRs.find((a, i) => /^\d+$/.test(a) && !(iH >= 0 && argsRs[iH] === "horas" && i === iH + 1) && !(iV0 >= 0 && i === iV0 + 1))) || 9)));
      const numArg = (pref: string, padrao: number) => { const a = argsRs.find((x) => x.startsWith(pref)); const v = a ? Number(a.slice(pref.length).replace(",", ".")) : NaN; return isFinite(v) && v >= 0 ? v : padrao; };
      const hArg = iH >= 0 ? (argsRs[iH] === "horas" ? argsRs[iH + 1] : argsRs[iH].slice(5)) : "";
      const horasRs = (hArg ? hArg.split(/[,;]/).map((x) => Number(x.replace(",", "."))) : RADARSIM_HORAS).filter((x) => x > 0 && x <= 72).slice(0, 6);
      const cfgRs: SimCfg = { stopAtr: Math.min(10, numArg("stop", SAIDA_STOP_ATR)), alvoR: Math.min(20, numArg("alvo", 0)), trailAtr: Math.min(10, numArg("trail", 0)), armaAtr: Math.min(20, numArg("arma", 0)), beAtr: Math.min(20, numArg("be", 0)) }; // V107: trailX / armaY / beX
      const entRs = (argsRs.some((a) => /^romp/.test(a)) ? "romp" : "direto") as "direto" | "romp";
      const porBtcRs = argsRs.some((a) => a === "btc") ? { ent: entRs, por: "btc" as const } : argsRs.some((a) => a === "mov") ? { ent: entRs, por: "mov" as const } : null; // V107: "btc" = por humor do BTC · "mov" = por movimento da moeda no dia
      const cruzRs = argsRs.some((a) => /^cruz/.test(a)); // V107: cruz = alertas do cruzamento (oportunidade, reversão, compressão), uma operação por alerta, sem virar
      // V107: viradas 0,1,3 (ou viradas2) = compara a cadeia com até N viradas (só com cruz)
      const iV = argsRs.findIndex((a) => a.startsWith("viradas"));
      const vArg = iV >= 0 ? (argsRs[iV] === "viradas" ? argsRs[iV + 1] || "" : argsRs[iV].slice(7)) : "";
      const viradasRs = [...new Set(vArg.split(/[,;]/).map((x) => Math.round(Number(x))).filter((x) => Number.isFinite(x) && x >= 0 && x <= 5))].slice(0, 4);
      await comAguarde(cruzRs ? "🧪 Simulando: ligar no alerta, desligar e seguir com stop, aguarde..." : "🧪 Simulando a operação pelos radares, aguarde (busca as velas de cada moeda)...", () => runRadarSim(chatId, diasRs, argsRs.some((a) => /^regra/.test(a)), cfgRs, horasRs.length ? horasRs : RADARSIM_HORAS, porBtcRs, cruzRs, viradasRs));
      return new Response("ok");
    }
    if (text === "/sombras" || text.startsWith("/sombras ") || text.startsWith("/sombras@")) {
      // V107: /sombras [dias] — real x sombra (reversão, repique, volume) num só lugar; sai sozinho 1x por semana
      const diasSb = Math.min(30, Math.max(1, Math.round(Number(text.split(/\s+/)[1]) || 7)));
      const SBs = getSupabase();
      if (!SBs) { await sendTelegram(chatId, "⚠️ Supabase não configurado."); return new Response("ok"); }
      await rodarEmBackground((async () => {
        const { data, error } = await lerPaginadoDesde(chatId, (a, b) => SBs.from(PLACAR_TABELA).select("*").gt("criado_em", new Date(Date.now() - diasSb * 86400000).toISOString()).order("criado_em", { ascending: false }).range(a, b), 4000);
        const msg = error ? `⚠️ Não consegui ler o placar: ${String(error.message || error).replace(/</g, "&lt;")}` : await montarResumoSombras(SBs, diasSb, (data || []) as any[]);
        for (const parte of dividirHtml(msg)) await sendTelegram(chatId, parte);
      })());
      return new Response("ok");
    }
    if (text === "/volconf" || text.startsWith("/volconf ") || text.startsWith("/volconf@")) {
      // V106: /volconf [dias] — resultado por volume (USDT x unidades), com a sombra abaixo do filtro
      const diasVc = Math.min(9, Math.max(1, Math.round(Number(text.split(/\s+/)[1]) || 7)));
      await comAguarde("💧 Medindo o resultado por volume, aguarde (busca as velas de cada moeda)...", () => runVolConf(chatId, diasVc));
      return new Response("ok");
    }
    if (text === "/repsombra" || text.startsWith("/repsombra ") || text.startsWith("/repsombra@")) {
      // V104: /repsombra [dias] — repique real x sombra (barrado por ADX/DI)
      const diasRs = Math.min(90, Math.max(1, Math.round(Number(text.split(/\s+/)[1]) || 30)));
      await rodarEmBackground(runRepiqueSombra(chatId, diasRs));
      return new Response("ok");
    }
    if (text.startsWith("/reversao") || text.startsWith("/reversão")) {
      await comAguarde("🔍 Procurando reversões (viradas contra o dia) perto do Indicador, aguarde...", () => runCruzado(chatId, "reversao"));
      return new Response("ok");
    }
    // V51: com FUNDO_RADAR=0 (ou TOPO_RADAR=0), calcIndicadorFiltro nunca preenche info.bottom/info.top
    // (ver "if (FUNDO_ON) { ... bottom = calcFundoPre(...) }"), então runFundo/runTopo sempre terminavam
    // com a lista vazia e mandavam "nenhuma moeda com queda/alta, liquidez e sinais mínimos agora" — parecia
    // que o mercado não tinha candidatos, mas na verdade o recurso estava desligado. Agora avisa "recurso desligado" em
    // vez de rodar a busca. Isso não muda os alertas automáticos do cron: radarFundo/radarTopo já têm
    // "if (!FUNDO_ON) return;"/"if (!TOPO_ON) return;" logo no início, então já ficavam mudos corretamente.
    if (text.startsWith("/fundo")) {
      if (!FUNDO_ON) { await sendTelegram(chatId, "🟢 Radar de fundo desligado neste bot (FUNDO_RADAR=0)."); return new Response("ok"); }
      await comAguarde("🔍 Procurando moedas que caíram (no dia ou desde a máxima) e já mostram sinais de fundo, aguarde...", () => runFundo(chatId));
      return new Response("ok");
    }
    if (text.startsWith("/topo")) {
      if (!TOPO_ON) { await sendTelegram(chatId, "🔴 Radar de topo desligado neste bot (TOPO_RADAR=0)."); return new Response("ok"); }
      await comAguarde("🔍 Procurando moedas que subiram (no dia ou desde a mínima) e já mostram sinais de topo, aguarde...", () => runTopo(chatId));
      return new Response("ok");
    }
    if (text.startsWith("/lista")) {
      await comAguarde("🔍 Montando a lista de acompanhamento, aguarde...", () => runLista(chatId, /\b(tudo|todas|all)\b/i.test(text)));
      return new Response("ok");
    }
    if (text.startsWith("/pergunta") || text.startsWith("/veredito")) {
      const prov: "gemini" | "claude" = text.startsWith("/veredito") ? "claude" : "gemini";
      const [, moeda, ...resto] = text.split(/\s+/);
      if (!moeda) { await sendTelegram(chatId, prov === "gemini" ? "🤖 Use: /pergunta MOEDA (ex.: /pergunta one). Se quiser, acrescente uma pergunta: /pergunta one vale ligar agora?" : "⚖️ Use: /veredito MOEDA (ex.: /veredito one). Se quiser, acrescente uma pergunta: /veredito one vale ligar agora?"); return new Response("ok"); }
      await comAguarde(prov === "gemini" ? "🤖 Analisando e consultando o Gemini, aguarde..." : "⚖️ Analisando e consultando o Claude, aguarde...", () => runIA(chatId, moeda, resto.join(" ").trim(), prov));
      return new Response("ok");
    }
    if (text.startsWith("/melhor")) {
      const extraM = text.replace(/^\/melhor(@\w+)?/i, "").trim();
      await comAguarde("🏆 Varrendo as moedas e consultando o Gemini, aguarde...", () => runMelhor(chatId, extraM));
      return new Response("ok");
    }
    if (text.startsWith("/estudo")) {
      for (const parte of dividirTexto(textoEstudo(await agEstudoBloco(getSupabase())), 4090)) await sendTelegram(chatId, parte); // V70: cabe numa mensagem só (só divide se a agenda do dia deixar passar de 4090)
      return new Response("ok");
    }
    if (text.startsWith("/analise") || text.startsWith("/análise")) {
      const arg = text.split(/\s+/)[1];
      if (!arg) { await sendTelegram(chatId, "🔎 Use: /analise ONE (com ou sem -USDT)"); return new Response("ok"); }
      await comAguarde("🔎 Analisando, aguarde uns segundos...", () => runAnalise(chatId, arg));
      return new Response("ok");
    }
    if (text.startsWith("/comparar")) {
      const [argA, argB] = text.split(/\s+/).slice(1);
      if (!argA || !argB) { await sendTelegram(chatId, "⚖️ Use: /comparar MOEDA1 MOEDA2 (ex.: /comparar one sui)"); return new Response("ok"); }
      await comAguarde("⚖️ Comparando as duas moedas, aguarde...", () => runComparar(chatId, argA, argB));
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
    if (text.startsWith("/15min")) {
      const dias = Math.min(90, Math.max(1, Math.round(Number(text.split(/\s+/)[1]) || 7)));
      await rodarEmBackground(run15min(chatId, dias));
      return new Response("ok");
    }
    if (text === "/radarhist" || text.startsWith("/radarhist ") || text.startsWith("/radarhist@")) {
      // V78: /radarhist [dias] [gravar] — histórico dos radares gravado no Supabase (acumula além dos 9 dias do /radar)
      const argsH = text.split(/\s+/).slice(1);
      const gravarH = argsH.some((a) => /^grav/i.test(a));
      const dH = Number(argsH.find((a) => /^\d+$/.test(a)) || 30);
      await comAguarde("📚 Lendo o histórico dos radares, aguarde...", () => runRadarHist(chatId, dH, gravarH));
      return new Response("ok");
    }
    if (text === "/foguete" || text.startsWith("/foguete ") || text.startsWith("/foguete@")) {
      // V107: /foguete [dias] — espelho do /faca: topo com ADX alto como LONG de continuação (só sombra)
      const dFg = Math.min(9, Math.max(1, Math.round(Number(text.split(/\s+/)[1]) || 7)));
      await comAguarde("🚀 Avaliando o modo foguete, aguarde...", () => runRadarStats(chatId, dFg, { fonte: "foguete" }));
      return new Response("ok");
    }
    if (text === "/facasim" || text.startsWith("/facasim ") || text.startsWith("/facasim@")) {
      // V107: /facasim [dias] [foguete] [stopX] [alvoX] [horas a,b] — faca (ou foguete): direto x rompimento da vela x rompimento do último fundo/topo anterior
      const argsFs = text.split(/\s+/).slice(1);
      const iHF = argsFs.findIndex((a) => a.startsWith("horas"));
      const diasFs = Math.min(9, Math.max(1, Math.round(Number(argsFs.find((a, i) => /^\d+$/.test(a) && !(iHF >= 0 && argsFs[iHF] === "horas" && i === iHF + 1))) || 7)));
      const numF = (pref: string, padrao: number) => { const a = argsFs.find((x) => x.startsWith(pref)); const v = a ? Number(a.slice(pref.length).replace(",", ".")) : NaN; return isFinite(v) && v >= 0 ? v : padrao; };
      const hF = iHF >= 0 ? (argsFs[iHF] === "horas" ? argsFs[iHF + 1] || "" : argsFs[iHF].slice(5)) : "";
      const horasFs = (hF ? hF.split(/[,;]/).map((x) => Number(x.replace(",", "."))) : [2, 4]).filter((x) => x > 0 && x <= 24).slice(0, 4);
      // V107: stop/alvo/trail aceitam lista (stop0.5,1,2) = todas as combinações (até 8); sem nenhum deles = pacote FACASIM_PACOTE
      const listaF = (pref: string, padrao: number, max: number) => {
        const a = argsFs.find((x) => x.startsWith(pref));
        const vs = a ? a.slice(pref.length).split(/[;,|]/).map((x) => Number(x)).filter((v) => isFinite(v) && v >= 0 && v <= max) : [];
        return vs.length ? [...new Set(vs)].slice(0, 4) : [padrao];
      };
      const escolheuF = argsFs.some((a) => /^(stop|alvo|trail|be|arma)\d/.test(a));
      const cfgsFs: SimCfg[] = [];
      if (escolheuF) for (const st of listaF("stop", SAIDA_STOP_ATR, 10)) for (const al of listaF("alvo", 2, 20)) for (const tr of listaF("trail", 0, 10)) cfgsFs.push({ stopAtr: st, alvoR: al, trailAtr: tr, armaAtr: Math.min(20, numF("arma", 0)), beAtr: Math.min(20, numF("be", 0)) });
      const fogFs = argsFs.some((a) => /^fogu/.test(a));
      await comAguarde(fogFs ? "🚀 Simulando as entradas do foguete, aguarde..." : "🔪 Simulando as entradas da faca, aguarde...", () => runFacaSim(chatId, diasFs, fogFs, cfgsFs.length ? cfgsFs.slice(0, 8) : FACASIM_PACOTE, horasFs.length ? horasFs : [2, 4]));
      return new Response("ok");
    }
    if (text === "/faca" || text.startsWith("/faca ") || text.startsWith("/faca@")) {
      // V98: /faca [dias] — resultado do modo faca (candidatos gravados em silêncio ou enviados), com as mesmas regras do /radar
      const dF = Math.min(9, Math.max(1, Math.round(Number(text.split(/\s+/)[1]) || 7)));
      await comAguarde("🔪 Avaliando o modo faca, aguarde...", () => runRadarStats(chatId, dF, { fonte: "faca" }));
      return new Response("ok");
    }
    if (text === "/radar" || text.startsWith("/radar ") || text.startsWith("/radar@")) {
      // V77: /radar [dias] [pernasN] [alvoN] — ex.: /radar 9 pernas2 alvo3 (ordem livre; alvo aceita decimal: alvo1.5 ou alvo1,5)
      const argsR = text.split(/\s+/).slice(1);
      let dRn: number | undefined, pernasR: number | undefined, alvoRn: number | undefined, argInval = "";
      for (const a of argsR) {
        const mp = a.match(/^pernas?[=:]?(\d+)$/i), ma = a.match(/^alvo[=:]?(\d+(?:[.,]\d+)?)$/i);
        if (mp) pernasR = Number(mp[1]);
        else if (ma) alvoRn = Number(ma[1].replace(",", "."));
        else if (/^\d+$/.test(a) && dRn === undefined) dRn = Number(a);
        else if (a) argInval = a;
      }
      if (argInval || (pernasR !== undefined && (pernasR < 1 || pernasR > 6)) || (alvoRn !== undefined && (!(alvoRn >= 0.5) || alvoRn > 10))) {
        await sendTelegram(chatId, `⚠️ Não entendi${argInval ? ` "${argInval.slice(0, 20)}"` : ""}. Use: /radar [dias] [pernasN] [alvoN]\nExemplos: /radar 9 pernas2 alvo3 · /radar pernas1 · /radar 7 alvo1.5\nPernas: 1 a 6 · alvo: 0.5 a 10 (em R).`);
        return new Response("ok");
      }
      const dR = Math.min(9, Math.max(1, Math.round(dRn || 7)));
      await comAguarde("📡 Conferindo o que aconteceu depois dos alertas de radar, aguarde...", () => runRadarStats(chatId, dR, { pernas: pernasR, alvo: alvoRn }));
      return new Response("ok");
    }
    if (text === "/motorteste" || text.startsWith("/motorteste ") || text.startsWith("/motorteste@")) {
      // V107: testa a ligação bot -> motor do modo alerta SEM risco: manda um alerta com tipo "teste", que o motor grava e RECUSA
      // (tipo fora da lista: o site só deixa escolher fundo/repique). Aparece no site em "alertas que não entraram".
      const argMt = String(text.split(/\s+/)[1] || "BTC").toUpperCase();
      const instMt = argMt.includes("-") ? argMt : `${argMt}-USDT`;
      if (!MOTOR_URL || !MOTOR_ALERTA_SECRET) { await sendTelegram(chatId, `🧪 <b>/motorteste</b>\n\nFaltam Secrets no bot: ${!MOTOR_URL ? "<b>MOTOR_URL</b> " : ""}${!MOTOR_ALERTA_SECRET ? "<b>MOTOR_ALERTA_SECRET</b>" : ""}`); return new Response("ok"); }
      const pxMt = await precoAoVivo(instMt);
      if (!pxMt) { await sendTelegram(chatId, `🧪 Não achei o preço de ${instMt}. Tente outra moeda: /motorteste SOL`); return new Response("ok"); }
      try {
        const r = await fetch(MOTOR_URL, { method: "POST", headers: motorHeaders({ "x-alerta-secret": MOTOR_ALERTA_SECRET }), body: JSON.stringify({ action: "alerta", instId: instMt, side: "long", tipo: "teste", preco: pxMt, atr: pxMt * 0.01, nota: 0 }), signal: AbortSignal.timeout(10000) });
        const j: any = await r.json().catch(() => null);
        await sendTelegram(chatId, r.ok && j?.ok
          ? `🧪 <b>Ligação bot → motor OK</b> (${instMt})\n${j.gravados ? `O motor gravou ${j.gravados} alerta(s) de teste. Em até 1 min ele aparece no site em "alertas que não entraram" como <i>tipo teste fora da lista</i> (é recusado de propósito: nenhuma ordem, nem simulada).` : `O motor respondeu, mas não gravou: ${String(j.msg || "modo alerta desligado no site").replace(/</g, "&lt;")}. Ligue o modo alerta no site e repita.`}`
          : `🧪 <b>O motor recusou</b> (HTTP ${r.status})${j?.error ? `: ${String(j.error).slice(0, 200).replace(/</g, "&lt;")}` : ""}\n401/403 = confira MOTOR_ALERTA_SECRET (igual ao ALERTA_SECRET do motor) e MOTOR_ANON_KEY · 404 = confira MOTOR_URL · 500 = rode o SQL do modo alerta.`);
      } catch (e) { await sendTelegram(chatId, `🧪 Não consegui falar com o motor: ${String(e).slice(0, 200).replace(/</g, "&lt;")}. Confira MOTOR_URL.`); }
      return new Response("ok");
    }
    if (text === "/trades" || text.startsWith("/trades ") || text.startsWith("/trades@")) {
      const dT = Math.min(30, Math.max(1, Math.round(Number(text.split(/\s+/)[1]) || 7)));
      await comAguarde("🧾 Lendo os trades do motor, aguarde...", () => runTrades(chatId, dT));
      return new Response("ok");
    }
    if (text === "/logs" || text.startsWith("/logs ") || text.startsWith("/logs@")) {
      for (const parte of dividirHtml(logResumo())) await sendTelegram(chatId, parte); // V107: em partes, por segurança
      return new Response("ok");
    }
    if (text === "/div" || text.startsWith("/div ") || text.startsWith("/div@")) {
      const argDiv = (text.split(/\s+/)[1] || "").toLowerCase();
      await rodarEmBackground(argDiv === "diag" || argDiv === "diagnostico" ? runDivDiag(chatId) : runDiv(chatId));
      return new Response("ok");
    }
    if (text.startsWith("/saida")) {
      // V74: /saida [dias] [MOEDA] [trava/callback[/sl]] [tudo] — tudo é opcional: sem nada usa 7 dias, o filtro padrão e o trailing 5/3.5
      let dias = 7, diasSet = false, moeda: string | undefined, cfg: { trava: number; cb: number; sl: number } | undefined, tudo = false, movArg: number | null = null;
      const tiposArg: string[] = [];
      const num = (x: string) => Number(x.replace(",", "."));
      for (const p of text.split(/\s+/).slice(1)) {
        if (/^tudo$/i.test(p)) { tudo = true; continue; }
        // V107: filtro por tipo de alerta (comp, oport, rev, fundo, topo; dá pra juntar: comp oport)
        const tp = /^(comp|compressao|compressão)$/i.test(p) ? "compressao" : /^(oport|oportunidade)$/i.test(p) ? "oportunidade" : /^(rev|reversao|reversão)$/i.test(p) ? "reversao" : /^fundo$/i.test(p) ? "fundo" : /^topo$/i.test(p) ? "topo" : null;
        if (tp) { tiposArg.push(tp); continue; }
        const mm = p.match(/^mov(\d+(?:[.,]\d+)?)$/i); // V107: movX = só entradas com |24h| ≥ X% (sem precisar de Secret)
        if (mm) { movArg = num(mm[1]); continue; }
        const mc = p.match(/^(\d+(?:[.,]\d+)?)\/(\d+(?:[.,]\d+)?)(?:\/(\d+(?:[.,]\d+)?))?$/);
        if (mc) { cfg = { trava: num(mc[1]), cb: num(mc[2]), sl: mc[3] ? num(mc[3]) : 0 }; continue; }
        if (!diasSet && /^\d+$/.test(p)) { dias = Number(p); diasSet = true; continue; }
        const mo = p.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/USDT$/, "");
        if (mo) moeda = mo;
      }
      dias = Math.min(9, Math.max(1, Math.round(dias || 7)));
      if (cfg && !(cfg.trava > 0 && cfg.cb > 0)) { await sendTelegram(chatId, "⚠️ Trava e callback precisam ser maiores que zero. Ex.: /saida 9 QNT 5/3.5"); return new Response("ok"); }
      const filtroPad = tudo || !SAIDA_FILTRO_PADRAO ? null : { mov: SAIDA_MOV_PADRAO, adx: SAIDA_ADX_PADRAO, subindo: SAIDA_ADX_SUBINDO };
      const filtro = movArg !== null ? { mov: movArg, adx: filtroPad?.adx ?? 0, subindo: filtroPad?.subindo ?? false } : filtroPad; // V107: "tudo mov15" = só o corte de movimento
      await comAguarde("🚪 Simulando a saída real, aguarde...", () => runSaida(chatId, dias, { moeda, cfg: cfg ?? SAIDA_CFG_PADRAO, filtro, tipos: [...new Set(tiposArg)] }));
      return new Response("ok");
    }
    if (text === "/radarconf" || text.startsWith("/radarconf ") || text.startsWith("/radarconf@")) {
      const argR = text.split(/\s+/)[1] || "";
      if (/^(retro|teste|sim)/i.test(argR)) {
        const tipoR: "topo" | "fundo" = /^fund/i.test(text.split(/\s+/)[2] || "") || /fundo$/i.test(argR) ? "fundo" : "topo";
        await comAguarde(`${tipoR === "fundo" ? "🟢" : "🔴"} Refazendo a nota do ${tipoR} com as velas, aguarde (pode demorar)...`, () => runTopoRetro(chatId, tipoR));
        return new Response("ok");
      }
      const diasR = Math.min(90, Math.max(1, Math.round(Number(argR) || 30)));
      await rodarEmBackground(runRadarConf(chatId, diasR));
      return new Response("ok");
    }
    if (text === "/compressao" || text.startsWith("/compressao ") || text.startsWith("/compressao@") || text === "/comp" || text.startsWith("/comp ")) {
      const argsC = text.split(/\s+/).slice(1);
      if (argsC.some((a) => /^base/i.test(a))) { await comAguarde("🗜️ Montando a base (velas das moedas), aguarde...", () => runCompressaoBase(chatId)); return new Response("ok"); }
      const diasC = Math.min(90, Math.max(1, Math.round(Number(argsC.find((a) => /^\d+$/.test(a))) || 30)));
      await rodarEmBackground(runCompressao(chatId, diasC));
      return new Response("ok");
    }
    if (text.startsWith("/placar")) {
      const dias = Math.min(90, Math.max(1, Math.round(Number(text.split(/\s+/)[1]) || 7)));
      await rodarEmBackground(runPlacar(chatId, dias));
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
    if (text.startsWith("/noticia") || text.startsWith("/notícia")) {
      await comAguarde("📰 Lendo as notícias, aguarde...", () => runNoticia(chatId, text.split(/\s+/).slice(1).join(" ")));
      return new Response("ok");
    }
    if (text.startsWith("/agenda")) {
      await comAguarde("📅 Lendo a agenda econômica, aguarde...", () => runAgenda(chatId));
      return new Response("ok");
    }
    if (text.startsWith("/robo")) {
      await comAguarde("🤖 Consultando a BloFin, aguarde...", () => runRobo(chatId));
      return new Response("ok");
    }
    if (text.startsWith("/config")) {
      if (!ehAdmin(chatId, remetente)) { await sendTelegram(chatId, "🔒 Comando restrito ao administrador."); return new Response("ok"); }
      if (/^\/config(@\w+)?\s+(mudou|diff|alterad)/.test(text)) { for (const parte of dividirHtml(montarConfigMudou())) await sendTelegram(chatId, parte); return new Response("ok"); } // V107
      for (const parte of dividirHtml(montarConfig())) await sendTelegram(chatId, parte); // V107: em partes (antes saía "...(cortado)")
      return new Response("ok");
    }
    if (text.startsWith("/menu")) {
      await sendTelegram(chatId, "⌨️ <b>Teclado ativado</b> — os botões ficam fixos embaixo. Cada toque apaga a resposta anterior (os alertas do robô só são substituídos por um novo da mesma moeda).");
      return new Response("ok");
    }
    if (text.startsWith("/modo")) {
      const arg = text.split(/\s+/)[1];
      if (arg === "novato" || arg === "experiente") {
        await setModo(chatId, arg);
        await sendTelegram(chatId, arg === "experiente"
          ? "⚡ <b>Modo Experiente ativado</b> — alertas e comandos vêm só com a confirmação e os números, sem o texto explicando o porquê. Troque de volta a qualquer hora com /modo."
          : "🎓 <b>Modo Novato ativado</b> — alertas e comandos voltam a vir com a explicação completa. Troque a qualquer hora com /modo.");
      } else {
        const atual = await getModo(chatId);
        await sendTelegram(chatId, `🎛️ Modo atual: <b>${atual === "experiente" ? "⚡ Experiente" : "🎓 Novato"}</b>\nEscolha abaixo pra trocar:`, modoPicker);
      }
      return new Response("ok");
    }
    return new Response("ok");
  } catch (e) {
    console.log("❌ ERRO GERAL telegram-bot", e);
    return new Response("ok");
  }
}
Deno.serve(tratarRequisicao);
