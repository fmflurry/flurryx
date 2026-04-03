import { Routes } from '@angular/router';

import { projectsServicesProviders } from './projects-service.providers';

export const PROJECTS_ROUTES: Routes = [
  { path: '', redirectTo: 'list', pathMatch: 'full' },
  {
    path: 'list',
    loadComponent: () =>
      import('./presentation/list/projects-list.component').then((m) => m.ProjectsListComponent),
    providers: [projectsServicesProviders()],
  },
];
