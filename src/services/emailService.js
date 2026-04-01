import nodemailer from "nodemailer";
 
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});
 
export async function enviarEmailRastreio(email, nome, codigo, link) {
  await transporter.sendMail({
    from: '"Toffas Coffee" <contato@toffascoffee.com.br>',
    to: email,
    subject: "Seu pedido foi enviado 🚚",
    html: `
      <div style="font-family: Arial; padding:20px;">
        <h2>Olá ${nome}, seu pedido já está a caminho! 📦</h2>
 
        <p><strong>Código de rastreio:</strong> ${codigo}</p>
 
        <p>
          Clique abaixo para acompanhar a entrega:
        </p>
 
        <a href="${link}" 
           style="display:inline-block;
                  padding:12px 20px;
                  background:#000;
                  color:#fff;
                  text-decoration:none;
                  border-radius:6px;">
          Acompanhar Pedido
        </a>
 
        <p style="margin-top:20px;">
          Obrigado por comprar na Toffas ❤️
        </p>
      </div>
    `
  });
}
 
/**
 * Envia email de confirmação de compra com detalhes do pedido e código de rastreio.
 */
export async function enviarEmailConfirmacaoPedido(dados) {
  const {
    email,
    nome,
    pedidoId,
    itens,
    subtotal,
    freteValor,
    freteMetodo,
    total,
    codigoRastreio,
    linkRastreio
  } = dados;
 
  const itensHtml = itens
    .map(
      (item) => `
      <tr>
        <td style="padding:8px 12px; border-bottom:1px solid #eee;">
          ${item.nome_produto}
        </td>
        <td style="padding:8px 12px; border-bottom:1px solid #eee; text-align:center;">
          ${item.quantidade}
        </td>
        <td style="padding:8px 12px; border-bottom:1px solid #eee; text-align:right;">
          R$ ${Number(item.preco).toFixed(2).replace(".", ",")}
        </td>
      </tr>`
    )
    .join("");
 
  const html = `
    <div style="font-family: Arial, sans-serif; max-width:600px; margin:0 auto; background:#fff;">
      <div style="background:#000; padding:24px; text-align:center;">
        <h1 style="color:#fff; margin:0; font-size:22px;">Toffa's Coffee</h1>
      </div>
      <div style="padding:24px;">
        <h2 style="color:#333; margin-top:0;">Pedido confirmado!</h2>
        <p style="color:#555; font-size:15px;">
          Olá <strong>${nome}</strong>, sua compra foi confirmada com sucesso!
          Abaixo estão os detalhes do seu pedido.
        </p>
        <div style="background:#f7f7f7; padding:14px 18px; border-radius:8px; margin:16px 0;">
          <p style="margin:0; color:#333; font-size:14px;">
            <strong>Pedido #${pedidoId}</strong>
          </p>
        </div>
        <table style="width:100%; border-collapse:collapse; margin:16px 0;">
          <thead>
            <tr style="background:#f7f7f7;">
              <th style="padding:10px 12px; text-align:left; font-size:13px; color:#666;">Produto</th>
              <th style="padding:10px 12px; text-align:center; font-size:13px; color:#666;">Qtd</th>
              <th style="padding:10px 12px; text-align:right; font-size:13px; color:#666;">Preço</th>
            </tr>
          </thead>
          <tbody>
            ${itensHtml}
          </tbody>
        </table>
        <div style="border-top:2px solid #eee; padding-top:12px; margin-top:8px;">
          <table style="width:100%;">
            <tr>
              <td style="padding:4px 0; color:#555; font-size:14px;">Subtotal</td>
              <td style="padding:4px 0; text-align:right; color:#555; font-size:14px;">
                R$ ${Number(subtotal).toFixed(2).replace(".", ",")}
              </td>
            </tr>
            <tr>
              <td style="padding:4px 0; color:#555; font-size:14px;">
                Frete${freteMetodo ? ` (${freteMetodo})` : ""}
              </td>
              <td style="padding:4px 0; text-align:right; color:#555; font-size:14px;">
                ${freteValor > 0 ? `R$ ${Number(freteValor).toFixed(2).replace(".", ",")}` : "Grátis"}
              </td>
            </tr>
            <tr>
              <td style="padding:8px 0 0; font-size:16px; font-weight:bold; color:#000;">Total</td>
              <td style="padding:8px 0 0; text-align:right; font-size:16px; font-weight:bold; color:#000;">
                R$ ${Number(total).toFixed(2).replace(".", ",")}
              </td>
            </tr>
          </table>
        </div>
        ${codigoRastreio ? `
        <div style="background:#f0fdf4; border:1px solid #bbf7d0; padding:16px 18px; border-radius:8px; margin:20px 0;">
          <p style="margin:0 0 8px; color:#166534; font-size:14px; font-weight:bold;">Rastreio do envio</p>
          <p style="margin:0 0 12px; color:#333; font-size:14px;">
            <strong>Código:</strong> ${codigoRastreio}
          </p>
          <a href="${linkRastreio}"
             style="display:inline-block; padding:10px 20px; background:#000; color:#fff;
                    text-decoration:none; border-radius:6px; font-size:14px;">
            Acompanhar Pedido
          </a>
        </div>
        ` : ""}
        <p style="color:#888; font-size:13px; margin-top:24px;">
          Se tiver dúvidas, entre em contato conosco respondendo este email.
        </p>
      </div>
      <div style="background:#f7f7f7; padding:16px 24px; text-align:center;">
        <p style="margin:0; color:#999; font-size:12px;">
          Toffa's Coffee — Obrigado pela preferência!
        </p>
      </div>
    </div>
  `;
 
  await transporter.sendMail({
    from: '"Toffa\'s Coffee" <contato@toffascoffee.com.br>',
    to: email,
    subject: `Pedido #${pedidoId} confirmado — Toffa's Coffee`,
    html
  });
}