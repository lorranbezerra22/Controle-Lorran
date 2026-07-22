import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: () => <div className="p-8 max-w-4xl mx-auto space-y-6">
    <h2 className="text-2xl font-bold">Verificação de Referências a Tabelas Antigas e Validação de Importação</h2>
    
    <div className="space-y-2">
      <h3 className="text-xl font-bold">Objetivo:</h3>
      <p className="text-muted-foreground">
        Identificar e corrigir referências a tabelas com nomes em inglês em automações externas e webhooks. Garantir a integridade da lógica de importação de arquivos, assegurando a consistência dos mapeamentos de colunas com o novo schema, mesmo após futuras modificações.
      </p>
    </div>

    <div className="space-y-4">
      <h3 className="text-xl font-bold">Funcionalidades:</h3>
      
      <div className="space-y-2">
        <p className="font-bold">1. Auditoria de Automações Externas e Webhooks:</p>
        <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
          <li>Verificar todas as automações externas e webhooks configurados.</li>
          <li>Comparar os nomes das tabelas referenciadas com a lista de nomes de tabelas antigas em inglês.</li>
          <li>Listar todas as referências encontradas a tabelas antigas.</li>
        </ul>
      </div>

      <div className="space-y-2">
        <p className="font-bold">2. Validação da Lógica de Importação de Arquivos:</p>
        <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
          <li>Analisar a lógica de importação de arquivos existente.</li>
          <li>Verificar se os mapeamentos de colunas definidos na lógica de importação são consistentes com o schema atual das tabelas.</li>
          <li>Simular cenários de futuras alterações no schema para validar a robustez dos mapeamentos.</li>
          <li>Identificar e reportar inconsistências ou potenciais falhas de mapeamento.</li>
        </ul>
      </div>
    </div>

    <div className="space-y-2">
      <h3 className="text-xl font-bold">Requisitos Técnicos:</h3>
      <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
        <li>Acesso à configuração de automações externas e webhooks.</li>
        <li>Acesso ao código-fonte ou configuração da lógica de importação de arquivos.</li>
        <li>Conhecimento do schema atual e histórico das tabelas.</li>
        <li>Ferramentas ou scripts para realizar a auditoria e validação.</li>
      </ul>
    </div>

    <div className="space-y-2">
      <h3 className="text-xl font-bold">Passos Necessários:</h3>
      <ol className="list-decimal pl-6 space-y-2 text-muted-foreground">
        <li><strong>Coletar Lista de Nomes de Tabelas Antigas:</strong> Obter a lista completa dos nomes de tabelas que foram alterados do inglês para outro idioma.</li>
        <li><strong>Auditar Automações e Webhooks:</strong>
          <ul className="list-disc pl-6 mt-1 space-y-1">
            <li>Executar scripts ou realizar verificações manuais para inspecionar as configurações de automações externas e webhooks.</li>
            <li>Comparar os nomes de tabelas utilizados nessas configurações com a lista de nomes antigos.</li>
            <li>Documentar todas as ocorrências encontradas.</li>
          </ul>
        </li>
        <li><strong>Revisar Lógica de Importação:</strong>
          <ul className="list-disc pl-6 mt-1 space-y-1">
            <li>Examinar o código ou a configuração da lógica de importação de arquivos.</li>
            <li>Verificar os mapeamentos de colunas definidos para cada arquivo a ser importado.</li>
            <li>Comparar esses mapeamentos com as colunas presentes no schema atual das tabelas de destino.</li>
          </ul>
        </li>
        <li><strong>Testar Cenários Futuros (Opcional, mas recomendado):</strong>
          <ul className="list-disc pl-6 mt-1 space-y-1">
            <li>Se possível, simular alterações futuras no schema (ex: adicionar, remover ou renomear colunas) e verificar se a lógica de importação ainda funciona corretamente com os mapeamentos existentes.</li>
          </ul>
        </li>
        <li><strong>Reportar e Corrigir:</strong>
          <ul className="list-disc pl-6 mt-1 space-y-1">
            <li>Gerar um relatório detalhado das referências a tabelas antigas encontradas.</li>
            <li>Gerar um relatório de inconsistências na lógica de importação.</li>
            <li>Planejar e executar as correções necessárias para atualizar as referências e garantir a consistência dos mapeamentos.</li>
          </ul>
        </li>
      </ol>
    </div>
  </div>,
  head: () => ({ meta: [{ title: "Verificação de Referências" }] }),
});
