import express from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

import clienteRoutes from "./src/routes/clienteRoutes.js";
import pedidoRoutes from "./src/routes/pedidoRoutes.js";
import adminRoutes from "./src/routes/adminRoutes.js";
import adminPedidosRoutes from "./src/routes/adminPedidosRoutes.js";
import freteRoutes from "./src/routes/freteRoutes.js";
import webhookRoutes from "./src/routes/webhookRoutes.js";
import produtoRoutes from "./src/routes/produtoRoutes.js";
import pagamentoRoutes from "./src/routes/pagamentoRoutes.js";
import cupomRoutes from "./src/routes/cupomRoutes.js";
import adminCupomRoutes from "./src/routes/adminCupomRoutes.js";
import emailRoutes from "./src/routes/emailRoutes.js";

const app = express();

app.use(cors());


app.use("/webhook", express.raw({ type: "*/*" }));

app.use(express.json());

app.use("/clientes", clienteRoutes);
app.use("/produtos", produtoRoutes);
app.use("/pedidos", pedidoRoutes);
app.use("/admin", adminRoutes);
app.use("/admin", adminPedidosRoutes);
app.use("/frete", freteRoutes);
app.use("/webhook", webhookRoutes);
app.use("/api/pagamento", pagamentoRoutes);
app.use("/cupom", cupomRoutes);
app.use("/admin", adminCupomRoutes);
app.use("/api", emailRoutes);

app.listen(process.env.APP_PORT, () => {
  console.log("🚀 Servidor rodando na porta " + process.env.APP_PORT);
});
