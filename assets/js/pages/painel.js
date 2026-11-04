// Painel inicial: indicadores do centro, entradas dos últimos 15 dias, taxa
// de resolução, avisos, agenda, pedidos de adesão, processos recentes,
// prazos, equipa e notificações. Tudo é calculado a partir dos dados da
// Supabase (CAUAL_DB.carregarPainel).
(async () => {
  const session = await Session.require();
  if (!session) return;

  const me = session.user;
  Shell.init("painel", me);
  Icons.render();

  const $ = (sel) => document.querySelector(sel);
  const esc = UI.escape;
  const vazio = (icon, titulo, texto) => `
    <div class="empty">
      <span class="empty__icon">${Icons.svg(icon)}</span>
      <p class="empty__title">${esc(titulo)}</p>
      ${texto ? `<p>${esc(texto)}</p>` : ""}
    </div>`;

  let D;
  try {
    D = await CAUAL_DB.carregarPainel();
  } catch (err) {
    console.error("Falha ao carregar o painel", err);
    UI.hideLoader();
    $(".app__content").innerHTML = `
      <article class="panel">
        ${vazio("alert", "Não foi possível carregar os dados do centro", "Verifique a ligação à internet e tente de novo.")}
        <p style="text-align:center; padding-bottom: 24px"><button class="btn btn--primary" type="button" data-reload>Tentar de novo</button></p>
      </article>`;
    $("[data-reload]").addEventListener("click", () => location.reload());
    return;
  }

  const P = D.processos;
  const now = new Date();
  const today = Fmt.startOfDay(now);

  const dayOffset = (n) => {
    const d = new Date(today);
    d.setDate(d.getDate() + n);
    return d;
  };
  const inRange = (d, from, to) => d >= from && d < to;
  const tomorrow = dayOffset(1);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const signed = (n) => (n > 0 ? `+${Fmt.int(n)}` : n < 0 ? `−${Fmt.int(Math.abs(n))}` : "0");
  const decimal = (n) => n.toLocaleString("pt-PT", { maximumFractionDigits: 1 });

  // ---------------------------------------------------------------------
  // Saudação
  // ---------------------------------------------------------------------

  const hour = now.getHours();
  const saudacao = hour < 13 ? "Bom dia" : hour < 20 ? "Boa tarde" : "Boa noite";
  $("[data-greeting]").textContent = `${saudacao}, ${me.nome.split(" ")[0]}. ${cap(Fmt.longDate(now))}`;

  // ---------------------------------------------------------------------
  // Contas
  // ---------------------------------------------------------------------

  const activeAt = (t) => P.filter((p) => p.entrada <= t && (!p.conclusao || p.conclusao > t)).length;
  const ativos = P.filter((p) => !p.conclusao);
  const resolvidos = (list) => list.filter((p) => p.resultado === "acordo" || p.resultado === "sentenca").length;
  const concluidos = (from, to) => P.filter((p) => p.conclusao && inRange(p.conclusao, from, to));
  const rate = (list) => (list.length ? resolvidos(list) / list.length : 0);

  const c12 = concluidos(dayOffset(-365), tomorrow);
  const cPrev = concluidos(dayOffset(-730), dayOffset(-365));
  const taxa = rate(c12);
  const taxaPrev = rate(cPrev);

  const entradas15 = P.filter((p) => p.entrada >= dayOffset(-14));
  const entradasPrev15 = P.filter((p) => inRange(p.entrada, dayOffset(-29), dayOffset(-14)));

  const adesoes30 = D.adesoes.filter((a) => a.data >= dayOffset(-29));
  const adesoesPrev = D.adesoes.filter((a) => inRange(a.data, dayOffset(-59), dayOffset(-29)));
  const porAnalisar = D.adesoes.filter((a) => a.estado === "novo").length;

  const anoAtual = today.getFullYear();
  const entradasAno = P.filter((p) => p.entrada.getFullYear() === anoAtual).length;

  // Séries de 12 pontos para as linhas de tendência (semanas ou meses).
  const series = (fn) => Array.from({ length: 12 }, (_, i) => fn(11 - i));
  const sparkAtivos = series((w) => activeAt(dayOffset(-7 * w)));
  const sparkEntradas = series((w) => P.filter((p) => inRange(p.entrada, dayOffset(-7 * w - 6), dayOffset(-7 * w + 1))).length);
  const sparkTaxa = series((m) => rate(concluidos(dayOffset(-30 * (m + 1)), dayOffset(-30 * m + 1))));
  const sparkAdesoes = series((m) => D.adesoes.filter((a) => inRange(a.data, dayOffset(-30 * (m + 1)), dayOffset(-30 * m + 1))).length);

  // ---------------------------------------------------------------------
  // Indicadores
  // ---------------------------------------------------------------------

  function sparkline(values) {
    const w = 96;
    const h = 34;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const pts = values.map((v, i) => [3 + (i * (w - 6)) / (values.length - 1), 4 + (1 - (v - min) / span) * (h - 8)]);
    const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
    const [lx, ly] = pts[pts.length - 1];
    return `<svg class="kpi__spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${d}"/><circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="4"/></svg>`;
  }

  function delta(value, text, tone = "neutral", unit = "") {
    const icon = value > 0 ? "trendUp" : value < 0 ? "trendDown" : "arrowRight";
    return `<p class="kpi__delta" data-tone="${tone}"><strong>${Icons.svg(icon)}${signed(value)}${unit}</strong><span>${esc(text)}</span></p>`;
  }

  const pp = Math.round((taxa - taxaPrev) * 100);
  const ppTone = pp > 0 ? "good" : pp < 0 ? "bad" : "neutral";

  const kpis = [
    {
      icon: "folder",
      label: "Processos em curso",
      value: Fmt.int(ativos.length),
      delta: delta(ativos.length - activeAt(dayOffset(-30)), "face a há 30 dias"),
      note: `${Fmt.int(entradasAno)} processos entrados em ${anoAtual}`,
      spark: sparkAtivos,
    },
    {
      icon: "checkCircle",
      label: "Taxa de resolução",
      value: c12.length ? `${Math.round(taxa * 100)}<span class="kpi__unit">%</span>` : "—",
      delta: c12.length && cPrev.length
        ? delta(pp, "face ao ano anterior", ppTone, " p.p.")
        : '<p class="kpi__delta"><span>Sem processos concluídos para comparar</span></p>',
      note: `${Fmt.int(resolvidos(c12))} de ${Fmt.int(c12.length)} com acordo ou sentença`,
      spark: sparkTaxa,
    },
    {
      icon: "inbox",
      label: "Entradas nos últimos 15 dias",
      value: Fmt.int(entradas15.length),
      delta: delta(entradas15.length - entradasPrev15.length, "face aos 15 dias anteriores"),
      note: `Arbitragem ${entradas15.filter((p) => p.tipo === "arbitragem").length} · Mediação ${entradas15.filter((p) => p.tipo === "mediacao").length}`,
      spark: sparkEntradas,
    },
    {
      icon: "building",
      label: "Novos pedidos de adesão",
      value: Fmt.int(adesoes30.length),
      delta: delta(adesoes30.length - adesoesPrev.length, "face aos 30 dias anteriores", adesoes30.length > adesoesPrev.length ? "good" : "neutral"),
      note: `${Fmt.plural(porAnalisar, "pedido por analisar", "pedidos por analisar")}, últimos 30 dias`,
      spark: sparkAdesoes,
    },
  ];

  $("[data-kpis]").innerHTML = kpis.map((k) => `
    <article class="kpi">
      <div class="kpi__top">
        <span class="kpi__icon">${Icons.svg(k.icon)}</span>
        <h3 class="kpi__label">${esc(k.label)}</h3>
      </div>
      <div class="kpi__row">
        <p class="kpi__value">${k.value}</p>
        ${sparkline(k.spark)}
      </div>
      ${k.delta}
      <p class="kpi__delta"><span>${esc(k.note)}</span></p>
    </article>`).join("");

  // ---------------------------------------------------------------------
  // Entrada de processos: colunas por dia
  // ---------------------------------------------------------------------

  const dias = Array.from({ length: 15 }, (_, i) => {
    const d = dayOffset(i - 14);
    const list = P.filter((p) => inRange(p.entrada, d, dayOffset(i - 13)));
    return {
      d,
      total: list.length,
      arb: list.filter((p) => p.tipo === "arbitragem").length,
      med: list.filter((p) => p.tipo === "mediacao").length,
    };
  });

  const chartEl = $("[data-chart-entradas]");

  function colPath(x, y, w, y0) {
    const h = y0 - y;
    const r = Math.min(4, h, w / 2);
    return `M${x} ${y0}V${y + r}Q${x} ${y} ${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y0}Z`;
  }

  function dayLabel(d, i) {
    if (i === 14) return "Hoje";
    const first = i === 0 || d.getDate() === 1;
    return first ? Fmt.dayMonth(d) : String(d.getDate());
  }

  function renderChart() {
    const W = Math.max(320, Math.round(chartEl.clientWidth || 640));
    const H = 232;
    const m = { t: 22, r: 4, b: 30, l: 28 };
    const iw = W - m.l - m.r;
    const ih = H - m.t - m.b;
    const max = Math.max(1, ...dias.map((x) => x.total));
    const step = max <= 4 ? 1 : max <= 8 ? 2 : 5;
    const top = Math.ceil(max / step) * step;
    const y = (v) => m.t + ih * (1 - v / top);
    const y0 = y(0);
    const band = iw / dias.length;
    const colW = Math.min(24, band * 0.58);
    const everyOther = band < 34;
    const maxIndex = dias.findIndex((x) => x.total === max);

    let grid = "";
    for (let v = 0; v <= top; v += step) {
      grid += `<line class="${v === 0 ? "chart__baseline" : "chart__grid"}" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/>`;
      grid += `<text class="chart__tick" x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
    }

    const cols = dias.map((x, i) => {
      const bx = m.l + band * i + (band - colW) / 2;
      const by = y(x.total);
      const label = `${cap(Fmt.weekdayShort(x.d))} ${Fmt.dayMonth(x.d)}: ${Fmt.plural(x.total, "processo", "processos")} (arbitragem ${x.arb}, mediação ${x.med})`;
      const showLabel = !everyOther || i % 2 === 0;
      return `
        <g class="chart__col" data-i="${i}">
          <rect class="chart__band" x="${m.l + band * i + 1}" y="${m.t}" width="${band - 2}" height="${ih}" rx="8"/>
          ${x.total ? `<path class="chart__bar" d="${colPath(bx, by, colW, y0)}"/>` : ""}
          ${i === maxIndex ? `<text class="chart__value" x="${bx + colW / 2}" y="${by - 7}" text-anchor="middle">${x.total}</text>` : ""}
          ${showLabel ? `<text class="chart__xlabel${i === 14 ? " is-today" : ""}" x="${bx + colW / 2}" y="${H - 10}" text-anchor="middle">${dayLabel(x.d, i)}</text>` : ""}
          <rect class="chart__hit" x="${m.l + band * i}" y="${m.t}" width="${band}" height="${ih}" tabindex="0" role="img" aria-label="${esc(label)}"/>
          <rect class="chart__focus" x="${m.l + band * i + 1}" y="${m.t}" width="${band - 2}" height="${ih}" rx="8"/>
        </g>`;
    }).join("");

    chartEl.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="group" aria-label="Processos entrados por dia nos últimos 15 dias">${grid}${cols}</svg>
      <div class="chart__tooltip" hidden></div>`;

    const tip = chartEl.querySelector(".chart__tooltip");
    const show = (g) => {
      const i = Number(g.dataset.i);
      const x = dias[i];
      chartEl.querySelectorAll(".chart__col.is-hover").forEach((el) => el.classList.remove("is-hover"));
      g.classList.add("is-hover");
      const cx = m.l + band * i + band / 2;
      tip.innerHTML = `
        <p class="chart__tooltip-date">${esc(cap(Fmt.weekdayShort(x.d)))} ${esc(Fmt.dayMonth(x.d))}${i === 14 ? " · hoje" : ""}</p>
        <p class="chart__tooltip-total">${esc(Fmt.plural(x.total, "processo", "processos"))}</p>
        <p class="chart__tooltip-row">Arbitragem <strong>${x.arb}</strong></p>
        <p class="chart__tooltip-row">Mediação <strong>${x.med}</strong></p>`;
      tip.hidden = false;
      const half = tip.offsetWidth / 2;
      tip.style.left = `${Math.min(Math.max(cx, half), W - half)}px`;
      tip.style.top = `${Math.max(y(x.total), m.t + 40)}px`;
    };
    const hide = () => {
      tip.hidden = true;
      chartEl.querySelectorAll(".chart__col.is-hover").forEach((el) => el.classList.remove("is-hover"));
    };

    chartEl.querySelectorAll(".chart__col").forEach((g) => {
      g.addEventListener("pointerenter", () => show(g));
      g.addEventListener("pointerleave", hide);
      g.querySelector(".chart__hit").addEventListener("focus", () => show(g));
      g.querySelector(".chart__hit").addEventListener("blur", hide);
    });
  }

  renderChart();
  let resizeTimer = 0;
  let lastWidth = chartEl.clientWidth;
  new ResizeObserver(() => {
    if (chartEl.hidden || chartEl.clientWidth === lastWidth) return;
    lastWidth = chartEl.clientWidth;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(renderChart, 120);
  }).observe(chartEl);

  const uteis = dias.filter((x) => x.d.getDay() !== 0 && x.d.getDay() !== 6).length || 1;
  const totalArb = dias.reduce((n, x) => n + x.arb, 0);
  const totalMed = dias.reduce((n, x) => n + x.med, 0);
  $("[data-chart-summary]").innerHTML = `
    <span>Total <strong>${entradas15.length}</strong></span>
    <span>Arbitragem <strong>${totalArb}</strong></span>
    <span>Mediação <strong>${totalMed}</strong></span>
    <span>Média por dia útil <strong>${decimal(entradas15.length / uteis)}</strong></span>`;

  // Vista em tabela (a mesma informação sem depender do gráfico).
  const tableEl = $("[data-chart-table]");
  tableEl.innerHTML = `
    <table class="data-table">
      <thead><tr><th scope="col">Dia</th><th scope="col" class="num">Arbitragem</th><th scope="col" class="num">Mediação</th><th scope="col" class="num">Total</th></tr></thead>
      <tbody>${[...dias].reverse().map((x) => `<tr><td>${esc(cap(Fmt.weekdayShort(x.d)))} ${esc(Fmt.dayMonth(x.d))}</td><td class="num">${x.arb}</td><td class="num">${x.med}</td><td class="num"><strong>${x.total}</strong></td></tr>`).join("")}</tbody>
    </table>`;

  const toggleTable = $("[data-toggle-table]");
  toggleTable.addEventListener("click", () => {
    const showTable = tableEl.hidden;
    tableEl.hidden = !showTable;
    chartEl.hidden = showTable;
    toggleTable.setAttribute("aria-pressed", String(showTable));
    toggleTable.innerHTML = `${Icons.svg(showTable ? "chart" : "table", "icon icon-sm")}<span>${showTable ? "Ver gráfico" : "Ver tabela"}</span>`;
    if (!showTable) renderChart();
  });

  // ---------------------------------------------------------------------
  // Taxa de resolução
  // ---------------------------------------------------------------------

  const RESULTADO = {
    acordo: { label: "Acordo", conta: true },
    sentenca: { label: "Sentença arbitral", conta: true },
    sem_acordo: { label: "Sem acordo", conta: false },
    desistencia: { label: "Desistência", conta: false },
    arquivado: { label: "Arquivamento", conta: false },
  };

  const porResultado = Object.keys(RESULTADO)
    .map((k) => ({ k, n: c12.filter((p) => p.resultado === k).length }))
    .sort((a, b) => b.n - a.n);
  const maxN = Math.max(1, ...porResultado.map((r) => r.n));
  const taxaTipo = (tipo) => rate(c12.filter((p) => p.tipo === tipo));

  $("[data-resolucao]").innerHTML = !c12.length
    ? vazio("checkCircle", "Ainda sem processos concluídos", "A taxa aparece quando houver processos terminados nos últimos 12 meses.")
    : `
    <div class="resolution__hero">
      <span class="resolution__value">${Math.round(taxa * 100)}%</span>
      <p class="resolution__caption">dos ${Fmt.int(c12.length)} processos concluídos terminaram com acordo ou sentença</p>
    </div>
    <div class="meter" role="meter" aria-label="Taxa de resolução" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(taxa * 100)}">
      <div class="meter__fill" style="width: ${(taxa * 100).toFixed(1)}%"></div>
    </div>
    ${delta(pp, "face aos 12 meses anteriores", ppTone, " p.p.")}
    <p class="resolution__split" style="margin-top: 8px">
      <span>Mediação <strong>${Fmt.pct(taxaTipo("mediacao"))}</strong></span>
      <span>Arbitragem <strong>${Fmt.pct(taxaTipo("arbitragem"))}</strong></span>
    </p>
    <div class="rank" role="list" aria-label="Como terminaram os processos">
      ${porResultado.map((r) => {
        const info = RESULTADO[r.k];
        const share = Fmt.pct(r.n / (c12.length || 1));
        return `
          <div class="rank__row" role="listitem" title="${esc(info.label)}: ${r.n} (${share})" aria-label="${esc(info.label)}: ${r.n} processos, ${share}">
            <span class="rank__label">${esc(info.label)}</span>
            <span class="rank__track"><span class="rank__bar${info.conta ? "" : " is-muted"}" style="display:block; width: ${((r.n / maxN) * 100).toFixed(1)}%"></span></span>
            <span class="rank__value">${r.n}</span>
          </div>`;
      }).join("")}
    </div>
    <div class="legend">
      <span class="legend__item"><span class="legend__swatch"></span>Conta como resolução</span>
      <span class="legend__item"><span class="legend__swatch is-muted"></span>Não conta</span>
    </div>`;

  // ---------------------------------------------------------------------
  // Avisos
  // ---------------------------------------------------------------------

  const PRIORIDADE = {
    urgente: { label: "Urgente", cls: "badge--danger" },
    importante: { label: "Importante", cls: "badge--warning" },
    normal: { label: "Informação", cls: "badge--info" },
  };
  const SEM_AUTOR = { nome: "Equipa CAUAL", cargo: "Centro", cor: "linear-gradient(155deg, #e2eef7, #c2dbee)" };

  function renderAvisos(highlightId) {
    const avisos = [...D.avisos].sort((a, b) =>
      (b.prioridade === "urgente") - (a.prioridade === "urgente") || b.data - a.data);
    $("[data-avisos-count]").textContent = avisos.length;
    if (!avisos.length) {
      $("[data-avisos]").innerHTML = `<li>${vazio("megaphone", "Ainda não há avisos", "Use «Novo aviso» para partilhar uma informação com a equipa.")}</li>`;
      return;
    }
    $("[data-avisos]").innerHTML = avisos.map((a) => {
      const autor = D.pessoa(a.autor) || (a.autor === me.id ? me : SEM_AUTOR);
      const prio = PRIORIDADE[a.prioridade] || PRIORIDADE.normal;
      return `
        <li class="list__item notice${a.id === highlightId ? " is-new" : ""}">
          <span class="avatar avatar--sm" style="--avatar-bg: ${autor.cor}" aria-hidden="true">${esc(UI.initials(autor.nome))}</span>
          <div class="list__body">
            <div class="notice__head">
              <span class="badge ${prio.cls}">${prio.label}</span>
              <span class="list__meta" style="margin-top:0">${esc(Fmt.relative(a.data))}</span>
            </div>
            <p class="list__title">${esc(a.titulo)}</p>
            <p class="list__text notice__text">${esc(a.texto)}</p>
            <p class="list__meta">${esc(autor.nome)} · ${esc(autor.cargo)}</p>
          </div>
        </li>`;
    }).join("");
  }

  renderAvisos();

  const avisoForm = $("[data-aviso-form]");
  const avisoError = avisoForm.querySelector("[data-aviso-error]");

  $('[data-modal-open="modal-aviso"]').addEventListener("click", () => {
    avisoForm.reset();
    avisoError.hidden = true;
  });

  avisoForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const titulo = avisoForm.elements.titulo.value.trim();
    const texto = avisoForm.elements.texto.value.trim();
    if (!titulo || !texto) {
      avisoError.textContent = !titulo ? "Escreva um título para o aviso." : "Escreva a mensagem do aviso.";
      avisoError.hidden = false;
      (!titulo ? avisoForm.elements.titulo : avisoForm.elements.texto).focus();
      return;
    }
    const submit = avisoForm.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      const aviso = await CAUAL_DB.publicarAviso({ titulo, texto, prioridade: avisoForm.elements.prioridade.value });
      D.avisos.unshift(aviso);
      UI.closeModal("modal-aviso");
      renderAvisos(aviso.id);
      UI.toast("Aviso publicado no painel da equipa.", "megaphone");
    } catch (err) {
      console.error("Falha ao publicar o aviso", err);
      avisoError.textContent = "Não foi possível publicar o aviso. Verifique a ligação e tente de novo.";
      avisoError.hidden = false;
    } finally {
      submit.disabled = false;
    }
  });

  // ---------------------------------------------------------------------
  // Agenda
  // ---------------------------------------------------------------------

  const proxima = D.sessoes.find((s) => s.inicio > now);
  const porDia = new Map();
  D.sessoes.forEach((s) => {
    const key = Fmt.startOfDay(s.inicio).getTime();
    if (!porDia.has(key)) porDia.set(key, []);
    porDia.get(key).push(s);
  });

  const agendaDia = (d) => {
    const n = Fmt.daysBetween(today, d);
    const rest = `${Fmt.weekdayShort(d)} ${Fmt.dayMonth(d)}`;
    if (n === 0) return `Hoje · ${rest}`;
    if (n === 1) return `Amanhã · ${rest}`;
    return rest;
  };

  $("[data-agenda]").innerHTML = !porDia.size
    ? vazio("calendar", "Sem sessões marcadas", "As audiências e sessões dos próximos dias aparecem aqui.")
    : [...porDia.entries()].map(([key, list]) => `
    <p class="agenda__day">${esc(agendaDia(new Date(key)))}</p>
    <ul class="list">
      ${list.map((s) => {
        const past = s.inicio < now;
        const next = s === proxima;
        const online = s.local === "Videoconferência";
        return `
          <li class="list__item agenda__item${past ? " is-past" : ""}${next ? " is-next" : ""}">
            <span class="agenda__time">${Fmt.time(s.inicio)}</span>
            <div class="list__body">
              <div class="agenda__title-row">
                <span class="list__title">${esc(s.tipo)}</span>
                ${next ? '<span class="badge badge--info">A seguir</span>' : ""}
                ${past ? '<span class="badge badge--neutral badge--plain">Realizada</span>' : ""}
              </div>
              <p class="list__text ellipsis">${esc(s.processo)} · ${esc(s.partes)}</p>
              <p class="list__meta">
                <span class="list__meta-item">${Icons.svg(online ? "video" : "pin")}${esc(s.local)}</span>
                <span class="list__meta-item">${Icons.svg("user")}${esc(s.responsavel)}</span>
              </p>
            </div>
          </li>`;
      }).join("")}
    </ul>`).join("");

  // ---------------------------------------------------------------------
  // Pedidos de adesão
  // ---------------------------------------------------------------------

  const ESTADO_ADESAO = {
    novo: ["Por analisar", "badge--info"],
    em_analise: ["Em análise", "badge--neutral"],
    documentacao: ["Falta documentação", "badge--warning"],
    aprovado: ["Aprovado", "badge--success"],
    recusado: ["Recusado", "badge--danger"],
  };

  $("[data-adesoes-count]").textContent = porAnalisar;
  $("[data-adesoes-count]").setAttribute("aria-label", `${porAnalisar} por analisar`);
  Shell.setBadge("adesoes", porAnalisar);
  $("[data-adesoes]").innerHTML = !D.adesoes.length
    ? `<li>${vazio("building", "Ainda sem pedidos de adesão", "Os pedidos das empresas que querem aderir ao centro aparecem aqui.")}</li>`
    : [...D.adesoes]
    .sort((a, b) => b.data - a.data)
    .slice(0, 6)
    .map((a) => {
      const [label, cls] = ESTADO_ADESAO[a.estado];
      return `
        <li class="list__item">
          <span class="entity-icon">${Icons.svg("building", "icon icon-sm")}</span>
          <div class="list__body">
            <p class="list__title ellipsis">${esc(a.empresa)}</p>
            <p class="list__text ellipsis">${esc(a.setor)} · ${esc(Fmt.relative(a.data))}</p>
            <p class="list__meta"><span class="badge ${cls}">${label}</span></p>
          </div>
        </li>`;
    }).join("");
  $("[data-adesoes-footer]").textContent = `${Fmt.plural(adesoes30.length, "pedido", "pedidos")} nos últimos 30 dias`;

  // ---------------------------------------------------------------------
  // Processos recentes (com a pesquisa do topo)
  // ---------------------------------------------------------------------

  const FASE = {
    "Citação": "badge--neutral",
    "Contestação": "badge--neutral",
    "Instrução": "badge--neutral",
    "Pré-mediação": "badge--neutral",
    "Em mediação": "badge--info",
    "Audiência": "badge--info",
    "Aguarda sentença": "badge--success",
    "Redação do acordo": "badge--success",
  };

  const fold = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const regexSafe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  function highlight(text, q) {
    const safe = esc(text);
    if (!q) return safe;
    return safe.replace(new RegExp(`(${regexSafe(esc(q))})`, "gi"), "<mark>$1</mark>");
  }

  function renderProcessos(q = "") {
    const query = q.trim();
    const f = fold(query);
    const list = query
      ? P.filter((p) => fold(`${p.id} ${p.requerente} ${p.requerida} ${p.materia} ${p.fase} ${p.responsavel}`).includes(f))
      : P;
    const rows = list.slice(0, 10);

    $("[data-processos-meta]").textContent = query
      ? `${Fmt.plural(list.length, "resultado", "resultados")} para «${query}»${list.length > rows.length ? `, a mostrar ${rows.length}` : ""}`
      : rows.length ? `Últimas ${rows.length} entradas` : "Sem entradas";

    $("[data-processos]").innerHTML = rows.length
      ? rows.map((p) => `
        <tr>
          <td>
            <span class="process-id">
              <span class="process-type" title="${p.tipo === "arbitragem" ? "Arbitragem" : "Mediação"}">${Icons.svg(p.tipo === "arbitragem" ? "scale" : "handshake")}</span>
              <span>
                <span class="process-id__code">${highlight(p.id, query)}<span class="sr-only">, ${p.tipo === "arbitragem" ? "arbitragem" : "mediação"}</span></span>
                <span class="process-id__subject">${highlight(p.materia, query)}</span>
              </span>
            </span>
          </td>
          <td class="parties">
            <span class="parties__main ellipsis">${highlight(p.requerente, query)}</span>
            <span class="parties__other ellipsis">vs. ${highlight(p.requerida, query)}</span>
          </td>
          <td><span class="badge ${p.conclusao ? "badge--neutral badge--plain" : FASE[p.fase] || "badge--neutral"}">${esc(p.fase)}</span></td>
          <td class="num col-valor">${Fmt.euro(p.valor)}</td>
          <td>${esc(Fmt.relative(p.entrada))}</td>
        </tr>`).join("")
      : query
        ? `<tr><td colspan="5">${vazio("search", "Nenhum processo encontrado", "Experimente o número do processo, o nome de uma parte ou a matéria.")}</td></tr>`
        : `<tr><td colspan="5">${vazio("folder", "Ainda não há processos registados", "Os processos que entrarem no centro aparecem aqui.")}</td></tr>`;
  }

  renderProcessos();
  $("[data-processos-footer]").textContent = `${Fmt.int(ativos.length)} processos em curso`;

  const search = $("[data-search]");
  let wasEmpty = true;
  search.addEventListener("input", () => {
    renderProcessos(search.value);
    const empty = !search.value.trim();
    if (wasEmpty && !empty) $("[data-processos]").closest(".panel").scrollIntoView({ behavior: "smooth", block: "start" });
    wasEmpty = empty;
  });

  // ---------------------------------------------------------------------
  // Prazos a vencer
  // ---------------------------------------------------------------------

  $("[data-prazos]").innerHTML = !D.prazos.length
    ? `<li>${vazio("hourglass", "Sem prazos a vencer", "")}</li>`
    : D.prazos.slice(0, 5).map((z) => {
    const n = Fmt.daysBetween(today, z.limite);
    const tone = n <= 1 ? "danger" : n <= 3 ? "warning" : "neutral";
    return `
      <li class="list__item list__item--center">
        <span class="deadline__days" data-tone="${tone}" aria-label="${n === 0 ? "Termina hoje" : `Faltam ${n} ${n === 1 ? "dia" : "dias"}`}">
          <strong>${n}</strong><span>${n === 1 ? "dia" : "dias"}</span>
        </span>
        <div class="list__body">
          <p class="list__title">${esc(z.descricao)}</p>
          <p class="list__text ellipsis">${esc(z.processo)} · ${esc(z.responsavel)}</p>
          <p class="list__meta">Termina ${esc(Fmt.weekdayShort(z.limite))} ${esc(Fmt.dayMonth(z.limite))}</p>
        </div>
      </li>`;
  }).join("");

  // ---------------------------------------------------------------------
  // Equipa (abre o chat com a pessoa)
  // ---------------------------------------------------------------------

  // A presença (online/offline) vem do canal de presença do chat.
  const PRESENCA = { online: "Online", offline: "Offline" };
  function renderEquipa(online = new Set()) {
    const equipa = D.colaboradores
      .filter((c) => c.id !== me.id)
      .map((c) => ({ ...c, presenca: online.has(c.id) ? "online" : "offline" }))
      .sort((a, b) => (b.presenca === "online") - (a.presenca === "online") || a.nome.localeCompare(b.nome, "pt"));
    $("[data-equipa-meta]").textContent = equipa.length ? `${equipa.filter((c) => c.presenca === "online").length} online` : "";
    $("[data-equipa]").innerHTML = !equipa.length
      ? vazio("users", "Ainda não há outros colaboradores", "Quando a direção der acesso a mais pessoas, aparecem aqui.")
      : equipa.map((c) => `
        <button class="team-row" type="button" data-chat-with="${c.id}" aria-label="Conversar com ${esc(c.nome)}, ${PRESENCA[c.presenca]}">
          <span class="avatar avatar--sm" style="--avatar-bg: ${c.cor}" data-presence="${c.presenca}" aria-hidden="true">${esc(UI.initials(c.nome))}</span>
          <span class="list__body">
            <span class="team-row__name">${esc(c.nome)}</span><br />
            <span class="team-row__role">${esc(c.cargo)} · ${PRESENCA[c.presenca]}</span>
          </span>
          <span class="team-row__action">${Icons.svg("chat", "icon icon-sm")}</span>
        </button>`).join("");
  }

  renderEquipa();
  TeamChat.init(me, D.colaboradores);
  TeamChat.onPresence(renderEquipa);
  $("[data-equipa]").addEventListener("click", (e) => {
    const row = e.target.closest("[data-chat-with]");
    if (row) TeamChat.open(row.dataset.chatWith);
  });

  // ---------------------------------------------------------------------
  // Notificações
  // ---------------------------------------------------------------------

  const notifBtn = $("[data-notif-toggle]");
  const notifPop = $("[data-notif-popover]");
  const notifDot = $("[data-notif-dot]");

  function renderNotif() {
    const items = D.notificacoes;
    const unread = items.filter((n) => !n.lida).length;
    notifDot.hidden = unread === 0;
    notifBtn.setAttribute("aria-label", unread ? `Notificações, ${unread} por ler` : "Notificações");
    notifPop.innerHTML = `
      <div class="notif__head">
        <p class="notif__title">Notificações</p>
        ${unread ? '<button class="btn btn--ghost btn--sm" type="button" data-notif-read>Marcar como lidas</button>' : ""}
      </div>
      <ul>
        ${!items.length ? `<li>${vazio("bell", "Sem notificações", "")}</li>` : ""}
        ${items.map((n) => `
          <li class="notif__item${n.lida ? "" : " is-unread"}">
            <span class="notif__icon">${Icons.svg(n.icon)}</span>
            <div>
              <p class="notif__text">${esc(n.texto)}</p>
              <p class="notif__time">${esc(Fmt.relative(n.data))}</p>
            </div>
          </li>`).join("")}
      </ul>`;
  }

  renderNotif();

  const setNotif = (open) => {
    notifPop.hidden = !open;
    notifBtn.setAttribute("aria-expanded", String(open));
  };

  notifBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    setNotif(notifPop.hidden);
  });

  notifPop.addEventListener("click", (e) => {
    e.stopPropagation();
    const read = e.target.closest("[data-notif-read]");
    if (read) {
      read.disabled = true;
      CAUAL_DB.marcarNotificacoesLidas()
        .then(() => {
          D.notificacoes.forEach((n) => { n.lida = true; });
          renderNotif();
        })
        .catch((err) => {
          console.error("Falha ao marcar as notificações", err);
          read.disabled = false;
          UI.toast("Não foi possível marcar as notificações como lidas.", "alert");
        });
    }
  });

  document.addEventListener("click", () => setNotif(false));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !notifPop.hidden) {
      setNotif(false);
      notifBtn.focus();
    }
  });

  // ---------------------------------------------------------------------
  // Áreas ainda por construir
  // ---------------------------------------------------------------------

  document.querySelectorAll("button[data-soon]").forEach((btn) => {
    btn.addEventListener("click", () => UI.toast(`${btn.dataset.soon}: esta área chega numa próxima fase.`, "clock"));
  });

  UI.hideLoader();
})();
