import { ensureHubAuth, HUB_URL } from './hub-auth';

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
}

export class HubApiClient {
  private readonly baseUrl: string;
  private readonly token: string;

  private constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  static async create(forceLogin = false): Promise<HubApiClient> {
    const token = await ensureHubAuth(forceLogin);
    return new HubApiClient(HUB_URL, token);
  }

  async request(path: string, options: RequestOptions = {}): Promise<unknown> {
    const { method = 'GET', body } = options;
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`${method} ${path} failed (${response.status}): ${text}`);
    }

    return response.json();
  }
}
