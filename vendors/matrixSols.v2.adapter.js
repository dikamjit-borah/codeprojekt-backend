const config = require("config");
const crypto = require("crypto");
const { V2_CREATE_ORDER, V2_CHECK_ORDER_STATUS } = require("../config/matrixSols.config");
const matrixSolsConfig = config.get("matrixSols");
const db = require("../providers/mongo");
const logger = require("../utils/logger");

class MatrixSolsV2Adapter {
    constructor() {
        this.apiKey = matrixSolsConfig.apiKey;
        this.clientId = matrixSolsConfig.clientId;
    }

    sortObjectKeys(obj) {
        if (obj === null || typeof obj !== "object") return obj;
        if (Array.isArray(obj)) return obj.map(item => this.sortObjectKeys(item));
        return Object.keys(obj).sort().reduce((sorted, key) => {
            sorted[key] = this.sortObjectKeys(obj[key]);
            return sorted;
        }, {});
    }

    /**
     * Generate HMAC-SHA256 signature per v2 spec:
     * message = canonicalJson + "." + timestamp + "." + nonce
     */
    generateSignature(payload) {
        const canonicalJson = JSON.stringify(this.sortObjectKeys(payload));
        const timestamp = String(Math.floor(Date.now() / 1000));
        const nonce = crypto.randomBytes(16).toString("hex");
        const message = `${canonicalJson}.${timestamp}.${nonce}`;
        const signature = crypto
            .createHmac("sha256", this.apiKey)
            .update(message)
            .digest("hex");
        return { signature, timestamp, nonce };
    }

    buildHeaders(payload) {
        const { signature, timestamp, nonce } = this.generateSignature(payload);
        return {
            "Content-Type": "application/json",
            "X-Client-Id": this.clientId,
            "X-Signature": signature,
            "X-Timestamp": timestamp,
            "X-Nonce": nonce,
        };
    }

    async pay({ amount, redirectUrl }) {
        const payload = {
            amount: String(amount),
            redirect_url: redirectUrl,
            customer_name: "pallab basumatary",
            customer_email: "codeprojekt2025@gmail.com",
            customer_mobile: "7002181285",
        };

        const headers = this.buildHeaders(payload);
        const url = `${matrixSolsConfig.baseURL}${V2_CREATE_ORDER.url}`;

        const response = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
        });

        const responseJson = await response.json();
        db.insertOne("vendor-calls", {
            url,
            body: payload,
            vendor: "matrix_sols_v2",
            type: "api",
            response: responseJson,
        }).catch(err => {
            logger.error("Failed to log Matrix Sols v2 api call", { error: err.message });
        });

        if (!response.ok) {
            throw new Error(responseJson?.error?.[0]?.message || `API Error: ${response.status}`);
        }

        return responseJson.data;
    }

    /**
     * Validate webhook signature using raw request body string (before JSON parsing).
     * v2 signs the raw body directly — not a re-serialized object.
     * @param {string} rawBody - Raw request body string
     * @param {string} webhookSignature - Value of X-Webhook-Signature header
     */
    validateCallback(rawBody, webhookSignature) {
        try {
            const expected = crypto
                .createHmac("sha256", this.apiKey)
                .update(rawBody)
                .digest("hex");
            return expected === webhookSignature;
        } catch (error) {
            logger.error(`v2 webhook validation error: ${error.message}`);
            return false;
        }
    }

    handleWebhookNotification(webhookData) {
        try {
            return {
                success: true,
                orderId: webhookData.order_id,
                amount: webhookData.amount,
                utrNumber: webhookData.utr_number,
                status: webhookData.status,
                dateTime: webhookData.date_time,
                comment: webhookData.comment,
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async checkOrderStatus(orderId) {
        try {
            const payload = { order_id: orderId };
            const headers = this.buildHeaders(payload);
            const url = `${matrixSolsConfig.baseURL}${V2_CHECK_ORDER_STATUS.url}`;

            const response = await fetch(url, {
                method: "POST",
                headers,
                body: JSON.stringify(payload),
            });

            const responseJson = await response.json();
            db.insertOne("vendor-calls", {
                url,
                body: payload,
                vendor: "matrix_sols_v2",
                type: "check_order_status",
                response: responseJson,
            }).catch(err => {
                logger.error("Failed to log Matrix Sols v2 check order status call", { error: err.message });
            });

            if (!response.ok) {
                throw new Error(responseJson?.error?.[0]?.message || `API Error: ${response.status}`);
            }

            return {
                success: true,
                orderId: responseJson.data?.order_id,
                amount: responseJson.data?.amount,
                utrNumber: responseJson.data?.utr_number,
                dateTime: responseJson.data?.date_time,
                status: responseJson.data?.status,
                message: responseJson.data?.message,
                rawResponse: responseJson,
            };
        } catch (error) {
            logger.error(`Matrix Sols v2 check order status error: ${error.message}`);
            return { success: false, error: error.message, orderId };
        }
    }
}

const matrixSolsV2Adapter = new MatrixSolsV2Adapter();
module.exports = matrixSolsV2Adapter;
