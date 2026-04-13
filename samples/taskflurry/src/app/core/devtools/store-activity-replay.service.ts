import { Injectable, inject } from '@angular/core';
import type { DeadLetterCommandResolverResult } from 'flurryx';
import { TasksFacade } from '../../tasks/application/facades/tasks.facade';
import { ProjectsFacade } from '../../projects/application/facades/projects.facade';
import type { TaskflurryCommand } from './store-activity-command';

interface ReplayableDeadLetterEntry {
  readonly id: number;
  readonly error: string;
  readonly httpStatus: number | null;
  readonly httpMessage: string | null;
  readonly command: { readonly type: string; readonly payload?: unknown } | null;
}

@Injectable({ providedIn: 'root' })
export class StoreActivityReplayService {
  private readonly tasksFacade = inject(TasksFacade, { optional: true });
  private readonly projectsFacade = inject(ProjectsFacade, { optional: true });

  async replay(
    entry: Readonly<ReplayableDeadLetterEntry>
  ): Promise<DeadLetterCommandResolverResult> {
    const command = entry.command as TaskflurryCommand | null;
    if (command === null) {
      return { resolved: false, clear: false };
    }

    switch (command.type) {
      case 'tasks.load':
        this.tasksFacade?.loadTasks();
        return { resolved: this.tasksFacade !== null, clear: this.tasksFacade !== null };
      case 'tasks.detail.load':
        this.tasksFacade?.loadTaskDetail(command.payload.taskId);
        return { resolved: this.tasksFacade !== null, clear: this.tasksFacade !== null };
      case 'tasks.create':
        this.tasksFacade?.createTask(command.payload.value);
        return { resolved: this.tasksFacade !== null, clear: this.tasksFacade !== null };
      case 'tasks.update':
        this.tasksFacade?.updateTask(command.payload.taskId, command.payload.value);
        return { resolved: this.tasksFacade !== null, clear: this.tasksFacade !== null };
      case 'tasks.projects.load':
        this.tasksFacade?.loadProjects();
        return { resolved: this.tasksFacade !== null, clear: this.tasksFacade !== null };
      case 'projects.load':
        this.projectsFacade?.loadProjects();
        return { resolved: this.projectsFacade !== null, clear: this.projectsFacade !== null };
      case 'projects.tasks.load':
        this.projectsFacade?.loadTasks();
        return { resolved: this.projectsFacade !== null, clear: this.projectsFacade !== null };
    }
  }
}
