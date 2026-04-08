import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { StoreHistoryVizComponent } from './store-history-viz.component';
import { PROJECTS_STORE } from '../../projects/application/store/projects.store';
import { TasksStore } from '../../tasks/application/store/tasks.store';

@Component({
  selector: 'app-store-devtools',
  standalone: true,
  imports: [StoreHistoryVizComponent],
  template: `
    <div class="store-devtools">
      <section class="store-devtools__group">
        <div class="store-devtools__label">Projects</div>
        <app-store-history-viz [store]="projectsStore" />
      </section>

      <section class="store-devtools__group">
        <div class="store-devtools__label">Tasks</div>
        <app-store-history-viz [store]="tasksStore" />
      </section>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        max-width: 800px;
        margin: 0 auto 2rem;
        padding: 0 1rem;
      }

      .store-devtools__group + .store-devtools__group {
        margin-top: 0.5rem;
      }

      .store-devtools__label {
        margin-top: 0.75rem;
        font-size: 0.75rem;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: #64748b;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StoreDevtoolsComponent {
  protected readonly projectsStore = inject(PROJECTS_STORE);
  protected readonly tasksStore = inject(TasksStore);
}
