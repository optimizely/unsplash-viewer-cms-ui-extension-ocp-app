const API_BASE = 'https://api.unsplash.com';

export interface UnsplashPhoto {
  id: string;
  description: string | null;
  altDescription: string | null;
  width: number;
  height: number;
  color: string | null;
  urls: {
    thumb: string;
    small: string;
    regular: string;
    full: string;
  };
  links: {
    html: string;
    downloadLocation: string;
  };
  user: {
    name: string;
    username: string;
    profileUrl: string;
  };
}

export interface UnsplashSearchResult {
  total: number;
  totalPages: number;
  page: number;
  perPage: number;
  results: UnsplashPhoto[];
}

export class UnsplashError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: 'unauthorized' | 'rate_limited' | 'request_failed',
    message: string,
  ) {
    super(message);
    this.name = 'UnsplashError';
  }
}

interface RawPhoto {
  id: string;
  description: string | null;
  alt_description: string | null;
  width: number;
  height: number;
  color: string | null;
  urls: {thumb: string; small: string; regular: string; full: string};
  links: {html: string; download_location: string};
  user: {name: string; username: string; links: {html: string}};
}

function mapPhoto(raw: RawPhoto): UnsplashPhoto {
  return {
    id: raw.id,
    description: raw.description,
    altDescription: raw.alt_description,
    width: raw.width,
    height: raw.height,
    color: raw.color,
    urls: {
      thumb: raw.urls.thumb,
      small: raw.urls.small,
      regular: raw.urls.regular,
      full: raw.urls.full,
    },
    links: {
      html: raw.links.html,
      downloadLocation: raw.links.download_location,
    },
    user: {
      name: raw.user.name,
      username: raw.user.username,
      profileUrl: raw.user.links.html,
    },
  };
}

async function unsplashFetch(accessKey: string, url: string): Promise<Response> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Client-ID ${accessKey}`,
      'Accept-Version': 'v1',
    },
  });

  if (response.ok) {
    return response;
  }

  if (response.status === 401 || response.status === 403) {
    throw new UnsplashError(response.status, 'unauthorized', 'Invalid or unauthorized Unsplash Access Key.');
  }
  if (response.status === 429) {
    throw new UnsplashError(response.status, 'rate_limited', 'Unsplash API rate limit exceeded.');
  }
  throw new UnsplashError(response.status, 'request_failed', `Unsplash request failed: ${response.status}`);
}

export async function search(
  accessKey: string,
  query: string,
  page: number,
  perPage: number,
): Promise<UnsplashSearchResult> {
  const params = new URLSearchParams({
    query,
    page: String(page),
    per_page: String(perPage),
  });
  const response = await unsplashFetch(accessKey, `${API_BASE}/search/photos?${params.toString()}`);
  const data = (await response.json()) as {total: number; total_pages: number; results: RawPhoto[]};
  return {
    total: data.total,
    totalPages: data.total_pages,
    page,
    perPage,
    results: data.results.map(mapPhoto),
  };
}

export async function validateAccessKey(accessKey: string): Promise<void> {
  await unsplashFetch(accessKey, `${API_BASE}/photos/random?count=1`);
}

export async function trackDownload(accessKey: string, downloadLocation: string): Promise<void> {
  if (!downloadLocation.startsWith(`${API_BASE}/`)) {
    throw new UnsplashError(400, 'request_failed', 'Invalid downloadLocation.');
  }
  await unsplashFetch(accessKey, downloadLocation);
}
