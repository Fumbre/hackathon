// One API object for both browsers.
// Firefox exposes the promise-based `browser.*`; Chrome MV3's `chrome.*` also returns promises.
declare const browser: typeof chrome | undefined;
declare const __TARGET__: 'chrome' | 'firefox';

export const api: typeof chrome =
  typeof browser !== 'undefined' && browser ? browser : chrome;

export const TARGET: 'chrome' | 'firefox' =
  typeof __TARGET__ !== 'undefined' ? __TARGET__ : 'chrome';

export const IS_FIREFOX = TARGET === 'firefox';

/** Chrome supports buttons on notifications; Firefox does not (it throws). */
export const SUPPORTS_NOTIFICATION_BUTTONS = !IS_FIREFOX;
