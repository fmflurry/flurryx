import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { SnackbarComponent } from './core/snackbar/snackbar.component';
import { StoreDevtoolsComponent } from './core/devtools/store-devtools.component';
import {
  StoreActivityPanelComponent,
  StoreActivitySource,
} from './core/devtools/store-activity-panel.component';
import { TasksStore } from './tasks/application/store/tasks.store';
import { PROJECTS_STORE } from './projects/application/store/projects.store';
import { filter } from 'rxjs';

@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    SnackbarComponent,
    StoreDevtoolsComponent,
    StoreActivityPanelComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly menuOpen = signal(false);

  protected readonly storeSources: readonly StoreActivitySource[] = [
    { name: 'Tasks', store: inject(TasksStore) as unknown as StoreActivitySource['store'] },
    { name: 'Projects', store: inject(PROJECTS_STORE) as unknown as StoreActivitySource['store'] },
  ];

  constructor() {
    inject(Router)
      .events.pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => this.menuOpen.set(false));
  }

  protected toggleMenu(): void {
    this.menuOpen.update((v) => !v);
  }
}
