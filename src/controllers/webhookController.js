import pool from "../config/db.js";
import axios from "axios";
import { enviarEmailConfirmacaoPedido, enviarEmailRastreio } from "../services/emailService.js";
import nodemailer from "nodemailer";

// ==========================================
// FUNÇÃO: BUSCAR PAGAMENTO MERCADO PAGO
// ==========================================
async function buscarPagamentoMercadoPago(paymentId) {
  // Tenta buscar o pagamento. Se der 404, espera 2 segundos e tenta de novo (máximo 3 vezes)
  let tentativas = 0;
  while (tentativas < 3) {
    try {
      const response = await axios.get(
        `https://api.mercadopago.com/v1/payments/${paymentId}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`
          }
        }
       );
      return response.data;
    } catch (error) {
      if (error.response?.status === 404) {
        console.log(`⚠️ Pagamento ${paymentId} não encontrado (404). Tentativa ${tentativas + 1} de 3...`);
        tentativas++;
        await new Promise(resolve => setTimeout(resolve, 2000)); // Espera 2 segundos
      } else {
        throw error; // Se for outro erro (ex: 401), para na hora
      }
    }
  }
  throw new Error(`Pagamento ${paymentId} não encontrado após 3 tentativas.`);
}

// ==========================================
// FUNÇÃO: CRIAR ENVIO NO MELHOR ENVIO
// ==========================================
async function criarEnvioMelhorEnvio(pedidoId) {
  try {
    // =====================================================
    // 1. BUSCAR PEDIDO + CLIENTE
    // =====================================================
    const [pedido] = await pool.query(
      `SELECT 
          p.*,
          c.nome,
          c.email,
          c.telefone,
          c.cpf,
          c.cep,
          c.endereco,
          c.numero,
          c.bairro,
          c.cidade,
          c.estado
       FROM pedidos p
       JOIN clientes c ON p.cliente_id = c.id
       WHERE p.id = ?`,
      [pedidoId]
    );

    if (!pedido.length) {
      throw new Error("Pedido não encontrado.");
    }

    const pedidoData = pedido[0];

    console.log("");
    console.log("==========================================");
    console.log(`📦 CONSULTANDO MELHOR ENVIO - PEDIDO #${pedidoId}`);
    console.log("==========================================");

    console.log(`👤 Cliente: ${pedidoData.nome}`);
    console.log(`📧 E-mail: ${pedidoData.email}`);
    console.log(`📞 Telefone: ${pedidoData.telefone}`);
    console.log(`📍 CEP: ${pedidoData.cep}`);
    console.log(`🏠 Endereço: ${pedidoData.endereco}, ${pedidoData.numero}`);
    console.log(`🏘️ Bairro: ${pedidoData.bairro}`);
    console.log(`🏙️ Cidade: ${pedidoData.cidade} - ${pedidoData.estado}`);

    console.log("");
    console.log("🚚 Frete escolhido no pedido:");
    console.log(`   Transportadora/serviço: ${pedidoData.frete_metodo}`);
    console.log(`   Valor: R$ ${Number(pedidoData.frete_valor).toFixed(2)}`);
    console.log(`   Prazo: ${pedidoData.frete_prazo}`);

    // =====================================================
    // 2. VALIDAR DADOS DO CLIENTE
    // =====================================================
    if (!pedidoData.cep) {
      throw new Error("CEP do cliente não informado.");
    }

    if (!pedidoData.endereco || !pedidoData.numero) {
      throw new Error("Endereço do cliente incompleto.");
    }

    // =====================================================
    // 3. BUSCAR ITENS DO PEDIDO
    // =====================================================
    const [itens] = await pool.query(
      `SELECT 
          id,
          produto_id,
          nome_produto,
          tamanho,
          quantidade,
          preco
       FROM pedido_itens
       WHERE pedido_id = ?`,
      [pedidoId]
    );

    if (!itens.length) {
      throw new Error("Pedido não possui itens.");
    }

    console.log("");
    console.log("🛒 ITENS DO PEDIDO:");

    itens.forEach(item => {
      console.log(
        `   - ${item.nome_produto} | ${item.tamanho || "Sem tamanho"} | Qtd: ${item.quantidade} | R$ ${Number(item.preco).toFixed(2)}`
      );
    });

    // =====================================================
    // 4. DOCUMENTO DO REMETENTE
    // =====================================================
    const documentoRemetente = String(
      process.env.MELHOR_ENVIO_FROM_DOCUMENT || ""
    ).replace(/\D/g, "");

    if (!documentoRemetente) {
      throw new Error(
        "MELHOR_ENVIO_FROM_DOCUMENT não configurado nas variáveis do Render."
      );
    }

    // =====================================================
    // 5. MONTAR PRODUTOS
    // =====================================================
    const products = itens.map(item => ({
      name: `${item.nome_produto}${item.tamanho ? ` ${item.tamanho}` : ""}`,
      quantity: Number(item.quantidade),
      unitary_value: Number(item.preco),

      // Peso em KG
      weight: 0.3,

      // Dimensões em CM
      width: 12,
      height: 4,
      length: 16
    }));

    console.log("");
    console.log("📦 PRODUTOS ENVIADOS PARA COTAÇÃO:");

    console.log(
      JSON.stringify(products, null, 2)
    );

    // =====================================================
    // 6. DADOS DO REMETENTE
    // =====================================================
    const from = {
      name: "Toffa's Coffee",
      phone: "11915387618",
      email: "contato@toffascoffee.com.br",
      document: documentoRemetente,
      address: "Rua Giacinto Tognato",
      number: "63",
      district: "Baeta Neves",
      city: "São Bernardo do Campo",
      state_abbr: "SP",
      postal_code: "09760370"
    };

    // =====================================================
    // 7. DADOS DO DESTINATÁRIO
    // =====================================================
    const to = {
      name: pedidoData.nome,
      phone: pedidoData.telefone,
      email: pedidoData.email,
      address: pedidoData.endereco,
      number: pedidoData.numero,
      district: pedidoData.bairro,
      city: pedidoData.cidade,
      state_abbr: pedidoData.estado,
      postal_code: pedidoData.cep
    };

    // =====================================================
    // 8. CONSULTAR FRETES
    // =====================================================
    console.log("");
    console.log("==========================================");
    console.log("🚚 CONSULTANDO SERVIÇOS DISPONÍVEIS...");
    console.log("==========================================");

    const cotacao = await axios.post(
      "https://melhorenvio.com.br/api/v2/me/shipment/calculate",
      {
        from,
        to,
        products
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.MELHOR_ENVIO_TOKEN}`,
          "Content-Type": "application/json",
          Accept: "application/json"
        }
      }
    );

    // =====================================================
    // 9. VALIDAR RESPOSTA
    // =====================================================
    const fretes = Array.isArray(cotacao.data)
      ? cotacao.data
      : [];

    if (!fretes.length) {
      console.log("");
      console.log("❌ O MELHOR ENVIO NÃO RETORNOU NENHUM FRETE.");
      console.log("");
      console.log("Resposta completa:");
      console.log(
        JSON.stringify(cotacao.data, null, 2)
      );

      throw new Error(
        "Nenhum serviço de frete retornado pelo Melhor Envio."
      );
    }

    // =====================================================
    // 10. MOSTRAR TODOS OS SERVIÇOS
    // =====================================================
    console.log("");
    console.log("==========================================");
    console.log(`✅ ${fretes.length} SERVIÇO(S) ENCONTRADO(S)`);
    console.log("==========================================");

    fretes.forEach((frete, index) => {

      const transportadora = String(
        frete.company?.name || ""
      );

      const servico = String(
        frete.name || ""
      );

      console.log("");
      console.log(`🚚 FRETE ${index + 1}`);
      console.log("------------------------------------------");
      console.log(`ID DO SERVIÇO: ${frete.id}`);
      console.log(`TRANSPORTADORA: ${transportadora}`);
      console.log(`SERVIÇO: ${servico}`);
      console.log(
        `PREÇO: R$ ${Number(frete.price || 0).toFixed(2)}`
      );
      console.log(
        `PRAZO: ${frete.delivery_time || frete.delivery_range?.min || "Não informado"}`
      );

      if (frete.delivery_range) {
        console.log(
          `PRAZO MÍNIMO: ${frete.delivery_range.min}`
        );

        console.log(
          `PRAZO MÁXIMO: ${frete.delivery_range.max}`
        );
      }

      console.log("------------------------------------------");
    });

    // =====================================================
    // 11. PROCURAR LOGGI EXPRESS
    // =====================================================
    const loggiExpress = fretes.find(frete => {

      const transportadora = String(
        frete.company?.name || ""
      ).toLowerCase();

      const servico = String(
        frete.name || ""
      ).toLowerCase();

      return (
        transportadora.includes("loggi") &&
        (
          servico.includes("express") ||
          servico.includes("expresso")
        )
      );
    });

    console.log("");
    console.log("==========================================");
    console.log("🔎 RESULTADO DA BUSCA POR LOGGI EXPRESS");
    console.log("==========================================");

    if (loggiExpress) {

      console.log("✅ LOGGI EXPRESS ENCONTRADO!");

      console.log("");
      console.log("SERVICE ID:");
      console.log(loggiExpress.id);

      console.log("");
      console.log("TRANSPORTADORA:");
      console.log(loggiExpress.company?.name);

      console.log("");
      console.log("SERVIÇO:");
      console.log(loggiExpress.name);

      console.log("");
      console.log("PREÇO:");
      console.log(
        `R$ ${Number(loggiExpress.price || 0).toFixed(2)}`
      );

      console.log("");
      console.log("RESPOSTA COMPLETA DA LOGGI EXPRESS:");
      console.log(
        JSON.stringify(loggiExpress, null, 2)
      );

    } else {

      console.log("❌ LOGGI EXPRESS NÃO FOI ENCONTRADO.");

      console.log("");
      console.log("Os serviços retornados foram:");

      fretes.forEach(frete => {
        console.log(
          `- ID: ${frete.id} | ${frete.company?.name || "Sem transportadora"} | ${frete.name || "Sem nome"} | R$ ${Number(frete.price || 0).toFixed(2)}`
        );
      });
    }

    // =====================================================
    // 12. FINALIZAÇÃO DO TESTE
    // =====================================================
    console.log("");
    console.log("==========================================");
    console.log("🛑 TESTE DE COTAÇÃO FINALIZADO");
    console.log("==========================================");

    console.log(
      "⚠️ NENHUM CARRINHO FOI CRIADO."
    );

    console.log(
      "⚠️ NENHUM CHECKOUT FOI REALIZADO."
    );

    console.log(
      "⚠️ NENHUMA ETIQUETA FOI GERADA."
    );

    console.log(
      "⚠️ NENHUM PEDIDO FOI ALTERADO PARA ENVIADO."
    );

    console.log("==========================================");
    console.log("");

    return {
      success: true,
      pedidoId,
      quantidadeFretes: fretes.length,
      loggiExpress: loggiExpress
        ? {
            id: loggiExpress.id,
            company: loggiExpress.company?.name,
            name: loggiExpress.name,
            price: loggiExpress.price
          }
        : null
    };

  } catch (error) {

    console.error("");
    console.error("==========================================");
    console.error("❌ ERRO AO CONSULTAR MELHOR ENVIO");
    console.error("==========================================");

    console.error(
      error.response?.data ||
      error.message ||
      error
    );

    console.error("==========================================");
    console.error("");

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

    console.log(`🔔 Webhook recebido: Topic=${topic}, ID=${paymentId}`);

    if (!paymentId || topic !== "payment")
      return res.status(200).json({ received: true, ignored: true });

    const pagamento = await buscarPagamentoMercadoPago(paymentId);
    const status = pagamento.status;
    const pedidoId = pagamento.external_reference;

    console.log(`💰 Pagamento ${paymentId} status: ${status} para Pedido #${pedidoId}`);

    if (!pedidoId)
      return res.status(400).json({ error: "Pedido não encontrado na referência externa" });

    const [pedidoAtual] = await pool.query(
      "SELECT status, cliente_id, cupom_codigo FROM pedidos WHERE id = ?",
      [pedidoId]
    );

    if (!pedidoAtual.length)
      return res.status(404).json({ error: "Pedido inexistente no banco de dados" });

    // Evita processar duas vezes o mesmo pedido
    if (pedidoAtual[0].status === "PAGO" || pedidoAtual[0].status === "ENVIADO") {
      console.log(`⚠️ Pedido #${pedidoId} já está marcado como PAGO/ENVIADO.`);
      return res.status(200).json({ already_processed: true });
    }

    if (status === "approved") {
      console.log(`✅ Pagamento aprovado para Pedido #${pedidoId}. Iniciando processos...`);
      
      // 1. Atualiza status para PAGO
      await pool.query(
        `UPDATE pedidos SET status = ?, mercado_pago_payment_id = ? WHERE id = ?`,
        ["PAGO", paymentId, pedidoId]
      );

      // 2. Busca dados completos para os e-mails
      const [pedidoCompleto] = await pool.query(
        `SELECT p.*, c.nome, c.email FROM pedidos p JOIN clientes c ON p.cliente_id = c.id WHERE p.id = ?`,
        [pedidoId]
      );

      if (pedidoCompleto.length) {
        const pData = pedidoCompleto[0];
        const [itens] = await pool.query("SELECT * FROM pedido_itens WHERE pedido_id = ?", [pedidoId]);

        // 3. Envia e-mail de CONFIRMAÇÃO DE PAGAMENTO ao cliente IMEDIATAMENTE
        try {
          console.log(`📧 Tentando enviar e-mail de confirmação para o cliente: ${pData.email}`);
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
        } catch (emailCliErr) {
          console.error("❌ Erro ao enviar email de confirmação ao cliente:", emailCliErr.message);
        }

        // 4. Envia e-mail de NOTIFICAÇÃO DE VENDA para o DONO (Você)
        try {
          const emailTransporter = nodemailer.createTransport({
            service: "gmail",
            auth: { 
              user: process.env.SMTP_USER || process.env.EMAIL_USER || "toffascoffee@gmail.com", 
              pass: process.env.SMTP_PASS || process.env.EMAIL_PASS 
            }
          });

          // GARANTIA: Se a variável falhar, envia para o seu e-mail principal
          const destinatario = process.env.RECIPIENT_EMAIL || process.env.SMTP_USER || process.env.EMAIL_USER || "toffascoffee@gmail.com";
          
          await emailTransporter.sendMail({
            from: `"Toffa's Coffee" <${process.env.SMTP_USER || process.env.EMAIL_USER || 'toffascoffee@gmail.com'}>`,
            to: destinatario,
            subject: `VENDA REALIZADA - Pedido #${pedidoId}`,
            html: `<h1>Venda Confirmada!</h1><p>O pedido #${pedidoId} de R$ ${Number(pData.total).toFixed(2)} foi pago com sucesso.</p>`
          });
          console.log(`📧 Notificação de venda enviada para o dono: ${destinatario}`);
        } catch (errDono) {
          console.error("❌ Erro ao notificar dono:", errDono.message);
        }
      }

      // 5. Processa o Melhor Envio em background (gera rastreio e envia 2º email)
      criarEnvioMelhorEnvio(pedidoId).catch(err => {
        console.error("❌ Erro ao processar Melhor Envio:", err.message);
      });
    } else if (status === "cancelled" || status === "rejected") {
      console.log(`❌ Pagamento ${paymentId} cancelado/rejeitado.`);
      await pool.query(
        `UPDATE pedidos SET status = ?, mercado_pago_payment_id = ? WHERE id = ?`,
        ["CANCELADO", paymentId, pedidoId]
      );
    }

    return res.status(200).json({ received: true });

  } catch (error) {
    console.error("❌ Erro crítico no Webhook:", error.message);
    return res.status(500).json({ error: "Erro interno no processamento do webhook" });
  }
}
