// The app's name, shared by the router (page titles) and tools that change the title themselves.
export const APP_NAME = 'CommonSec Share';

/** Set at build time by build.mjs from $BUILD_REPOSITORY: where this build's source lives. */
declare const __REPOSITORY__: string;
export const REPOSITORY = __REPOSITORY__;
