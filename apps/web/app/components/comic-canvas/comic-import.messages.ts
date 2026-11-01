import { defineMessages } from "@/i18n/core"

export const messages = defineMessages({
  en: {
    open: "Import a comic",
    title: "Import a comic",
    description:
      "Each file becomes a project you can edit, one slide per page. Pick several to bring in a whole series.",
    drop: "Drop comics here",
    formats: "CBR, CBZ, CB7, CBT, ZIP, PDF or images",
    browse: "Choose files",
    selected: { one: "{count} file ready", other: "{count} files ready" },
    rights: "I own this comic or have permission to use it",
    storage:
      "Pages are stored in your account at reading quality. Like all your project images, each has a public address that's hard to guess, so anyone given one can open it.",
    start: "Import",
    cancel: "Cancel",
    opening: "Opening {book} ({done} of {total})",
    pages: "{book}: page {count} of {total}",
    skipped: "Skipped {file}: {reason}",
    badPages: {
      one: "{file}: {count} unreadable page left out",
      other: "{file}: {count} unreadable pages left out",
    },
    failed: "The import stopped. Projects already made are in your list.",
    done: {
      one: "{count} project imported.",
      other: "{count} projects imported.",
    },
    close: "Close",
  },
  fr: {
    open: "Importer une BD",
    title: "Importer une BD",
    description:
      "Chaque fichier devient un projet modifiable, une slide par page. Choisissez-en plusieurs pour importer une série entière.",
    drop: "Déposez vos BD ici",
    formats: "CBR, CBZ, CB7, CBT, ZIP, PDF ou images",
    browse: "Choisir des fichiers",
    selected: { one: "{count} fichier prêt", other: "{count} fichiers prêts" },
    rights: "Cette BD m’appartient ou j’ai le droit de l’utiliser",
    storage:
      "Les pages sont stockées sur votre compte en qualité de lecture. Comme toutes les images de vos projets, chacune a une adresse publique difficile à deviner : toute personne qui l’obtient peut l’ouvrir.",
    start: "Importer",
    cancel: "Annuler",
    opening: "Ouverture de {book} ({done} sur {total})",
    pages: "{book} : page {count} sur {total}",
    skipped: "Ignoré {file} : {reason}",
    badPages: {
      one: "{file} : {count} page illisible laissée de côté",
      other: "{file} : {count} pages illisibles laissées de côté",
    },
    failed:
      "L’import s’est arrêté. Les projets déjà créés sont dans votre liste.",
    done: {
      one: "{count} projet importé.",
      other: "{count} projets importés.",
    },
    close: "Fermer",
  },
  es: {
    open: "Importar un cómic",
    title: "Importar un cómic",
    description:
      "Cada archivo se convierte en un proyecto editable, una diapositiva por página. Elige varios para traer una serie entera.",
    drop: "Suelta tus cómics aquí",
    formats: "CBR, CBZ, CB7, CBT, ZIP, PDF o imágenes",
    browse: "Elegir archivos",
    selected: {
      one: "{count} archivo listo",
      other: "{count} archivos listos",
    },
    rights: "Este cómic es mío o tengo permiso para usarlo",
    storage:
      "Las páginas se guardan en tu cuenta con calidad de lectura. Como todas las imágenes de tus proyectos, cada una tiene una dirección pública difícil de adivinar: quien la reciba podrá abrirla.",
    start: "Importar",
    cancel: "Cancelar",
    opening: "Abriendo {book} ({done} de {total})",
    pages: "{book}: página {count} de {total}",
    skipped: "Omitido {file}: {reason}",
    badPages: {
      one: "{file}: {count} página ilegible omitida",
      other: "{file}: {count} páginas ilegibles omitidas",
    },
    failed:
      "La importación se detuvo. Los proyectos ya creados están en tu lista.",
    done: {
      one: "{count} proyecto importado.",
      other: "{count} proyectos importados.",
    },
    close: "Cerrar",
  },
  de: {
    open: "Comic importieren",
    title: "Comic importieren",
    description:
      "Jede Datei wird zu einem bearbeitbaren Projekt, eine Folie pro Seite. Wähle mehrere aus, um eine ganze Reihe zu holen.",
    drop: "Comics hier ablegen",
    formats: "CBR, CBZ, CB7, CBT, ZIP, PDF oder Bilder",
    browse: "Dateien wählen",
    selected: { one: "{count} Datei bereit", other: "{count} Dateien bereit" },
    rights: "Dieser Comic gehört mir, oder ich darf ihn verwenden",
    storage:
      "Die Seiten werden in Lesequalität in deinem Konto gespeichert. Wie alle Projektbilder hat jede eine schwer zu erratende öffentliche Adresse: Wer sie bekommt, kann sie öffnen.",
    start: "Importieren",
    cancel: "Abbrechen",
    opening: "{book} wird geöffnet ({done} von {total})",
    pages: "{book}: Seite {count} von {total}",
    skipped: "{file} übersprungen: {reason}",
    badPages: {
      one: "{file}: {count} unlesbare Seite ausgelassen",
      other: "{file}: {count} unlesbare Seiten ausgelassen",
    },
    failed:
      "Der Import wurde abgebrochen. Bereits erstellte Projekte stehen in deiner Liste.",
    done: {
      one: "{count} Projekt importiert.",
      other: "{count} Projekte importiert.",
    },
    close: "Schließen",
  },
  it: {
    open: "Importa un fumetto",
    title: "Importa un fumetto",
    description:
      "Ogni file diventa un progetto modificabile, una slide per pagina. Scegline diversi per portare un'intera serie.",
    drop: "Trascina qui i fumetti",
    formats: "CBR, CBZ, CB7, CBT, ZIP, PDF o immagini",
    browse: "Scegli i file",
    selected: { one: "{count} file pronto", other: "{count} file pronti" },
    rights: "Questo fumetto è mio o ho il permesso di usarlo",
    storage:
      "Le pagine sono salvate nel tuo account in qualità di lettura. Come tutte le immagini dei tuoi progetti, ognuna ha un indirizzo pubblico difficile da indovinare: chi lo riceve può aprirla.",
    start: "Importa",
    cancel: "Annulla",
    opening: "Apertura di {book} ({done} di {total})",
    pages: "{book}: pagina {count} di {total}",
    skipped: "Saltato {file}: {reason}",
    badPages: {
      one: "{file}: {count} pagina illeggibile esclusa",
      other: "{file}: {count} pagine illeggibili escluse",
    },
    failed:
      "L'importazione si è fermata. I progetti già creati sono nel tuo elenco.",
    done: {
      one: "{count} progetto importato.",
      other: "{count} progetti importati.",
    },
    close: "Chiudi",
  },
  ja: {
    open: "コミックを取り込む",
    title: "コミックを取り込む",
    description:
      "ファイルごとに編集できるプロジェクトになり、1ページが1スライドになります。複数選ぶとシリーズ全体を取り込めます。",
    drop: "ここにコミックをドロップ",
    formats: "CBR、CBZ、CB7、CBT、ZIP、PDF、画像",
    browse: "ファイルを選択",
    selected: { other: "{count} 個のファイルを準備しました" },
    rights: "このコミックは自分のもの、または使用の許可を得ています",
    storage:
      "ページは閲覧用の画質でアカウントに保存されます。他のプロジェクト画像と同じく、各ページには推測しにくい公開アドレスがあり、それを受け取った人は開くことができます。",
    start: "取り込む",
    cancel: "キャンセル",
    opening: "{book} を開いています（{total} 件中 {done} 件目）",
    pages: "{book}：{total} ページ中 {count} ページ目",
    skipped: "{file} をスキップしました：{reason}",
    badPages: { other: "{file}：読めない {count} ページを除外しました" },
    failed: "取り込みが止まりました。作成済みのプロジェクトは一覧にあります。",
    done: { other: "{count} 件のプロジェクトを取り込みました。" },
    close: "閉じる",
  },
})
