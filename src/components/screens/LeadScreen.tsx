"use client";

import { useState } from "react";
import { useKioskStore } from "@/state/kiosk-store";
import { confirmarLead as salvarLead } from "@/lib/ranking";
import { maskWhats, tocar } from "@/lib/utils";
import { AutoloadLogo } from "@/components/AutoloadLogo";
import { BotaoVoltar } from "@/components/BotaoVoltar";

export function LeadScreen() {
  const { irPara, somAtivo, setCurrentLead } = useKioskStore();
  // Quem volta do montador para corrigir um campo reencontra o que digitou.
  // O lead já está no store desde o envio, então basta nascer lendo dele —
  // e `irPara("start")` o limpa, para o próximo visitante não herdar os dados
  // de quem jogou antes (ver kiosk-store).
  const inicial = useKioskStore.getState().currentLead;
  const [nome, setNome] = useState(inicial?.nome ?? "");
  const [empresa, setEmpresa] = useState(inicial?.empresa ?? "");
  const [whats, setWhats] = useState(inicial?.whats ?? "");
  const [cargo, setCargo] = useState(inicial?.cargo ?? "");
  const [email, setEmail] = useState(inicial?.email ?? "");
  // O aceite volta marcado junto: quem já consentiu não precisa consentir de
  // novo por ter voltado uma tela.
  const [lgpd, setLgpd] = useState(inicial != null);
  const [erros, setErros] = useState({ nome: false, empresa: false, whats: false, email: false, lgpd: false });

  function voltarParaStart() {
    irPara("start");
  }

  function confirmarLead() {
    const nomeTrim = nome.trim();
    const empresaTrim = empresa.trim();
    const whatsDigits = whats.replace(/\D/g, "");
    const cargoTrim = cargo.trim();
    const emailTrim = email.trim();

    // Frouxa de propósito: algo@algo.tld. Regex estrita rejeita endereço válido de
    // vez em quando, e aqui um falso negativo custa o lead INTEIRO.
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(emailTrim);
    const errosAtuais = { nome: nomeTrim.length < 3, empresa: empresaTrim.length < 2, whats: whatsDigits.length < 10, email: !emailOk, lgpd: !lgpd };
    setErros(errosAtuais);
    if (errosAtuais.nome || errosAtuais.empresa || errosAtuais.whats || errosAtuais.email || errosAtuais.lgpd) {
      tocar("alarme", somAtivo);
      return;
    }

    const lead = { nome: nomeTrim, empresa: empresaTrim, whats: whats.trim(), cargo: cargoTrim, email: emailTrim };
    setCurrentLead(lead);
    salvarLead(lead);
    tocar("ok", somAtivo);
    irPara("builder");
  }

  return (
    <div id="screen-lead" className="overlay">
      <BotaoVoltar para="start" />
      <div className="overlay-card">
        <span className="lead-logo">
          <AutoloadLogo />
        </span>
        <div className="eyebrow" onClick={voltarParaStart}>
          AutoMind · ExpoPostos
        </div>
        <h1>Desafio Autoload Cloud</h1>
        <div className="sub">Ecossistema de automação para terminais de granéis líquidos</div>
        <div className="destaque">
          Desafie o AutoLoad: rode o turno e veja sua operação manual contra a operação automatizada — lado a lado.
        </div>
        <div id="lead-campos">
          <div className="campo">
            <label>Seu nome</label>
            <input className={erros.nome ? "erro" : ""} maxLength={40} placeholder="Nome e sobrenome" value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="campo">
            <label>Empresa</label>
            <input className={erros.empresa ? "erro" : ""} maxLength={40} placeholder="Empresa / terminal" value={empresa} onChange={(e) => setEmpresa(e.target.value)} />
          </div>
          <div className="campo">
            <label>
              Cargo <em>(opcional)</em>
            </label>
            <input maxLength={40} placeholder="Ex.: Gerente de Operações" value={cargo} onChange={(e) => setCargo(e.target.value)} />
          </div>
          <div className="campo">
            <label>WhatsApp</label>
            <input
              className={erros.whats ? "erro" : ""}
              maxLength={16}
              inputMode="tel"
              placeholder="(11) 99999-9999"
              value={whats}
              onChange={(e) => setWhats(maskWhats(e.target.value))}
            />
          </div>
          {/* E-mail é o último campo de propósito: `#lead-campos .campo:last-child`
              ocupa as duas colunas da grade. autoCapitalize/autoCorrect off: o
              teclado do totem capitaliza a primeira letra e "corrige" o domínio —
              os dois estragam o endereço. */}
          <div className="campo">
            <label>E-mail</label>
            <input
              type="email"
              className={erros.email ? "erro" : ""}
              maxLength={60}
              inputMode="email"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="nome@empresa.com.br"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </div>
        <label className="lgpd" style={erros.lgpd ? { color: "var(--err)" } : undefined}>
          <input type="checkbox" checked={lgpd} onChange={(e) => setLgpd(e.target.checked)} />
          <span>
            Autorizo a AutoMind a entrar em contato por WhatsApp ou e-mail sobre os produtos AutoLoad e AutoChecker e
            a usar meus dados para a premiação do stand. Meu nome e empresa aparecem no ranking exibido na TV do
            stand (LGPD — seus dados não serão compartilhados com terceiros).
          </span>
        </label>
        <button className="btn-primary" onClick={confirmarLead}>
          Desafiar o AutoLoad <span className="seta-cta">→</span>
        </button>
      </div>
    </div>
  );
}
