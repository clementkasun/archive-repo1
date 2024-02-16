var express = require('express');
var router = express.Router();

var pool = require('../config/database').pool;
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

router.get('/getAllRolesWithInactive', async function (req, res, next) {
    const API_NAME = 'getAllRolesWithInactive get, ';

    //*********always log inside which api*********
    logger.info(API_NAME + 'called');
    var conn;
    try {
        conn = await pool.getConnection();
        var promise1 = conn.execute(`
        SELECT
            ID_AUTH_ROLE, ROLE_NAME
        FROM
            auth_role
        `);
        logger.info('Queried all roles');

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

router.post('/createRole', async function (req, res, next) {
    const API_NAME = 'createRole post, ';

    //*********always log inside which api*********
    logger.info(API_NAME + 'called');

    if (!req.body.role) {
        res.status(200).json({ success: false, message: 'parameter not found' });
        return res.end();
    }
    var conn;
    try {
        conn = await pool.getConnection();
        await conn.query(`
        INSERT INTO auth_role SET ?`, req.body.role);
        logger.info('Inserted role');
        res.status(200).json({ success: true, message: 'role created' });
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

router.post('/toggleRoleInactive', async function (req, res, next) {
    const API_NAME = 'toggleRoleInactive post, ';

    //*********always log inside which api*********
    logger.info(API_NAME + 'called');
    logger.debug(API_NAME + ' params ,role: ' + req.body.role + ', status: ' + req.body.status);
    var IS_ACTIVE;
    if (req.body.status == 1) {
        IS_ACTIVE = 0;
    } else if (req.body.status == 0) {
        IS_ACTIVE = 1;
    }

    logger.debug('updating active status to ' + IS_ACTIVE);
    var conn;
    try {
        conn = await pool.getConnection();
        await conn.execute(`
        update auth_role SET IS_ACTIVE=? where ID_AUTH_ROLE=?`, [IS_ACTIVE, req.body.role]);
        logger.info('Updated role');
        res.status(200).json({ success: true, message: 'role status changed' });
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

router.post('/getRoleOfUser', async function (req, res, next) {
    const API_NAME = 'getRoleOfUser post, ';

    //*********always log inside which api*********
    logger.info(API_NAME + 'called');
    if (!req.body.ID_USER) {
        res.status(200).send({ success: false, message: 'param not found' });
        return res.end();
    }

    var conn;
    try {
        conn = await pool.getConnection();
        var promise1 = conn.query(`
        SELECT
            USERNAME, auth_role.ID_AUTH_ROLE, auth_role.ROLE_NAME,auth_role.IS_SUPER_ADMIN
        FROM
            auth_user
                INNER JOIN
            auth_role ON auth_user.ID_AUTH_ROLE = auth_role.ID_AUTH_ROLE
        WHERE
            auth_user.ID_USER = ?;
        `, req.body.ID_USER);
        logger.info('Queried role OF USER');

        const values = await Promise.all([promise1]);
        res.status(200).json({ success: true, role: values[0][0] });
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

router.post('/getOtherPermissionsOfRole', async function (req, res, next) {
    const API_NAME = 'getOtherPermissionsOfRole post, ';

    //*********always log inside which api*********
    logger.info(API_NAME + 'called');
    if (!req.body.ID_AUTH_ROLE) {
        res.status(200).send({ success: false, message: 'param not found' });
        return res.end();
    }

    var conn;
    try {
        conn = await pool.getConnection();
        var sq = '';
        if (req.body.GETALL) {
            sq = '';
        }
        else {
            sq = 'auth_role_other_permissions.STATUS=1 and';
        }
        var promise1 = conn.query(`
        SELECT
        auth_role_other_permissions.ID_ROLE_PERMISSION, auth_permission_type.PERMISSION_TYPE, auth_role_other_permissions.STATUS
        FROM
        auth_role_other_permissions
                JOIN
                auth_permission_type ON auth_role_other_permissions.ID_PERMISSION_TYPE = auth_permission_type.ID_PERMISSION_TYPE
        WHERE
        ${sq}
        auth_role_other_permissions.IS_ACTIVE=1 and 
        auth_permission_type.IS_ACTIVE=1 and 
        auth_role_other_permissions.ID_AUTH_ROLE = ?;
        `, req.body.ID_AUTH_ROLE);
        logger.info('Queried other permissions of role');

        const values = await Promise.all([promise1]);
        res.status(200).json({ success: true, otherPermissions: values[0][0] });
        return res.end();
    }
    catch (err) {

        logger.error(API_NAME + 'error :' + err);
        if (conn !== undefined) {
            conn.destroy();
        }
        res.status(200).json({ success: false, message: 'Query Error' });
        return res.end();
    } finally { conn.destroy(); }
});

// Status Change Invoice Master
router.post("/changeOtherPermissionStatus", async function (req, res, next) {
    logger.info("changeOtherPermissionStatus change POST called");
    var status = 0;
    if (req.body.currentStatus == 1) {
        status = 0;
    } else {
        status = 1;
    }
    var conn;
    try {
        conn = await pool.getConnection();
        await conn.query("START TRANSACTION");
        const query = `UPDATE auth_role_other_permissions SET STATUS='${status}' WHERE ID_ROLE_PERMISSION='${req.body.ID_ROLE_PERMISSION}'`;
        const [result, fields] = await conn.query(query);

        await conn.query("COMMIT");
        res.status(200).json({success: true, result: result});
        return res.end();
    } catch (err) {
        await conn.query("ROLLBACK");
        logger.error("UPDATE FAIL DUE TO :- ", err);
        res.status(200).json({ success: false });
        return res.end();
    } finally {
        conn.destroy();
    }
});

module.exports = router;
