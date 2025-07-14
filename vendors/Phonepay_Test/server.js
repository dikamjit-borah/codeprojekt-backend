import express from 'express';
import {
  StandardCheckoutClient,
  StandardCheckoutPayRequest,
  Env
} from 'pg-sdk-node';
import { randomUUID } from 'crypto';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();
console.log('Environment Variables:', {
  clientId: process.env.PHONEPE_CLIENT_ID,
  clientVersion: process.env.PHONEPE_CLIENT_VERSION,
  clientSecret: process.env.PHONEPE_CLIENT_SECRET,
  redirectUrl: process.env.REDIRECT_URL
});
const client = StandardCheckoutClient.getInstance(
  process.env.PHONEPE_CLIENT_ID,
  process.env.PHONEPE_CLIENT_SECRET,
  Number(process.env.PHONEPE_CLIENT_VERSION),
  Env.PRODUCTION
);

const app = express();
app.use(cors()); // Enable CORS for all routes
app.use(express.json());



// Initiate Web Checkout
app.post('/api/pay', async (req, res) => {
  const reqPay = StandardCheckoutPayRequest.builder()
    .merchantOrderId(randomUUID())
    .amount(req.body.amount)
    .redirectUrl(process.env.REDIRECT_URL)
    .build();
  const resp = await client.pay(reqPay);
  console.log('Payment Response:', resp);
  res.json({ redirectUrl: resp.redirectUrl });
});


app.listen(3000, () => console.log('Server running on port 3000'));