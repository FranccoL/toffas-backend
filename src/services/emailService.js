function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function money(value) {
  return Number(value || 0).toFixed(2).replace(".", ",");
}

async function enviarEmail({ to, subject, html }) {
  if (!to) {
    throw new Error(`Recipient not configured for email: ${subject}`);
  }

  const apiKey = process.env.BREVO_API_KEY;
  const fromEmail = process.env.BREVO_FROM_EMAIL;
  const fromName = process.env.BREVO_FROM_NAME || "Toffa's Coffee";

  if (!apiKey || !fromEmail) {
    throw new Error("BREVO_API_KEY and BREVO_FROM_EMAIL must be configured.");
  }

  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    let response;
    try {
      response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sender: { name: fromName, email: fromEmail },
          to: [{ email: to }],
          subject,
          htmlContent: html,
        }),
        signal: AbortSignal.timeout(15000),
      });
    } catch (error) {
      if (tentativa === 3) {
        throw new Error(`Brevo API request failed: ${error.message}`);
      }
      await new Promise(resolve => setTimeout(resolve, tentativa * 1000));
      continue;
    }

    const responseBody = await response.text();
    let result;
    try {
      result = responseBody ? JSON.parse(responseBody) : {};
    } catch {
      result = { message: responseBody };
    }

    if (response.ok) {
      console.log(`Email accepted by Brevo (messageId: ${result.messageId || "unknown"}).`);
      return;
    }

    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || tentativa === 3) {
      throw new Error(`Brevo API request failed (${response.status}): ${result.message || responseBody}`);
    }
    await new Promise(resolve => setTimeout(resolve, tentativa * 1000));
  }
}

function renderItens(itens = []) {
  return itens.map(item => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtml(item.nome_produto || item.nome || "Produto")}${item.tamanho ? ` (${escapeHtml(item.tamanho)})` : ""}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">${Number(item.quantidade) || 1}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">R$ ${money(item.preco)}</td>
    </tr>`).join("");
}

function renderTabelaItens(itens) {
  return `
    <table style="width:100%;border-collapse:collapse;margin:20px 0;">
      <thead><tr style="background:#f8f8f8;"><th>Produto</th><th>Qtd</th><th>Preço unitário</th></tr></thead>
      <tbody>${renderItens(itens)}</tbody>
    </table>`;
}

function renderEndereco(cliente = {}) {
  const endereco = [
    [cliente.endereco, cliente.numero].filter(Boolean).join(", "),
    cliente.complemento,
    [cliente.bairro, [cliente.cidade, cliente.estado].filter(Boolean).join("/")].filter(Boolean).join(" - "),
    cliente.cep ? `CEP: ${cliente.cep}` : "",
  ].filter(Boolean);

  return endereco.map(escapeHtml).join("<br>") || "Não informado";
}

export async function enviarEmailConfirmacaoPedido(dados) {
  const { email, nome, pedidoId, itens, total, cliente } = dados;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #ddd;">
      <div style="background:#000;color:#fff;padding:20px;text-align:center;">
        <h1 style="margin:0;">Toffa's Coffee</h1>
      </div>
      <div style="padding:20px;">
        <h2>Olá ${escapeHtml(nome || "cliente")}, seu pagamento foi aprovado!</h2>
        <p>Seu pedido <strong>#${escapeHtml(pedidoId)}</strong> já está sendo preparado.</p>
        ${renderTabelaItens(itens)}
        <p style="font-size:18px;text-align:right;"><strong>Total pago: R$ ${money(total)}</strong></p>
        <h3>Endereço de entrega</h3>
        <p>${renderEndereco(cliente)}</p>
        <p>Enviaremos o código de rastreio por e-mail assim que a etiqueta de envio estiver pronta.</p>
      </div>
    </div>`;

  await enviarEmail({
    to: email,
    subject: `Pedido #${pedidoId} confirmado - Toffa's Coffee`,
    html,
  });
  console.log(`E-mail de confirmação enviado para o cliente do pedido #${pedidoId}.`);
}

