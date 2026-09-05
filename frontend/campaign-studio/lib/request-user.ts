export type RequestUser = {
  id: string;
  email: string | null;
  displayName: string;
};

export function getRequestUser(request: Request): RequestUser | null {
  const id = request.headers.get("oai-authenticated-user-id");
  const email = request.headers.get("oai-authenticated-user-email");
  const encodedName = request.headers.get("oai-authenticated-user-full-name");
  const encoding = request.headers.get("oai-authenticated-user-full-name-encoding");
  let fullName: string | null = null;

  if (encodedName && encoding === "percent-encoded-utf-8") {
    try {
      fullName = decodeURIComponent(encodedName);
    } catch {
      fullName = null;
    }
  }

  if (!id && !email) {
    const session = request.headers.get("x-aurevanta-session")?.trim() ?? "";
    if (!/^[a-zA-Z0-9-]{20,80}$/.test(session)) return null;
    return { id: `guest:${session}`, email: null, displayName: "Invitado" };
  }
  return {
    id: id ?? email!,
    email,
    displayName: fullName ?? email ?? "Usuario",
  };
}

export function requireRequestUser(request: Request) {
  const user = getRequestUser(request);
  if (!user) {
    return {
      user: null,
      response: Response.json({ error: "Autenticación requerida" }, { status: 401 }),
    } as const;
  }
  return { user, response: null } as const;
}
