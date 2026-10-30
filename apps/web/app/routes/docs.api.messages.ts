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
    access: {
      title: "Key access",
      body: "A key can be limited in Settings; a new key has full access unless you narrow it. Scopes: read (projects, pages, balance) and generate (estimate, start, cancel). Any key can read prices and poll operations. A call outside its scopes gets 403 insufficient_scope, and over MCP the tools a key can't use aren't listed. A key limited to some projects sees no others: they answer 404. A key's credit limit is checked when a render starts, so concurrent calls can't pass it: over the limit, start gets 403 key_credit_limit. Refunded renders don't count. GET /api/v1/credits shows the key's limit and spending.",
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
    access: {
      title: "Accès d’une clé",
      body: "Une clé peut être restreinte dans les Paramètres ; une nouvelle clé a un accès complet tant que vous ne le réduisez pas. Portées : read (projets, pages, solde) et generate (estimer, lancer, annuler). Toute clé peut lire les prix et suivre les opérations. Un appel hors de ses portées reçoit 403 insufficient_scope, et en MCP les outils inaccessibles ne sont pas listés. Une clé limitée à certains projets ne voit pas les autres : ils répondent 404. La limite de crédits d’une clé est vérifiée au lancement d’un rendu, donc des appels simultanés ne peuvent pas la dépasser : au-delà, le lancement reçoit 403 key_credit_limit. Les rendus remboursés ne comptent pas. GET /api/v1/credits indique la limite et les dépenses de la clé.",
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
    access: {
      title: "Acceso de una clave",
      body: "Una clave se puede restringir en Ajustes; una clave nueva tiene acceso completo salvo que lo reduzcas. Ámbitos: read (proyectos, páginas, saldo) y generate (estimar, iniciar, cancelar). Cualquier clave puede leer los precios y consultar operaciones. Una llamada fuera de sus ámbitos recibe 403 insufficient_scope, y en MCP no se listan las herramientas que la clave no puede usar. Una clave limitada a algunos proyectos no ve los demás: responden 404. El límite de créditos de una clave se comprueba al iniciar un render, así que las llamadas simultáneas no pueden superarlo: por encima, el inicio recibe 403 key_credit_limit. Los renders reembolsados no cuentan. GET /api/v1/credits muestra el límite y el gasto de la clave.",
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
    access: {
      title: "Schlüsselzugriff",
      body: "Ein Schlüssel lässt sich in den Einstellungen einschränken; ein neuer Schlüssel hat vollen Zugriff, bis du ihn begrenzt. Scopes: read (Projekte, Seiten, Guthaben) und generate (schätzen, starten, abbrechen). Jeder Schlüssel kann Preise lesen und Operationen abfragen. Ein Aufruf außerhalb der Scopes erhält 403 insufficient_scope, und über MCP werden Tools, die der Schlüssel nicht nutzen darf, nicht aufgeführt. Ein auf bestimmte Projekte begrenzter Schlüssel sieht keine anderen: Sie antworten mit 404. Das Credit-Limit wird beim Start eines Renders geprüft, sodass gleichzeitige Aufrufe es nicht überschreiten können: Darüber erhält der Start 403 key_credit_limit. Erstattete Renders zählen nicht. GET /api/v1/credits zeigt Limit und Ausgaben des Schlüssels.",
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
    access: {
      title: "Accesso di una chiave",
      body: "Una chiave si può limitare nelle Impostazioni; una nuova chiave ha accesso completo finché non lo restringi. Ambiti: read (progetti, pagine, saldo) e generate (stimare, avviare, annullare). Ogni chiave può leggere i prezzi e controllare le operazioni. Una chiamata fuori dai suoi ambiti riceve 403 insufficient_scope, e via MCP gli strumenti che la chiave non può usare non vengono elencati. Una chiave limitata ad alcuni progetti non vede gli altri: rispondono 404. Il limite di crediti di una chiave è verificato all’avvio di un render, quindi chiamate simultanee non possono superarlo: oltre il limite, l’avvio riceve 403 key_credit_limit. I render rimborsati non contano. GET /api/v1/credits mostra il limite e la spesa della chiave.",
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
    access: {
      title: "キーのアクセス権",
      body: "キーは設定で制限できます。新しいキーは、絞り込まない限りフルアクセスです。スコープは read(プロジェクト、ページ、残高)と generate(見積もり、開始、キャンセル)です。どのキーでも価格の確認とオペレーションの照会ができます。スコープ外の呼び出しには 403 insufficient_scope が返り、MCP では使えないツールは一覧に表示されません。一部のプロジェクトに限定されたキーからは他のプロジェクトは見えず、404 が返ります。キーのクレジット上限はレンダー開始時に確認されるため、同時に呼び出しても超えられません。超える場合、開始には 403 key_credit_limit が返ります。返金されたレンダーは含まれません。GET /api/v1/credits でキーの上限と使用量を確認できます。",
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