export async function enviarEmailVendaAdmin(dados) {
  const { cliente = {}, pedidoId, itens, pagamento = {} } = dados;
  const destinatario = process.env.RECIPIENT_EMAIL;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:650px;margin:0 auto;">
      <div style="background:#000;color:#fff;padding:16px;text-align:center;">
        <h2 style="margin:0;">Nova venda - Pedido #${escapeHtml(pedidoId)}</h2>
      </div>
      <div style="padding:20px;border:1px solid #eee;">
        <h3>Dados do cliente</h3>
        <p>
          <strong>Nome:</strong> ${escapeHtml(cliente.nome || "Não informado")}<br>
          <strong>E-mail:</strong> ${escapeHtml(cliente.email || "Não informado")}<br>
          <strong>Telefone:</strong> ${escapeHtml(cliente.telefone || "Não informado")}<br>
          <strong>CPF:</strong> ${escapeHtml(cliente.cpf || "Não informado")}
        </p>
        <h3>Endereço de entrega</h3>
        <p>${renderEndereco(cliente)}</p>
        <h3>Pagamento</h3>
        <p>
          <strong>ID Mercado Pago:</strong> ${escapeHtml(pagamento.id || "Não informado")}<br>
          <strong>Método:</strong> ${escapeHtml(pagamento.payment_method_id || "Não informado")} (${escapeHtml(pagamento.payment_type_id || "Não informado")})<br>
          <strong>Parcelas:</strong> ${Number(pagamento.installments) || 1}x
        </p>
        <h3>Itens do pedido</h3>
        ${renderTabelaItens(itens)}
        <p>
          Subtotal: R$ ${money(dados.subtotal)}<br>
          Frete (${escapeHtml(dados.freteMetodo || "Não informado")}): R$ ${money(dados.freteValor)}<br>
          ${dados.cupom ? `Cupom aplicado: ${escapeHtml(dados.cupom)}<br>` : ""}
          <strong style="font-size:18px;">Total pago: R$ ${money(dados.total)}</strong>
        </p>
      </div>
    </div>`;

  await enviarEmail({
    to: destinatario,
    subject: `Venda realizada - Pedido #${pedidoId} - R$ ${money(dados.total)}`,
    html,
  });
  console.log(`E-mail de nova venda enviado para o destinatário configurado (pedido #${pedidoId}).`);
}

export async function enviarEmailRastreio(email, nome, codigo, link) {
  if (!codigo) {
    throw new Error("Tracking code is required to send the tracking email.");
  }

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
      <h2>Olá ${escapeHtml(nome || "cliente")}, seu pedido está a caminho!</h2>
      <p>Pedido enviado. Seu código de rastreio é:</p>
      <p style="font-size:20px;"><strong>${escapeHtml(codigo)}</strong></p>
      ${link ? `<p><a href="${escapeHtml(link)}">Acompanhar entrega</a></p>` : ""}
    </div>`;

  await enviarEmail({
    to: email,
    subject: "Seu pedido está a caminho - Toffa's Coffee",
    html,
  });
  console.log("E-mail de rastreio enviado ao cliente.");
}

export async function enviarEmailAluguel(dados) {
  const { nome, responsavel, empresa, telefone, email, mensagem, tipo } = dados;
  const nomeContato = nome || responsavel || "Não informado";
  const destinatario = process.env.RECIPIENT_EMAIL;

  const html = `
    <div style="font-family:Arial;padding:20px;border:1px solid #eee;">
      <h2 style="color:#d35400;">Novo pedido de orçamento: ${escapeHtml(tipo || "Aluguel de Máquina")}</h2>
      <p><strong>Nome:</strong> ${escapeHtml(nomeContato)}</p>
      <p><strong>Empresa:</strong> ${escapeHtml(empresa || "Não informada")}</p>
      <p><strong>Telefone:</strong> ${escapeHtml(telefone || "Não informado")}</p>
      <p><strong>E-mail do cliente:</strong> ${escapeHtml(email || "Nao informado")}</p>
      <p><strong>Mensagem:</strong><br>${escapeHtml(mensagem || "Sem mensagem")}</p>
    </div>`;

  await enviarEmail({
    to: destinatario,
    subject: `Solicitação de aluguel - ${nomeContato}`,
    html,
  });
  console.log("Notificacao de aluguel enviada.");
}
