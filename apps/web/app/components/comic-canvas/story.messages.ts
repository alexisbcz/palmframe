import { defineMessages } from "@/i18n/core"

export const messages = defineMessages({
  en: {
    button: "Story",
    title: "Story to page",
    description: {
      one: "Slide {slide} · {count} panel. Write the page, check the panel, then render.",
      other:
        "Slide {slide} · {count} panels. Write the page, check each panel, then render.",
    },
    tabs: { story: "Write a story", script: "Panel script" },
    story: {
      label: "Story",
      placeholder:
        "Aki misses the last train and runs after it in the rain.\nAki says: Wait for me!\n\nOr beats: Panel 1: …  Panel 2: …",
      hint: "Name cast members as they are in the cast. “Aki says: …” and “Aki thinks: …” become bubbles, never drawn into the art.",
      series: {
        zero: "Planned with what came before in {title}.",
        one: "Planned with what came before in {title} and {count} fact.",
        other: "Planned with what came before in {title} and {count} facts.",
      },
      seriesUntitled: "this series",
      plan: { one: "Plan {count} panel", other: "Plan {count} panels" },
      planning: "Planning…",
      cost: {
        one: "Planning costs {n} credit.",
        other: "Planning costs {n} credits.",
      },
      unavailableTitle: "Story planning is off",
      unavailable:
        "Set ANTHROPIC_API_KEY on the server to plan pages from a story. Panel script works without it.",
    },
    script: {
      hint: "Write each panel yourself: no AI, and no credits until you render.",
    },
    panel: {
      title: "Panel {n}",
      scene: "Scene",
      scenePlaceholder: "What happens, who is there, where.",
      tags: "Tags",
      lines: "Lettering",
      linesPlaceholder:
        "Aki says: Wait for me!\nAki thinks: Too late…\nCaption: Tokyo, 2:14 AM",
      cast: "Cast",
      castMember: "Cast {name}",
      bubbles: { zero: "", one: "{count} bubble", other: "{count} bubbles" },
    },
    noPanels: {
      title: "No panels on this slide",
      description:
        "The story fills the panel frames already on the slide. Pick a layout first.",
    },
    estimate: {
      one: "{count} panel to render · {credits} credits",
      other: "{count} panels to render · {credits} credits",
    },
    balance: { one: "You have {n} credit.", other: "You have {n} credits." },
    insufficient: "Not enough credits.",
    getMore: "Get credits",
    openrouter: {
      one: "{count} panel to render · billed to your OpenRouter account",
      other: "{count} panels to render · billed to your OpenRouter account",
    },
    openrouterPlan: "Planning is billed to your OpenRouter account.",
    apply: "Apply to slide",
    applyRender: "Apply and render",
    rendering: "Rendering {done} of {total}…",
    stop: "Stop",
    applied: "Applied to slide {slide}.",
    otherPage:
      "Slide {slide} is still being planned; its plan stays with that slide.",
    errors: {
      changed:
        "The slide's panels changed while planning, so the plan was dropped. Plan again.",
      insufficient: "Not enough credits to plan this page.",
      failed: "Planning failed: {error}",
    },
  },
  fr: {
    button: "Histoire",
    title: "De l’histoire à la planche",
    description: {
      one: "Slide {slide} · {count} case. Écrivez la planche, vérifiez la case, puis lancez le rendu.",
      other:
        "Slide {slide} · {count} cases. Écrivez la planche, vérifiez chaque case, puis lancez le rendu.",
    },
    tabs: { story: "Écrire une histoire", script: "Script par case" },
    story: {
      label: "Histoire",
      placeholder:
        "Aki rate le dernier train et lui court après sous la pluie.\nAki dit : Attendez-moi !\n\nOu par cases : Case 1 : …  Case 2 : …",
      hint: "Nommez les personnages comme dans le casting. « Aki dit : … » et « Aki pense : … » deviennent des bulles, jamais dessinées dans l’image.",
      series: {
        zero: "Planifié avec ce qui précède dans {title}.",
        one: "Planifié avec ce qui précède dans {title} et {count} fait.",
        other: "Planifié avec ce qui précède dans {title} et {count} faits.",
      },
      seriesUntitled: "cette série",
      plan: { one: "Planifier {count} case", other: "Planifier {count} cases" },
      planning: "Planification…",
      cost: {
        one: "La planification coûte {n} crédit.",
        other: "La planification coûte {n} crédits.",
      },
      unavailableTitle: "La planification est désactivée",
      unavailable:
        "Définissez ANTHROPIC_API_KEY sur le serveur pour planifier une planche à partir d’une histoire. Le script par case fonctionne sans.",
    },
    script: {
      hint: "Écrivez chaque case vous-même : pas d’IA, et aucun crédit avant le rendu.",
    },
    panel: {
      title: "Case {n}",
      scene: "Scène",
      scenePlaceholder: "Ce qui se passe, qui est là, où.",
      tags: "Tags",
      lines: "Lettrage",
      linesPlaceholder:
        "Aki dit : Attendez-moi !\nAki pense : Trop tard…\nCaption : Tokyo, 2 h 14",
      cast: "Casting",
      castMember: "Ajouter {name}",
      bubbles: { zero: "", one: "{count} bulle", other: "{count} bulles" },
    },
    noPanels: {
      title: "Aucune case sur cette slide",
      description:
        "L’histoire remplit les cases déjà présentes sur la slide. Choisissez d’abord une mise en page.",
    },
    estimate: {
      one: "{count} case à rendre · {credits} crédits",
      other: "{count} cases à rendre · {credits} crédits",
    },
    balance: {
      one: "Il vous reste {n} crédit.",
      other: "Il vous reste {n} crédits.",
    },
    insufficient: "Crédits insuffisants.",
    getMore: "Obtenir des crédits",
    openrouter: {
      one: "{count} case à rendre · facturée sur votre compte OpenRouter",
      other: "{count} cases à rendre · facturées sur votre compte OpenRouter",
    },
    openrouterPlan:
      "La planification est facturée sur votre compte OpenRouter.",
    apply: "Appliquer à la slide",
    applyRender: "Appliquer et rendre",
    rendering: "Rendu {done} sur {total}…",
    stop: "Arrêter",
    applied: "Appliqué à la slide {slide}.",
    otherPage:
      "La slide {slide} est en cours de planification ; son plan reste attaché à cette slide.",
    errors: {
      changed:
        "Les cases de la slide ont changé pendant la planification, le plan a donc été abandonné. Relancez-la.",
      insufficient: "Pas assez de crédits pour planifier cette planche.",
      failed: "La planification a échoué : {error}",
    },
  },
  es: {
    button: "Historia",
    title: "De la historia a la página",
    description: {
      one: "Diapositiva {slide} · {count} viñeta. Escribe la página, revisa la viñeta y luego genera.",
      other:
        "Diapositiva {slide} · {count} viñetas. Escribe la página, revisa cada viñeta y luego genera.",
    },
    tabs: { story: "Escribir una historia", script: "Guion por viñeta" },
    story: {
      label: "Historia",
      placeholder:
        "Aki pierde el último tren y corre tras él bajo la lluvia.\nAki dice: ¡Espérame!\n\nO por viñetas: Viñeta 1: …  Viñeta 2: …",
      hint: "Nombra a los personajes como en el reparto. «Aki dice: …» y «Aki piensa: …» se convierten en bocadillos, nunca se dibujan en la imagen.",
      series: {
        zero: "Planificado con lo anterior de {title}.",
        one: "Planificado con lo anterior de {title} y {count} hecho.",
        other: "Planificado con lo anterior de {title} y {count} hechos.",
      },
      seriesUntitled: "esta serie",
      plan: {
        one: "Planificar {count} viñeta",
        other: "Planificar {count} viñetas",
      },
      planning: "Planificando…",
      cost: {
        one: "Planificar cuesta {n} crédito.",
        other: "Planificar cuesta {n} créditos.",
      },
      unavailableTitle: "La planificación está desactivada",
      unavailable:
        "Configura ANTHROPIC_API_KEY en el servidor para planificar páginas a partir de una historia. El guion por viñeta funciona sin ella.",
    },
    script: {
      hint: "Escribe cada viñeta tú mismo: sin IA y sin créditos hasta que generes.",
    },
    panel: {
      title: "Viñeta {n}",
      scene: "Escena",
      scenePlaceholder: "Qué pasa, quién está, dónde.",
      tags: "Etiquetas",
      lines: "Rotulado",
      linesPlaceholder:
        "Aki dice: ¡Espérame!\nAki piensa: Demasiado tarde…\nCaption: Tokio, 2:14 AM",
      cast: "Reparto",
      castMember: "Añadir a {name}",
      bubbles: {
        zero: "",
        one: "{count} bocadillo",
        other: "{count} bocadillos",
      },
    },
    noPanels: {
      title: "No hay viñetas en esta diapositiva",
      description:
        "La historia rellena las viñetas que ya están en la diapositiva. Elige primero una maqueta.",
    },
    estimate: {
      one: "{count} viñeta por generar · {credits} créditos",
      other: "{count} viñetas por generar · {credits} créditos",
    },
    balance: { one: "Tienes {n} crédito.", other: "Tienes {n} créditos." },
    insufficient: "No tienes créditos suficientes.",
    getMore: "Conseguir créditos",
    openrouter: {
      one: "{count} viñeta por generar · se cobra en tu cuenta de OpenRouter",
      other:
        "{count} viñetas por generar · se cobran en tu cuenta de OpenRouter",
    },
    openrouterPlan: "La planificación se cobra en tu cuenta de OpenRouter.",
    apply: "Aplicar a la diapositiva",
    applyRender: "Aplicar y generar",
    rendering: "Generando {done} de {total}…",
    stop: "Detener",
    applied: "Aplicado a la diapositiva {slide}.",
    otherPage:
      "La diapositiva {slide} se está planificando; su plan se queda con esa diapositiva.",
    errors: {
      changed:
        "Las viñetas de la diapositiva cambiaron durante la planificación, así que se descartó el plan. Vuelve a planificar.",
      insufficient: "No hay créditos suficientes para planificar esta página.",
      failed: "La planificación falló: {error}",
    },
  },
  de: {
    button: "Story",
    title: "Von der Story zur Seite",
    description: {
      one: "Slide {slide} · {count} Panel. Seite schreiben, Panel prüfen, dann rendern.",
      other:
        "Slide {slide} · {count} Panels. Seite schreiben, jedes Panel prüfen, dann rendern.",
    },
    tabs: { story: "Story schreiben", script: "Panel-Skript" },
    story: {
      label: "Story",
      placeholder:
        "Aki verpasst den letzten Zug und rennt ihm im Regen hinterher.\nAki sagt: Wartet auf mich!\n\nOder in Beats: Panel 1: …  Panel 2: …",
      hint: "Nenne Figuren so wie in der Besetzung. „Aki sagt: …“ und „Aki denkt: …“ werden zu Sprechblasen, nie ins Bild gezeichnet.",
      series: {
        zero: "Geplant mit dem Bisherigen aus {title}.",
        one: "Geplant mit dem Bisherigen aus {title} und {count} Fakt.",
        other: "Geplant mit dem Bisherigen aus {title} und {count} Fakten.",
      },
      seriesUntitled: "dieser Serie",
      plan: { one: "{count} Panel planen", other: "{count} Panels planen" },
      planning: "Plane…",
      cost: {
        one: "Planen kostet {n} Credit.",
        other: "Planen kostet {n} Credits.",
      },
      unavailableTitle: "Story-Planung ist aus",
      unavailable:
        "Setze ANTHROPIC_API_KEY auf dem Server, um Seiten aus einer Story zu planen. Das Panel-Skript funktioniert auch ohne.",
    },
    script: {
      hint: "Schreib jedes Panel selbst: keine KI und keine Credits bis zum Rendern.",
    },
    panel: {
      title: "Panel {n}",
      scene: "Szene",
      scenePlaceholder: "Was passiert, wer ist da, wo.",
      tags: "Tags",
      lines: "Lettering",
      linesPlaceholder:
        "Aki sagt: Wartet auf mich!\nAki denkt: Zu spät…\nCaption: Tokio, 2:14 Uhr",
      cast: "Besetzung",
      castMember: "{name} besetzen",
      bubbles: {
        zero: "",
        one: "{count} Sprechblase",
        other: "{count} Sprechblasen",
      },
    },
    noPanels: {
      title: "Keine Panels auf diesem Slide",
      description:
        "Die Story füllt die Panels, die schon auf dem Slide sind. Wähle zuerst ein Layout.",
    },
    estimate: {
      one: "{count} Panel zu rendern · {credits} Credits",
      other: "{count} Panels zu rendern · {credits} Credits",
    },
    balance: { one: "Du hast {n} Credit.", other: "Du hast {n} Credits." },
    insufficient: "Nicht genug Credits.",
    getMore: "Credits holen",
    openrouter: {
      one: "{count} Panel zu rendern · wird über dein OpenRouter-Konto abgerechnet",
      other:
        "{count} Panels zu rendern · werden über dein OpenRouter-Konto abgerechnet",
    },
    openrouterPlan: "Die Planung wird über dein OpenRouter-Konto abgerechnet.",
    apply: "Auf Slide anwenden",
    applyRender: "Anwenden und rendern",
    rendering: "Rendere {done} von {total}…",
    stop: "Stopp",
    applied: "Auf Slide {slide} angewendet.",
    otherPage:
      "Slide {slide} wird noch geplant; der Plan bleibt bei diesem Slide.",
    errors: {
      changed:
        "Die Panels des Slides haben sich beim Planen geändert, daher wurde der Plan verworfen. Plane erneut.",
      insufficient: "Nicht genug Credits, um diese Seite zu planen.",
      failed: "Planen fehlgeschlagen: {error}",
    },
  },
  it: {
    button: "Storia",
    title: "Dalla storia alla tavola",
    description: {
      one: "Slide {slide} · {count} vignetta. Scrivi la tavola, controlla la vignetta, poi genera.",
      other:
        "Slide {slide} · {count} vignette. Scrivi la tavola, controlla ogni vignetta, poi genera.",
    },
    tabs: { story: "Scrivi una storia", script: "Script per vignetta" },
    story: {
      label: "Storia",
      placeholder:
        "Aki perde l’ultimo treno e gli corre dietro sotto la pioggia.\nAki dice: Aspettatemi!\n\nOppure per vignette: Vignetta 1: …  Vignetta 2: …",
      hint: "Chiama i personaggi come nel cast. «Aki dice: …» e «Aki pensa: …» diventano nuvolette, mai disegnate nell’immagine.",
      series: {
        zero: "Pianificato con quanto precede in {title}.",
        one: "Pianificato con quanto precede in {title} e {count} fatto.",
        other: "Pianificato con quanto precede in {title} e {count} fatti.",
      },
      seriesUntitled: "questa serie",
      plan: {
        one: "Pianifica {count} vignetta",
        other: "Pianifica {count} vignette",
      },
      planning: "Pianificazione…",
      cost: {
        one: "La pianificazione costa {n} credito.",
        other: "La pianificazione costa {n} crediti.",
      },
      unavailableTitle: "La pianificazione è disattivata",
      unavailable:
        "Imposta ANTHROPIC_API_KEY sul server per pianificare le tavole da una storia. Lo script per vignetta funziona anche senza.",
    },
    script: {
      hint: "Scrivi tu ogni vignetta: niente IA e nessun credito finché non generi.",
    },
    panel: {
      title: "Vignetta {n}",
      scene: "Scena",
      scenePlaceholder: "Cosa succede, chi c’è, dove.",
      tags: "Tag",
      lines: "Lettering",
      linesPlaceholder:
        "Aki dice: Aspettatemi!\nAki pensa: Troppo tardi…\nCaption: Tokyo, 2:14",
      cast: "Cast",
      castMember: "Aggiungi {name}",
      bubbles: {
        zero: "",
        one: "{count} nuvoletta",
        other: "{count} nuvolette",
      },
    },
    noPanels: {
      title: "Nessuna vignetta in questa slide",
      description:
        "La storia riempie le vignette già presenti nella slide. Scegli prima un layout.",
    },
    estimate: {
      one: "{count} vignetta da generare · {credits} crediti",
      other: "{count} vignette da generare · {credits} crediti",
    },
    balance: { one: "Hai {n} credito.", other: "Hai {n} crediti." },
    insufficient: "Crediti insufficienti.",
    getMore: "Ottieni crediti",
    openrouter: {
      one: "{count} vignetta da generare · addebitata sul tuo account OpenRouter",
      other:
        "{count} vignette da generare · addebitate sul tuo account OpenRouter",
    },
    openrouterPlan:
      "La pianificazione è addebitata sul tuo account OpenRouter.",
    apply: "Applica alla slide",
    applyRender: "Applica e genera",
    rendering: "Generazione {done} di {total}…",
    stop: "Ferma",
    applied: "Applicato alla slide {slide}.",
    otherPage:
      "La slide {slide} è ancora in pianificazione; il suo piano resta su quella slide.",
    errors: {
      changed:
        "Le vignette della slide sono cambiate durante la pianificazione, quindi il piano è stato scartato. Pianifica di nuovo.",
      insufficient: "Crediti insufficienti per pianificare questa tavola.",
      failed: "Pianificazione non riuscita: {error}",
    },
  },
  ja: {
    button: "ストーリー",
    title: "ストーリーからページへ",
    description: {
      one: "スライド{slide} · {count}コマ。ページを書き、コマを確認してから生成します。",
      other:
        "スライド{slide} · {count}コマ。ページを書き、各コマを確認してから生成します。",
    },
    tabs: { story: "ストーリーを書く", script: "コマ台本" },
    story: {
      label: "ストーリー",
      placeholder:
        "アキは終電に乗り遅れ、雨の中を追いかける。\nアキ「待って！」\n\nコマごとでも：コマ1：…  コマ2：…",
      hint: "キャラクター名はキャストと同じ名前で書いてください。「アキ「…」」や「アキ（…）」はフキダシになり、絵には描かれません。",
      series: {
        zero: "{title}のこれまでの内容を踏まえて計画します。",
        other: "{title}のこれまでの内容と{count}件の設定を踏まえて計画します。",
      },
      seriesUntitled: "このシリーズ",
      plan: { one: "{count}コマを構成", other: "{count}コマを構成" },
      planning: "構成中…",
      cost: {
        one: "構成には{n}クレジットかかります。",
        other: "構成には{n}クレジットかかります。",
      },
      unavailableTitle: "ストーリー構成はオフです",
      unavailable:
        "ストーリーからページを構成するには、サーバーに ANTHROPIC_API_KEY を設定してください。コマ台本はそのまま使えます。",
    },
    script: {
      hint: "各コマを自分で書きます。AIは使わず、生成するまでクレジットはかかりません。",
    },
    panel: {
      title: "コマ{n}",
      scene: "シーン",
      scenePlaceholder: "何が起きて、誰がいて、どこなのか。",
      tags: "タグ",
      lines: "セリフ",
      linesPlaceholder:
        "アキ「待って！」\nアキ（もう遅い…）\nナレーション：東京、午前2時14分",
      cast: "キャスト",
      castMember: "{name}を配役",
      bubbles: {
        zero: "",
        one: "フキダシ{count}個",
        other: "フキダシ{count}個",
      },
    },
    noPanels: {
      title: "このスライドにはコマがありません",
      description:
        "ストーリーはスライドにあるコマを埋めます。先にコマ割りを選んでください。",
    },
    estimate: {
      one: "生成するコマ{count}個 · {credits}クレジット",
      other: "生成するコマ{count}個 · {credits}クレジット",
    },
    balance: { one: "残り{n}クレジット。", other: "残り{n}クレジット。" },
    insufficient: "クレジットが足りません。",
    getMore: "クレジットを購入",
    openrouter: {
      one: "生成するコマ{count}個 · OpenRouterアカウントに請求",
      other: "生成するコマ{count}個 · OpenRouterアカウントに請求",
    },
    openrouterPlan: "構成はOpenRouterアカウントに請求されます。",
    apply: "スライドに適用",
    applyRender: "適用して生成",
    rendering: "{total}コマ中{done}コマを生成中…",
    stop: "停止",
    applied: "スライド{slide}に適用しました。",
    otherPage:
      "スライド{slide}は構成中です。構成結果はそのスライドに残ります。",
    errors: {
      changed:
        "構成中にスライドのコマが変わったため、構成結果を破棄しました。もう一度構成してください。",
      insufficient: "このページを構成するクレジットが足りません。",
      failed: "構成に失敗しました：{error}",
    },
  },
})
