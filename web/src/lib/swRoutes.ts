/** Page loads the service worker must leave to the network instead of answering with the cached
 *  app: the API (incl. /api/reauth) and Cloudflare Access' own pages. After the PIN, Access lands on
 *  /cdn-cgi/access/authorized to set its cookie; served the app shell instead, the cookie never got
 *  set and the phone looped between the app and Access. */
export const NETWORK_ONLY_PAGES = [/^\/api\//, /^\/cdn-cgi\//]
