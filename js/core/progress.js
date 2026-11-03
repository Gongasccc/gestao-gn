// Percentagem de progresso para tarefas demoradas (importar receitas, ler medicamentos, IA).
// Quando há progresso real (ex.: OCR), usa-se definir(); quando não há (pedidos à IA), a
// percentagem avança sozinha por fases, com base no tempo esperado, sem nunca passar o fim da fase.

/**
 * aoAtualizar(percentagem 0..100, texto) é chamado sempre que o valor ou o texto mudam.
 * fase(ate, ms, texto?) -> nova fase até "ate"% que demora cerca de "ms".
 * definir(p 0..1)       -> progresso real dentro da fase atual.
 * concluir()            -> 100%.
 */
export function criarProgresso(aoAtualizar) {
  let valor = 0;
  let de = 0;
  let ate = 0;
  let ms = 1;
  let inicio = 0;
  let texto = '';
  let timer = null;
  let ultimo = '';

  const emitir = () => {
    const pct = Math.min(100, Math.max(0, Math.floor(valor)));
    const chave = `${pct}|${texto}`;
    if (chave === ultimo) return;
    ultimo = chave;
    aoAtualizar(pct, texto);
  };

  const subir = (novo) => { if (novo > valor) valor = novo; emitir(); };

  const tick = () => {
    const t = (Date.now() - inicio) / ms;
    // Curva que abranda: ~90% da fase ao fim do tempo esperado, depois aproxima-se devagar.
    subir(de + (ate - de) * (1 - Math.exp(-2.3 * t)) * 0.98);
  };

  const api = {
    get valor() { return valor; },
    fase(novoAte, duracao = 3000, novoTexto) {
      de = valor;
      ate = Math.max(valor, Math.min(99, novoAte));
      ms = Math.max(1, duracao);
      inicio = Date.now();
      if (novoTexto != null) texto = novoTexto;
      clearInterval(timer);
      timer = setInterval(tick, 120);
      emitir();
      return api;
    },
    texto(novoTexto) { texto = novoTexto; emitir(); return api; },
    definir(p) { subir(de + (ate - de) * Math.min(1, Math.max(0, p))); return api; },
    concluir(novoTexto) {
      clearInterval(timer);
      if (novoTexto != null) texto = novoTexto;
      valor = 100;
      emitir();
      return api;
    },
    parar() { clearInterval(timer); return api; },
  };
  return api;
}
