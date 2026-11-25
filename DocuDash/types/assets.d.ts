// Ambient module declarations for non-TS assets imported for side effects.
// TypeScript 6 checks side-effect imports, so the NativeWind stylesheet import
// in app/_layout.tsx needs a declaration.
declare module '*.css';
