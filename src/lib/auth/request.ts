export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const supplied = new URL(origin);
    const target = new URL(request.url);
    // Next may use an internal hostname in request.url; Host retains the addressed app.
    const host = request.headers.get("host") || target.host;
    return (
      supplied.host === host &&
      supplied.protocol === target.protocol &&
      supplied.origin === origin
    );
  } catch {
    return false;
  }
}

export function safeNext(value: string | null) {
  const routes = [
    "/dashboard",
    "/onboarding",
    "/profile",
    "/learn",
    "/roadmap",
    "/diagnostic",
    "/projects",
    "/progress",
  ];
  return value && routes.includes(value) ? value : "/dashboard";
}
