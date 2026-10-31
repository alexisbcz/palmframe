import {
  DEFAULT_LOCALE,
  defineMessages,
  isLocale,
  type MessagePath,
} from "@/i18n/core"
import { ImportError } from "@/lib/comic-import/errors"
import {
  StyleRequestError,
  type StyleErrorCode,
} from "@/lib/comic-import/style"
import { INSUFFICIENT_CREDITS } from "@/lib/credits-store"

export const messages = defineMessages({
  en: {
    library: {
      title: "Your styles",
      import: "Import a comic",
      signIn: "Sign in to learn a style from a comic you own.",
      empty: "Upload a comic and draw in its style.",
      stop: "Stop using",
      delete: "Delete",
      confirmDelete: "Delete for good?",
      finish: "Finish {name} · {credits} credits",
      cost: "{credits} credits to finish",
      incomplete: "Upload unfinished",
      deleteNamed: "Delete {name}",
      use: "Use {name}",
      textOnly:
        "No model here can see images, so panels follow the written analysis only. Connect OpenRouter in Settings to draw from the pages too.",
      unavailable:
        "This carousel's style isn't in your library any more, so panels can't be drawn from it. Pick another one.",
      loadFailed: "Couldn't load your styles.",
    },
    dialog: {
      title: "Learn a style from a comic",
      description:
        "Pick pages that show the drawing at its best. New panels take the line, palette and panel rhythm, never the characters, logos or text.",
      drop: "Drop a comic here",
      formats: "JPG, PNG, WebP, GIF, TIFF, PDF, CBZ, CBR, CB7, CBT or ZIP",
      browse: "Choose files",
      opening: "Opening…",
      device:
        "Your file stays on this device. Only the pages you pick are uploaded, downscaled and private to you.",
      skipped: "Skipped {file}: {reason}",
      pick: "Pick up to {max} pages",
      picked: "{count} of {max} picked",
      page: "Page {label}",
      unreadable: "Unreadable",
      name: "Style name",
      namePlaceholder: "Inky western",
      rights: "I own this or have permission to use it for reference",
      save: "Learn style · {credits} credits",
      preparing: "Preparing…",
      uploading: "Uploading page {count} of {total}…",
      analyzing: "Reading the style…",
      retry: "Try again",
      cancel: "Cancel",
      another: "Choose other files",
      noCredits: "You're out of credits.",
      failed: "That didn't work. Try again.",
    },
    errors: {
      unsupported: "this file type isn't supported",
      file_too_large: "the file is too big to open on this device",
      drop_too_large: "those files are too big to open together on this device",
      too_many_files: "that's too many files at once",
      too_many_entries: "the archive holds too many files",
      too_many_pages: "it has too many pages",
      expands_too_much: "it unpacks to far more than a comic should",
      no_pages: "no pages found inside",
      encrypted: "it's password protected",
      multi_volume: "it's split into volumes, so join them first",
      corrupt: "it's damaged or password protected",
      page_too_large: "a page is too large",
      timed_out: "it took too long to open",
    },
    styleErrors: {
      invalid: "That request wasn't valid.",
      sign_in: "Sign in to use styles.",
      rights_required: "Confirm you may use these pages first.",
      limit_reached: "You have too many styles. Delete one first.",
      not_found: "This style no longer exists.",
      page_missing:
        "A page didn't finish uploading. Delete this draft and import it again.",
      page_too_large: "A page is too large.",
      page_not_jpeg: "A page couldn't be read as an image.",
      not_set_up:
        "Style analysis isn't available here. Connect OpenRouter in Settings.",
      declined: "The analysis declined these pages.",
      cut_short: "The analysis came back cut short. Try again.",
      unreadable: "The analysis came back unreadable. Try again.",
      analysis_failed: "The analysis failed. Try again.",
      charge_failed: "Your credits couldn't be charged. Try again.",
      openrouter_credits: "Your OpenRouter account is out of credits.",
      style_unavailable:
        "This style is gone, or it belongs to someone else. Pick another one in Look.",
      needs_openrouter:
        "Drawing from reference pages needs a connected OpenRouter account here. Connect one in Settings.",
      failed: "That didn't work. Try again.",
    },
  },
  fr: {
    library: {
      title: "Vos styles",
      import: "Importer une BD",
      signIn:
        "Connectez-vous pour apprendre le style d'une BD qui vous appartient.",
      empty: "Importez une BD et dessinez dans son style.",
      stop: "Ne plus utiliser",
      delete: "Supprimer",
      confirmDelete: "Supprimer définitivement ?",
      finish: "Terminer {name} · {credits} crédits",
      cost: "{credits} crédits pour terminer",
      incomplete: "Envoi inachevé",
      deleteNamed: "Supprimer {name}",
      use: "Utiliser {name}",
      textOnly:
        "Aucun modèle ici ne peut voir les images : les cases suivent seulement l'analyse écrite. Connectez OpenRouter dans les réglages pour dessiner aussi à partir des pages.",
      unavailable:
        "Le style de ce carrousel n'est plus dans votre bibliothèque, les cases ne peuvent donc plus en être dessinées. Choisissez-en un autre.",
      loadFailed: "Impossible de charger vos styles.",
    },
    dialog: {
      title: "Apprendre un style depuis une BD",
      description:
        "Choisissez les pages où le dessin est le plus représentatif. Les nouvelles cases reprennent le trait, la palette et le rythme des cases, jamais les personnages, logos ou textes.",
      drop: "Déposez une BD ici",
      formats: "JPG, PNG, WebP, GIF, TIFF, PDF, CBZ, CBR, CB7, CBT ou ZIP",
      browse: "Choisir des fichiers",
      opening: "Ouverture…",
      device:
        "Votre fichier reste sur cet appareil. Seules les pages choisies sont envoyées, réduites et privées.",
      skipped: "{file} ignoré : {reason}",
      pick: "Choisissez jusqu'à {max} pages",
      picked: "{count} sur {max} choisies",
      page: "Page {label}",
      unreadable: "Illisible",
      name: "Nom du style",
      namePlaceholder: "Western à l'encre",
      rights:
        "Cette œuvre m'appartient ou j'ai l'autorisation de l'utiliser comme référence",
      save: "Apprendre le style · {credits} crédits",
      preparing: "Préparation…",
      uploading: "Envoi de la page {count} sur {total}…",
      analyzing: "Lecture du style…",
      retry: "Réessayer",
      cancel: "Annuler",
      another: "Choisir d'autres fichiers",
      noCredits: "Vous n'avez plus de crédits.",
      failed: "Ça n'a pas marché. Réessayez.",
    },
    errors: {
      unsupported: "ce type de fichier n'est pas pris en charge",
      file_too_large: "le fichier est trop lourd pour cet appareil",
      drop_too_large:
        "ces fichiers sont trop lourds à ouvrir ensemble sur cet appareil",
      too_many_files: "trop de fichiers à la fois",
      too_many_entries: "l'archive contient trop de fichiers",
      too_many_pages: "il y a trop de pages",
      expands_too_much: "il se décompresse bien au-delà de la taille d'une BD",
      no_pages: "aucune page trouvée",
      encrypted: "il est protégé par un mot de passe",
      multi_volume: "il est découpé en volumes, réunissez-les d'abord",
      corrupt: "il est endommagé ou protégé par un mot de passe",
      page_too_large: "une page est trop grande",
      timed_out: "l'ouverture a pris trop de temps",
    },
    styleErrors: {
      invalid: "Cette requête n'est pas valide.",
      sign_in: "Connectez-vous pour utiliser les styles.",
      rights_required: "Confirmez d'abord que vous pouvez utiliser ces pages.",
      limit_reached: "Vous avez trop de styles. Supprimez-en un d'abord.",
      not_found: "Ce style n'existe plus.",
      page_missing:
        "Une page n'a pas fini d'être envoyée. Supprimez ce brouillon et importez-le à nouveau.",
      page_too_large: "Une page est trop grande.",
      page_not_jpeg: "Une page n'a pas pu être lue comme une image.",
      not_set_up:
        "L'analyse de style n'est pas disponible ici. Connectez OpenRouter dans les réglages.",
      declined: "L'analyse a refusé ces pages.",
      cut_short: "L'analyse a été interrompue. Réessayez.",
      unreadable: "L'analyse est illisible. Réessayez.",
      analysis_failed: "L'analyse a échoué. Réessayez.",
      charge_failed: "Vos crédits n'ont pas pu être débités. Réessayez.",
      openrouter_credits: "Votre compte OpenRouter n'a plus de crédits.",
      style_unavailable:
        "Ce style n'existe plus ou appartient à quelqu'un d'autre. Choisissez-en un autre dans Look.",
      needs_openrouter:
        "Dessiner à partir de pages de référence nécessite ici un compte OpenRouter connecté. Connectez-en un dans les réglages.",
      failed: "Ça n'a pas marché. Réessayez.",
    },
  },
  es: {
    library: {
      title: "Tus estilos",
      import: "Importar un cómic",
      signIn: "Inicia sesión para aprender el estilo de un cómic tuyo.",
      empty: "Sube un cómic y dibuja con su estilo.",
      stop: "Dejar de usar",
      delete: "Eliminar",
      confirmDelete: "¿Eliminar para siempre?",
      finish: "Terminar {name} · {credits} créditos",
      cost: "{credits} créditos para terminar",
      incomplete: "Subida sin terminar",
      deleteNamed: "Eliminar {name}",
      use: "Usar {name}",
      textOnly:
        "Aquí ningún modelo puede ver imágenes, así que las viñetas siguen solo el análisis escrito. Conecta OpenRouter en Ajustes para dibujar también a partir de las páginas.",
      unavailable:
        "El estilo de este carrusel ya no está en tu biblioteca, así que no se pueden dibujar viñetas con él. Elige otro.",
      loadFailed: "No se han podido cargar tus estilos.",
    },
    dialog: {
      title: "Aprender un estilo de un cómic",
      description:
        "Elige las páginas que mejor muestren el dibujo. Las viñetas nuevas toman el trazo, la paleta y el ritmo, nunca los personajes, logos ni textos.",
      drop: "Suelta un cómic aquí",
      formats: "JPG, PNG, WebP, GIF, TIFF, PDF, CBZ, CBR, CB7, CBT o ZIP",
      browse: "Elegir archivos",
      opening: "Abriendo…",
      device:
        "Tu archivo se queda en este dispositivo. Solo se suben las páginas elegidas, reducidas y privadas.",
      skipped: "Se omitió {file}: {reason}",
      pick: "Elige hasta {max} páginas",
      picked: "{count} de {max} elegidas",
      page: "Página {label}",
      unreadable: "Ilegible",
      name: "Nombre del estilo",
      namePlaceholder: "Western a tinta",
      rights: "Es mío o tengo permiso para usarlo como referencia",
      save: "Aprender estilo · {credits} créditos",
      preparing: "Preparando…",
      uploading: "Subiendo la página {count} de {total}…",
      analyzing: "Leyendo el estilo…",
      retry: "Reintentar",
      cancel: "Cancelar",
      another: "Elegir otros archivos",
      noCredits: "Te has quedado sin créditos.",
      failed: "No ha funcionado. Inténtalo de nuevo.",
    },
    errors: {
      unsupported: "este tipo de archivo no es compatible",
      file_too_large: "el archivo es demasiado grande para este dispositivo",
      drop_too_large:
        "esos archivos son demasiado grandes para abrirlos juntos en este dispositivo",
      too_many_files: "son demasiados archivos a la vez",
      too_many_entries: "el archivo comprimido contiene demasiados archivos",
      too_many_pages: "tiene demasiadas páginas",
      expands_too_much:
        "se descomprime muy por encima de lo que ocupa un cómic",
      no_pages: "no se han encontrado páginas",
      encrypted: "está protegido con contraseña",
      multi_volume: "está dividido en volúmenes, únelos primero",
      corrupt: "está dañado o protegido con contraseña",
      page_too_large: "una página es demasiado grande",
      timed_out: "ha tardado demasiado en abrirse",
    },
    styleErrors: {
      invalid: "Esa solicitud no es válida.",
      sign_in: "Inicia sesión para usar estilos.",
      rights_required: "Confirma primero que puedes usar estas páginas.",
      limit_reached: "Tienes demasiados estilos. Elimina uno primero.",
      not_found: "Este estilo ya no existe.",
      page_missing:
        "Una página no terminó de subirse. Elimina este borrador e impórtalo de nuevo.",
      page_too_large: "Una página es demasiado grande.",
      page_not_jpeg: "Una página no se ha podido leer como imagen.",
      not_set_up:
        "El análisis de estilo no está disponible aquí. Conecta OpenRouter en Ajustes.",
      declined: "El análisis ha rechazado estas páginas.",
      cut_short: "El análisis ha llegado incompleto. Inténtalo de nuevo.",
      unreadable: "El análisis es ilegible. Inténtalo de nuevo.",
      analysis_failed: "El análisis ha fallado. Inténtalo de nuevo.",
      charge_failed:
        "No se han podido cobrar tus créditos. Inténtalo de nuevo.",
      openrouter_credits: "Tu cuenta de OpenRouter se ha quedado sin créditos.",
      style_unavailable:
        "Este estilo ya no existe o pertenece a otra persona. Elige otro en Look.",
      needs_openrouter:
        "Dibujar a partir de páginas de referencia requiere aquí una cuenta de OpenRouter conectada. Conecta una en Ajustes.",
      failed: "No ha funcionado. Inténtalo de nuevo.",
    },
  },
  de: {
    library: {
      title: "Deine Stile",
      import: "Comic importieren",
      signIn: "Melde dich an, um den Stil eines eigenen Comics zu lernen.",
      empty: "Lade einen Comic hoch und zeichne in seinem Stil.",
      stop: "Nicht mehr verwenden",
      delete: "Löschen",
      confirmDelete: "Endgültig löschen?",
      finish: "{name} fertigstellen · {credits} Credits",
      cost: "{credits} Credits zum Fertigstellen",
      incomplete: "Upload unvollständig",
      deleteNamed: "{name} löschen",
      use: "{name} verwenden",
      textOnly:
        "Hier kann kein Modell Bilder sehen, Panels folgen also nur der schriftlichen Analyse. Verbinde OpenRouter in den Einstellungen, um auch aus den Seiten zu zeichnen.",
      unavailable:
        "Der Stil dieses Karussells ist nicht mehr in deiner Bibliothek, daher lassen sich keine Panels damit zeichnen. Wähle einen anderen.",
      loadFailed: "Deine Stile konnten nicht geladen werden.",
    },
    dialog: {
      title: "Stil aus einem Comic lernen",
      description:
        "Wähle Seiten, die die Zeichnung am besten zeigen. Neue Panels übernehmen Strich, Palette und Panelrhythmus, niemals Figuren, Logos oder Text.",
      drop: "Comic hier ablegen",
      formats: "JPG, PNG, WebP, GIF, TIFF, PDF, CBZ, CBR, CB7, CBT oder ZIP",
      browse: "Dateien auswählen",
      opening: "Wird geöffnet…",
      device:
        "Deine Datei bleibt auf diesem Gerät. Nur die gewählten Seiten werden hochgeladen, verkleinert und privat.",
      skipped: "{file} übersprungen: {reason}",
      pick: "Wähle bis zu {max} Seiten",
      picked: "{count} von {max} gewählt",
      page: "Seite {label}",
      unreadable: "Nicht lesbar",
      name: "Name des Stils",
      namePlaceholder: "Western in Tusche",
      rights: "Das gehört mir oder ich darf es als Referenz verwenden",
      save: "Stil lernen · {credits} Credits",
      preparing: "Wird vorbereitet…",
      uploading: "Seite {count} von {total} wird hochgeladen…",
      analyzing: "Stil wird gelesen…",
      retry: "Erneut versuchen",
      cancel: "Abbrechen",
      another: "Andere Dateien wählen",
      noCredits: "Du hast keine Credits mehr.",
      failed: "Das hat nicht geklappt. Versuch es noch einmal.",
    },
    errors: {
      unsupported: "dieser Dateityp wird nicht unterstützt",
      file_too_large: "die Datei ist zu groß für dieses Gerät",
      drop_too_large: "diese Dateien sind zusammen zu groß für dieses Gerät",
      too_many_files: "das sind zu viele Dateien auf einmal",
      too_many_entries: "das Archiv enthält zu viele Dateien",
      too_many_pages: "sie hat zu viele Seiten",
      expands_too_much: "sie entpackt sich weit über Comicgröße hinaus",
      no_pages: "keine Seiten gefunden",
      encrypted: "sie ist passwortgeschützt",
      multi_volume: "sie ist in Volumes geteilt, füge sie zuerst zusammen",
      corrupt: "sie ist beschädigt oder passwortgeschützt",
      page_too_large: "eine Seite ist zu groß",
      timed_out: "das Öffnen hat zu lange gedauert",
    },
    styleErrors: {
      invalid: "Diese Anfrage ist ungültig.",
      sign_in: "Melde dich an, um Stile zu verwenden.",
      rights_required:
        "Bestätige zuerst, dass du diese Seiten verwenden darfst.",
      limit_reached: "Du hast zu viele Stile. Lösche zuerst einen.",
      not_found: "Diesen Stil gibt es nicht mehr.",
      page_missing:
        "Eine Seite wurde nicht fertig hochgeladen. Lösche diesen Entwurf und importiere ihn erneut.",
      page_too_large: "Eine Seite ist zu groß.",
      page_not_jpeg: "Eine Seite konnte nicht als Bild gelesen werden.",
      not_set_up:
        "Die Stilanalyse ist hier nicht verfügbar. Verbinde OpenRouter in den Einstellungen.",
      declined: "Die Analyse hat diese Seiten abgelehnt.",
      cut_short:
        "Die Analyse kam unvollständig zurück. Versuche es noch einmal.",
      unreadable: "Die Analyse war nicht lesbar. Versuche es noch einmal.",
      analysis_failed:
        "Die Analyse ist fehlgeschlagen. Versuche es noch einmal.",
      charge_failed:
        "Deine Credits konnten nicht abgebucht werden. Versuche es noch einmal.",
      openrouter_credits: "Dein OpenRouter-Konto hat keine Credits mehr.",
      style_unavailable:
        "Dieser Stil existiert nicht mehr oder gehört jemand anderem. Wähle unter Look einen anderen.",
      needs_openrouter:
        "Zum Zeichnen nach Referenzseiten braucht es hier ein verbundenes OpenRouter-Konto. Verbinde eines in den Einstellungen.",
      failed: "Das hat nicht geklappt. Versuche es noch einmal.",
    },
  },
  it: {
    library: {
      title: "I tuoi stili",
      import: "Importa un fumetto",
      signIn: "Accedi per imparare lo stile di un fumetto tuo.",
      empty: "Carica un fumetto e disegna nel suo stile.",
      stop: "Non usare più",
      delete: "Elimina",
      confirmDelete: "Eliminare definitivamente?",
      finish: "Completa {name} · {credits} crediti",
      cost: "{credits} crediti per completare",
      incomplete: "Caricamento incompleto",
      deleteNamed: "Elimina {name}",
      use: "Usa {name}",
      textOnly:
        "Qui nessun modello può vedere le immagini, quindi le vignette seguono solo l'analisi scritta. Collega OpenRouter nelle Impostazioni per disegnare anche dalle pagine.",
      unavailable:
        "Lo stile di questo carosello non è più nella tua libreria, quindi non si possono disegnare vignette con esso. Scegline un altro.",
      loadFailed: "Impossibile caricare i tuoi stili.",
    },
    dialog: {
      title: "Impara uno stile da un fumetto",
      description:
        "Scegli le pagine che mostrano meglio il disegno. Le nuove vignette riprendono tratto, palette e ritmo, mai personaggi, loghi o testi.",
      drop: "Trascina qui un fumetto",
      formats: "JPG, PNG, WebP, GIF, TIFF, PDF, CBZ, CBR, CB7, CBT o ZIP",
      browse: "Scegli file",
      opening: "Apertura…",
      device:
        "Il tuo file resta su questo dispositivo. Vengono caricate solo le pagine scelte, ridotte e private.",
      skipped: "{file} saltato: {reason}",
      pick: "Scegli fino a {max} pagine",
      picked: "{count} di {max} scelte",
      page: "Pagina {label}",
      unreadable: "Illeggibile",
      name: "Nome dello stile",
      namePlaceholder: "Western a inchiostro",
      rights: "È mio o ho il permesso di usarlo come riferimento",
      save: "Impara lo stile · {credits} crediti",
      preparing: "Preparazione…",
      uploading: "Caricamento della pagina {count} di {total}…",
      analyzing: "Lettura dello stile…",
      retry: "Riprova",
      cancel: "Annulla",
      another: "Scegli altri file",
      noCredits: "Hai finito i crediti.",
      failed: "Non ha funzionato. Riprova.",
    },
    errors: {
      unsupported: "questo tipo di file non è supportato",
      file_too_large: "il file è troppo grande per questo dispositivo",
      drop_too_large:
        "questi file sono troppo grandi da aprire insieme su questo dispositivo",
      too_many_files: "troppi file in una volta",
      too_many_entries: "l'archivio contiene troppi file",
      too_many_pages: "ha troppe pagine",
      expands_too_much: "si decomprime ben oltre le dimensioni di un fumetto",
      no_pages: "nessuna pagina trovata",
      encrypted: "è protetto da password",
      multi_volume: "è diviso in volumi, uniscili prima",
      corrupt: "è danneggiato o protetto da password",
      page_too_large: "una pagina è troppo grande",
      timed_out: "l'apertura ha richiesto troppo tempo",
    },
    styleErrors: {
      invalid: "Questa richiesta non è valida.",
      sign_in: "Accedi per usare gli stili.",
      rights_required: "Conferma prima di poter usare queste pagine.",
      limit_reached: "Hai troppi stili. Eliminane prima uno.",
      not_found: "Questo stile non esiste più.",
      page_missing:
        "Una pagina non è stata caricata del tutto. Elimina questa bozza e importala di nuovo.",
      page_too_large: "Una pagina è troppo grande.",
      page_not_jpeg: "Non è stato possibile leggere una pagina come immagine.",
      not_set_up:
        "L'analisi dello stile non è disponibile qui. Collega OpenRouter nelle impostazioni.",
      declined: "L'analisi ha rifiutato queste pagine.",
      cut_short: "L'analisi è arrivata incompleta. Riprova.",
      unreadable: "L'analisi è illeggibile. Riprova.",
      analysis_failed: "L'analisi non è riuscita. Riprova.",
      charge_failed: "Non è stato possibile addebitare i crediti. Riprova.",
      openrouter_credits: "Il tuo account OpenRouter ha esaurito i crediti.",
      style_unavailable:
        "Questo stile non esiste più o appartiene a qualcun altro. Scegline un altro in Look.",
      needs_openrouter:
        "Per disegnare da pagine di riferimento serve qui un account OpenRouter collegato. Collegane uno nelle impostazioni.",
      failed: "Non ha funzionato. Riprova.",
    },
  },
  ja: {
    library: {
      title: "マイスタイル",
      import: "コミックを取り込む",
      signIn: "自分のコミックからスタイルを学習するにはログインしてください。",
      empty: "コミックをアップロードして、そのスタイルで描けます。",
      stop: "使用をやめる",
      delete: "削除",
      confirmDelete: "完全に削除しますか?",
      finish: "{name} を完成させる · {credits} クレジット",
      cost: "完成に {credits} クレジット",
      incomplete: "アップロード未完了",
      deleteNamed: "{name} を削除",
      use: "{name}を使う",
      textOnly:
        "ここでは画像を読めるモデルがないため、コマは文章の分析だけに従います。ページからも描くには設定でOpenRouterを接続してください。",
      unavailable:
        "このカルーセルのスタイルはライブラリにないため、描画に使えません。別のスタイルを選んでください。",
      loadFailed: "スタイルを読み込めませんでした。",
    },
    dialog: {
      title: "コミックからスタイルを学習",
      description:
        "絵柄がよくわかるページを選んでください。新しいコマが受け継ぐのは線、配色、コマのリズムだけで、キャラクター、ロゴ、文字は使いません。",
      drop: "ここにコミックをドロップ",
      formats: "JPG、PNG、WebP、GIF、TIFF、PDF、CBZ、CBR、CB7、CBT、ZIP",
      browse: "ファイルを選択",
      opening: "開いています…",
      device:
        "ファイルはこの端末に残ります。アップロードされるのは選んだページだけで、縮小され非公開で保存されます。",
      skipped: "{file}をスキップしました: {reason}",
      pick: "最大{max}ページ選んでください",
      picked: "{max}ページ中{count}ページ選択",
      page: "{label}ページ",
      unreadable: "読み取れません",
      name: "スタイル名",
      namePlaceholder: "インクの西部劇",
      rights: "これは私のものであるか、参考として使用する許可を得ています",
      save: "スタイルを学習 · {credits}クレジット",
      preparing: "準備しています…",
      uploading: "{total}ページ中{count}ページ目をアップロード中…",
      analyzing: "スタイルを読み取っています…",
      retry: "もう一度試す",
      cancel: "キャンセル",
      another: "別のファイルを選ぶ",
      noCredits: "クレジットがありません。",
      failed: "うまくいきませんでした。もう一度お試しください。",
    },
    errors: {
      unsupported: "このファイル形式には対応していません",
      file_too_large: "ファイルがこのデバイスには大きすぎます",
      drop_too_large: "ファイルをまとめて開くにはこのデバイスでは大きすぎます",
      too_many_files: "一度に扱えるファイル数を超えています",
      too_many_entries: "アーカイブ内のファイルが多すぎます",
      too_many_pages: "ページ数が多すぎます",
      expands_too_much: "展開後のサイズがコミックとして大きすぎます",
      no_pages: "ページが見つかりません",
      encrypted: "パスワードで保護されています",
      multi_volume: "分割されているため、先に結合してください",
      corrupt: "破損しているか、パスワードで保護されています",
      page_too_large: "ページが大きすぎます",
      timed_out: "開くのに時間がかかりすぎました",
    },
    styleErrors: {
      invalid: "リクエストが無効です。",
      sign_in: "スタイルを使うにはサインインしてください。",
      rights_required: "先にこのページを使用できることを確認してください。",
      limit_reached: "スタイルが多すぎます。先に1つ削除してください。",
      not_found: "このスタイルはもう存在しません。",
      page_missing:
        "アップロードが完了していないページがあります。この下書きを削除して、もう一度読み込んでください。",
      page_too_large: "ページが大きすぎます。",
      page_not_jpeg: "画像として読み取れないページがあります。",
      not_set_up:
        "ここではスタイル分析を利用できません。設定で OpenRouter を接続してください。",
      declined: "分析でこれらのページが拒否されました。",
      cut_short: "分析が途中で切れました。もう一度お試しください。",
      unreadable: "分析結果を読み取れませんでした。もう一度お試しください。",
      analysis_failed: "分析に失敗しました。もう一度お試しください。",
      charge_failed:
        "クレジットを消費できませんでした。もう一度お試しください。",
      openrouter_credits: "OpenRouter アカウントのクレジットがなくなりました。",
      style_unavailable:
        "このスタイルは削除されたか、他の人のものです。Look で別のスタイルを選んでください。",
      needs_openrouter:
        "ここで参照ページから描くには、OpenRouter アカウントの接続が必要です。設定で接続してください。",
      failed: "うまくいきませんでした。もう一度お試しください。",
    },
  },
})

// Which message says what went wrong, whatever threw it. Anything unknown gets
// the general one, so a raw code or a library's English never reaches a person.
export function errorKey(e: unknown): MessagePath<(typeof messages)["en"]> {
  if (e instanceof ImportError) return `errors.${e.code}`
  if (e instanceof StyleRequestError) return `styleErrors.${e.code}`
  if (e instanceof Error && e.message === INSUFFICIENT_CREDITS)
    return "dialog.noCredits"
  return "dialog.failed"
}

// For code outside React, such as a render call.
export const styleErrorText = (code: StyleErrorCode, lang: string) =>
  messages[isLocale(lang) ? lang : DEFAULT_LOCALE].styleErrors[code]
