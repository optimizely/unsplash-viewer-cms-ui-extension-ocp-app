import * as App from '@zaiusinc/app-sdk';
import {logger, storage} from '@zaiusinc/app-sdk';
import {search, trackDownload, UnsplashError, UnsplashSearchResult} from '../lib/unsplash';

const DEFAULT_PER_PAGE = 12;

const UNSPLASH_STATUS: Record<UnsplashError['code'], number> = {
  unauthorized: 502,
  rate_limited: 429,
  request_failed: 502,
};

interface SearchParams {
  query?: unknown;
  page?: unknown;
  perPage?: unknown;
}

interface TrackDownloadParams {
  downloadLocation?: unknown;
}

interface RequestBody {
  action?: unknown;
  params?: unknown;
}

type Envelope<T> =
  | {ok: true; result: T}
  | {ok: false; error: string; message?: string};

function ok<T>(result: T): Envelope<T> {
  return {ok: true, result};
}

function fail(error: string, message?: string): Envelope<never> {
  return message ? {ok: false, error, message} : {ok: false, error};
}

async function resolveAccessKey(): Promise<string | null> {
  const credentials = await storage.settings.get<{accessKey?: string}>('credentials');
  const fromSettings = credentials.accessKey?.trim();
  if (fromSettings) return fromSettings;
  const fromEnv = process.env.APP_ENV_UNSPLASH_ACCESS_KEY?.trim();
  return fromEnv || null;
}

export class CmsUiExtension extends App.Function {
  public async perform(): Promise<App.Response> {
    const body = (this.request.bodyJSON ?? {}) as RequestBody;
    const action = typeof body.action === 'string' ? body.action : '';
    const params = (body.params ?? {}) as Record<string, unknown>;

    const accessKey = await resolveAccessKey();
    if (!accessKey) {
      return new App.Response(503, fail('missing_access_key'));
    }

    try {
      if (action === 'search') {
        return await this.handleSearch(accessKey, params as SearchParams);
      }
      if (action === 'trackDownload') {
        return await this.handleTrackDownload(accessKey, params as TrackDownloadParams);
      }
      return new App.Response(400, fail('unknown_action', action));
    } catch (error) {
      if (error instanceof UnsplashError) {
        logger.warn('Unsplash error', error.code, error.message);
        return new App.Response(UNSPLASH_STATUS[error.code], fail(error.code, error.message));
      }
      logger.error('CmsUiExtension failure', error);
      return new App.Response(500, fail('internal_error'));
    }
  }

  private async handleSearch(accessKey: string, params: SearchParams): Promise<App.Response> {
    const query = typeof params.query === 'string' ? params.query.trim() : '';
    if (!query) {
      return new App.Response(400, fail('missing_query'));
    }
    const page = Math.max(1, Number(params.page) || 1);
    const perPage = Math.min(30, Math.max(1, Number(params.perPage) || DEFAULT_PER_PAGE));
    const result: UnsplashSearchResult = await search(accessKey, query, page, perPage);
    return new App.Response(200, ok(result));
  }

  private async handleTrackDownload(
    accessKey: string,
    params: TrackDownloadParams,
  ): Promise<App.Response> {
    const downloadLocation = typeof params.downloadLocation === 'string' ? params.downloadLocation : '';
    if (!downloadLocation) {
      return new App.Response(400, fail('missing_download_location'));
    }
    await trackDownload(accessKey, downloadLocation);
    return new App.Response(200, ok({tracked: true}));
  }
}
