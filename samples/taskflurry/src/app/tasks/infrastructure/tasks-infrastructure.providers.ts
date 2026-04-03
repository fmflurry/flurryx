import { Provider } from '@angular/core';
import { GetTasksPort } from '../domain/ports/get-tasks.port';
import { GetTaskDetailPort } from '../domain/ports/get-task-detail.port';
import { CreateTaskPort } from '../domain/ports/create-task.port';
import { UpdateTaskPort } from '../domain/ports/update-task.port';
import { DeleteTaskPort } from '../domain/ports/delete-task.port';
import { GetTasksAdapter } from './adapter/get-tasks.adapter';
import { GetTaskDetailAdapter } from './adapter/get-task-detail.adapter';
import { CreateTaskAdapter } from './adapter/create-task.adapter';
import { UpdateTaskAdapter } from './adapter/update-task.adapter';
import { DeleteTaskAdapter } from './adapter/delete-task.adapter';
import { TasksEndpoint } from './api/endpoints/tasks.endpoint';

export function tasksInfrastructureProviders(): Provider[] {
  return [
    TasksEndpoint,
    { provide: GetTasksPort, useClass: GetTasksAdapter },
    { provide: GetTaskDetailPort, useClass: GetTaskDetailAdapter },
    { provide: CreateTaskPort, useClass: CreateTaskAdapter },
    { provide: UpdateTaskPort, useClass: UpdateTaskAdapter },
    { provide: DeleteTaskPort, useClass: DeleteTaskAdapter },
  ];
}
