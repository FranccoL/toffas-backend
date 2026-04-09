import pool from "../config/db.js";
import axios from "axios";
import { enviarEmailRastreio, enviarEmailConfirmacaoPedido } from "../services/emailService.js";
import nodemailer from "nodemailer";

// ==========================================
// FUNÇÃO: CRIAR ENVIO NO MELHOR ENVIO
// ==========================================
async function criarEnvioMelhorEnvio(pedidoId) {
  try {
    const [pedido] = await pool.query(
      `SELECT p.*, c.nome, c.email, c.telefone, c.cep,
              c.endereco, c.numero, c.bairro, c.cidade, c.estado
       FROM pedidos p
       JOIN clientes c ON p.cliente_id = c.id
       WHERE p.id = ?`,
      [pedidoId]
    );

    if (!pedido.length) throw new Error("Pedido não encontrado");

    const pedidoData = pedido[0];

    if (pedidoData.melhor_envio_id) {
      console.log("Envio já existe.");
      return;
    }

    const [itens] = await pool.query(
      "SELECT * FROM pedido_itens WHERE pedido_id = ?",
      [pedidoId]
    );

    // 1. Adicionar ao carrinho do Melhor Envio
    const cart = await axios.post(
      "https://melhorenvio.com.br/api/v2/me/cart",
      {
        from: {
          name: "Toffa's Coffee",
          phone: "11915387618",
          email: "contato@toffascoffee.com.br",
          document: "59193787000106",
          address: "Rua Giacinto Tognato",
          number: "63",
          district: "Baeta Neves",
          city: "São Bernardo do Campo",
          state_abbr: "SP",
          postal_code: "09760370"
        },
        to: {
          name: pedidoData.nome,
          phone: pedidoData.telefone,
          email: pedidoData.email,
          address: pedidoData.endereco,
          number: pedidoData.numero,
          district: pedidoData.bairro,
          city: pedidoData.cidade,
          state_abbr: pedidoData.estado,
          postal_code: pedidoData.cep
        },
        products: itens.map(item => ({
          name: item.nome_produto,
          quantity: item.quantidade,
          unitary_value: item.preco,
          weight: 0.3,
          width: 12,
          height: 4,
          length: 16
        } ))
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.MELHOR_ENVIO_TOKEN}`
        }
      }
    );

    const envioId = cart.data.id;

    // 2. Checkout do envio
    await axios.post(
      `https://melhorenvio.com.br/api/v2/me/cart/${envioId}/checkout`,
      {},
      { headers: { Authorization: `Bearer ${process.env.MELHOR_ENVIO_TOKEN}` } }
     );

    // 3. Gerar etiqueta
    const etiqueta = await axios.post(
      `https://melhorenvio.com.br/api/v2/me/cart/${envioId}/generate`,
      {},
      { headers: { Authorization: `Bearer ${process.env.MELHOR_ENVIO_TOKEN}` } }
     );

    const codigoRastreio = etiqueta.data.tracking;
    const linkRastreio = `https://melhorenvio.com.br/rastreio/${codigoRastreio}`;

    // 4. Atualizar banco de dados
    await pool.query(
      `UPDATE pedidos
       SET status = ?, codigo_rastreio = ?, melhor_envio_id = ?
       WHERE id = ?`,
      ["ENVIADO", codigoRastreio, envioId, pedidoId]
     );

    // 5. Enviar e-mail de RASTREIO para o cliente
    try {
      await enviarEmailRastreio(pedidoData.email, pedidoData.nome, codigoRastreio, linkRastreio);
    } catch (err) {
      console.error("Erro ao enviar email de rastreio:", err);
    }

  } catch (error) {
    console.error("Erro Melhor Envio:", error.response?.data || error);
    throw error;
  }
}

