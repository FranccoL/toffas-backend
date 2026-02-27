export async function criarPagamento(pedido) {
  // Mercado Pago ainda não configurado
  return {
    init_point: null,
    status: "PENDENTE",
    provider: "mercado_pago",
  };
}
