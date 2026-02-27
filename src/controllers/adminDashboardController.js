import pool from "../config/db.js";

export async function dashboardAdmin(req, res) {
  try {
    const resumoQuery = `
      SELECT
        COUNT(*) AS total_pedidos,

        SUM(CASE WHEN status = 'AGUARDANDO_PAGAMENTO' THEN 1 ELSE 0 END) AS aguardando_pagamento,
        SUM(CASE WHEN status = 'PAGO' THEN 1 ELSE 0 END) AS pagos,
        SUM(CASE WHEN status = 'ENVIADO' THEN 1 ELSE 0 END) AS enviados,
        SUM(CASE WHEN status = 'ENTREGUE' THEN 1 ELSE 0 END) AS entregues,

        COALESCE(SUM(CASE WHEN status IN ('PAGO','ENVIADO','ENTREGUE')
            AND DATE(criado_em) = CURDATE()
          THEN total ELSE 0 END), 0) AS faturamento_hoje,

        COALESCE(SUM(CASE WHEN status IN ('PAGO','ENVIADO','ENTREGUE')
            AND MONTH(criado_em) = MONTH(CURDATE())
            AND YEAR(criado_em) = YEAR(CURDATE())
          THEN total ELSE 0 END), 0) AS faturamento_mes

      FROM pedidos
    `;

    const pedidosRecentesQuery = `
      SELECT
        p.id,
        c.nome AS cliente,
        p.total,
        p.status,
        p.criado_em
      FROM pedidos p
      JOIN clientes c ON c.id = p.cliente_id
      ORDER BY p.id DESC
      LIMIT 5
    `;

    // executa as queries do MySQL corretamente
    const [resumoRows] = await pool.query(resumoQuery);
    const [ultimosPedidos] = await pool.query(pedidosRecentesQuery);

    const resumo = resumoRows[0];

    res.json({
      resumo: {
        totalPedidos: Number(resumo.total_pedidos),
        aguardandoPagamento: Number(resumo.aguardando_pagamento),
        pagos: Number(resumo.pagos),
        enviados: Number(resumo.enviados),
        entregues: Number(resumo.entregues),
        faturamentoHoje: Number(resumo.faturamento_hoje),
        faturamentoMes: Number(resumo.faturamento_mes)
      },
      ultimosPedidos: ultimosPedidos
    });

  } catch (error) {
    console.error("Erro dashboard admin:", error);
    res.status(500).json({ error: "Erro ao carregar dashboard" });
  }
}
