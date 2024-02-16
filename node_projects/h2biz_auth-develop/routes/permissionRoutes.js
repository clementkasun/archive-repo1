var express = require('express');
var router = express.Router();

var pool = require('../config/database').pool;
router.get('/getPermissionNames', async function (req, res, next) {
    const API_NAME = 'getPermissionNames get, ';

    //*********always log inside which api*********
    logger.info(API_NAME + 'called');


    var conn;
    try {
        conn = await pool.getConnection();
        var promise1 = conn.execute(`
        SELECT
            ID_PERMISSION, PERMISSION_NAME, PERMISSION_URL
        FROM
            auth_permission
        WHERE
            IS_ACTIVE = 1
        ORDER BY
            PERMISSION_URL

        ;
        `);
        logger.info('Queried all permission names');

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

router.get('/getPermissionTypes', async function (req, res, next) {
    const API_NAME = 'getPermissionTypes get, ';

    //*********always log inside which api*********
    logger.info(API_NAME + 'called');

    var conn;

    try {
        conn = await pool.getConnection();
        var promise1 = conn.execute(`
        SELECT
            ID_PERMISSION_TYPE, PERMISSION_TYPE
        FROM
            auth_permission_type
        WHERE
            IS_ACTIVE = 1
        `);
        logger.info('Queried all permissions types');

        const values = await Promise.all([promise1]);
        res.status(200).json({ success: true, permissionTypes: values[0][0] });
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

router.post('/getPermissionsByRole', async function (req, res, next) {
    const API_NAME = 'getPermissionsByRole post, ';
    //*********always log inside which api*********
    logger.info(API_NAME + 'called');

    if (!req.body.role) {
        logger.info(API_NAME + 'Parameter not found');
        res.status(200).json({ success: false, message: 'role not found' });
        return res.end();
    }
    var conn;
    try {
        conn = await pool.getConnection();

        logger.info('Querying all permissions for role ' + req.body.role);

        var promise1 = conn.execute(`
        SELECT
            permissions_of_role.ID_AUTH_ROLE AS HAS_PERMISSION,
            permissions_all.*
        FROM
            (select * from permissions_of_role where permissions_of_role.ID_AUTH_ROLE=? ) as permissions_of_role
                RIGHT JOIN
            permissions_all ON permissions_of_role.ID_PERMISSION = permissions_all.ID_PERMISSION
                AND permissions_of_role.ID_PERMISSION_TYPE = permissions_all.ID_PERMISSION_TYPE

        ;
        `, [req.body.role]);

        var promise2 = conn.execute(`
        SELECT IS_ACTIVE FROM auth_role where ID_AUTH_ROLE=?;
        `, [req.body.role]);
        logger.info('Queried all permissions for role');

        const values = await Promise.all([promise1, promise2]);
        res.status(200).json({ success: true, IS_ACTIVE: values[1][0][0].IS_ACTIVE, permissions: values[0][0] });
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


router.post('/savePermissionsOfRole', async function (req, res, next) {
    const API_NAME = 'savePermissionsOfRole post, ';
    //*********always log inside which api*********
    logger.info(API_NAME + 'called');
    var conn;
    try {
        conn = await pool.getConnection();

        logger.debug(API_NAME + ' ,req.body.saveData : ' + JSON.stringify(req.body.saveData));

        let bulkArray = [];
        req.body.saveData.forEach(element => {
            let bulkArraySubArray = [
                element.ID_AUTH_ROLE,
                element.ID_PERMISSION_TYPE,
                element.ID_PERMISSION,
                element.IS_ACTIVE
            ];
            bulkArray.push(bulkArraySubArray);
        });

        logger.debug(API_NAME + ' ,bulkArray : ' + JSON.stringify(bulkArray));

        await conn.query(`START TRANSACTION`);

        await conn.query(`
            DELETE FROM auth_role_permission WHERE ID_AUTH_ROLE=` + req.body.roleId);

        logger.info('deleted permissions of role');

        const sql = await conn.query(`
        insert into
            auth_role_permission
        (ID_AUTH_ROLE, ID_PERMISSION_TYPE,ID_PERMISSION,IS_ACTIVE)
             values ?
        ` , [bulkArray]);

        logger.info('sql :: ' + JSON.stringify(sql));
        logger.info('inserted new permissions of role');

        await conn.query(`COMMIT`);
        logger.info('inserted new permissions of role transaction completed');
        res.status(200).json({ success: true });
        return res.end();
    } catch (err) {
        logger.error(API_NAME + 'error :' + err);
        if (conn !== undefined) {
            try {
                await conn.execute(`COMMIT`);
            } catch (error) {
                logger.error(API_NAME + 'rollback error :' + error);
            }
            conn.release();
        }
        res.status(200).json({ success: false, message: 'Query Error' });
        return res.end();
    } finally { conn.release(); }
});
module.exports = router;