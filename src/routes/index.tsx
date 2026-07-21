import { createFileRoute } from "@tanstack/react-router";

// No head() here: the home route inherits title/description/og/twitter from
// __root.tsx, and ships no og:image so serve-time hosting can inject the
// project's social preview (explicit og:image or latest screenshot).
export const Route = createFileRoute("/")({
  component: Index,
});

// IMPORTANT: Replace this placeholder. See ./README.md for routing conventions.
function Index() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-8 bg-background text-foreground font-sans">
      <div className="max-w-2xl w-full space-y-6 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Recriação Gestão Família</h1>
        <p className="text-lg text-muted-foreground leading-relaxed">
          Para iniciar a recriação do projeto, por favor confirme respondendo 
          <span className="font-mono bg-muted px-2 py-1 rounded mx-1">"prosseguir mesmo assim"</span>.
        </p>
        
        <div className="grid gap-4 text-left border rounded-lg p-6 bg-card shadow-sm">
          <h2 className="font-semibold text-xl">Cronograma de Fases:</h2>
          <ul className="space-y-3">
            <li className="flex items-start">
              <span className="flex-shrink-0 w-8 font-bold text-primary">Fase 1</span>
              <span>Design system, integrações Supabase, componentes UI base e Auth/Login</span>
            </li>
            <li className="flex items-start">
              <span className="flex-shrink-0 w-8 font-bold text-primary">Fase 2</span>
              <span>Módulo Financeiro (lançamentos, cartões, dashboard)</span>
            </li>
            <li className="flex items-start">
              <span className="flex-shrink-0 w-8 font-bold text-primary">Fase 3</span>
              <span>Módulo Milhas (7 sub-rotas, mapa, comparações)</span>
            </li>
            <li className="flex items-start">
              <span className="flex-shrink-0 w-8 font-bold text-primary">Fase 4</span>
              <span>Conta, notificações e refinamento final</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
