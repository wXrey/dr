/// <reference types="vite/client" />
declare module 'virtual:embedded-assets' {
  const embedded: null | { manifest: Record<string, any>; data: Record<string, string> };
  export default embedded;
}
