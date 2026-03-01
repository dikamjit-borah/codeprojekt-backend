const config = require("config");
const crypto = require("crypto");
const { CREATE_ORDER, CHECK_ORDER_STATUS } = require("../config/matrixSols.config");
const matrixSolsConfig = config.get("matrixSols");
const db = require("../providers/mongo");
const logger = require("../utils/logger");

class MatrixSolsAdapter {
    constructor() {
        this.apiKey = matrixSolsConfig.apiKey;
        this.clientId = matrixSolsConfig.clientId;
    }

    /**
     * Helper function to recursively sort object keys alphabetically
     * @param {*} obj - Object to sort
     * @returns {*} - Object with sorted keys
     */
    sortObjectKeys(obj) {
        // Return the value directly if it is not an object or is null
        if (obj === null || typeof obj !== 'object') {
            return obj;
        }

        // Specific handling to recursively sort items within arrays
        if (Array.isArray(obj)) {
            return obj.map(item => this.sortObjectKeys(item));
        }

        // Get keys, sort them, and rebuild the object in that specific order
        return Object.keys(obj).sort().reduce((sortedObj, key) => {
            sortedObj[key] = this.sortObjectKeys(obj[key]);
            return sortedObj;
        }, {});
    }

    /**
     * Generate HMAC-SHA256 signature for request authentication
     * @param {Object} payload - Request payload object
     * @returns {Promise<string>} - Hex encoded signature
     */
    async generateSignature(payload) {
        try {
            // Create a new version of the payload where all keys are sorted
            const sortedPayload = this.sortObjectKeys(payload);
            
            // Convert the sorted object to a JSON string
            const serializedBody = JSON.stringify(sortedPayload);

            // Generate the signature using HMAC-SHA256
            const signature = crypto
                .createHmac("sha256", this.apiKey)
                .update(serializedBody)
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
        db.insertOne("vendor-calls", { url, body: payload, vendor: 'matrix_sols', type: 'api', response: responseJson }).catch((err) => {
            logger.error("Failed to log Matrix Sols api call", { error: err.message });
        });

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
     * @param {string} orderId - Order ID to check status for (e.g., "MSOLSacb54385cc")
     * @returns {Promise<Object>} - Order status response
     */
    async checkOrderStatus(orderId) {
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

            const url = `${matrixSolsConfig.baseURL}${CHECK_ORDER_STATUS.url}`;

            const response = await fetch(url, {
                method: CHECK_ORDER_STATUS.method,
                headers: headers,
                body: JSON.stringify(payload),
            });

            const responseJson = await response.json();

            // Log the API call
            db.insertOne("vendor-calls", { 
                url, 
                body: payload, 
                vendor: 'matrix_sols', 
                type: 'check_order_status', 
                response: responseJson 
            }).catch((err) => {
                logger.error("Failed to log Matrix Sols check order status call", { error: err.message });
            });

            if (!response.ok) {
                throw new Error(responseJson.message || `API Error: ${response.status}`);
            }

            return {
                success: true,
                orderId: responseJson.data?.order_id,
                amount: responseJson.data?.amount,
                utrNumber: responseJson.data?.utr_number,
                dateTime: responseJson.data?.date_time,
                status: responseJson.data?.status,
                message: responseJson.message,
                rawResponse: responseJson,
            };
        } catch (error) {
            logger.error(`Matrix Sols check order status error: ${error.message}`);
            return {
                success: false,
                error: error.message,
                orderId: orderId,
            };
        }
    }
}

const matrixSolsAdapter = new MatrixSolsAdapter();
module.exports = matrixSolsAdapter;
