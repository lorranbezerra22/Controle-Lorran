export type Workspace = "familia" | "milhas";

export const WORKSPACES: { id: Workspace; label: string; icon: string; path: string }[] = [
  { id: "familia", label: "Gestão Família", icon: "💰", path: "/" },
  { id: "milhas", label: "CRM de Milhas", icon: "✈️", path: "/milhas" },
];

export function workspaceFromPath(pathname: string): Workspace {
  return pathname.startsWith("/milhas") ? "milhas" : "familia";
}
