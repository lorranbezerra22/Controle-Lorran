import { useSession } from "@/lib/auth";
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppShell } from "./AppShell";

export function ProtectedShell({ children }: { children: React.ReactNode }) {
  const { session, loading } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/login", search: { next: "" } });
  }, [loading, session, navigate]);

  if (loading || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground text-sm">Carregando…</div>
      </div>
    );
  }
  return <AppShell>{children}</AppShell>;
}
