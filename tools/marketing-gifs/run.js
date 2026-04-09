const fs = require('node:fs');
const fsp = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SAMPLE_DIR = path.join(REPO_ROOT, 'samples', 'taskflurry');
const SAMPLE_DIST_DIR = path.join(SAMPLE_DIR, 'dist', 'taskflurry');
const SAMPLE_BROWSER_DIST_DIR = path.join(SAMPLE_DIST_DIR, 'browser');
const ARTIFACTS_ROOT = path.join(REPO_ROOT, 'artifacts', 'marketing-gifs');
const TEMP_ROOT = path.join(ARTIFACTS_ROOT, '.tmp');
const SERVER_PORT = 4173;
const BASE_URL = `http://127.0.0.1:${SERVER_PORT}`;
const FIXED_NOW = '2024-01-24T14:00:00.000Z';

const VIEWPORT = { width: 1440, height: 900 };
const CONTEXT_OPTIONS = {
  viewport: VIEWPORT,
  deviceScaleFactor: 2,
  colorScheme: 'light',
  locale: 'en-US',
  timezoneId: 'America/New_York',
  reducedMotion: 'no-preference',
};

const GIF_OPTIONS = {
  fps: 15,
  width: 960,
};

const SCENARIOS = [
  {
    slug: 'projects-to-tasks',
    title: 'Projects to Tasks Drill-down',
    route: '/projects/list',
    description: 'Select a project and reveal the linked task list.',
    async ready(page) {
      await page.getByTestId('projects-grid').waitFor({ state: 'visible' });
      await page.getByTestId('project-card-p1').waitFor({ state: 'visible' });
    },
    async capture(page) {
      await page.waitForTimeout(500);
      await page.getByTestId('project-card-p1').click();
      await page.getByTestId('project-tasks-section').waitFor({ state: 'visible' });
      await page.getByTestId('project-task-row-t1').waitFor({ state: 'visible' });
      await page.waitForTimeout(1800);
    },
    holdMs: 1200,
  },
  {
    slug: 'create-task',
    title: 'Task Creation Flow',
    route: '/tasks/create?projectId=p1',
    description: 'Fill the create form and land on the success state.',
    async ready(page) {
      await page.getByTestId('task-create-form').waitFor({ state: 'visible' });
      await page.getByTestId('task-create-project').waitFor({ state: 'visible' });
    },
    async capture(page) {
      await page.waitForTimeout(350);
      await page.getByTestId('task-create-title').fill('Ship launch-ready GIF automation');
      await page.waitForTimeout(300);
      await page.getByTestId('task-create-description').fill('Capture deterministic Taskflurry flows for flurryx marketing assets.');
      await page.waitForTimeout(300);
      await page.getByTestId('task-create-priority').selectOption('high');
      await page.waitForTimeout(300);
      await page.getByTestId('task-create-submit').click();
      await page.getByTestId('task-create-success').waitFor({ state: 'visible' });
      await page.waitForTimeout(1700);
    },
    holdMs: 1200,
  },
  {
    slug: 'update-task',
    title: 'Task Update Flow',
    route: '/tasks/t1',
    description: 'Edit an existing task and show the updated detail view.',
    async ready(page) {
      await page.getByTestId('task-detail-card').waitFor({ state: 'visible' });
    },
    async capture(page) {
      await page.waitForTimeout(400);
      await page.getByTestId('task-detail-edit').click();
      await page.getByTestId('task-detail-form').waitFor({ state: 'visible' });
      await page.waitForTimeout(250);
      await page.getByTestId('task-detail-title-input').fill('Design polished launch walkthrough');
      await page.waitForTimeout(300);
      await page.getByTestId('task-detail-description-input').fill('Refine the task detail flow to highlight deterministic state updates.');
      await page.waitForTimeout(300);
      await page.getByTestId('task-detail-status-input').selectOption('done');
      await page.waitForTimeout(300);
      await page.getByTestId('task-detail-save').click();
      await page.getByTestId('task-detail-card').waitFor({ state: 'visible' });
      await waitForText(page.getByTestId('task-detail-status'), 'done');
      await waitForText(page.getByTestId('task-detail-title'), 'Design polished launch walkthrough');
      await page.waitForTimeout(1600);
    },
    holdMs: 1200,
  },
  {
    slug: 'delete-task',
    title: 'Delete Task From List',
    route: '/tasks/list',
    description: 'Delete a task and show the list mutation immediately.',
    async ready(page) {
      await page.getByTestId('tasks-list').waitFor({ state: 'visible' });
      await page.getByTestId('tasks-list-item-t9').waitFor({ state: 'visible' });
    },
    async capture(page) {
      await page.waitForTimeout(500);
      await page.getByTestId('tasks-delete-t9').click();
      await page.getByTestId('tasks-list-item-t9').waitFor({ state: 'detached' });
      await page.waitForTimeout(1900);
    },
    holdMs: 1200,
  },
  {
    slug: 'history-time-travel',
    title: 'Store History Time Travel',
    route: '/tasks/list',
    description: 'Delete a task, jump back through the timeline, and restore the original state.',
    async ready(page) {
      await page.getByTestId('tasks-list').waitFor({ state: 'visible' });
      await page.getByTestId('tasks-list-item-t2').waitFor({ state: 'visible' });
    },
    async prepare(page) {
      await page.getByTestId('activity-panel-toggle').click();
      await page.getByTestId('activity-panel').waitFor({ state: 'visible' });
      await page.getByTestId('activity-store-0').click();
      await page.getByTestId('activity-tab-history').click();
    },
    async capture(page) {
      await page.waitForTimeout(500);
      await page.getByTestId('tasks-delete-t2').click();
      await page.getByTestId('tasks-list-item-t2').waitFor({ state: 'detached' });
      await page.waitForTimeout(800);

      const restoreEntry = page
        .locator('[data-testid^="activity-history-entry-"]')
        .filter({ hasText: 'Removed item' })
        .filter({ hasText: 'TASK_DETAIL [t2]' })
        .first();

      await restoreEntry.waitFor({ state: 'visible' });
      await restoreEntry.click();
      await page.getByTestId('tasks-list-item-t2').waitFor({ state: 'visible' });
      await page.waitForTimeout(1800);
    },
    holdMs: 1400,
  },
];

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.list) {
    printScenarioList();
    return;
  }

  const scenarios = args.scenario
    ? SCENARIOS.filter((scenario) => scenario.slug === args.scenario)
    : SCENARIOS;

  if (scenarios.length === 0) {
    throw new Error(`Unknown scenario: ${args.scenario}`);
  }

  await ensureDirectory(ARTIFACTS_ROOT);
  await ensureDirectory(TEMP_ROOT);

  await verifyBinary('ffmpeg', ['-version'], 'Install it with `brew install ffmpeg`.');

  console.log('Building Taskflurry sample...');
  await runCommand('npm', ['run', 'build'], {
    cwd: SAMPLE_DIR,
    description: 'Build Taskflurry sample',
  });

  const staticRoot = resolveStaticRoot();
  const server = await startStaticServer(staticRoot, SERVER_PORT);

  try {
    await waitForServer(`${BASE_URL}/index.html`);

    console.log('Launching Chromium capture runner...');
    const browser = await chromium.launch({ headless: true });
    const runStartedAt = new Date().toISOString();
    const results = [];

    try {
      for (const scenario of scenarios) {
        const result = await runScenario(browser, scenario);
        results.push(result);
        if (result.status === 'passed') {
          console.log(`Captured ${scenario.slug}`);
        } else {
          console.error(`Failed ${scenario.slug}: ${result.error}`);
        }
      }
    } finally {
      await browser.close();
    }

    const runFinishedAt = new Date().toISOString();
    await writeRunArtifacts({
      baseUrl: BASE_URL,
      startedAt: runStartedAt,
      finishedAt: runFinishedAt,
      results,
    });

    const failedResults = results.filter((result) => result.status === 'failed');
    if (failedResults.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    await stopStaticServer(server);
  }
}

