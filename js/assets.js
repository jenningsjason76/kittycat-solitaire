// Resolves file paths. The normal app just uses the path. The single-file build embeds every
// image and sound in window.__ASSETS__ and looks the path up there.
export function asset(path) {
  return (window.__ASSETS__ && window.__ASSETS__[path]) || path;
}
