import type { ComicProject } from "@/components/comic-canvas/model"

// The slice of the shared database this app uses. The other tables belong
// to the palmframe editor.
export interface Database {
  public: {
    Tables: {
      comic_projects: {
        Row: ComicProjectRow
        Insert: {
          id?: string
          user_id?: string
          title?: string
          data: ComicProject
          cover?: string | null
          revision?: number
        }
        Update: {
          title?: string
          data?: ComicProject
          cover?: string | null
          revision?: number
        }
        Relationships: []
      }
    }
    Views: {}
    Functions: {}
    Enums: {}
    CompositeTypes: {}
  }
}

export type ComicProjectRow = {
  id: string
  user_id: string
  title: string
  data: ComicProject
  cover: string | null
  revision: number
  slide_count: number
  created_at: string
  updated_at: string
}

// What the pages know about the signed-in person.
export interface Viewer {
  id: string
  email: string
  name: string
}

export const COMICS_BUCKET = "comics"
