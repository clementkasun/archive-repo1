var express = require('express');
var router = express.Router();

var pool = require('../config/database').pool;

router.get('/getDocuments', async function (req, res, next) {
    const API_NAME = 'getDocuments get, ';
    //*********always log inside which api*********
    logger.info(API_NAME + 'called');
    var conn;
    //logic here
    try {
        conn = await pool.getConnection();
        // Do something with the connection
        var promise1 = conn.execute(`
            SELECT * FROM document_authorization WHERE IS_ACTIVE='1';
        `);
        logger.info('Queried all documents');
        const values = await Promise.all([promise1]);
        res.status(200).json({ success: true, results: values[0][0] });
        return res.end();
    } catch (err) {
        logger.error(API_NAME + 'error :' + err);
        if (conn !== undefined) {
            conn.release();
        }
        res.status(200).json({ success: false, message: 'Query Error' });
        return res.end();
    } finally {
        conn.release();
    }
});

router.post('/usersByLocation', async function (req, res, next) {
    const API_NAME = 'usersByLocation POST, ';

    //*********always log inside which api*********
    logger.info(API_NAME + 'called');
    console.log("data", req.body.ID_LOCATION)

    var conn;
    try {
        conn = await pool.getConnection();
        var sql = `
        SELECT
            DISTINCT aul.ID_USER ,
            au.ID_EMPLOYEE_REGISTRY,
            ep.REGISTRY_CODE_PREFIX,
            ep.REGISTRY_CODE_SUFFIX,
            ep.FIRSTNAME,
            ep.MIDDLENAME,
            ep.LASTNAME
        FROM ${dbAuth}.auth_user_location aul
        LEFT JOIN ${dbAuth}.auth_user au ON aul.ID_USER = au.ID_USER
        LEFT JOIN ${dbHrm}.view_all_emp_profile_details ep ON au.ID_EMPLOYEE_REGISTRY = ep.ID_EMPLOYEE_REGISTRY
        WHERE aul.ID_LOCATION IN (?) `

        var promise1 = conn.query(sql, [req.body.ID_LOCATION]);
        logger.info('Queried all documents');

        const values = await Promise.all([promise1]);
        res.status(200).json({ success: true, results: values[0][0] });
        return res.end();
    } catch (err) {

        logger.error(API_NAME + 'error :' + err);
        if (conn !== undefined) {
            conn.release();
        }
        res.status(200).json({ success: false, message: 'Query Error' });
        return res.end();
    } finally {
        conn.release();
    }
});


router.get('/getAllUsers', async function (req, res, next) {
    const API_NAME = 'getAllUsers GET, ';

    //*********always log inside which api*********
    logger.info(API_NAME + 'called');
    var conn;
    try {
        conn = await pool.getConnection();
        var sql = `
        SELECT
            DISTINCT aul.ID_USER ,
            au.ID_EMPLOYEE_REGISTRY,
            ep.REGISTRY_CODE_PREFIX,
            ep.REGISTRY_CODE_SUFFIX,
            ep.FIRSTNAME,
            ep.MIDDLENAME,
            ep.LASTNAME
        FROM ${dbAuth}.auth_user_location aul
        LEFT JOIN ${dbAuth}.auth_user au ON aul.ID_USER = au.ID_USER
        LEFT JOIN ${dbHrm}.view_all_emp_profile_details ep ON au.ID_EMPLOYEE_REGISTRY = ep.ID_EMPLOYEE_REGISTRY
        `

        var promise1 = conn.query(sql);
        logger.info('Queried all documents');
        const values = await Promise.all([promise1]);
        res.status(200).json({ success: true, results: values[0][0] });
        return res.end();
    }
    catch (err) {
        logger.error(API_NAME + 'error :' + err);
        if (conn !== undefined) {
            conn.release();
        }
        res.status(200).json({ success: false, message: 'Query Error' });
        return res.end();
    } finally { conn.release(); }
});



module.exports = router;