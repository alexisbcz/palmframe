import { defineMessages } from "@/i18n/core"

export const messages = defineMessages({
  en: {
    meta: "API",
    title: "Developer API",
    intro:
      "Read your projects and render panels from your own code or an AI agent. Renders use the same credits as the app.",
    auth: {
      title: "Authentication",
      body: "Create a key in Settings and send it as a Bearer token. A key is shown once; revoke it there if it leaks.",
      settings: "Open Settings",
    },
    flow: {
      title: "Render a panel",
      body: "Paid work takes four steps: estimate (free, valid 10 minutes), start with the price you accept and an Idempotency-Key, then poll. If the project changed since the estimate, start is refused: estimate again. A failed or cancelled render is refunded.",
    },
    read: { title: "Projects and credits" },
    mcp: {
      title: "MCP",
      body: "The same operations are MCP tools at /mcp (Streamable HTTP), with the same key.",
    },
    limits: {
      title: "Limits",
      body: "120 reads and 20 writes per minute per key. 2 active renders per account and 8 in total; the renderer draws one panel at a time.",
    },
  },
  fr: {
    meta: "API",
    title: "API développeur",
    intro:
      "Lisez vos projets et générez des cases depuis votre code ou un agent IA. Les rendus utilisent les mêmes crédits que l’app.",
    auth: {
      title: "Authentification",
      body: "Créez une clé dans les Paramètres et envoyez-la en jeton Bearer. Elle n’est affichée qu’une fois ; révoquez-la au même endroit si elle fuite.",
      settings: "Ouvrir les Paramètres",
    },
    flow: {
      title: "Générer une case",
      body: "Un travail payant se fait en quatre étapes : estimation (gratuite, valable 10 minutes), lancement avec le prix accepté et un Idempotency-Key, puis suivi. Si le projet a changé depuis l’estimation, le lancement est refusé : estimez à nouveau. Un rendu échoué ou annulé est remboursé.",
    },
    read: { title: "Projets et crédits" },
    mcp: {
      title: "MCP",
      body: "Les mêmes opérations existent en outils MCP sur /mcp (Streamable HTTP), avec la même clé.",
    },
    limits: {
      title: "Limites",
      body: "120 lectures et 20 écritures par minute et par clé. 2 rendus actifs par compte et 8 au total ; le moteur dessine une case à la fois.",
    },
  },
  es: {
    meta: "API",
    title: "API para desarrolladores",
    intro:
      "Lee tus proyectos y genera viñetas desde tu código o un agente de IA. Los renders usan los mismos créditos que la app.",
    auth: {
      title: "Autenticación",
      body: "Crea una clave en Ajustes y envíala como token Bearer. Solo se muestra una vez; revócala allí si se filtra.",
      settings: "Abrir Ajustes",
    },
    flow: {
      title: "Generar una viñeta",
      body: "El trabajo de pago tiene cuatro pasos: estimar (gratis, válido 10 minutos), iniciar con el precio que aceptas y un Idempotency-Key, y consultar. Si el proyecto cambió desde la estimación, el inicio se rechaza: vuelve a estimar. Un render fallido o cancelado se reembolsa.",
    },
    read: { title: "Proyectos y créditos" },
    mcp: {
      title: "MCP",
      body: "Las mismas operaciones son herramientas MCP en /mcp (Streamable HTTP), con la misma clave.",
    },
    limits: {
      title: "Límites",
      body: "120 lecturas y 20 escrituras por minuto y clave. 2 renders activos por cuenta y 8 en total; el motor dibuja una viñeta a la vez.",
    },
  },
  de: {
    meta: "API",
    title: "Entwickler-API",
    intro:
      "Lies deine Projekte und rendere Panels aus deinem Code oder einem KI-Agenten. Renders nutzen dieselben Credits wie die App.",
    auth: {
      title: "Authentifizierung",
      body: "Erstelle einen Schlüssel in den Einstellungen und sende ihn als Bearer-Token. Er wird nur einmal angezeigt; widerrufe ihn dort, falls er bekannt wird.",
      settings: "Einstellungen öffnen",
    },
    flow: {
      title: "Ein Panel rendern",
      body: "Kostenpflichtige Arbeit hat vier Schritte: schätzen (kostenlos, 10 Minuten gültig), mit dem akzeptierten Preis und einem Idempotency-Key starten, dann abfragen. Hat sich das Projekt seit der Schätzung geändert, wird der Start abgelehnt: neu schätzen. Fehlgeschlagene oder abgebrochene Renders werden erstattet.",
    },
    read: { title: "Projekte und Credits" },
    mcp: {
      title: "MCP",
      body: "Dieselben Vorgänge gibt es als MCP-Tools unter /mcp (Streamable HTTP), mit demselben Schlüssel.",
    },
    limits: {
      title: "Limits",
      body: "120 Lese- und 20 Schreibzugriffe pro Minute und Schlüssel. 2 aktive Renders pro Konto und 8 insgesamt; der Renderer zeichnet ein Panel nach dem anderen.",
    },
  },
  it: {
    meta: "API",
    title: "API per sviluppatori",
    intro:
      "Leggi i tuoi progetti e genera vignette dal tuo codice o da un agente IA. I render usano gli stessi crediti dell’app.",
    auth: {
      title: "Autenticazione",
      body: "Crea una chiave nelle Impostazioni e inviala come token Bearer. Viene mostrata una sola volta; revocala lì se trapela.",
      settings: "Apri le Impostazioni",
    },
    flow: {
      title: "Generare una vignetta",
      body: "Il lavoro a pagamento ha quattro passi: stima (gratuita, valida 10 minuti), avvio con il prezzo accettato e un Idempotency-Key, poi controllo. Se il progetto è cambiato dopo la stima, l’avvio viene rifiutato: stima di nuovo. Un render fallito o annullato viene rimborsato.",
    },
    read: { title: "Progetti e crediti" },
    mcp: {
      title: "MCP",
      body: "Le stesse operazioni sono strumenti MCP su /mcp (Streamable HTTP), con la stessa chiave.",
    },
    limits: {
      title: "Limiti",
      body: "120 letture e 20 scritture al minuto per chiave. 2 render attivi per account e 8 in totale; il motore disegna una vignetta alla volta.",
    },
  },
  ja: {
    meta: "API",
    title: "開発者 API",
    intro:
      "自分のコードや AI エージェントからプロジェクトを読み、コマを生成できます。アプリと同じクレジットを使います。",
    auth: {
      title: "認証",
      body: "設定でキーを作成し、Bearer トークンとして送ります。キーは一度だけ表示されます。漏れた場合は設定で無効にしてください。",
      settings: "設定を開く",
    },
    flow: {
      title: "コマを生成する",
      body: "有料の処理は 4 段階です。見積もり(無料、10 分有効)、了承した価格と Idempotency-Key で開始、そして状態の確認。見積もり後にプロジェクトが変わった場合、開始は拒否されるので見積もり直してください。失敗またはキャンセルされた生成は返金されます。",
    },
    read: { title: "プロジェクトとクレジット" },
    mcp: {
      title: "MCP",
      body: "同じ操作を /mcp(Streamable HTTP)の MCP ツールとして、同じキーで使えます。",
    },
    limits: {
      title: "制限",
      body: "キーごとに毎分 120 回の読み取りと 20 回の書き込み。アカウントごとに実行中 2 件、全体で 8 件まで。生成は 1 コマずつ行われます。",
    },
  },
})
