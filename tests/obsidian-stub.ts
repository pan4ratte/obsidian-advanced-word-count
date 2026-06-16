// Minimal runtime stand-in for the "obsidian" module under test.
// The real package ships only type declarations (Obsidian provides the runtime
// at load time), so anything imported from "obsidian" must be stubbed here.
// locales.ts is the only thing the pure metrics code pulls in, and it needs
// just `moment` — backed by the real moment package installed in node_modules.
import moment from "moment";

export { moment };
