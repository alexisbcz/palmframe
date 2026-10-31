import assert from "node:assert/strict"
import { createServer, get } from "node:http"
import type { AddressInfo } from "node:net"
import { after, before, describe, test } from "node:test"

import { pinnedLookup } from "./feeds.server"

// `fetchPublic` only speaks https to public addresses, so it can't be pointed at
// a local server. What it depends on can: the connection takes its address from
// the pinned lookup and never asks DNS again. This runs the same lookup through
// a real socket, on a hostname that doesn't exist.
describe("the pinned lookup", () => {
  const server = createServer((_, res) => res.end("reached the pinned address"))
  before(() => new Promise<void>((done) => server.listen(0, "127.0.0.1", done)))
  after(() => new Promise((done) => server.close(done)))

  test("connects to the checked address, whatever the name resolves to", async () => {
    const { port } = server.address() as AddressInfo
    const body = await new Promise<string>((resolve, reject) => {
      get(
        {
          host: "rebinding.invalid",
          port,
          lookup: pinnedLookup([{ address: "127.0.0.1", family: 4 }]) as never,
        },
        (res) => {
          let text = ""
          res.on("data", (chunk) => (text += chunk))
          res.on("end", () => resolve(text))
        }
      ).on("error", reject)
    })
    assert.equal(body, "reached the pinned address")
  })

  test("answers both shapes of DNS question", () => {
    const addresses = [
      { address: "1.1.1.1", family: 4 },
      { address: "2606:4700:4700::1111", family: 6 },
    ]
    const lookup = pinnedLookup(addresses)
    lookup("x.test", { all: true }, (_, all) =>
      assert.deepEqual(all, addresses)
    )
    lookup("x.test", {}, (_, address, family) => {
      assert.equal(address, "1.1.1.1")
      assert.equal(family, 4)
    })
  })
})
