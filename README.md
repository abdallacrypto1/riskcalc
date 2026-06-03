# RiskCalc

App de gerenciamento de risco para traders. Você informa a banca, o quanto quer
arriscar por trade e onde fica o stop — o app calcula automaticamente o
**tamanho da posição** para que a perda máxima bata exatamente no risco definido.

Funciona com **ordem única** ou **ordens escaladas** (várias entradas com preço
médio ponderado). Foco inicial em **cripto** (notional + alavancagem/margem).

## A conta

```
Risco em $        = Banca × % de risco
Tamanho da posição = Risco$ / distância(preço médio → stop)
```

Mesmo escalonando as entradas, o tamanho total continua sendo
`Risco$ / distância do preço médio até o stop`. O que muda é só como esse total
é distribuído entre as ordens.

## Rodar

```bash
npm install
npm run dev      # ambiente de desenvolvimento
npm test         # testes da lógica de cálculo
npm run build    # build de produção (pasta dist/)
```

## Estrutura

- `src/lib/risk.ts` — lógica pura de dimensionamento (sem React, testável).
- `src/lib/risk.test.ts` — testes da matemática.
- `src/App.tsx` — interface (mobile-first).
