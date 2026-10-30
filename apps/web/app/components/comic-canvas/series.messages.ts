import { defineMessages } from "@/i18n/core"

export const messages = defineMessages({
  en: {
    button: "Series",
    open: "Series: {label}",
    untitled: "Untitled series",
    name: "Series name",
    episode: "Episode {episode} of {episodes}",
    description:
      "Editing a character, place or prop in any carousel updates the series. Each carousel keeps its own copy, so it still opens alone.",
    carousels: { one: "{count} carousel", other: "{count} carousels" },
    newSeries: "New series",
    newCarousel: "New carousel",
    manage: "Manage",
    otherCarousels: "Other carousels",
    empty: "No carousels yet. Add one from its menu, or start a new one.",
    add: "Add to series",
    leave: "Remove from series",
    delete: "Delete series",
    deleteTitle: "Delete {title}?",
    deleteBody:
      "Its carousels stay, each with its own copy of the cast and world. The series' facts are lost.",
    cancel: "Cancel",
    failed: "Something went wrong: {error}",
    unsynced:
      "Your last cast or world change hasn't reached the series. It will be sent with your next edit.",
    picker: {
      title: "Add to a series",
      newTitle: "New series",
      description:
        "Carousels in a series share their cast and world, and the story planner remembers what came before. Characters with the same name become one.",
      name: "Name a new series",
      create: "Create",
    },
    facts: {
      label: "Facts",
      count: "{n}/{max}",
      placeholder: "Aki lost her left glove in episode 2",
      hint: "One per line. The story planner keeps to these in every carousel of the series.",
      save: "Save facts",
    },
    check: {
      run: "Check this carousel against the facts",
      running: "Checking…",
      cost: { one: "{count} credit", other: "{count} credits" },
      openrouter: "On your OpenRouter",
      nothing:
        "To check, the series needs facts and this carousel needs prompts or lettering.",
      short: "Not enough credits for this check.",
      clean: "No contradictions found.",
      proposed: "Only proposals: nothing changes unless you apply it.",
      apply: "Use this wording",
    },
  },
  fr: {
    button: "Série",
    open: "Série : {label}",
    untitled: "Série sans titre",
    name: "Nom de la série",
    episode: "Épisode {episode} sur {episodes}",
    description:
      "Modifier un personnage, un lieu ou un accessoire dans un carrousel met à jour la série. Chaque carrousel garde sa propre copie et s’ouvre donc aussi seul.",
    carousels: { one: "{count} carrousel", other: "{count} carrousels" },
    newSeries: "Nouvelle série",
    newCarousel: "Nouveau carrousel",
    manage: "Gérer",
    otherCarousels: "Autres carrousels",
    empty:
      "Aucun carrousel pour l’instant. Ajoutez-en un depuis son menu, ou créez-en un nouveau.",
    add: "Ajouter à une série",
    leave: "Retirer de la série",
    delete: "Supprimer la série",
    deleteTitle: "Supprimer {title} ?",
    deleteBody:
      "Ses carrousels restent, chacun avec sa copie du casting et de l’univers. Les faits de la série sont perdus.",
    cancel: "Annuler",
    failed: "Un problème est survenu : {error}",
    unsynced:
      "Votre dernière modification du casting ou de l’univers n’a pas atteint la série. Elle sera envoyée à votre prochaine modification.",
    picker: {
      title: "Ajouter à une série",
      newTitle: "Nouvelle série",
      description:
        "Les carrousels d’une série partagent leur casting et leur univers, et le planificateur se souvient de ce qui précède. Les personnages de même nom n’en font plus qu’un.",
      name: "Nommer une nouvelle série",
      create: "Créer",
    },
    facts: {
      label: "Faits",
      count: "{n}/{max}",
      placeholder: "Aki a perdu son gant gauche dans l’épisode 2",
      hint: "Un par ligne. Le planificateur les respecte dans chaque carrousel de la série.",
      save: "Enregistrer les faits",
    },
    check: {
      run: "Comparer ce carrousel aux faits",
      running: "Vérification…",
      cost: { one: "{count} crédit", other: "{count} crédits" },
      openrouter: "Sur votre OpenRouter",
      nothing:
        "Pour vérifier, il faut des faits dans la série, et des prompts ou du lettrage dans ce carrousel.",
      short: "Pas assez de crédits pour cette vérification.",
      clean: "Aucune contradiction trouvée.",
      proposed:
        "Ce ne sont que des propositions : rien ne change sans votre accord.",
      apply: "Utiliser cette formulation",
    },
  },
  es: {
    button: "Serie",
    open: "Serie: {label}",
    untitled: "Serie sin título",
    name: "Nombre de la serie",
    episode: "Episodio {episode} de {episodes}",
    description:
      "Editar un personaje, lugar u objeto en cualquier carrusel actualiza la serie. Cada carrusel guarda su propia copia, así que también se abre solo.",
    carousels: { one: "{count} carrusel", other: "{count} carruseles" },
    newSeries: "Nueva serie",
    newCarousel: "Nuevo carrusel",
    manage: "Gestionar",
    otherCarousels: "Otros carruseles",
    empty: "Aún no hay carruseles. Añade uno desde su menú o crea uno nuevo.",
    add: "Añadir a una serie",
    leave: "Quitar de la serie",
    delete: "Eliminar serie",
    deleteTitle: "¿Eliminar {title}?",
    deleteBody:
      "Sus carruseles se quedan, cada uno con su copia del reparto y del mundo. Los hechos de la serie se pierden.",
    cancel: "Cancelar",
    failed: "Algo ha fallado: {error}",
    unsynced:
      "Tu último cambio en el reparto o el mundo no ha llegado a la serie. Se enviará con tu próxima edición.",
    picker: {
      title: "Añadir a una serie",
      newTitle: "Nueva serie",
      description:
        "Los carruseles de una serie comparten reparto y mundo, y el planificador recuerda lo anterior. Los personajes con el mismo nombre pasan a ser uno.",
      name: "Nombra una serie nueva",
      create: "Crear",
    },
    facts: {
      label: "Hechos",
      count: "{n}/{max}",
      placeholder: "Aki perdió el guante izquierdo en el episodio 2",
      hint: "Uno por línea. El planificador los respeta en cada carrusel de la serie.",
      save: "Guardar hechos",
    },
    check: {
      run: "Comparar este carrusel con los hechos",
      running: "Comprobando…",
      cost: { one: "{count} crédito", other: "{count} créditos" },
      openrouter: "En tu OpenRouter",
      nothing:
        "Para comprobar, la serie necesita hechos y este carrusel, prompts o rotulación.",
      short: "No hay créditos suficientes para esta comprobación.",
      clean: "No se han encontrado contradicciones.",
      proposed: "Solo son propuestas: nada cambia si no lo aplicas.",
      apply: "Usar esta redacción",
    },
  },
  de: {
    button: "Serie",
    open: "Serie: {label}",
    untitled: "Serie ohne Titel",
    name: "Name der Serie",
    episode: "Folge {episode} von {episodes}",
    description:
      "Wenn du eine Figur, einen Ort oder ein Requisit in einem Karussell änderst, wird die Serie aktualisiert. Jedes Karussell behält seine eigene Kopie und lässt sich auch allein öffnen.",
    carousels: { one: "{count} Karussell", other: "{count} Karussells" },
    newSeries: "Neue Serie",
    newCarousel: "Neues Karussell",
    manage: "Verwalten",
    otherCarousels: "Weitere Karussells",
    empty:
      "Noch keine Karussells. Füge eines über sein Menü hinzu oder erstelle ein neues.",
    add: "Zu Serie hinzufügen",
    leave: "Aus Serie entfernen",
    delete: "Serie löschen",
    deleteTitle: "{title} löschen?",
    deleteBody:
      "Die Karussells bleiben, jedes mit seiner Kopie von Besetzung und Welt. Die Fakten der Serie gehen verloren.",
    cancel: "Abbrechen",
    failed: "Etwas ist schiefgelaufen: {error}",
    unsynced:
      "Deine letzte Änderung an Besetzung oder Welt hat die Serie nicht erreicht. Sie wird mit deiner nächsten Änderung gesendet.",
    picker: {
      title: "Zu einer Serie hinzufügen",
      newTitle: "Neue Serie",
      description:
        "Karussells einer Serie teilen Besetzung und Welt, und der Planer erinnert sich an das Bisherige. Figuren mit gleichem Namen werden zu einer.",
      name: "Neue Serie benennen",
      create: "Erstellen",
    },
    facts: {
      label: "Fakten",
      count: "{n}/{max}",
      placeholder: "Aki hat in Folge 2 ihren linken Handschuh verloren",
      hint: "Einer pro Zeile. Der Planer hält sich in jedem Karussell der Serie daran.",
      save: "Fakten speichern",
    },
    check: {
      run: "Dieses Karussell mit den Fakten abgleichen",
      running: "Wird geprüft…",
      cost: { one: "{count} Credit", other: "{count} Credits" },
      openrouter: "Über dein OpenRouter",
      nothing:
        "Zum Prüfen braucht die Serie Fakten und dieses Karussell Prompts oder Lettering.",
      short: "Nicht genug Credits für diese Prüfung.",
      clean: "Keine Widersprüche gefunden.",
      proposed:
        "Nur Vorschläge: Nichts ändert sich, solange du es nicht anwendest.",
      apply: "Diese Formulierung verwenden",
    },
  },
  it: {
    button: "Serie",
    open: "Serie: {label}",
    untitled: "Serie senza titolo",
    name: "Nome della serie",
    episode: "Episodio {episode} di {episodes}",
    description:
      "Modificare un personaggio, un luogo o un oggetto in un carosello aggiorna la serie. Ogni carosello conserva la propria copia, quindi si apre anche da solo.",
    carousels: { one: "{count} carosello", other: "{count} caroselli" },
    newSeries: "Nuova serie",
    newCarousel: "Nuovo carosello",
    manage: "Gestisci",
    otherCarousels: "Altri caroselli",
    empty:
      "Ancora nessun carosello. Aggiungine uno dal suo menu o creane uno nuovo.",
    add: "Aggiungi a una serie",
    leave: "Rimuovi dalla serie",
    delete: "Elimina serie",
    deleteTitle: "Eliminare {title}?",
    deleteBody:
      "I caroselli restano, ciascuno con la propria copia di cast e mondo. I fatti della serie vanno persi.",
    cancel: "Annulla",
    failed: "Qualcosa è andato storto: {error}",
    unsynced:
      "La tua ultima modifica a cast o mondo non ha raggiunto la serie. Verrà inviata con la prossima modifica.",
    picker: {
      title: "Aggiungi a una serie",
      newTitle: "Nuova serie",
      description:
        "I caroselli di una serie condividono cast e mondo, e il pianificatore ricorda ciò che precede. I personaggi con lo stesso nome diventano uno solo.",
      name: "Dai un nome a una nuova serie",
      create: "Crea",
    },
    facts: {
      label: "Fatti",
      count: "{n}/{max}",
      placeholder: "Aki ha perso il guanto sinistro nell’episodio 2",
      hint: "Uno per riga. Il pianificatore li rispetta in ogni carosello della serie.",
      save: "Salva i fatti",
    },
    check: {
      run: "Confronta questo carosello con i fatti",
      running: "Controllo…",
      cost: { one: "{count} credito", other: "{count} crediti" },
      openrouter: "Sul tuo OpenRouter",
      nothing:
        "Per il controllo servono fatti nella serie, e prompt o lettering in questo carosello.",
      short: "Crediti insufficienti per questo controllo.",
      clean: "Nessuna contraddizione trovata.",
      proposed: "Sono solo proposte: non cambia nulla se non le applichi.",
      apply: "Usa questa formulazione",
    },
  },
  ja: {
    button: "シリーズ",
    open: "シリーズ: {label}",
    untitled: "無題のシリーズ",
    name: "シリーズ名",
    episode: "全{episodes}話中 第{episode}話",
    description:
      "どのカルーセルでキャラクターや場所、小物を編集してもシリーズに反映されます。各カルーセルは自分のコピーを持つので、単独でも開けます。",
    carousels: { other: "{count}件のカルーセル" },
    newSeries: "新しいシリーズ",
    newCarousel: "新しいカルーセル",
    manage: "管理",
    otherCarousels: "その他のカルーセル",
    empty:
      "カルーセルはまだありません。各カルーセルのメニューから追加するか、新しく作成してください。",
    add: "シリーズに追加",
    leave: "シリーズから外す",
    delete: "シリーズを削除",
    deleteTitle: "{title}を削除しますか？",
    deleteBody:
      "カルーセルはキャストと世界観のコピーを持ったまま残ります。シリーズの設定は失われます。",
    cancel: "キャンセル",
    failed: "問題が発生しました: {error}",
    unsynced:
      "キャストや世界観の最後の変更がシリーズに届いていません。次の編集時に送信されます。",
    picker: {
      title: "シリーズに追加",
      newTitle: "新しいシリーズ",
      description:
        "シリーズのカルーセルはキャストと世界観を共有し、ストーリープランナーはそれまでの内容を覚えています。同じ名前のキャラクターは一人にまとめられます。",
      name: "新しいシリーズの名前",
      create: "作成",
    },
    facts: {
      label: "設定",
      count: "{n}/{max}",
      placeholder: "アキは第2話で左の手袋をなくした",
      hint: "1行に1つ。ストーリープランナーはシリーズの全カルーセルでこれを守ります。",
      save: "設定を保存",
    },
    check: {
      run: "このカルーセルを設定と照合",
      running: "確認中…",
      cost: { other: "{count}クレジット" },
      openrouter: "OpenRouterで支払い",
      nothing:
        "照合するには、シリーズの設定と、このカルーセルのプロンプトまたは文字が必要です。",
      short: "この確認に必要なクレジットが足りません。",
      clean: "矛盾は見つかりませんでした。",
      proposed: "提案のみです。適用しない限り何も変わりません。",
      apply: "この表現を使う",
    },
  },
})
