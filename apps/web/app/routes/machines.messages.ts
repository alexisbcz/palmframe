import { defineMessages } from "@/i18n/core"

export const messages = defineMessages({
  en: {
    meta: "Content machines",
    title: "Content machines",
    intro:
      "Each machine is a small media outlet. It reads your sources on a schedule, its agent picks what's worth saying, and posts go out to your accounts, with or without your review.",
    create: "New machine",
    limit: "You've reached the limit of {n} machines.",
    empty: {
      title: "No machines yet",
      text: "Start from a template, then tune what it listens for.",
    },
    presets: {
      newsroom: "A news flash account on AI",
      hackernews: "What builders are reading",
      wikipedia: "Breaking on Wikipedia",
      bluesky: "Comics talk on Bluesky",
      crypto: "Crypto price swings",
    },
    presetHints: {
      newsroom: "Fresh AI news, posted as it breaks",
      hackernews: "Top Hacker News story every 3 hours",
      wikipedia: "Pages rewritten fast, often breaking news",
      bluesky: "Spikes in webtoon, manga and comic talk",
      crypto: "BTC, ETH and SOL moving 2% in an hour",
    },
    sources: {
      bluesky: "Bluesky posts",
      wikipedia: "Wikipedia edits",
      crypto: "Crypto prices",
    },
    status: {
      running: "Running",
      paused: "Paused",
      lastRun: "Last run {when}",
      notScheduled:
        "Scheduled runs aren't set up on this server, so this machine only works while you listen here.",
    },
    wire: {
      title: "Live wire",
      hint: "Hear the stream in this tab, with this machine's filter. Listening is free.",
      listen: "Listen",
      stop: "Stop",
      connecting: "Connecting…",
      failed: "The stream can't be reached right now.",
      heard: "{heard} heard, {matched} matched",
      quiet: "Nothing has matched yet.",
      fired: "Worth a post",
      write: "Write a draft",
      passed: "The writer passed on this one.",
    },
    platforms: {
      bluesky: "Bluesky",
      twitter: "X",
      threads: "Threads",
      linkedin: "LinkedIn",
      instagram: "Instagram",
    },
    feeds: {
      rss: "RSS feed",
      news: "News search",
      hackernews: "Hacker News front page",
      tiktok: "TikTok search",
      youtube: "YouTube search",
    },
    posts: {
      blocked: "Stopped by the standards desk",
      blockedReason: "This can't be approved: {reason}",
      takeDropped: "The take was left out: {reason}",
      take: "Take: {take}",
      retracted: "Retracted",
      retract: "Retract",
      retractManual:
        "Instagram can't be retracted from here. Delete the post there yourself.",
      removed: "Taken down",
      byHand: "Delete this one by hand",
      retractLeft: "Delete {n} by hand: the service couldn't take them down.",
      expired: "Expired",
      halted:
        "Publishing is paused for now. Nothing was sent, so try again later.",
      title: "Posts",
      waiting: "Waiting for you",
      queued: "Queued",
      publishing: "Publishing…",
      failed: "Not published",
      published: "Published",
      text: "Post text",
      held: "Held for you: {reason}",
      view: "View post",
      sent: "Sent",
      approve: "Publish",
      retry: "Try again",
    },
    inbox: { title: "What it heard", used: "Used" },
    agent: {
      mission: "Mission",
      missionHint:
        "What this outlet covers and what it should skip. The agent follows this on every run.",
      feeds: "Sources",
      feedsHint: "Read on every run, along with the live stream if it's on.",
      feedKind: "Source type",
      feedUrl: "Feed address",
      feedQuery: "Search for",
      removeFeed: "Remove source",
      addFeed: "Add a source",
      every: "Read every",
      everyHint:
        "Each run with something new costs {cost} credit, even when the agent decides to post nothing.",
      minutes: "{n} minutes",
      hours: "{n} h",
      listen: "Also listen to {stream}",
    },
    out: {
      title: "Where it publishes",
      public: "Public page with an RSS feed",
      connect: "Connect {platform}",
      blueskyHandle: "Bluesky handle",
      blueskyPassword: "Bluesky app password",
      connectBluesky: "Connect Bluesky",
      blueskyFailed: "That handle and app password didn't work.",
      instagramNeedsImage:
        "Instagram only takes posts with a picture, so turn pictures on or it will be skipped.",
      image: "Draw a picture for each post",
      imageHint: "{cost} credits per picture.",
      imageOff: "Pictures need an OpenRouter connection on this server.",
      story: "Research a full Story from what it posts",
      storyHint:
        "{story} credits per Story, {format} per format, one Story a day. Formats wait in Media. LinkedIn also becomes a draft that follows the publishing setting.",
      mode: "Publishing",
      review: "Review each post",
      auto: "Post automatically",
      reviewHint: "Posts wait here until you publish them.",
      autoHint:
        "Posts go out without you. A post is still held for you if it states a number its sources don't.",
      confirmTitle: "Post without review?",
      confirmBody:
        "This machine will publish to your accounts under your name, around the clock, until you turn it off. AI can get things wrong, and you're responsible for what it posts.",
      confirm: "Post automatically",
    },
    page: {
      stance: "Stance",
      publisher: "Publisher",
      contact: "Contact",
      arena: "Speaks to",
      aiWritten: "AI-written",
      changed: "Changed from {from} to {to} on {date}",
      declared: "Declared {to} on {date}",
      removed: "Stance removed on {date}",
      retracted: "Retracted on {date}. {reason}.",
      take: "Take",
      changes: "Stance history",
      byline: "Written and published by an AI agent.",
      rss: "RSS",
      empty: "Nothing published yet.",
    },
    drafts: {
      title: "Drafts",
      empty: "Drafts appear here when this machine finds something.",
      copy: "Copy text",
      copied: "Copied",
      comic: "Make the comic",
      open: "Open the comic",
      dismiss: "Dismiss",
      source: "Source",
      plain:
        "Written from the raw data, because no AI writer is available for this draft.",
    },
    form: {
      title: "Setup",
      name: "Name",
      source: "Stream",
      keywords: "Keywords",
      keywordsHint: "Separate with commas. Any one of them counts.",
      assets: "Assets",
      assetsHint: "Coinbase symbols, separated with commas.",
      anyArticle: "Leave empty to watch every article.",
      exclude: "Exclude",
      thresholdCount: "Matches needed",
      thresholdMove: "Move needed (%)",
      window: "Within (minutes)",
      cooldown: "Quiet time after firing (minutes)",
      cap: "Scheduled drafts a day",
      capHint: "At most this many posts a day.",
      maxCredits: "Most credits a day",
      maxCreditsHint:
        "Past this, the machine keeps listening and stops spending until the next UTC day.",
      voice: "Audience and voice",
      voicePlaceholder: "Who is this for, and how should it sound?",
      language: "Language",
      save: "Save",
      saved: "Saved. It starts fresh on the next run.",
      delete: "Delete machine",
    },
    delete: {
      title: "Delete {name}?",
      body: "Its drafts go too. Comics you already made stay in your projects.",
      cancel: "Cancel",
    },
    measure: {
      count: "{count} in {minutes} min",
      move: "{change}% in {minutes} min",
    },
    labs: {
      title: "Labs",
      nav: "Features still being tried out.",
      machines: "Studio",
      machinesHint:
        "Brand kits, ad research, trends and content machines that turn into comics. Turning this off stops every machine.",
      open: "Open Studio",
    },
    stances: {
      "far-left": "Far left",
      left: "Left",
      center: "Center",
      right: "Right",
      "far-right": "Far right",
    },
    styles: { plain: "Plain", deadpan: "Deadpan", wry: "Wry" },
    arenas: { fr: "France", us: "United States" },
    scrutiny: {
      government: "The government",
      regulators: "Regulators",
      large_employers: "Large employers",
      banks: "Banks",
      large_landlords: "Large landlords",
      public_spending: "Public spending",
      tech_platforms: "Tech platforms",
    },
    retractReasons: {
      error: "It got something wrong",
      source: "Its source didn't hold up",
      standards: "It fell short of our standards",
      owner: "The publisher took it down",
    },
    line: {
      title: "Editorial line",
      hint: "An optional public stance. It's shown on this machine's page and in its feed, and every post is checked against the same limits at every stop.",
      stance: "Stance",
      none: "No stance",
      arena: "Speaks to",
      publisher: "Publisher",
      publisherHint:
        "The person or organization who answers for this outlet. Shown publicly.",
      contact: "Public contact",
      contactHint: "An email address or an https link. Shown publicly.",
      scrutiny: "Look closer at",
      scrutinyHint:
        "Up to {n}. This ranks what the agent reads and proves nothing.",
      style: "Style",
      styleWithStance:
        "The stance decides what a take argues, and the style decides how it sounds. The post itself stays a flat fact.",
      styleAlone:
        "The post stays a flat fact, and the joke goes in a take. A take that fails a check is left out, and the post goes without it.",
      styleLimits:
        "Funny machines pass on private people, disasters and injuries. Nobody hurt is ever the joke.",
      review:
        "A stance starts in review. Auto mode opens after {n} published posts under this stance, with nothing blocked in the last 14 days.",
      far: "A far stance is always reviewed by a person, and never publishes by itself.",
      off: "With a stance, this machine keeps a public page, and draws no pictures, makes no Stories and doesn't post to Instagram. It needs Claude, so an OpenRouter connection can't pay for it.",
      cooldown:
        "Once a post is out, a stance can't change for {days} days, and each change shows on the public page.",
      oneStance: "An account holds one stance across all its machines.",
      calendar:
        "A line machine only runs where staff have reviewed the election calendar, and stops during election windows.",
      checklist: "Before this goes out, on each account",
      checks: {
        bluesky: "Bluesky: add the bot label and say who runs it in the bio.",
        twitter:
          "X: turn on the Automated label and name the managing account.",
        threads:
          "Threads: say in the bio that the account is AI-written and who runs it.",
        linkedin:
          "LinkedIn: say in the summary that the page is AI-written and who runs it.",
        instagram:
          "Instagram: posts carry the AI label; say who runs the account in the bio.",
      },
    },
    notices: {
      frozen:
        "This line is paused for an election window in its arena. Nothing runs or publishes until it ends.",
      no_calendar:
        "This line can't run: nobody has reviewed the election calendar for its arena.",
      not_public: "This line can't publish without its public page.",
      no_desk:
        "Stances and funny styles need Claude, so this machine doesn't run on an OpenRouter connection.",
      budget:
        "This machine reached its daily credit limit. It's still listening, and picks up again tomorrow (UTC).",
      unreadable: "These feeds answered, but no entry could be used: {feeds}",
    },
    dismissReasons: {
      none: "No particular reason",
      wrong: "It's wrong",
      dull: "It's not interesting",
      repeat: "We already covered it",
      tone: "Wrong tone",
    },
    errors: {
      one_stance:
        "Another of your machines holds a different stance. An account holds one.",
      cooldown:
        "This stance changed too recently. It can change again after 30 days.",
      review_first: "This machine has to stay in review for now.",
      line_rules:
        "A line machine needs its public page, and a far stance has to stay in review.",
      no_desk:
        "Stances and funny styles need Claude, so they can't run on an OpenRouter connection.",
      no_wire:
        "A machine with a stance or a funny style only writes on its schedule.",
      generic: "Something went wrong. Try again.",
      credits: "You don't have enough credits for this draft.",
    },
  },
  fr: {
    meta: "Machines à contenu",
    title: "Machines à contenu",
    intro:
      "Chaque machine est un petit média. Elle lit vos sources à intervalles réguliers, son agent choisit ce qui mérite d’être dit, et les posts partent sur vos comptes, avec ou sans relecture.",
    create: "Nouvelle machine",
    limit: "Vous avez atteint la limite de {n} machines.",
    empty: {
      title: "Aucune machine pour l’instant",
      text: "Partez d’un modèle, puis réglez ce qu’il écoute.",
    },
    presets: {
      newsroom: "Un compte d’actus flash sur l’IA",
      hackernews: "Ce que lisent les builders",
      wikipedia: "L’actu sur Wikipédia",
      bluesky: "La BD sur Bluesky",
      crypto: "Variations des cryptos",
    },
    presetHints: {
      newsroom: "L’actu IA fraîche, dès qu’elle tombe",
      hackernews: "Le top de Hacker News toutes les 3 h",
      wikipedia: "Les pages réécrites à toute vitesse",
      bluesky: "Pics sur le webtoon, le manga et la BD",
      crypto: "BTC, ETH et SOL : 2 % en 1 h",
    },
    sources: {
      bluesky: "Publications Bluesky",
      wikipedia: "Modifications Wikipédia",
      crypto: "Cours des cryptos",
    },
    status: {
      running: "En marche",
      paused: "En pause",
      lastRun: "Dernier passage {when}",
      notScheduled:
        "Les passages planifiés ne sont pas configurés sur ce serveur : cette machine ne fonctionne que lorsque vous écoutez ici.",
    },
    wire: {
      title: "Fil en direct",
      hint: "Écoutez le flux dans cet onglet, avec le filtre de cette machine. L’écoute est gratuite.",
      listen: "Écouter",
      stop: "Arrêter",
      connecting: "Connexion…",
      failed: "Le flux est injoignable pour le moment.",
      heard: "{heard} reçus, {matched} retenus",
      quiet: "Rien n’a été retenu pour l’instant.",
      fired: "Ça mérite un post",
      write: "Rédiger un brouillon",
      passed: "Le rédacteur a laissé passer celui-ci.",
    },
    platforms: {
      bluesky: "Bluesky",
      twitter: "X",
      threads: "Threads",
      linkedin: "LinkedIn",
      instagram: "Instagram",
    },
    feeds: {
      rss: "Flux RSS",
      news: "Recherche d’actualités",
      hackernews: "Une de Hacker News",
      tiktok: "Recherche TikTok",
      youtube: "Recherche YouTube",
    },
    posts: {
      blocked: "Arrêté par le contrôle éditorial",
      blockedReason: "Impossible d’approuver : {reason}",
      takeDropped: "Le commentaire a été retiré : {reason}",
      take: "Commentaire : {take}",
      retracted: "Retiré",
      retract: "Retirer",
      retractManual:
        "Instagram ne permet pas le retrait depuis ici. Supprimez le post là-bas vous-même.",
      removed: "Retiré",
      byHand: "À supprimer à la main",
      retractLeft:
        "{n} à supprimer à la main : le service n’a pas pu les retirer.",
      expired: "Expiré",
      halted:
        "La publication est suspendue pour le moment. Rien n'a été envoyé : réessayez plus tard.",
      title: "Posts",
      waiting: "En attente de vous",
      queued: "En file",
      publishing: "Publication…",
      failed: "Non publié",
      published: "Publié",
      text: "Texte du post",
      held: "Retenu pour vous : {reason}",
      view: "Voir le post",
      sent: "Envoyé",
      approve: "Publier",
      retry: "Réessayer",
    },
    inbox: { title: "Ce qu’elle a entendu", used: "Utilisé" },
    agent: {
      mission: "Mission",
      missionHint:
        "Ce que ce média couvre et ce qu’il doit ignorer. L’agent s’y tient à chaque passage.",
      feeds: "Sources",
      feedsHint:
        "Lues à chaque passage, avec le flux en direct s’il est activé.",
      feedKind: "Type de source",
      feedUrl: "Adresse du flux",
      feedQuery: "Rechercher",
      removeFeed: "Retirer la source",
      addFeed: "Ajouter une source",
      every: "Lire toutes les",
      everyHint:
        "Chaque passage avec du nouveau coûte {cost} crédit, même si l’agent décide de ne rien publier.",
      minutes: "{n} minutes",
      hours: "{n} h",
      listen: "Écouter aussi {stream}",
    },
    out: {
      title: "Où elle publie",
      public: "Page publique avec flux RSS",
      connect: "Connecter {platform}",
      blueskyHandle: "Identifiant Bluesky",
      blueskyPassword: "Mot de passe d’application Bluesky",
      connectBluesky: "Connecter Bluesky",
      blueskyFailed:
        "Cet identifiant et ce mot de passe d’application n’ont pas fonctionné.",
      instagramNeedsImage:
        "Instagram n’accepte que les posts avec une image : activez les images, sinon il sera ignoré.",
      image: "Dessiner une image pour chaque post",
      imageHint: "{cost} crédits par image.",
      imageOff:
        "Les images nécessitent une connexion OpenRouter sur ce serveur.",
      story: "Enquêter à fond sur ce qu’elle publie",
      storyHint:
        "{story} crédits par Story, {format} par format, une Story par jour. Les formats attendent dans Médias. LinkedIn devient aussi un brouillon soumis au réglage de publication.",
      mode: "Publication",
      review: "Relire chaque post",
      auto: "Publier automatiquement",
      reviewHint: "Les posts attendent ici que vous les publiiez.",
      autoHint:
        "Les posts partent sans vous. Un post vous est tout de même soumis s’il cite un chiffre absent de ses sources.",
      confirmTitle: "Publier sans relecture ?",
      confirmBody:
        "Cette machine publiera sur vos comptes en votre nom, jour et nuit, jusqu’à ce que vous l’arrêtiez. L’IA peut se tromper, et vous êtes responsable de ce qu’elle publie.",
      confirm: "Publier automatiquement",
    },
    page: {
      stance: "Position",
      publisher: "Éditeur",
      contact: "Contact",
      arena: "S’adresse à",
      aiWritten: "Écrit par une IA",
      changed: "Passé de {from} à {to} le {date}",
      declared: "{to} déclaré le {date}",
      removed: "Position retirée le {date}",
      retracted: "Retiré le {date}. {reason}.",
      take: "Commentaire",
      changes: "Historique de la position",
      byline: "Écrit et publié par un agent IA.",
      rss: "RSS",
      empty: "Rien de publié pour l’instant.",
    },
    drafts: {
      title: "Brouillons",
      empty:
        "Les brouillons apparaissent ici quand cette machine trouve quelque chose.",
      copy: "Copier le texte",
      copied: "Copié",
      comic: "Créer la BD",
      open: "Ouvrir la BD",
      dismiss: "Écarter",
      source: "Source",
      plain:
        "Rédigé à partir des données brutes, car aucun rédacteur IA n’est disponible pour ce brouillon.",
    },
    form: {
      title: "Réglages",
      name: "Nom",
      source: "Flux",
      keywords: "Mots-clés",
      keywordsHint: "Séparés par des virgules. Un seul suffit.",
      assets: "Actifs",
      assetsHint: "Symboles Coinbase, séparés par des virgules.",
      anyArticle: "Laissez vide pour surveiller tous les articles.",
      exclude: "Exclure",
      thresholdCount: "Occurrences requises",
      thresholdMove: "Variation requise (%)",
      window: "En (minutes)",
      cooldown: "Pause après déclenchement (minutes)",
      cap: "Brouillons planifiés par jour",
      capHint: "Au maximum ce nombre de posts par jour.",
      maxCredits: "Crédits maximum par jour",
      maxCreditsHint:
        "Au-delà, la machine continue d'écouter et ne dépense plus jusqu'au prochain jour UTC.",
      voice: "Public et ton",
      voicePlaceholder: "À qui ça s’adresse, et sur quel ton ?",
      language: "Langue",
      save: "Enregistrer",
      saved: "Enregistré. Elle repart à zéro au prochain passage.",
      delete: "Supprimer la machine",
    },
    delete: {
      title: "Supprimer {name} ?",
      body: "Ses brouillons disparaissent aussi. Les BD déjà créées restent dans vos projets.",
      cancel: "Annuler",
    },
    measure: {
      count: "{count} en {minutes} min",
      move: "{change} % en {minutes} min",
    },
    labs: {
      title: "Labo",
      nav: "Des fonctionnalités encore à l’essai.",
      machines: "Studio",
      machinesHint:
        "Kits de marque, veille publicitaire, tendances et machines à contenu qui deviennent des BD. Désactiver cette option arrête toutes les machines.",
      open: "Ouvrir Studio",
    },
    stances: {
      "far-left": "Extrême gauche",
      left: "Gauche",
      center: "Centre",
      right: "Droite",
      "far-right": "Extrême droite",
    },
    styles: { plain: "Neutre", deadpan: "Pince-sans-rire", wry: "Ironique" },
    arenas: { fr: "France", us: "États-Unis" },
    scrutiny: {
      government: "Le gouvernement",
      regulators: "Les régulateurs",
      large_employers: "Les grands employeurs",
      banks: "Les banques",
      large_landlords: "Les grands propriétaires",
      public_spending: "La dépense publique",
      tech_platforms: "Les plateformes tech",
    },
    retractReasons: {
      error: "Il contenait une erreur",
      source: "Sa source n’a pas tenu",
      standards: "Il ne respectait pas nos règles",
      owner: "L’éditeur l’a retiré",
    },
    line: {
      title: "Ligne éditoriale",
      hint: "Une position publique, facultative. Elle apparaît sur la page et dans le flux de cette machine, et chaque post passe les mêmes limites, quelle que soit la position.",
      stance: "Position",
      none: "Aucune position",
      arena: "S’adresse à",
      publisher: "Éditeur",
      publisherHint:
        "La personne ou l’organisation qui répond de ce média. Affiché publiquement.",
      contact: "Contact public",
      contactHint: "Une adresse e-mail ou un lien https. Affiché publiquement.",
      scrutiny: "Regarder de plus près",
      scrutinyHint:
        "Jusqu’à {n}. Cela classe ce que l’agent lit et ne prouve rien.",
      style: "Style",
      styleWithStance:
        "La position décide de ce que défend le commentaire, le style de la façon dont il sonne. Le post lui-même reste un fait brut.",
      styleAlone:
        "Le post reste un fait brut et la blague va dans le commentaire. Un commentaire qui échoue à un contrôle est retiré, et le post part sans lui.",
      styleLimits:
        "Les machines drôles laissent de côté les particuliers, les catastrophes et les blessures. On ne rit jamais d’une victime.",
      review:
        "Une position commence en relecture. Le mode automatique s’ouvre après {n} posts publiés sous cette position, sans aucun blocage depuis 14 jours.",
      far: "Une position extrême est toujours relue par une personne et ne publie jamais seule.",
      off: "Avec une position, cette machine garde une page publique, ne dessine pas d’images, ne crée pas de Stories et ne publie pas sur Instagram. Elle a besoin de Claude : une connexion OpenRouter ne peut pas la payer.",
      cooldown:
        "Dès qu’un post est sorti, la position ne peut plus changer pendant {days} jours, et chaque changement apparaît sur la page publique.",
      oneStance: "Un compte a une seule position pour toutes ses machines.",
      calendar:
        "Une machine à ligne ne tourne que si l’équipe a relu le calendrier électoral, et s’arrête pendant les périodes électorales.",
      checklist: "Avant la mise en ligne, sur chaque compte",
      checks: {
        bluesky:
          "Bluesky : ajoutez le label bot et indiquez qui gère le compte dans la bio.",
        twitter:
          "X : activez le label Automated et nommez le compte gestionnaire.",
        threads:
          "Threads : indiquez dans la bio que le compte est écrit par une IA et qui le gère.",
        linkedin:
          "LinkedIn : indiquez dans le résumé que la page est écrite par une IA et qui la gère.",
        instagram:
          "Instagram : les posts portent le label IA ; indiquez dans la bio qui gère le compte.",
      },
    },
    notices: {
      frozen:
        "Cette ligne est en pause pour une période électorale. Rien ne tourne ni ne sort avant la fin.",
      no_calendar:
        "Cette ligne ne peut pas tourner : personne n’a relu le calendrier électoral de ce territoire.",
      not_public: "Cette ligne ne peut pas publier sans sa page publique.",
      no_desk:
        "Les positions et les styles drôles ont besoin de Claude : cette machine ne tourne pas sur une connexion OpenRouter.",
      budget:
        "Cette machine a atteint sa limite de crédits du jour. Elle écoute toujours et reprend demain (UTC).",
      unreadable:
        "Ces flux ont répondu, mais aucune entrée n'est exploitable : {feeds}",
    },
    dismissReasons: {
      none: "Sans raison particulière",
      wrong: "C'est faux",
      dull: "Sans intérêt",
      repeat: "Déjà traité",
      tone: "Mauvais ton",
    },
    errors: {
      one_stance:
        "Une autre de vos machines a une position différente. Un compte n’en a qu’une.",
      cooldown:
        "Cette position a changé trop récemment. Elle pourra changer après 30 jours.",
      review_first: "Cette machine doit rester en relecture pour l’instant.",
      line_rules:
        "Une machine à ligne a besoin de sa page publique, et une position extrême doit rester en relecture.",
      no_desk:
        "Les positions et les styles drôles ont besoin de Claude : ils ne tournent pas sur une connexion OpenRouter.",
      no_wire:
        "Une machine avec une position ou un style drôle n’écrit que selon son planning.",
      generic: "Une erreur est survenue. Réessayez.",
      credits: "Vous n’avez pas assez de crédits pour ce brouillon.",
    },
  },
  es: {
    meta: "Máquinas de contenido",
    title: "Máquinas de contenido",
    intro:
      "Cada máquina es un pequeño medio. Lee tus fuentes de forma programada, su agente elige lo que merece decirse y las publicaciones salen a tus cuentas, con o sin tu revisión.",
    create: "Nueva máquina",
    limit: "Has alcanzado el límite de {n} máquinas.",
    empty: {
      title: "Aún no hay máquinas",
      text: "Empieza con una plantilla y ajusta lo que escucha.",
    },
    presets: {
      newsroom: "Noticias flash sobre IA",
      hackernews: "Lo que leen los builders",
      wikipedia: "Última hora en Wikipedia",
      bluesky: "Cómics en Bluesky",
      crypto: "Saltos de precio cripto",
    },
    presetHints: {
      newsroom: "Noticias de IA en cuanto salen",
      hackernews: "Lo mejor de Hacker News cada 3 h",
      wikipedia: "Páginas que se reescriben a toda prisa",
      bluesky: "Picos sobre webtoon, manga y cómic",
      crypto: "BTC, ETH y SOL: 2 % en 1 h",
    },
    sources: {
      bluesky: "Publicaciones de Bluesky",
      wikipedia: "Ediciones de Wikipedia",
      crypto: "Precios cripto",
    },
    status: {
      running: "En marcha",
      paused: "En pausa",
      lastRun: "Última ejecución {when}",
      notScheduled:
        "Las ejecuciones programadas no están configuradas en este servidor, así que esta máquina solo funciona mientras escuchas aquí.",
    },
    wire: {
      title: "Directo",
      hint: "Escucha el flujo en esta pestaña, con el filtro de esta máquina. Escuchar es gratis.",
      listen: "Escuchar",
      stop: "Detener",
      connecting: "Conectando…",
      failed: "Ahora mismo no se puede acceder al flujo.",
      heard: "{heard} recibidos, {matched} coinciden",
      quiet: "Aún no ha coincidido nada.",
      fired: "Merece un post",
      write: "Escribir un borrador",
      passed: "El redactor ha descartado este.",
    },
    platforms: {
      bluesky: "Bluesky",
      twitter: "X",
      threads: "Threads",
      linkedin: "LinkedIn",
      instagram: "Instagram",
    },
    feeds: {
      rss: "Feed RSS",
      news: "Búsqueda de noticias",
      hackernews: "Portada de Hacker News",
      tiktok: "Búsqueda en TikTok",
      youtube: "Búsqueda en YouTube",
    },
    posts: {
      blocked: "Detenido por el control editorial",
      blockedReason: "No se puede aprobar: {reason}",
      takeDropped: "Se quitó el comentario: {reason}",
      take: "Comentario: {take}",
      retracted: "Retirado",
      retract: "Retirar",
      retractManual:
        "Instagram no permite retirar desde aquí. Borra tú el post allí.",
      removed: "Retirado",
      byHand: "Borrar a mano",
      retractLeft: "Borra {n} a mano: el servicio no pudo retirarlos.",
      expired: "Caducado",
      halted:
        "La publicación está en pausa por ahora. No se ha enviado nada: inténtalo más tarde.",
      title: "Publicaciones",
      waiting: "Esperándote",
      queued: "En cola",
      publishing: "Publicando…",
      failed: "No publicado",
      published: "Publicado",
      text: "Texto de la publicación",
      held: "Retenido para ti: {reason}",
      view: "Ver publicación",
      sent: "Enviado",
      approve: "Publicar",
      retry: "Reintentar",
    },
    inbox: { title: "Lo que ha oído", used: "Usado" },
    agent: {
      mission: "Misión",
      missionHint:
        "Qué cubre este medio y qué debe ignorar. El agente lo sigue en cada ejecución.",
      feeds: "Fuentes",
      feedsHint:
        "Se leen en cada ejecución, junto con el flujo en directo si está activado.",
      feedKind: "Tipo de fuente",
      feedUrl: "Dirección del feed",
      feedQuery: "Buscar",
      removeFeed: "Quitar fuente",
      addFeed: "Añadir una fuente",
      every: "Leer cada",
      everyHint:
        "Cada ejecución con novedades cuesta {cost} crédito, aunque el agente decida no publicar nada.",
      minutes: "{n} minutos",
      hours: "{n} h",
      listen: "Escuchar también {stream}",
    },
    out: {
      title: "Dónde publica",
      public: "Página pública con feed RSS",
      connect: "Conectar {platform}",
      blueskyHandle: "Usuario de Bluesky",
      blueskyPassword: "Contraseña de aplicación de Bluesky",
      connectBluesky: "Conectar Bluesky",
      blueskyFailed:
        "Ese usuario y contraseña de aplicación no han funcionado.",
      instagramNeedsImage:
        "Instagram solo admite publicaciones con imagen: activa las imágenes o se omitirá.",
      image: "Dibujar una imagen para cada publicación",
      imageHint: "{cost} créditos por imagen.",
      imageOff:
        "Las imágenes necesitan una conexión de OpenRouter en este servidor.",
      story: "Investigar a fondo lo que publica",
      storyHint:
        "{story} créditos por Story, {format} por formato, una Story al día. Los formatos esperan en Medios. LinkedIn también se convierte en un borrador que sigue el ajuste de publicación.",
      mode: "Publicación",
      review: "Revisar cada publicación",
      auto: "Publicar automáticamente",
      reviewHint: "Las publicaciones esperan aquí hasta que las publiques.",
      autoHint:
        "Las publicaciones salen sin ti. Aun así, se retiene la que cite una cifra que no esté en sus fuentes.",
      confirmTitle: "¿Publicar sin revisión?",
      confirmBody:
        "Esta máquina publicará en tus cuentas en tu nombre, a todas horas, hasta que la detengas. La IA puede equivocarse, y eres responsable de lo que publique.",
      confirm: "Publicar automáticamente",
    },
    page: {
      stance: "Postura",
      publisher: "Editor",
      contact: "Contacto",
      arena: "Se dirige a",
      aiWritten: "Escrito por IA",
      changed: "Cambió de {from} a {to} el {date}",
      declared: "{to} declarada el {date}",
      removed: "Postura retirada el {date}",
      retracted: "Retirado el {date}. {reason}.",
      take: "Comentario",
      changes: "Historial de la postura",
      byline: "Escrito y publicado por un agente de IA.",
      rss: "RSS",
      empty: "Aún no hay nada publicado.",
    },
    drafts: {
      title: "Borradores",
      empty: "Los borradores aparecen aquí cuando esta máquina encuentra algo.",
      copy: "Copiar texto",
      copied: "Copiado",
      comic: "Crear el cómic",
      open: "Abrir el cómic",
      dismiss: "Descartar",
      source: "Fuente",
      plain:
        "Escrito con los datos en bruto, porque no hay un redactor de IA disponible para este borrador.",
    },
    form: {
      title: "Ajustes",
      name: "Nombre",
      source: "Flujo",
      keywords: "Palabras clave",
      keywordsHint: "Separadas por comas. Basta con una.",
      assets: "Activos",
      assetsHint: "Símbolos de Coinbase, separados por comas.",
      anyArticle: "Déjalo vacío para vigilar todos los artículos.",
      exclude: "Excluir",
      thresholdCount: "Coincidencias necesarias",
      thresholdMove: "Variación necesaria (%)",
      window: "En (minutos)",
      cooldown: "Pausa tras activarse (minutos)",
      cap: "Borradores programados al día",
      capHint: "Como máximo este número de publicaciones al día.",
      maxCredits: "Máximo de créditos al día",
      maxCreditsHint:
        "A partir de aquí, la máquina sigue escuchando y deja de gastar hasta el siguiente día UTC.",
      voice: "Público y tono",
      voicePlaceholder: "¿Para quién es y cómo debe sonar?",
      language: "Idioma",
      save: "Guardar",
      saved: "Guardado. Empieza de cero en la próxima ejecución.",
      delete: "Eliminar máquina",
    },
    delete: {
      title: "¿Eliminar {name}?",
      body: "También se borran sus borradores. Los cómics ya creados siguen en tus proyectos.",
      cancel: "Cancelar",
    },
    measure: {
      count: "{count} en {minutes} min",
      move: "{change} % en {minutes} min",
    },
    labs: {
      title: "Labs",
      nav: "Funciones todavía en prueba.",
      machines: "Studio",
      machinesHint:
        "Kits de marca, análisis de anuncios, tendencias y máquinas de contenido que se convierten en cómics. Al desactivarlo se detienen todas las máquinas.",
      open: "Abrir Studio",
    },
    stances: {
      "far-left": "Extrema izquierda",
      left: "Izquierda",
      center: "Centro",
      right: "Derecha",
      "far-right": "Extrema derecha",
    },
    styles: { plain: "Sobrio", deadpan: "Humor seco", wry: "Irónico" },
    arenas: { fr: "Francia", us: "Estados Unidos" },
    scrutiny: {
      government: "El gobierno",
      regulators: "Los reguladores",
      large_employers: "Las grandes empresas",
      banks: "Los bancos",
      large_landlords: "Los grandes propietarios",
      public_spending: "El gasto público",
      tech_platforms: "Las plataformas tecnológicas",
    },
    retractReasons: {
      error: "Contenía un error",
      source: "Su fuente no se sostuvo",
      standards: "No cumplía nuestras normas",
      owner: "El editor lo retiró",
    },
    line: {
      title: "Línea editorial",
      hint: "Una postura pública opcional. Aparece en la página y el feed de esta máquina, y cada post pasa los mismos límites en cualquier postura.",
      stance: "Postura",
      none: "Sin postura",
      arena: "Se dirige a",
      publisher: "Editor",
      publisherHint:
        "La persona u organización que responde por este medio. Se muestra en público.",
      contact: "Contacto público",
      contactHint: "Un correo o un enlace https. Se muestra en público.",
      scrutiny: "Mirar más de cerca",
      scrutinyHint:
        "Hasta {n}. Esto ordena lo que lee el agente y no demuestra nada.",
      style: "Estilo",
      styleWithStance:
        "La postura decide qué defiende el comentario, y el estilo cómo suena. El post sigue siendo un hecho sin más.",
      styleAlone:
        "El post sigue siendo un hecho sin más y la broma va en el comentario. Un comentario que no pasa un control se quita, y el post sale sin él.",
      styleLimits:
        "Las máquinas de humor descartan a particulares, desastres y lesiones. Nadie herido es nunca la broma.",
      review:
        "Una postura empieza en revisión. El modo automático se abre tras {n} posts publicados con esta postura, sin bloqueos en los últimos 14 días.",
      far: "Una postura extrema siempre la revisa una persona y nunca publica sola.",
      off: "Con una postura, esta máquina mantiene una página pública, no dibuja imágenes, no crea Stories y no publica en Instagram. Necesita Claude, así que una conexión de OpenRouter no puede pagarla.",
      cooldown:
        "Cuando sale un post, la postura no puede cambiar durante {days} días, y cada cambio aparece en la página pública.",
      oneStance: "Una cuenta tiene una sola postura en todas sus máquinas.",
      calendar:
        "Una máquina con línea solo funciona si el equipo ha revisado el calendario electoral, y se detiene durante los periodos electorales.",
      checklist: "Antes de publicar, en cada cuenta",
      checks: {
        bluesky:
          "Bluesky: añade la etiqueta de bot e indica en la bio quién lleva la cuenta.",
        twitter:
          "X: activa la etiqueta Automated y nombra la cuenta responsable.",
        threads:
          "Threads: indica en la bio que la cuenta la escribe una IA y quién la lleva.",
        linkedin:
          "LinkedIn: indica en el resumen que la página la escribe una IA y quién la lleva.",
        instagram:
          "Instagram: los posts llevan la etiqueta de IA; indica en la bio quién lleva la cuenta.",
      },
    },
    notices: {
      frozen:
        "Esta línea está en pausa por un periodo electoral. Nada funciona ni se publica hasta que termine.",
      no_calendar:
        "Esta línea no puede funcionar: nadie ha revisado el calendario electoral de su territorio.",
      not_public: "Esta línea no puede publicar sin su página pública.",
      no_desk:
        "Las posturas y los estilos de humor necesitan Claude, así que esta máquina no funciona con una conexión de OpenRouter.",
      budget:
        "Esta máquina ha alcanzado su límite diario de créditos. Sigue escuchando y volverá mañana (UTC).",
      unreadable:
        "Estos feeds respondieron, pero ninguna entrada se pudo usar: {feeds}",
    },
    dismissReasons: {
      none: "Sin motivo concreto",
      wrong: "Es incorrecto",
      dull: "No es interesante",
      repeat: "Ya lo cubrimos",
      tone: "Tono equivocado",
    },
    errors: {
      one_stance:
        "Otra de tus máquinas tiene una postura distinta. Una cuenta solo tiene una.",
      cooldown:
        "Esta postura cambió hace muy poco. Podrá cambiar pasados 30 días.",
      review_first: "Esta máquina debe seguir en revisión por ahora.",
      line_rules:
        "Una máquina con línea necesita su página pública, y una postura extrema debe seguir en revisión.",
      no_desk:
        "Las posturas y los estilos de humor necesitan Claude, así que no funcionan con una conexión de OpenRouter.",
      no_wire:
        "Una máquina con postura o estilo de humor solo escribe según su horario.",
      generic: "Algo ha fallado. Inténtalo de nuevo.",
      credits: "No tienes créditos suficientes para este borrador.",
    },
  },
  de: {
    meta: "Content-Maschinen",
    title: "Content-Maschinen",
    intro:
      "Jede Maschine ist ein kleines Medium. Sie liest deine Quellen nach Zeitplan, ihr Agent wählt aus, was sich zu sagen lohnt, und Beiträge gehen an deine Konten, mit oder ohne deine Prüfung.",
    create: "Neue Maschine",
    limit: "Du hast das Limit von {n} Maschinen erreicht.",
    empty: {
      title: "Noch keine Maschinen",
      text: "Starte mit einer Vorlage und stelle dann ein, worauf sie hört.",
    },
    presets: {
      newsroom: "Ein Eilmeldungs-Konto zu KI",
      hackernews: "Was Builder gerade lesen",
      wikipedia: "Eilmeldungen auf Wikipedia",
      bluesky: "Comics auf Bluesky",
      crypto: "Krypto-Kurssprünge",
    },
    presetHints: {
      newsroom: "Frische KI-News, sobald sie erscheinen",
      hackernews: "Top-Thema auf Hacker News, alle 3 Std.",
      wikipedia: "Seiten, die rasant neu entstehen",
      bluesky: "Spitzen bei Webtoon und Manga",
      crypto: "BTC, ETH und SOL: 2 % in 1 Std.",
    },
    sources: {
      bluesky: "Bluesky-Beiträge",
      wikipedia: "Wikipedia-Bearbeitungen",
      crypto: "Krypto-Kurse",
    },
    status: {
      running: "Läuft",
      paused: "Pausiert",
      lastRun: "Letzter Lauf {when}",
      notScheduled:
        "Geplante Läufe sind auf diesem Server nicht eingerichtet, daher arbeitet diese Maschine nur, während du hier zuhörst.",
    },
    wire: {
      title: "Live-Ticker",
      hint: "Höre den Stream in diesem Tab mit dem Filter dieser Maschine. Zuhören ist kostenlos.",
      listen: "Zuhören",
      stop: "Stoppen",
      connecting: "Verbinde…",
      failed: "Der Stream ist gerade nicht erreichbar.",
      heard: "{heard} empfangen, {matched} passend",
      quiet: "Noch nichts Passendes.",
      fired: "Einen Post wert",
      write: "Entwurf schreiben",
      passed: "Der Texter hat das ausgelassen.",
    },
    platforms: {
      bluesky: "Bluesky",
      twitter: "X",
      threads: "Threads",
      linkedin: "LinkedIn",
      instagram: "Instagram",
    },
    feeds: {
      rss: "RSS-Feed",
      news: "Nachrichtensuche",
      hackernews: "Hacker-News-Startseite",
      tiktok: "TikTok-Suche",
      youtube: "YouTube-Suche",
    },
    posts: {
      blocked: "Von der Standards-Prüfung gestoppt",
      blockedReason: "Kann nicht freigegeben werden: {reason}",
      takeDropped: "Der Kommentar wurde weggelassen: {reason}",
      take: "Kommentar: {take}",
      retracted: "Zurückgezogen",
      retract: "Zurückziehen",
      retractManual:
        "Instagram lässt sich von hier nicht zurückziehen. Lösche den Post dort selbst.",
      removed: "Entfernt",
      byHand: "Von Hand löschen",
      retractLeft:
        "{n} von Hand löschen: Der Dienst konnte sie nicht entfernen.",
      expired: "Abgelaufen",
      halted:
        "Das Veröffentlichen ist gerade pausiert. Es wurde nichts gesendet, versuche es später noch einmal.",
      title: "Beiträge",
      waiting: "Wartet auf dich",
      queued: "In der Warteschlange",
      publishing: "Wird veröffentlicht…",
      failed: "Nicht veröffentlicht",
      published: "Veröffentlicht",
      text: "Beitragstext",
      held: "Für dich zurückgehalten: {reason}",
      view: "Beitrag ansehen",
      sent: "Gesendet",
      approve: "Veröffentlichen",
      retry: "Erneut versuchen",
    },
    inbox: { title: "Was sie gehört hat", used: "Verwendet" },
    agent: {
      mission: "Auftrag",
      missionHint:
        "Worüber dieses Medium berichtet und was es auslässt. Der Agent hält sich bei jedem Lauf daran.",
      feeds: "Quellen",
      feedsHint:
        "Werden bei jedem Lauf gelesen, zusammen mit dem Live-Stream, falls aktiv.",
      feedKind: "Quellentyp",
      feedUrl: "Feed-Adresse",
      feedQuery: "Suchen nach",
      removeFeed: "Quelle entfernen",
      addFeed: "Quelle hinzufügen",
      every: "Lesen alle",
      everyHint:
        "Jeder Lauf mit Neuem kostet {cost} Credit, auch wenn der Agent nichts veröffentlicht.",
      minutes: "{n} Minuten",
      hours: "{n} Std.",
      listen: "Auch {stream} zuhören",
    },
    out: {
      title: "Wo sie veröffentlicht",
      public: "Öffentliche Seite mit RSS-Feed",
      connect: "{platform} verbinden",
      blueskyHandle: "Bluesky-Handle",
      blueskyPassword: "Bluesky-App-Passwort",
      connectBluesky: "Bluesky verbinden",
      blueskyFailed: "Dieses Handle und App-Passwort haben nicht funktioniert.",
      instagramNeedsImage:
        "Instagram nimmt nur Beiträge mit Bild an. Aktiviere Bilder, sonst wird es übersprungen.",
      image: "Für jeden Beitrag ein Bild zeichnen",
      imageHint: "{cost} Credits pro Bild.",
      imageOff: "Bilder brauchen auf diesem Server eine OpenRouter-Verbindung.",
      story: "Aus ihren Posts eine ganze Story recherchieren",
      storyHint:
        "{story} Credits pro Story, {format} pro Format, eine Story pro Tag. Formate warten unter Medien. LinkedIn wird außerdem zu einem Entwurf, der der Veröffentlichungseinstellung folgt.",
      mode: "Veröffentlichung",
      review: "Jeden Beitrag prüfen",
      auto: "Automatisch posten",
      reviewHint: "Beiträge warten hier, bis du sie veröffentlichst.",
      autoHint:
        "Beiträge gehen ohne dich raus. Zurückgehalten wird einer nur, wenn er eine Zahl nennt, die nicht in seinen Quellen steht.",
      confirmTitle: "Ohne Prüfung posten?",
      confirmBody:
        "Diese Maschine veröffentlicht rund um die Uhr unter deinem Namen auf deinen Konten, bis du sie stoppst. KI kann Fehler machen, und du bist für ihre Beiträge verantwortlich.",
      confirm: "Automatisch posten",
    },
    page: {
      stance: "Haltung",
      publisher: "Herausgeber",
      contact: "Kontakt",
      arena: "Richtet sich an",
      aiWritten: "Von KI geschrieben",
      changed: "Am {date} von {from} zu {to} geändert",
      declared: "{to} erklärt am {date}",
      removed: "Haltung entfernt am {date}",
      retracted: "Zurückgezogen am {date}. {reason}.",
      take: "Kommentar",
      changes: "Verlauf der Haltung",
      byline: "Von einem KI-Agenten geschrieben und veröffentlicht.",
      rss: "RSS",
      empty: "Noch nichts veröffentlicht.",
    },
    drafts: {
      title: "Entwürfe",
      empty: "Entwürfe erscheinen hier, sobald diese Maschine etwas findet.",
      copy: "Text kopieren",
      copied: "Kopiert",
      comic: "Comic erstellen",
      open: "Comic öffnen",
      dismiss: "Verwerfen",
      source: "Quelle",
      plain:
        "Aus den Rohdaten geschrieben, weil für diesen Entwurf kein KI-Texter verfügbar ist.",
    },
    form: {
      title: "Einstellungen",
      name: "Name",
      source: "Stream",
      keywords: "Stichwörter",
      keywordsHint: "Durch Kommas getrennt. Eines genügt.",
      assets: "Assets",
      assetsHint: "Coinbase-Symbole, durch Kommas getrennt.",
      anyArticle: "Leer lassen, um alle Artikel zu beobachten.",
      exclude: "Ausschließen",
      thresholdCount: "Nötige Treffer",
      thresholdMove: "Nötige Bewegung (%)",
      window: "Innerhalb von (Minuten)",
      cooldown: "Ruhezeit nach dem Auslösen (Minuten)",
      cap: "Geplante Entwürfe pro Tag",
      capHint: "Höchstens so viele Beiträge pro Tag.",
      maxCredits: "Höchstens Credits pro Tag",
      maxCreditsHint:
        "Darüber hinaus hört die Maschine weiter zu und gibt bis zum nächsten UTC-Tag nichts mehr aus.",
      voice: "Zielgruppe und Ton",
      voicePlaceholder: "Für wen ist das, und wie soll es klingen?",
      language: "Sprache",
      save: "Speichern",
      saved: "Gespeichert. Beim nächsten Lauf beginnt sie neu.",
      delete: "Maschine löschen",
    },
    delete: {
      title: "{name} löschen?",
      body: "Auch die Entwürfe werden gelöscht. Bereits erstellte Comics bleiben in deinen Projekten.",
      cancel: "Abbrechen",
    },
    measure: {
      count: "{count} in {minutes} Min.",
      move: "{change} % in {minutes} Min.",
    },
    labs: {
      title: "Labs",
      nav: "Funktionen in der Testphase.",
      machines: "Studio",
      machinesHint:
        "Brand-Kits, Anzeigen-Recherche, Trends und Content-Maschinen, aus denen Comics werden. Beim Ausschalten stoppen alle Maschinen.",
      open: "Studio öffnen",
    },
    stances: {
      "far-left": "Linksaußen",
      left: "Links",
      center: "Mitte",
      right: "Rechts",
      "far-right": "Rechtsaußen",
    },
    styles: { plain: "Sachlich", deadpan: "Trocken", wry: "Ironisch" },
    arenas: { fr: "Frankreich", us: "USA" },
    scrutiny: {
      government: "Die Regierung",
      regulators: "Aufsichtsbehörden",
      large_employers: "Große Arbeitgeber",
      banks: "Banken",
      large_landlords: "Große Vermieter",
      public_spending: "Öffentliche Ausgaben",
      tech_platforms: "Tech-Plattformen",
    },
    retractReasons: {
      error: "Er enthielt einen Fehler",
      source: "Seine Quelle hielt nicht stand",
      standards: "Er entsprach nicht unseren Standards",
      owner: "Der Herausgeber hat ihn entfernt",
    },
    line: {
      title: "Redaktionelle Linie",
      hint: "Eine optionale öffentliche Haltung. Sie steht auf der Seite und im Feed dieser Maschine, und jeder Post unterliegt bei jeder Haltung denselben Grenzen.",
      stance: "Haltung",
      none: "Keine Haltung",
      arena: "Richtet sich an",
      publisher: "Herausgeber",
      publisherHint:
        "Die Person oder Organisation, die für dieses Medium einsteht. Wird öffentlich gezeigt.",
      contact: "Öffentlicher Kontakt",
      contactHint:
        "Eine E-Mail-Adresse oder ein https-Link. Wird öffentlich gezeigt.",
      scrutiny: "Genauer hinsehen bei",
      scrutinyHint:
        "Bis zu {n}. Das ordnet, was der Agent liest, und beweist nichts.",
      style: "Stil",
      styleWithStance:
        "Die Haltung bestimmt, was ein Kommentar vertritt, der Stil, wie er klingt. Der Post selbst bleibt eine nüchterne Tatsache.",
      styleAlone:
        "Der Post bleibt eine nüchterne Tatsache, der Witz steht im Kommentar. Fällt ein Kommentar bei einer Prüfung durch, geht der Post ohne ihn raus.",
      styleLimits:
        "Lustige Maschinen lassen Privatpersonen, Katastrophen und Verletzungen aus. Wer zu Schaden kam, ist nie der Witz.",
      review:
        "Eine Haltung beginnt in der Prüfung. Der Automatikmodus öffnet sich nach {n} veröffentlichten Posts unter dieser Haltung, ohne Sperre in den letzten 14 Tagen.",
      far: "Eine Außenposition wird immer von einem Menschen geprüft und veröffentlicht nie selbst.",
      off: "Mit einer Haltung behält diese Maschine eine öffentliche Seite, zeichnet keine Bilder, erstellt keine Stories und postet nicht auf Instagram. Sie braucht Claude, eine OpenRouter-Verbindung kann sie also nicht bezahlen.",
      cooldown:
        "Sobald ein Post erschienen ist, kann sich die Haltung {days} Tage lang nicht ändern, und jede Änderung steht auf der öffentlichen Seite.",
      oneStance: "Ein Konto hat über alle Maschinen hinweg eine Haltung.",
      calendar:
        "Eine Maschine mit Linie läuft nur, wenn das Team den Wahlkalender geprüft hat, und stoppt in Wahlzeiträumen.",
      checklist: "Vor dem Start, bei jedem Konto",
      checks: {
        bluesky:
          "Bluesky: Bot-Label setzen und in der Bio nennen, wer das Konto betreibt.",
        twitter:
          "X: Automated-Label aktivieren und das verwaltende Konto nennen.",
        threads:
          "Threads: in der Bio sagen, dass eine KI schreibt und wer das Konto betreibt.",
        linkedin:
          "LinkedIn: in der Beschreibung sagen, dass eine KI schreibt und wer die Seite betreibt.",
        instagram:
          "Instagram: Posts tragen das KI-Label; in der Bio nennen, wer das Konto betreibt.",
      },
    },
    notices: {
      frozen:
        "Diese Linie pausiert wegen eines Wahlzeitraums. Bis zu dessen Ende läuft und erscheint nichts.",
      no_calendar:
        "Diese Linie kann nicht laufen: Niemand hat den Wahlkalender für ihr Gebiet geprüft.",
      not_public:
        "Diese Linie kann ohne ihre öffentliche Seite nicht veröffentlichen.",
      no_desk:
        "Haltungen und lustige Stile brauchen Claude, daher läuft diese Maschine nicht über eine OpenRouter-Verbindung.",
      budget:
        "Diese Maschine hat ihr Tageslimit an Credits erreicht. Sie hört weiter zu und macht morgen (UTC) weiter.",
      unreadable:
        "Diese Feeds haben geantwortet, aber kein Eintrag war nutzbar: {feeds}",
    },
    dismissReasons: {
      none: "Kein bestimmter Grund",
      wrong: "Das stimmt nicht",
      dull: "Nicht interessant",
      repeat: "Schon behandelt",
      tone: "Falscher Ton",
    },
    errors: {
      one_stance:
        "Eine andere deiner Maschinen hat eine andere Haltung. Ein Konto hat nur eine.",
      cooldown:
        "Diese Haltung wurde erst kürzlich geändert. Sie kann nach 30 Tagen wieder geändert werden.",
      review_first: "Diese Maschine muss vorerst in der Prüfung bleiben.",
      line_rules:
        "Eine Maschine mit Linie braucht ihre öffentliche Seite, und eine Außenposition muss in der Prüfung bleiben.",
      no_desk:
        "Haltungen und lustige Stile brauchen Claude und laufen daher nicht über eine OpenRouter-Verbindung.",
      no_wire:
        "Eine Maschine mit Haltung oder lustigem Stil schreibt nur nach Zeitplan.",
      generic: "Etwas ist schiefgelaufen. Versuche es noch einmal.",
      credits: "Du hast nicht genug Credits für diesen Entwurf.",
    },
  },
  it: {
    meta: "Macchine di contenuti",
    title: "Macchine di contenuti",
    intro:
      "Ogni macchina è un piccolo media. Legge le tue fonti a intervalli regolari, il suo agente sceglie cosa vale la pena dire e i post escono sui tuoi account, con o senza la tua revisione.",
    create: "Nuova macchina",
    limit: "Hai raggiunto il limite di {n} macchine.",
    empty: {
      title: "Ancora nessuna macchina",
      text: "Parti da un modello, poi regola ciò che ascolta.",
    },
    presets: {
      newsroom: "Un account di notizie flash sull’IA",
      hackernews: "Cosa leggono i builder",
      wikipedia: "Ultime notizie su Wikipedia",
      bluesky: "Fumetti su Bluesky",
      crypto: "Sbalzi di prezzo cripto",
    },
    presetHints: {
      newsroom: "Notizie sull’IA appena escono",
      hackernews: "Il top di Hacker News ogni 3 ore",
      wikipedia: "Pagine riscritte a tutta velocità",
      bluesky: "Picchi su webtoon, manga e fumetti",
      crypto: "BTC, ETH e SOL: 2% in 1 ora",
    },
    sources: {
      bluesky: "Post di Bluesky",
      wikipedia: "Modifiche di Wikipedia",
      crypto: "Prezzi cripto",
    },
    status: {
      running: "In funzione",
      paused: "In pausa",
      lastRun: "Ultima esecuzione {when}",
      notScheduled:
        "Le esecuzioni pianificate non sono configurate su questo server, quindi questa macchina funziona solo mentre ascolti qui.",
    },
    wire: {
      title: "Diretta",
      hint: "Ascolta il flusso in questa scheda, con il filtro di questa macchina. L'ascolto è gratuito.",
      listen: "Ascolta",
      stop: "Ferma",
      connecting: "Connessione…",
      failed: "Il flusso non è raggiungibile al momento.",
      heard: "{heard} ricevuti, {matched} corrispondenti",
      quiet: "Ancora nessuna corrispondenza.",
      fired: "Merita un post",
      write: "Scrivi una bozza",
      passed: "Il redattore ha lasciato perdere questo.",
    },
    platforms: {
      bluesky: "Bluesky",
      twitter: "X",
      threads: "Threads",
      linkedin: "LinkedIn",
      instagram: "Instagram",
    },
    feeds: {
      rss: "Feed RSS",
      news: "Ricerca notizie",
      hackernews: "Prima pagina di Hacker News",
      tiktok: "Ricerca TikTok",
      youtube: "Ricerca YouTube",
    },
    posts: {
      blocked: "Fermato dal controllo editoriale",
      blockedReason: "Non si può approvare: {reason}",
      takeDropped: "Il commento è stato tolto: {reason}",
      take: "Commento: {take}",
      retracted: "Ritirato",
      retract: "Ritira",
      retractManual:
        "Instagram non si può ritirare da qui. Elimina il post direttamente lì.",
      removed: "Rimosso",
      byHand: "Da eliminare a mano",
      retractLeft:
        "{n} da eliminare a mano: il servizio non è riuscito a rimuoverli.",
      expired: "Scaduto",
      halted:
        "La pubblicazione è in pausa per ora. Non è stato inviato nulla: riprova più tardi.",
      title: "Post",
      waiting: "In attesa di te",
      queued: "In coda",
      publishing: "Pubblicazione…",
      failed: "Non pubblicato",
      published: "Pubblicato",
      text: "Testo del post",
      held: "Trattenuto per te: {reason}",
      view: "Vedi il post",
      sent: "Inviato",
      approve: "Pubblica",
      retry: "Riprova",
    },
    inbox: { title: "Cosa ha sentito", used: "Usato" },
    agent: {
      mission: "Missione",
      missionHint:
        "Cosa copre questo media e cosa deve ignorare. L’agente la segue a ogni esecuzione.",
      feeds: "Fonti",
      feedsHint:
        "Lette a ogni esecuzione, insieme al flusso in diretta se attivo.",
      feedKind: "Tipo di fonte",
      feedUrl: "Indirizzo del feed",
      feedQuery: "Cerca",
      removeFeed: "Rimuovi fonte",
      addFeed: "Aggiungi una fonte",
      every: "Leggi ogni",
      everyHint:
        "Ogni esecuzione con novità costa {cost} credito, anche se l’agente decide di non pubblicare.",
      minutes: "{n} minuti",
      hours: "{n} h",
      listen: "Ascolta anche {stream}",
    },
    out: {
      title: "Dove pubblica",
      public: "Pagina pubblica con feed RSS",
      connect: "Collega {platform}",
      blueskyHandle: "Handle Bluesky",
      blueskyPassword: "Password per app di Bluesky",
      connectBluesky: "Collega Bluesky",
      blueskyFailed:
        "Questo handle e questa password per app non hanno funzionato.",
      instagramNeedsImage:
        "Instagram accetta solo post con immagine: attiva le immagini, altrimenti verrà saltato.",
      image: "Disegna un’immagine per ogni post",
      imageHint: "{cost} crediti per immagine.",
      imageOff:
        "Le immagini richiedono una connessione OpenRouter su questo server.",
      story: "Approfondire in una Story ciò che pubblica",
      storyHint:
        "{story} crediti per Story, {format} per formato, una Story al giorno. I formati restano in Media. LinkedIn diventa anche una bozza che segue l’impostazione di pubblicazione.",
      mode: "Pubblicazione",
      review: "Rivedi ogni post",
      auto: "Pubblica automaticamente",
      reviewHint: "I post aspettano qui finché non li pubblichi.",
      autoHint:
        "I post escono senza di te. Un post viene comunque trattenuto se cita un numero assente dalle sue fonti.",
      confirmTitle: "Pubblicare senza revisione?",
      confirmBody:
        "Questa macchina pubblicherà sui tuoi account a tuo nome, giorno e notte, finché non la fermi. L’IA può sbagliare e sei responsabile di ciò che pubblica.",
      confirm: "Pubblica automaticamente",
    },
    page: {
      stance: "Posizione",
      publisher: "Editore",
      contact: "Contatto",
      arena: "Si rivolge a",
      aiWritten: "Scritto da IA",
      changed: "Passata da {from} a {to} il {date}",
      declared: "{to} dichiarata il {date}",
      removed: "Posizione rimossa il {date}",
      retracted: "Ritirato il {date}. {reason}.",
      take: "Commento",
      changes: "Storia della posizione",
      byline: "Scritto e pubblicato da un agente IA.",
      rss: "RSS",
      empty: "Ancora nessun post.",
    },
    drafts: {
      title: "Bozze",
      empty: "Le bozze compaiono qui quando questa macchina trova qualcosa.",
      copy: "Copia il testo",
      copied: "Copiato",
      comic: "Crea il fumetto",
      open: "Apri il fumetto",
      dismiss: "Scarta",
      source: "Fonte",
      plain:
        "Scritta dai dati grezzi, perché per questa bozza non è disponibile un redattore IA.",
    },
    form: {
      title: "Impostazioni",
      name: "Nome",
      source: "Flusso",
      keywords: "Parole chiave",
      keywordsHint: "Separate da virgole. Ne basta una.",
      assets: "Asset",
      assetsHint: "Simboli Coinbase, separati da virgole.",
      anyArticle: "Lascia vuoto per osservare tutti gli articoli.",
      exclude: "Escludi",
      thresholdCount: "Corrispondenze necessarie",
      thresholdMove: "Variazione necessaria (%)",
      window: "Entro (minuti)",
      cooldown: "Pausa dopo l'attivazione (minuti)",
      cap: "Bozze pianificate al giorno",
      capHint: "Al massimo questo numero di post al giorno.",
      maxCredits: "Crediti massimi al giorno",
      maxCreditsHint:
        "Oltre questa soglia la macchina continua ad ascoltare e smette di spendere fino al giorno UTC successivo.",
      voice: "Pubblico e tono",
      voicePlaceholder: "A chi è rivolto e come deve suonare?",
      language: "Lingua",
      save: "Salva",
      saved: "Salvato. Riparte da zero alla prossima esecuzione.",
      delete: "Elimina macchina",
    },
    delete: {
      title: "Eliminare {name}?",
      body: "Anche le bozze vengono eliminate. I fumetti già creati restano nei tuoi progetti.",
      cancel: "Annulla",
    },
    measure: {
      count: "{count} in {minutes} min",
      move: "{change}% in {minutes} min",
    },
    labs: {
      title: "Labs",
      nav: "Funzioni ancora in prova.",
      machines: "Studio",
      machinesHint:
        "Kit del brand, analisi degli annunci, tendenze e macchine di contenuti che diventano fumetti. Disattivandolo si fermano tutte le macchine.",
      open: "Apri Studio",
    },
    stances: {
      "far-left": "Estrema sinistra",
      left: "Sinistra",
      center: "Centro",
      right: "Destra",
      "far-right": "Estrema destra",
    },
    styles: { plain: "Sobrio", deadpan: "Impassibile", wry: "Ironico" },
    arenas: { fr: "Francia", us: "Stati Uniti" },
    scrutiny: {
      government: "Il governo",
      regulators: "Le autorità di controllo",
      large_employers: "I grandi datori di lavoro",
      banks: "Le banche",
      large_landlords: "I grandi proprietari",
      public_spending: "La spesa pubblica",
      tech_platforms: "Le piattaforme tech",
    },
    retractReasons: {
      error: "Conteneva un errore",
      source: "La sua fonte non ha retto",
      standards: "Non rispettava i nostri standard",
      owner: "L’editore l’ha rimosso",
    },
    line: {
      title: "Linea editoriale",
      hint: "Una posizione pubblica facoltativa. Compare sulla pagina e nel feed di questa macchina, e ogni post rispetta gli stessi limiti in ogni posizione.",
      stance: "Posizione",
      none: "Nessuna posizione",
      arena: "Si rivolge a",
      publisher: "Editore",
      publisherHint:
        "La persona o l’organizzazione che risponde di questa testata. Mostrato pubblicamente.",
      contact: "Contatto pubblico",
      contactHint:
        "Un indirizzo email o un link https. Mostrato pubblicamente.",
      scrutiny: "Guardare più da vicino",
      scrutinyHint:
        "Fino a {n}. Ordina ciò che l’agente legge e non prova nulla.",
      style: "Stile",
      styleWithStance:
        "La posizione decide cosa sostiene il commento, lo stile come suona. Il post resta un fatto asciutto.",
      styleAlone:
        "Il post resta un fatto asciutto e la battuta va nel commento. Un commento che non supera un controllo viene tolto, e il post esce senza.",
      styleLimits:
        "Le macchine comiche lasciano stare privati, disastri e infortuni. Chi si è fatto male non è mai la battuta.",
      review:
        "Una posizione parte in revisione. La modalità automatica si apre dopo {n} post pubblicati con questa posizione, senza blocchi negli ultimi 14 giorni.",
      far: "Una posizione estrema è sempre rivista da una persona e non pubblica mai da sola.",
      off: "Con una posizione, questa macchina mantiene una pagina pubblica, non disegna immagini, non crea Stories e non pubblica su Instagram. Ha bisogno di Claude, quindi una connessione OpenRouter non può pagarla.",
      cooldown:
        "Quando esce un post, la posizione non può cambiare per {days} giorni, e ogni cambio compare sulla pagina pubblica.",
      oneStance: "Un account ha una sola posizione su tutte le macchine.",
      calendar:
        "Una macchina con linea funziona solo se il team ha rivisto il calendario elettorale, e si ferma nei periodi elettorali.",
      checklist: "Prima di uscire, su ogni account",
      checks: {
        bluesky:
          "Bluesky: aggiungi l’etichetta bot e indica nella bio chi gestisce l’account.",
        twitter:
          "X: attiva l’etichetta Automated e indica l’account responsabile.",
        threads:
          "Threads: indica nella bio che l’account è scritto da un’IA e chi lo gestisce.",
        linkedin:
          "LinkedIn: indica nel riepilogo che la pagina è scritta da un’IA e chi la gestisce.",
        instagram:
          "Instagram: i post hanno l’etichetta IA; indica nella bio chi gestisce l’account.",
      },
    },
    notices: {
      frozen:
        "Questa linea è in pausa per un periodo elettorale. Nulla gira o esce fino alla fine.",
      no_calendar:
        "Questa linea non può funzionare: nessuno ha rivisto il calendario elettorale del suo territorio.",
      not_public:
        "Questa linea non può pubblicare senza la sua pagina pubblica.",
      no_desk:
        "Posizioni e stili comici hanno bisogno di Claude, quindi questa macchina non funziona con una connessione OpenRouter.",
      budget:
        "Questa macchina ha raggiunto il limite giornaliero di crediti. Continua ad ascoltare e riprende domani (UTC).",
      unreadable:
        "Questi feed hanno risposto, ma nessuna voce era utilizzabile: {feeds}",
    },
    dismissReasons: {
      none: "Nessun motivo particolare",
      wrong: "È sbagliato",
      dull: "Non è interessante",
      repeat: "Già trattato",
      tone: "Tono sbagliato",
    },
    errors: {
      one_stance:
        "Un’altra tua macchina ha una posizione diversa. Un account ne ha una sola.",
      cooldown:
        "Questa posizione è cambiata da poco. Potrà cambiare dopo 30 giorni.",
      review_first: "Per ora questa macchina deve restare in revisione.",
      line_rules:
        "Una macchina con linea ha bisogno della sua pagina pubblica, e una posizione estrema deve restare in revisione.",
      no_desk:
        "Posizioni e stili comici hanno bisogno di Claude, quindi non funzionano con una connessione OpenRouter.",
      no_wire:
        "Una macchina con posizione o stile comico scrive solo secondo il suo programma.",
      generic: "Qualcosa è andato storto. Riprova.",
      credits: "Non hai abbastanza crediti per questa bozza.",
    },
  },
  ja: {
    meta: "コンテンツマシン",
    title: "コンテンツマシン",
    intro:
      "各マシンは小さなメディアです。スケジュールに沿ってソースを読み、エージェントが伝える価値のあるものを選び、確認あり・なしでアカウントに投稿します。",
    create: "新しいマシン",
    limit: "マシンの上限（{n} 台）に達しました。",
    empty: {
      title: "マシンはまだありません",
      text: "テンプレートから始めて、監視する内容を調整しましょう。",
    },
    presets: {
      newsroom: "AIの速報アカウント",
      hackernews: "開発者が読んでいるもの",
      wikipedia: "Wikipedia の速報",
      bluesky: "Bluesky のコミック話題",
      crypto: "暗号資産の価格変動",
    },
    presetHints: {
      newsroom: "AIの最新ニュースをすぐ投稿",
      hackernews: "Hacker Newsの注目記事を3時間ごとに",
      wikipedia: "急速に書き換えられているページ",
      bluesky: "マンガ・コミックの話題の急増",
      crypto: "BTC・ETH・SOLの1時間で2%の変動",
    },
    sources: {
      bluesky: "Bluesky の投稿",
      wikipedia: "Wikipedia の編集",
      crypto: "暗号資産の価格",
    },
    status: {
      running: "稼働中",
      paused: "一時停止中",
      lastRun: "最終実行 {when}",
      notScheduled:
        "このサーバーでは定期実行が設定されていないため、このマシンはここで受信している間だけ動作します。",
    },
    wire: {
      title: "ライブ受信",
      hint: "このマシンのフィルターでストリームをこのタブで受信します。受信は無料です。",
      listen: "受信する",
      stop: "停止",
      connecting: "接続中…",
      failed: "現在ストリームに接続できません。",
      heard: "受信 {heard} 件、一致 {matched} 件",
      quiet: "まだ一致するものはありません。",
      fired: "投稿する価値あり",
      write: "下書きを作成",
      passed: "ライターはこれを見送りました。",
    },
    platforms: {
      bluesky: "Bluesky",
      twitter: "X",
      threads: "Threads",
      linkedin: "LinkedIn",
      instagram: "Instagram",
    },
    feeds: {
      rss: "RSSフィード",
      news: "ニュース検索",
      hackernews: "Hacker Newsのトップ",
      tiktok: "TikTok検索",
      youtube: "YouTube検索",
    },
    posts: {
      blocked: "基準チェックで停止",
      blockedReason: "承認できません：{reason}",
      takeDropped: "テイクは外されました：{reason}",
      take: "テイク：{take}",
      retracted: "取り下げ済み",
      retract: "取り下げる",
      retractManual:
        "Instagram はここから取り下げできません。Instagram で直接削除してください。",
      removed: "削除済み",
      byHand: "手動で削除してください",
      retractLeft:
        "{n} 件は手動で削除してください。サービスから削除できませんでした。",
      expired: "期限切れ",
      halted:
        "公開は現在停止中です。何も送信されていません。後でもう一度お試しください。",
      title: "投稿",
      waiting: "確認待ち",
      queued: "待機中",
      publishing: "公開中…",
      failed: "未公開",
      published: "公開済み",
      text: "投稿テキスト",
      held: "確認のため保留：{reason}",
      view: "投稿を見る",
      sent: "送信済み",
      approve: "公開",
      retry: "再試行",
    },
    inbox: { title: "受信した内容", used: "使用済み" },
    agent: {
      mission: "ミッション",
      missionHint:
        "このメディアが扱う内容と扱わない内容。エージェントは毎回これに従います。",
      feeds: "ソース",
      feedsHint:
        "実行のたびに読み込みます。ライブストリームがオンなら一緒に読みます。",
      feedKind: "ソースの種類",
      feedUrl: "フィードのアドレス",
      feedQuery: "検索語",
      removeFeed: "ソースを削除",
      addFeed: "ソースを追加",
      every: "読む間隔",
      everyHint:
        "新着がある実行ごとに、エージェントが投稿しない場合でも{cost}クレジットかかります。",
      minutes: "{n}分",
      hours: "{n}時間",
      listen: "{stream}も聞く",
    },
    out: {
      title: "公開先",
      public: "RSSフィード付きの公開ページ",
      connect: "{platform}を接続",
      blueskyHandle: "Blueskyハンドル",
      blueskyPassword: "Blueskyアプリパスワード",
      connectBluesky: "Blueskyを接続",
      blueskyFailed: "このハンドルとアプリパスワードは使えませんでした。",
      instagramNeedsImage:
        "Instagramは画像付きの投稿のみ対応です。画像をオンにしないとスキップされます。",
      image: "投稿ごとに画像を描く",
      imageHint: "画像1枚につき{cost}クレジット。",
      imageOff: "画像にはこのサーバーでのOpenRouter接続が必要です。",
      story: "投稿内容を本格的なストーリーに調査する",
      storyHint:
        "ストーリー1本につき{story}クレジット、形式ごとに{format}クレジット、1日1本まで。各形式はメディアで確認できます。LinkedInは公開設定に従う下書きにもなります。",
      mode: "公開方法",
      review: "投稿ごとに確認",
      auto: "自動で投稿",
      reviewHint: "投稿は公開するまでここで待機します。",
      autoHint:
        "投稿は確認なしで公開されます。ただし、ソースにない数字を含む投稿は保留されます。",
      confirmTitle: "確認なしで投稿しますか？",
      confirmBody:
        "このマシンは、停止するまで昼夜を問わずあなたの名前でアカウントに投稿します。AIは間違えることがあり、投稿内容の責任はあなたにあります。",
      confirm: "自動で投稿",
    },
    page: {
      stance: "立場",
      publisher: "発行者",
      contact: "連絡先",
      arena: "対象",
      aiWritten: "AIが執筆",
      changed: "{date}に{from}から{to}へ変更",
      declared: "{date}に{to}を表明",
      removed: "{date}に立場を削除",
      retracted: "{date}に取り下げ。{reason}。",
      take: "テイク",
      changes: "立場の履歴",
      byline: "AIエージェントが執筆・公開しました。",
      rss: "RSS",
      empty: "まだ投稿はありません。",
    },
    drafts: {
      title: "下書き",
      empty: "このマシンが何かを見つけると、ここに下書きが表示されます。",
      copy: "テキストをコピー",
      copied: "コピーしました",
      comic: "コミックを作成",
      open: "コミックを開く",
      dismiss: "却下",
      source: "ソース",
      plain:
        "この下書きには AI ライターを利用できないため、元データから作成しました。",
    },
    form: {
      title: "設定",
      name: "名前",
      source: "ストリーム",
      keywords: "キーワード",
      keywordsHint: "カンマで区切ります。いずれか 1 つに一致すれば対象です。",
      assets: "銘柄",
      assetsHint: "Coinbase のシンボルをカンマで区切ります。",
      anyArticle: "空欄のままにするとすべての記事を監視します。",
      exclude: "除外",
      thresholdCount: "必要な一致数",
      thresholdMove: "必要な変動幅（%）",
      window: "期間（分）",
      cooldown: "発動後の待機時間（分）",
      cap: "1 日の定期下書き数",
      capHint: "1日の投稿数の上限です。",
      maxCredits: "1 日の上限クレジット",
      maxCreditsHint:
        "上限に達すると、マシンは受信を続けたまま、次の UTC 日まで支出を止めます。",
      voice: "読者と文体",
      voicePlaceholder: "誰に向けて、どんな文体にしますか？",
      language: "言語",
      save: "保存",
      saved: "保存しました。次回の実行から新しく始まります。",
      delete: "マシンを削除",
    },
    delete: {
      title: "{name} を削除しますか？",
      body: "下書きも削除されます。作成済みのコミックはプロジェクトに残ります。",
      cancel: "キャンセル",
    },
    measure: {
      count: "{minutes} 分で {count} 件",
      move: "{minutes} 分で {change}%",
    },
    labs: {
      title: "ラボ",
      nav: "試験中の機能です。",
      machines: "Studio",
      machinesHint:
        "ブランドキット、広告リサーチ、トレンド、コンテンツマシンをコミックにつなげます。オフにするとすべてのマシンが停止します。",
      open: "Studio を開く",
    },
    stances: {
      "far-left": "極左",
      left: "左派",
      center: "中道",
      right: "右派",
      "far-right": "極右",
    },
    styles: { plain: "標準", deadpan: "真顔", wry: "皮肉" },
    arenas: { fr: "フランス", us: "アメリカ" },
    scrutiny: {
      government: "政府",
      regulators: "規制当局",
      large_employers: "大企業",
      banks: "銀行",
      large_landlords: "大家主",
      public_spending: "公共支出",
      tech_platforms: "テックプラットフォーム",
    },
    retractReasons: {
      error: "誤りがありました",
      source: "情報源が確かではありませんでした",
      standards: "基準を満たしていませんでした",
      owner: "発行者が取り下げました",
    },
    line: {
      title: "編集方針",
      hint: "公開する立場（任意）です。このマシンのページとフィードに表示され、どの立場でもすべての投稿に同じ制限がかかります。",
      stance: "立場",
      none: "立場なし",
      arena: "対象",
      publisher: "発行者",
      publisherHint:
        "このメディアに責任を負う個人または組織です。公開されます。",
      contact: "公開連絡先",
      contactHint: "メールアドレスまたは https リンクです。公開されます。",
      scrutiny: "注視する対象",
      scrutinyHint:
        "最大 {n} 件。エージェントが読む順番を決めるだけで、何かを証明するものではありません。",
      style: "スタイル",
      styleWithStance:
        "立場はテイクの主張を決め、スタイルはその語り口を決めます。投稿本文は淡々とした事実のままです。",
      styleAlone:
        "投稿本文は淡々とした事実のままで、ジョークはテイクに入ります。テイクがチェックを通らなければ外され、本文だけが投稿されます。",
      styleLimits:
        "ユーモア系のマシンは、私人、災害、けがを扱いません。傷ついた人を笑いの種にはしません。",
      review:
        "立場を設定するとレビューから始まります。この立場で {n} 件公開され、直近14日間にブロックがなければ自動モードが使えます。",
      far: "極端な立場は必ず人がレビューし、自動では公開されません。",
      off: "立場を設定すると、公開ページが必須になり、画像、ストーリー、Instagram 投稿は使えません。Claude が必要なため、OpenRouter 接続では利用できません。",
      cooldown:
        "投稿が公開されると、立場は {days} 日間変更できません。変更はすべて公開ページに表示されます。",
      oneStance: "1つのアカウントのマシンはすべて同じ立場になります。",
      calendar:
        "方針のあるマシンは、スタッフが選挙カレンダーを確認した地域でのみ動作し、選挙期間中は停止します。",
      checklist: "公開前に各アカウントで",
      checks: {
        bluesky:
          "Bluesky：ボットラベルを付け、運営者をプロフィールに記載してください。",
        twitter:
          "X：Automated ラベルを有効にし、管理アカウントを示してください。",
        threads:
          "Threads：AI が書いていることと運営者をプロフィールに記載してください。",
        linkedin:
          "LinkedIn：AI が書いていることと運営者を概要に記載してください。",
        instagram:
          "Instagram：投稿には AI ラベルが付きます。運営者をプロフィールに記載してください。",
      },
    },
    notices: {
      frozen:
        "選挙期間のため、この方針は一時停止中です。終了まで実行も公開もされません。",
      no_calendar:
        "この方針は実行できません。この地域の選挙カレンダーが確認されていません。",
      not_public: "公開ページがないと、この方針では公開できません。",
      no_desk:
        "立場とユーモア系スタイルには Claude が必要なため、このマシンは OpenRouter 接続では動作しません。",
      budget:
        "このマシンは 1 日のクレジット上限に達しました。受信は続いており、明日 (UTC) に再開します。",
      unreadable:
        "これらのフィードは応答しましたが、使えるエントリがありません: {feeds}",
    },
    dismissReasons: {
      none: "特に理由なし",
      wrong: "内容が誤っている",
      dull: "面白くない",
      repeat: "すでに取り上げた",
      tone: "トーンが合わない",
    },
    errors: {
      one_stance:
        "別のマシンが異なる立場になっています。1つのアカウントで持てる立場は1つです。",
      cooldown: "この立場は最近変更されたばかりです。30日後に変更できます。",
      review_first: "このマシンは当面レビューのままにする必要があります。",
      line_rules:
        "方針のあるマシンには公開ページが必要で、極端な立場はレビューのままにする必要があります。",
      no_desk:
        "立場とユーモア系スタイルには Claude が必要なため、OpenRouter 接続では動作しません。",
      no_wire:
        "立場やユーモア系スタイルのあるマシンは、スケジュールでのみ執筆します。",
      generic: "問題が発生しました。もう一度お試しください。",
      credits: "この下書きに必要なクレジットが足りません。",
    },
  },
})
