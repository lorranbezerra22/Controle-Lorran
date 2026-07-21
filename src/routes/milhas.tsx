import { createFileRoute, Outlet } from "@tanstack/react-router";
import { ProtectedShell } from "@/components/ProtectedShell";
import { MilhasDataProvider } from "@/context/MilhasDataContext";

export const Route = createFileRoute("/milhas")({
  component: () => (
    <ProtectedShell>
      <MilhasDataProvider>
        <Outlet />
      </MilhasDataProvider>
    </ProtectedShell>
  ),
  head: () => ({ meta: [{ title: "CRM de Milhas" }] }),
});
