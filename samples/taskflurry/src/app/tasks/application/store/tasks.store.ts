import { Store } from 'flurryx';
import type { KeyedResourceData } from 'flurryx';
import { Task } from '../../domain/models/task.model';
import { TaskProject } from '../../domain/models/task-project.model';

export enum TasksStoreEnum {
  TASKS = 'TASKS',
  TASK_DETAIL = 'TASK_DETAIL',
  TASK_CREATION = 'TASK_CREATION',
  PROJECTS = 'PROJECTS',
}

interface TasksStoreConfig {
  TASKS: Task[];
  TASK_DETAIL: KeyedResourceData<string, Task>;
  TASK_CREATION: string;
  PROJECTS: TaskProject[];
}

export const TasksStore = Store.for<TasksStoreConfig>().build();
