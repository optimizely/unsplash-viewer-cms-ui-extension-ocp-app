import {
  AxiomProvider,
  Box,
  Button,
  Card,
  CardHeader,
  CardImage,
  CardPreview,
  Grid,
  Group,
  SearchInput,
  Spinner,
  Text
} from '@optiaxiom/react';
import {register, type ContentState, type ExtensionContext} from '@optimizely/cms-extensibility-sdk';
import {CMS_EXTENSION_FUNCTION_ID, DEFAULT_PER_PAGE, UNSPLASH_DEVELOPERS_URL} from '@shared/constants';
import {useCallback, useEffect, useRef, useState} from 'react';

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

function UnsplashViewer({context}: {context: ExtensionContext}) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [status, setStatus] = useState<StatusState>({text: 'Type a search term to begin.', error: false});
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Photo | null>(null);
  const [copyLabel, setCopyLabel] = useState('Copy URL');
  const inFlight = useRef<Promise<unknown> | null>(null);
  const lastAutoQuery = useRef<string | null>(null);

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
      params: {query: trimmed, page: nextPage, perPage: DEFAULT_PER_PAGE}
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
      setSelected(null);
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
    const unsubscribe = context.content.subscribe((state: ContentState) => {
      const key = state?.key;
      if (!key || key === lastAutoQuery.current) return;
      lastAutoQuery.current = key;
      setQuery(key);
      void runSearch(key, 1);
    });
    return unsubscribe;
  }, [context, runSearch]);

  const onCopy = async () => {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(selected.urls.regular);
      setCopyLabel('Copied!');
      window.setTimeout(() => setCopyLabel('Copy URL'), 1500);
      // Required by Unsplash API guidelines whenever a photo is used.
      void context.extension.invokeFunction(CMS_EXTENSION_FUNCTION_ID, {
        action: 'trackDownload',
        params: {downloadLocation: selected.links.downloadLocation}
      });
    } catch {
      setStatus({text: 'Could not copy to clipboard.', error: true});
    }
  };

  const totalPages = result?.totalPages ?? 0;

  return (
    <Box p="16">
      <Group flexDirection="column" gap="16">
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
            Go
          </Button>
        </Group>

        <Text color={status.error ? 'fg.error' : 'fg.secondary'} fontSize="sm">
          {status.text}
        </Text>

        {loading && <Spinner size="sm" />}

        {result && result.results.length > 0 && (
          <Grid gap="8" gridTemplateColumns="3">
            {result.results.map((photo) => (
              <Box
                borderColor={photo.id === selected?.id ? 'border.accent' : 'transparent'}
                key={photo.id}
                onClick={() => setSelected(photo)}
                style={{borderStyle: 'solid', borderWidth: 2, cursor: 'pointer'}}
              >
                <Card>
                  <CardPreview>
                    <CardImage
                      alt={photo.altDescription || photo.description || `Photo by ${photo.user.name}`}
                      src={photo.urls.thumb}
                    />
                  </CardPreview>
                </Card>
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
              ‹
            </Button>
            <Text fontSize="sm">
              {page} / {totalPages} · {formatCount(result.total)}
            </Text>
            <Button
              aria-label="Next page"
              disabled={page >= totalPages}
              onClick={() => void runSearch(query, page + 1)}
            >
              ›
            </Button>
          </Group>
        )}

        {selected && (
          <Card>
            <CardPreview>
              <CardImage
                alt={selected.altDescription || selected.description || `Photo by ${selected.user.name}`}
                src={selected.urls.small}
              />
            </CardPreview>
            <CardHeader>
              <Group flexDirection="column" gap="4">
                <Group gap="4" justifyContent="space-between">
                  <Text color="fg.secondary" fontSize="xs">Author</Text>
                  <a
                    href={selected.user.profileUrl}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {selected.user.name}
                  </a>
                </Group>
                <Group gap="4" justifyContent="space-between">
                  <Text color="fg.secondary" fontSize="xs">Size</Text>
                  <Text fontSize="sm">{selected.width} × {selected.height}</Text>
                </Group>
                {(selected.description || selected.altDescription) && (
                  <Group flexDirection="column" gap="2">
                    <Text color="fg.secondary" fontSize="xs">About</Text>
                    <Text fontSize="sm">{selected.description || selected.altDescription}</Text>
                  </Group>
                )}
              </Group>
            </CardHeader>
            <Box p="12">
              <Group gap="8">
                <Button appearance="primary" onClick={() => void onCopy()}>
                  {copyLabel}
                </Button>
                <a
                  href={selected.links.html}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  View on Unsplash ↗
                </a>
              </Group>
            </Box>
          </Card>
        )}
      </Group>
    </Box>
  );
}

register((context) => (
  <AxiomProvider>
    <UnsplashViewer context={context} />
  </AxiomProvider>
));
