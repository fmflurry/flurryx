export type TaskPriority = 'low' | 'medium' | 'high';
export type TaskStatus = 'todo' | 'in-progress' | 'done';

export type Task = {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly priority: TaskPriority;
  readonly status: TaskStatus;
  readonly projectId: string;
  readonly createdAt: string;
};

export type CreateTaskPayload = {
  readonly title: string;
  readonly description?: string;
  readonly priority: TaskPriority;
  readonly projectId: string;
};

export type UpdateTaskPayload = {
  readonly title?: string;
  readonly description?: string;
  readonly priority?: TaskPriority;
  readonly status?: TaskStatus;
};
