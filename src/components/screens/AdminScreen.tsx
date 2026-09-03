"use client";

import { useCallback, useEffect, useState } from "react";
import { useKioskStore } from "@/state/kiosk-store";
import {
  fetchLeads,
  baixarCSV,
  zerarRankingDia,
  loginAdmin as autenticar,
  sessaoAdminAtiva,
  logoutAdmin,
  type LeadRow,
} from "@/lib/ranking";
import { tocar } from "@/lib/utils";
import { Icone } from "@/components/Icone";

export function AdminScreen() {
  const { irPara, adminOk, loginAdmin, somAtivo, rankingCache, refreshRanking } = useKioskStore();
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [entrando, setEntrando] = useState(false);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [zerarArmado, setZerarArmado] = useState(false);

  // A lista de leads só é buscada depois do login: sem o cookie de sessão o
  // servidor responde 401 e não há o que mostrar.
  const carregar = useCallback(async () => {
    setLeads(await fetchLeads());
    await refreshRanking();
  }, [refreshRanking]);

  // O cookie de sessão sobrevive a um F5 do kiosk — se ele ainda vale, entra
  // direto em vez de pedir a senha de novo. Os leads são carregados aqui e no
  // login bem-sucedido; não há um effect reagindo a `adminOk`, que só geraria
  // uma renderização em cascata.
  useEffect(() => {
    void (async () => {
      await refreshRanking();
      if (await sessaoAdminAtiva()) {
        loginAdmin(true);
        await carregar();
      }
    })();
  }, [loginAdmin, refreshRanking, carregar]);

  async function entrar() {
    setEntrando(true);
    setErro("");
    const ok = await autenticar(senha);
    setEntrando(false);
    setSenha("");
    if (ok) {
      loginAdmin(true);
      tocar("ok", somAtivo);
      await carregar();
    } else {
      setErro("Senha incorreta.");
      tocar("alarme", somAtivo);
    }
  }

  async function sair() {
    await logoutAdmin();
    loginAdmin(false);
    setLeads([]);
  }

  async function exportar() {
    if (!(await baixarCSV())) setErro("Não foi possível exportar — a sessão pode ter expirado.");
  }

  function zerarDia() {
    if (zerarArmado) {
      setZerarArmado(false);
      void zerarRankingDia().then(carregar);
      return;
    }
    setZerarArmado(true);
    setTimeout(() => setZerarArmado(false), 3000);
  }

  const ordenados = [...leads].sort((a, b) => (b.melhor_pontos || 0) - (a.melhor_pontos || 0));

  return (
    <div id="screen-admin" className="overlay">
      <div className="overlay-card">
        <h1>
          Painel <span>administrativo</span>
        </h1>
        <div className="sub" id="admin-resumo">
          {adminOk ? `${leads.length} leads captados · ` : ""}
          {rankingCache.length} jogadores hoje
        </div>
        {!adminOk ? (
          <div id="admin-login">
            <div className="campo">
              <label>Senha</label>
              <input
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void entrar();
                }}
              />
            </div>
            {erro ? <div className="sub" style={{ color: "var(--err)" }}>{erro}</div> : null}
            <button className="btn-primary" onClick={() => void entrar()} disabled={entrando}>
              {entrando ? "Entrando…" : "Entrar"}
            </button>
          </div>
        ) : (
          <div id="admin-area">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
              <button onClick={() => void exportar()}><Icone nome="exportar" tam={20} />Exportar CSV</button>
              <button className="btn-ghost" style={{ borderColor: "var(--err)", color: "var(--err)" }} onClick={zerarDia}>
                {zerarArmado ? "Confirmar?" : "Zerar ranking do dia"}
              </button>
              <button className="btn-ghost" onClick={() => irPara("editor")}>
                <Icone nome="planta" tam={20} />Editor de planta
              </button>
              <button className="btn-ghost" onClick={() => void sair()}>
                Sair
              </button>
            </div>
            {erro ? <div className="sub" style={{ color: "var(--err)" }}>{erro}</div> : null}
            <table id="admin-tab">
              <thead>
                <tr>
                  <th>Nome</th><th>Empresa</th><th>Cargo</th><th>WhatsApp</th><th>E-mail</th><th>Jogos</th><th>Melhor</th>
                </tr>
              </thead>
              <tbody>
                {ordenados.map((l) => (
                  <tr key={l.whats}>
                    <td>{l.nome}</td>
                    <td>{l.empresa}</td>
                    <td>{l.cargo || ""}</td>
                    <td>{l.whats}</td>
                    <td>{l.email || ""}</td>
                    <td>{l.jogos || 0}</td>
                    <td>{l.melhor_pontos || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <button className="btn-ghost" style={{ width: "100%", marginTop: 14 }} onClick={() => irPara("start")}>
          Fechar
        </button>
      </div>
    </div>
  );
}
