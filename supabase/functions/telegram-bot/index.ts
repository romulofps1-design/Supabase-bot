// telegram-bot V71 (V70 + /saida ganhou a virada encadeada: colunas C/D somam o resultado de TODAS as pernas que o
// robô faria a partir de cada entrada real — sai no cruzamento vira pro lado contrário na hora, sai no stop espera o
// próximo cruzamento — incluindo as viradas que o ESTRATEGIA_PUMP nunca alertou (o filtro só decide o AVISO; o robô
// já ligado entra em todo cruzamento). simularSaidaEncadeada é a função nova; A/B continuam medindo só a 1ª perna)
// telegram-bot V74 (V73 + acompanhamento das hipóteses dos radares de topo/fundo/repique: aviso ao vivo "invalidado"/"funcionou" (HIP_*) e /radar com o que aconteceu depois de cada alerta (inclusive por faixa de confiança) + filtro de ADX das moedas: mínimo 14 (era 15); corte "ADX subindo" opcional e DESLIGADO por padrão (FILTRO_ADX_SUBINDO=1 liga, FILTRO_ADX_SUBINDO_ATE) + o cooldown de alerta novo e o "loop já avisou" do alerta final passam a usar o lado do ÚLTIMO ALERTA (marcador [L]/[S] no last_status), não o watch_side que a lista de acompanhamento troca a cada virada — a lista não atrasa mais um alerta bom + /trades: histórico REAL do motor (outro Supabase) por chave só de leitura (MOTOR_URL, MOTOR_LEITURA_SECRET) + /saida passa a ser enviado em partes (dividirHtml) em vez de cortar o fim com "...(cortado)" + DIV_MODO=tv: divergência do BTC com as MESMAS regras do indicador Pine (pivô do RSI 5/5, 5 a 60 velas, sem zona, vale 5 velas) + controle do volume de logs: Secret LOG_NIVEL (tudo | normal | erro | mudo), LOG_OCULTAR, LOG_MOSTRAR, LOG_REPETIDO_MIN e comando /logs + /saida simplificado: já vem com o filtro que você usa (|24h| ≥ 8% e ADX ≥ 14 subindo, medidos na hora do alerta, sem olhar o futuro) e o trailing 5/3.5; "tudo" mostra todas as entradas + /saida simula o trailing do MOTOR em % de preço (arma na trava, fecha no callback do pico; F = degrau de N em N%), com filtro por moeda: /saida 9 QNT 5/3.5/3 + /analise mostra no cabeçalho a divergência de RSI do BTC (antecipadas em aberto e confirmadas recentes, e quantas estão a favor/contra o lado do robô); só leitura, não mexe na confiança + NOVO: alerta de divergência de RSI do BTC (regular e oculta, altista e baixista) em 1h/4h/diário/semanal, antecipado (👀) e confirmado (✅), com "❌ não se confirmou" e comando /div (DIV_ON, DIV_TFS) + botão "🔔 Já liguei" só confirma se a gravação no Supabase deu certo + alertas novos gravam no status do log se saíram em lateral (🧱) ou com tendência (📶); /saida, /placar e o detalhe 15m comparam os dois (ajuda a decidir LATERAL_MODO) + radares de fundo/topo/compressão olham RADAR_CAND_JANELA=20 candidatas (antes 8/6) pra moeda em cooldown não travar as demais + restaurarCalibracao só marca "restaurada" depois de ler com sucesso (erro passageiro não sobrescreve a calibração salva) + auto-apagar tenta de novo (até AUTOAPAGAR_RETRY_MIN=30 min) quando o Telegram falha por 429/5xx/rede, em vez de largar a mensagem no chat + /saida: C/D não contam mais a mesma virada 2x (entrada dentro da cadeia de outra), seção "🔁 Viradas" (lista as maiores, 🔕 = sem alerta), aviso de limite de 12 pernas só quando realmente cortou e aviso de 600 entradas + novo aviso "↩️ voltou pra dentro da faixa" (WATCH_VOLTA_ATR=0.5, 0 desliga) pra alerta cruzado que recua sem chegar na linha oposta; chave _watchEnviado velha limpa quando não há cruzamento contra pendente + cancelamento "RECUOU antes do fechamento", veredito do fechamento e FIM DO RESUMO DO DIA agora saem como mensagem NOVA (edição não notifica; a mensagem anterior é apagada) + intervalo mínimo entre avisos de "cruzou CONTRA" da mesma moeda (ACOMP_INTERVALO_MIN, por chat; padrão 0 = desligado, ex.: 30 liga o intervalo de 30 min). Dentro do intervalo o aviso não sai e a linha NÃO é atualizada: se a moeda ainda estiver do lado contrário quando o intervalo passar, o aviso sai então; se desvirou, não sai nada) (V73 = V72 + o aviso de "cruzou CONTRA" (ACOMP_) some em ACOMP_AUTOAPAGAR_MIN=5 min, mais rápido que o
// auto-apagar geral de 15 min — ele é informativo e, com WATCH_REPETIR ligado, pode chegar de novo a cada virada)
// telegram-bot V72 (V71 + /saida avisa quando uma cadeia bate no limite de 12 pernas, pra não confundir R subestimado
// com R real; o acompanhamento (watch) que avisa quando a moeda "cruzou CONTRA" deixa de fechar depois do 1º aviso —
// agora continua seguindo a moeda no lado novo e avisa de novo se ela virar outra vez (WATCH_REPETIR=0 volta ao
// antigo: avisa 1x e some). Antes disso, o 2º flip só reaparecia se um alerta cheio passasse de novo pelo
// classificar()+confiança+ESTRATEGIA_PUMP, o que pro lado "contra o dia" podia nunca acontecer)
// telegram-bot V70 (V69 + notícias SÓ em português do Brasil: tradução pelo Gemini guardada no cache (campo pt) e usada no /noticia, no bloco do painel e no aviso automático; sem tradução nunca mostra inglês (avisa que a tradução está indisponível e deixa o link do original) · filtro de mercado lateral reorganizado: o mínimo é um só (ADX ≥ 18 · ER ≥ 0.25 · caixa ≥ 3×ATR), LIBERADO com 2 de 3 requisitos no mínimo em BTC ou ETH (LATERAL_VOTOS_LIBERA=2), aviso automático 👀 "querendo sair da lateral" quando 1 requisito atinge o mínimo e 📈 "saindo da lateral" quando 2 atingem; bloco do /resumo mostra cada requisito com ✅/❌)
// telegram-bot V69 (V68 + resumo/painel do dia reorganizado em seções (⚠️ Atenção: agenda e notícias · 📈 Mercado · 💼 Carteira · 🔥 Horários) e fechamento do ciclo com o 15m em destaque, resultado real, lista curta e comparativo; novo /noticia (falas do Trump via espelho RSS do Truth Social + manchetes de cripto/macro, filtradas por palavra-chave, com tradução opcional pelo Gemini), bloco de notícias no painel e aviso automático de post do Trump de alto impacto) (V68 = V67 + placar sem duplicata e sem entrada inválida: (1) alerta de RETESTE de cruzamento velho (idade > ALERT_RETESTE_MAX_CANDLES, padrão 16 velas = 4h) não sai mais, exceto aviso de proteção pra quem tem posição contra; (2) conferirPlacar marca ent_status='repetido' quando já existe outro alerta da mesma moeda+lado+ent_em (fica só o 1º no placar; /placar, /15min, /saida e resumos ignoram os repetidos); (3) ent_em fora da janela (mais de ENT_MAX_ATRASO_H=48h antes do alerta, ou depois do limite de espera) vira ent_status='invalido' em vez de gravar entrada com data absurda, ex.: XMR 2024)
// telegram-bot V67 (V66 + fallbacks OKX/Binance spot só valem se o preço bater com BloFin/Bybit/Binance (divergência máx. 25%, FALLBACK_DIV_MAX) OKX desligada por padrão (FALLBACK_OKX=1 religa) e QNT-USDT nunca usa fallback (FALLBACK_BLOQ); corrige preço/preco_15m errados no placar quando as corretoras principais falhavam) (V66 = V65 + placar de 15m separado do /placar: novo comando /15min (o /placar, o /analise e o resumo da noite passam a mostrar só 1h/4h/24h; a coleta do preco_15m continua igual); novo comando /saida N: simula a saída real do robô (fecha no cruzamento contrário da faixa ou no stop de SAIDA_STOP_ATR×ATR, e uma variante com trailing por degraus de TRAIL_ATR_MULT×ATR) e mostra R médio, profit factor, "sem os 3 melhores" e duração; sem coluna nova no Supabase) (V65 = V64 + placar com horizonte de 15 min (coluna preco_15m em alertas_log: rode o ALTER TABLE antes de publicar), somado a 1h/4h/24h no /placar, no /analise (alertas anteriores) e no resumo da noite; alertas antigos ainda ao alcance das velas são preenchidos retroativamente) (V64 = V63 + comandos /pergunta MOEDA (IA Gemini) e /veredito MOEDA (IA Claude): pegam o texto completo do /analise e mandam pra IA escolhida, que responde em cima dele; secrets GEMINI_API_KEY e ANTHROPIC_API_KEY, cada comando usa só o seu provedor) (V63 = V62 + o radar de fundo/topo (a nota "Sinal de fundo/topo: X/10" do /analise, /fundo, /topo) agora também olha book e inclinação da faixa, igual a pontuação principal já fazia — antes só via funding/OI/BTC, então podia sair baixo mesmo com book e inclinação já sinalizando reversão junto; no /analise, no /fundo e no /topo a inclinação entra (já calculada ali); nas listas em massa (fundoLista/topoLista) só o book entra por enquanto, sem inclinação, pra não pesar a varredura de todas as moedas) (V62 = V61 + quando o ADX sobe mas o DI oculto (V60) mostra que quem puxa é o lado oposto ao do robô, a linha vira "ADX subindo, mas puxado pelo lado oposto (+0)" em vez de sumir — some da lista de motivos, sem nunca citar +DI/−DI) (V61 = V60 + ADX mínimo por moeda descido de 18 para 15 (FILTRO_ADX_MIN), pra pegar sinal mais cedo agora que o DI oculto (V60) já filtra falso cruzamento por trás; ADX do filtro de mercado lateral (BTC/ETH) continua em 18, sem mudança (LATERAL_ADX_BLOQ/LIBERA); X_ADX_FRACO (texto do BTC no painel) desamarrado de FILTRO_ADX_MIN, próprio env, também 18) (V60 = V59 + +DI/−DI calculado por trás do ADX, sem aparecer em nenhuma mensagem: em continuação, se a força do ADX vem do lado oposto ao do robô, o ADX forte vale +1 em vez de +2 e o ADX subindo não pontua; em reversão nada muda; DI_OCULTO=0 desliga, DI_GAP_MIN=5 é a folga mínima entre +DI e −DI) (V59 = V58 + aviso 📉 quando o mercado ENTRA em lateral (espelho do 📈 saindo; mesmo intervalo de 30 min; LATERAL_AVISO_ENTROU=0 desliga); linha ⚠️ no /analise quando a moeda já esticou ≥3× ATR a favor do robô e nenhum radar de reversão acendeu (entrada tardia); o "FIM DO RESUMO DO DIA" se apaga sozinho depois de 24h, PAINEL_FIM_APAGAR_H=0 desliga) (V58 = V57 + painel do dia atualiza mesmo com todo mundo em silêncio/pausa, chamado antes do corte por todosSil) (V57 = V56 + filtro de mercado lateral com duas faixas (histerese): BTC e ETH votam com 3 indicadores 15m — ADX, Efficiency Ratio (ER) e "caixa" (amplitude de 4h em ATRs) — e os alertas de ENTRADA ficam bloqueados quando os DOIS têm 2 de 3 sinais de lateral (ADX < 18 · ER < 0.25 · caixa < 3×ATR); só libera quando UM deles tem 1 de 3 sinais de tendência (ADX ≥ 20 · ER ≥ 0.35 · caixa ≥ 4×ATR), com espera de 30 min antes de poder bloquear de novo; enquanto bloqueia, o LIGUE AGORA/🚨 e a entrada ficam barrados, mas o PREPARE e os radares passam com um aviso 🧱; aviso 📈 quando um dos 3 sinais sai da lateral; alertas de posição aberta (proteção, cruzamento contra) seguem normais; contador de sinais barrados + tempo bloqueado por ciclo do painel; linha no /status, no log do cron e no PAINEL DO DIA (atualiza na hora quando o filtro liga/desliga); LATERAL_BLOQ=0 desliga)
// telegram-bot V56 (V55 + revisão dos filtros: volume mínimo aplicado ANTES do corte top-N nos pools de alerta e das listas (moeda ilíquida não gasta mais vaga); /config descreve o RSI do modo pump como ele roda (LONG só barra acima de FILTRO_RSI_MAX_LONG, SHORT só abaixo de FILTRO_RSI_MIN) e o volume em M; serrote: textos dizem "trocas em 4h" (entrar/sair da faixa conta) e o limiar do aviso/penalidade segue SERROTE_MAX; X_ADX_FRACO segue FILTRO_ADX_MIN; log único dos campos de volume do ticker pra conferir a unidade)
// telegram-bot V55 (V54 + painel do dia de 21h a 21h: 1 mensagem editada a cada hora, BTC subindo/caindo, comparação desde as 21h e desde as 8h, vira "FIM DO RESUMO DO DIA" na virada; agenda econômica: aviso 60 e 15 min antes de dado de alto impacto (CPI, payroll, FOMC...) pra evitar operar; bloco "agenda de hoje" no resumo da manhã e "amanhã" no da noite (sem mensagem extra, sem duplicar); /agenda; cache em memória + Supabase e aviso quando a fonte está fora)
// telegram-bot V54 (V53 + /robo: emoji 🪙 no nome da moeda no lugar da bolinha 🟢/🔴 de PnL (colidia com o emoji de estado da linha de baixo); rótulo "LIGUE AGORA" único (os alertas diziam "LIGUE O ROBÔ AGORA" no corpo e "LIGUE AGORA" no título e no /help); linha de PnL própria com 😎 (ganhando) / 🤧 (perdendo) e liq em linha separada; nos outros lugares (/analise, /agora, alertas de posição e de proteção) o PnL da posição ganhou ➕/➖ na frente (não quebra mais no celular) e dica de stop alinhada ao trailing (não manda mais "stop na entrada" quando o trailing já manda travar ganho); coerência do repique, sem mudar o nome: limiares do marcador alinhados ao pool (FUNDO_TOQUE_PICO_MIN/
// TOPO_TOQUE_VALE_MIN acompanham FUNDO_QUEDA_MIN/TOPO_ALTA_MIN); zona morta ±REPIQUE_PCT_ZONA única em tipoDoLado (só pra moeda que devolveu o movimento; o resto
// fica como antes), usada pelo classificar(), pela lista e pelo /agora; +2 de "sinais de fundo" do LONG simétrico ao do SHORT em pontuar(); textos
// dos alertas/motivos/ajuda dizem "retomada" (a favor do movimento anterior) em vez de "virada" pro repique; /help e as
// mensagens de busca de /fundo e /topo descrevem o critério real (queda/alta desde a máxima/mínima recente, não só "no dia"); trava do cron ganhou dono: destravarCron só libera se a trava ainda for da própria rodada; /help do modo Novato passava de 4096 caracteres e não chegava — agora sai em 2 mensagens; /oportunidade e /reversao vazias dizem o motivo dos descartes) (V53 = V52 + seta de cor da confiança (🟢→🟡…) e /start e /help reorganizados por modo) (V52 = V51 + /agora passa bottom/top reais pra pontuar()) (V51 = /fundo e /topo avisam "recurso desligado") (V50 = /compressao avisa com COMPRESS_ON=0) (V49 = RSI de proteção alinhado ao ESTICADO_RSI) (V48 = classificar() do /analise recebe o atr) (V47 = avisarAdmin + atr no /agora e /analise) (V46 = FUNDO_PTS_MAX derivado do REPIQUE_BONUS; upsertLinha atômico) (V45 = V44 + trava do cron virou compare-and-swap de verdade num UPDATE só, sem a janela teórica de
// corrida da versão anterior (ler→checar→escrever em 2 chamadas); autoconferência da escala de confiança —
// avisa no log se o total de pontuar() escapar de CONFIANCA_TOTAL_MIN/MAX, pra pegar deriva se algum peso mudar
// sem recalcular as constantes; ANTEC_CALIB_MIN e a janela de amostras do confiabilidadeMoeda (CONFIAB_JANELA_N)
// agora são env var, como os outros limites de calibração; registrarAntecipacao deduplica por moeda+lado, não
// só por moeda) (V44 = V43 + espelho do repique: LONG que já devolveu o dia positivo (fundo) e SHORT que já devolveu
// o dia negativo (topo) agora classificam tipo "oportunidade" em vez de sempre "reversao", mesma regra do
// tipoDoLado) (V43 = V42 + zona morta REPIQUE_PCT_ZONA (±2%, padrão) em torno de pct≈0 pra classificar o tipo do
// repique — sem ela, ruído de rodada cruzava o zero e trocava oportunidade↔reversão à toa (mudava a confiança
// mínima exigida e o bloqueio de BTC); reforma da escala de confiança — CONFIANCA_TOTAL_MIN/MAX (-31 a +24 na época; hoje -30 a +23 desde o V45, o
// piso e o teto reais de `total` em pontuar() somando todos os add() possíveis) substituem a faixa antiga de -3
// a +8, que era estreita demais e estourava/travava em 10 ou 0 com qualquer sinal decente; CONF_MIN_OPORT e
// CONF_AMARELO subiram de 5 pra 6 pra exigir aproximadamente os mesmos pontos brutos de antes na escala nova)
// (V42 = V41 + auto-calibração agora tem limites de segurança (ANTEC_ETA_MIN_LIM/MAX_LIM,
// ANTEC_DIST_MIN_LIM/MAX_LIM, ANTEC_ATR_MIN_LIM/MAX_LIM) e passo máximo por ciclo — amostra pequena/enviesada
// não consegue mais empurrar ANTEC_ETA_MAX_CANDLES/ANTEC_DIST_MAX_PCT/ANTEC_DIST_MAX_ATR pra um valor estranho
// de uma vez; a calibração agora sobrevive a cold start — antes vivia só em memória (as 3 variáveis eram `let`
// sem persistência) e se perdia silenciosamente a cada novo deploy/isolate reciclado, ficando presa no valor
// padrão por até AUTO_CALIB_INTERVALO_H horas porque o Supabase ainda marcava "já calibrei hoje"; agora é
// restaurada do Supabase 1x por isolate antes de qualquer uso; cron agora tem trava contra sobreposição
// (CRON_LOCK_TIMEOUT_MS) — se uma rodada demorar mais que o intervalo do cron, a próxima chamada não começa
// em cima da anterior escrevendo o mesmo estado ao mesmo tempo) (V41 = V40 + velocidade 🚀🚀/🐢🐢 agora pontua de verdade no pontuar() (antes só era texto); funding
// pontua por TENDÊNCIA — esticando rápido rumo ao extremo pesa mais que já estar parado lá há horas; confiabilidade
// por moeda — pontuação ajustada com o histórico de acerto de cada instId no antecipacoes_log (amostra mínima 6);
// calibração automática — antes /calibracao só mostrava o erro, agora roda sozinha 1x/dia dentro do cron e ajusta
// ANTEC_ETA_MAX_CANDLES/ANTEC_DIST_MAX_PCT/ANTEC_DIST_MAX_ATR, avisando o dono quando muda algo (o ATR precisa da
// coluna atr_pct em antecipacoes_log — ver nota no /calibracao); ETH como segunda referência de
// mercado além do BTC (ethVar1h/xRegimeCacheEth, peso menor); CVD/desequilíbrio do book via profundidade
// (getBookImbalance) — único dado que antecipa antes do fechamento da vela; cluster/rotação — avisa quando várias
// moedas do pool estão chegando na linha juntas na mesma rodada, sinal de que pode ser o mercado todo (BTC) se
// movendo, não edge de uma moeda isolada) (V40 = V39 + OI (open interest) agora entra na pontuação de confiança — antes era buscado mas só aparecia como texto: OI subindo junto com o preço soma ponto, OI caindo (squeeze fechando) tira ponto; velocidade de aproximação (🚀/🐢) agora compara 2 rodadas seguidas em vez de 1, pra distinguir aceleração de verdade de um pico de ruído (🚀🚀/🐢🐢 quando confirma 2x); modo Experiente corrigido — o compactador só cortava os motivos ✅/⚠️ do bloco "🧭 Sinal de fundo/topo/compressão", não do bloco "🧭 Confiança" que é o que sai em todo alerta automático e no /analise; agora corta os dois e também tira linhas de regra fixa repetidas) (V39 = V38 + alerta dos minutos finais agora EDITA a mesma mensagem em vez de mandar uma nova a cada rodada do cron; detecta pavio de rejeição (tocou a linha e recuou 1x+ dentro da mesma vela) e avisa antes do LIGUE AGORA; botão "🔔 Já liguei" registra a hora real que a pessoa ligou o robô (tabela ligacoes_robo); sinal de velocidade 🚀 acelerando / 🐢 devagar comparando a aproximação da rodada atual com a anterior; comando /agora MOEDA com retrato compacto — fechamento, distância às duas linhas, confiança e toque/recuo) (V38 = modo Novato x Experiente, alertas e comandos compactados sem o texto explicando) (V37 = marca discreta 🔔 nos alertas proativos, autoapagamento, proteção do webhook e do cron) (V36 (V35 + inclinação da faixa na confiança: cruzamento contra a inclinação perde pontos, a favor ganha; radar de COMPRESSÃO em rodízio de todos os pares avisa "PREPARE: rompimento iminente" com a distância até as duas linhas; 1º cruzamento em faixa comprimida sem volume perde 1 ponto; /compressao no /placar; REPIQUE nos dois lados com prioridade: SHORT = despencou, repicou até a faixa e foi rejeitada (radar de topo); LONG = disparou, recuou até a faixa e está segurando (radar de fundo); /oportunidade e /reversao alinhados com os alertas: a lista sai pelo LADO da virada (reversão mostra LONG → SHORT e SHORT → LONG), não só pela variação do dia) (V35 = V34 + radar de TOPO e repique SHORT, espelho do fundo: alta medida desde a mínima recente, rejeição na faixa pontua, /topo) (V34 = V33 + radar de fundo que enxerga o REPIQUE NA FAIXA depois de pump: queda medida desde a máxima recente, não só 24h; toque na faixa pontua; PREPARE/LIGUE no texto) (V33 = V32 + /analise em blocos "de fora / já dentro" com "ligar o robô?", textos dos avisos alinhados ao robô que vira sozinho, /help por grupos e botão "⬆️ Ir ao topo" junto da mensagem) (historico das versoes: CHANGELOG.md)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
const WATCH_REPETIR = (Deno.env.get("WATCH_REPETIR") || "1") !== "0";
// V72: o aviso de "cruzou CONTRA" (ACOMP_) some em 5 min por padrão, mais rápido que o auto-apagar geral (15 min) —
// é um aviso informativo, e com WATCH_REPETIR ligado pode chegar de novo a cada virada; não precisa ficar muito tempo.
const ACOMP_AUTOAPAGAR_MIN = numEnv("ACOMP_AUTOAPAGAR_MIN", "5");
// V74: intervalo mínimo entre dois avisos de "cruzou CONTRA" da MESMA moeda no mesmo chat (padrão 0 = desligado: aviso toda vez que cruza, o que também serve de sinal de moeda lateral; ligue com ACOMP_INTERVALO_MIN=30, por ex.).
// Evita spam em moeda picotada que cruza toda hora. Guardado no Supabase (a function serverless não guarda memória entre rodadas).
const ACOMP_INTERVALO_MIN = numEnv("ACOMP_INTERVALO_MIN", "0");
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
const COMPRESS_CONF_MIN = numEnv("COMPRESS_CONF_MIN", "6");
const COMPRESS_COOLDOWN_MIN = numEnv("COMPRESS_COOLDOWN_MIN", "180");
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
const topoOk = (t?: FundoRes | null) => !!t && t.conf >= (t.repique && !t.caindoFaca ? REPIQUE_CONF_MIN : TOPO_CONF_MIN);
const fundoOk = (b?: FundoRes | null) => !!b && b.conf >= (b.repique && !b.caindoFaca ? REPIQUE_CONF_MIN : FUNDO_CONF_MIN);
let _compCursor = 0;
const FUNDO_CONF_MIN = numEnv("FUNDO_CONF_MIN", "5");
const FUNDO_PRE_MIN = numEnv("FUNDO_PRE_MIN", "5");
const FUNDO_LIBERA_LONG = (Deno.env.get("FUNDO_LIBERA_LONG") || "1") !== "0";
const CONF_MIN_FUNDO_LONG = numEnv("CONF_MIN_FUNDO_LONG", "6");
const FUNDO_COOLDOWN_MIN = numEnv("FUNDO_COOLDOWN_MIN", "240");
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
const _numEnvAvisado = new Set<string>();
function numEnv(nome: string, padrao: string): number {
  const bruto = Deno.env.get(nome);
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
  if (await getModo(chatId) === "experiente") text = compactarExperiente(text);
  if (text.length > 4096) text = cortar(text); // rede de segurança: acima disso o Telegram recusa e a mensagem se perdia em silêncio
  // texto grande: o botão "⬆️ Ir ao topo" já vai na própria mensagem (teclado inline, 1 chamada só).
  // O teclado fixo do rodapé continua valendo: o Telegram não o remove quando chega uma mensagem com botões inline.
  const grande = TOPO_MIN_CHARS > 0 && text.length >= TOPO_MIN_CHARS;
  const inline: Botoes | undefined = grande ? [...(botoes ?? []), [BOTAO_TOPO]] : botoes;
  const markup = { reply_markup: inline ? { inline_keyboard: inline } : { keyboard: TECLADO_FIXO, resize_keyboard: true } };
  let id: number | null = null;
  try {
    const j: any = await tgPost("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true, disable_notification: false, ...markup });
    if (j.ok === false) {
      console.log(`⚠️ sendTelegram HTML falhou (${JSON.stringify(j).slice(0,200)}), tentando sem parse_mode`);
      const j2: any = await tgPost("sendMessage", { chat_id: chatId, text: textoSemHtml(text), disable_web_page_preview: true, ...markup });
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
      if (!passaAmplitude(pct, dd, up)) continue;
      variacoes.push({ instId: t.instId, pct, last, volUsdt: (parseFloat(t.volCurrency24h || "0") || 0) * last, dd, up });
    }
  } else {
    const resultados = await emLotes(pares, 25, getTickerOne);
    resultados.forEach((t, i) => {
      if (!t) return;
      if (BLACKLIST_MOEDAS.has(pares[i].toUpperCase())) return;
      const last = parseFloat(t.last || "0"), open = parseFloat(t.open24h || "0");
      if (open <= 0 || last <= 0) return;
      const pct = ((last - open) / open) * 100, dd = ddDeTicker(t, last), up = upDeTicker(t, last);
      if (!passaAmplitude(pct, dd, up)) return;
      variacoes.push({ instId: pares[i], pct, last, volUsdt: (parseFloat(t.volCurrency24h || "0") || 0) * last, dd, up });
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
  for (const linha of texto.split("\n")) {
    if (cur.length && tam([...cur, linha]) > max) {
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
async function radarFundo(SB: any, pool: { instId: string; pct: number; volUsdt: number; dd?: number }[], indicadores: (InfoFiltravel | null)[], posMap: Map<string, Pos[] | null>) {
  if (!FUNDO_ON) return;
  const ativos = ALERT_CHAT_IDS.filter((ch) => !silChat(ch));
  if (!ativos.length) return;
  const ckVela = Math.floor(Date.now() / (TF_MIN * 60000));
  for (const [k, v] of _fundoAvaliado) if (v !== ckVela) _fundoAvaliado.delete(k);
  const cands: { info: InfoFiltravel; pct: number; queda: number }[] = [];
  indicadores.forEach((info, i) => {
    const p = pool[i];
    if (!info || !info.bottom || !p) return;
    const queda = quedaEfetiva(p.pct, Math.max(p.dd ?? 0, info.ddPico ?? 0));
    if (queda < FUNDO_QUEDA_MIN || p.volUsdt < FILTRO_VOL_MIN_USDT) return;
    if (ladoAtual(info) === "long") return;
    if (info.bottom.pts < (info.bottom.repique ? Math.max(1, FUNDO_PRE_MIN - 1) : FUNDO_PRE_MIN)) return;
    cands.push({ info, pct: p.pct, queda });
  });
  cands.sort((a, b) => Number(!!b.info.bottom!.repique) - Number(!!a.info.bottom!.repique) || b.info.bottom!.pts - a.info.bottom!.pts);
  const top = cands.slice(0, RADAR_CAND_JANELA); // V74: janela maior que 8/6 — as de cima em cooldown ocupavam todas as vagas e as de baixo nunca saíam
  console.log(`🟢 radar de fundo: ${cands.length} candidata(s) com queda ≥ ${FUNDO_QUEDA_MIN}% e pré-filtro ≥ ${FUNDO_PRE_MIN} pts`);
  if (!top.length) return;
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
    if (row?.last_alert_at && agora - new Date(row.last_alert_at).getTime() < (ehRep ? REPIQUE_COOLDOWN_MIN : FUNDO_COOLDOWN_MIN) * 60000) continue;
    // Auditoria (achado #18, mesmo em radarTopo/radarCompressao): _fundoAvaliado marcava a moeda como "já
    // avaliada nesta vela" ANTES de saber se o envio ia ser confirmado — undermineava o "não vou queimar o
    // cooldown" logo abaixo: o cooldown ficava livre pra tentar de novo, mas esse guard de "1x por vela"
    // bloqueava os próximos ciclos do cron mesmo assim (só destravava na troca de vela, até ~15 min depois).
    // Corrigido: só marca quando não vai reavaliar mesmo (confiança insuficiente) ou quando o envio confirma;
    // no caso de falha de envio, não marca, pra tentar de novo no próximo ciclo.
    if (_fundoAvaliado.get(inst) === ckVela) continue;
    const [fin, vivo] = await Promise.all([fundoFinal(c.info.bottom!, inst), precoAoVivo(inst)]);
    const minConf = fin.repique && !fin.caindoFaca ? REPIQUE_CONF_MIN : FUNDO_CONF_MIN;
    if (fin.conf < minConf) { _fundoAvaliado.set(inst, ckVela); console.log(`🟢 radar: ${inst} ${fin.conf}/10 < ${minConf} (${fin.caindoFaca ? "faca caindo" : "sinais insuficientes"})`); continue; }
    const seta = setaTxt(row?.last_status, fin.conf);
    const msg = msgFundo(c.info, c.pct, c.queda, fin, vivo, seta);
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
    if (ehRep) enviadosRep++; else enviados++;
    console.log(`🟢 radar de fundo enviado: ${inst} ${fin.conf}/10${ehRep ? " ⭐ repique" : ""}`);
  }
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
  await sendTelegram(chatId, cortar(msg), itens.length ? botoesAnalisarLista(itens.map(({ c }) => c.info.instId)) : undefined);
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
  indicadores.forEach((info, i) => {
    const p = pool[i];
    if (!info || !info.top || !p) return;
    const alta = altaEfetiva(p.pct, Math.max(p.up ?? 0, info.altaVale ?? 0));
    if (alta < TOPO_ALTA_MIN || p.volUsdt < FILTRO_VOL_MIN_USDT) return;
    if (ladoAtual(info) === "short") return;
    if (info.top.pts < (info.top.repique ? Math.max(1, TOPO_PRE_MIN - 1) : TOPO_PRE_MIN)) return;
    cands.push({ info, pct: p.pct, alta });
  });
  cands.sort((a, b) => Number(!!b.info.top!.repique) - Number(!!a.info.top!.repique) || b.info.top!.pts - a.info.top!.pts);
  const top = cands.slice(0, RADAR_CAND_JANELA); // V74: janela maior que 8/6 — as de cima em cooldown ocupavam todas as vagas e as de baixo nunca saíam
  console.log(`🔴 radar de topo: ${cands.length} candidata(s) com alta ≥ ${TOPO_ALTA_MIN}% e pré-filtro ≥ ${TOPO_PRE_MIN} pts`);
  if (!top.length) return;
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
    if (row?.last_alert_at && agora - new Date(row.last_alert_at).getTime() < (ehRep ? REPIQUE_COOLDOWN_MIN : TOPO_COOLDOWN_MIN) * 60000) continue;
    // Auditoria (achado #18, mesmo bug em radarFundo/radarCompressao): ver comentário lá.
    if (_fundoAvaliado.get("topo|" + inst) === ckVela) continue;
    const [fin, vivo] = await Promise.all([topoFinal(c.info.top!, inst), precoAoVivo(inst)]);
    const minConf = fin.repique && !fin.caindoFaca ? REPIQUE_CONF_MIN : TOPO_CONF_MIN;
    if (fin.conf < minConf) { _fundoAvaliado.set("topo|" + inst, ckVela); console.log(`🔴 radar de topo: ${inst} ${fin.conf}/10 < ${minConf} (${fin.caindoFaca ? "foguete" : "sinais insuficientes"})`); continue; }
    const seta = setaTxt(row?.last_status, fin.conf);
    const msg = msgTopo(c.info, c.pct, c.alta, fin, vivo, seta);
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
    console.log(`🔴 radar de topo enviado: ${inst} ${fin.conf}/10${ehRep ? " ⭐ repique" : ""}`);
  }
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
  await sendTelegram(chatId, cortar(msg), itens.length ? botoesAnalisarLista(itens.map(({ c }) => c.info.instId)) : undefined);
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
async function registrarAlertaCompressao(SB: any, info: InfoFiltravel, pct: number, conf: number | null = null) {
  if (!_placarTemEntrada) return;
  try {
    // lado provisório: o placar troca pelo lado do 1º fechamento fora da faixa (o que o robô ligado pegaria)
    await inserirLogAlerta(SB, {
      instid: info.instId, lado: "long", tipo: "compressao", status: "🗜️ COMPRESSÃO", fresco: false,
      idade_candles: info.idadeCandles, pct24: pct, preco: info.preco, adx: info.adx ?? null, rsi: info.rsi ?? null,
    }, conf);
  } catch (e) { console.log("⚠️ registrarAlertaCompressao erro", e); }
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
  const avalia = (info: InfoFiltravel | null, vol: number, pct: number) => {
    if (!info || vol < FILTRO_VOL_MIN_USDT) return;
    const res = calcCompressao(info, vol);
    if (res && res.volOk && res.conf >= COMPRESS_CONF_MIN) cands.push({ info, res, pct });
  };
  indicadores.forEach((info, i) => avalia(info, pool[i]?.volUsdt ?? 0, pool[i]?.pct ?? 0));
  extraInfos.forEach((info, i) => avalia(info, varMap.get(extras[i])?.volUsdt ?? 0, varMap.get(extras[i])?.pct ?? 0));
  cands.sort((a, b) => b.res.conf - a.res.conf || b.res.pts - a.res.pts);
  console.log(`🗜️ radar de compressão: ${cands.length} candidata(s) com confiança ≥ ${COMPRESS_CONF_MIN} (${pool.length} do pool + ${extras.length} do rodízio, cursor ${_compCursor}/${universo.length})`);
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
    const vivo = await precoAoVivo(inst);
    const seta = setaTxt(row?.last_status, c.res.conf);
    const msg = msgCompressao(c.info, c.res, vivo, seta);
    const ids = await Promise.all(ativos.map(async (ch) => {
      let extra = "";
      for (const p of posDaMoeda(posMap.get(ch) ?? null, inst)) {
        extra += `\n\n📌 <b>Você está ${p.lado === "long" ? "LONG" : "SHORT"} em ${inst}</b> — entrada ${fmtPrice(p.entrada)} | ${p.pnl >= 0 ? "➕" : "➖"} PnL ${sgn(p.pnl)} USDT (${sgn(p.pnlPct, 1)}% da margem)\nO rompimento pode vir pros dois lados: confira o stop antes.`;
      }
      return await enviarAlertaMoeda(SB, ch, `COMPRESSAO_${inst}`, cortar(msg + extra + notaLat()), botaoAnalisar(inst));
    }));
    if (!ids.some(Boolean)) { console.log(`⚠️ radar de compressão: ${inst} — nenhum envio confirmado, não vou queimar o cooldown`); continue; }
    _fundoAvaliado.set("comp|" + inst, ckVela);
    await registrarAlertaCompressao(SB, c.info, c.pct, c.res.conf);
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
  const top = todos.filter((x) => x.tipo === tipoAlvo)
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
    : `🔄 <b>REVERSÃO — vira contra o dia + perto do Indicador</b> — ${dur}s\n<i>SHORT em moeda que subiu (LONG → SHORT) · LONG em moeda que caiu (SHORT → LONG)${ESTRAT_PUMP ? ", só com sinais de fundo" : ""} · pool: ${pool}</i>\n${DIVISOR}\n\n`;
  if (top.length === 0) msg += textoListaVazia(_ladosDescarte, todos.length);
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
  await sendTelegram(chatId, cortar(msg), top.length ? botoesAnalisarLista(top.map((j) => j.info.instId)) : undefined);
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
async function avisarVoltouPraDentro(SB: any, row: any, info: IndicadorInfo, posMap: Map<string, Pos[] | null>): Promise<void> {
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
  const dest = ALERT_CHAT_IDS.filter((ch) => !silChat(ch) || (SILENCIO_PROTECAO && psDe(ch).some((p) => p.lado === lado)));
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
    await SB.from(TAB).update({ last_status: String(row.last_status).replace(/\s*✔/g, "") }).eq("instid", row.instid);
    console.log(`↩️ ${info.instId} voltou pra dentro da faixa (${nome}, ${dentroPct.toFixed(2)}% dentro)`);
  }
}
async function checarListaAcompanhamento(SB: any, poolInfoMap: Map<string, IndicadorInfo>, posMap: Map<string, Pos[] | null>) {
  const agoraIso = new Date().toISOString();
  const { data: watchRows } = await SB.from("alertas_indicador").select("*").not("watch_until", "is", null).gt("watch_until", agoraIso).eq("watch_notificado", false);
  if (!watchRows || watchRows.length === 0) { console.log("👀 lista de acompanhamento vazia"); return; }
  console.log(`👀 ${watchRows.length} moeda(s) na lista de acompanhamento`);
  await emLotes(watchRows as any[], 5, async (row: any) => {
    try { // V74: erro numa moeda não derruba o lote inteiro (Promise.all) nem as moedas seguintes
    let info = poolInfoMap.get(row.instid) || null;
    if (!info) info = await calcIndicador500(row.instid);
    if (!info) return;
    const atual = ladoAtual(info);
    const kw = (ch: string) => `${info.instId}|${ch}`;
    if (atual === null || atual === row.watch_side) {
      // V74: sem cruzamento contra pendente, qualquer chave de "já avisei" é velha — se ficasse, a próxima virada não avisaria esse chat
      // (acontecia quando um chat não recebia: silêncio, falha ou o intervalo; a linha não avançava e a chave ficava presa).
      ALERT_CHAT_IDS.forEach((ch) => _watchEnviado.delete(kw(ch)));
      if (atual === null) await avisarVoltouPraDentro(SB, row, info, posMap).catch((e) => console.log("⚠️ erro aviso voltou pra dentro", e));
      return;
    }
    const psDe = (ch: string) => posDaMoeda(posMap.get(ch) ?? null, info.instId);
    let dest = ALERT_CHAT_IDS.filter((ch) => !_watchEnviado.has(kw(ch)) && (!silChat(ch) || (SILENCIO_PROTECAO && psDe(ch).some((p) => p.lado !== atual))));
    // V74: intervalo mínimo desde o último aviso desta moeda neste chat. Dentro dele não envia e não mexe na linha:
    // a próxima rodada reavalia (se ainda estiver contra, sai quando o intervalo passar; se desvirou, o `atual === watch_side` acima já barra).
    if (ACOMP_INTERVALO_MIN > 0 && dest.length) {
      const livres: string[] = [];
      for (const ch of dest) {
        let ultimo = 0;
        try {
          const { data: lt } = await SB.from(TAB).select("last_status").eq("instid", `${ACOMP_INTERVALO_PREFIXO}${ch}_${info.instId}`).maybeSingle();
          const n = Number(lt?.last_status);
          if (isFinite(n) && n > 0) ultimo = n;
        } catch { }
        if (Date.now() - ultimo >= ACOMP_INTERVALO_MIN * 60000) livres.push(ch);
        else console.log(`⏳ ${info.instId} cruzou contra, mas o último aviso foi há ${Math.round((Date.now() - ultimo) / 60000)}min (< ${ACOMP_INTERVALO_MIN}min) — aguardo`);
      }
      dest = livres;
    }
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
      const id = await enviarAlertaMoeda(SB, ch, `ACOMP_${info!.instId}`, cortar(msg + (await blocoPosicao(SB, ch, psDe(ch), info!))), botaoAnalisar(info!.instId), ACOMP_AUTOAPAGAR_MIN);
      if (id) {
        _watchEnviado.add(kw(ch));
        if (ACOMP_INTERVALO_MIN > 0) { try { await upsertLinha(SB, `${ACOMP_INTERVALO_PREFIXO}${ch}_${info!.instId}`, { last_status: String(Date.now()) }); } catch { } }
      }
    }));
    if (!ALERT_CHAT_IDS.every((ch) => _watchEnviado.has(kw(ch)))) return;
    ALERT_CHAT_IDS.forEach((ch) => _watchEnviado.delete(kw(ch)));
    if (WATCH_REPETIR) {
      await SB.from("alertas_indicador").update({
        watch_side: atual, watch_notificado: false,
        watch_until: new Date(Date.now() + WATCH_HORAS * 3600 * 1000).toISOString(),
      }).eq("instid", row.instid);
      console.log(`🔁 ${info.instId} virou de novo (${row.watch_side} -> ${atual}); continuo acompanhando`);
    } else {
      await SB.from("alertas_indicador").update({ watch_notificado: true, watch_until: null }).eq("instid", row.instid);
      console.log(`🔁 ${info.instId} saiu da lista de acompanhamento (cruzou contra: ${row.watch_side} -> ${atual})`);
    }
    } catch (e) { console.log(`⚠️ lista de acompanhamento: erro em ${row?.instid}`, e); }
  });
}
// V74: lado do ÚLTIMO ALERTA, gravado no fim do last_status (" [L]"/" [S]"). O watch_side muda quando a moeda vira na lista de acompanhamento; usar ele aqui fazia um alerta
// NOVO no lado novo parecer "repetição" (cooldown de 180 min em vez de 60) e o alerta final achar que o loop principal já avisou. Linha antiga sem marcador: cai no watch_side.
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
// devolve o token da trava; null = outra rodada está rodando (pular); "" = falha ao travar, segue sem trava (nada a liberar)
async function travarCron(SB: any): Promise<string | null> {
  try {
    const agora = Date.now();
    const cutoff = String(agora - CRON_LOCK_TIMEOUT_MS);
    const { data: upd, error: eUpd } = await SB.from(TAB)
      .update({ last_status: String(agora) })
      .eq("instid", CRON_LOCK_ROW)
      .lt("last_status", cutoff)
      .select("instid");
    if (eUpd) throw eUpd;
    if (upd && upd.length) return String(agora);
    // ninguém travado agora: ou a linha não existe ainda (1ª rodada), ou já está travada dentro do prazo
    // (update não bateu no WHERE). Tenta criar a linha; se já existir (corrida no insert), perdeu a trava.
    const { error: eIns } = await SB.from(TAB).insert({ instid: CRON_LOCK_ROW, last_status: String(agora) });
    if (!eIns) return String(agora);
    if (/duplicate|already exists|23505/i.test(String(eIns.message || eIns.code || ""))) return null;
    throw eIns;
  } catch (e) { console.log("⚠️ erro travando cron (seguindo sem trava)", e); return ""; }
}
async function destravarCron(SB: any, token: string) {
  if (!token) return; // rodada que seguiu sem trava não tem o que liberar
  try {
    const { data, error } = await SB.from(TAB).update({ last_status: "0" }).eq("instid", CRON_LOCK_ROW).eq("last_status", token).select("instid");
    if (error) throw error;
    if (!data || !data.length) console.log("ℹ️ trava do cron já era de outra rodada (a minha expirou); não liberei a dela");
  } catch (e) { console.log("⚠️ erro destravando cron", e); }
}
async function runAlertaProativo() {
  if (!ALERT_CHAT_IDS.length) { console.log("⚠️ nenhum chat recebe alerta (ALLOWED_CHAT_IDS vazio ou todos em ALERT_EXCLUIR_IDS)"); return; }
  const SB = getSupabase();
  if (!SB) { console.log("⚠️ SUPABASE_URL/KEY nao configurados"); return; }
  await restaurarCalibracao(SB);
  const tokenCron = await travarCron(SB);
  if (tokenCron === null) { console.log("⏭️ rodada anterior do cron ainda em andamento, pulando esta"); return; }
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
    await heartbeat(SB, `silêncio | ${((Date.now() - inicio) / 1000).toFixed(1)}s`);
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
      last_status: c.status + (c.fresco ? " 🆕" : "") + (contraPos ? " 🛡️" : "") + (c.info.idadeCandles !== null ? " ✔" : "") + (c.lado === "long" ? " [L]" : " [S]"),
      last_alert_at: new Date().toISOString(),
      watch_until: new Date(Date.now() + WATCH_HORAS * 3600 * 1000).toISOString(),
      watch_side: c.lado,
      watch_notificado: false,
    };
    if (row) await SB.from("alertas_indicador").update(registro).eq("instid", c.info.instId);
    else await SB.from("alertas_indicador").insert({ instid: c.info.instId, ...registro });
  }
  // Fix: o alerta dos minutos finais (🚨) tem janela curta (1–5 min antes do fechamento). Antes rodava no fim da rodada, depois dos radares
  // de topo/fundo/compressão, lista de acompanhamento e antecipações; se a rodada demorava ou era pulada pela trava do cron, o 🚨 não saía.
  // Agora roda logo depois do laço principal, antes de tudo isso.
  const lastMap = new Map(variacoes.map((v) => [v.instId, v.last] as [string, number]));
  await checarAlertaFinal(SB, pool, indicadores, lastMap, posMap, perfilAlerta, lat).catch((e) => console.log("❌ erro alerta final", e));
  if (lat.sujo) await lateralSalvar(SB, lat).catch((e) => console.log("⚠️ erro salvando contador lateral", e));
  console.log(`🏁 alerta proativo em ${((Date.now() - inicio) / 1000).toFixed(1)}s - ${setups.length} setups, ${enviados} alertas enviados, ${confBarrados} barrados por confiança${lat.bloq ? `, ${barradosLat} barrados por mercado lateral` : ""}`);
  await heartbeat(SB, `${((Date.now() - inicio) / 1000).toFixed(1)}s | setups ${setups.length} | enviados ${enviados}`);
  await avisarFonteDados(SB).catch((e) => console.log("⚠️ erro avisarFonteDados", e));
  await avisarBtcSemDados(SB).catch((e) => console.log("⚠️ erro avisarBtcSemDados", e));
  // V57: os radares são avisos antecipados (nunca LIGUE AGORA), então seguem rodando com o filtro lateral ligado — a mensagem sai com o aviso 🧱
  if (TOPO_ON) await radarTopo(SB, pool, indicadores, posMap).catch((e) => console.log("❌ erro radar de topo", e));
  if (FUNDO_ON) await radarFundo(SB, pool, indicadores, posMap).catch((e) => console.log("❌ erro radar de fundo", e));
  if (COMPRESS_ON) await radarCompressao(SB, variacoes, pool, indicadores, posMap).catch((e) => console.log("❌ erro radar de compressão", e));
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
  } finally { await destravarCron(SB, tokenCron); }
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
  await sendTelegram(chatId, cortar(m));
}
// V74: /trades — histórico REAL do motor (tabela "trades", em OUTRO Supabase). O bot não tem acesso ao banco do motor: ele pergunta ao motor (action:"trades") com uma
// chave SÓ DE LEITURA (secret MOTOR_LEITURA_SECRET = o LEITURA_SECRET do motor). Secrets: MOTOR_URL (URL da função do motor), MOTOR_LEITURA_SECRET e,
// se houver mais de um usuário no motor, MOTOR_USER_EMAIL. PnL do motor = preço × tamanho, SEM taxas: a taxa abaixo é estimativa (alavancagem 1, 0,12% por perna).
const MOTOR_URL = (Deno.env.get("MOTOR_URL") || "").trim();
const MOTOR_LEITURA_SECRET = (Deno.env.get("MOTOR_LEITURA_SECRET") || "").trim();
const MOTOR_USER_EMAIL = (Deno.env.get("MOTOR_USER_EMAIL") || "").trim();
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
    const r = await fetch(MOTOR_URL, { method: "POST", headers: { "Content-Type": "application/json", "x-leitura-secret": MOTOR_LEITURA_SECRET }, body: JSON.stringify({ action: "trades", dias, ...(MOTOR_USER_EMAIL ? { user_email: MOTOR_USER_EMAIL } : {}) }) });
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
type HipTipo = "topo" | "fundo" | "repique";
type HipLado = "long" | "short";
type HipRes = "invalida" | "funcionou" | "expirou" | "aberta";
type Hip = { inst: string; tipo: HipTipo; lado: HipLado; preco: number; atr: number; t: number; mfe: number; mae: number };
const HIP_NOME: Record<HipTipo, string> = { topo: "topo", fundo: "fundo", repique: "repique" };
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
function hipLinhasBanda(g: { res: HipRes; conf: number | null }[]): string {
  const faixas: HipBanda[] = ["alta", "media", "baixa", "sem"];
  const linhas: string[] = [], pcts: Partial<Record<HipBanda, { n: number; func: number }>> = {};
  for (const b of faixas) {
    const x = g.filter((i) => hipBanda(i.conf) === b);
    if (!x.length) continue;
    const inv = x.filter((i) => i.res === "invalida").length, fun = x.filter((i) => i.res === "funcionou").length;
    pcts[b] = { n: x.length, func: fun / x.length };
    linhas.push(`  ${HIP_BANDA_TXT[b]} (n=${x.length}): invalidou ${Math.round((inv / x.length) * 100)}% · funcionou ${Math.round((fun / x.length) * 100)}%${x.length < 8 ? " ⚠️" : ""}`);
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
// /radar [dias] — com os alertas de radar JÁ enviados (alertas_log) e as velas seguintes, o que aconteceu depois de cada tipo
async function runRadarStats(chatId: number | string, dias: number) {
  const SB = getSupabase();
  if (!SB) { await sendTelegram(chatId, "⚠️ Supabase não configurado."); return; }
  const dd = Math.min(9, Math.max(1, Math.round(dias || 7)));
  const desde = new Date(Date.now() - dd * 86400000).toISOString();
  const busca = (cols: string) => SB.from(PLACAR_TABELA).select(cols).gt("criado_em", desde).in("tipo", ["topo", "fundo"]).order("criado_em", { ascending: false }).limit(500);
  let { data, error } = await busca("instid, lado, tipo, status, preco, criado_em, conf");
  if (error && /conf/i.test(String(error.message || ""))) ({ data, error } = await busca("instid, lado, tipo, status, preco, criado_em")); // coluna conf ausente: segue sem a quebra por nota
  if (error) { await sendTelegram(chatId, `⚠️ Não consegui ler os alertas de radar: ${String(error.message || error).slice(0, 120)}`); return; }
  const rows = ((data || []) as any[]).filter((r) => Number(r.preco) > 0 && r.criado_em);
  if (!rows.length) { await sendTelegram(chatId, `📡 <b>RADARES</b>\n\nNenhum alerta de topo ou fundo nos últimos ${dd} dia(s).`); return; }
  const porMoeda = new Map<string, any[]>();
  for (const r of rows) { const a = porMoeda.get(r.instid) || []; a.push(r); porMoeda.set(r.instid, a); }
  const TFMS = TF_MIN * 60000;
  type Item = { tipo: HipTipo; inst: string; lado: HipLado; emMs: number; preco: number; res: HipRes; barras: number; mfe: number; mae: number; conf: number | null };
  const itens: Item[] = [];
  await emLotes([...porMoeda.keys()], 5, async (id) => {
    const d = await xCandles(id, TIMEFRAME, SAIDA_CANDLES).catch(() => null);
    if (!d) return;
    for (const r of porMoeda.get(id)!) {
      const emMs = new Date(r.criado_em).getTime();
      let k0 = -1;
      for (let i = d.t.length - 1; i >= 0; i--) { if (d.t[i] <= emMs && emMs < d.t[i] + TFMS) { k0 = i; break; } }
      if (k0 < 20) continue;
      const preco0 = Number(r.preco), atr = calcATR(d.h.slice(0, k0 + 1), d.l.slice(0, k0 + 1), d.c.slice(0, k0 + 1), 14);
      const tipo: HipTipo = String(r.status).includes("REPIQUE") ? "repique" : r.tipo === "fundo" ? "fundo" : "topo";
      const lado: HipLado = r.lado === "long" ? "long" : "short";
      itens.push({ tipo, inst: id, lado, emMs, preco: preco0, conf: r.conf == null ? null : Number(r.conf), ...hipAvaliar(d, k0, lado, preco0, isFinite(atr) ? atr : 0, TF_MIN) });
    }
  });
  const fm = (ms: number) => { const iso = new Date(ms + X_TZ_OFFSET_H * 3600000).toISOString(); return `${iso.slice(8, 10)}/${iso.slice(5, 7)} ${iso.slice(11, 16)}`; };
  const sg = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(1)}`;
  let m = `📡 <b>RADARES — o que aconteceu depois do alerta</b> · ${dd} dia(s)\n${DIVISOR}\n<i>Invalidado = o preço andou ≥ max(${HIP_INV_ATR} ATR, ${HIP_INV_PCT}%) contra a ideia · funcionou = o mesmo a favor · prazo ${HIP_HORAS}h. Se os dois cabem na mesma vela, conta invalidado (pior caso).</i>\n\n`;
  for (const tipo of ["topo", "fundo", "repique"] as HipTipo[]) {
    const g = itens.filter((x) => x.tipo === tipo);
    if (!g.length) continue;
    const c = (r: HipRes) => g.filter((x) => x.res === r).length, pc = (n: number) => `${Math.round((n / g.length) * 100)}%`;
    const inval = g.filter((x) => x.res === "invalida");
    m += `${tipo === "topo" ? "🔴" : tipo === "fundo" ? "🟢" : "⭐"} <b>${HIP_NOME[tipo][0].toUpperCase()}${HIP_NOME[tipo].slice(1)}</b> (n=${g.length})\n`;
    m += `invalidou ${c("invalida")} (${pc(c("invalida"))}) · funcionou ${c("funcionou")} (${pc(c("funcionou"))}) · sem desfecho ${c("expirou") + c("aberta")}\n`;
    m += `a favor mediano ${sg(_med(g.map((x) => x.mfe)))}% · contra mediano ${sg(-_med(g.map((x) => x.mae)))}%${inval.length ? ` · invalida em ~${(_med(inval.map((x) => x.barras)) * TF_MIN / 60).toFixed(1)}h` : ""}\n`;
    m += hipLinhasBanda(g); // V74: por nota de confiança do alerta
    if (g.length < 15) m += `<i>amostra pequena (n&lt;15)</i>\n`;
    m += "\n";
  }
  const piores = itens.filter((x) => x.res === "invalida").sort((a, b) => b.mae - a.mae).slice(0, 5);
  if (piores.length) m += `<b>Maiores invalidações</b>\n` + piores.map((x) => `${x.inst.replace("-USDT", "")} ${HIP_NOME[x.tipo]} ${fm(x.emMs)} → ${x.mae.toFixed(1)}% contra em ${(x.barras * TF_MIN / 60).toFixed(1)}h`).join("\n") + "\n\n";
  m += `<i>Só alertas com vela e ATR disponíveis (até 9 dias). Aviso ao vivo: HIP_ON (1), limites HIP_INV_ATR/HIP_INV_PCT/HIP_ALVO_ATR/HIP_ALVO_PCT, prazo HIP_HORAS.</i>`;
  for (const parte of dividirHtml(m)) await sendTelegram(chatId, parte);
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
  await sendTelegram(chatId, cortar(m));
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
    `\n<i>Sem tendência, o cruzamento tende a ser falso. Considere desligar o robô nas moedas sem posição e confirme no gráfico.</i>`;
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
    `\n<i>O mercado pode estar começando a andar. Confirme no gráfico antes de ligar o robô.</i>`;
}
// V70: QUERENDO SAIR — ainda lateral, mas um requisito já chegou no mínimo (precisa de LATERAL_VOTOS_LIBERA pra liberar)
function msgQuerSairLateral(est: LateralEst, novos: string[]): string {
  const b = indBtc(est), e = indEth(est);
  const nMax = Math.max(votosTend(b), votosTend(e)), falta = Math.max(1, LATERAL_VOTOS_LIBERA - nMax);
  return `👀 <b>Mercado querendo sair da lateral</b>\n${DIVISOR}\n\n` +
    `${novos.length === 1 ? "1 requisito chegou" : `${novos.length} requisitos chegaram`} no mínimo:\n${novos.map((k) => latDescSinal(est, k)).join("\n")}\n\n` +
    `<i>Mínimo: ${latRegrasTend()}</i>\n${latLinhaAtivo("BTC", b)}${latLinhaAtivo("ETH", e)}\n` +
    `🧱 Ainda lateral: falta${falta > 1 ? "m" : ""} ${falta} requisito${falta > 1 ? "s" : ""} em BTC ou ETH pra liberar (precisa de ${LATERAL_VOTOS_LIBERA} de 3).` +
    `\n<i>Pode ser só o começo de um movimento. Ainda não confie em cruzamento novo; confirme no gráfico.</i>`;
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
  return `${titulo}: ${estado}\n<i>Mínimo: ${latRegrasTend()}</i>\n${latLinhaAtivo("BTC", b)}${latLinhaAtivo("ETH", e)}${regra}${velho}\n${placar}\n`;
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
  return `${cab}${barr}${velho}\n   BTC ${indTxt(indBtc(est))}\n   ETH ${indTxt(indEth(est))}\n`;
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
    getVariacoes24h().catch(() => [] as VarInfo[]),
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
    let b = i > 0 ? `${MINI_DIVISOR}\n` : "";
    b += `🪙 <b>${r.instid}</b> — alerta ${r.watch_side === "long" ? "LONG" : "SHORT"} há ${horasDesde}h (faltam ${falta})\n`;
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
  if (parte.trim()) await sendTelegram(chatId, parte + `<i>Toque em 🔎 para a análise completa.</i>`, botoesAnalisarLista(itens.map((x) => String(x.r.instid))));
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
const ANALISE_TARDE_CANDLES = 8;
const ANALISE_MUITO_TARDE_CANDLES = 16;
type VarInfo = { instId: string; pct: number; last: number; volUsdt: number; dd: number; up: number };
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
      instid: c.info.instId, lado: c.lado, tipo: c.tipo, status: c.status + marcaLatLog(), fresco: c.fresco,
      idade_candles: c.info.idadeCandles, pct24: c.pct, preco: c.info.preco,
      adx: f.adx ?? null, rsi: f.rsi ?? null,
    }, conf);
  } catch (e) { console.log("⚠️ registrarAlerta erro", e); }
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
const ehDescartadoLog = (r: any) => r?.ent_status === "repetido" || r?.ent_status === "invalido"; // V68: fora de todas as estatísticas
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
          const { data: ja } = await SB.from(PLACAR_TABELA).select("id").eq("instid", r.instid).eq("lado", e.lado ?? r.lado)
            .eq("ent_em", new Date(e.emMs).toISOString()).eq("ent_status", "entrou").neq("id", r.id).limit(1);
          if (ja && ja.length) {
            const { error: e5 } = await SB.from(PLACAR_TABELA).update({ ent_status: "repetido" }).eq("id", r.id);
            if (e5) console.log("⚠️ update entrada repetida:", e5.message); else atualizados++;
            continue;
          }
        }
        upd.ent_status = "entrou"; upd.ent_em = new Date(e.emMs).toISOString(); upd.preco_alerta = r.preco; upd.preco = e.preco;
        if (e.lado) { upd.lado = e.lado; r.lado = e.lado; }
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
    return `${rotH(h)}: ${Math.round((ac / rs.length) * 100)}% (${ac}/${rs.length}) ${_sg(_med(rs))}`;
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
    return `<b>${nome}</b> (n=${xs.length})\nacerto ${Math.round((ac / xs.length) * 100)}% · mediana ${_sg(_med(xs))} · aparada ${_sg(_mediaAparada(xs))} · PF ${isFinite(pf) ? pf.toFixed(2) : pf === Infinity ? "∞" : "—"}\n\n`;
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
async function runPlacar(chatId: number | string, dias: number) {
  const SB = getSupabase();
  if (!SB) { await sendTelegram(chatId, "⚠️ Supabase não configurado."); return; }
  const desde = new Date(Date.now() - dias * 86400000).toISOString();
  const { data, error } = await lerPaginado((a, b) => SB.from(PLACAR_TABELA).select("*").gt("criado_em", desde).order("criado_em", { ascending: false }).range(a, b));
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
  await sendTelegram(chatId, cortar(msg));
}
// ─────────────────────────────────────────────────────────────
// V66: /15min — placar do horizonte de 15m, separado do /placar
async function run15min(chatId: number | string, dias: number) {
  const SB = getSupabase();
  if (!SB) { await sendTelegram(chatId, "⚠️ Supabase não configurado."); return; }
  const desde = new Date(Date.now() - dias * 86400000).toISOString();
  const { data, error } = await lerPaginado((a, b) => SB.from(PLACAR_TABELA).select("*").gt("criado_em", desde).order("criado_em", { ascending: false }).range(a, b));
  if (error) { await sendTelegram(chatId, `⚠️ Não consegui ler o placar (a tabela ${PLACAR_TABELA} existe?): ${String(error.message || error).replace(/</g, "&lt;")}`); return; }
  const rows = ((data || []) as any[]).filter((r) => !ehFinalLog(r) && !ehDescartadoLog(r));
  if (!rows.length) { await sendTelegram(chatId, `⏱️ <b>PLACAR 15m</b>\n\nNenhum alerta registrado nos últimos ${dias} dia(s).`); return; }
  if (!rows.some((r) => "preco_15m" in r)) { await sendTelegram(chatId, "⚠️ alertas_log sem a coluna preco_15m: rode o ALTER TABLE do horizonte de 15m."); return; }
  const conf = rows.filter((r) => retornoLog(r, 15) !== null).length;
  let msg = `⏱️ <b>PLACAR 15m</b> — últimos ${dias} dia(s)\n${DIVISOR}\n${rows.length} alerta(s), ${conf} com 15m conferido\n<i>retorno em 15 min desde o fechamento da vela do cruzamento, já com a taxa. Serve pra medir o ruído de curto prazo; trade que dura horas ou dias não cabe aqui, veja o /saida.</i>\n\n`;
  msg += `<b>Geral (todos os alertas)</b>\n${linhaStats(rows, [15])}\n`;
  await sendTelegram(chatId, cortar(msg));
  try {
    const t15 = placar15mTxt(rows);
    await sendTelegram(chatId, cortar(t15 || "⏱️ Ainda sem alertas frescos (cruzou agora) com 15m conferido nesse período."));
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
async function runSaida(chatId: number | string, dias: number, opc?: { moeda?: string; cfg?: { trava: number; cb: number; sl: number }; filtro?: { mov: number; adx: number; subindo: boolean } | null }) {
  const SB = getSupabase();
  if (!SB) { await sendTelegram(chatId, "⚠️ Supabase não configurado."); return; }
  const maxDias = Math.max(1, Math.floor((SAIDA_CANDLES * TF_MIN) / 1440) - 1);
  const dd = Math.min(dias, maxDias);
  const desde = new Date(Date.now() - dd * 86400000).toISOString();
  const { data, error } = await SB.from(PLACAR_TABELA).select("*").gt("criado_em", desde).eq("ent_status", "entrou").order("criado_em", { ascending: false }).limit(600);
  if (error) { await sendTelegram(chatId, `⚠️ Não consegui ler o placar: ${String(error.message || error).replace(/</g, "&lt;")}`); return; }
  const truncou600 = (data || []).length >= 600; // V74: o .limit(600) cortava em silêncio
  const baseDe = (id: string) => String(id).split("-")[0];
  const rowsBase = ((data || []) as any[]).filter((r) => !ehFinalLog(r) && r.ent_em && Number(r.preco) > 0)
    .filter((r) => !opc?.moeda || baseDe(r.instid) === opc.moeda || baseDe(r.instid) === `1000${opc.moeda}`);
  const filtro = opc?.filtro ?? null;
  const rows = rowsBase.filter((r) => !filtro || !(filtro.mov > 0) || (r.pct24 != null && Math.abs(Number(r.pct24)) >= filtro.mov)); // |24h| da hora do alerta
  const filtroBase = filtro ? `🔎 Filtro (valores da hora do alerta): |24h| ≥ ${filtro.mov}% · ADX ≥ ${filtro.adx}${filtro.subindo ? " e subindo" : ""}` : "";
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
  ];
  const abertos = res.filter((x) => x.a.motivo === "aberto").length;
  if (filtro) filtroTxt = `${filtroBase} · ${passaramFiltro} de ${rowsBase.length} entradas passaram (todas: /saida ${dd} tudo)\nFunil: ${rowsBase.length} → ${rows.length} com |24h| ≥ ${filtro.mov}% → ${passaramAdx} com ADX ≥ ${filtro.adx} → ${passaramFiltro}${filtro.subindo ? " subindo" : ""}\n`;
  let msg = `🚪 <b>SAÍDA REAL DO ROBÔ</b> — últimos ${dd} dia(s)${opc?.moeda ? ` · ${opc.moeda}` : ""}\n${DIVISOR}\n${filtroTxt}${res.length} entrada(s) simuladas${abertos ? `, ${abertos} ainda aberta(s) (contadas ao preço atual)` : ""}${semHist ? `, ${semHist} sem velas suficientes` : ""}\n<i>Entrada = fechamento da vela do cruzamento. 1R = ${SAIDA_STOP_ATR}×ATR da entrada. A = sai no cruzamento contrário da faixa ou no stop. B = A + trailing por degraus de ${TRAIL_ATR_MULT}×ATR. Já desconta a taxa (${TAXA_IDA_VOLTA_PCT.toFixed(2)}%); sem funding.</i>\n\n`;
  for (const [nome, fn] of grupos) {
    const g = res.filter(fn);
    if (!g.length) continue;
    msg += `<b>${nome}</b> (n=${g.length})\nA: ${statsR(g.map((x) => x.a.r))}\nB: ${statsR(g.map((x) => x.b.r))}\n`;
    const ehLatGrupo = nome.startsWith("🧱") || nome.startsWith("📶");
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
  msg += `<i>Uso: /saida 7 (até ${maxDias} dias, limitado pelas ${SAIDA_CANDLES} velas de 15m)</i>`;
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
  await sendTelegram(chatId, cortar(msg), [...botaoAnalisar(a.instId), ...botaoAnalisar(b.instId)]);
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
      const { data } = await SB.from(PLACAR_TABELA).select("*").eq("instid", instId).order("criado_em", { ascending: false }).limit(3);
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
    const r = await fetch(`https://api.bybit.com/v5/market/orderbook?category=linear&symbol=${sym}&limit=50`);
    const j = await r.json();
    const bids = j?.result?.b as [string, string][] | undefined;
    const asks = j?.result?.a as [string, string][] | undefined;
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
  const { data: w } = await SB.from(TAB).select("instid").not("watch_until", "is", null).gt("watch_until", new Date().toISOString()).eq("watch_notificado", false);
  msg += real + lista + anterior + `\n📋 ${(w || []).length} moeda(s) seguem em acompanhamento.`;
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
  await sendTelegram(chatId, cortar(msg));
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
  await sendTelegram(chatId, cortar(msg));
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
  const [janelas, agenda, noticias, placarBruto, pos, lat] = await Promise.all([painelJanelas().catch(() => ""), agBlocoProximas(SB), ntBlocoPainel(SB), fim ? montarResumoNoite(SB, chat, est.inicio) : Promise.resolve(""), agPosicoes(chat), lateralLer(SB)]); // placar (alertas + resultado real) só no fechamento das 21h
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
  const latPn = LATERAL_ON ? await lateralLer(SB) : null;
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
  const { data, error } = await lerPaginado((a, b) => SB.from(PLACAR_TABELA).select("*").gt("criado_em", new Date(desdeMs).toISOString()).order("criado_em", { ascending: true }).range(a, b));
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
    lateral = lateralStatusTxt(await lateralLer(SB));
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
    pausa + (emSilencio() ? `🌙 Silêncio automático agora (${SILENCIO_INI_H}h–${SILENCIO_FIM_H}h)\n` : "") +
    `⭐ Seguidas: ${nSeg}/${SEG_MAX}\n` +
    (ALERTA_AUTOAPAGAR_MIN > 0 ? `🗑️ Auto-apagar: ${nDel} alerta(s) na fila (some${nDel ? "m" : ""} em até ${ALERTA_AUTOAPAGAR_MIN} min)\n` : "") +
    `🔔 Este chat ${ALERT_CHAT_IDS.includes(String(chatId)) ? "recebe" : "NÃO recebe"} os alertas automáticos\n` +
    `🔑 Chave BloFin: ${cred ? "vinculada" : "não vinculada"}`;
  const falhou = testes.some((t) => t.startsWith("❌"));
  await sendTelegram(chatId, cortar(msg), falhou ? [[{ text: "🔄 Tentar de novo", callback_data: "/status" }]] : undefined);
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
  await sendTelegram(chatId, cortar(msg), falhouRobo ? [...botoesRobo, [{ text: "🔄 Tentar de novo", callback_data: "/robo" }]] : (botoesRobo.length ? botoesRobo : undefined));
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
    t += `Das ${SILENCIO_INI_H}h às ${SILENCIO_FIM_H}h (horário local)${SILENCIO_PROTECAO ? ": só passa alerta de proteção de posição aberta" : ""}.\n\n`;
  }

  t += `${DIVISOR}\n📖 Lista de comandos: /comandos\n🆔 Seu chat_id: <b>${chatId}</b>`;
  return t;
}
function textoComandos(chatId: number | string, modoAtual: Modo, remetente: number | string): string {
  const c = modoAtual === "experiente"; // compacto: uma linha curta por comando
  let t = `📖 <b>Comandos</b>\n${DIVISOR}\n`;
  let primeiro = true;
  const sec = (titulo: string, itens: [string, string, string][]) => {
    t += primeiro ? `\n<b>${titulo}</b>\n` : `\n${MINI_DIVISOR}\n<b>${titulo}</b>\n`;
    primeiro = false;
    for (const [cmd, curto, longo] of itens) t += `${cmd} — ${c ? curto : longo}\n`;
  };

  sec("🔎 Consultar", [
    ["🔎 /analise ONE", "veredito completo + guia de fora/dentro", "veredito, \"ligar o robô?\" (PREPARE / LIGUE AGORA), tempo até o fechamento da vela, distância ao Indicador e guia pra quem está de fora e pra quem já está dentro"],
    ["⚖️ /comparar MOEDA1 MOEDA2", "qual tem a confiança mais alta agora", "roda o mesmo cálculo de confiança do /analise nas duas e mostra lado a lado, com o veredito de qual sinal está mais forte agora"],
  ]);

  sec("🧠 Perguntar à IA", [
    ["🤖 /pergunta ONE [pergunta]", "Gemini", "roda o /analise da moeda e manda pro Gemini responder; sem pergunta, ele dá um veredito curto (ligar, esperar ou evitar)"],
    ["🧠 /veredito ONE [pergunta]", "Claude", "igual o /pergunta, mas usa o Claude"],
    ["🏆 /melhor [pergunta]", "Gemini compara as moedas da varredura", "roda as varreduras de oportunidade e reversão e pede pro Gemini comparar e dizer qual moeda está mais bem posicionada agora (filtro inicial; confirme com /pergunta)"],
    ["🎓 /estudo", "checklist + como funciona o filtro de lateral", "checklist com os 8 pontos pra conferir no /analise antes de decidir ligar o robô, e a aula do filtro de mercado lateral (o que é, os 3 requisitos e os estados)"],
  ]);

  const varreduras: [string, string, string][] = [
    ["🚀 /oportunidade", "a favor do dia, perto do Indicador", "a favor do dia (LONG em moeda que subiu, SHORT em moeda que caiu), com liquidez e tendência, perto do Indicador"],
    ["🔄 /reversao", "contra o dia, perto do Indicador", "vira contra o dia: SHORT em moeda que subiu (LONG → SHORT) e LONG em moeda que caiu (SHORT → LONG, só com sinais de fundo), perto do Indicador"],
  ];
  if (FUNDO_ON) varreduras.push(["🟢 /fundo", "sinais de fundo (⭐ repique primeiro)", "caíram ≥10% (no dia ou desde a máxima recente) e já mostram sinais de fundo (possível virada SHORT → LONG); ⭐ repique = disparou, recuou até a faixa e segura nela (retomada da alta), vem primeiro"]);
  if (TOPO_ON) varreduras.push(["🔴 /topo", "sinais de topo (⭐ repique primeiro)", "subiram ≥10% (no dia ou desde a mínima recente) e já mostram sinais de topo (possível virada LONG → SHORT); ⭐ repique = despencou, repicou até a faixa e foi rejeitada (retomada da queda), vem primeiro"]);
  sec("📡 Varreduras", varreduras);

  sec("⭐ Acompanhar", [
    ["📋 /lista", "moedas em acompanhamento", "moedas em acompanhamento (alerta original + situação atual)"],
    ["⭐ /seguir ONE", "segue uma moeda (sem moeda: mostra as seguidas)", "moeda sua, avisada mesmo fora do top 40; /seguir sem moeda mostra as que você já segue (botões 🔎 e ❌ na lista)"],
    ["❌ /parar ONE", "deixa de seguir", "deixa de acompanhar a moeda"],
  ]);

  sec("📊 Resultados", [
    ["📊 /placar 7", "taxa de acerto dos alertas", "taxa de acerto dos alertas (1h, 4h, 24h); o número é a quantidade de dias"],
    ["⏱ /15min 7", "placar do horizonte de 15m", "placar separado só do horizonte de 15 min (alertas frescos, PF, extremos)"],
    ["🚪 /saida", "simula a saída real do robô", "simula a saída do robô nos últimos 7 dias (até 9): R médio, profit factor, sem os 3 melhores, viradas, lateral contra tendência e o trailing do motor em % (hoje 0,5/0,3 contra 5/3,5 contínuo e em degraus de 5%). Já vem filtrado pelo que você usa: moeda com |24h| ≥ 8% e ADX ≥ 14 subindo. Opcional: /saida 9 · /saida QNT · /saida 5/3.5/3 · /saida tudo (sem filtro)"],
    ["📡 /radar 7", "o que aconteceu depois dos radares", "com os alertas de topo e fundo já enviados e as velas seguintes, mostra quantos foram invalidados (preço andou contra a ideia), quantos funcionaram e quanto andou; as maiores invalidações. Os alertas ao vivo de \"invalidado\" e \"funcionou\" saem sozinhos (HIP_ON)"],
    ["🧾 /trades 7", "trades reais do motor", "histórico real do motor (outro Supabase, lido por chave só de leitura): acertos, PnL, taxa estimada, fechamentos por motivo (virada, trailing, SL/TP), melhores e piores moedas. Precisa dos Secrets MOTOR_URL e MOTOR_LEITURA_SECRET"],
    ["📜 /logs", "volume de logs", "mostra o nível de logs da função (LOG_NIVEL: tudo, normal, erro ou mudo), quantos logs foram ocultados e como mudar pelos Secrets"],
    ["📐 /div", "divergência de RSI do BTC", "divergências de RSI do BTC (regular e oculta) em 1h, 4h, diário e semanal: o que está antecipado em aberto e o que o BTC fez depois de cada aviso. /div diag mostra por que avisou ou não (regra a regra, com 15m pra comparar com o TradingView)"],
    ["🧾 /meuplacar 7", "seus trades reais x alertas", "seus trades reais x alertas do bot (precisa da chave BloFin)"],
    ["🌅 /resumo", "painel do dia", "painel do dia (21h a 21h), atualizado a cada hora: agenda e notícias no topo, BTC (comparação desde as 21h e 8h), posições e janelas fortes; no fechamento das 21h vêm os 15m em destaque, seu resultado real e o comparativo com o ciclo anterior"],
    ["📰 /noticia", "falas do Trump e notícias que mexem no mercado", "últimas notícias de impacto: falas do Trump (espelho do Truth Social) e manchetes de cripto/macro, traduzidas pro português quando o Gemini está configurado; aceita /noticia trump, /noticia cripto e /noticia 24 (horas). Avisa sozinho quando o Trump posta algo de alto impacto"],
    ["📅 /agenda", "dados econômicos de hoje e amanhã", "dados econômicos importantes de hoje e amanhã (avisa 60 e 15 min antes, pra você evitar operar, e depois compara o resultado com a projeção)"],
  ]);

  const temChave = !!credDe(chatId);
  sec("💼 Sua conta BloFin", [
    ["💼 /robo", c ? `posições e sugestões ${temChave ? "🔑" : "🔒 sem chave vinculada"}` : "", "posições abertas, sugestão para cada uma e resultado do dia (só leitura)"],
  ]);
  if (!c) t += temChave ? "🔑 chave vinculada a este chat\n" : "🔑 nenhuma chave vinculada a este chat (o /robo fica desativado aqui)\n";

  const ajustes: [string, string, string][] = [
    ["⏸ /pausar", "pausa os alertas (1h, 2h ou 3h)", "pausa os alertas por 1h, 2h ou 3h"],
    ["▶️ /retomar", "volta os alertas", "volta os alertas antes do fim da pausa"],
    ["⌨️ /menu", "teclado fixo", "ativa o teclado fixo embaixo"],
    ["🎛️ /modo", `agora: ${c ? "⚡ Experiente" : "🎓 Novato"}`, `troca entre Novato e Experiente (agora: ${c ? "⚡ Experiente" : "🎓 Novato"})`],
    ["🩺 /status", "testa as conexões", "testa Supabase, corretora, sua conta BloFin e o cron"],
  ];
  if (ehAdmin(chatId, remetente)) ajustes.push(["⚙️ /config", "parâmetros em uso (admin)", "parâmetros em uso (só você, admin)"]);
  sec("⚙️ Ajustes", ajustes);

  t += `\n${DIVISOR}\nℹ️ Como o robô e os alertas funcionam: /help\n`;
  t += c ? `🆔 chat_id: ${chatId}${ALERT_CHAT_IDS.length ? ` · 🔔 alerta proativo ativo (≥${ALERT_OPORT_PCT_MIN}%/${ALERT_REV_PCT_MIN}%)` : " · 🔔 alerta proativo desativado"}` : `🆔 Seu chat_id: <b>${chatId}</b>`;
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
function montarConfig(): string {
  const on = (b: boolean) => (b ? "ligado" : "desligado");
  const tz = `UTC${X_TZ_OFFSET_H >= 0 ? "+" : ""}${X_TZ_OFFSET_H}`;
  const adminFixo = !!Deno.env.get("ADMIN_CHAT_ID") || !!Deno.env.get("BLOFIN_OWNER_CHAT_ID");
  let m = `⚙️ <b>CONFIG</b> (valores em uso agora)\n${DIVISOR}\n\n`;
  m += `🔔 <b>Alertas</b>\n• oportunidade ≥ ${ALERT_OPORT_PCT_MIN}% · reversão ≥ ${ALERT_REV_PCT_MIN}% (24h)\n• cooldown ${ALERT_COOLDOWN_MIN} min · repetição idêntica ${ALERT_COOLDOWN_REPETIDO_MIN} min\n• fresco ≤ ${ALERT_FRESCO_CANDLES} velas · idade máx ${ALERT_IDADE_MAX_CANDLES || "sem limite"}\n• máx ${ALERT_MAX_POR_RODADA} por rodada · pool ${ALERT_POOL} · acompanhamento ${WATCH_HORAS}h (repete a cada virada: ${WATCH_REPETIR ? "sim" : "não"})\n• antecipação: ${ANTEC_ETA_MAX_CANDLES} velas (${ANTEC_ETA_MAX_CANDLES * TF_MIN} min), distância ≤ ${ANTEC_DIST_MAX_PCT}%\n• auto-apagar: ${ALERTA_AUTOAPAGAR_MIN > 0 ? `${ALERTA_AUTOAPAGAR_MIN} min` : "desligado"}\n\n`;
  m += `💸 <b>Taxa no placar</b>: ${TAXA_IDA_VOLTA_PCT.toFixed(3)}% ida e volta (taker ${TAXA_TAKER_PCT}% × 2; ajuste com TAXA_TAKER_PCT ou TAXA_IDA_VOLTA_PCT)\n`;
  m += `📏 <b>Placar</b>: entrada pelo fechamento da vela do cruzamento ${on(PLACAR_ENTRADA_ON && _placarTemEntrada)}${PLACAR_ENTRADA_ON && !_placarTemEntrada ? " (faltam as colunas: rode o ALTER TABLE V30)" : ""} · cruzamento vale até ${ENTRADA_MAX_CANDLES} velas (${ENTRADA_MAX_CANDLES * TF_MIN} min) depois do aviso\n`;
  m += `\n${MINI_DIVISOR}\n`;
  m += `⏱ <b>V32 · alerta dos minutos finais</b> (${on(FINAL_ON)})\n• 🚨 janela: de ${FINAL_JANELA_MAX_MIN} a ${FINAL_JANELA_MIN_MIN} min antes do fechamento da vela ${TIMEFRAME} (cron a cada 1–2 min)\n• avisa se o preço já está ${FINAL_ENTRADA_PCT}%+ além da linha projetada · cancela só se recuar ${FINAL_CANCELA_PCT}% (ou ${FINAL_CANCELA_ATR}×ATR) pra dentro (histerese)\n• 🕒 PREPARE: de ${FINAL_PREPARE_MAX_MIN} a ${FINAL_JANELA_MAX_MIN} min antes, moeda a ≤ ${FINAL_PREPARE_DIST_PCT}% da linha e chegando (máx ${FINAL_PREPARE_MAX} por rodada, confiança mín. −${FINAL_PREPARE_FOLGA_CONF})\n• 🔜 se a vela fechar sem cruzar mas seguir a ≤ ${FINAL_PROXIMA_DIST_PCT}% da linha e chegando, avisa que a chance passa pra próxima vela\n• ⚡ janela forte de horário no fechamento · placar próprio no /placar (${on(FINAL_PLACAR_ON)})\n• pré-filtro ${FINAL_PREFILTRO_PCT}% da linha · máx ${FINAL_MAX_POR_RODADA} por rodada · confirma ✅/❌ no fechamento\n\n`;
  m += `🛡️ <b>V29</b>\n• filtro BTC: ${on(BTC_DIR_ON)} (±${BTC_DIR_PCT}%/h pontua) · reversão barrada contra BTC ≥ ±${BTC_BLOQ_REV_PCT}%/h (SHORT com BTC subindo · LONG com BTC caindo)${BTC_BLOQ_REV_PCT > 0 ? "" : " (desligado)"}\n• webhook: ${WEBHOOK_SECRET ? "com secret_token ✅" : "SEM secret_token ⚠️"} · cron: ${CRON_SO_HEADER ? "só por header ✅" : "aceita segredo na URL ⚠️"}\n• anti-repetição salva no Supabase\n\n`;
  m += `📐 <b>V36 · inclinação e compressão</b>\n• inclinação da faixa (${INCLINA_JAN} velas, em velas típicas por vela): forte ≥ ${INCLINA_FORTE} (−2 contra) · moderada ≥ ${INCLINA_MOD} (−1 contra, +1 a favor) · plana ≤ ${INCLINA_PLANA} · virada com sinais de fundo/topo: penalidade aliviada\n• 1º cruzamento em faixa comprimida sem volume ≥ ${VOL_ACEL_RATIO}×: −1\n• 🗜️ radar de compressão (${on(COMPRESS_ON)}): faixa ≤ ${Math.round(SQUEEZE_REL * 100)}% da típica (muito: ≤ ${Math.round(COMPRESS_REL * 100)}%) · volume ≥ ${COMPRESS_VOL_MIN}× · confiança ≥ ${COMPRESS_CONF_MIN}/10 · rodízio de ${COMPRESS_ROT_N} pares por rodada · cooldown ${COMPRESS_COOLDOWN_MIN} min · máx ${COMPRESS_MAX_POR_RODADA} por rodada · entra no /placar (lado do 1º fechamento fora da faixa, em até ${ENTRADA_MAX_CANDLES * TF_MIN} min)\n• ⭐ repique nos dois lados (SHORT no radar de topo · LONG no radar de fundo): bônus +${REPIQUE_BONUS} pt · confiança mín. ${REPIQUE_CONF_MIN}/10 (topo comum ${TOPO_CONF_MIN}) · cooldown ${REPIQUE_COOLDOWN_MIN} min · até ${REPIQUE_MAX_POR_RODADA} por rodada · placar separado por lado · tipo (oportunidade/reversão) só considera o dia virado fora de ±${REPIQUE_PCT_ZONA}% (zona morta contra ruído perto de 0%)\n• 📋 /oportunidade e /reversao: top ${LISTA_POOL_LADO} que mais subiram + top ${LISTA_POOL_LADO} que mais caíram, classificados pelo LADO da virada (igual ao alerta)\n\n`;
  m += `🔴 <b>V35 · radar de topo</b> (${on(TOPO_ON)})\n• alta ≥ ${TOPO_ALTA_MIN}% (em 24h ou desde a mínima das últimas ${Math.round(FUNDO_JAN_PICO / 4)}h) · pool extra de ${ALERT_POOL_ALTA} · rejeição na faixa após alta ≥ ${TOPO_TOQUE_VALE_MIN}% pontua · confiança ≥ ${TOPO_CONF_MIN}/10 · pré-filtro ≥ ${TOPO_PRE_MIN} pts · cooldown ${TOPO_COOLDOWN_MIN} min\n\n`;
  m += `🟢 <b>V28/V34 · radar de fundo</b> (${on(FUNDO_ON)})\n• queda ≥ ${FUNDO_QUEDA_MIN}% (em 24h ou desde a máxima das últimas ${Math.round(FUNDO_JAN_PICO / 4)}h) · pool extra de ${ALERT_POOL_RECUO} moedas que mais recuaram · toque na faixa após recuo ≥ ${FUNDO_TOQUE_PICO_MIN}% pontua · confiança ≥ ${FUNDO_CONF_MIN}/10 · pré-filtro ≥ ${FUNDO_PRE_MIN} pts (velas 15m)\n• cooldown ${FUNDO_COOLDOWN_MIN} min · máx ${FUNDO_MAX_POR_RODADA} por rodada · BTC ≤ -${FUNDO_BTC_QUEDA_PCT}%/h penaliza\n• LONG em moeda que caiu: ${FUNDO_LIBERA_LONG ? `liberado com sinal de fundo (confiança mín. ${CONF_MIN_FUNDO_LONG}/10)` : "bloqueado"}\n• V63: book (±${BOOK_IMB_MIN_PCT}%) e inclinação da faixa também contam a favor/contra a virada (antes só funding/OI/BTC) · no /analise, /fundo e /topo com inclinação; nas listas em massa só o book\n• V59: no /analise, sem radar aceso e moeda ≥3× ATR esticada a favor do robô, aviso ⚠️ "já esticou" (entrada tardia)\n\n`;
  m += `🧭 <b>V26</b>\n• squeeze: faixa ≤ ${Math.round(SQUEEZE_REL * 100)}% da típica · volume das velas ≥ ${VOL_ACEL_RATIO}× (seco ≤ ${VOL_SECO_RATIO}×)\n• alarme falso: cancela se a distância até a linha crescer ${Math.round((ANTEC_CANCELA_RECUO - 1) * 100)}%+ ou passar de 2× o prazo\n• confiança: verde ≥ ${CONF_VERDE}/10 · amarelo ≥ ${CONF_AMARELO}/10\n• modo pump (${on(ESTRAT_PUMP)}): mín. confiança oportunidade ${CONF_MIN_OPORT} · reversão ${CONF_MIN_REVERSAO} · serrote ≥ ${SERROTE_MAX} trocas/4h barra · RSI máx LONG ${FILTRO_RSI_MAX_LONG} · limite ${LIMITE_LADO} por lado\n`;
  m += `\n${MINI_DIVISOR}\n`;
  m += `🧹 <b>Filtros</b> (${on(ALERT_FILTROS_ON)})\n• volume ≥ ${(FILTRO_VOL_MIN_USDT / 1e6).toFixed(1)}M USDT (antes do corte do pool) · ADX ≥ ${FILTRO_ADX_MIN}${FILTRO_ADX_SUBINDO ? ` e subindo${FILTRO_ADX_SUBINDO_ATE > 0 ? ` (só exige subir abaixo de ${FILTRO_ADX_SUBINDO_ATE})` : ""}` : ""}\n• ${ESTRAT_PUMP ? `RSI (modo pump, um lado só): LONG barrado acima de ${FILTRO_RSI_MAX_LONG} · SHORT barrado abaixo de ${FILTRO_RSI_MIN}` : `RSI entre ${FILTRO_RSI_MIN} e ${FILTRO_RSI_MAX}`} · distância ≤ ${FILTRO_DIST_MAX_PCT}% (só nas listas)\n• amplitude mín. ${FILTRO_AMPLITUDE_MIN > 0 ? `${FILTRO_AMPLITUDE_MIN}%` : "desligada"}\n• 🚫 lista negra (${BLACKLIST_MOEDAS.size}): ${BLACKLIST_MOEDAS.size ? [...BLACKLIST_MOEDAS].sort().join(", ") : "nenhuma"}\n\n`;
  m += `🧬 <b>V60-62 · DI oculto</b> (${on(DI_OCULTO_ON)})\n• +DI/−DI calculado por trás do ADX, nunca aparece em mensagem · gap mínimo pra ter opinião: ${DI_GAP_MIN}\n• continuação com ADX forte mas força do lado oposto: ADX forte vale +1 em vez de +2 · "ADX subindo" vira "ADX subindo, mas puxado pelo lado oposto" (+0) em vez de +1 · reversão não é afetada · env: DI_OCULTO=0 desliga, DI_GAP_MIN\n\n`;
  m += `🧱 <b>V58 · filtro de mercado lateral</b> (${on(LATERAL_ON)} · modo ${LATERAL_MODO === "visual" ? "visual (sem barrar)" : "bloqueia"})\n• BTC e ETH votam com 3 indicadores 15m: ADX · ER (Efficiency Ratio) · caixa (amplitude de ${LATERAL_JAN / 4}h em ATRs)\n• ${LATERAL_BARRA ? `bloqueia o LIGUE AGORA e os alertas de ENTRADA quando os dois têm ${LATERAL_VOTOS} de 3 sinais de lateral (${latRegras()}) e nenhum de tendência · libera quando um deles tem ${latQtdLibera()} (${latRegrasTend()}) · depois de liberar espera ${LATERAL_HOLD_MIN} min antes de bloquear de novo` : `modo visual: nada é barrado — todo alerta sai normal, com a nota 🧱 quando os dois têm ${LATERAL_VOTOS} de 3 sinais de lateral (${latRegras()}) e nenhum de tendência`}\n• PREPARE e radares seguem passando, com aviso 🧱 · 📈 aviso quando um dos 3 sinais (ADX/ER/caixa, BTC ou ETH) sai da lateral (${on(LATERAL_AVISO_ON)}) · 📉 aviso quando os dois ENTRAM em lateral (${on(LATERAL_AVISO_ENTROU_ON)}) — ambos no máx. 1 a cada ${LATERAL_AVISO_MIN} min, contadores separados · alertas de posição aberta seguem normais · env: LATERAL_MODO=visual (só aviso, sem barrar), LATERAL_AVISO=0, LATERAL_AVISO_ENTROU=0, LATERAL_AVISO_MIN, LATERAL_ADX_BLOQ/LIBERA, LATERAL_ER_BLOQ/LIBERA, LATERAL_AMP_BLOQ/LIBERA, LATERAL_JAN, LATERAL_VOTOS, LATERAL_VOTOS_LIBERA, LATERAL_HOLD_MIN, LATERAL_BLOQ=0 desliga\n\n`;
  m += `🎯 <b>Stop / alvo / trailing</b>\n• stop: faixa + ${STOP_ATR_MULT}×ATR · alvo RR ${ALVO_RR}:1\n• stop de reserva: ${STOP_ATR_RESERVA}×ATR\n• trailing (${on(PROT_LUCRO_ON)}): degrau de ${TRAIL_ATR_MULT}×ATR\n• RSI esticado: ≥ ${ESTICADO_RSI} (long) · ≤ ${100 - ESTICADO_RSI} (short)\n\n`;
  m += `🚨 <b>Risco</b> (${on(RISCO_ON)}): liquidação &lt; ${RISCO_LIQ_PCT}% (crítico ${RISCO_LIQ_CRITICO_PCT}%) · prejuízo ≥ ${RISCO_PERDA_PCT}% (crítico ${RISCO_PERDA_CRITICA_PCT}%) · reenvio ${RISCO_COOLDOWN_MIN} min\n`;
  m += `\n${MINI_DIVISOR}\n`;
  m += `🌙 <b>Silêncio</b> (${on(SILENCIO_ON)}): ${SILENCIO_INI_H}h–${SILENCIO_FIM_H}h, proteção ${on(SILENCIO_PROTECAO)} · fuso ${tz}\n`;
  m += `🗓️ <b>Resumos</b> (${on(RESUMO_ON)}): manhã ${RESUMO_MANHA_H}h · noite ${RESUMO_NOITE_H}h · V59: "FIM DO RESUMO" se apaga em ${PAINEL_FIM_APAGAR_H > 0 ? `${PAINEL_FIM_APAGAR_H}h` : "nunca (PAINEL_FIM_APAGAR_H=0)"}\n`;
  m += `⭐ seguidas: ${SEG_MAX} por pessoa\n`;
  m += `📡 Fallback de dados avisa a partir de ${FONTE_FALLBACK_PCT}% das consultas e normaliza abaixo de ${FONTE_NORMALIZA_PCT}%\n`;
  m += `⏱ Cron: aviso se parar > ${CRON_AVISO_MIN} min (/status alerta > ${CRON_ALERTA_MIN} min) · trava contra sobreposição ${(CRON_LOCK_TIMEOUT_MS / 1000).toFixed(0)}s\n`;
  m += `🎯 Antecipação: auto-calibração ${on(AUTO_CALIB_ON)} a cada ${AUTO_CALIB_INTERVALO_H}h (janela ${AUTO_CALIB_DIAS}d, mín. ${ANTEC_CALIB_MIN} amostras) · confiabilidade por moeda: mín. ${CONFIAB_MIN_AMOSTRA} em até ${CONFIAB_JANELA_N} últimas previsões\n`;
  m += `\n${MINI_DIVISOR}\n`;
  m += `🧠 <b>IA (/pergunta e /veredito)</b>\n• Gemini: ${Deno.env.get("GEMINI_API_KEY") ? "chave configurada ✅" : "SEM chave (GEMINI_API_KEY) ⚠️"}${IA_LIMITE_DIARIO_GEMINI > 0 ? ` · limite ${IA_LIMITE_DIARIO_GEMINI}/dia` : " · sem limite diário"}\n• Claude: ${Deno.env.get("ANTHROPIC_API_KEY") ? "chave configurada ✅" : "SEM chave (ANTHROPIC_API_KEY) ⚠️"}${IA_LIMITE_DIARIO_CLAUDE > 0 ? ` · limite ${IA_LIMITE_DIARIO_CLAUDE}/dia` : " · sem limite diário"}\n• aviso quando faltar ≤ ${IA_AVISO_RESTANTE} consultas · env: IA_LIMITE_DIARIO_GEMINI, IA_LIMITE_DIARIO_CLAUDE (0 = sem limite), IA_AVISO_RESTANTE, GEMINI_MODEL, CLAUDE_MODEL\n\n`;
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
      if (!cq && (text === "/start" || text === "/help" || /^\/comandos?(@\w+)?$/i.test(text))) {
        await fetch(`${TG_API}/sendMessage`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: `🔒 Acesso restrito.\nSeu chat_id: ${chatId}\nPasse esse número ao administrador para ser liberado.` }),
        }).catch(() => {});
      }
      return new Response("ok");
    }
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
      await comAguarde("🔍 Montando a lista de acompanhamento, aguarde...", () => runLista(chatId));
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
    if (text === "/radar" || text.startsWith("/radar ") || text.startsWith("/radar@")) {
      const dR = Math.min(9, Math.max(1, Math.round(Number(text.split(/\s+/)[1]) || 7)));
      await comAguarde("📡 Conferindo o que aconteceu depois dos alertas de radar, aguarde...", () => runRadarStats(chatId, dR));
      return new Response("ok");
    }
    if (text === "/trades" || text.startsWith("/trades ") || text.startsWith("/trades@")) {
      const dT = Math.min(30, Math.max(1, Math.round(Number(text.split(/\s+/)[1]) || 7)));
      await comAguarde("🧾 Lendo os trades do motor, aguarde...", () => runTrades(chatId, dT));
      return new Response("ok");
    }
    if (text === "/logs" || text.startsWith("/logs ") || text.startsWith("/logs@")) {
      await sendTelegram(chatId, logResumo());
      return new Response("ok");
    }
    if (text === "/div" || text.startsWith("/div ") || text.startsWith("/div@")) {
      const argDiv = (text.split(/\s+/)[1] || "").toLowerCase();
      await rodarEmBackground(argDiv === "diag" || argDiv === "diagnostico" ? runDivDiag(chatId) : runDiv(chatId));
      return new Response("ok");
    }
    if (text.startsWith("/saida")) {
      // V74: /saida [dias] [MOEDA] [trava/callback[/sl]] [tudo] — tudo é opcional: sem nada usa 7 dias, o filtro padrão e o trailing 5/3.5
      let dias = 7, diasSet = false, moeda: string | undefined, cfg: { trava: number; cb: number; sl: number } | undefined, tudo = false;
      const num = (x: string) => Number(x.replace(",", "."));
      for (const p of text.split(/\s+/).slice(1)) {
        if (/^tudo$/i.test(p)) { tudo = true; continue; }
        const mc = p.match(/^(\d+(?:[.,]\d+)?)\/(\d+(?:[.,]\d+)?)(?:\/(\d+(?:[.,]\d+)?))?$/);
        if (mc) { cfg = { trava: num(mc[1]), cb: num(mc[2]), sl: mc[3] ? num(mc[3]) : 0 }; continue; }
        if (!diasSet && /^\d+$/.test(p)) { dias = Number(p); diasSet = true; continue; }
        const mo = p.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/USDT$/, "");
        if (mo) moeda = mo;
      }
      dias = Math.min(9, Math.max(1, Math.round(dias || 7)));
      if (cfg && !(cfg.trava > 0 && cfg.cb > 0)) { await sendTelegram(chatId, "⚠️ Trava e callback precisam ser maiores que zero. Ex.: /saida 9 QNT 5/3.5"); return new Response("ok"); }
      const filtro = tudo || !SAIDA_FILTRO_PADRAO ? null : { mov: SAIDA_MOV_PADRAO, adx: SAIDA_ADX_PADRAO, subindo: SAIDA_ADX_SUBINDO };
      await comAguarde("🚪 Simulando a saída real, aguarde...", () => runSaida(chatId, dias, { moeda, cfg: cfg ?? SAIDA_CFG_PADRAO, filtro }));
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
      await sendTelegram(chatId, montarConfig());
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
});
