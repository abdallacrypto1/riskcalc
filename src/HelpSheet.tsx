import { useEffect } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
}

/** Explicador rápido de gerenciamento de risco — tom direto, ~1 min de leitura. */
export default function HelpSheet({ open, onClose }: Props) {
  // Trava o scroll do fundo enquanto a folha está aberta.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* fundo escuro */}
      <div className="rc-fade absolute inset-0 bg-black/60" onClick={onClose} />

      {/* folha */}
      <div className="rc-sheet relative flex max-h-[88vh] w-full max-w-md flex-col rounded-t-3xl border border-slate-800 bg-slate-950">
        {/* cabeçalho fixo */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 pb-3 pt-4">
          <div>
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-slate-700" />
            <h2 className="text-lg font-bold text-white">Como não quebrar a conta</h2>
            <p className="text-xs text-slate-500">Gerenciamento de risco em 1 minuto</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-700 text-slate-400 hover:text-white"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>

        {/* conteúdo rolável */}
        <div className="space-y-3 overflow-y-auto px-5 py-4">
          <Block emoji="💸" title="Quanto dá pra perder por trade" tone="rose">
            Regra de ouro: arrisque só <b className="text-rose-300">2–3% da banca</b> em
            cada trade. Banca de $1.000? No máximo $20–30 podem evaporar se der ruim.
            Assim você aguenta uma sequência de perdas sem zerar a conta.
          </Block>

          <Block emoji="📏" title="De onde sai o tamanho da posição" tone="sky">
            Pega o quanto você topa perder e divide pela{" "}
            <b className="text-sky-300">distância até o stop</b>. Risco de $20 e stop a $2
            de distância = 10 moedas. Se bater no stop, você perde exatamente os $20 que
            planejou — nem um centavo a mais. <i>É essa conta que o app faz por você.</i>
          </Block>

          <Block emoji="🛑" title="O stop é sagrado" tone="rose">
            O stop é onde você admite que errou e cai fora. Todo o cálculo depende dele.
            Arrastar o stop “só mais um pouquinho” é como tirar o cinto no meio da batida —
            é assim que conta pequena vira conta zerada.
          </Block>

          <Block emoji="⚡" title="Alavancagem: a armadilha" tone="amber">
            Alavancagem multiplica o tamanho <b>e o perigo</b>. Se exagerar, a corretora
            te <b className="text-amber-300">liquida antes do seu stop</b> — você perde
            tudo sem nem dar chance pro plano funcionar. Por isso o app trava a alavancagem
            máxima pela distância do seu stop.
          </Block>

          <Block emoji="🎯" title="Risco x retorno (o alvo)" tone="emerald">
            Antes de entrar, veja quanto pode ganhar vs. perder. Buscar pelo menos{" "}
            <b className="text-emerald-300">2x o que arrisca (2R)</b> faz você lucrar no
            longo prazo mesmo errando metade das vezes.
          </Block>

          <p className="px-1 pt-1 text-center text-sm text-slate-400">
            O resto é disciplina. O RiskCalc faz a conta — você só respeita o plano. 💪
          </p>

          <p className="px-1 text-center text-[11px] leading-snug text-slate-600">
            Conteúdo educativo, não é recomendação de investimento.
          </p>
        </div>
      </div>
    </div>
  );
}

function Block({
  emoji,
  title,
  tone,
  children,
}: {
  emoji: string;
  title: string;
  tone: "rose" | "sky" | "amber" | "emerald";
  children: React.ReactNode;
}) {
  const border =
    tone === "rose"
      ? "border-rose-500/20"
      : tone === "sky"
        ? "border-sky-500/20"
        : tone === "amber"
          ? "border-amber-500/20"
          : "border-emerald-500/20";
  return (
    <div className={`rounded-xl border ${border} bg-slate-900/50 p-4`}>
      <h3 className="mb-1 flex items-center gap-2 font-semibold text-white">
        <span className="text-lg">{emoji}</span>
        {title}
      </h3>
      <p className="text-sm leading-relaxed text-slate-300">{children}</p>
    </div>
  );
}
