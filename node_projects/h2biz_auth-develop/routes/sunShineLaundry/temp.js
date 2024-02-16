var express = require('express');
const bcrypt = require('bcrypt');
const axios = require("axios");
var jwt = require('jsonwebtoken');
var router = express.Router();
const jwtSecret = require('../../config/constants')["jwt-secret"];
var pool = require('../../config/database').pool;
var Request = require('request')
// var { getSystemConfigData } = require("./commonFunction");

//user creation
router.post('/createUser', async function (req, res) {
    const API_NAME = 'Create User Post ,';
    logger.info(API_NAME + 'called');

    if (!req.body.user) {
        logger.info(API_NAME + 'Parameters not found');
        res.status(200).json({ success: false, message: 'user not found' });
        return res.end();
    }
    logger.debug('encrypting user password : ' + JSON.stringify(req.body.user));


    bcrypt.genSalt(10, (err, salt) => {
        bcrypt.hash(req.body.user.PASSWORD, salt, async (err, hash) => {
            if (err) {
                logger.error('bcrypt gen error :' + err.message);
                return res.sendStatus(500);
            }
            req.body.user.PASSWORD = hash;

            logger.debug('Adding user to database : ' + JSON.stringify(req.body.user));
            try {
                conn = await pool.getConnection();

                await conn.query(`START TRANSACTION`);

                const resultCheckExist = await conn.query(`Select * from auth_user where USERNAME='${req.body.user.USERNAME}' `);

                if (resultCheckExist[0].length > 0) {
                    res.status(200).json({ success: false, message: 'User Already Exists' });
                    return res.end();
                }

                const result = await conn.query(`INSERT INTO auth_user SET ? `, req.body.user);
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
        })
    })

})

//get all users
router.get('/getAllUsers', async function (req, res, next) {
    const API_NAME = 'get all users get, ';
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
                    user.USERNAME,
                    user.IS_ACTIVE,
                    role.ID_AUTH_ROLE,
                    role.ROLE_NAME,
                    role.IS_SUPER_ADMIN
                FROM
                auth_user user
                INNER JOIN
                auth_role role
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

//app login
router.post('/app/login/customer', async function (req, res, next) {
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

                const [employeeRegId,fields] =await conn.query(`
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
                const [customerRegId,field] =await conn.query(`
                        SELECT
                        ur.ROLE_NAME,
                        a.ID_CUSTOMER_REGISTRY,
                        e.ID_CUSTOMER_PROFILE,
                        e.PROFILE_IMAGE,
                        e.CUSTOMER_NAME,
                        e.MOBILE
                    FROM
                        auth_user a
                            JOIN
                        ${dbCrm}.crm_customer_profile e ON e.ID_CUSTOMER_REGISTRY = a.ID_CUSTOMER_REGISTRY
                            JOIN
                        auth_role ur ON ur.ID_AUTH_ROLE = a.ID_AUTH_ROLE
                    WHERE
                        a.ID_USER =  ${values[0][0][0].ID_USER} AND a.IS_ACTIVE = 1
                            AND e.IS_ACTIVE = 1`)

                var token = jwt.sign({
                    exp: Math.floor(Date.now() / 1000) + (300 * 300 * 24),
                    data: { userid: values[0][0][0].ID_USER }
                }, jwtSecret);

                let userDetails=[];
                if(employeeRegId.length!=0){
                    userDetails=employeeRegId
                }else{
                    userDetails=customerRegId
                }

                logger.info('returning token');
                res.status(200).json({ success: true, message: 'login success', token: 'JWT ' + token, userId: values[0][0][0].ID_USER,userDetails:userDetails});
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

//customer creation
router.post('/createCustomer', async function (req, res) {
    const API_NAME = 'CUSTOMER CREATE POST';

    logger.info(API_NAME + " CALLED");

    const receivedObj = req.body;
    if (!receivedObj) {
        logger.info(API_NAME + 'Parameters not found');
        res.status(200).json({ success: false, message: 'customer not found' });
        return res.end();
    }
    // try {
    //     conn = await pool.getConnection();

    //     await conn.query(`START TRANSACTION`);

    //     var customerRegistry = {
    //         CREATED_BY:1,
    //       }

    //     const [resultCustomerReg, fields4] = await conn.query(
    //         `INSERT INTO ${dbCrm}.crm_customer_registry SET ?`,
    //         customerRegistry
    //     );
    //     logger.info(
    //         "Successfully saved Customer record id = " + resultCustomerReg.insertId
    //     );

    //     var customer = {
    //         ID_CUSTOMER_REGISTRY: resultCustomerReg.insertId,
    //         CUSTOMER_NAME: receivedObj.FULL_NAME,
    //         MOBILE: receivedObj.PHONE_NUMBER,
    //         EMAIL: receivedObj.EMAIL,
    //         PROFILE_IMAGE: receivedObj.PROFILE_PICTURE
    //     }

    //     const [resultCustomer, fields2] = await conn.query(
    //         `INSERT INTO ${dbCrm}.crm_customer_profile SET ?`,
    //         customer
    //     );

    //     logger.info(
    //         "Successfully saved Customer record id = " + customer.CUSTOMER_CODE
    //     );
    //     console.log('====================================');
    //     console.log(customer);
    //     console.log('====================================');

    //     await conn.query(`COMMIT`);

    //     res.status(200).json({ success: true, message: "User Created Successfully" });
    //     return res.end();
    // } catch (err) {

    //     logger.error(API_NAME + 'error :' + err);
    //     if (conn !== undefined) {
    //         await conn.query(`ROLLBACK`);
    //         conn.release();
    //     }
    //     res.status(200).json({ success: false, message: 'Failed to Create User' });
    //     return res.end();
    // } finally {
    //     conn.release();
    // }
    try {
        let responseData = null;
        await axios
            .post(crmServer + "/customer/saveMobileCustomer", {
                receivedObj: req.body,
            })
            .then(async (res) => {
                responseData = res;
            })
            .catch((err) => {
                logger.error("GET <- CRM SERVER, ERROR : ", err);
            });

        res.status(200).json({ success: true, message: responseData.data });
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
    }

})

//edit customer
router.post('/editCustomer', async function (req, res) {
    const API_NAME = "editCustomer";

    logger.info(API_NAME + " called");

    var conn;
    var receivedObj = req.body
    try {
        conn = await pool.getConnection();
        await conn.query("START TRANSACTION");
        var customer = {
            CUSTOMER_NAME: receivedObj.CUSTOMER_NAME,
            CUSTOMER_NIC: receivedObj.NIC,
            MOBILE: receivedObj.MOBILE,
            EMAIL: receivedObj.EMAIL,
            PROFILE_IMAGE: receivedObj.PROFILE_IMAGE,
        }


        // console.log('==============customer======================');
        // console.log(customer);
        // console.log('====================================');
        const [updatedCustomer, field] = await conn.query(
            `UPDATE ${dbCrm}.crm_customer_profile SET ? WHERE ID_CUSTOMER_PROFILE =? `, [
            customer, receivedObj.ID_CUSTOMER_PROFILE]
        );
        logger.info(
            "Successfully updated Customer record id = " + updatedCustomer
        );
        // console.log('====================================');
        // console.log(updatedCustomer);
        // console.log('====================================');


        // if(receivedObj.USERID){
        if (receivedObj.RESETPASSWORD) {
            var promise1 = conn.execute(`
                SELECT
                    ID_USER,
                            PASSWORD
                FROM
                    auth_user
                WHERE
                    ID_USER = ? AND IS_ACTIVE = 1
                ;
                        `, [receivedObj.USERID]);


            const values = await Promise.all([promise1]);

            if (!values[0][0][0] || !values[0][0][0].PASSWORD) {
                conn.release();
                res.status(200).json({ success: false, message: 'password mismatch' });
            }

            logger.debug(values[0][0][0].PASSWORD);

            bcrypt.compare(String(receivedObj.CURRENTPASSWORD), values[0][0][0].PASSWORD, async (err, isMatch) => {
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
                        bcrypt.hash(receivedObj.NEWPASSWORD, salt, async (err, hash) => {
                            if (err) {
                                console.log('bcrypt gen error: ' + err.message);
                                return res.sendStatus(500);
                            }

                            await conn.execute(` UPDATE auth_user SET PASSWORD =? , USERNAME=? WHERE ID_USER = ? `, [hash, receivedObj.USERNAME, receivedObj.USERID]);
                            logger.info("user updated succesfully")
                        });
                    });
                }
                else {
                    logger.info('Passwords not matched. Returning false');

                }
            });
        } else {
            await conn.execute(` UPDATE auth_user SET  USERNAME=? WHERE ID_USER = ? `, [receivedObj.USERNAME, receivedObj.USERID]);
        }
        // }


        const [customerLedger, fieldsCustomer] = await conn.query(`
          SELECT *
          FROM
            ${dbAcc}.core_acc_ledger_account
          WHERE DOCUMENT_NAME= 'CUSTOMER' AND
                IS_ACTIVE='1' AND
                DOCUMENT_ID='${receivedObj.ID_CUSTOMER_PROFILE_REGISTRY}'`
        );
        if (customerLedger.length > 0) {
            // var NAME = receivedObj.CUSTOMER_NAME + "[" + receivedObj.CUSTOMER_CODE + "]";
            await conn.query(`update ${dbAcc}.core_acc_ledger_account set
                                                        DOCUMENT_ID='${receivedObj.ID_CUSTOMER_PROFILE_REGISTRY}',
                                                        NAME='${receivedObj.CUSTOMER_NAME}',
                                                        DESCRIPTION='${receivedObj.CUSTOMER_NAME}',
                                                        LEDGER_TYPE= "Cash"
                                                          where ID_LEDGER_ACCOUNT='${customerLedger[0].ID_LEDGER_ACCOUNT}'`);

            logger.info("customer ledger updated successfully")
        } else {
            var ref_no = "";
            const [ledgerAccountSave, fieldsSave] = await conn.query(`SELECT LEDGER_REF_NO FROM ${dbAcc}.core_acc_ledger_account WHERE  ID_ACCOUNT_TYPE = 1 ORDER BY ID_LEDGER_ACCOUNT DESC LIMIT 1 FOR UPDATE`);
            if (ledgerAccountSave.length == 0) {
                ref_no = ref_no + "00" + 1
            } else {
                ref_no = Number(ledgerAccountSave[0].LEDGER_REF_NO) + Number(1);
            }
            var ledgerObj = {
                ACCOUNT_TYPE: "ASSET",
                ID_ACCOUNT_TYPE: 1,
                ID_ACCOUNT_CATEGORY: 1,
                ACCOUNT_CATEGORY_NAME: "CURRENT ASSETS",
                ID_MAIN_ACCOUNT: null,
                MAIN_ACCOUNT_REF_NO: "101001",
                MAIN_ACCOUNT_NAME: "TRADE DEBTORS C/A",
                LEDGER_CODE: "",
                LEDGER_REF_NO: ref_no,
                LOCATION_ID: 1,
                DESCRIPTION: "",
                NAME: receivedObj.CUSTOMER_NAME + "[" + receivedObj.CUSTOMER_CODE + "]",
                DOCUMENT_NAME: "CUSTOMER",
                DOCUMENT_ID: receivedObj.ID_CUSTOMER_PROFILE_REGISTRY,
                IS_ACTIVE: 1,
                STATUS: 1
            };
            const [ledgerAccountSave2, fieldsSave2] = await conn.query(`insert into ${dbAcc}.core_acc_ledger_account set ?`, ledgerObj);
            logger.info("customer ledger created successfully")

        }
        await conn.query("COMMIT");
        res.status(200).json({ success: true, message: 'Customer Updated successfully' });
        return res.end();
    } catch (err) {
        logger.error(API_NAME + 'error :' + err);
        if (conn !== undefined) {
            conn.release();
        }
        res.status(200).json({ success: false, message: 'Query Error' });
        return res.end();
    } finally { conn.release(); }

})

//get All Customer
router.get('/getAllCustomer', async function (req, res) {

    const API_NAME = "getAllCustomer";

    logger.info(API_NAME + " called");

    var conn;
    try {
        conn = await pool.getConnection();
        conn.query("START TRANSACTION");

        const [customer, field] = await conn.query(`SELECT * FROM ${dbCrm}.crm_customer_profile  WHERE IS_ACTIVE=1`);

        res.status(200).json({ success: true, customers: customer });
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
})

//search customer
router.get('/customerSearch', async function (req, res) {
    const API_NAME = "customerSearch";
    logger.info(API_NAME + " called");

    var conn;
    var obj = req.query;
    try {
        conn = await pool.getConnection();
        conn.query("START TRANSACTION");

        var nic = "";
        var mobile = "";
        var registerNumber = "";

        if (obj.NIC) {
            nic = `AND CUSTOMER_NIC='${obj.NIC}'`
        }
        if (obj.MOBILE) {
            mobile = `AND MOBILE='${obj.MOBILE}'`
        }
        if (obj.REGISTERNUMBER) {
            registerNumber = `AND CUSTOMER_CODE='${obj.REGISTERNUMBER}'`
        }
        const [customer, field] = await conn.query(`SELECT * FROM ${dbCrm}.crm_customer_profile  WHERE  IS_ACTIVE=1 ${nic} ${mobile} ${registerNumber}`);

        res.status(200).json({ success: true, customers: customer });
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
})

//forgot password
router.post('/changePassword', async function (req, res) {
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

})

router.post('/smsotp', async function (req, res) {
    const API_NAME = "smsotp ";
    logger.info(API_NAME + "called");

    var conn;
    try {

        conn = await pool.getConnection();
        await conn.query("START TRANSACTION")
        var otpcode = Math.floor(1000 + Math.random() * 9000);
        console.log(otpcode);
        var message = `Dear customer!.Your OTP code is ${otpcode}`
        var mobile = req.body.phoneNumber
        Request.get("https://e-sms.dialog.lk/api/v1/message-via-url/create/url-campaign?esmsqk=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6OTM1MiwiaWF0IjoxNjY5Mjc3NDM3LCJleHAiOjQ3OTM0Nzk4Mzd9.oFeiN2vwrX41GLw4UuC5jz_TpYR9QG2HDKLMQ42mP-s&list=" + mobile + "&message=" + message,
            (error, response, body) => {
                if (error) {
                    console.log("SMS Send Failed");
                } else {
                    console.log("SMS Send Success");
                }
            });

        res.status(200).json({
            success: true,
            message: "otp send succefully",
        });
        return res.end();
    } catch (err) {
        await conn.query("ROLLBACK");
        if (undefined != conn) {
            await conn.query("ROLLBACK");
        }
        logger.error("SMS OTP GENERATION FAIL DUE TO :- ", err);
    } finally {
        conn.release();
    }

})

router.post("/otpVerification",async function(req,res){
    const API_NAME = "smsotp ";
    logger.info(API_NAME + "called");

    var conn;
    try {

        conn = await pool.getConnection();
        await conn.query("START TRANSACTION")

        res.status(200).json({
            success: true,
            message: "Success",
        });
        return res.end();
    } catch (err) {
        await conn.query("ROLLBACK");
        if (undefined != conn) {
            await conn.query("ROLLBACK");
        }
        logger.error("INVOICE SAVE TRANSACTION FAIL DUE TO :- ", err);
    } finally {
        conn.release();
    }

})
module.exports = router;