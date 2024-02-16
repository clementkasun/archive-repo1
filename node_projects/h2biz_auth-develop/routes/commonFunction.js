var pool = require("../config/database").pool;

getSystemConfigData = async (type) => {
  const conn = await pool.getConnection();
  try {
    const [result, fields] = await conn.query(
      `select VALUE from ${dbSystem}.system_config WHERE TYPE = '${type}'`
      );
    return result[0].VALUE;
  } catch (err) {
    return null;
  } finally { if (conn != undefined) { conn.release(); } }
};

module.exports = { getSystemConfigData }