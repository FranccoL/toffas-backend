import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
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
