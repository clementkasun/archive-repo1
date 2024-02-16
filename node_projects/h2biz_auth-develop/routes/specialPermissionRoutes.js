var express = require('express');
var router = express.Router();

var pool = require('../config/database').pool;
router.get('/getSpecialPermissionNames', async function (req, res, next) {
    const API_NAME = 'getSpecialPermissionNames get, ';
    logger.info(API_NAME + 'called');

    var conn;
    try {
        conn = await pool.getConnection();
        var promise1 = conn.execute(`
        SELECT
        ID_AUTH_SPECIAL_PERMISSION_TYPE, SPECIAL_PERMISSION_TYPE
        FROM
            auth_special_permission_type
        WHERE
            IS_ACTIVE = 1
    `);
        logger.info('Queried all permissions types');

        const values = await Promise.all([promise1]);
        res.status(200).json({ success: true, permissionNames: values[0][0] });
        return res.end();
    } catch (err) {

        logger.error(API_NAME + 'error :' + err);
        if (conn !== undefined) {
            conn.release();
        }
        res.status(200).json({ success: false, message: 'Query Error' });
        return res.end();
    } finally { conn.release(); }
});

//To load the special permissions according to the User
router.post('/getSpecialPermissionUsers', async function (req, res, next) {
    const API_NAME = 'getSpecialPermissionUsers post, ';
    logger.info(API_NAME + 'called');
    var conn;
    var roleID = req.body.ID_AUTH_ROLE;
    //logic here
    try {
        conn = await pool.getConnection();
        var promise1 = conn.execute(`
            SELECT
                p.PERMISSION_NAME,s.SPECIAL_PERMISSION_TYPE,r.ROLE_NAME
            FROM
                auth_role_special_permission AS t
            INNER JOIN
                auth_special_permission_type AS s
            ON
                s.ID_AUTH_SPECIAL_PERMISSION_TYPE = t.ID_SPECIAL_PERMISSION_TYPE
            INNER JOIN
                auth_role AS r
            ON
                r.ID_AUTH_ROLE = t.ID_AUTH_ROLE
            INNER JOIN
                auth_permission AS p
            ON
                p.ID_PERMISSION = t.ID_PERMISSION
            WHERE
                t.IS_ACTIVE = 1
            AND
                t.ID_AUTH_ROLE = ? ;
    `, [roleID]);
        logger.info('Queried all special permissions types for users');

        const values = await Promise.all([promise1]);
        res.status(200).json({ success: true, permissionNames: values[0][0] });
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