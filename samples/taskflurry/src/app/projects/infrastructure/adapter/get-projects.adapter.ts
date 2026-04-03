import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { Project } from '../../domain/models/project.model';
import { GetProjectsPort } from '../../domain/ports/get-projects.port';
import { ProjectsEndpoint } from '../api/endpoints/projects.endpoint';

@Injectable()
export class GetProjectsAdapter implements GetProjectsPort {
  private readonly endpoint = inject(ProjectsEndpoint);

  getAll(): Observable<Project[]> {
    return this.endpoint.getAll();
  }
}
