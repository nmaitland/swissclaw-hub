import fs from 'fs';
import path from 'path';
import { registerServiceWorker } from '../index';

jest.mock('../App', () => function MockApp() {
  return null;
});

jest.mock('react-dom/client', () => ({
  createRoot: jest.fn(() => ({
    render: jest.fn(),
  })),
}));

describe('client entry PWA wiring', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('registers the service worker on localhost after window load', async () => {
    const loadListeners = [];
    const register = jest.fn().mockResolvedValue(undefined);
    const addEventListener = jest.fn((event, handler) => {
      if (event === 'load') {
        loadListeners.push(handler);
      }
    });

    const didRegister = registerServiceWorker(
      {
        location: { hostname: 'localhost', protocol: 'http:' },
        addEventListener,
      },
      {
        serviceWorker: { register },
      }
    );

    expect(didRegister).toBe(true);
    expect(addEventListener).toHaveBeenCalledWith('load', expect.any(Function));

    await loadListeners[0]();

    expect(register).toHaveBeenCalledWith('/service-worker.js');
  });

  it('does not register the service worker on insecure non-local origins', () => {
    const addEventListener = jest.fn();

    const didRegister = registerServiceWorker(
      {
        location: { hostname: 'example.test', protocol: 'http:' },
        addEventListener,
      },
      {
        serviceWorker: { register: jest.fn() },
      }
    );

    expect(didRegister).toBe(false);
    expect(addEventListener).not.toHaveBeenCalled();
  });

  it('logs a registration error if the service worker registration fails', async () => {
    const loadListeners = [];
    const register = jest.fn().mockRejectedValue(new Error('boom'));
    const addEventListener = jest.fn((event, handler) => {
      if (event === 'load') {
        loadListeners.push(handler);
      }
    });
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    registerServiceWorker(
      {
        location: { hostname: 'localhost', protocol: 'http:' },
        addEventListener,
      },
      {
        serviceWorker: { register },
      }
    );

    await loadListeners[0]();
    await Promise.resolve();

    expect(consoleErrorSpy).toHaveBeenCalledWith('Service worker registration failed:', expect.any(Error));
  });

  it('declares manifest and apple touch icon links in the HTML entry', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');

    expect(html).toContain('rel="manifest" href="/manifest.webmanifest"');
    expect(html).toContain('rel="apple-touch-icon" href="/icons/icon-192.svg"');
    expect(html).toContain('name="apple-mobile-web-app-capable" content="yes"');
  });
});
