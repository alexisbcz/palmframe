import { defineMessages } from "@/i18n/core"

import { de } from "./locales/de"
import { en } from "./locales/en"
import { es } from "./locales/es"
import { fr } from "./locales/fr"
import { it } from "./locales/it"
import { ja } from "./locales/ja"

// Each language has its own file: the Stage has far more copy than a feature
// that would fit next to its code.
export const messages = defineMessages({ en, fr, es, de, it, ja })
