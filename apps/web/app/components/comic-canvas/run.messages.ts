import { defineMessages } from "@/i18n/core"

export const messages = defineMessages({
  en: {
    button: "Run",
    title: "Carousel run",
    description:
      "From a story: plan the slides, draw missing character sheets, draw the panels, letter and check them. Whatever already exists is skipped and never paid for twice. It runs in this tab, so keep it open; run it again to pick up where it stopped.",
    story: "Story",
    storyPlaceholder:
      "Aki misses the last train and has to walk home through the rain…",
    noPlanner:
      "The story planner isn’t set up, so only panels that already have a scene can run.",
    stepsLabel: "Steps",
    steps: {
      plan: {
        zero: "Nothing left to plan",
        one: "Plan {count} slide",
        other: "Plan {count} slides",
      },
      sheets: {
        zero: "No character sheets missing",
        one: "Draw {count} character sheet",
        other: "Draw {count} character sheets",
      },
      panels: {
        zero: "No panels left to draw",
        one: "Draw {count} panel",
        other: "Draw {count} panels",
      },
      letter: {
        zero: "No lettering waiting",
        one: "Letter {count} panel",
        other: "Letter {count} panels",
      },
      check: {
        zero: "No panels left to check",
        one: "Check {count} panel",
        other: "Check {count} panels",
      },
    },
    credits: { one: "{n} credit", other: "{n} credits" },
    free: "Free",
    approveNote: {
      one: "{n} sheet is a draft. Panels only draw from approved sheets.",
      other: "{n} sheets are drafts. Panels only draw from approved sheets.",
    },
    looklessNote:
      "No look tags, so no sheet: {names}. They’re drawn from their name alone.",
    emptyNote: {
      one: "{n} empty panel has no story to plan from and stays empty.",
      other: "{n} empty panels have no story to plan from and stay empty.",
    },
    options: {
      slides: "Slides",
      plan: "Pause to read the plan",
      sheets: "New character sheets",
      sheetsPause: "Pause to approve",
      sheetsAuto: "Approve automatically",
      panels: "Pause after drawing",
      letter: "Pause after lettering",
      rerolls: "Redraw panels the check flags",
      rerollsOff: "Off",
      rerollsHelp:
        "Times per panel. Each one pays for a new image and a new check. The old image stays in the panel’s versions.",
    },
    review: {
      sheetOf: "Character sheet of {name}",
      approve: "Approve",
      redraw: "Redraw ({credits})",
    },
    progress: {
      plan: "Planning slide {done} of {total}…",
      sheets: "Drawing sheet {done} of {total}…",
      panels: "Drawing panel {done} of {total}…",
      letter: "Lettering…",
      check: "Checking panel {done} of {total}…",
      reroll: "Redrawing flagged panel {done} of {total}…",
    },
    paused: {
      plan: "Paused. The plan is on the panels: change anything, then continue.",
      sheets: "Paused. Approve the sheets before panels are drawn from them.",
      panels: "Paused. The panels are drawn.",
      letter: "Paused. The lettering is placed.",
      price: "Paused. The plan costs more than quoted: {credits} credits left.",
    },
    stopped: "Stopped. Everything finished is kept; run again to go on.",
    short: "Not enough credits to go on. Everything finished is kept.",
    getMore: "Get more",
    failed: "Stopped: {error}",
    incomplete: "Finished, but some work is left. Run again to retry it.",
    done: {
      zero: "Done. Nothing to flag.",
      one: "Done. {n} panel flagged; see the slide badges.",
      other: "Done. {n} panels flagged; see the slide badges.",
    },
    total: { one: "Total {n} credit", other: "Total {n} credits" },
    totalCeiling: { one: "At most {n} credit", other: "At most {n} credits" },
    rerollExtra: {
      one: "Re-rolls could add {n} more.",
      other: "Re-rolls could add {n} more.",
    },
    balance: { one: "You have {n} credit", other: "You have {n} credits" },
    openrouter: "Paid by OpenRouter",
    start: "Start run",
    rerun: "Run again",
    continue: "Continue",
    approveAll: {
      one: "Approve and continue",
      other: "Approve {n} and continue",
    },
    stop: "Stop",
    close: "Close",
  },
  fr: {
    button: "Lancer",
    title: "Production du carrousel",
    description:
      "À partir d’une histoire : planifie les slides, dessine les fiches de personnages manquantes, dessine les cases, les lettre et les vérifie. Ce qui existe déjà est ignoré et jamais payé deux fois. Tout se passe dans cet onglet : gardez-le ouvert, et relancez pour reprendre là où ça s’est arrêté.",
    story: "Histoire",
    storyPlaceholder:
      "Aki rate le dernier train et doit rentrer à pied sous la pluie…",
    noPlanner:
      "Le planificateur d’histoire n’est pas configuré : seules les cases qui ont déjà une scène peuvent être traitées.",
    stepsLabel: "Étapes",
    steps: {
      plan: {
        zero: "Plus rien à planifier",
        one: "Planifier {count} slide",
        other: "Planifier {count} slides",
      },
      sheets: {
        zero: "Aucune fiche de personnage manquante",
        one: "Dessiner {count} fiche de personnage",
        other: "Dessiner {count} fiches de personnages",
      },
      panels: {
        zero: "Plus aucune case à dessiner",
        one: "Dessiner {count} case",
        other: "Dessiner {count} cases",
      },
      letter: {
        zero: "Aucun lettrage en attente",
        one: "Lettrer {count} case",
        other: "Lettrer {count} cases",
      },
      check: {
        zero: "Plus aucune case à vérifier",
        one: "Vérifier {count} case",
        other: "Vérifier {count} cases",
      },
    },
    credits: { one: "{n} crédit", other: "{n} crédits" },
    free: "Gratuit",
    approveNote: {
      one: "{n} fiche est un brouillon. Les cases ne partent que de fiches approuvées.",
      other:
        "{n} fiches sont des brouillons. Les cases ne partent que de fiches approuvées.",
    },
    looklessNote:
      "Pas de tags d’apparence, donc pas de fiche : {names}. Ils sont dessinés d’après leur seul nom.",
    emptyNote: {
      one: "{n} case vide n’a pas d’histoire à planifier et reste vide.",
      other:
        "{n} cases vides n’ont pas d’histoire à planifier et restent vides.",
    },
    options: {
      slides: "Slides",
      plan: "Pause pour lire le plan",
      sheets: "Nouvelles fiches de personnages",
      sheetsPause: "Pause pour approuver",
      sheetsAuto: "Approuver automatiquement",
      panels: "Pause après le dessin",
      letter: "Pause après le lettrage",
      rerolls: "Redessiner les cases signalées par la vérification",
      rerollsOff: "Non",
      rerollsHelp:
        "Fois par case. Chacune paie une nouvelle image et une nouvelle vérification. L’ancienne image reste dans les versions de la case.",
    },
    review: {
      sheetOf: "Fiche de personnage de {name}",
      approve: "Approuver",
      redraw: "Redessiner ({credits})",
    },
    progress: {
      plan: "Planification de la slide {done} sur {total}…",
      sheets: "Dessin de la fiche {done} sur {total}…",
      panels: "Dessin de la case {done} sur {total}…",
      letter: "Lettrage…",
      check: "Vérification de la case {done} sur {total}…",
      reroll: "Nouveau dessin de la case signalée {done} sur {total}…",
    },
    paused: {
      plan: "En pause. Le plan est sur les cases : modifiez ce que vous voulez, puis continuez.",
      sheets:
        "En pause. Approuvez les fiches avant que les cases en soient dessinées.",
      panels: "En pause. Les cases sont dessinées.",
      letter: "En pause. Le lettrage est placé.",
      price:
        "En pause. Le plan coûte plus que prévu : il reste {credits} crédits.",
    },
    stopped:
      "Arrêté. Tout ce qui est fini est conservé ; relancez pour continuer.",
    short:
      "Pas assez de crédits pour continuer. Tout ce qui est fini est conservé.",
    getMore: "En obtenir",
    failed: "Arrêté : {error}",
    incomplete: "Terminé, mais il reste du travail. Relancez pour réessayer.",
    done: {
      zero: "Terminé. Rien à signaler.",
      one: "Terminé. {n} case signalée ; voir les badges des slides.",
      other: "Terminé. {n} cases signalées ; voir les badges des slides.",
    },
    total: { one: "Total {n} crédit", other: "Total {n} crédits" },
    totalCeiling: { one: "Au plus {n} crédit", other: "Au plus {n} crédits" },
    rerollExtra: {
      one: "Les redessins peuvent ajouter {n} de plus.",
      other: "Les redessins peuvent ajouter {n} de plus.",
    },
    balance: { one: "Vous avez {n} crédit", other: "Vous avez {n} crédits" },
    openrouter: "Payé par OpenRouter",
    start: "Lancer",
    rerun: "Relancer",
    continue: "Continuer",
    approveAll: {
      one: "Approuver et continuer",
      other: "Approuver {n} et continuer",
    },
    stop: "Arrêter",
    close: "Fermer",
  },
  es: {
    button: "Ejecutar",
    title: "Producción del carrusel",
    description:
      "A partir de una historia: planifica las diapositivas, dibuja las fichas de personaje que falten, dibuja las viñetas, las rotula y las revisa. Lo que ya existe se omite y nunca se paga dos veces. Se ejecuta en esta pestaña, así que déjala abierta; vuelve a ejecutarlo para seguir donde se detuvo.",
    story: "Historia",
    storyPlaceholder:
      "Aki pierde el último tren y tiene que volver a casa bajo la lluvia…",
    noPlanner:
      "El planificador de historias no está configurado, así que solo pueden procesarse las viñetas que ya tienen escena.",
    stepsLabel: "Pasos",
    steps: {
      plan: {
        zero: "Nada más que planificar",
        one: "Planificar {count} diapositiva",
        other: "Planificar {count} diapositivas",
      },
      sheets: {
        zero: "No faltan fichas de personaje",
        one: "Dibujar {count} ficha de personaje",
        other: "Dibujar {count} fichas de personaje",
      },
      panels: {
        zero: "No quedan viñetas por dibujar",
        one: "Dibujar {count} viñeta",
        other: "Dibujar {count} viñetas",
      },
      letter: {
        zero: "No hay rotulación pendiente",
        one: "Rotular {count} viñeta",
        other: "Rotular {count} viñetas",
      },
      check: {
        zero: "No quedan viñetas por revisar",
        one: "Revisar {count} viñeta",
        other: "Revisar {count} viñetas",
      },
    },
    credits: { one: "{n} crédito", other: "{n} créditos" },
    free: "Gratis",
    approveNote: {
      one: "{n} ficha es un borrador. Las viñetas solo se dibujan a partir de fichas aprobadas.",
      other:
        "{n} fichas son borradores. Las viñetas solo se dibujan a partir de fichas aprobadas.",
    },
    looklessNote:
      "Sin etiquetas de aspecto, no hay ficha: {names}. Se dibujan solo a partir de su nombre.",
    emptyNote: {
      one: "{n} viñeta vacía no tiene historia que planificar y se queda vacía.",
      other:
        "{n} viñetas vacías no tienen historia que planificar y se quedan vacías.",
    },
    options: {
      slides: "Diapositivas",
      plan: "Pausar para leer el plan",
      sheets: "Fichas de personaje nuevas",
      sheetsPause: "Pausar para aprobar",
      sheetsAuto: "Aprobar automáticamente",
      panels: "Pausar tras dibujar",
      letter: "Pausar tras rotular",
      rerolls: "Redibujar las viñetas que señale la revisión",
      rerollsOff: "No",
      rerollsHelp:
        "Veces por viñeta. Cada una paga una imagen y una revisión nuevas. La imagen anterior queda en las versiones de la viñeta.",
    },
    review: {
      sheetOf: "Ficha de personaje de {name}",
      approve: "Aprobar",
      redraw: "Redibujar ({credits})",
    },
    progress: {
      plan: "Planificando la diapositiva {done} de {total}…",
      sheets: "Dibujando la ficha {done} de {total}…",
      panels: "Dibujando la viñeta {done} de {total}…",
      letter: "Rotulando…",
      check: "Revisando la viñeta {done} de {total}…",
      reroll: "Redibujando la viñeta señalada {done} de {total}…",
    },
    paused: {
      plan: "En pausa. El plan está en las viñetas: cambia lo que quieras y continúa.",
      sheets:
        "En pausa. Aprueba las fichas antes de dibujar viñetas con ellas.",
      panels: "En pausa. Las viñetas están dibujadas.",
      letter: "En pausa. La rotulación está colocada.",
      price:
        "En pausa. El plan cuesta más de lo previsto: quedan {credits} créditos.",
    },
    stopped:
      "Detenido. Todo lo terminado se conserva; ejecuta de nuevo para seguir.",
    short:
      "No hay créditos suficientes para seguir. Todo lo terminado se conserva.",
    getMore: "Conseguir más",
    failed: "Detenido: {error}",
    incomplete:
      "Terminado, pero queda trabajo. Ejecuta de nuevo para reintentarlo.",
    done: {
      zero: "Listo. Nada que señalar.",
      one: "Listo. {n} viñeta señalada; mira las insignias de las diapositivas.",
      other:
        "Listo. {n} viñetas señaladas; mira las insignias de las diapositivas.",
    },
    total: { one: "Total {n} crédito", other: "Total {n} créditos" },
    totalCeiling: {
      one: "Como máximo {n} crédito",
      other: "Como máximo {n} créditos",
    },
    rerollExtra: {
      one: "Los redibujados podrían sumar {n} más.",
      other: "Los redibujados podrían sumar {n} más.",
    },
    balance: { one: "Tienes {n} crédito", other: "Tienes {n} créditos" },
    openrouter: "Pagado por OpenRouter",
    start: "Iniciar",
    rerun: "Ejecutar de nuevo",
    continue: "Continuar",
    approveAll: {
      one: "Aprobar y continuar",
      other: "Aprobar {n} y continuar",
    },
    stop: "Detener",
    close: "Cerrar",
  },
  de: {
    button: "Starten",
    title: "Karussell-Durchlauf",
    description:
      "Aus einer Geschichte: Slides planen, fehlende Charakterblätter zeichnen, Panels zeichnen, beschriften und prüfen. Was schon da ist, wird übersprungen und nie doppelt bezahlt. Das läuft in diesem Tab, also lass ihn offen; starte erneut, um dort weiterzumachen, wo es angehalten hat.",
    story: "Geschichte",
    storyPlaceholder:
      "Aki verpasst den letzten Zug und muss im Regen nach Hause laufen…",
    noPlanner:
      "Der Story-Planer ist nicht eingerichtet, daher laufen nur Panels, die schon eine Szene haben.",
    stepsLabel: "Schritte",
    steps: {
      plan: {
        zero: "Nichts mehr zu planen",
        one: "{count} Slide planen",
        other: "{count} Slides planen",
      },
      sheets: {
        zero: "Keine Charakterblätter fehlen",
        one: "{count} Charakterblatt zeichnen",
        other: "{count} Charakterblätter zeichnen",
      },
      panels: {
        zero: "Keine Panels mehr zu zeichnen",
        one: "{count} Panel zeichnen",
        other: "{count} Panels zeichnen",
      },
      letter: {
        zero: "Keine Beschriftung ausstehend",
        one: "{count} Panel beschriften",
        other: "{count} Panels beschriften",
      },
      check: {
        zero: "Keine Panels mehr zu prüfen",
        one: "{count} Panel prüfen",
        other: "{count} Panels prüfen",
      },
    },
    credits: { one: "{n} Credit", other: "{n} Credits" },
    free: "Kostenlos",
    approveNote: {
      one: "{n} Blatt ist ein Entwurf. Panels werden nur nach freigegebenen Blättern gezeichnet.",
      other:
        "{n} Blätter sind Entwürfe. Panels werden nur nach freigegebenen Blättern gezeichnet.",
    },
    looklessNote:
      "Keine Look-Tags, also kein Blatt: {names}. Sie werden nur nach ihrem Namen gezeichnet.",
    emptyNote: {
      one: "{n} leeres Panel hat keine Geschichte zum Planen und bleibt leer.",
      other:
        "{n} leere Panels haben keine Geschichte zum Planen und bleiben leer.",
    },
    options: {
      slides: "Slides",
      plan: "Pause, um den Plan zu lesen",
      sheets: "Neue Charakterblätter",
      sheetsPause: "Pause zum Freigeben",
      sheetsAuto: "Automatisch freigeben",
      panels: "Pause nach dem Zeichnen",
      letter: "Pause nach dem Beschriften",
      rerolls: "Von der Prüfung markierte Panels neu zeichnen",
      rerollsOff: "Aus",
      rerollsHelp:
        "Mal pro Panel. Jedes Mal kostet ein neues Bild und eine neue Prüfung. Das alte Bild bleibt in den Versionen des Panels.",
    },
    review: {
      sheetOf: "Charakterblatt von {name}",
      approve: "Freigeben",
      redraw: "Neu zeichnen ({credits})",
    },
    progress: {
      plan: "Plane Slide {done} von {total}…",
      sheets: "Zeichne Blatt {done} von {total}…",
      panels: "Zeichne Panel {done} von {total}…",
      letter: "Beschrifte…",
      check: "Prüfe Panel {done} von {total}…",
      reroll: "Zeichne markiertes Panel {done} von {total} neu…",
    },
    paused: {
      plan: "Pausiert. Der Plan liegt auf den Panels: Ändere, was du willst, und mach dann weiter.",
      sheets:
        "Pausiert. Gib die Blätter frei, bevor Panels danach gezeichnet werden.",
      panels: "Pausiert. Die Panels sind gezeichnet.",
      letter: "Pausiert. Die Beschriftung ist platziert.",
      price:
        "Pausiert. Der Plan kostet mehr als angegeben: noch {credits} Credits.",
    },
    stopped:
      "Angehalten. Alles Fertige bleibt erhalten; starte erneut, um weiterzumachen.",
    short:
      "Nicht genug Credits, um weiterzumachen. Alles Fertige bleibt erhalten.",
    getMore: "Mehr holen",
    failed: "Angehalten: {error}",
    incomplete:
      "Fertig, aber es ist noch Arbeit übrig. Starte erneut für einen neuen Versuch.",
    done: {
      zero: "Fertig. Nichts zu beanstanden.",
      one: "Fertig. {n} Panel markiert; siehe die Slide-Abzeichen.",
      other: "Fertig. {n} Panels markiert; siehe die Slide-Abzeichen.",
    },
    total: { one: "Gesamt {n} Credit", other: "Gesamt {n} Credits" },
    totalCeiling: {
      one: "Höchstens {n} Credit",
      other: "Höchstens {n} Credits",
    },
    rerollExtra: {
      one: "Neuzeichnungen könnten {n} mehr kosten.",
      other: "Neuzeichnungen könnten {n} mehr kosten.",
    },
    balance: { one: "Du hast {n} Credit", other: "Du hast {n} Credits" },
    openrouter: "Bezahlt von OpenRouter",
    start: "Durchlauf starten",
    rerun: "Erneut starten",
    continue: "Weiter",
    approveAll: {
      one: "Freigeben und weiter",
      other: "{n} freigeben und weiter",
    },
    stop: "Anhalten",
    close: "Schließen",
  },
  it: {
    button: "Avvia",
    title: "Produzione del carosello",
    description:
      "Da una storia: pianifica le slide, disegna le schede personaggio mancanti, disegna le vignette, le letterizza e le controlla. Ciò che esiste già viene saltato e mai pagato due volte. Funziona in questa scheda, quindi tienila aperta; riavvia per riprendere da dove si è fermato.",
    story: "Storia",
    storyPlaceholder:
      "Aki perde l’ultimo treno e deve tornare a casa a piedi sotto la pioggia…",
    noPlanner:
      "Il pianificatore di storie non è configurato, quindi si elaborano solo le vignette che hanno già una scena.",
    stepsLabel: "Passaggi",
    steps: {
      plan: {
        zero: "Niente altro da pianificare",
        one: "Pianifica {count} slide",
        other: "Pianifica {count} slide",
      },
      sheets: {
        zero: "Nessuna scheda personaggio mancante",
        one: "Disegna {count} scheda personaggio",
        other: "Disegna {count} schede personaggio",
      },
      panels: {
        zero: "Nessuna vignetta da disegnare",
        one: "Disegna {count} vignetta",
        other: "Disegna {count} vignette",
      },
      letter: {
        zero: "Nessun lettering in attesa",
        one: "Letterizza {count} vignetta",
        other: "Letterizza {count} vignette",
      },
      check: {
        zero: "Nessuna vignetta da controllare",
        one: "Controlla {count} vignetta",
        other: "Controlla {count} vignette",
      },
    },
    credits: { one: "{n} credito", other: "{n} crediti" },
    free: "Gratis",
    approveNote: {
      one: "{n} scheda è una bozza. Le vignette partono solo da schede approvate.",
      other:
        "{n} schede sono bozze. Le vignette partono solo da schede approvate.",
    },
    looklessNote:
      "Nessun tag di aspetto, quindi nessuna scheda: {names}. Vengono disegnati dal solo nome.",
    emptyNote: {
      one: "{n} vignetta vuota non ha una storia da pianificare e resta vuota.",
      other:
        "{n} vignette vuote non hanno una storia da pianificare e restano vuote.",
    },
    options: {
      slides: "Slide",
      plan: "Pausa per leggere il piano",
      sheets: "Nuove schede personaggio",
      sheetsPause: "Pausa per approvare",
      sheetsAuto: "Approva automaticamente",
      panels: "Pausa dopo il disegno",
      letter: "Pausa dopo il lettering",
      rerolls: "Ridisegna le vignette segnalate dal controllo",
      rerollsOff: "No",
      rerollsHelp:
        "Volte per vignetta. Ognuna paga una nuova immagine e un nuovo controllo. La vecchia immagine resta nelle versioni della vignetta.",
    },
    review: {
      sheetOf: "Scheda personaggio di {name}",
      approve: "Approva",
      redraw: "Ridisegna ({credits})",
    },
    progress: {
      plan: "Pianificazione della slide {done} di {total}…",
      sheets: "Disegno della scheda {done} di {total}…",
      panels: "Disegno della vignetta {done} di {total}…",
      letter: "Lettering…",
      check: "Controllo della vignetta {done} di {total}…",
      reroll: "Nuovo disegno della vignetta segnalata {done} di {total}…",
    },
    paused: {
      plan: "In pausa. Il piano è sulle vignette: cambia ciò che vuoi, poi continua.",
      sheets: "In pausa. Approva le schede prima di disegnarne le vignette.",
      panels: "In pausa. Le vignette sono disegnate.",
      letter: "In pausa. Il lettering è posizionato.",
      price:
        "In pausa. Il piano costa più del previsto: restano {credits} crediti.",
    },
    stopped: "Fermato. Tutto ciò che è finito resta; riavvia per continuare.",
    short:
      "Crediti insufficienti per continuare. Tutto ciò che è finito resta.",
    getMore: "Ottienine altri",
    failed: "Fermato: {error}",
    incomplete: "Finito, ma resta del lavoro. Riavvia per riprovare.",
    done: {
      zero: "Fatto. Niente da segnalare.",
      one: "Fatto. {n} vignetta segnalata; vedi i badge delle slide.",
      other: "Fatto. {n} vignette segnalate; vedi i badge delle slide.",
    },
    total: { one: "Totale {n} credito", other: "Totale {n} crediti" },
    totalCeiling: {
      one: "Al massimo {n} credito",
      other: "Al massimo {n} crediti",
    },
    rerollExtra: {
      one: "I nuovi disegni possono aggiungerne altri {n}.",
      other: "I nuovi disegni possono aggiungerne altri {n}.",
    },
    balance: { one: "Hai {n} credito", other: "Hai {n} crediti" },
    openrouter: "Pagato da OpenRouter",
    start: "Avvia",
    rerun: "Riavvia",
    continue: "Continua",
    approveAll: {
      one: "Approva e continua",
      other: "Approva {n} e continua",
    },
    stop: "Ferma",
    close: "Chiudi",
  },
  ja: {
    button: "一括実行",
    title: "カルーセル一括制作",
    description:
      "ストーリーから、スライドの構成、足りないキャラクターシートの作画、パネルの作画、写植、チェックまでを行います。既にあるものはスキップされ、二重に課金されることはありません。このタブで実行されるので開いたままにしてください。もう一度実行すると止まった所から再開します。",
    story: "ストーリー",
    storyPlaceholder: "アキは終電を逃し、雨の中を歩いて帰ることになる…",
    noPlanner:
      "ストーリープランナーが設定されていないため、シーンが入力済みのパネルのみ処理できます。",
    stepsLabel: "ステップ",
    steps: {
      plan: {
        zero: "構成するものはありません",
        other: "{count}枚のスライドを構成",
      },
      sheets: {
        zero: "足りないキャラクターシートはありません",
        other: "キャラクターシートを{count}枚作画",
      },
      panels: {
        zero: "作画するパネルはありません",
        other: "{count}個のパネルを作画",
      },
      letter: {
        zero: "待機中の写植はありません",
        other: "{count}個のパネルに写植",
      },
      check: {
        zero: "チェックするパネルはありません",
        other: "{count}個のパネルをチェック",
      },
    },
    credits: { other: "{n}クレジット" },
    free: "無料",
    approveNote: {
      other:
        "{n}枚のシートが下書きです。パネルは承認済みのシートからのみ描かれます。",
    },
    looklessNote:
      "見た目のタグがないためシートなし: {names}。名前のみから描かれます。",
    emptyNote: {
      other: "空のパネル{n}個は構成するストーリーがなく、空のままになります。",
    },
    options: {
      slides: "スライド数",
      plan: "構成を確認するため一時停止",
      sheets: "新しいキャラクターシート",
      sheetsPause: "承認のため一時停止",
      sheetsAuto: "自動で承認",
      panels: "作画の後に一時停止",
      letter: "写植の後に一時停止",
      rerolls: "チェックで指摘されたパネルを描き直す",
      rerollsOff: "オフ",
      rerollsHelp:
        "パネルごとの回数です。毎回、新しい画像とチェックの料金がかかります。以前の画像はパネルのバージョンに残ります。",
    },
    review: {
      sheetOf: "{name}のキャラクターシート",
      approve: "承認",
      redraw: "描き直す（{credits}）",
    },
    progress: {
      plan: "スライド {done}/{total} を構成中…",
      sheets: "シート {done}/{total} を作画中…",
      panels: "パネル {done}/{total} を作画中…",
      letter: "写植中…",
      check: "パネル {done}/{total} をチェック中…",
      reroll: "指摘されたパネル {done}/{total} を描き直し中…",
    },
    paused: {
      plan: "一時停止中。構成はパネルに入っています。必要な修正をしてから続行してください。",
      sheets: "一時停止中。パネルを描く前にシートを承認してください。",
      panels: "一時停止中。パネルの作画が終わりました。",
      letter: "一時停止中。写植を配置しました。",
      price:
        "一時停止中。構成の結果、見積もりを超えました。残り{credits}クレジットです。",
    },
    stopped:
      "停止しました。完成分は保存されています。もう一度実行すると続行します。",
    short: "クレジットが足りないため続行できません。完成分は保存されています。",
    getMore: "追加する",
    failed: "停止しました: {error}",
    incomplete:
      "終了しましたが、残りの作業があります。もう一度実行してください。",
    done: {
      zero: "完了。指摘はありません。",
      other:
        "完了。{n}個のパネルに指摘があります。スライドのバッジを確認してください。",
    },
    total: { other: "合計 {n}クレジット" },
    totalCeiling: { other: "最大 {n}クレジット" },
    rerollExtra: { other: "描き直しで最大{n}増える場合があります。" },
    balance: { other: "残高 {n}クレジット" },
    openrouter: "OpenRouterで支払い",
    start: "実行",
    rerun: "もう一度実行",
    continue: "続行",
    approveAll: { other: "{n}枚を承認して続行" },
    stop: "停止",
    close: "閉じる",
  },
})
