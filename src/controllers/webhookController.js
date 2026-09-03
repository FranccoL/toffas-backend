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
      { from, to, products },
      {
        headers: {
          Authorization: `Bearer ${process.env.MELHOR_ENVIO_TOKEN}`,
          "Content-Type": "application/json",
          Accept: "application/json"
        }
      }
    );

    const fretes = Array.isArray(cotacao.data) ? cotacao.data : [];

    if (!fretes.length) {
      throw new Error("Nenhum serviço de frete retornado pelo Melhor Envio.");
    }

    // =====================================================
    // 9. ESCOLHER O SERVIÇO IGUAL AO QUE O CLIENTE PAGOU
    // =====================================================
    // Tenta achar o serviço com transportadora+nome batendo com o que
    // foi salvo no pedido (ex: "JeT - Standard")
    const metodoEscolhido = String(pedidoData.frete_metodo || "").toLowerCase();

    let servicoSelecionado = fretes.find(frete => {
      const label = `${frete.company?.name || ""} - ${frete.name || ""}`.toLowerCase();
      return metodoEscolhido.includes(label) || label.includes(metodoEscolhido);
    });

    // Fallback: se não achar por nome, usa o mais barato
    if (!servicoSelecionado) {
      console.log("⚠️ Não encontrei o serviço exato pelo nome, usando o mais barato como fallback.");
      servicoSelecionado = [...fretes].sort((a, b) => Number(a.price) - Number(b.price))[0];
    }

    if (!servicoSelecionado || servicoSelecionado.error) {
      throw new Error("Não foi possível selecionar um serviço de frete válido.");
    }

    console.log(`✅ Serviço selecionado: ${servicoSelecionado.company?.name} - ${servicoSelecionado.name} (ID ${servicoSelecionado.id})`);

    // =====================================================
    // 10. ADICIONAR AO CARRINHO
    // =====================================================
    console.log("🛒 Adicionando envio ao carrinho do Melhor Envio...");

    const carrinho = await axios.post(
      "https://melhorenvio.com.br/api/v2/me/cart",
      {
        service: servicoSelecionado.id,
        from,
        to,
        products,
        volumes: [
          { height: 4, width: 12, length: 16, weight: 0.3 }
        ],
        options: {
          non_commercial: true,
          insurance_value: Number(pedidoData.total) || 0,
          receipt: false,
          own_hand: false
        }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.MELHOR_ENVIO_TOKEN}`,
          "Content-Type": "application/json",
          Accept: "application/json"
        }
      }
    );

    const cartItemId = carrinho.data.id;
    console.log(`✅ Adicionado ao carrinho. ID: ${cartItemId}`);

    // =====================================================
    // 11. CHECKOUT (PAGAR O FRETE COM O SALDO DA CONTA)
    // =====================================================
    console.log("💳 Realizando checkout do frete...");

    await axios.post(
      "https://melhorenvio.com.br/api/v2/me/shipment/checkout",
      { orders: [cartItemId] },
      {
        headers: {
          Authorization: `Bearer ${process.env.MELHOR_ENVIO_TOKEN}`,
          "Content-Type": "application/json",
          Accept: "application/json"
        }
      }
    );

    console.log("✅ Checkout realizado com sucesso.");

    // =====================================================
    // 12. GERAR ETIQUETA
    // =====================================================
    console.log("🏷️ Gerando etiqueta...");

    const geracao = await axios.post(
      "https://melhorenvio.com.br/api/v2/me/shipment/generate",
      { orders: [cartItemId] },
      {
        headers: {
          Authorization: `Bearer ${process.env.MELHOR_ENVIO_TOKEN}`,
          "Content-Type": "application/json",
          Accept: "application/json"
        }
      }
    );

    console.log("✅ Etiqueta gerada:", JSON.stringify(geracao.data, null, 2));

    // =====================================================
    // 13. BUSCAR CÓDIGO DE RASTREIO
    // =====================================================
    console.log("🔎 Buscando código de rastreio...");

    const rastreioResp = await axios.get(
      `https://melhorenvio.com.br/api/v2/me/orders/${cartItemId}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.MELHOR_ENVIO_TOKEN}`,
          Accept: "application/json"
        }
      }
    );

    const codigoRastreio = rastreioResp.data?.tracking || null;
    const linkRastreio = codigoRastreio
      ? `https://www.melhorrastreio.com.br/rastreio/${codigoRastreio}`
      : null;

    console.log(`📦 Código de rastreio: ${codigoRastreio || "ainda não disponível"}`);

    // =====================================================
    // 14. SALVAR NO BANCO E ATUALIZAR STATUS
    // =====================================================
    await pool.query(
      `UPDATE pedidos 
       SET status = ?, melhor_envio_cart_id = ?, codigo_rastreio = ?
       WHERE id = ?`,
      ["ENVIADO", cartItemId, codigoRastreio, pedidoId]
    );

    // =====================================================
    // 15. ENVIAR E-MAIL DE RASTREIO AO CLIENTE
    // =====================================================
    if (codigoRastreio) {
      try {
        await enviarEmailRastreio(
          pedidoData.email,
          pedidoData.nome,
          codigoRastreio,
          linkRastreio
        );
      } catch (errEmail) {
        console.error("❌ Erro ao enviar e-mail de rastreio:", errEmail.message);
      }
    } else {
      console.log("⚠️ Etiqueta gerada mas rastreio ainda não disponível — considere reconsultar mais tarde.");
    }

    console.log("==========================================");
    console.log(`✅ ENVIO FINALIZADO PARA O PEDIDO #${pedidoId}`);
    console.log("==========================================");

    return {
      success: true,
      pedidoId,
      cartItemId,
      codigoRastreio
    };

  } catch (error) {
    console.error("");
    console.error("==========================================");
    console.error("❌ ERRO AO CONSULTAR MELHOR ENVIO");
    console.error("==========================================");
    console.error(error.response?.data || error.message || error);
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
            },
            family: 4,
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
