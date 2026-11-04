// Dados de demonstração do centro.
//
// Tudo é sintético: pessoas e empresas inventadas, gerados a partir de uma
// semente fixa e com datas relativas a hoje, para o painel parecer vivo em
// qualquer dia. As páginas só leem CAUAL_DATA; quando houver base de dados
// (por exemplo Supabase, como na Hotel Solutions) é este ficheiro que se
// substitui por consultas, sem mexer nas páginas.
const CAUAL_DATA = (() => {
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const at = (offsetDays, h = 10, m = 0) => {
    const d = new Date(today);
    d.setDate(d.getDate() + offsetDays);
    d.setHours(h, m, 0, 0);
    return d;
  };
  const daysAgo = (n, h, m) => at(-n, h, m);

  // Gerador pseudoaleatório com semente (mulberry32): os mesmos dados sempre.
  let seed = 20261104;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const between = (a, b) => a + Math.floor(rand() * (b - a + 1));
  const poisson = (lambda) => {
    const limit = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do { k++; p *= rand(); } while (p > limit);
    return k - 1;
  };
  const weighted = (pairs) => {
    let r = rand();
    for (const [value, weight] of pairs) {
      if ((r -= weight) <= 0) return value;
    }
    return pairs[pairs.length - 1][0];
  };

  const centro = {
    sigla: "CAUAL",
    designacao: "Centro de Arbitragem e Mediação de Conflitos",
    sede: "Lisboa",
  };

  const AVATARES = [
    "linear-gradient(155deg, #1a86c8, #00609e)",
    "linear-gradient(155deg, #3d9fd6, #0b6aa6)",
    "linear-gradient(155deg, #2f6f9f, #163d60)",
    "linear-gradient(155deg, #4f86bd, #24578a)",
    "linear-gradient(155deg, #1495b0, #0a6582)",
  ];

  const colaboradores = [
    { id: "u1", nome: "Ana Ribeiro", cargo: "Diretora do centro", email: "ana.ribeiro@caual.demo", presenca: "online" },
    { id: "u2", nome: "Miguel Costa", cargo: "Secretário-geral", email: "miguel.costa@caual.demo", presenca: "online" },
    { id: "u3", nome: "Joana Matos", cargo: "Jurista", email: "joana.matos@caual.demo", presenca: "online" },
    { id: "u4", nome: "Rui Fernandes", cargo: "Mediador", email: "rui.fernandes@caual.demo", presenca: "ausente" },
    { id: "u5", nome: "Sofia Almeida", cargo: "Árbitra", email: "sofia.almeida@caual.demo", presenca: "online" },
    { id: "u6", nome: "Pedro Nogueira", cargo: "Técnico administrativo", email: "pedro.nogueira@caual.demo", presenca: "offline" },
    { id: "u7", nome: "Carla Sousa", cargo: "Mediadora", email: "carla.sousa@caual.demo", presenca: "online" },
    { id: "u8", nome: "Tiago Lopes", cargo: "Jurista", email: "tiago.lopes@caual.demo", presenca: "offline" },
  ].map((c, i) => ({ ...c, cor: AVATARES[i % AVATARES.length] }));

  // ---------------------------------------------------------------------
  // Processos
  // ---------------------------------------------------------------------

  const NOMES = ["Maria", "João", "Ana", "Pedro", "Rita", "Carlos", "Inês", "Bruno", "Teresa", "Hugo", "Filipa", "Nuno", "Sara", "Diogo", "Helena", "Paulo", "Cláudia", "Ricardo", "Marta", "André"];
  const APELIDOS = ["Silva", "Santos", "Ferreira", "Pereira", "Oliveira", "Carvalho", "Rodrigues", "Martins", "Gomes", "Lopes", "Marques", "Alves", "Antunes", "Correia", "Pinto", "Teixeira", "Moreira", "Cardoso"];
  const EMPRESAS = [
    "Norvia Telecomunicações, S.A.", "Mirante Energia, S.A.", "Lusoterm Climatização, Lda.", "Casa Albatroz, Lda.",
    "Solmar Viagens, Lda.", "Rede Celta Comunicações, S.A.", "Aldeia Verde Imobiliária, Lda.", "Oficina Ponte Nova, Lda.",
    "Atrium Seguros, S.A.", "Horizonte Mobiliário, Lda.", "Fonte Viva Águas, S.A.", "Brasão Automóveis, Lda.",
    "Ponto Certo Eletrodomésticos, Lda.", "Colina Construções, Lda.", "Vela Branca Turismo, Lda.",
  ];
  const MATERIAS = [["Consumo", 0.34], ["Telecomunicações", 0.14], ["Energia", 0.12], ["Seguros", 0.1], ["Arrendamento", 0.1], ["Comercial", 0.12], ["Contratos", 0.08]];
  const ARBITROS = ["Sofia Almeida", "Luís Pinheiro", "Marta Leal", "Henrique Vaz"];
  const MEDIADORES = ["Rui Fernandes", "Carla Sousa", "Inês Duarte"];

  const RESULTADOS = {
    mediacao: [["acordo", 0.68], ["sem_acordo", 0.24], ["desistencia", 0.06], ["arquivado", 0.02]],
    arbitragem: [["sentenca", 0.62], ["acordo", 0.24], ["desistencia", 0.08], ["arquivado", 0.06]],
  };

  const faseDe = (tipo, progresso) => {
    if (tipo === "mediacao") {
      if (progresso < 0.25) return "Pré-mediação";
      if (progresso < 0.85) return "Em mediação";
      return "Redação do acordo";
    }
    if (progresso < 0.15) return "Citação";
    if (progresso < 0.35) return "Contestação";
    if (progresso < 0.65) return "Instrução";
    if (progresso < 0.85) return "Audiência";
    return "Aguarda sentença";
  };

  const valorEntre = (min, max) => Math.round((min * Math.pow(max / min, rand())) / 50) * 50;

  const processos = [];
  const sequencia = {};
  const HORIZONTE = 760; // dias de histórico, para comparar com o ano anterior

  for (let ago = HORIZONTE; ago >= 0; ago--) {
    const dia = daysAgo(ago);
    const fimDeSemana = dia.getDay() === 0 || dia.getDay() === 6;
    // Último mês mais movimentado: pelo menos uma entrada por dia útil.
    const recente = ago <= 30 && !fimDeSemana;
    const quantos = recente ? 1 + poisson(0.9) : poisson(fimDeSemana ? 0.12 : 1.15);

    for (let k = 0; k < quantos; k++) {
      const tipo = rand() < 0.47 ? "mediacao" : "arbitragem";
      const ano = dia.getFullYear();
      const chave = `${tipo}-${ano}`;
      sequencia[chave] = (sequencia[chave] || 0) + 1;

      const entrada = new Date(dia);
      entrada.setHours(between(9, 17), between(0, 59));
      // Os de hoje entram até agora, nunca no futuro.
      if (ago === 0 && entrada > now) entrada.setTime(now.getTime() - between(5, 90) * 60000);

      const duracao = tipo === "mediacao" ? between(25, 110) : between(70, 300);
      const conclusao = new Date(entrada.getTime() + duracao * 86400000);
      const concluido = conclusao <= today;
      const progresso = Math.min(1, (now - entrada) / (duracao * 86400000));

      processos.push({
        id: `${tipo === "arbitragem" ? "ARB" : "MED"}-${ano}/${String(sequencia[chave]).padStart(4, "0")}`,
        tipo,
        entrada,
        conclusao: concluido ? conclusao : null,
        resultado: concluido ? weighted(RESULTADOS[tipo]) : null,
        fase: concluido ? "Concluído" : faseDe(tipo, progresso),
        materia: weighted(MATERIAS),
        requerente: `${pick(NOMES)} ${pick(APELIDOS)}`,
        requerida: pick(EMPRESAS),
        valor: tipo === "arbitragem" ? valorEntre(900, 60000) : valorEntre(300, 15000),
        responsavel: tipo === "arbitragem" ? pick(ARBITROS) : pick(MEDIADORES),
      });
    }
  }

  processos.sort((a, b) => b.entrada - a.entrada);
  const ativos = processos.filter((p) => !p.conclusao);

  // ---------------------------------------------------------------------
  // Pedidos de adesão de empresas ao centro
  // ---------------------------------------------------------------------

  const adesoes = [
    { empresa: "Mirante Energia, S.A.", setor: "Energia", data: daysAgo(0, 11, 2), estado: "novo" },
    { empresa: "Rede Celta Comunicações, S.A.", setor: "Telecomunicações", data: daysAgo(1, 15, 20), estado: "novo" },
    { empresa: "Lusoterm Climatização, Lda.", setor: "Comércio e serviços", data: daysAgo(2, 9, 48), estado: "novo" },
    { empresa: "Vela Branca Turismo, Lda.", setor: "Turismo", data: daysAgo(4, 14, 5), estado: "em_analise" },
    { empresa: "Aldeia Verde Imobiliária, Lda.", setor: "Imobiliário", data: daysAgo(7, 10, 30), estado: "documentacao" },
    { empresa: "Oficina Ponte Nova, Lda.", setor: "Reparação automóvel", data: daysAgo(11, 16, 12), estado: "em_analise" },
    { empresa: "Clínica Dentária Sorriso Azul, Lda.", setor: "Saúde", data: daysAgo(19, 12, 0), estado: "aprovado" },
    { empresa: "Quinta do Freixo Vinhos, Lda.", setor: "Comércio e serviços", data: daysAgo(26, 11, 40), estado: "aprovado" },
  ];
  for (let ago = 31; ago <= 400; ago += between(5, 11)) {
    adesoes.push({
      empresa: pick(EMPRESAS),
      setor: pick(["Comércio e serviços", "Energia", "Telecomunicações", "Seguros", "Turismo", "Imobiliário"]),
      data: daysAgo(ago, between(9, 17), between(0, 59)),
      estado: rand() < 0.88 ? "aprovado" : "recusado",
    });
  }

  // ---------------------------------------------------------------------
  // Avisos internos
  // ---------------------------------------------------------------------

  const avisos = [
    {
      id: "a1",
      titulo: "Relatório anual: dados fechados no fim da próxima semana",
      texto: "Cada jurista confirma os dados estatísticos dos seus processos de 2026. Depois disso a secretaria fecha o ficheiro do relatório.",
      prioridade: "urgente",
      autor: "u1",
      data: daysAgo(0, 9, 12),
    },
    {
      id: "a2",
      titulo: "Nova tabela de custas a partir de 1 de janeiro",
      texto: "A tabela revista já está na pasta partilhada. Os processos que entrarem a partir de 1 de janeiro seguem os novos valores.",
      prioridade: "importante",
      autor: "u2",
      data: daysAgo(1, 16, 40),
    },
    {
      id: "a3",
      titulo: "Sala 2 indisponível esta semana",
      texto: "As sessões marcadas para a Sala 2 passam para a Sala 3 ou para videoconferência. A secretaria já avisou as partes.",
      prioridade: "normal",
      autor: "u6",
      data: daysAgo(2, 10, 5),
    },
    {
      id: "a4",
      titulo: "Formação interna sobre mediação online",
      texto: "Quinta-feira às 15h00, na Sala 1: boas práticas para sessões por videoconferência e assinatura de acordos à distância.",
      prioridade: "normal",
      autor: "u7",
      data: daysAgo(4, 12, 30),
    },
  ];

  // ---------------------------------------------------------------------
  // Agenda: sessões e audiências nos próximos três dias úteis
  // ---------------------------------------------------------------------

  const diasUteis = [];
  for (let off = 0; diasUteis.length < 3; off++) {
    const d = at(off);
    if (d.getDay() !== 0 && d.getDay() !== 6) diasUteis.push(off);
  }

  const HORARIOS = [[9, 30], [10, 30], [11, 0], [14, 0], [14, 30], [15, 30], [16, 30]];
  const LOCAIS = ["Sala 1", "Sala 3", "Videoconferência"];
  const sessoes = [];
  // Alterna entre audiências, sessões de mediação e pré-mediações.
  const porFase = ["Audiência", "Em mediação", "Pré-mediação"].map((f) => ativos.filter((p) => p.fase === f));
  const emAgenda = [];
  for (let i = 0; emAgenda.length < 20 && i < 40; i++) {
    const p = porFase[i % 3][Math.floor(i / 3)];
    if (p) emAgenda.push(p);
  }
  let cursor = 0;
  diasUteis.forEach((off, i) => {
    const quantas = i === 0 ? 5 : 3;
    const horas = [...HORARIOS].sort(() => rand() - 0.5).slice(0, quantas).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    horas.forEach(([h, m]) => {
      const p = emAgenda[cursor++ % emAgenda.length];
      if (!p) return;
      sessoes.push({
        inicio: at(off, h, m),
        tipo: p.tipo === "arbitragem" ? "Audiência arbitral" : p.fase === "Pré-mediação" ? "Pré-mediação" : "Sessão de mediação",
        processo: p.id,
        partes: `${p.requerente} / ${p.requerida}`,
        local: pick(LOCAIS),
        responsavel: p.responsavel,
      });
    });
  });

  // ---------------------------------------------------------------------
  // Prazos a vencer
  // ---------------------------------------------------------------------

  const PRAZOS = {
    Citação: "Prazo de contestação",
    Contestação: "Resposta à contestação",
    Instrução: "Junção de documentos",
    Audiência: "Alegações finais",
    "Aguarda sentença": "Prolação da sentença",
    "Redação do acordo": "Assinatura do acordo",
  };
  // Um processo por tipo de prazo, para a lista não repetir o mesmo prazo.
  const comPrazo = Object.keys(PRAZOS).map((fase) => ativos.find((p) => p.fase === fase)).filter(Boolean);
  const prazos = comPrazo
    .slice(0, 7)
    .map((p, i) => ({
      processo: p.id,
      descricao: PRAZOS[p.fase],
      responsavel: p.responsavel,
      limite: at([1, 2, 2, 4, 6, 8, 10][i], 23, 59),
    }))
    .sort((a, b) => a.limite - b.limite);

  // ---------------------------------------------------------------------
  // Notificações do utilizador
  // ---------------------------------------------------------------------

  const ultimaSentenca = processos.find((p) => p.resultado === "sentenca");
  const notificacoes = [
    { icon: "building", texto: `Novo pedido de adesão: ${adesoes[0].empresa}`, data: adesoes[0].data, lida: false },
    { icon: "folder", texto: `Joana Matos atribuiu-lhe o processo ${processos[1]?.id ?? ""}`, data: daysAgo(0, 9, 40), lida: false },
    { icon: "hourglass", texto: `${prazos[0]?.descricao ?? "Prazo"} termina amanhã no processo ${prazos[0]?.processo ?? ""}`, data: daysAgo(0, 8, 0), lida: false },
    { icon: "scale", texto: `Sentença depositada no processo ${ultimaSentenca?.id ?? ""}`, data: daysAgo(1, 17, 25), lida: true },
  ];

  // ---------------------------------------------------------------------
  // Chat entre colaboradores: conversas de partida. "me" é quem tem sessão
  // iniciada; uma conversa direta com a própria pessoa é ignorada.
  // ---------------------------------------------------------------------

  const minutosAtras = (min) => new Date(now.getTime() - min * 60000);
  const conversas = [
    {
      id: "equipa",
      grupo: true,
      nome: "Equipa CAUAL",
      mensagens: [
        { de: "u2", texto: "Bom dia a todos. A sala 2 continua em obras, as sessões passam para a sala 3.", data: minutosAtras(190) },
        { de: "u7", texto: "Obrigada, Miguel. Mudo já a mediação das 14h30.", data: minutosAtras(176) },
        { de: "u6", texto: "Já enviei os avisos às partes por email.", data: minutosAtras(150) },
        { de: "u1", texto: "Lembrem-se de confirmar os dados para o relatório anual até à próxima semana.", data: minutosAtras(42) },
      ],
    },
    {
      id: "dm-u3",
      com: "u3",
      mensagens: [
        { de: "u3", texto: "Olá! Recebemos a contestação no processo de arrendamento que estava atrasado.", data: minutosAtras(95) },
        { de: "me", texto: "Ótimo. Já foi junta ao processo?", data: minutosAtras(90) },
        { de: "u3", texto: "Sim, e já notifiquei a parte contrária. Prazo de resposta de 10 dias.", data: minutosAtras(12) },
      ],
    },
    {
      id: "dm-u5",
      com: "u5",
      mensagens: [
        { de: "u5", texto: "Consegue confirmar se a audiência de amanhã é presencial?", data: minutosAtras(28) },
      ],
    },
    {
      id: "dm-u2",
      com: "u2",
      mensagens: [
        { de: "me", texto: "Miguel, a nova tabela de custas já está publicada no site?", data: minutosAtras(60 * 26) },
        { de: "u2", texto: "Ainda não, sai na segunda-feira com a nota informativa.", data: minutosAtras(60 * 25) },
      ],
    },
    {
      id: "dm-u7",
      com: "u7",
      mensagens: [
        { de: "u7", texto: "Partilhei a apresentação da formação na pasta da equipa.", data: minutosAtras(60 * 50) },
        { de: "me", texto: "Obrigada, vejo ainda hoje.", data: minutosAtras(60 * 49) },
      ],
    },
  ];
  // Mensagens por ler, por conversa (as últimas recebidas).
  const porLer = { equipa: 1, "dm-u3": 1, "dm-u5": 1 };

  return {
    centro,
    hoje: today,
    colaboradores,
    processos,
    adesoes,
    avisos,
    sessoes,
    prazos,
    notificacoes,
    conversas,
    porLer,
    pessoa: (id) => colaboradores.find((c) => c.id === id),
  };
})();
