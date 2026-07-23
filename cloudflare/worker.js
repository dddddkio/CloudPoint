const ORIGIN = "https://cloudpoint-workspace.zeabur.app";

export default {
  async fetch(request) {
    const incomingUrl = new URL(request.url);
    const originUrl = new URL(
      `${incomingUrl.pathname}${incomingUrl.search}`,
      ORIGIN,
    );

    const headers = new Headers(request.headers);
    headers.set("X-Forwarded-Host", incomingUrl.host);
    headers.set("X-Forwarded-Proto", "https");

    const upstreamRequest = new Request(originUrl, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD"
        ? undefined
        : request.body,
      redirect: "manual",
    });

    const upstreamResponse = await fetch(upstreamRequest);
    const responseHeaders = new Headers(upstreamResponse.headers);
    const location = responseHeaders.get("Location");

    if (location?.startsWith(ORIGIN)) {
      responseHeaders.set(
        "Location",
        `${incomingUrl.origin}${location.slice(ORIGIN.length)}`,
      );
    }

    responseHeaders.set("X-Robots-Tag", "noindex, nofollow");

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  },
};
