var express = require('express');
const bcrypt = require('bcrypt');
var jwt = require('jsonwebtoken');

var router = express.Router();
const jwtSecret = require('../config/constants')["jwt-secret"];
var pool = require('../config/database').pool;
var { getSystemConfigData } = require("./commonFunction");

router.post('/login', async function (req, res, next) {
    const API_NAME = 'login post, ';

    logger.info(API_NAME + 'called');

    if (!req.body.username || !req.body.password) {
        logger.info(API_NAME + 'Parameter not found');
        res.status(200).json({ success: false, message: 'Parameters not found' });
        return res.end();
    }
    var conn;

    try {
        conn = await pool.getConnection();

        var promise1 = conn.execute(`
        SELECT
            ID_USER,
            PASSWORD
        FROM
            auth_user
        WHERE
            USERNAME = ?  AND IS_ACTIVE = 1
        ;
        `, [req.body.username]);


        const values = await Promise.all([promise1]);

        if (!values[0][0][0] || !values[0][0][0].PASSWORD) {
            conn.release();
            res.status(200).json({ success: false, message: 'login failed' });
        }

        logger.debug(values[0][0][0].PASSWORD + ', ' + req.body.password);
        bcrypt.compare(String(req.body.password), values[0][0][0].PASSWORD, async (err, isMatch) => {
            if (err) {
                logger.error('bcrypt compare error, ' + err.message);
                return res.sendStatus(500);
            }
            console.log(JSON.stringify(isMatch));
            if (isMatch) {
                logger.debug('Passwords matched');

                logger.info('Login success for user ' + req.body.username);

                var promiseUserPermission = conn.query(`
                                                        SELECT
                                                            U.*
                                                        FROM
                                                            (SELECT
                                                                *
                                                            FROM
                                                                detailed_addtional_grants_of_user
                                                            WHERE
                                                                detailed_addtional_grants_of_user.ID_USER = ${values[0][0][0].ID_USER} UNION SELECT
                                                                *
                                                            FROM
                                                                detailed_grants_of_users
                                                            WHERE
                                                                detailed_grants_of_users.ID_USER = ${values[0][0][0].ID_USER}) AS U
                                                                LEFT JOIN
                                                            detailed_deducted_grants_of_user D ON D.ID_PERMISSION = U.ID_PERMISSION
                                                                AND D.ID_PERMISSION_TYPE = U.ID_PERMISSION_TYPE
                                                        WHERE
                                                            D.ID_PERMISSION IS NULL
                                                                AND D.ID_PERMISSION_TYPE IS NULL
                                                        ORDER BY U.SORT_KEY;
                                                    `);

                var employeeRegId = conn.query(`
                                                SELECT
                                                a.ID_EMPLOYEE_REGISTRY, e.IMAGE_PATH, e.DISPLAY_NAME,e.FIRSTNAME,e.MIDDLENAME,e.LASTNAME,e.MOBILE,e.INITIALS
                                                FROM
                                                    auth_user a
                                                      join
                                                        ${dbHrm}.hrm_employee_profile e
                                                      ON
                                                    e.ID_EMPLOYEE_REGISTRY = a.ID_EMPLOYEE_REGISTRY
                                                WHERE
                                                    a.ID_USER = ${values[0][0][0].ID_USER} and a.IS_ACTIVE=1 and  e.IS_ACTIVE = 1;
                                                `);

                var locations = conn.query(`
                SELECT
                    ID_LOCATION
                FROM
                    auth_user_location
                WHERE
                    ID_USER = ${values[0][0][0].ID_USER} and IS_ACTIVE=1;
                `);

                const userPermission = await Promise.all([promiseUserPermission, employeeRegId, locations]);

                var company = conn.query(`
                SELECT
                  a.ID_LOCATION, l.ID_COMPANY,l.LOCATION_NAME, a.ID_USER
                FROM
                auth_user_location a
                          JOIN
                          ${dbSystem}.sys_location l ON a.ID_LOCATION = l.ID_LOCATION
                WHERE
                    a.ID_LOCATION = ${userPermission[2][0][0].ID_LOCATION} and l.IS_ACTIVE=1
                `);
                const userCompany = await Promise.all([company]);

                let locationArray = userPermission[2][0].map(e => e.ID_LOCATION)
                var token = jwt.sign({
                    // exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24),
                    exp: Math.floor(Date.now() / 1000) + (300 * 300),
                    data: { userid: values[0][0][0].ID_USER }
                }, jwtSecret);

                logger.info('returning token');
                res.status(200).json({ success: true, message: 'login success', token: 'JWT ' + token, userId: values[0][0][0].ID_USER, userPermission: userPermission[0][0], employee: userPermission[1][0], locations: locationArray, ID_COMPANY: userCompany[0][0][0].ID_COMPANY });
                return res.end();
            }
            else {
                logger.info('Passwords not matched. Returning false');
                res.status(200).json({ success: false, msg: 'Authentication failed. Wrong password.' });
                return res.end();
            }
        });
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
router.post('/changePassword', async function (req, res, next) {
    const API_NAME = 'changePassword post, ';

    logger.info(API_NAME + 'called');

    if (!req.body.newPassword || !req.body.userId || !req.body.currentPassword) {
        logger.info(API_NAME + 'Parameter not found');
        res.status(200).json({ success: false, message: 'Parameters not found' });
        return res.end();
    }
    var conn;

    try {
        conn = await pool.getConnection();

        var promise1 = conn.execute(`
        SELECT
            ID_USER,
                    PASSWORD
        FROM
            auth_user
        WHERE
            ID_USER = ? AND IS_ACTIVE = 1
        ;
                `, [req.body.userId]);


        const values = await Promise.all([promise1]);

        if (!values[0][0][0] || !values[0][0][0].PASSWORD) {
            conn.release();
            res.status(200).json({ success: false, message: 'password mismatch' });
        }

        logger.debug(values[0][0][0].PASSWORD);

        bcrypt.compare(String(req.body.currentPassword), values[0][0][0].PASSWORD, async (err, isMatch) => {
            if (err) {
                logger.error('bcrypt compare error, ' + err.message);
                return res.sendStatus(500);
            }
            if (isMatch) {
                logger.debug('Passwords matched');
                bcrypt.genSalt(10, (err, salt) => {
                    if (err) {
                        logger.error(API_NAME + ' Gen Salt Error');
                        return res.sendStatus(500);
                    }
                    bcrypt.hash(req.body.newPassword, salt, async (err, hash) => {
                        if (err) {
                            console.log('bcrypt gen error: ' + err.message);
                            return res.sendStatus(500);
                        }

                        await conn.execute(`
                UPDATE auth_user
                SET PASSWORD =?
                    WHERE
                                ID_USER = ?
                            ;
                `, [hash, req.body.userId]);
                        res.status(200).json({ success: true, message: 'password changed' });
                        return res.end();
                    });
                });
            }
            else {
                logger.info('Passwords not matched. Returning false');
                res.status(200).json({ success: false, msg: 'Authentication failed. Wrong password.' });
                return res.end();
            }
        });
    }
    catch (err) {
        logger.error(API_NAME + 'error :' + err);
        if (conn !== undefined) {
            conn.release();
        }
        res.status(200).json({ success: false, message: 'Query Error' });
        return res.end();
    }
});
router.get('/getAllUsers', async function (req, res, next) {
    const API_NAME = 'getAllUsers get, ';
    logger.info(API_NAME + 'called');

    var conn;

    try {
        conn = await pool.getConnection();

        var promise1 = conn.execute(`
                SELECT
                user.ID_USER,
                    user.ID_EMPLOYEE_REGISTRY,
                    user.USERNAME,
                    user.IS_ACTIVE,
                    role.ID_AUTH_ROLE,
                    role.ROLE_NAME,
                    role.IS_SUPER_ADMIN
                FROM
                auth_user user
                INNER JOIN
                auth_role role ON user.ID_AUTH_ROLE = role.ID_AUTH_ROLE;
                `);
        logger.info('Queried all users');

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
router.post('/createUser', async function (req, res, next) {
    const API_NAME = 'createUser post, ';

    //*********always log inside which api*********
    logger.info(API_NAME + 'called');

    if (!req.body.newUser) {
        logger.info(API_NAME + 'Parameters not found');
        res.status(200).json({ success: false, message: 'user not found' });
        return res.end();
    }

    logger.debug('encrypting user password : ' + JSON.stringify(req.body.newUser));

    bcrypt.genSalt(10, (err, salt) => {
        bcrypt.hash(req.body.newUser.PASSWORD, salt, async (err, hash) => {
            if (err) {
                logger.error('bcrypt gen error: ' + err.message);
                return res.sendStatus(500);
            }
            req.body.newUser.PASSWORD = hash;

            logger.debug('Adding user to database : ' + JSON.stringify(req.body.newUser));

            var conn;

            try {
                conn = await pool.getConnection();

                await conn.query(`START TRANSACTION`);

                const resultCheckExist = await conn.query(`Select * from auth_user where USERNAME='${req.body.newUser.USERNAME}' `);

                if (resultCheckExist[0].length > 0) {
                    res.status(200).json({ success: false, message: 'User Already Exists' });
                    return res.end();
                }

                const result = await conn.query(`INSERT INTO auth_user SET ? `, req.body.newUser);
                logger.debug('User created ,' + JSON.stringify(result));
                logger.info(API_NAME + ': user inserted into database');

                if (req.body.locationArray && req.body.locationArray.length > 0) {
                    let locationArray = [];

                    for (let i = 0; i < req.body.locationArray.length; i++) {
                        if (req.body.locationArray[i] == 0) {
                            locationArray = [[result[0].insertId, 0, 1]];
                            break;
                        }
                        locationArray.push([result[0].insertId, req.body.locationArray[i], 1])
                    }
                    console.log(JSON.stringify(locationArray));
                    await conn.query(`
                        INSERT INTO auth_user_location(ID_USER, ID_LOCATION, IS_ACTIVE) VALUES ?;
                `, [locationArray]);
                }

                await conn.query(`COMMIT`);

                res.status(200).json({ success: true, message: "User Created Successfully" });
                return res.end();
            }
            catch (err) {

                logger.error(API_NAME + 'error :' + err);
                if (conn !== undefined) {
                    await conn.query(`ROLLBACK`);
                    conn.release();
                }
                res.status(200).json({ success: false, message: 'Failed to Create User' });
                return res.end();
            } finally {
                conn.release();
            }

        });
    });
});
router.post('/toggleUserActiveStatus', async function (req, res, next) {
    const API_NAME = 'toggleUserActiveStatus post, ';

    logger.info(API_NAME + 'called');

    if (!req.body.userId && !req.body.currentStatus) {
        logger.info(API_NAME + 'Parameters not found');
        res.status(200).json({ success: false, message: 'userId not found' });
        return res.end();
    }

    var conn;

    let paramsArray = [];

    if (req.body.currentStatus == 1) {
        paramsArray = [0, req.body.userId];
    } else {
        paramsArray = [1, req.body.userId];
    }

    try {
        conn = await pool.getConnection();

        await conn.query(`
                UPDATE auth_user
                SET
                IS_ACTIVE = ?
                    WHERE
            ID_USER = ?
                    `, paramsArray);
        logger.info(API_NAME + ': user status changed in database');

        res.status(200).json({ success: true, message: "User status changed" });
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
router.post('/changeRole', async function (req, res, next) {
    const API_NAME = 'changeRole post, ';

    logger.info(API_NAME + 'called');
    if (!req.body.userId && !req.body.roleId) {
        logger.info(API_NAME + 'Parameters not found');
        res.status(200).json({ success: false, message: 'userId not found' });
        return res.end();
    }
    var conn;
    try {
        conn = await pool.getConnection();

        await conn.query(`
        UPDATE auth_user
                SET
                ID_AUTH_ROLE = ?
                    WHERE
            ID_USER = ?
                    `, [req.body.roleId, req.body.userId]);
        logger.info(API_NAME + ': user role changed in database');

        await conn.query(`delete from auth_user_location  WHERE ID_USER =? `, req.body.userId);
        if (req.body.locations && req.body.locations.length > 0) {
            let locationArray = [];
            for (let i = 0; i < req.body.locations.length; i++) {
                locationArray.push([req.body.userId, req.body.locations[i], 1])
            }
            await conn.query(`INSERT INTO auth_user_location(ID_USER, ID_LOCATION, IS_ACTIVE) VALUES ? `, [locationArray]);
        }
        res.status(200).json({ success: true, message: "User role changed" });
        return res.end();
    } catch (err) {
        logger.error(API_NAME + 'error :' + err);
        return res.end();
    } finally {
        conn.release();
    }
});
// get all user employees not in users
router.get("/getEmployeeProfilesWithRegistryId", async function (req, res) {
    const API_NAME = "getEmployeeProfilesWithRegistryId GET, ";
    logger.info(API_NAME + " called");

    var conn;
    try {
        conn = await pool.getConnection();

        // get employee profile
        const [employees, fields] = await conn.query(
            `
              SELECT
                ep.ID_EMPLOYEE_REGISTRY,
                    CONCAT('[',
                        er.REGISTRY_CODE_PREFIX,
                        er.ID_EMPLOYEE_REGISTRY,
                        er.REGISTRY_CODE_SUFFIX,
                        '] ',
                        ep.DISPLAY_NAME) AS NAME
                FROM
                ${dbHrm}.hrm_employee_profile ep
                INNER JOIN
                ${dbHrm}.hrm_employee_registry er ON ep.ID_EMPLOYEE_REGISTRY = er.ID_EMPLOYEE_REGISTRY
                WHERE
                er.IS_ACTIVE = 1 AND ep.IS_ACTIVE = 1 and ep.ID_EMPLOYEE_REGISTRY  not in (SELECT ID_EMPLOYEE_REGISTRY FROM auth_user where IS_ACTIVE = 1 AND ID_EMPLOYEE_REGISTRY!=NULL)
            `
        );
        logger.info("GOT EMPLOYEE REG LIST SUCCESSFULLY...");
        res.status(200).json({ success: true, employees });
        return res.end();
    }
    catch (err) {
        if (conn !== undefined) {
            conn.release();
        }
        logger.error("CANNOT GET EMPLOYEE REG LIST DUE TO :- ", err);
        var errorData = {
            API_NAME: API_NAME,
            ERROR: err,
            HOST: req.get("Host"),
            URL: req.protocol + "://" + req.get("Host") + req.url,
            USER: "USER", //need to change
            BROWSER: req.rawHeaders[7]
        };
        sendErrorEmail(errorData);
        return res.end();
    } finally {
        conn.release();
    }
});
router.post('/app/login', async function (req, res, next) {
    const API_NAME = 'login post, ';

    logger.info(API_NAME + 'called');

    if (!req.body.username || !req.body.password) {
        logger.info(API_NAME + 'Parameter not found');
        res.status(200).json({ success: false, message: 'Parameters not found' });
        return res.end();
    }
    var conn;
    try {
        conn = await pool.getConnection();

        var promise1 = conn.execute(`
        SELECT
            ID_USER,
            PASSWORD
        FROM
            auth_user
        WHERE
            USERNAME = ?  AND IS_ACTIVE = 1
        ;
        `, [req.body.username]);

        const values = await Promise.all([promise1]);

        if (!values[0][0][0] || !values[0][0][0].PASSWORD) {
            conn.release();
            res.status(200).json({ success: false, message: 'login failed' });
        }

        logger.debug(values[0][0][0].PASSWORD + ', ' + req.body.password);
        bcrypt.compare(String(req.body.password), values[0][0][0].PASSWORD, async (err, isMatch) => {
            if (err) {
                logger.error('bcrypt compare error, ' + err.message);
                return res.sendStatus(500);
            }
            if (isMatch) {
                logger.debug('Passwords matched');
                logger.info('Login success for user ' + req.body.username);
                var employeeRegId = conn.query(`
                        SELECT
                        ur.ROLE_NAME,a.ID_EMPLOYEE_REGISTRY,e.ID_EMPLOYEE_PROFILE, e.IMAGE_PATH, e.DISPLAY_NAME,e.FIRSTNAME,e.MIDDLENAME,e.LASTNAME,e.MOBILE,e.INITIALS
                        FROM
                            auth_user a
                              join
                                ${dbHrm}.hrm_employee_profile e
                              ON
                            e.ID_EMPLOYEE_REGISTRY = a.ID_EMPLOYEE_REGISTRY
                              join
                                auth_role ur
                              ON
                              ur.ID_AUTH_ROLE = a.ID_AUTH_ROLE
                        WHERE
                            a.ID_USER = ${values[0][0][0].ID_USER} and a.IS_ACTIVE=1 and  e.IS_ACTIVE = 1;
                        `);

                var locations = conn.query(`
                SELECT
                u.ID_LOCATION,l.LOCATION_NAME
                FROM
                    auth_user_location u
                    JOIN
                    ${dbSystem}.sys_location l ON u.ID_LOCATION = l.ID_LOCATION
                      WHERE
                      u.ID_USER = ${values[0][0][0].ID_USER} and u.IS_ACTIVE=1;
                `);

                const userPermission = await Promise.all([employeeRegId, locations]);

                var company = conn.query(`
                SELECT
                  a.ID_LOCATION, l.ID_COMPANY,l.LOCATION_NAME, a.ID_USER
                FROM
                auth_user_location a
                          JOIN
                          ${dbSystem}.sys_location l ON a.ID_LOCATION = l.ID_LOCATION
                WHERE
                    a.ID_LOCATION = ${userPermission[1][0][0].ID_LOCATION} and l.IS_ACTIVE=1
                `);
                const userCompany = await Promise.all([company]);

                let locationArray = userPermission[1][0].map(e => e.ID_LOCATION);
                let locationArrayWithName = [];
                userPermission[1][0].map(e =>
                    locationArrayWithName.push({ ID_LOCATION: e.ID_LOCATION, LOCATION_NAME: e.LOCATION_NAME })
                )
                var locations = [];
                for (let k = 0; k < locationArrayWithName.length; k++) {
                    const [stores, field] = await conn.query(`
                        SELECT
                        s.NAME,s.ID_STORE
                        FROM
                        ${dbInv}.inv_store_has_location sl
                                JOIN
                                    ${dbInv}.inv_store s ON sl.ID_STORE = s.ID_STORE

                        WHERE
                            sl.ID_LOCATION = ${locationArrayWithName[k].ID_LOCATION} and s.IS_ACTIVE=1`);

                    locations.push({
                        LOCATION_NAME: locationArrayWithName[k].LOCATION_NAME,
                        ID_LOCATION: locationArrayWithName[k].ID_LOCATION,
                        STORES: stores
                    }
                    )
                }
                var token = jwt.sign({
                    exp: Math.floor(Date.now() / 1000) + (300 * 300 * 24),
                    data: { userid: values[0][0][0].ID_USER }
                }, jwtSecret);

                logger.info('returning token');
                res.status(200).json({ success: true, message: 'login success', token: 'JWT ' + token, userId: values[0][0][0].ID_USER, employee: userPermission[0][0], locations: locationArray, locationsWithStore: locations, ID_COMPANY: userCompany[0][0][0].ID_COMPANY });
                return res.end();
            }
            else {
                logger.info('Passwords not matched. Returning false');
                res.status(200).json({ success: false, message: 'Authentication failed. Wrong password.' });
                return res.end();
            }
        });
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
router.get('/get/user/role', async function (req, res, next) {
    const API_NAME = 'get/user/role get, ';
    logger.info(API_NAME + 'called');

    var conn;

    try {
        conn = await pool.getConnection();
        var sql = "";
        if (req.query.ROLE) {
            var roleId = await getSystemConfigData(req.query.ROLE + "_ROLE_ID");
            sql = `AND user.ID_AUTH_ROLE='${roleId}'`
        }

        var promise1 = conn.execute(`
                SELECT
                user.ID_USER,
                    user.ID_EMPLOYEE_REGISTRY,
                    user.USERNAME,
                    user.IS_ACTIVE,
                    role.ID_AUTH_ROLE,
                    role.ROLE_NAME
                FROM
                auth_user user
                INNER JOIN
                auth_role role ON user.ID_AUTH_ROLE = role.ID_AUTH_ROLE
                where user.IS_ACTIVE=1 ${sql}

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
router.post('/token/generate', async function (req, res, next) {
    const API_NAME = 'Token generate post, ';

    logger.info(API_NAME + 'called');

    if (!req.body.username || !req.body.password) {
        logger.info(API_NAME + 'Parameter not found');
        res.status(200).json({ success: false, message: 'Parameters not found' });
        return res.end();
    }
    var conn;
    try {
        conn = await pool.getConnection();
        var promise1 = conn.execute(`
        SELECT
            ID_USER,
            PASSWORD
        FROM
            auth_user
        WHERE
            USERNAME = ?  AND IS_ACTIVE = 1
        ;
        `, [req.body.username]);

        const values = await Promise.all([promise1]);
        if (!values[0][0][0] || !values[0][0][0].PASSWORD) {
            conn.release();
            res.status(200).json({ success: false, message: 'login failed' });
        }
        logger.debug(values[0][0][0].PASSWORD + ', ' + req.body.password);
        bcrypt.compare(String(req.body.password), values[0][0][0].PASSWORD, async (err, isMatch) => {
            if (err) {
                logger.error('bcrypt compare error, ' + err.message);
                return res.sendStatus(500);
            }
            if (isMatch) {
                logger.debug('Passwords matched');
                logger.info('Login success for user ' + req.body.username);

                var token = jwt.sign({
                    exp: Math.floor(Date.now() / 1000) + (300 * 300 * 24),
                    data: { userid: values[0][0][0].ID_USER }
                }, jwtSecret);

                logger.info('returning token');
                res.status(200).json({ success: true, message: 'Token generate success', token: 'JWT ' + token });
                return res.end();
            }
            else {
                logger.info('Passwords not matched. Returning false');
                res.status(200).json({ success: false, message: 'Authentication failed. Wrong password.' });
                return res.end();
            }
        });
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

module.exports = router;