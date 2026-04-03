import { Provider } from '@angular/core';
import { TasksFacade } from './application/facades/tasks.facade';
import { GetTasksUseCase } from './application/use-cases/get-tasks.use-case';
import { GetTaskDetailUseCase } from './application/use-cases/get-task-detail.use-case';
import { CreateTaskUseCase } from './application/use-cases/create-task.use-case';
import { UpdateTaskUseCase } from './application/use-cases/update-task.use-case';
import { DeleteTaskUseCase } from './application/use-cases/delete-task.use-case';
import { GetTaskProjectsUseCase } from './application/use-cases/get-task-projects.use-case';
import { tasksInfrastructureProviders } from './infrastructure/tasks-infrastructure.providers';
import { AppContext, contextProvidersFor } from '../core/context/context.registry';

export function tasksServicesProviders(): Provider[] {
  return [
    TasksFacade,
    GetTasksUseCase,
    GetTaskDetailUseCase,
    CreateTaskUseCase,
    UpdateTaskUseCase,
    DeleteTaskUseCase,
    GetTaskProjectsUseCase,
    ...tasksInfrastructureProviders(),
    ...contextProvidersFor([AppContext.PROJECTS]),
  ];
}
