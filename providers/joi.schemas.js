const Joi = require("joi");
const { SPU_TYPES } = require("../utils/constants");

const schemas = {
  purchaseSPU: Joi.object({
    spuId: Joi.string().required(),
    spuDetails: Joi.object().required(),
    spuType: Joi.string()
      .valid(...Object.values(SPU_TYPES))
      .required(),
    userDetails: Joi.object().required(),
    playerDetails: Joi.object().required(),
    redirectUrl: Joi.string().uri().required(),
  }),
};

module.exports = schemas;
