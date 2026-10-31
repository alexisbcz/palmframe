import { defineMessages, isLocale, translate } from "@/i18n/core"

import { creditsFor } from "./datasets"

// The words every machine post ends with, added by code after the agent is
// done. Machines write in these six languages; anything else signs in English.
const messages = defineMessages({
  en: { signature: "AI-written" },
  fr: { signature: "Écrit par une IA" },
  es: { signature: "Escrito por IA" },
  de: { signature: "Von KI geschrieben" },
  it: { signature: "Scritto da IA" },
  ja: { signature: "AIが執筆" },
})

export const signatureFor = (language: string) =>
  translate(messages, isLocale(language) ? language : "en", "signature")

// How a post ends: the signature, then the credit a dataset's licence asks for.
// `compose` takes this room off the limit before cutting any words, so a link
// dropped on a tight platform can't take the attribution with it.
export const signOff = (
  language: string,
  sources: readonly { source: string }[]
) => [signatureFor(language), ...creditsFor(sources)].join(" · ")