async function runScenario(browser, scenario) {
  const scenarioDir = path.join(ARTIFACTS_ROOT, scenario.slug);
  const tempVideoDir = path.join(TEMP_ROOT, scenario.slug);
  await cleanDirectory(scenarioDir);
  await cleanDirectory(tempVideoDir);

  const context = await browser.newContext({
    ...CONTEXT_OPTIONS,
    recordVideo: {
      dir: tempVideoDir,
      size: VIEWPORT,
    },
  });

  await context.addInitScript(freezeTimeScript, { now: FIXED_NOW });

  const page = await context.newPage();
  const video = page.video();
  const videoStartedAt = Date.now();

  const outputPaths = {
    mp4: path.join(scenarioDir, `${scenario.slug}.mp4`),
    gif: path.join(scenarioDir, `${scenario.slug}.gif`),
    png: path.join(scenarioDir, `${scenario.slug}.png`),
    json: path.join(scenarioDir, `${scenario.slug}.json`),
  };

  try {
    await page.goto(new URL(scenario.route, `${BASE_URL}/`).toString(), { waitUntil: 'load' });
    await scenario.ready(page);

    if (scenario.prepare) {
      await scenario.prepare(page);
    }

    const captureStartedAt = Date.now();
    await scenario.capture(page);
    await page.waitForTimeout(scenario.holdMs ?? 900);
    const captureFinishedAt = Date.now();

    await page.screenshot({
      path: outputPaths.png,
      scale: 'css',
    });

    await page.close();
    await context.close();

    const webmPath = await video.path();
    const clipWindow = buildClipWindow({
      videoStartedAt,
      captureStartedAt,
      captureFinishedAt,
    });

    await convertRecording({
      webmPath,
      mp4Path: outputPaths.mp4,
      gifPath: outputPaths.gif,
      trimStartSeconds: clipWindow.trimStartSeconds,
      clipDurationSeconds: clipWindow.clipDurationSeconds,
      tempDir: tempVideoDir,
    });

    const manifest = await buildScenarioManifest({
      scenario,
      outputPaths,
      clipWindow,
    });

    await writeJson(outputPaths.json, manifest);
    await fsp.rm(webmPath, { force: true });

    return {
      slug: scenario.slug,
      title: scenario.title,
      status: 'passed',
      route: scenario.route,
      output: relativeOutputPaths(outputPaths),
      manifest: relativePath(outputPaths.json),
    };
  } catch (error) {
    await context.close().catch(() => undefined);
    return {
      slug: scenario.slug,
      title: scenario.title,
      status: 'failed',
      route: scenario.route,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function parseArgs(argv) {
  const args = {
    list: false,
    scenario: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--list') {
      args.list = true;
      continue;
    }

    if (value === '--scenario') {
      args.scenario = argv[index + 1];
      index += 1;
      continue;
    }

    if (value.startsWith('--scenario=')) {
      args.scenario = value.slice('--scenario='.length);
    }
  }

  return args;
}

function printScenarioList() {
  for (const scenario of SCENARIOS) {
    console.log(`${scenario.slug}: ${scenario.title}`);
  }
}

function resolveStaticRoot() {
  if (fs.existsSync(path.join(SAMPLE_BROWSER_DIST_DIR, 'index.html'))) {
    return SAMPLE_BROWSER_DIST_DIR;
  }

  if (fs.existsSync(path.join(SAMPLE_DIST_DIR, 'index.html'))) {
    return SAMPLE_DIST_DIR;
  }

  throw new Error('Could not find the built Taskflurry index.html file.');
}

async function convertRecording({
  webmPath,
  mp4Path,
  gifPath,
  trimStartSeconds,
  clipDurationSeconds,
  tempDir,
}) {
  const palettePath = path.join(tempDir, 'palette.png');
  const trimValue = formatSeconds(trimStartSeconds);
  const durationValue = formatSeconds(clipDurationSeconds);
  const scaleFilter = `scale=${GIF_OPTIONS.width}:-1:flags=lanczos`;

  await runCommand(
    'ffmpeg',
    [
      '-y',
      '-i',
      webmPath,
      '-ss',
      trimValue,
      '-t',
      durationValue,
      '-an',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      mp4Path,
    ],
    {
      cwd: REPO_ROOT,
      description: `Convert ${path.basename(webmPath)} to MP4`,
    }
  );

  await runCommand(
    'ffmpeg',
    [
      '-y',
      '-i',
      mp4Path,
      '-frames:v',
      '1',
      '-update',
      '1',
      '-vf',
      `fps=${GIF_OPTIONS.fps},${scaleFilter},palettegen=stats_mode=diff`,
      palettePath,
    ],
    {
      cwd: REPO_ROOT,
      description: `Generate palette for ${path.basename(mp4Path)}`,
    }
  );

  await runCommand(
    'ffmpeg',
    [
      '-y',
      '-i',
      mp4Path,
      '-i',
      palettePath,
      '-lavfi',
      `fps=${GIF_OPTIONS.fps},${scaleFilter}[video];[video][1:v]paletteuse=dither=sierra2_4a`,
      '-loop',
      '0',
      gifPath,
    ],
    {
      cwd: REPO_ROOT,
      description: `Convert ${path.basename(mp4Path)} to GIF`,
    }
  );

  await fsp.rm(palettePath, { force: true });
}

function buildClipWindow({ videoStartedAt, captureStartedAt, captureFinishedAt }) {
  const leadInMs = 150;
  const tailMs = 150;
  const trimStartMs = Math.max(0, captureStartedAt - videoStartedAt - leadInMs);
  const clipDurationMs = Math.max(1000, captureFinishedAt - captureStartedAt + leadInMs + tailMs);

  return {
    trimStartSeconds: trimStartMs / 1000,
    clipDurationSeconds: clipDurationMs / 1000,
    durationMs: clipDurationMs,
  };
}

async function buildScenarioManifest({ scenario, outputPaths, clipWindow }) {
  const [mp4Stats, gifStats, pngStats] = await Promise.all([
    getFileStats(outputPaths.mp4),
    getFileStats(outputPaths.gif),
    getFileStats(outputPaths.png),
  ]);

  return {
    slug: scenario.slug,
    title: scenario.title,
    description: scenario.description,
    route: scenario.route,
    baseUrl: BASE_URL,
    generatedAt: new Date().toISOString(),
    durationMs: clipWindow.durationMs,
    viewport: {
      width: VIEWPORT.width,
      height: VIEWPORT.height,
      deviceScaleFactor: CONTEXT_OPTIONS.deviceScaleFactor,
      locale: CONTEXT_OPTIONS.locale,
      timezoneId: CONTEXT_OPTIONS.timezoneId,
      colorScheme: CONTEXT_OPTIONS.colorScheme,
    },
    outputs: {
      mp4: {
        path: relativePath(outputPaths.mp4),
        sizeBytes: mp4Stats.size,
        width: VIEWPORT.width,
        height: VIEWPORT.height,
      },
      gif: {
        path: relativePath(outputPaths.gif),
        sizeBytes: gifStats.size,
        width: GIF_OPTIONS.width,
        height: Math.round((VIEWPORT.height / VIEWPORT.width) * GIF_OPTIONS.width),
      },
      png: {
        path: relativePath(outputPaths.png),
        sizeBytes: pngStats.size,
        width: VIEWPORT.width,
        height: VIEWPORT.height,
      },
    },
  };
}

async function writeRunArtifacts({ baseUrl, startedAt, finishedAt, results }) {
  const runSummaryPath = path.join(ARTIFACTS_ROOT, 'run-summary.json');
  const galleryPath = path.join(ARTIFACTS_ROOT, 'index.html');
  const summary = {
    baseUrl,
    startedAt,
    finishedAt,
    scenarios: results,
  };

  await writeJson(runSummaryPath, summary);
  await fsp.writeFile(galleryPath, buildGalleryHtml(results), 'utf8');
}

function buildGalleryHtml(results) {
  const cards = results
    .map((result) => {
      if (result.status === 'failed') {
        return `<article class="card card--failed"><h2>${escapeHtml(result.title)}</h2><p>${escapeHtml(result.error)}</p></article>`;
      }

      const gifPath = result.output.gif;
      const mp4Path = result.output.mp4;
      const pngPath = result.output.png;
      const manifestPath = result.manifest;

      return `
        <article class="card">
          <h2>${escapeHtml(result.title)}</h2>
          <p class="slug">${escapeHtml(result.slug)}</p>
          <img src="${gifPath}" alt="${escapeHtml(result.title)}" />
          <div class="links">
            <a href="${gifPath}">GIF</a>
            <a href="${mp4Path}">MP4</a>
            <a href="${pngPath}">PNG</a>
            <a href="${manifestPath}">Manifest</a>
          </div>
        </article>
      `;
    })
    .join('\n');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>flurryx marketing GIF review</title>
    <style>
      :root {
        color-scheme: light;
        font-family: Inter, Arial, sans-serif;
        background: #f5f7fb;
        color: #1f2937;
      }

      body {
        margin: 0;
        padding: 32px;
      }

      h1 {
        margin: 0 0 8px;
      }

      p {
        margin: 0 0 16px;
      }

      .grid {
        display: grid;
        gap: 24px;
        grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      }

      .card {
        background: #ffffff;
        border-radius: 20px;
        padding: 20px;
        box-shadow: 0 16px 40px rgba(15, 23, 42, 0.08);
      }

      .card--failed {
        border: 2px solid #ef4444;
      }

      .slug {
        color: #64748b;
        font-size: 14px;
      }

      img {
        width: 100%;
        border-radius: 14px;
        border: 1px solid #dbe4f0;
        margin-bottom: 14px;
      }

      .links {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
      }

      a {
        color: #2563eb;
        text-decoration: none;
      }
    </style>
  </head>
  <body>
    <h1>flurryx marketing GIF review</h1>
    <p>Generated from the deterministic Taskflurry capture pipeline.</p>
    <div class="grid">${cards}</div>
  </body>
</html>`;
}

async function startStaticServer(rootDir, port) {
  const server = http.createServer(async (req, res) => {
    const requestPath = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
    const decodedPath = decodeURIComponent(requestPath);
    const requestedFile = path.join(rootDir, decodedPath);
    const targetPath = await resolveRequestPath(rootDir, requestedFile, decodedPath);

    try {
      const file = await fsp.readFile(targetPath);
      res.writeHead(200, { 'Content-Type': contentType(targetPath) });
      res.end(file);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve());
  });

  return server;
}

async function stopStaticServer(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function resolveRequestPath(rootDir, requestedFile, decodedPath) {
  const normalizedRoot = path.resolve(rootDir);
  const normalizedRequested = path.resolve(requestedFile);
  if (!normalizedRequested.startsWith(normalizedRoot)) {
    return path.join(rootDir, 'index.html');
  }

  if (decodedPath === '/' || decodedPath === '') {
    return path.join(rootDir, 'index.html');
  }

  if (path.extname(decodedPath)) {
    return normalizedRequested;
  }

  return path.join(rootDir, 'index.html');
}

function contentType(filePath) {
  const extension = path.extname(filePath);
  switch (extension) {
    case '.css':
      return 'text/css; charset=utf-8';
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
      return 'text/javascript; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.png':
      return 'image/png';
    case '.svg':
      return 'image/svg+xml';
    case '.woff2':
      return 'font/woff2';
    default:
      return 'application/octet-stream';
  }
}

async function waitForServer(url, timeoutMs = 15000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // keep polling until the server is ready
    }

    await delay(250);
  }

  throw new Error(`Timed out waiting for ${url}`);
}

async function verifyBinary(command, args, helpText) {
  try {
    await runCommand(command, args, {
      cwd: REPO_ROOT,
      description: `Verify ${command}`,
      quiet: true,
    });
  } catch {
    throw new Error(`${command} is required. ${helpText}`);
  }
}

async function runCommand(command, args, options) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: process.env,
      stdio: options.quiet ? 'ignore' : 'inherit',
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${options.description} failed with exit code ${code ?? 'unknown'}.`));
    });
  });
}

