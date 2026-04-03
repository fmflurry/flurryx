export type TaskResponse = {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly priority: 'low' | 'medium' | 'high';
  readonly status: 'todo' | 'in-progress' | 'done';
  readonly projectId: string;
  readonly createdAt: string;
};
