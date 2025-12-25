const config = require("config");
const crypto = require("crypto");
const { CREATE_ORDER } = require("../config/matrixSols.config");
const matrixSolsConfig = config.get("matrixSols");
const db = require("../providers/mongo");

class MatrixSolsAdapter {
    constructor() {
        this.apiKey = matrixSolsConfig.apiKey;
        this.clientId = matrixSolsConfig.clientId;
    }

    /**
     * Generate HMAC-SHA256 signature for request authentication
     * @param {Object} payload - Request payload object
     * @returns {Promise<string>} - Hex encoded signature
     */
    async generateSignature(payload) {
        try {
            const serializedBody = JSON.stringify(payload);
            const signatureContract = `${this.apiKey};${serializedBody}`;

            const signature = crypto
                .createHmac("sha256", this.apiKey)
                .update(signatureContract)
                .digest("hex");

            return signature;
        } catch (error) {
            throw new Error(`Signature generation failed: ${error.message}`);
        }
    }

    /**
     * Create a new payment order
     * @param {Object} params - Payment parameters
     * @param {string} params.amount - Transaction amount (1.00 - 100000.00)
     * @param {string} params.redirectUrl - Redirect URL after payment
     * @param {string} params.customerName - Customer name (3-50 characters)
     * @param {string} params.customerEmail - Customer email address
     * @param {string} params.customerMobile - Customer mobile (10 digits)
     * @returns {Promise<Object>} - Order creation response
     */
    async pay({
        amount,
        redirectUrl,
    }) {
        const payload = {
            amount: String(amount),
            redirect_url: redirectUrl,
            customer_name: 'pallab basumatary',
            customer_email: 'codeprojekt2025@gmail.com',
            customer_mobile: "7002181285",
        };

        const signature = await this.generateSignature(payload);

        const headers = {
            "Content-Type": "application/json",
            "X-Client-Id": this.clientId,
            "X-Signature": signature,
        };
        const url = `${matrixSolsConfig.baseURL}/${CREATE_ORDER.url}`
        const response = await fetch(url, {
            method: "POST",
            headers: headers,
            body: JSON.stringify(payload),
        });

        const responseJson = await response.json();
        /* db.insertOne("vendor-calls", { url, body: payload, vendor: 'matrix_sols', type: 'api', response: responseJson }).catch((err) => {
            logger.error("Failed to log Matrix Sols api call", { error: err.message });
        });
        */
        if (!response.ok) {
            throw new Error(responseJson.message || `API Error: ${response.status}`);
        }

        return responseJson.data
    }

    /**
     * Validate webhook notification from Matrix Sols
     * @param {Object} webhookPayload - Webhook payload from Matrix Sols
     * @param {string} signature - X-Signature header from webhook request
     * @returns {Promise<boolean>} - Whether signature is valid
     */
    async validateCallback(webhookPayload, signature) {
        try {
            const expectedSignature = await this.generateSignature(webhookPayload);
            return signature === expectedSignature;
        } catch (error) {
            console.error(`Webhook validation error: ${error.message}`);
            return false;
        }
    }

    /**
     * Process webhook notification
     * @param {Object} webhookData - Webhook payload from Matrix Sols
     * @returns {Promise<Object>} - Processed webhook data
     */
    async handleWebhookNotification(webhookData) {
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
            return {
                success: false,
                error: error.message,
            };
        }
    }

    /**
     * Check the status of a payment order
     * @param {string} orderId - Order ID to check status for
     * @returns {Promise<Object>} - Order status response
     */
    async getOrderStatus(orderId) {
        try {
            const payload = {
                order_id: orderId,
            };

            const signature = await this.generateSignature(payload);

            const headers = {
                "Content-Type": "application/json",
                "X-Client-Id": this.clientId,
                "X-Signature": signature,
            };

            const response = await fetch(this.checkOrderStatusEndpoint, {
                method: "POST",
                headers: headers,
                body: JSON.stringify(payload),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || `API Error: ${response.status}`);
            }

            return {
                success: response.status === 200,
                orderId: data.data?.order_id,
                amount: data.data?.amount,
                utrNumber: data.data?.utr_number,
                dateTime: data.data?.date_time,
                status: data.message,
                rawResponse: data,
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                orderId: null,
            };
        }
    }
}

const matrixSolsAdapter = new MatrixSolsAdapter();
module.exports = matrixSolsAdapter;
