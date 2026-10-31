import { defineMessages, isLocale, translate } from "@/i18n/core"

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
