import { Store, KeyedResourceData } from 'flurryx';
import { Task } from '../../domain/models/task.model';
import { TaskProject } from '../../domain/models/task-project.model';

export enum TasksStoreEnum {
  TASKS = 'TASKS',
  TASK_DETAIL = 'TASK_DETAIL',
  TASK_CREATION = 'TASK_CREATION',
  PROJECTS = 'PROJECTS',
}

export const TasksStore = Store.for(TasksStoreEnum)
  .resource('TASKS')
  .as<Task[]>()
  .resource('TASK_DETAIL')
  .as<KeyedResourceData<string, Task>>()
  .resource('TASK_CREATION')
  .as<string>()
  .resource('PROJECTS')
  .as<TaskProject[]>()
  .build();
