// The prebuilt xlsx bundle has no type definitions of its own. Reuse the types
// from the main 'xlsx' package — the API is identical.
declare module 'xlsx/dist/xlsx.full.min.js' {
  export * from 'xlsx';
}
