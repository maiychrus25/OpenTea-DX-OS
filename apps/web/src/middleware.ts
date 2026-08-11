import { auth } from "./auth"
import { NextResponse } from "next/server"

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const { pathname } = req.nextUrl;

  // Các file public không cần chặn (api/auth, _next, public assets)
  if (
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  if (!isLoggedIn && pathname !== "/login") {
    if (pathname.startsWith("/htx") || pathname.startsWith("/lot")) {
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const role = (req.auth?.user as any)?.role;
  const lowerPath = pathname.toLowerCase();

  // Protect Manager routes
  if (lowerPath.startsWith("/manager") && role !== "manager") {
    return NextResponse.redirect(new URL("/unauthorized", req.url));
  }

  // Protect Officer routes
  if (lowerPath.startsWith("/officer") && role !== "officer") {
    return NextResponse.redirect(new URL("/unauthorized", req.url));
  }

  // Protect Farmer routes
  if (lowerPath.startsWith("/farmer") && role !== "farmer") {
    return NextResponse.redirect(new URL("/unauthorized", req.url));
  }

  // Redirect từ trang chủ dựa theo role
  if (pathname === "/" && isLoggedIn) {
    if (role === "manager") return NextResponse.redirect(new URL("/manager/dashboard", req.url));
    if (role === "officer") return NextResponse.redirect(new URL("/officer/dashboard", req.url));
    if (role === "farmer") return NextResponse.redirect(new URL("/farmer/dashboard", req.url));
  }

  return NextResponse.next();
})

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
}
