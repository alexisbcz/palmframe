import { ansel } from "./ansel"
import { ember } from "./ember"
import { fieldNotes } from "./field-notes"
import { foundry } from "./foundry"
import { groundFloor } from "./ground-floor"
import { halo } from "./halo"
import { harbor } from "./harbor"
import { juniper } from "./juniper"
import { kiln } from "./kiln"
import { meridian } from "./meridian"
import { northline } from "./northline"
import { rosewater } from "./rosewater"
import { slowbody } from "./slowbody"
import { tandem } from "./tandem"
import type { Template } from "./types"

export const TEMPLATES: Template[] = [
  rosewater,
  kiln,
  northline,
  slowbody,
  halo,
  ansel,
  fieldNotes,
  meridian,
  ember,
  groundFloor,
  harbor,
  tandem,
  foundry,
  juniper,
]

export const templateById = (id: string) => TEMPLATES.find((t) => t.id === id)
