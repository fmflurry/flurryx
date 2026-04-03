import { Observable } from 'rxjs';

import { Project } from '../models/project.model';

export abstract class GetProjectsPort {
  abstract getAll(): Observable<Project[]>;
}
