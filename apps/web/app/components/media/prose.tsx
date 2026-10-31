import { type Inline, parseMarkdown } from "@/lib/media/markdown"

function Text({ inline }: { inline: Inline[] }) {
  return inline.map((n, i) => {
    if (n.kind === "strong") return <strong key={i}>{n.text}</strong>
    if (n.kind === "em") return <em key={i}>{n.text}</em>
    if (n.kind === "link")
      return (
        <a
          key={i}
          href={n.href}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-brand-ink"
        >
          {n.text}
        </a>
      )
    return <span key={i}>{n.text}</span>
  })
}

export function Prose({ markdown }: { markdown: string }) {
  return (
    <div className="flex flex-col gap-4 text-[15px] leading-relaxed">
      {parseMarkdown(markdown).map((b, i) => {
        if (b.kind === "heading")
          return b.level === 2 ? (
            <h2 key={i} className="studio-title mt-3 text-2xl">
              <Text inline={b.text} />
            </h2>
          ) : (
            <h3 key={i} className="mt-2 font-semibold">
              <Text inline={b.text} />
            </h3>
          )
        if (b.kind === "quote")
          return (
            <blockquote
              key={i}
              className="border-s-2 border-brand ps-4 text-muted-foreground"
            >
              <Text inline={b.text} />
            </blockquote>
          )
        if (b.kind === "list") {
          const List = b.ordered ? "ol" : "ul"
          return (
            <List
              key={i}
              className={
                b.ordered
                  ? "flex list-decimal flex-col gap-1 ps-5"
                  : "flex list-disc flex-col gap-1 ps-5"
              }
            >
              {b.items.map((item, j) => (
                <li key={j}>
                  <Text inline={item} />
                </li>
              ))}
            </List>
          )
        }
        return (
          <p key={i}>
            <Text inline={b.text} />
          </p>
        )
      })}
    </div>
  )
}
