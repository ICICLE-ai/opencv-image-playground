import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/_index.tsx"),
  route("api/process",         "routes/api.process.ts"),
  route("api/tapis/files",     "routes/api.tapis.files.ts"),
  route("api/tapis/download",  "routes/api.tapis.download.ts"),
  route("auth/start",          "routes/auth.start.ts"),
  route("auth/callback",       "routes/auth.callback.ts"),
  route("auth/logout",         "routes/auth.logout.ts"),
] satisfies RouteConfig;
