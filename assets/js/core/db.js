// Dados do painel lidos da Supabase.
//
// Devolve as mesmas formas que o painel já usava (datas como Date, número do
// processo em "id"), por isso a página só mostra. As regras de acesso (RLS)
// garantem que cada pessoa só recebe o que pode ver.
const CAUAL_DB = (() => {
  const PAGE = 1000; // limite de linhas por pedido da API

  const date = (v) => (v ? new Date(v) : null);

  async function rows(query) {
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  // Lê todas as linhas, em páginas de 1000.
  async function all(build) {
    const out = [];
    for (let from = 0; ; from += PAGE) {
      const page = await rows(build().range(from, from + PAGE - 1));
      out.push(...page);
      if (page.length < PAGE) return out;
    }
  }

  const mapProcesso = (r) => ({
    uuid: r.id,
    id: r.numero,
    tipo: r.tipo,
    entrada: date(r.entrada),
    conclusao: date(r.conclusao),
    resultado: r.resultado,
    fase: r.conclusao ? "Concluído" : r.fase,
    materia: r.materia,
    requerente: r.requerente,
    requerida: r.requerida,
    valor: Number(r.valor),
    responsavel: r.responsavel || "Sem responsável",
  });

  const mapAviso = (r) => ({
    id: r.id,
    titulo: r.titulo,
    texto: r.texto,
    prioridade: r.prioridade,
    autor: r.autor_id,
    data: date(r.criado_em),
  });

  async function carregarPainel() {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const fimAgenda = new Date(hoje);
    fimAgenda.setDate(fimAgenda.getDate() + 8);

    const [processos, adesoes, avisos, sessoes, prazos, notificacoes, colaboradores] = await Promise.all([
      all(() => sb.from("processos")
        .select("id, numero, tipo, entrada, conclusao, resultado, fase, materia, requerente, requerida, valor, responsavel")
        .order("entrada", { ascending: false })),
      all(() => sb.from("pedidos_adesao")
        .select("id, empresa, setor, estado, recebido_em")
        .order("recebido_em", { ascending: false })),
      rows(sb.from("avisos")
        .select("id, titulo, texto, prioridade, autor_id, criado_em")
        .order("criado_em", { ascending: false })
        .limit(50)),
      rows(sb.from("sessoes")
        .select("id, tipo, inicio, local, responsavel, processo:processos(numero, requerente, requerida)")
        .gte("inicio", hoje.toISOString())
        .lt("inicio", fimAgenda.toISOString())
        .order("inicio")),
      rows(sb.from("prazos")
        .select("id, descricao, limite, responsavel, processo:processos(numero)")
        .eq("cumprido", false)
        .gte("limite", hoje.toISOString())
        .order("limite")
        .limit(5)),
      rows(sb.from("notificacoes")
        .select("id, icone, texto, lida, criada_em")
        .order("criada_em", { ascending: false })
        .limit(20)),
      rows(sb.from("colaboradores")
        .select("id, nome, cargo, email, cor")
        .eq("ativo", true)
        .order("nome")),
    ]);

    const equipa = colaboradores.map((c) => ({ ...c, cor: c.cor || Session.corDe(c.id), presenca: "offline" }));

    return {
      centro: { sigla: "CAUAL", designacao: "Centro de Arbitragem e Mediação de Conflitos", sede: "Lisboa" },
      processos: processos.map(mapProcesso),
      adesoes: adesoes.map((a) => ({ id: a.id, empresa: a.empresa, setor: a.setor || "Sem setor", estado: a.estado, data: date(a.recebido_em) })),
      avisos: avisos.map(mapAviso),
      sessoes: sessoes.map((s) => ({
        inicio: date(s.inicio),
        tipo: s.tipo,
        processo: s.processo?.numero ?? "",
        partes: s.processo ? `${s.processo.requerente} / ${s.processo.requerida}` : "",
        local: s.local,
        responsavel: s.responsavel || "Sem responsável",
      })),
      prazos: prazos.map((z) => ({
        processo: z.processo?.numero ?? "",
        descricao: z.descricao,
        responsavel: z.responsavel || "Sem responsável",
        limite: date(z.limite),
      })),
      notificacoes: notificacoes.map((n) => ({ id: n.id, icon: n.icone, texto: n.texto, lida: n.lida, data: date(n.criada_em) })),
      colaboradores: equipa,
      pessoa: (id) => equipa.find((c) => c.id === id),
    };
  }

  async function publicarAviso({ titulo, texto, prioridade }) {
    const { data, error } = await sb
      .from("avisos")
      .insert({ titulo, texto, prioridade })
      .select("id, titulo, texto, prioridade, autor_id, criado_em")
      .single();
    if (error) throw error;
    return mapAviso(data);
  }

  async function marcarNotificacoesLidas() {
    const { error } = await sb.from("notificacoes").update({ lida: true }).eq("lida", false);
    if (error) throw error;
  }

  return { carregarPainel, publicarAviso, marcarNotificacoesLidas };
})();
