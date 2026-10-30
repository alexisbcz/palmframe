import { defineMessages } from "@/i18n/core"

export const messages = defineMessages({
  en: {
    title: "Compare takes",
    description:
      "See two images of this shot side by side and keep the better one.",
    seed: "Seed {seed}",
    image: "Image of this shot",
    unknown: "Earlier image",
    inUse: "In use",
    use: "Use this",
    empty: "Try the other engine to get something to compare.",
    try: "Try with {engine}",
    cost: { one: "{count} credit", other: "{count} credits" },
    cancel: "Cancel",
    close: "Close",
    noSheet:
      "No one in this shot has a model sheet, so Klein draws it from the prompt alone.",
    openrouter:
      "OpenRouter draws every image with its own model, so there's no other engine to try.",
    short: "You have {balance} credits; this costs {cost}.",
    noCredits: "Not enough credits for this render.",
  },
  fr: {
    title: "Comparer les prises",
    description:
      "Voyez deux images de ce plan côte à côte et gardez la meilleure.",
    seed: "Seed {seed}",
    image: "Image de ce plan",
    unknown: "Image précédente",
    inUse: "Utilisée",
    use: "Utiliser",
    empty: "Essayez l'autre moteur pour avoir de quoi comparer.",
    try: "Essayer avec {engine}",
    cost: { one: "{count} crédit", other: "{count} crédits" },
    cancel: "Annuler",
    close: "Fermer",
    noSheet:
      "Personne dans ce plan n'a de planche de personnage : Klein le dessine à partir du prompt seul.",
    openrouter:
      "OpenRouter dessine chaque image avec son propre modèle : il n'y a pas d'autre moteur à essayer.",
    short: "Vous avez {balance} crédits ; ce rendu en coûte {cost}.",
    noCredits: "Pas assez de crédits pour ce rendu.",
  },
  es: {
    title: "Comparar tomas",
    description:
      "Mira dos imágenes de este plano en paralelo y quédate con la mejor.",
    seed: "Seed {seed}",
    image: "Imagen de este plano",
    unknown: "Imagen anterior",
    inUse: "En uso",
    use: "Usar esta",
    empty: "Prueba el otro motor para tener algo que comparar.",
    try: "Probar con {engine}",
    cost: { one: "{count} crédito", other: "{count} créditos" },
    cancel: "Cancelar",
    close: "Cerrar",
    noSheet:
      "Nadie en este plano tiene hoja de personaje, así que Klein lo dibuja solo a partir del prompt.",
    openrouter:
      "OpenRouter dibuja cada imagen con su propio modelo, así que no hay otro motor que probar.",
    short: "Tienes {balance} créditos; esto cuesta {cost}.",
    noCredits: "No hay créditos suficientes para este render.",
  },
  de: {
    title: "Varianten vergleichen",
    description:
      "Sieh zwei Bilder dieser Einstellung nebeneinander und behalte das bessere.",
    seed: "Seed {seed}",
    image: "Bild dieser Einstellung",
    unknown: "Früheres Bild",
    inUse: "Aktiv",
    use: "Verwenden",
    empty: "Probiere die andere Engine aus, um etwas zum Vergleichen zu haben.",
    try: "Mit {engine} probieren",
    cost: { one: "{count} Credit", other: "{count} Credits" },
    cancel: "Abbrechen",
    close: "Schließen",
    noSheet:
      "Niemand in dieser Einstellung hat ein Model Sheet, daher zeichnet Klein sie nur aus dem Prompt.",
    openrouter:
      "OpenRouter zeichnet jedes Bild mit seinem eigenen Modell, daher gibt es keine andere Engine zum Ausprobieren.",
    short: "Du hast {balance} Credits; das kostet {cost}.",
    noCredits: "Nicht genug Credits für dieses Rendering.",
  },
  it: {
    title: "Confronta le versioni",
    description:
      "Guarda due immagini di questa inquadratura affiancate e tieni la migliore.",
    seed: "Seed {seed}",
    image: "Immagine di questa inquadratura",
    unknown: "Immagine precedente",
    inUse: "In uso",
    use: "Usa questa",
    empty: "Prova l'altro motore per avere qualcosa da confrontare.",
    try: "Prova con {engine}",
    cost: { one: "{count} credito", other: "{count} crediti" },
    cancel: "Annulla",
    close: "Chiudi",
    noSheet:
      "Nessuno in questa inquadratura ha un model sheet, quindi Klein la disegna solo dal prompt.",
    openrouter:
      "OpenRouter disegna ogni immagine con il proprio modello, quindi non c'è un altro motore da provare.",
    short: "Hai {balance} crediti; questo ne costa {cost}.",
    noCredits: "Crediti insufficienti per questo render.",
  },
  ja: {
    title: "テイクを比較",
    description: "このショットの画像を2枚並べて、良いほうを残します。",
    seed: "シード{seed}",
    image: "このショットの画像",
    unknown: "以前の画像",
    inUse: "使用中",
    use: "これを使う",
    empty: "もう一方のエンジンを試すと比較できます。",
    try: "{engine}で試す",
    cost: { other: "{count}クレジット" },
    cancel: "キャンセル",
    close: "閉じる",
    noSheet:
      "このショットにはモデルシートのあるキャラクターがいないため、Kleinはプロンプトだけで描きます。",
    openrouter:
      "OpenRouterはすべての画像を独自のモデルで描くため、試せる別のエンジンはありません。",
    short:
      "残り{balance}クレジットです。この処理には{cost}クレジット必要です。",
    noCredits: "このレンダリングに必要なクレジットが足りません。",
  },
})
