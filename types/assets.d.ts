// Ambient module declarations for non-TS assets (stylesheets & static images).
// TypeScript 6 checks side-effect and static asset imports strictly.
declare module '*.css';

declare module '*.png' {
  import type { ImageSourcePropType } from 'react-native';
  const value: ImageSourcePropType;
  export default value;
}
