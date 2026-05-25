import type {ViewExtension} from '@optimizely/cms-extensions-sdk';
import {CMS_EXTENSION_FUNCTION_ID, DEFAULT_PER_PAGE, UNSPLASH_DEVELOPERS_URL} from '@shared/constants';

import {createButton} from '../common/dom';

import styles from './UnsplashViewer.css?inline';

interface Photo {
  id: string;
  description: string | null;
  altDescription: string | null;
  width: number;
  height: number;
  color: string | null;
  urls: {thumb: string; small: string; regular: string; full: string};
  links: {html: string; downloadLocation: string};
  user: {name: string; username: string; profileUrl: string};
}

interface SearchResult {
  total: number;
  totalPages: number;
  page: number;
  perPage: number;
  results: Photo[];
}

interface ErrorPayload {
  error: string;
  message?: string;
}

type Envelope<T> =
  | {ok: true; result: T}
  | {ok: false; error: string; message?: string};

function injectStyles(scope: HTMLElement, css: string) {
  const style = document.createElement('style');
  style.setAttribute('data-ocp-extension-style', 'unsplash-viewer');
  style.textContent = css;
  scope.appendChild(style);
}

function describeError(payload: ErrorPayload): string {
  switch (payload.error) {
    case 'missing_access_key':
      return `No Unsplash Access Key configured. Add one in app settings or set APP_ENV_UNSPLASH_ACCESS_KEY. Get a key at ${UNSPLASH_DEVELOPERS_URL}.`;
    case 'unauthorized':
      return 'Unsplash rejected the Access Key. Check it in app settings.';
    case 'rate_limited':
      return 'Unsplash rate limit reached. Try again shortly.';
    case 'missing_query':
      return 'Enter a search term first.';
    default:
      return payload.message || `Request failed (${payload.error}).`;
  }
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

interface RowOptions {
  multi?: boolean;
  href?: string;
}

function createRow(label: string, value: string, options: RowOptions = {}): HTMLDivElement {
  const row = document.createElement('div');
  row.className = options.multi ? 'ocp-unsplash__row ocp-unsplash__row--multi' : 'ocp-unsplash__row';

  const labelEl = document.createElement('span');
  labelEl.className = 'ocp-unsplash__row-label';
  labelEl.textContent = label;
  row.appendChild(labelEl);

  let valueEl: HTMLElement;
  if (options.href) {
    const anchor = document.createElement('a');
    anchor.className = 'ocp-unsplash__row-value ocp-unsplash__row-value--link';
    anchor.href = options.href;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.textContent = value;
    valueEl = anchor;
  } else {
    valueEl = document.createElement('span');
    valueEl.className = 'ocp-unsplash__row-value';
    valueEl.textContent = value;
    valueEl.title = value;
  }
  row.appendChild(valueEl);

  return row;
}

export default function UnsplashViewer(): ViewExtension {
  let root: HTMLDivElement | null = null;
  let selectedPhotoId: string | null = null;
  let currentQuery = '';
  let currentPage = 1;
  let lastResult: SearchResult | null = null;
  let inFlight: Promise<unknown> | null = null;

  return {
    async render(context) {
      injectStyles(context.container, styles);

      const card = document.createElement('div');
      card.className = 'ocp-unsplash';

      const searchRow = document.createElement('div');
      searchRow.className = 'ocp-unsplash__search';
      const input = document.createElement('input');
      input.type = 'search';
      input.placeholder = 'Search photos…';
      input.spellcheck = false;
      const searchButton = createButton('Go', 'primary');
      searchRow.appendChild(input);
      searchRow.appendChild(searchButton);
      card.appendChild(searchRow);

      const status = document.createElement('div');
      status.className = 'ocp-unsplash__status';
      card.appendChild(status);

      const grid = document.createElement('div');
      grid.className = 'ocp-unsplash__grid';
      card.appendChild(grid);

      const pagination = document.createElement('div');
      pagination.className = 'ocp-unsplash__pagination';
      const prevButton = createButton('‹', 'neutral');
      prevButton.setAttribute('aria-label', 'Previous page');
      const pageInfo = document.createElement('span');
      pageInfo.className = 'ocp-unsplash__pagination-info';
      const nextButton = createButton('›', 'neutral');
      nextButton.setAttribute('aria-label', 'Next page');
      pagination.appendChild(prevButton);
      pagination.appendChild(pageInfo);
      pagination.appendChild(nextButton);
      pagination.style.display = 'none';
      card.appendChild(pagination);

      const detail = document.createElement('div');
      detail.className = 'ocp-unsplash__detail';
      detail.style.display = 'none';
      card.appendChild(detail);

      root = card;
      context.container.appendChild(root);

      const setStatus = (text: string, level: 'info' | 'error' = 'info') => {
        status.textContent = text;
        status.classList.toggle('ocp-unsplash__status--error', level === 'error');
      };

      const renderDetail = (photo: Photo | null) => {
        detail.innerHTML = '';
        if (!photo) {
          detail.style.display = 'none';
          return;
        }
        detail.style.display = 'flex';

        const img = document.createElement('img');
        img.className = 'ocp-unsplash__detail-image';
        img.src = photo.urls.small;
        img.alt = photo.altDescription || photo.description || `Photo by ${photo.user.name}`;
        detail.appendChild(img);

        detail.appendChild(createRow('Author', photo.user.name, {href: photo.user.profileUrl}));
        detail.appendChild(createRow('Size', `${photo.width} × ${photo.height}`));

        const description = photo.description || photo.altDescription;
        if (description) {
          detail.appendChild(createRow('About', description, {multi: true}));
        }

        const actions = document.createElement('div');
        actions.className = 'ocp-unsplash__detail-actions';

        const copyButton = createButton('Copy URL', 'primary');
        actions.appendChild(copyButton);

        const unsplashLink = document.createElement('a');
        unsplashLink.href = photo.links.html;
        unsplashLink.target = '_blank';
        unsplashLink.rel = 'noopener noreferrer';
        unsplashLink.textContent = 'View on Unsplash ↗';
        actions.appendChild(unsplashLink);

        detail.appendChild(actions);

        copyButton.onclick = async () => {
          try {
            await navigator.clipboard.writeText(photo.urls.regular);
            copyButton.textContent = 'Copied!';
            window.setTimeout(() => {
              copyButton.textContent = 'Copy URL';
            }, 1500);
            // Required by Unsplash API guidelines whenever a photo is used.
            void context.extension.invokeFunction(CMS_EXTENSION_FUNCTION_ID, {
              action: 'trackDownload',
              params: {downloadLocation: photo.links.downloadLocation},
            });
          } catch {
            setStatus('Could not copy to clipboard.', 'error');
          }
        };
      };

      const renderGrid = (photos: Photo[]) => {
        grid.innerHTML = '';
        photos.forEach((photo) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'ocp-unsplash__thumb';
          if (photo.color) {
            button.style.background = photo.color;
          }
          if (photo.id === selectedPhotoId) {
            button.classList.add('ocp-unsplash__thumb--selected');
          }
          const img = document.createElement('img');
          img.src = photo.urls.thumb;
          img.alt = photo.altDescription || photo.description || `Photo by ${photo.user.name}`;
          img.loading = 'lazy';
          button.appendChild(img);
          button.onclick = () => {
            selectedPhotoId = photo.id;
            renderGrid(photos);
            renderDetail(photo);
          };
          grid.appendChild(button);
        });
      };

      const renderPagination = (result: SearchResult) => {
        if (result.totalPages <= 1) {
          pagination.style.display = 'none';
          return;
        }
        pagination.style.display = 'flex';
        pageInfo.textContent = `${result.page} / ${result.totalPages} · ${formatCount(result.total)}`;
        (prevButton as HTMLButtonElement).disabled = result.page <= 1;
        (nextButton as HTMLButtonElement).disabled = result.page >= result.totalPages;
      };

      const runSearch = async (query: string, page: number) => {
        if (!query.trim()) {
          setStatus('Enter a search term first.');
          return;
        }
        currentQuery = query.trim();
        currentPage = page;
        setStatus('Searching…');
        const pending = context.extension.invokeFunction(CMS_EXTENSION_FUNCTION_ID, {
          action: 'search',
          params: {query: currentQuery, page: currentPage, perPage: DEFAULT_PER_PAGE},
        });
        inFlight = pending;
        try {
          const response = await pending;
          if (inFlight !== pending) return;
          const {statusCode} = response;
          const envelope = (response.data ?? {}) as Envelope<SearchResult>;
          const isEnvelope = envelope && typeof envelope === 'object' && 'ok' in envelope;
          if (statusCode !== 200 && (!isEnvelope || envelope.ok)) {
            setStatus(
              describeError({error: 'request_failed', message: `Backend returned HTTP ${statusCode}.`}),
              'error',
            );
            grid.innerHTML = '';
            pagination.style.display = 'none';
            return;
          }
          if (!isEnvelope) {
            setStatus('Unexpected response from backend.', 'error');
            grid.innerHTML = '';
            pagination.style.display = 'none';
            return;
          }
          if (!envelope.ok) {
            setStatus(describeError(envelope as ErrorPayload), 'error');
            grid.innerHTML = '';
            pagination.style.display = 'none';
            return;
          }
          const result = envelope.result;
          lastResult = result;
          if (result.results.length === 0) {
            setStatus(`No results for "${currentQuery}".`);
            grid.innerHTML = '';
            pagination.style.display = 'none';
            return;
          }
          setStatus(`${formatCount(result.total)} results for "${currentQuery}"`);
          selectedPhotoId = null;
          renderDetail(null);
          renderGrid(result.results);
          renderPagination(result);
        } catch (err) {
          if (inFlight !== pending) return;
          setStatus(err instanceof Error ? err.message : 'Search failed.', 'error');
        } finally {
          if (inFlight === pending) inFlight = null;
        }
      };

      searchButton.onclick = () => void runSearch(input.value, 1);
      input.onkeydown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          void runSearch(input.value, 1);
        }
      };
      prevButton.onclick = () => {
        if (lastResult && currentPage > 1) void runSearch(currentQuery, currentPage - 1);
      };
      nextButton.onclick = () => {
        if (lastResult && currentPage < lastResult.totalPages) {
          void runSearch(currentQuery, currentPage + 1);
        }
      };

      setStatus('Type a search term to begin.');
      await context.extension.setReady();
    },

    destroy() {
      if (root && root.parentElement) {
        root.parentElement.removeChild(root);
      }
      root = null;
      lastResult = null;
      inFlight = null;
      selectedPhotoId = null;
    },

    onConfigurationChange() {
      // No per-extension configuration consumed in this version.
    },
  };
}
