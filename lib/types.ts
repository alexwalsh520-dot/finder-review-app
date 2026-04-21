export type AppRole = "owner" | "reviewer"

export type ReviewStatus =
  | "unreviewed"
  | "va_approved"
  | "flagged"
  | "approved"
  | "rejected"
  | "exported_pending_confirmation"

export type ReviewerDecision = "qualified" | "not_qualified"
export type LeadGender = "male" | "female"
export type LeadCoachingFilter = "has" | "none"

export type ChecklistResult = "pass" | "fail" | null

export type LeadChecklist = {
  authority: ChecklistResult
  personality: ChecklistResult
  engagement: ChecklistResult
}

export type LeadReviewSnapshot = {
  recommendation: ReviewerDecision | null
  owner_decision: "qualified" | "disqualified" | null
  checklist: LeadChecklist
  email_type: "personal" | "management" | null
  gender: LeadGender | null
  has_coaching: boolean | null
  va_note: string | null
  owner_note: string | null
  reviewed_at: string | null
  reviewed_by: string | null
}

export type LeadRow = {
  id: string
  first_name: string | null
  first_name_verified: boolean | null
  gender?: LeadGender | null
  full_name: string | null
  email: string | null
  email_source: string | null
  instagram_handle: string | null
  instagram_url: string | null
  follower_count: number | null
  status: string | null
  bio: string | null
  source: string | null
  source_detail: string | null
  batch_date: string | null
  review_status: ReviewStatus
  reviewed_at: string | null
  reviewed_by: string | null
  review_notes: string | null
  exported_at: string | null
  export_batch_id: string | null
  sent_to_smartlead: boolean | null
  smartlead_campaign_id: string | null
  smartlead_sent_at: string | null
  created_at: string
  review_snapshot?: LeadReviewSnapshot | null
}

export type PaginatedResult<T> = {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  hasNext: boolean
  hasPrevious: boolean
  startIndex: number
  endIndex: number
}

export type ReviewQueueResult = PaginatedResult<LeadRow>
export type LeadListResult = PaginatedResult<LeadRow>

export type DailyEmailPerformanceRow = {
  day: string
  newEmails: number
  targetEmails: number
  hitTarget: boolean
}

export type WorkerEventSummary = {
  id: string
  label: string
  message: string
  status: string
  created_at: string
}

export type TopUpStatus = {
  day: string
  status: "idle" | "requested" | "running" | "completed" | "failed"
  todayQualifiedCount: number
  qualifiedTarget: number
  todayEmailCount: number
  todayReviewedCount: number
  todayUnreviewedCount: number
  todayAutoSentCount: number
  emailTarget: number | null
  needsTopUp: boolean
  canRequestTopUp: boolean
  mode: "emails" | "review" | "qualified" | "done"
  shortfall: number
  title: string
  requestedAt: string | null
  requestedBy: string | null
  startedAt: string | null
  completedAt: string | null
  failedAt: string | null
  latestMessage: string
  recentEvents: WorkerEventSummary[]
}

export type SessionPayload = {
  email: string
  role: AppRole
  exp: number
}

export type WorkerEvent = {
  id: string
  agent: string
  event: string
  status: string
  data: Record<string, unknown> | null
  created_at: string
}

export type CronJobRow = {
  id: string
  agent: string
  name: string
  schedule: string
  enabled: boolean
  last_run_at: string | null
  next_run_at: string | null
  last_status: string | null
  last_duration_ms: number | null
  run_count: number
}

export type FileEntry = {
  day: string
  path: string
  name: string
  bucket: string
}
