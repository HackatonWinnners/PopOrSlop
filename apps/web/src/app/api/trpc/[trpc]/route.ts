import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "~/server/trpc/root";
import { createContext } from "~/server/trpc/trpc";
import { SESSION_COOKIE } from "~/server/session-cookie";

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => {
      const cookies = Object.fromEntries(
        (req.headers.get("cookie") ?? "")
          .split(";")
          .map((c) => c.trim().split("=", 2) as [string, string])
          .filter(([k]) => k),
      );
      const proto = req.headers.get("x-forwarded-proto") ?? "http";
      const host = req.headers.get("host") ?? "localhost:3000";
      return createContext({ sessionToken: cookies[SESSION_COOKIE], origin: `${proto}://${host}` });
    },
  });

export { handler as GET, handler as POST };
