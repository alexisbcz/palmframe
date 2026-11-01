import type {
  CameraSetup,
  CastMember,
  EpisodeSettings,
  Line,
  StageStatus,
  VideoStatus,
} from "./model"

export type EpisodeRow = {
  id: string
  user_id: string
  title: string
  source: "file" | "project"
  project_id: string | null
  rtl: boolean
  rights_confirmed_at: string | null
  status: "uploading" | "directing" | "ready"
  settings: EpisodeSettings
  cast_list: CastMember[]
  directed: number
  director_error: string | null
  final_path: string | null
  final_at: string | null
  leased_until: string | null
  created_at: string
  updated_at: string
}

export type ShotRow = {
  id: string
  episode_id: string
  user_id: string
  position: number
  page: number
  panel_path: string
  hint: string
  skip: boolean
  action: string
  dialogue: Line[]
  duration: number
  camera: Partial<CameraSetup>
  keyframe_status: StageStatus
  keyframe_path: string | null
  keyframe_error: string | null
  voice_status: StageStatus
  voice_path: string | null
  voice_error: string | null
  video_status: VideoStatus
  video_job: string | null
  video_path: string | null
  video_error: string | null
  video_cost: number | null
  leased_until: string | null
  created_at: string
  updated_at: string
}

type Table<Row> = {
  Row: Row
  Insert: Partial<Row>
  Update: Partial<Row>
  Relationships: []
}

export type AnimeTables = {
  comic_anime_episodes: Table<EpisodeRow>
  comic_anime_shots: Table<ShotRow>
}
