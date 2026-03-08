import '@testing-library/jest-dom';

// ---------------------------------------------------------------------------
// Polyfill IndexedDB for vitest (jsdom does not include a real implementation).
// fake-indexeddb provides a complete in-memory IDB implementation.
// ---------------------------------------------------------------------------
import 'fake-indexeddb/auto';
