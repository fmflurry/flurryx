import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { SnackbarComponent } from './core/snackbar/snackbar.component';
import { StoreDevtoolsComponent } from './core/devtools/store-devtools.component';
import { filter } from 'rxjs';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, SnackbarComponent, StoreDevtoolsComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly menuOpen = signal(false);

  constructor() {
    inject(Router)
      .events.pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => this.menuOpen.set(false));
  }

  protected toggleMenu(): void {
    this.menuOpen.update((v) => !v);
  }
}
