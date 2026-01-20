import { useEffect } from 'react'

const DASHBOARD_BODY_CLASS = 'h-screen flex flex-col bg-theme-bg font-sans text-theme-text'
const DETAIL_BODY_CLASS = 'min-h-screen bg-blue-50/40 font-sans text-zinc-800 dark:bg-neutral-950 dark:text-zinc-100'

function useLegacyScript(loader, bodyClass, title) {
  useEffect(() => {
    document.title = title
    document.body.className = bodyClass
    loader()
    return () => {
      document.body.className = ''
    }
  }, [loader, bodyClass, title])
}

function DashboardPage() {
  useLegacyScript(() => {
    import('./legacy-dashboard.js')
  }, DASHBOARD_BODY_CLASS, 'EZVals')

  return (
    <div className="h-screen flex flex-col bg-theme-bg font-sans text-theme-text">
      <svg xmlns="http://www.w3.org/2000/svg" className="hidden">
        <symbol id="icon-search" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8"></circle>
          <path d="M21 21l-4.35-4.35"></path>
        </symbol>
        <symbol id="icon-filter" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
        </symbol>
        <symbol id="icon-grid" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="7" height="7"></rect>
          <rect x="14" y="3" width="7" height="7"></rect>
          <rect x="14" y="14" width="7" height="7"></rect>
          <rect x="3" y="14" width="7" height="7"></rect>
        </symbol>
        <symbol id="icon-gear" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"></path>
        </symbol>
        <symbol id="icon-play" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </symbol>
        <symbol id="icon-stop" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="6" width="12" height="12"></rect>
        </symbol>
        <symbol id="icon-github" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"></path>
        </symbol>
        <symbol id="icon-doc" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
        </symbol>
        <symbol id="icon-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </symbol>
        <symbol id="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="5"></circle>
          <line x1="12" y1="1" x2="12" y2="3"></line>
          <line x1="12" y1="21" x2="12" y2="23"></line>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
          <line x1="1" y1="12" x2="3" y2="12"></line>
          <line x1="21" y1="12" x2="23" y2="12"></line>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
        </symbol>
        <symbol id="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"></path>
        </symbol>
        <symbol id="icon-download" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </symbol>
        <symbol id="icon-chevron-up" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 15l-6-6-6 6"></path>
        </symbol>
        <symbol id="icon-chevron-down" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 9l6 6 6-6"></path>
        </symbol>
        <symbol id="icon-chevron-right" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 18l6-6-6-6"></path>
        </symbol>
        <symbol id="icon-copy" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="9" y="9" width="13" height="13" rx="2"></rect>
          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"></path>
        </symbol>
        <symbol id="icon-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M20 6L9 17l-5-5"></path>
        </symbol>
        <symbol id="icon-pencil" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path>
        </symbol>
      </svg>

      <header className="sticky top-0 z-40 border-b border-theme-border bg-theme-bg/95 backdrop-blur-sm">
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="EZVals" className="h-7 w-7" />
            <span className="font-mono text-base font-semibold tracking-tight text-theme-text">EZVals</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <svg className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <use href="#icon-search"></use>
              </svg>
              <input id="search-input" type="search" className="w-56 rounded border border-theme-border bg-theme-bg-secondary py-1.5 pl-7 pr-3 text-xs text-theme-text placeholder:text-theme-text-muted focus:border-blue-500 focus:outline-none" placeholder="Search..." />
            </div>
            <div className="dropdown relative">
              <button id="filters-toggle" className="relative flex h-7 w-7 items-center justify-center rounded border border-theme-btn-border bg-theme-btn-bg text-theme-text-secondary hover:bg-theme-btn-bg-hover hover:text-theme-text">
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <use href="#icon-filter"></use>
                </svg>
                <span id="filters-count-badge" className="filter-badge absolute -right-1 -top-1 h-4 min-w-[14px] items-center justify-center rounded-full bg-blue-500 px-1 text-[9px] font-bold text-white"></span>
              </button>
              <div id="filters-menu" className="filters-panel absolute right-0 z-50 mt-1 w-80 rounded border border-zinc-700 bg-zinc-900 p-3 text-xs shadow-xl">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Filters</span>
                  <button id="clear-filters" className="text-[10px] text-blue-400 hover:text-blue-300">Clear</button>
                </div>
                <div className="mb-2 rounded bg-zinc-800/50 p-2">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-[9px] font-medium uppercase tracking-wider text-zinc-500">Score</span>
                    <select id="key-select" className="flex-1 rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-200 focus:border-blue-500 focus:outline-none"></select>
                  </div>
                  <div className="flex gap-1" id="value-section">
                    <select id="fv-op" className="w-12 rounded border border-zinc-700 bg-zinc-800 px-1 py-0.5 text-[11px] text-zinc-200 focus:outline-none">
                      <option value=">">&gt;</option>
                      <option value=">=">&gt;=</option>
                      <option value="<">&lt;</option>
                      <option value="<=">&lt;=</option>
                      <option value="==">=</option>
                      <option value="!=">!=</option>
                    </select>
                    <input id="fv-val" type="number" step="any" placeholder="val" className="w-14 rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-200 focus:outline-none" />
                    <button id="add-fv" className="rounded bg-blue-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-blue-500">+</button>
                  </div>
                  <div className="flex gap-1 mt-1" id="passed-section">
                    <select id="fp-val" className="flex-1 rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-200 focus:outline-none">
                      <option value="true">Passed</option>
                      <option value="false">Failed</option>
                    </select>
                    <button id="add-fp" className="rounded bg-blue-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-blue-500">+</button>
                  </div>
                </div>
                <div className="mb-2 flex flex-wrap gap-1">
                  <button id="filter-has-annotation" className="rounded px-2 py-0.5 text-[10px] font-medium bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300">Has Note</button>
                  <button id="filter-has-error" className="rounded px-2 py-0.5 text-[10px] font-medium bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300">Has Error</button>
                  <button id="filter-has-url" className="rounded px-2 py-0.5 text-[10px] font-medium bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300">Has URL</button>
                  <button id="filter-has-messages" className="rounded px-2 py-0.5 text-[10px] font-medium bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300">Has Messages</button>
                </div>
                <div className="mb-2">
                  <div className="text-[9px] font-medium uppercase tracking-wider text-zinc-500 mb-1">Dataset</div>
                  <div id="dataset-pills" className="flex flex-wrap gap-1"></div>
                </div>
                <div className="mb-2">
                  <div className="text-[9px] font-medium uppercase tracking-wider text-zinc-500 mb-1">Labels</div>
                  <div id="label-pills" className="flex flex-wrap gap-1"></div>
                </div>
                <div id="active-filters" className="flex flex-wrap gap-1 border-t border-zinc-800 pt-2"></div>
              </div>
            </div>
            <div className="dropdown relative">
              <button id="columns-toggle" className="flex h-7 w-7 items-center justify-center rounded border border-theme-btn-border bg-theme-btn-bg text-theme-text-secondary hover:bg-theme-btn-bg-hover hover:text-theme-text">
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <use href="#icon-grid"></use>
                </svg>
              </button>
              <div id="columns-menu" className="columns-panel absolute right-0 z-50 mt-1 w-48 rounded border border-zinc-700 bg-zinc-900 p-2 text-xs shadow-xl">
                <div className="text-[9px] font-medium uppercase tracking-wider text-zinc-500 mb-2">Columns</div>
                <label className="flex items-center gap-2 py-0.5 text-zinc-300 hover:text-zinc-100"><input type="checkbox" data-col="function" defaultChecked className="accent-blue-500" /><span>Eval</span></label>
                <label className="flex items-center gap-2 py-0.5 text-zinc-300 hover:text-zinc-100"><input type="checkbox" data-col="input" defaultChecked className="accent-blue-500" /><span>Input</span></label>
                <label className="flex items-center gap-2 py-0.5 text-zinc-300 hover:text-zinc-100"><input type="checkbox" data-col="reference" defaultChecked className="accent-blue-500" /><span>Reference</span></label>
                <label className="flex items-center gap-2 py-0.5 text-zinc-300 hover:text-zinc-100"><input type="checkbox" data-col="output" defaultChecked className="accent-blue-500" /><span>Output</span></label>
                <label className="flex items-center gap-2 py-0.5 text-zinc-300 hover:text-zinc-100"><input type="checkbox" data-col="error" className="accent-blue-500" /><span>Error</span></label>
                <label className="flex items-center gap-2 py-0.5 text-zinc-300 hover:text-zinc-100"><input type="checkbox" data-col="scores" defaultChecked className="accent-blue-500" /><span>Scores</span></label>
                <label className="flex items-center gap-2 py-0.5 text-zinc-300 hover:text-zinc-100"><input type="checkbox" data-col="latency" defaultChecked className="accent-blue-500" /><span>Latency</span></label>
                <div className="mt-2 flex gap-1 border-t border-zinc-800 pt-2">
                  <button id="reset-columns" className="flex-1 rounded bg-zinc-800 px-2 py-1 text-[10px] text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300">Reset</button>
                  <button id="reset-sorting" className="flex-1 rounded bg-zinc-800 px-2 py-1 text-[10px] text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300">Sort</button>
                  <button id="reset-widths" className="flex-1 rounded bg-zinc-800 px-2 py-1 text-[10px] text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300">Width</button>
                </div>
              </div>
            </div>
            <div className="dropdown relative">
              <button id="export-toggle" className="flex h-7 w-7 items-center justify-center rounded border border-theme-btn-border bg-theme-btn-bg text-theme-text-secondary hover:bg-theme-btn-bg-hover hover:text-theme-text">
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <use href="#icon-download"></use>
                </svg>
              </button>
              <div id="export-menu" className="absolute right-0 z-50 mt-1 w-44 rounded border border-zinc-700 bg-zinc-900 p-2 text-xs shadow-xl hidden">
                <div className="text-[9px] font-medium uppercase tracking-wider text-zinc-500 mb-2">Export</div>
                <button id="export-json-btn" className="w-full flex items-center gap-2 py-1.5 px-2 rounded text-zinc-300 hover:bg-zinc-800">
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><use href="#icon-download"></use></svg>
                  JSON
                  <span className="ml-auto text-zinc-500 text-[9px]">raw</span>
                </button>
                <button id="export-csv-btn" className="w-full flex items-center gap-2 py-1.5 px-2 rounded text-zinc-300 hover:bg-zinc-800">
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><use href="#icon-download"></use></svg>
                  CSV
                  <span className="ml-auto text-zinc-500 text-[9px]">raw</span>
                </button>
                <div className="border-t border-zinc-800 my-1.5"></div>
                <div className="text-[9px] text-zinc-500 mb-1 px-2">Filtered view</div>
                <button id="export-md-btn" className="w-full flex items-center gap-2 py-1.5 px-2 rounded text-zinc-300 hover:bg-zinc-800">
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><use href="#icon-download"></use></svg>
                  Markdown
                </button>
              </div>
            </div>
            <button id="settings-toggle" className="flex h-7 w-7 items-center justify-center rounded border border-theme-btn-border bg-theme-btn-bg text-theme-text-secondary hover:bg-theme-btn-bg-hover hover:text-theme-text">
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <use href="#icon-gear"></use>
              </svg>
            </button>
            <div className="flex items-center">
              <span id="compare-mode-label" className="hidden h-7 items-center px-3 text-xs font-medium text-theme-text-muted select-none cursor-default border border-transparent">
                Compare Mode
              </span>
              <button id="play-btn" className="flex h-7 items-center gap-1.5 rounded-l bg-emerald-600 px-3 text-xs font-medium text-white hover:bg-emerald-500">
                <svg className="play-icon h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
                  <use href="#icon-play"></use>
                </svg>
                <svg className="stop-icon hidden h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
                  <use href="#icon-stop"></use>
                </svg>
                <span id="play-btn-text">Run</span>
              </button>
              <div className="dropdown relative">
                <button id="run-dropdown-toggle" className="hidden h-7 items-center justify-center rounded-r border-l border-emerald-700 bg-emerald-600 px-1.5 text-white hover:bg-emerald-500">
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <use href="#icon-chevron-down"></use>
                  </svg>
                </button>
                <div id="run-dropdown-menu" className="absolute right-0 z-50 mt-1 w-52 rounded border border-zinc-700 bg-zinc-900 py-1 text-xs shadow-xl hidden">
                  <button id="run-rerun-option" className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-zinc-800">
                    <svg className="h-3 w-3 mt-0.5 text-emerald-400 invisible flex-shrink-0" id="rerun-check"><use href="#icon-check"></use></svg>
                    <div>
                      <div className="text-zinc-200">Rerun</div>
                      <div className="text-zinc-500 text-[10px]">Overwrite current run results</div>
                    </div>
                  </button>
                  <button id="run-new-option" className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-zinc-800">
                    <svg className="h-3 w-3 mt-0.5 text-emerald-400 invisible flex-shrink-0" id="new-check"><use href="#icon-check"></use></svg>
                    <div>
                      <div className="text-zinc-200">New Run</div>
                      <div className="text-zinc-500 text-[10px]">Create a fresh run in this session</div>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-auto px-4 py-4">
        <div id="results"></div>
      </main>

      <footer className="shrink-0 border-t border-theme-border bg-theme-bg py-3">
        <div className="flex items-center justify-center gap-6 text-xs text-theme-text-muted">
          <a href="https://github.com/camronh/EZVals" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-theme-text-secondary">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
              <use href="#icon-github"></use>
            </svg>
            GitHub
          </a>
          <a href="https://ezvals.com" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-theme-text-secondary">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <use href="#icon-doc"></use>
            </svg>
            Docs
          </a>
        </div>
      </footer>

      <div id="settings-modal" className="fixed inset-0 z-50 hidden">
        <div className="absolute inset-0 bg-black/60" id="settings-backdrop"></div>
        <div className="absolute left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-lg border border-theme-border bg-theme-bg p-4 shadow-xl">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-sm font-medium text-theme-text">Settings</span>
            <button id="settings-close" className="text-theme-text-muted hover:text-theme-text-secondary">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <use href="#icon-close"></use>
              </svg>
            </button>
          </div>
          <form id="settings-form" className="space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <label className="text-theme-text-muted">Concurrency</label>
              <input type="number" name="concurrency" min="0" className="w-20 rounded border border-theme-border bg-theme-bg-secondary px-2 py-1 text-theme-text focus:border-blue-500 focus:outline-none" />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-theme-text-muted">Results dir</label>
              <input type="text" name="results_dir" className="w-32 rounded border border-theme-border bg-theme-bg-secondary px-2 py-1 text-theme-text focus:border-blue-500 focus:outline-none" />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-theme-text-muted">Timeout (s)</label>
              <input type="number" name="timeout" min="0" step="0.1" className="w-20 rounded border border-theme-border bg-theme-bg-secondary px-2 py-1 text-theme-text focus:border-blue-500 focus:outline-none" placeholder="none" />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-theme-text-muted">Theme</label>
              <button type="button" id="theme-toggle" className="flex items-center gap-1.5 rounded border border-theme-border bg-theme-bg-secondary px-2 py-1 text-theme-text-secondary hover:bg-theme-bg-elevated">
                <svg className="hidden dark:block h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <use href="#icon-sun"></use>
                </svg>
                <svg className="block dark:hidden h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <use href="#icon-moon"></use>
                </svg>
                <span className="dark:hidden">Dark</span><span className="hidden dark:inline">Light</span>
              </button>
            </div>
            <div className="flex justify-end gap-2 border-t border-theme-border pt-3">
              <button type="button" id="settings-cancel" className="rounded border border-theme-border bg-theme-bg-secondary px-3 py-1.5 text-theme-text-muted hover:bg-theme-bg-elevated">Cancel</button>
              <button type="submit" className="rounded bg-blue-600 px-3 py-1.5 font-medium text-white hover:bg-blue-500">Save</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

function DetailPage() {
  useLegacyScript(() => {
    import('./legacy-detail.js')
  }, DETAIL_BODY_CLASS, 'Result Detail - EZVals')

  return (
    <div className="min-h-screen bg-blue-50/40 font-sans text-zinc-800 dark:bg-neutral-950 dark:text-zinc-100">
      <div id="app" className="flex flex-col h-screen">
        <div className="flex-1 flex items-center justify-center text-zinc-400">Loading...</div>
      </div>
    </div>
  )
}

export default function App() {
  const path = window.location.pathname
  const isDetail = /^\/runs\/[^/]+\/results\/\d+/.test(path)

  return isDetail ? <DetailPage /> : <DashboardPage />
}
