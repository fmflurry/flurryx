export type ProjectTaskPriority = 'low' | 'medium' | 'high';
export type ProjectTaskStatus = 'todo' | 'in-progress' | 'done';

export type ProjectTask = {
  readonly id: string;
  readonly title: string;
  readonly priority: ProjectTaskPriority;
  readonly status: ProjectTaskStatus;
  readonly projectId: string;
};
