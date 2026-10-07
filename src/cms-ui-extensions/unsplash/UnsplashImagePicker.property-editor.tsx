import {
  AxiomProvider,
  Box,
  Button,
  Grid,
  Group,
  SearchInput,
  Spinner,
  Text
} from '@optiaxiom/react';
import {register, type ExtensionContext, type PropertyState} from '@optimizely/cms-extensibility-sdk';
import {CMS_EXTENSION_FUNCTION_ID, UNSPLASH_DEVELOPERS_URL} from '@shared/constants';
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

// The picker opens inline under the field, so keep a page of results small
// enough to fit without pushing the rest of the form far down.
const PICKER_PER_PAGE = 9;

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

interface StatusState {
  text: string;
  error: boolean;
}

/**
 * Property editor for a `string` property that holds an image URL. Instead of
 * typing a URL, the editor searches Unsplash and picks a photo; the photo's
 * `regular` URL is stored as the property value.
 *
 * The picker opens inline rather than in a pop-up: the extension iframe is
 * sandboxed without `allow-popups`, and a modal could not grow beyond the
 * iframe the CMS gives the field.
 */
function UnsplashImagePicker({context}: {context: ExtensionContext}) {
  const [property, setProperty] = useState<PropertyState | null>(null);
  // The stored value is only a URL, so the photographer is known only for a
  // photo picked in this session. Used for the Unsplash attribution line.
  const [picked, setPicked] = useState<Photo | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [status, setStatus] = useState<StatusState>({text: 'Search Unsplash for an image.', error: false});
  const [loading, setLoading] = useState(false);
  const inFlight = useRef<Promise<unknown> | null>(null);

  useEffect(() => {
    let active = true;

    // Initial value — subscribe() only reports changes made after subscribing.
    void context.property.get().then((state) => {
      if (active) setProperty(state);
    });
    const unsubscribe = context.property.subscribe(setProperty);

    void context.extension.setReady();

    return () => {
      active = false;
      unsubscribe();
    };
  }, [context]);

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
      params: {query: trimmed, page: nextPage, perPage: PICKER_PER_PAGE}
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
      setStatus(
        next.results.length === 0
          ? {text: `No results for "${trimmed}".`, error: false}
          : {text: 'Click a photo to use it.', error: false}
      );
    } catch (err) {
      if (inFlight.current !== pending) return;
      setStatus({text: err instanceof Error ? err.message : 'Search failed.', error: true});
    } finally {
      if (inFlight.current === pending) inFlight.current = null;
      setLoading(false);
    }
  }, [context]);

  const saveValue = useCallback(async (value: string): Promise<boolean> => {
    setSaveError(null);
    try {
      const outcome = await context.property.set(value);
      if (!outcome.success) {
        setSaveError(outcome.error || 'The CMS rejected the value.');
        return false;
      }
      return true;
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save the value.');
      return false;
    }
  }, [context]);

  const onPick = useCallback(async (photo: Photo) => {
    if (!(await saveValue(photo.urls.regular))) return;
    setPicked(photo);
    setPickerOpen(false);
    // Required by Unsplash API guidelines whenever a photo is used.
    void context.extension.invokeFunction(CMS_EXTENSION_FUNCTION_ID, {
      action: 'trackDownload',
      params: {downloadLocation: photo.links.downloadLocation}
    });
  }, [context, saveValue]);

  const onRemove = useCallback(async () => {
    if (await saveValue('')) setPicked(null);
  }, [saveValue]);

  const readonly = property?.readonly ?? true;
  const currentUrl = typeof property?.value === 'string' ? property.value : '';
  const credit = picked && picked.urls.regular === currentUrl ? picked.user.name : null;
  const totalPages = result?.totalPages ?? 0;

  return (
    <Box p="4">
      <Group flexDirection="column" gap="8">
        {currentUrl ? (
          <Group alignItems="start" gap="12">
            <img
              alt={picked?.altDescription || 'Selected image'}
              src={currentUrl}
              style={{
                aspectRatio: '1 / 1',
                borderRadius: 4,
                display: 'block',
                flexShrink: 0,
                objectFit: 'cover',
                width: 96
              }}
            />
            <Group flexDirection="column" gap="4" style={{minWidth: 0}}>
              <Text
                color="fg.secondary"
                fontSize="xs"
                style={{overflowWrap: 'anywhere', wordBreak: 'break-all'}}
              >
                {currentUrl}
              </Text>
              {credit && (
                <Text color="fg.secondary" fontSize="xs">
                  Photo by {credit} on Unsplash
                </Text>
              )}
            </Group>
          </Group>
        ) : (
          <Text color="fg.secondary" fontSize="sm">
            {property ? 'No image selected.' : 'Loading…'}
          </Text>
        )}

        <Group gap="8">
          <Button
            appearance={pickerOpen ? 'default' : 'primary'}
            disabled={readonly}
            onClick={() => setPickerOpen((open) => !open)}
          >
            {pickerOpen ? 'Cancel' : currentUrl ? 'Change image' : 'Choose image'}
          </Button>
          {currentUrl && !pickerOpen && (
            <Button disabled={readonly} onClick={() => void onRemove()}>
              Remove
            </Button>
          )}
        </Group>

        {saveError && (
          <Text color="fg.error" fontSize="xs">
            {saveError}
          </Text>
        )}

        {pickerOpen && (
          <Group flexDirection="column" gap="8">
            <Group gap="8">
              <SearchInput
                autoFocus
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  // No <form>: the sandboxed iframe blocks native form submits.
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

            <Text color={status.error ? 'fg.error' : 'fg.secondary'} fontSize="xs">
              {status.text}
            </Text>

            {loading && <Spinner size="sm" />}

            {result && result.results.length > 0 && (
              <Grid gap="8" gridTemplateColumns="3">
                {result.results.map((photo) => (
                  <Box
                    cursor="pointer"
                    key={photo.id}
                    onClick={() => void onPick(photo)}
                    overflow="hidden"
                    rounded="sm"
                    title={`Photo by ${photo.user.name}`}
                  >
                    <img
                      alt={photo.altDescription || photo.description || `Photo by ${photo.user.name}`}
                      src={photo.urls.thumb}
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
                  ‹
                </Button>
                <Text fontSize="sm">
                  {page} / {totalPages}
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
          </Group>
        )}
      </Group>
    </Box>
  );
}

register((context) => (
  <AxiomProvider>
    <UnsplashImagePicker context={context} />
  </AxiomProvider>
));
