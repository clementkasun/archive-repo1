var express = require('express');
var router = express.Router();

var pool = require('../../config/database').pool;
router.get('/getAllRoles', async function (req, res, next) {
    const API_NAME = 'getAllRoles get, ';
    logger.info(API_NAME + 'called');
    var conn;
    try {
        conn = await pool.getConnection();
        var promise1 = conn.execute(`
        SELECT
            ID_AUTH_ROLE, ROLE_NAME,IS_SUPER_ADMIN
        FROM
            auth_role
        WHERE
            IS_ACTIVE = 1
        `);
        logger.info('Queried all roles');

        const values = await Promise.all([promise1]);
        res.status(200).json({ success: true, roleData : values[0][0] });
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
router.post('/createRole', async function (req, res, next) {
    const API_NAME = 'createRole post, ';

    //*********always log inside which api*********
    logger.info(API_NAME + 'called');

    if(!req.body.role){
        res.status(200).json({ success: false, message : 'parameter not found' });
        return res.end();
    }
    var conn;
    try {
        conn = await pool.getConnection();
        await conn.query(`
        INSERT INTO auth_role SET ?`,req.body.role);
        logger.info('Inserted role');
        res.status(200).json({ success: true, message:'role created'});
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

//get users by role
router.get('/getAllUsersByRole', async function (req, res, next) {
    const API_NAME = 'get all users get, ';
    logger.info(API_NAME + 'called');

    var conn;

    var obj = req.query;
    try {
        conn = await pool.getConnection();

        var promise1 = conn.execute(`
                SELECT
                user.ID_USER,
                    user.ID_EMPLOYEE_REGISTRY,
                    user.ID_CUSTOMER_REGISTRY,
                    user.USERNAME,
                    user.IS_ACTIVE,
                    role.ID_AUTH_ROLE,
                    role.ROLE_NAME,
                    role.IS_SUPER_ADMIN
                FROM
                auth_user user
                INNER JOIN
                auth_role role on role.ID_AUTH_ROLE=user.ID_AUTH_ROLE
                WHERE user.ID_AUTH_ROLE='${obj.id}'
                GROUP BY  user.ID_USER
                `);
        logger.info('Queried all users by role');

        const values = await Promise.all([promise1]);
        res.status(200).json({ success: true, users: values[0][0] });
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