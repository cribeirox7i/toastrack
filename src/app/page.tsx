import AppShell from "@/components/AppShell";

/**
 * Single-page shell (static export). AppShell renders the auth screens when
 * logged out and the app when logged in — the real Home/list/detail screens
 * will grow inside AppShell's authenticated branch.
 */
export default function Home() {
  return <AppShell />;
}
