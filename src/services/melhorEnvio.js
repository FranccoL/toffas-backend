import axios from "axios";

export const melhorEnvioApi = axios.create({
  baseURL: process.env.MELHOR_ENVIO_BASE_URL,
  headers: {
    Authorization: `Bearer ${process.env.MELHOR_ENVIO_TOKEN}`,
    Accept: "application/json",
    "Content-Type": "application/json",
    "User-Agent": "ToffasCoffee (toffascoffee@gmail.com)",
  },
  timeout: 15000,
});