// ==========================================
// WEBHOOK MERCADO PAGO
// ==========================================
export async function mercadoPagoWebhook(req, res) {
  try {
    const paymentId = req.body?.data?.id;
    const topic = req.body?.type;

    if (!paymentId || topic !== "payment")
      return res.status(200).json({ ignored: true });

    const pagamento = await buscarPagamentoMercadoPago(paymentId);
    const status = pagamento.status;
    const pedidoId = pagamento.external_reference;

    if (!pedidoId)
      return res.status(400).json({ error: "Pedido não encontrado" });

    const [pedidoAtual] = await pool.query(
      "SELECT status, cliente_id, cupom_codigo FROM pedidos WHERE id = ?",
      [pedidoId]
    );

    if (!pedidoAtual.length)
      return res.status(404).json({ error: "Pedido inexistente" });

    // Evita processar duas vezes o mesmo pedido
    if (pedidoAtual[0].status === "PAGO" || pedidoAtual[0].status === "ENVIADO")
      return res.status(200).json({ already_processed: true });

    if (status === "approved") {
      // 1. Atualiza status para PAGO
      await pool.query(
        `UPDATE pedidos SET status = ?, mercado_pago_payment_id = ? WHERE id = ?`,
        ["PAGO", paymentId, pedidoId]
      );

      // 2. Envia e-mail de CONFIRMAÇÃO DE PAGAMENTO ao cliente IMEDIATAMENTE
      try {
        const [pedidoCompleto] = await pool.query(
          `SELECT p.*, c.nome, c.email FROM pedidos p JOIN clientes c ON p.cliente_id = c.id WHERE p.id = ?`,
          [pedidoId]
        );

        if (pedidoCompleto.length) {
          const pData = pedidoCompleto[0];
          const [itens] = await pool.query("SELECT * FROM pedido_itens WHERE pedido_id = ?", [pedidoId]);

          await enviarEmailConfirmacaoPedido({
            email: pData.email,
            nome: pData.nome,
            pedidoId,
            itens,
            subtotal: Number(pData.subtotal),
            freteValor: Number(pData.frete_valor),
            freteMetodo: pData.frete_metodo,
            total: Number(pData.total)
          });
        }
      } catch (emailCliErr) {
        console.error("Erro ao enviar email de confirmação ao cliente:", emailCliErr);
      }

      // 3. Processa o Melhor Envio em background (gera rastreio e envia 2º email)
      criarEnvioMelhorEnvio(pedidoId).catch(err => {
        console.error("Erro ao processar Melhor Envio:", err);
      });

      // 4. Notifica o dono da loja (em background)
      (async () => {
        try {
          const emailTransporter = nodemailer.createTransport({
            service: "gmail",
            auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
          });
          const destinatario = process.env.RECIPIENT_EMAIL || process.env.EMAIL_USER;
          if (destinatario) {
            await emailTransporter.sendMail({
              from: `"Toffa's Coffee" <${process.env.EMAIL_USER}>`,
              to: destinatario,
              subject: `Pagamento confirmado - Pedido #${pedidoId}`,
              html: `<div style="font-family: Arial;"><h1>Pagamento Confirmado!</h1><p>Pedido #${pedidoId} foi pago com sucesso.</p></div>`
            });
          }
        } catch (emailErr) {
          console.error("Erro ao notificar dono:", emailErr);
        }
      })();
    }

    if (status === "cancelled") {
      await pool.query(
        `UPDATE pedidos SET status = ?, mercado_pago_payment_id = ? WHERE id = ?`,
        ["CANCELADO", paymentId, pedidoId]
      );
    }

    return res.status(200).json({ received: true });

  } catch (error) {
    console.error("Erro webhook:", error);
    return res.status(500).json({ error: "Erro interno" });
  }
}

// ==========================================
// FUNÇÃO: BUSCAR PAGAMENTO MERCADO PAGO
// ==========================================
async function buscarPagamentoMercadoPago(paymentId) {
  const response = await axios.get(
    `https://api.mercadopago.com/v1/payments/${paymentId}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`
      }
    }
   );
  return response.data;
}
