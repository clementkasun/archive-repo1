var express = require('express');
var router = express.Router();

var pool = require('../config/database').pool;

router.post('/getUserLocationByUserId', async function (req, res, next) {
    const API_NAME = 'getLocationsOfUser post, ';

    logger.info(API_NAME + 'called');
    if (!req.body.ID_USER) {
        res.status(200).json({ success: false, message: 'Parameters not found' });
        return res.end();
    }
    var conn;
    try {
        conn = await pool.getConnection();
        const [values, rows] = await conn.query(`
        SELECT
        ul.ID_LOCATION,l.LOCATION_NAME
    FROM
        auth_user_location ul
            JOIN
        ${dbSystem}.sys_location l ON l.ID_LOCATION = ul.ID_LOCATION where ul.ID_USER=? AND ul.IS_ACTIVE=1;
        `, [req.body.ID_USER]);
        logger.info('Queried user locations');

        var resVal = [];
        for (var i = 0; i < values.length; i++) {
            resVal.push(values[i].ID_LOCATION)
        }
        res.status(200).json({ success: true, locations: resVal });
        return res.end();
    } catch (err) {
        logger.error(API_NAME + 'error :' + err);
        res.status(200).json({ success: false, message: 'Query Error' });
        return res.end();
    } finally {
        conn.release();
    }
});
router.post('/getLocationsOfUser', async function (req, res, next) {
    const API_NAME = 'getLocationsOfUser post, ';
    logger.info(API_NAME + 'called');
    if (!req.body.ID_USER) {
        res.status(200).json({ success: false, message: 'Parameters not found' });
    }
    var conn;
    try {
        conn = await pool.getConnection();

        const [values, rows] = await conn.query(`
            SELECT ID_LOCATION FROM auth_user_location where ID_USER=? AND IS_ACTIVE=1;
        `, [req.body.ID_USER]);

        logger.info('Queried user locations');
        var resVal = {};
        values.forEach(element => {
            resVal[element.ID_LOCATION] = null;
        });
        res.status(200).json({ success: true, locations: resVal });
        return res.end();
    }
    catch (err) {

        logger.error(API_NAME + 'error :' + err);
        if (conn !== undefined) {
            conn.release();
        }
        res.status(200).json({ success: false, message: 'Query Error' });
        return res.end();
    } finally { conn.release() }
});

router.post('/addLocationsToUser', async function (req, res, next) {
    const API_NAME = 'addLocationsToUser post, ';
    logger.info(API_NAME + 'called');
    if (!req.body.ID_USER || !req.body.locations) {
        res.status(200).json({ success: false, message: 'Parameters not found' });
    }

    var conn;

    let values = [];

    for (let i = 0; i < req.body.locations.length; i++) {
        if (req.body.locations[i] == 0) {
            values = [[req.body.ID_USER, 0, 1]];
            break;
        }
        values.push([req.body.ID_USER, req.body.locations[i], 1])
    }

    try {
        conn = await pool.getConnection();

        await conn.query(`
            INSERT INTO auth_user_location (ID_USER,ID_LOCATION,IS_ACTIVE) VALUES ?;
        `, [values]);

        logger.info('inserted user locations');
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
    } finally { conn.release() }
});


router.post('/deleteLocationOfUser', async function (req, res, next) {
    const API_NAME = 'deleteLocationOfUser post, ';
    logger.info(API_NAME + 'called');
    if (!req.body.ID_USER || !req.body.ID_LOCATION) {
        res.status(200).json({ success: false, message: 'Parameters not found' });
    }

    var conn;

    try {
        conn = await pool.getConnection();

        await conn.query(`
            DELETE FROM auth_user_location WHERE ID_USER=? AND ID_LOCATION=?;
        `, [req.body.ID_USER, req.body.ID_LOCATION]);

        logger.info('deleted user locations');
        res.status(200).json({ success: true });
        return res.end();
    }
    catch (err) {
        logger.error(API_NAME + 'error :' + err);
        if (conn !== undefined) {
            conn.release();
        }
        res.status(200).json({ success: false, message: 'Query Error' });
    } finally {
        conn.release();
    }
});


module.exports = router;