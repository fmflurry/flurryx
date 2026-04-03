import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { Project } from '../../../domain/models/project.model';

@Injectable()
export class ProjectsEndpoint {
  private readonly http = inject(HttpClient);

  getAll(): Observable<Project[]> {
    return this.http.get<Project[]>('/api/projects');
  }
}
