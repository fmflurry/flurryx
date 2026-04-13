import type { StoreDeadLetterCommand } from 'flurryx';
import type { CreateTaskPayload, UpdateTaskPayload } from '../../tasks/domain/models/task.model';

export type TaskflurryCommand =
  | { readonly type: 'tasks.load' }
  | { readonly type: 'tasks.detail.load'; readonly payload: { readonly taskId: string } }
  | { readonly type: 'tasks.create'; readonly payload: { readonly value: CreateTaskPayload } }
  | {
      readonly type: 'tasks.update';
      readonly payload: {
        readonly taskId: string;
        readonly value: UpdateTaskPayload;
      };
    }
  | { readonly type: 'tasks.projects.load' }
  | { readonly type: 'projects.load' }
  | { readonly type: 'projects.tasks.load' };

export function asDeadLetterCommand(command: TaskflurryCommand): StoreDeadLetterCommand {
  return command;
}
