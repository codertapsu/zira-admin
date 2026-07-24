/**
 * Feature-local types for the read-only support lookup surface, mirrored from
 * the gateway's `support-lookup` module DTOs
 * (zira-server/apps/api-gateway/src/modules/support-lookup/dtos/*.ts).
 * Every route here is a GET — there is nothing to mutate.
 */

/** The three lookup kinds the operator can choose from. */
export type SupportLookupKind = 'project' | 'task' | 'event';

/** Minimal, non-sensitive identity block (support-user-summary.response.ts). */
export interface SupportUserSummary {
  id: string;
  displayName: string;
  email: string | null;
}

// ------------------------------------------------------------------ project

export interface ProjectMemberLookup {
  userId: string;
  role: string;
  user: SupportUserSummary | null;
  joinedAt: string;
}

export interface ProjectSprintLookup {
  id: string;
  name: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
}

export interface ProjectLookupCounts {
  members: number;
  sprints: number;
  tasks: number;
}

export interface ProjectLookup {
  id: string;
  name: string;
  description: string;
  status: string;
  managerId: string | null;
  subscriptionType: string;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
  members: ProjectMemberLookup[];
  sprints: ProjectSprintLookup[];
  counts: ProjectLookupCounts;
}

// --------------------------------------------------------------------- task

export interface TaskAssigneeLookup {
  userId: string;
  user: SupportUserSummary | null;
  assignedAt: string;
}

export interface TaskLookup {
  id: string;
  name: string;
  description: string;
  status: string;
  priority: string;
  taskType: string;
  version: number;
  archive: boolean;
  projectId: string | null;
  projectName: string | null;
  sprintId: string | null;
  sprintName: string | null;
  startDate: string | null;
  endDate: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  assignees: TaskAssigneeLookup[];
}

/** One `task_versions` row: a jsonb snapshot plus who/when (task-version-lookup.response.ts). */
export interface TaskVersionLookup {
  id: string;
  taskId: string;
  version: number;
  modifierId: string;
  modifier: SupportUserSummary | null;
  snapshot: Record<string, unknown>;
  createdAt: string;
}

// -------------------------------------------------------------------- event

export interface EventParticipantLookup {
  userId: string;
  notify: boolean;
  user: SupportUserSummary | null;
}

export interface EventAlertLookup {
  id: string;
  offsetValue: number;
  offsetUnit: string;
  type: string;
}

export interface EventLookup {
  id: string;
  name: string;
  icon: string;
  color: string;
  location: string;
  timezone: string;
  timezoneId: string | null;
  startDate: string;
  endDate: string;
  description: string;
  eventKind: string;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  participants: EventParticipantLookup[];
  alerts: EventAlertLookup[];
}
