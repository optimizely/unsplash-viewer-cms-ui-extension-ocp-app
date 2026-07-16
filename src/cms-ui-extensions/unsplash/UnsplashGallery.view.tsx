import {
  AxiomProvider,
  Box,
  Button,
  Grid,
  Group,
  Heading,
  SearchInput,
  Spinner,
  Text
} from '@optiaxiom/react';
import {register, type ExtensionContext} from '@optimizely/cms-extensibility-sdk';
import {CMS_EXTENSION_FUNCTION_ID, UNSPLASH_DEVELOPERS_URL} from '@shared/constants';
import {useCallback, useEffect, useRef, useState} from 'react';
import {copyToClipboard} from '../common/clipboard';

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

// A full-page view isn't scoped to a single content item, so it renders more
// results per page than the sidebar and lays them out in a wider grid.
const VIEW_PER_PAGE = 30;

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

interface StatusState {
  text: string;
  error: boolean;
}

const COPY_NOTICE_MS = 1500;

function UnsplashGallery({context}: {context: ExtensionContext}) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [status, setStatus] = useState<StatusState>({text: 'Search Unsplash to browse photos.', error: false});
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<StatusState | null>(null);
  const inFlight = useRef<Promise<unknown> | null>(null);
  const noticeTimer = useRef<number | null>(null);

  const flashNotice = useCallback((text: string, error: boolean) => {
    if (noticeTimer.current !== null) {
      window.clearTimeout(noticeTimer.current);
    }
    setNotice({text, error});
    noticeTimer.current = window.setTimeout(() => {
      noticeTimer.current = null;
      setNotice((prev) => (prev && prev.text === text ? null : prev));
    }, COPY_NOTICE_MS);
  }, []);

  const runSearch = useCallback(async (rawQuery: string, nextPage: number) => {
    const trimmed = rawQuery.trim();
    if (!trimmed) {
      setStatus({text: 'Enter a search term first.', error: false});
      return;
    }
    setPage(nextPage);
    setStatus({text: 'Searching…', error: false});
    setLoading(true);
    const pending = context.extension.invokeFunction(CMS_EXTENSION_FUNCTION_ID, {
      action: 'search',
      params: {query: trimmed, page: nextPage, perPage: VIEW_PER_PAGE}
    });
    inFlight.current = pending;
    try {
      const response = await pending;
      if (inFlight.current !== pending) return;
      const {statusCode} = response;
      const envelope = (response.data ?? {}) as Envelope<SearchResult>;
      const isEnvelope = envelope && typeof envelope === 'object' && 'ok' in envelope;
      if (statusCode !== 200 && (!isEnvelope || envelope.ok)) {
        setStatus({
          text: describeError({error: 'request_failed', message: `Backend returned HTTP ${statusCode}.`}),
          error: true
        });
        setResult(null);
        return;
      }
      if (!isEnvelope) {
        setStatus({text: 'Unexpected response from backend.', error: true});
        setResult(null);
        return;
      }
      if (!envelope.ok) {
        setStatus({text: describeError(envelope as ErrorPayload), error: true});
        setResult(null);
        return;
      }
      const next = envelope.result;
      setResult(next);
      setNotice(null);
      if (next.results.length === 0) {
        setStatus({text: `No results for "${trimmed}".`, error: false});
      } else {
        setStatus({text: `${formatCount(next.total)} results for "${trimmed}"`, error: false});
      }
    } catch (err) {
      if (inFlight.current !== pending) return;
      setStatus({text: err instanceof Error ? err.message : 'Search failed.', error: true});
    } finally {
      if (inFlight.current === pending) inFlight.current = null;
      setLoading(false);
    }
  }, [context]);

  useEffect(() => {
    void context.extension.setReady();
  }, [context]);

  useEffect(() => () => {
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
  }, []);

  const onCopyImageUrl = useCallback(async (photo: Photo) => {
    const ok = await copyToClipboard(photo.urls.regular);
    flashNotice(ok ? 'Image URL copied' : 'Could not copy to clipboard.', !ok);
    if (ok) {
      // Required by Unsplash API guidelines whenever a photo is used.
      void context.extension.invokeFunction(CMS_EXTENSION_FUNCTION_ID, {
        action: 'trackDownload',
        params: {downloadLocation: photo.links.downloadLocation}
      });
    }
  }, [context, flashNotice]);

  const totalPages = result?.totalPages ?? 0;

  return (
    <Box mx="auto" p="24" style={{maxWidth: 1200}}>
      <Group flexDirection="column" gap="16">
        <Heading level="1">Unsplash Gallery</Heading>

        <Group gap="8">
          <SearchInput
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void runSearch(query, 1);
              }
            }}
            placeholder="Search photos…"
            value={query}
            w="full"
          />
          <Button appearance="primary" onClick={() => void runSearch(query, 1)}>
            Search
          </Button>
        </Group>

        <Group alignItems="center" gap="12" justifyContent="space-between">
          {status.text && (
            <Text color={status.error ? 'fg.error' : 'fg.secondary'} fontSize="sm">
              {status.text}
            </Text>
          )}
          {notice && (
            <Text color={notice.error ? 'fg.error' : 'fg.success'} fontSize="sm">
              {notice.text}
            </Text>
          )}
        </Group>

        {loading && <Spinner size="md" />}

        {result && result.results.length > 0 && (
          <Grid gap="12" gridTemplateColumns="4">
            {result.results.map((photo) => (
              <Box
                key={photo.id}
                onClick={() => void onCopyImageUrl(photo)}
                overflow="hidden"
                rounded="md"
                style={{cursor: 'pointer'}}
                title="Click to copy image URL"
              >
                <img
                  alt={photo.altDescription || photo.description || `Photo by ${photo.user.name}`}
                  src={photo.urls.small}
                  style={{
                    aspectRatio: '1 / 1',
                    display: 'block',
                    height: 'auto',
                    objectFit: 'cover',
                    width: '100%'
                  }}
                />
              </Box>
            ))}
          </Grid>
        )}

        {result && totalPages > 1 && (
          <Group gap="8" justifyContent="center">
            <Button
              aria-label="Previous page"
              disabled={page <= 1}
              onClick={() => void runSearch(query, page - 1)}
            >
              ‹ Prev
            </Button>
            <Text fontSize="sm">
              {page} / {totalPages}
            </Text>
            <Button
              aria-label="Next page"
              disabled={page >= totalPages}
              onClick={() => void runSearch(query, page + 1)}
            >
              Next ›
            </Button>
          </Group>
        )}
      </Group>
    </Box>
  );
}

register((context) => (
  <AxiomProvider>
    <UnsplashGallery context={context} />
  </AxiomProvider>
));
