import { Provider } from '@angular/core';
import { GetTasksPort } from './domain/ports/get-tasks.port';
import { DeleteTaskPort } from './domain/ports/delete-task.port';
import { GetTasksAdapter } from './infrastructure/adapter/get-tasks.adapter';
import { DeleteTaskAdapter } from './infrastructure/adapter/delete-task.adapter';
import { TasksEndpoint } from './infrastructure/api/endpoints/tasks.endpoint';

export type { Task, CreateTaskPayload, TaskPriority, TaskStatus } from './domain/models/task.model';
export { TasksStoreEnum } from './application/store/tasks.store';
export { GetTasksPort } from './domain/ports/get-tasks.port';
export { DeleteTaskPort } from './domain/ports/delete-task.port';
export { tasksServicesProviders } from './tasks-service.providers';
export { TASKS_ROUTES } from './routes';

export function getTasksProviders(): Provider[] {
  return [TasksEndpoint, GetTasksAdapter, { provide: GetTasksPort, useClass: GetTasksAdapter }];
}

export function deleteTaskProviders(): Provider[] {
  return [
    TasksEndpoint,
    DeleteTaskAdapter,
    { provide: DeleteTaskPort, useClass: DeleteTaskAdapter },
  ];
}
