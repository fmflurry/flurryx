import { Provider } from '@angular/core';

import { ProjectsFacade } from './application/facades/projects.facade';
import { GetProjectsUseCase } from './application/use-cases/get-projects.use-case';
import { GetProjectTasksUseCase } from './application/use-cases/get-project-tasks.use-case';
import { DeleteProjectTaskUseCase } from './application/use-cases/delete-project-task.use-case';
import { projectsInfrastructureProviders } from './infrastructure/projects-infrastructure.providers';
import { AppContext, contextProvidersFor } from '../core/context/context.registry';

export function projectsServicesProviders(): Provider[] {
  return [
    ProjectsFacade,
    GetProjectsUseCase,
    GetProjectTasksUseCase,
    DeleteProjectTaskUseCase,
    ...projectsInfrastructureProviders(),
    ...contextProvidersFor([AppContext.TASKS]),
  ];
}
