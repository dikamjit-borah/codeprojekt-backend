module.exports = {
  "CHECKOUT_ORDER_COMPLETED": {
    "type": "CHECKOUT_ORDER_COMPLETED",
    "event": "checkout.order.completed",
    "payload": {
      "merchantId": "M23P65IJAV5DA",
      "merchantOrderId": "708d6a68-c894-4874-b714-3b262383e2ef",
      "orderId": "OMO2507171342162908082250",
      "state": "COMPLETED",
      "amount": 100,
      "payableAmount": 100,
      "feeAmount": 0,
      "expireAt": 1752740836291,
      "paymentDetails": [
        {
          "transactionId": "OM2507171342181267141812",
          "paymentMode": "UPI_QR",
          "timestamp": 1752739938185,
          "amount": 100,
          "payableAmount": 100,
          "feeAmount": 0,
          "state": "COMPLETED",
          "instrument": {
            "type": "ACCOUNT",
            "ifsc": "KKBK0000221",
            "accountType": "SAVINGS"
          },
          "rail": {
            "type": "UPI",
            "utr": "519871410199",
            "upiTransactionId": "ICIWC8CD8B0F59452FFA0A495AF82464484"
          },
          "splitInstruments": [
            {
              "instrument": {
                "type": "ACCOUNT",
                "ifsc": "KKBK0000221",
                "accountType": "SAVINGS"
              },
              "rail": {
                "type": "UPI",
                "utr": "519871410199",
                "upiTransactionId": "ICIWC8CD8B0F59452FFA0A495AF82464484"
              },
              "amount": 100
            }
          ]
        }
      ]
    }
  },

  "CHECKOUT_ORDER_FAILED": {
    "type": "CHECKOUT_ORDER_FAILED",
    "event": "checkout.order.failed",
    "payload": {
      "merchantId": "M23P65IJAV5DA",
      "merchantOrderId": "22592-7484660d-a14a-4dc2-ae6a-7b08b3305404",
      "orderId": "OMO2509021456325622050782",
      "state": "FAILED",
      "amount": 113,
      "expireAt": 1756806092562,
      "errorCode": "TXN_NOT_COMPLETED",
      "detailedErrorCode": "TXN_AUTO_FAILED",
      "paymentDetails": [
        {
          "transactionId": "OM2509021456529716033634",
          "paymentMode": "UPI_QR",
          "timestamp": 1756805212998,
          "amount": 113,
          "payableAmount": 113,
          "feeAmount": 0,
          "state": "FAILED",
          "errorCode": "TXN_NOT_COMPLETED",
          "detailedErrorCode": "TXN_AUTO_FAILED"
        }
      ]
    }
  }
}