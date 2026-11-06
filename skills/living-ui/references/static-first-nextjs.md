# Static-first Next.js (App Router)

The page must prerender, with every word in the HTML, before any motion is added. Motion is a client-only layer that can fail without hurting anything. This file covers how to get there on Next.js 15 and what breaks along the way.

## Target

`next build` lists the page as `○` (static), and the response carries `x-nextjs-prerender: 1` (Vercel). Check with:

```bash
curl -sI https://your-site/ | grep -i -E "x-nextjs-prerender|x-vercel-cache"
```

## Steps

1. **Keep request-time work out of the root layout.** A root layout that calls `await auth()`, `cookies()` or `headers()` makes every route dynamic. Move session loading to the client: a `SessionProvider` that fetches on mount, and skip it entirely on the standalone marketing routes.
2. **Make the app routes dynamic on purpose.** Once the root is static, give each route group that needs request data a layout with `export const dynamic = "force-dynamic"`: auth pages, dashboards, editors.
3. **Wrap `useSearchParams` in `<Suspense>`.** A client component that reads search params inside a static tree fails the prerender with "useSearchParams() should be wrapped in a suspense boundary". Wrap the smallest component that reads them.
4. **Cache slow data at build time.** Use `unstable_cache` with a `revalidate`, plus `export const revalidate = 86400` on the page. Throw inside the cached function when the result is empty, so a failed read isn't cached for a day. Catch the error outside it and render without that section.
5. **Load fonts with `next/font`.** Never use `@import url(...)` in CSS, which blocks rendering. Give each font a CSS variable and apply the variables on the page root.
6. **Keep motion client-only.** The build engine, effects and video players are `"use client"` components that render nothing meaningful on the server: an empty canvas, a poster `<video>`, `null`. A small inline head script decides synchronously, before paint, whether the build will run, and sets `html[data-build="on"]`. Only then does CSS hide items. Without JS, the page is complete.
7. **Opt out of global app chrome** on the marketing routes when it adds client work: loaders, theme-editor providers, session fetches. The example uses an `isStandaloneRoute()` helper that the providers check.
8. **Generate the OG image at the edge.** Use `app/opengraph-image.tsx` with `export const runtime = "edge"`, and make it public in auth middleware (`"/opengraph-image"`). The edge runtime also avoids a Windows build bug in the Node path.

## Small server pieces that stay dynamic

A view counter or similar should be its own route handler (`app/api/public/views/route.ts` with `dynamic = "force-dynamic"`). Fetch it once on the client, POST once per session and GET otherwise, so the page itself stays static.

## Caching static media

Videos and posters in `public/` get default caching. Give them a long cache in `next.config.ts` and bust it with a `?v=` query when you re-render:

```ts
async headers() {
  return [{
    source: "/videos/:path*",
    headers: [{ key: "Cache-Control", value: "public, max-age=2592000, stale-while-revalidate=86400" }],
  }];
}
```

Keep large source folders out of deploy uploads with `.vercelignore` (for example `video/` for HyperFrames projects).
