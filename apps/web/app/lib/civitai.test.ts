import { expect, test } from "bun:test"

import { plainPrompt } from "./civitai"

test("the editor gets the prompt without another site's LoRA tags", () => {
  expect(
    plainPrompt("1girl, <lora:GothicOil:1.0>, knight,\n<lora:x:0.5>")
  ).toBe("1girl, knight")
})
