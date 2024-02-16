// // get the client
const mysql = require('mysql2/promise');
global.logger = require('./log');

global.dbAuth = 'sun_shine_live_auth';
global.dbHrm = 'sun_shine_live_hrm';
global.dbSystem = 'sun_shine_live_system';
global.dbCrm = 'sun_shine_live_crm';
global.dbAcc = 'sun_shine_live_acc';

// const env = process.env.ENVIRONMENT || 'DEV';

// logger.info('environment: '+ process.env.ENVIRONMENT);

var mysqlSettings = {
  // host: '192.169.143.105',
  host: 'awszincatlk5.ctzqhtortutd.eu-north-1.rds.amazonaws.com',
  // host: '35.188.152.186',
  // host: '35.200.238.138',
  user: 'sun_shine_dbadmin',
  database: 'sun_shine_live_auth',
  port: "3307",
  // database: 'h2biz_19_dev_auth',
  waitForConnections: true,
  connectionLimit: 100,
  queueLimit: 0,
  password: 'UgGDBLHeTdJX4oK',
};

// if (env == 'QA') {
//   mysqlSettings.database = 'QA_h2biz_auth';
// } else if (env == 'ZINCAT_LIVE'){
//   mysqlSettings.database = 'zincat_h2biz_auth'
// }

// Create the connection pool. The pool-specific settings are the defaults
const pool = mysql.createPool(mysqlSettings);

pool.on('acquire', function (connection) {
  logger.info('Connection %d acquired', connection.threadId);
});

pool.on('enqueue', function () {
  logger.info('Waiting for available connection slot');
});

pool.on('release', function (connection) {
  logger.info('Connection %d released', connection.threadId);
});


var getConnection = function (callback) {
  pool.getConnection(function (err, connection) {
    callback(err, connection);
  });
};

module.exports.getConnection = getConnection;
module.exports.pool = pool;