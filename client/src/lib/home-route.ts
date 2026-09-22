/**
 * Home is Astra Cowork when it's on and the role may open it; the dashboard
 * otherwise. One function so sign-in, the landing page, the logo and the
 * sidebar all agree.
 */
export function homeRoute(opts: { astraEnabled: boolean; astraAllowed: boolean }): "/astra" | "/dashboard" {
  return opts.astraEnabled && opts.astraAllowed ? "/astra" : "/dashboard";
}
