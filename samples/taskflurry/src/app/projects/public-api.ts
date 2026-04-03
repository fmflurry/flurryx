import { Provider } from '@angular/core';
import { GetProjectsPort } from './domain/ports/get-projects.port';
import { GetProjectsAdapter } from './infrastructure/adapter/get-projects.adapter';
import { ProjectsEndpoint } from './infrastructure/api/endpoints/projects.endpoint';

export type { Project } from './domain/models/project.model';
export { GetProjectsPort } from './domain/ports/get-projects.port';
export { PROJECTS_STORE } from './application/store/projects.store';
export { projectsServicesProviders } from './projects-service.providers';
export { PROJECTS_ROUTES } from './routes';

export function getProjectsProviders(): Provider[] {
  return [
    ProjectsEndpoint,
    GetProjectsAdapter,
    { provide: GetProjectsPort, useClass: GetProjectsAdapter },
  ];
}
