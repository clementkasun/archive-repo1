var express = require('express');
var router = express.Router();

var pool = require('../config/database').pool;

router.post('/getGridSettingOfUser', async function (req, res, next) {
    const API_NAME = 'getGridSettingOfUser post, ';
    logger.info(API_NAME + 'called');

    if (!req.body.ID_USER || !req.body.GRID_NAME) {
        return res.send.status(200).send({ success: false, message: 'Parameters not found' });
    }
    var conn;
    try {
        conn = await pool.getConnection();
        const values = await conn.query(`
            SELECT * FROM auth_user_table_column_settings where ID_USER=? AND GRID_NAME=? AND IS_ACTIVE=1;
        `, [req.body.ID_USER, req.body.GRID_NAME]);

        var resVal;
        if (!values || !values[0] || !values[0][0]) {
            resVal = null;
        } else {
            resVal = JSON.parse(values[0][0].COL_ARRAY)
        }

        res.status(200).json({ success: true, gridColumns: resVal, pageSize: values[0][0].PAGE_SIZE });
        return res.end();
    }
    catch (err) {
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

router.post('/saveUserSettingsOfUser', async function (req, res, next) {
    const API_NAME = 'saveUserSettingsOfUser post, ';

    //*********always log inside which api*********
    logger.info(API_NAME + 'called');

    if (!req.body.ID_USER || !req.body.GRID_NAME || !req.body.COL_ARRAY) {
        logger.info(API_NAME + ', Params not found');
        res.status(200).json({ success: false, message: 'Parameters not found' });
        return res.end();
    }

    var conn;

    try {
        conn = await pool.getConnection();

        logger.info('Queried user setting');

        const values = await conn.execute(`
            INSERT INTO auth_user_table_column_settings (ID_USER, GRID_NAME, COL_ARRAY, PAGE_SIZE, IS_ACTIVE)
            VALUES(?, ?, ?, ?, 1) ON DUPLICATE KEY UPDATE COL_ARRAY=?, PAGE_SIZE=?
        `, [req.body.ID_USER, req.body.GRID_NAME, req.body.COL_ARRAY, req.body.PAGE_SIZE, req.body.COL_ARRAY, req.body.PAGE_SIZE]);

        res.status(200).json({ success: true });
        return res.end();
    }
    catch (err) {
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


module.exports = router;