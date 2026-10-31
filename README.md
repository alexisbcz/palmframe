# Palmframe

Palmframe is an open-source alternative to Anifusion for making comics with AI.

Live at [www.palmframe.com](https://www.palmframe.com).

![The Palmframe editor: a five-slide Instagram carousel, with the selected panel's prompt and AI edit tools](docs/editor.png)

## Example

_Lost Property_, a six-slide carousel about a station's lost-and-found clerk and
the red umbrella she never threw away. Its characters are drawn from model
sheets, so they stay the same from panel to panel. You can open it in the editor
at `/?project=/comics/lost-property.json`.

|                                                                                                                            |                                                                                                                              |                                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| ![Slide 1: Mara behind the lost-and-found counter, with the title Lost Property](docs/lost-property/slide-1.png)           | ![Slide 2: the thirty-day rule, and a red umbrella left on a platform twelve years ago](docs/lost-property/slide-2.png)      | ![Slide 3: Mara stands the umbrella by the window, and an old man arrives at the door](docs/lost-property/slide-3.png)     |
| ![Slide 4: the old man says his wife lost a red umbrella, and Mara lays it on the counter](docs/lost-property/slide-4.png) | ![Slide 5: he hugs the umbrella and asks her to lend it to the next person the rain catches](docs/lost-property/slide-5.png) | ![Slide 6: Mara lends the umbrella to a soaked stranger, and it disappears into the crowd](docs/lost-property/slide-6.png) |

## Stack

- [React Router](https://reactrouter.com) app in `apps/web`
- Shared [shadcn/ui](https://ui.shadcn.com) components in `packages/ui`
- [Turborepo](https://turbo.build) and [Bun](https://bun.sh) workspaces
- Deployed on [Vercel](https://vercel.com)

## Development

```bash
bun install
bun run dev
```

### Accounts and saved projects

Accounts and projects use the `palmframe` [Supabase](https://supabase.com)
project, which the Palmframe editor app also uses. The server needs its URL and
publishable key:

```bash
# apps/web/.env, or your host's environment
SUPABASE_URL=https://qzgvovboceozytgzjuuk.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

People sign in with an email link or a password. Signed in, every carousel is a
row in `comic_projects`, and the canvas saves it as you edit. Images go to the
public `comics` bucket under the owner's ID, named by content hash. Row-level
security limits each person to their own rows and files. Signed out, the canvas
keeps one carousel in the browser, and **My projects** offers to import it after
sign-in.

Schema changes live in `supabase/migrations`. Create one with
`supabase migration new <name>` and apply it with `supabase db push`. The editor
app owns the other tables in this database, so keep new tables prefixed with
`comic_`.

### Posting to Instagram

The canvas can post carousels and Stories to Instagram through
[Zernio](https://zernio.com). The feature is off until the server has an API key:

```bash
# apps/web/.env, or your host's environment
ZERNIO_API_KEY=sk_...
```

The key stays on the server, and users never see Zernio. Each signed-in user
gets their own Zernio profile (keyed by their user id) and connects one or more
Instagram accounts from the **Post** dialog, in a popup. The server checks
every account and post against the user's profile, because Zernio's posts API
accepts any account on the key.

Optional:

- `INSTAGRAM_OAUTH_APP_ID`: the id of your own Meta app registered in Zernio
  (`GET /v1/connect/oauth-apps`), so Instagram's consent screen names Palmframe
  instead of Zernio.
- `ZERNIO_API_URL` overrides the API base (default `https://zernio.com/api/v1`).

### Content machines

Content machines are a Labs feature, off until someone turns them on under
**Settings > Labs**. A machine filters a live public stream and writes short,
number-first drafts from what stands out: a post, plus a scene that **Make the
comic** turns into a project. Nothing publishes on its own.

| Stream            | Connection             | Fires on                     |
| ----------------- | ---------------------- | ---------------------------- |
| Bluesky Jetstream | WebSocket, with replay | A burst of keyword matches   |
| Wikipedia changes | Server-sent events     | A burst of edits to a page   |
| Coinbase trades   | WebSocket              | A price move inside a window |

The filter in `apps/web/app/lib/machines` runs in the browser for the live wire
and on the server for scheduled runs. Listening is free. A draft costs credits
when the server's Anthropic key writes it, nothing when the person's OpenRouter
account pays, and with no writer configured a draft is the raw facts.

Vercel functions can't hold a socket open, so `.github/workflows/machines.yml`
calls the tick route every 10 minutes. Each tick replays what Bluesky and
Wikipedia said since the last one, and compares prices across ticks. To turn
scheduled runs on, set the same secret on the server and in GitHub Actions:

```bash
# apps/web/.env, or your host's environment
MACHINES_CRON_SECRET=...
SUPABASE_SECRET_KEY=...

# GitHub Actions secrets
MACHINES_CRON_SECRET=...
MACHINES_TICK_URL=https://www.palmframe.com/api/machines/tick
```

Run the unit tests with `bun test apps/web/app/lib/machines`.

## Adding components

From the repository root, run:

```bash
bunx --bun shadcn@latest add button -c apps/web
```

This places the components in `packages/ui/src/components`. Import them from the `ui` package:

```tsx
import { Button } from "@workspace/ui/components/button"
```

## License

[MIT](LICENSE)
