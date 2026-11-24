import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { ProtectedShell } from "@/components/ProtectedShell";
import { MilhasDataProvider } from "@/context/MilhasDataContext";

export const Route = createFileRoute("/milhas")({
  component: MilhasLayout,
  head: () => ({ meta: [{ title: "CRM de Milhas" }] }),
});

function MilhasLayout() {
  const isPilot = useLocation({
    select: (location) =>
      location.pathname.replace(/\/$/, "") === "/milhas" && location.search.previa === "smiles",
  });

  return (
    <ProtectedShell>
      {isPilot ? (
        <Outlet />
      ) : (
        <MilhasDataProvider>
          <Outlet />
        </MilhasDataProvider>
      )}
    </ProtectedShell>
  );
}
