// The slice of vale-ts's API that Palmframe uses. The bundle's own types live
// in the vale.ts repo.
export interface Alert {
  line: number
  span: [number, number]
  check: string
  severity: string
  message: string
}
export interface LintedFile {
  sortedAlerts(): Alert[]
}
export declare class Vale {
  static fromString(ini: string): Promise<Vale>
  lintString(text: string, options: { path: string }): LintedFile[]
}
