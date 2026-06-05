import type { SephraxiaApi } from './index';

declare global {
  interface Window {
    sephraxia: SephraxiaApi;
  }
}

export {};