async function cleanDirectory(directory) {
  await fsp.rm(directory, { recursive: true, force: true });
  await fsp.mkdir(directory, { recursive: true });
}

async function ensureDirectory(directory) {
  await fsp.mkdir(directory, { recursive: true });
}

async function writeJson(filePath, value) {
  await fsp.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function getFileStats(filePath) {
  return fsp.stat(filePath);
}

function relativeOutputPaths(outputPaths) {
  return {
    mp4: relativePath(outputPaths.mp4),
    gif: relativePath(outputPaths.gif),
    png: relativePath(outputPaths.png),
  };
}

function relativePath(filePath) {
  return path.relative(ARTIFACTS_ROOT, filePath).split(path.sep).join('/');
}

async function waitForEnabled(locator) {
  await locator.waitFor({ state: 'visible' });
  await locator.evaluate((element) => {
    return new Promise((resolve, reject) => {
      const startedAt = Date.now();

      const check = () => {
        if (!(element instanceof HTMLButtonElement)) {
          reject(new Error('Expected a button element.'));
          return;
        }

        if (!element.disabled) {
          resolve();
          return;
        }

        if (Date.now() - startedAt > 5000) {
          reject(new Error('Timed out waiting for button to become enabled.'));
          return;
        }

        window.requestAnimationFrame(check);
      };

      check();
    });
  });
}

async function waitForText(locator, expectedText) {
  await locator.waitFor({ state: 'visible' });
  await locator.evaluate(
    (element, expected) => {
      return new Promise((resolve, reject) => {
        const startedAt = Date.now();

        const check = () => {
          const text = element.textContent?.trim() ?? '';
          if (text === expected) {
            resolve();
            return;
          }

          if (Date.now() - startedAt > 5000) {
            reject(new Error(`Timed out waiting for text "${expected}".`));
            return;
          }

          window.requestAnimationFrame(check);
        };

        check();
      });
    },
    expectedText
  );
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatSeconds(value) {
  return value.toFixed(3);
}

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function freezeTimeScript({ now }) {
  const fixedNow = new Date(now).valueOf();
  const NativeDate = Date;

  class FixedDate extends NativeDate {
    constructor(...args) {
      if (args.length === 0) {
        super(fixedNow);
        return;
      }

      super(...args);
    }

    static now() {
      return fixedNow;
    }

    static parse(value) {
      return NativeDate.parse(value);
    }

    static UTC(...args) {
      return NativeDate.UTC(...args);
    }
  }

  Object.defineProperty(window, 'Date', {
    configurable: true,
    writable: true,
    value: FixedDate,
  });

  Object.defineProperty(globalThis, 'Date', {
    configurable: true,
    writable: true,
    value: FixedDate,
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
