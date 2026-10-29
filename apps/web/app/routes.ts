import { type RouteConfig, index, route } from "@react-router/dev/routes"

export default [
  index("routes/home.tsx"),
  route("projects", "routes/projects.tsx"),
  route("p/:id", "routes/project.tsx"),
  route("login", "routes/login.tsx"),
  route("signup", "routes/signup.tsx"),
  route("reset-password", "routes/reset-password.tsx"),
  route("auth/callback", "routes/auth.callback.ts"),
  route("logout", "routes/logout.ts"),
  route("terms", "routes/terms.tsx"),
  route("privacy", "routes/privacy.tsx"),
  route("api/generate", "routes/api.generate.ts"),
  route("api/zernio/accounts", "routes/api.zernio.accounts.ts"),
  route("api/zernio/publish", "routes/api.zernio.publish.ts"),
  route("api/zernio/posts/:id", "routes/api.zernio.posts.$id.ts"),
] satisfies RouteConfig
