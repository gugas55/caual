# CAUAL · Plataforma de gestão do centro de arbitragem e mediação

Aplicação web (HTML, CSS e JavaScript estáticos, sem dependências) para a gestão
interna do CAUAL, Centro de Arbitragem e Mediação de Conflitos. O design segue a
linguagem da Hotel Solutions ("liquid glass": fundo com rede de pontos, barra
lateral e topo em vidro flutuante, controlos em pílula, chat de equipa na margem
direita), com o azul `#00609E` como cor de base e o branco como superfície.

## O que já existe

| Página | Ficheiro | O que tem |
|---|---|---|
| Início de sessão | `login.html` | Email e palavra-passe, mostrar/esconder palavra-passe, "manter sessão iniciada", recuperar palavra-passe (popup) |
| Painel inicial | `painel.html` | Indicadores, entradas dos últimos 15 dias, taxa de resolução, avisos, agenda, pedidos de adesão, processos recentes com pesquisa, prazos, equipa, notificações e chat lateral |

Indicadores do painel:

- **Processos em curso** (com a variação face a há 30 dias e o total entrado no ano)
- **Taxa de resolução** dos últimos 12 meses (acordo ou sentença sobre os concluídos), com a variação face ao ano anterior e a divisão por mediação e arbitragem
- **Entradas nos últimos 15 dias**, com gráfico por dia (e vista em tabela)
- **Novos pedidos de adesão** dos últimos 30 dias e quantos estão por analisar

As entradas do menu lateral que ainda não têm página mostram um aviso "chega numa próxima fase".

## Como abrir

Versão publicada (GitHub Pages): https://gugas55.github.io/caual/

Para trabalhar localmente:

É preciso servir a pasta por HTTP (a política de segurança das páginas não deixa
correr os scripts a partir de `file://`). Qualquer servidor estático serve, por exemplo:

```bash
npx serve .
```

No Claude Code, a configuração `caual` em `.claude/launch.json` arranca um servidor
local na porta 5180.

## Contas e acesso

A app usa o **Supabase Auth**. Não há registo público: cada conta é criada pela
direção no painel da Supabase e só entra quem também estiver na tabela
`colaboradores` (ver abaixo). A palavra-passe tem de ter pelo menos 10 caracteres,
com maiúsculas, minúsculas e algarismos. "Esqueceu-se da palavra-passe?" envia uma
ligação que volta a `login.html` para definir a nova.

Nota: o serviço de email incluído na Supabase só envia para membros da equipa da
organização e com limite por hora. Para enviar a todos os colaboradores, configure um
SMTP próprio em Authentication → Emails.

## O que fica guardado no navegador

| Chave | Conteúdo |
|---|---|
| `sb-…-auth-token` | Sessão do Supabase Auth (em `localStorage` com "manter sessão iniciada", senão em `sessionStorage`) |
| `caual.lembrar` | Se a pessoa escolheu manter a sessão iniciada |
| `caual.sidebar` | Barra lateral recolhida ou aberta |

Tudo o resto (avisos, mensagens, notificações, leituras) está na base de dados.

## Base de dados (Supabase)

- Projeto **CAUAL** (`fcuuwdzoxtoybtoxfofo`), na organização CAUAL da Supabase,
  região Frankfurt (`eu-central-1`).
- Painel: https://supabase.com/dashboard/project/fcuuwdzoxtoybtoxfofo
- Esquema em `supabase/migrations/` (aplicado e registado no histórico do projeto).
  A pasta `supabase/` está ligada ao projeto (`supabase link`); com a CLI iniciada
  nessa conta, `supabase db query --linked "..."` corre SQL sem precisar da
  palavra-passe da base de dados.

Tabelas: `colaboradores`, `processos`, `pedidos_adesao`, `avisos`, `sessoes`,
`prazos`, `notificacoes`, `conversas`, `conversa_membros`, `mensagens`. Todas com
RLS: só quem tem sessão iniciada **e** uma linha ativa em `colaboradores` lê e
escreve; o acesso anónimo está fechado. O chat e as notificações estão em tempo real.

Para dar acesso a um colaborador: criar (ou convidar) a conta em Authentication →
Users e acrescentar a linha correspondente em `colaboradores` (mesmo `id` do
utilizador do Auth). Uma conta sem essa linha entra mas não vê nada.

A app lê e escreve diretamente nestas tabelas: o painel calcula os indicadores a partir
dos processos e pedidos de adesão, os avisos e as notificações são da base de dados, e o
chat usa o Realtime (mensagens novas e presença "online" no canal privado
`equipa:presenca`). `assets/js/core/data.js` já não é carregado pelas páginas; fica
apenas como gerador de dados de demonstração.

## Estrutura

```
login.html, painel.html, index.html
assets/
  css/
    base.css         tokens (cores, vidro, tipo, espaço), reset, ecrã de carregamento
    layout.css       estrutura da app: barra lateral, topo, grelhas, gaveta em telemóvel
    components.css   marca, botões, campos, cartões, etiquetas, avatares, popups, toasts
    chat.css         chat lateral da equipa
    pages/auth.css   início de sessão
    pages/painel.css painel inicial (indicadores, gráficos, listas, tabela)
  js/core/
    icons.js         ícones de traço
    mesh-background.js  rede de pontos ao fundo
    ui.js            formatação pt-PT, popups, toasts, ecrã de carregamento
    supabase-client.js  ligação à Supabase (URL e chave publishable)
    db.js            leitura e escrita dos dados do painel
    session.js       sessão com o Supabase Auth
    data.js          gerador de dados de demonstração (não é carregado pelas páginas)
    shell.js         barra lateral e botão do menu (partilhado pelas páginas da app)
    team-chat.js     chat lateral entre colaboradores (Supabase + Realtime)
  js/pages/
    auth.js          lógica do início de sessão
    painel.js        lógica do painel inicial
  img/caual-mark.svg símbolo da marca (balança)
```

Para uma página nova da app: copiar a estrutura de `painel.html` (`.app`, barra
lateral `data-sidebar`, `.topbar`, `.app__content`), chamar `Shell.init("id")` e
`TeamChat.init(user)`, e acrescentar a entrada em `NAV` no `shell.js` com o `href`.
Toda a página nova leva `<meta name="robots" content="noindex, nofollow, noarchive" />`.
