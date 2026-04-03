import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { Project } from '../../domain/models/project.model';
import { GetProjectsPort } from '../../domain/ports/get-projects.port';

@Injectable()
export class GetProjectsUseCase {
  private readonly port = inject(GetProjectsPort);

  execute(): Observable<Project[]> {
    return this.port.getAll();
  }
}
