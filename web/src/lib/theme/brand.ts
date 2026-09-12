/**
 * The wordmark image, for the screens that show it as a picture.
 *
 * INSIDE the app the wordmark is not an image at all — it is a CSS mask
 * (`logo-mask.png`) filled with a theme token, so the rail's mark and the
 * faded footer watermark recolour themselves with the palette and need no
 * swap in either direction.
 *
 * This is only for the signed-out screens — login, forgot password, reset
 * password, welcome, locked, and the root splash — where a real PNG is
 * rendered and therefore carries its own background with it.
 *
 * It lives behind one constant so the scheme is one line to switch, rather
 * than six files to find. To go back to cream: "/brand/logo.png".
 */
export const BRAND_LOGO = "/brand/logo-navy.png";
