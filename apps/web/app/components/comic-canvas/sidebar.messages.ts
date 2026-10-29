import { defineMessages } from "@/i18n/core"

// Layout and element labels are looked up by the ids in model.ts; the
// English labels there stay the data, these are what the sidebar shows.
export const messages = defineMessages({
  en: {
    tabs: { layers: "Layers", library: "Library" },
    empty: {
      title: "No layers",
      description: "Pick a layout or add elements from the Library tab.",
    },
    layer: {
      name: "Layer name",
      lock: "Lock",
      unlock: "Unlock",
      show: "Show",
      hide: "Hide",
    },
    library: {
      layouts: "Layouts",
      elements: "Elements",
      layoutNote: "Applying a layout keeps your images, in reading order.",
    },
    elements: {
      panel: "Panel",
      speech: "Speech",
      thought: "Thought",
      shout: "Shout",
      caption: "Caption",
      message: "Message",
      sfx: "SFX",
    },
    layouts: {
      splash: "Splash",
      "two-tiers": "Two tiers",
      "three-tiers": "Three tiers",
      grid: "Grid",
      "big-two": "Big + two",
      "two-wide": "Two + wide",
      staggered: "Staggered",
    },
  },
  fr: {
    tabs: { layers: "Calques", library: "Bibliothèque" },
    empty: {
      title: "Aucun calque",
      description:
        "Choisissez une mise en page ou ajoutez des éléments depuis l'onglet Bibliothèque.",
    },
    layer: {
      name: "Nom du calque",
      lock: "Verrouiller",
      unlock: "Déverrouiller",
      show: "Afficher",
      hide: "Masquer",
    },
    library: {
      layouts: "Mises en page",
      elements: "Éléments",
      layoutNote:
        "Appliquer une mise en page conserve vos images, dans l'ordre de lecture.",
    },
    elements: {
      panel: "Case",
      speech: "Bulle",
      thought: "Pensée",
      shout: "Cri",
      caption: "Récitatif",
      message: "Message",
      sfx: "Onomatopée",
    },
    layouts: {
      splash: "Pleine page",
      "two-tiers": "Deux bandes",
      "three-tiers": "Trois bandes",
      grid: "Grille",
      "big-two": "Grande + deux",
      "two-wide": "Deux + large",
      staggered: "Décalée",
    },
  },
  es: {
    tabs: { layers: "Capas", library: "Biblioteca" },
    empty: {
      title: "Sin capas",
      description:
        "Elige una maqueta o añade elementos desde la pestaña Biblioteca.",
    },
    layer: {
      name: "Nombre de la capa",
      lock: "Bloquear",
      unlock: "Desbloquear",
      show: "Mostrar",
      hide: "Ocultar",
    },
    library: {
      layouts: "Maquetas",
      elements: "Elementos",
      layoutNote:
        "Al aplicar una maqueta se conservan tus imágenes, en orden de lectura.",
    },
    elements: {
      panel: "Viñeta",
      speech: "Bocadillo",
      thought: "Pensamiento",
      shout: "Grito",
      caption: "Cartucho",
      message: "Mensaje",
      sfx: "Onomatopeya",
    },
    layouts: {
      splash: "Página entera",
      "two-tiers": "Dos tiras",
      "three-tiers": "Tres tiras",
      grid: "Cuadrícula",
      "big-two": "Grande + dos",
      "two-wide": "Dos + ancha",
      staggered: "Escalonada",
    },
  },
  de: {
    tabs: { layers: "Ebenen", library: "Bibliothek" },
    empty: {
      title: "Keine Ebenen",
      description:
        "Wähle ein Layout oder füge Elemente aus dem Tab „Bibliothek“ hinzu.",
    },
    layer: {
      name: "Ebenenname",
      lock: "Sperren",
      unlock: "Entsperren",
      show: "Einblenden",
      hide: "Ausblenden",
    },
    library: {
      layouts: "Layouts",
      elements: "Elemente",
      layoutNote: "Ein neues Layout übernimmt deine Bilder in Lesereihenfolge.",
    },
    elements: {
      panel: "Panel",
      speech: "Sprechblase",
      thought: "Gedanke",
      shout: "Schrei",
      caption: "Textkasten",
      message: "Nachricht",
      sfx: "Soundeffekt",
    },
    layouts: {
      splash: "Ganzseitig",
      "two-tiers": "Zwei Streifen",
      "three-tiers": "Drei Streifen",
      grid: "Raster",
      "big-two": "Groß + zwei",
      "two-wide": "Zwei + breit",
      staggered: "Versetzt",
    },
  },
  it: {
    tabs: { layers: "Livelli", library: "Libreria" },
    empty: {
      title: "Nessun livello",
      description:
        "Scegli un layout o aggiungi elementi dalla scheda Libreria.",
    },
    layer: {
      name: "Nome del livello",
      lock: "Blocca",
      unlock: "Sblocca",
      show: "Mostra",
      hide: "Nascondi",
    },
    library: {
      layouts: "Layout",
      elements: "Elementi",
      layoutNote:
        "Applicando un layout le immagini restano, in ordine di lettura.",
    },
    elements: {
      panel: "Vignetta",
      speech: "Nuvoletta",
      thought: "Pensiero",
      shout: "Urlo",
      caption: "Didascalia",
      message: "Messaggio",
      sfx: "Onomatopea",
    },
    layouts: {
      splash: "Pagina intera",
      "two-tiers": "Due strisce",
      "three-tiers": "Tre strisce",
      grid: "Griglia",
      "big-two": "Grande + due",
      "two-wide": "Due + larga",
      staggered: "Sfalsata",
    },
  },
  ja: {
    tabs: { layers: "レイヤー", library: "ライブラリ" },
    empty: {
      title: "レイヤーがありません",
      description: "コマ割りを選ぶか、ライブラリタブから要素を追加してください。",
    },
    layer: {
      name: "レイヤー名",
      lock: "ロック",
      unlock: "ロック解除",
      show: "表示",
      hide: "非表示",
    },
    library: {
      layouts: "コマ割り",
      elements: "要素",
      layoutNote: "コマ割りを適用しても、画像は読み順のまま保持されます。",
    },
    elements: {
      panel: "コマ",
      speech: "セリフ",
      thought: "思考",
      shout: "叫び",
      caption: "ナレーション",
      message: "メッセージ",
      sfx: "効果音",
    },
    layouts: {
      splash: "1ページ大ゴマ",
      "two-tiers": "2段",
      "three-tiers": "3段",
      grid: "グリッド",
      "big-two": "大＋2コマ",
      "two-wide": "2コマ＋横長",
      staggered: "互い違い",
    },
  },
})

export type LayoutId = keyof (typeof messages)["en"]["layouts"]

export function isLayoutId(id: string): id is LayoutId {
  return id in messages.en.layouts
}
