const axios = require('axios');
const getBuffer = async (url, options) => {
    try {
        const res = await axios({ method: "get", url, ...options, responseType: 'arraybuffer' });
        return res.data;
    } catch (err) { return err; }
};
module.exports = { getBuffer };
