import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { mockApiInterceptor } from './core/mock/mock-api.interceptor';
import { tasksServicesProviders } from './tasks/tasks-service.providers';
import { projectsServicesProviders } from './projects/projects-service.providers';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([mockApiInterceptor])),
    ...tasksServicesProviders(),
    ...projectsServicesProviders(),
  ],
};
