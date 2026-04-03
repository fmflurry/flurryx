import { Provider } from '@angular/core';

import { GetProjectsPort } from '../domain/ports/get-projects.port';
import { GetProjectsAdapter } from './adapter/get-projects.adapter';
import { ProjectsEndpoint } from './api/endpoints/projects.endpoint';

export function projectsInfrastructureProviders(): Provider[] {
  return [
    ProjectsEndpoint,
    { provide: GetProjectsPort, useClass: GetProjectsAdapter },
  ];
}
