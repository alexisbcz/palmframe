import type { ImageCache } from "@/components/comic-canvas/render"
import {
  useCloudSync,
  type CloudProject,
} from "@/components/comic-canvas/use-cloud-sync"
import type { ComicEditor } from "@/components/comic-canvas/use-editor"
import { useT } from "@/i18n/core"
import { messages } from "./account.messages"
import { SyncStatus } from "./sync-status"

// The carousel's name and save state, for a project stored in the account.
export function CloudBar({
  editor,
  cloud,
  images,
}: {
  editor: ComicEditor
  cloud: CloudProject
  images: ImageCache
}) {
  const t = useT(messages)
  const sync = useCloudSync(editor, cloud, images)
  return (
    <div className="flex min-w-0 items-center gap-2">
      <input
        aria-label={t("sync.titleLabel")}
        defaultValue={sync.title}
        placeholder={t("sync.untitled")}
        maxLength={120}
        onBlur={(e) => {
          if (e.currentTarget.value.trim() !== sync.title)
            void sync.rename(e.currentTarget.value)
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur()
          if (e.key === "Escape") {
            e.currentTarget.value = sync.title
            e.currentTarget.blur()
          }
        }}
        className="[field-sizing:content] h-8 max-w-64 min-w-24 truncate rounded-md bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground hover:bg-muted focus-visible:bg-background focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      <SyncStatus status={sync.status} />
    </div>
  )
}
