import "server-only";
import { createClient } from "@supabase/supabase-js";

// Cliente do Supabase que só existe no servidor. O "server-only" acima faz o
// build FALHAR se algum componente de cliente importar este arquivo por
// engano — é a rede de proteção que impede a service role key de voltar a
// vazar pro bundle do browser.
//
// Usa a service role key: as escritas (lead, ranking) e as leituras do painel
// admin passam a acontecer com privilégio de servidor, atrás dos handlers em
// src/app/api/**, que validam a entrada antes de tocar no banco.

function env(nome: string): string {
  const v = process.env[nome];
  if (!v) {
    throw new Error(
      `Variável de ambiente ${nome} não definida. Copie .env.example para .env.local e preencha antes de subir o servidor.`,
    );
  }
  return v;
}

// A criação fica numa função à parte para o tipo do cliente ser inferido da
// chamada real. `ReturnType<typeof createClient>` resolveria os genéricos do
// schema para `never` e todo insert daria erro de tipo.
function criar() {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Instanciado sob demanda, e não no import: assim um .env.local incompleto
// falha na primeira requisição a /api/**, com a mensagem de env() dizendo o
// que falta, em vez de derrubar o build inteiro.
let cliente: ReturnType<typeof criar> | null = null;

export function sbServer() {
  if (!cliente) cliente = criar();
  return cliente;
}
