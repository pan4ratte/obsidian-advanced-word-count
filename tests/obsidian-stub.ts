// Minimal runtime stand-in for the "obsidian" module under test.
// The real package ships only type declarations (Obsidian provides the runtime
// at load time), so anything imported from "obsidian" must be stubbed here.
// locales.ts is the only thing the pure metrics code pulls in, and it needs
// just `moment` — backed by the real moment package installed in node_modules.
import moment from "moment";

export { moment };

// requestUrl: the ExtensionManager's only network call. A test installs a handler
// that maps a URL to the JSON body the manager should see; an unhandled URL throws
// so a stray request can't pass silently.
type RequestHandler = (url: string) => unknown;
let requestHandler: RequestHandler | null = null;

export function __setRequestUrlHandler(handler: RequestHandler | null): void {
  requestHandler = handler;
}

export async function requestUrl(param: string | { url: string }): Promise<{ json: unknown }> {
  const url = typeof param === "string" ? param : param.url;
  if (!requestHandler) throw new Error(`unexpected request: ${url}`);
  return { json: requestHandler(url) };
}
