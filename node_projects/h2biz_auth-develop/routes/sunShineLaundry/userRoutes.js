var express = require('express');
const bcrypt = require('bcrypt');
const axios = require("axios");
const moment = require("moment")
var jwt = require('jsonwebtoken');
var router = express.Router();
const jwtSecret = require('../../config/constants')["jwt-secret"];
var pool = require('../../config/database').pool;
var Request = require('request');
const { SMS_ACCESS_TOKEN } = require('../../config/constants');


//common app login
router.post('/app/login', async function (req, res) {
    const API_NAME = 'login post app login , ';
    logger.info(API_NAME + 'called');
    var recivedObj = req.body;
    if (!recivedObj) {
        logger.info(API_NAME + 'Parameter not found');
        res.status(200).json({ success: false, message: 'Parameters not found' });
        return res.end();
    }
    var conn;
    try {
        conn = await pool.getConnection();
        let role_id = ""
        if (recivedObj.ROLE === "CUSTOMER") {
            role_id = `AND ID_AUTH_ROLE=2`
        } else if (recivedObj.ROLE === "RIDER") {
            role_id = `AND ID_AUTH_ROLE=3`
        } else if (recivedObj.ROLE === "QC") {
            role_id = `AND ID_AUTH_ROLE=4`
        } else if (recivedObj.ROLE === "SUPERVISOR") {
            role_id = `AND ID_AUTH_ROLE=5`
        } else if (recivedObj.ROLE === "DRIVER") {
            role_id = `AND ID_AUTH_ROLE=8`
        } else if (recivedObj.ROLE === "FACTORY") {
            role_id = `AND ID_AUTH_ROLE=7`
        } else {
            if (recivedObj.ROLE === "PRE_CHECKER") {
                role_id = `AND ID_AUTH_ROLE=6`
            }
        }
        const [user] = await conn.query(`SELECT * FROM auth_user  WHERE  IS_ACTIVE=1 AND USERNAME='${recivedObj.USERNAME}' ${role_id} `);
        let userArray = [];
        if (user.length > 0) {
            userArray.push(user[0])
        } else {
            if (recivedObj.ROLE === 'CUSTOMER') {
                // const [customer, field] = await conn.query(`SELECT * FROM ${dbCrm}.crm_customer_profile  WHERE  IS_ACTIVE=1 AND CUSTOMER_NIC='${recivedObj.USERNAME}' OR MOBILE='${recivedObj.USERNAME}'`);
                const [customer, field] = await conn.query(`SELECT * FROM ${dbCrm}.crm_customer_profile  WHERE  IS_ACTIVE=1 AND CUSTOMER_NIC='${recivedObj.USERNAME}' `);
                userArray.push(customer[0])
            } else {
                // const [employee, field] = await conn.query(`SELECT * FROM ${dbHrm}.hrm_employee_profile  WHERE  IS_ACTIVE=1 AND NIC_NO=${recivedObj.USERNAME} OR PERMANENT_ADDRESS_MOBILE=${recivedObj.USERNAME}`);
                const [employee, field] = await conn.query(`SELECT * FROM ${dbHrm}.hrm_employee_profile  WHERE  IS_ACTIVE=1 AND NIC_NO=${recivedObj.USERNAME} `);
                userArray.push(employee[0])
            }
        }



        if (userArray.length > 0) {
            var promise1;
            if (userArray[0] === undefined) {
                res.status(200).json({ success: false, message: 'Login failed due to no such user' });
                return res.end();
            }

            if (recivedObj.ROLE === 'CUSTOMER') {
                promise1 = conn.execute(`
                SELECT
                    ID_USER,
                    PASSWORD
                FROM
                    auth_user
                WHERE
                    ID_USER = ${userArray[0].ID_USER}  AND IS_ACTIVE = 1 ${role_id}
                ;
                `);
            } else {

                promise1 = conn.execute(`
                     SELECT
                         ID_USER,
                         PASSWORD
                    FROM
                         auth_user
                     WHERE
                     ID_EMPLOYEE_REGISTRY = ${userArray[0].ID_EMPLOYEE_REGISTRY} AND IS_ACTIVE = 1 ${role_id}
                     ;
                     `);
            }
            const values = await Promise.all([promise1]);
            if (!values[0][0][0] || !values[0][0][0].PASSWORD) {
                conn.release();
                res.status(200).json({ success: false, message: 'login failed' });
            }
            logger.debug(values[0][0][0].PASSWORD + ', ' + req.body.PASSWORD);
            bcrypt.compare(String(req.body.PASSWORD), values[0][0][0].PASSWORD, async (err, isMatch) => {
                if (err) {
                    logger.error('bcrypt compare error, ' + err.message);
                    return res.sendStatus(500);
                }
                if (isMatch) {
                    logger.debug('Passwords matched');
                    logger.info('Login success for user ' + values[0][0][0].USERNAME);
                    let userdetail = []
                    if (recivedObj.ROLE === 'CUSTOMER') {
                        const [detail] = await conn.query(`
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
                        userdetail.push(detail[0])
                    } else {
                        const [detail] = await conn.query(`
                        SELECT
                        (SELECT ID_LOCATION FROM auth_user_location WHERE ID_USER= a.ID_USER LIMIT 1) AS ID_LOCATION ,
                        ur.ROLE_NAME,a.ID_EMPLOYEE_REGISTRY,e.ID_EMPLOYEE_PROFILE, e.IMAGE_PATH, e.DISPLAY_NAME,e.FIRSTNAME,e.MIDDLENAME,e.LASTNAME,e.CURRENT_ADDRESS_MOBILE,e.CURRENT_ADDRESS_EMAIL,e.IMAGE_PATH,e.NIC_NO,e.INITIALS
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
                        userdetail.push(detail[0])
                    }
                    if (recivedObj.ONESIGNAL_SUBSCRIPTION_ID)
                        await conn.query(`update auth_user set ONESIGNAL_SUBSCRIPTION_ID='${recivedObj.ONESIGNAL_SUBSCRIPTION_ID}' where ID_USER='${values[0][0][0].ID_USER}'`);

                    var token = jwt.sign({
                        exp: Math.floor(Date.now() / 1000) + (300 * 300 * 24),
                        data: { userid: values[0][0][0].ID_USER }
                    }, jwtSecret);
                    logger.info('returning token');
                    res.status(200).json({ success: true, message: 'login success', token: token, userId: values[0][0][0].ID_USER, userDetails: userdetail });
                    return res.end();
                }
                else {
                    logger.info('Passwords not matched. Returning false');
                    res.status(200).json({ success: false, message: 'Authentication failed. Wrong password.' });
                    return res.end();
                }
            });
        } else {
            logger.info("no customer exist for details")
            res.status(200).json({ success: false, message: 'login failed due to no customer' });
            return res.end();
        }
    }
    catch (err) {
        logger.error(API_NAME + 'error :' + err);
        if (conn !== undefined) {
            conn.release();
        }
        res.status(200).json({ success: false, message: 'Login Failed', error: err });
        return res.end();
    } finally {
        conn.release()
    }
})
//sms otp
router.post('/smsotp', async function (req, res) {
    const API_NAME = "smsotp ";
    logger.info(API_NAME + "called");

    var conn;
    var recivedObj = req.body
    try {
        conn = await pool.getConnection();
        await conn.query("START TRANSACTION")
        var otpcode = Math.floor(1000 + Math.random() * 9000);
        console.log(otpcode);
        var message = `Dear customer!.Your OTP code is ${otpcode}`
        var mobile = req.body.PHONENUMBER;

        // let userArray = [];
        // if (recivedObj.ROLE === 'CUSTOMER') {
        //     const [customer, field] = await conn.query(`SELECT * FROM ${dbCrm}.crm_customer_profile  WHERE  IS_ACTIVE=1 AND  MOBILE='${mobile}'`);
        //     if (customer.length > 0) {
        //         userArray.push(customer[0])
        //     }

        // } else {
        //     const [employee, field] = await conn.query(`SELECT * FROM ${dbHrm}.hrm_employee_profile  WHERE  IS_ACTIVE=1 AND  PERMANENT_ADDRESS_MOBILE=${mobile}`);
        //     if (employee.length > 0) {
        //         userArray.push(customer[0])
        //     }
        //     userArray.push(employee[0])
        // }
        const [user] = await conn.query(`SELECT * FROM auth_user  WHERE  IS_ACTIVE=1 AND USERNAME=${mobile}  `);
        if (user.length > 0) {
            // var promise1;
            // if (recivedObj.ROLE === 'CUSTOMER') {
            //     promise1 = conn.execute(`
            //     SELECT
            //         ID_USER,
            //         PASSWORD
            //     FROM
            //         auth_user
            //     WHERE
            //         ID_USER = ${userArray[0].ID_USER}  AND IS_ACTIVE = 1
            //     ;
            //     `);
            // } else {

            //     promise1 = conn.execute(`
            //          SELECT
            //              ID_USER,
            //              PASSWORD
            //         FROM
            //              auth_user
            //          WHERE
            //          ID_EMPLOYEE_REGISTRY = ${userArray[0].ID_EMPLOYEE_REGISTRY} AND IS_ACTIVE = 1
            //          ;
            //          `);
            // }
            // const values = await Promise.all([promise1]);
            const [otpresult, feild] = await conn.query(`SELECT * FROM auth_user_otp WHERE IS_ACTIVE=1 AND USER_MOBILE=?`, [req.body.PHONENUMBER])
            if (otpresult.length > 0) {
                await conn.query(`DELETE FROM auth_user_otp WHERE USER_MOBILE=${req.body.PHONENUMBER}`)
                logger.info('old otp deleted')
            }
            let todaytime = new Date()
            let obj = {
                OTP_NO: otpcode,
                USER_MOBILE: req.body.PHONENUMBER,
                CREATED_TIME: todaytime,
                IS_ACTIVE: 1
            }
            const [result, feild1] = await conn.query(
                "INSERT INTO auth_user_otp SET ?",
                obj);
            logger.info('otp code insert successfull insertID :- ' + result.insertId)
            const url = "https://bsms.hutch.lk/api/sendsms";
            const postData = {
                "campaignName": "Sunshine Services (Pvt) Ltd",
                "mask": "Sunshine",
                "numbers":mobile ,
                "content": message
            }
            const headers = {
                'Content-Type': 'application/json',
                'Accept': '/',
                'X-API-VERSION': 'v1',
                'Authorization': 'Bearer ' + SMS_ACCESS_TOKEN,
            };
            const option = {
                url: url,
                method: 'POST',
                json: true,
                headers: headers,
                body: postData
            }
            Request(option,
                (error, response, body) => {
                    if (error) {
                        console.log("SMS Send Failed");
                        res.status(200).json({
                            success: true,
                            message: "otp send Failed",
                            userId: user[0].ID_USER

                        });
                        return res.end();
                    } else {
                        console.log(response.statusCode);
                        if (response.statusCode === 406) {
                            console.log("SMS Send Success", response.statusCode,response);
                            res.status(200).json({
                                success: true,
                                message: "otp send succefully",
                                userId: user[0].ID_USER

                            });
                            return res.end();
                        } else {
                            console.log("SMS Send Failed");
                            res.status(200).json({
                                success: true,
                                message: "otp send Failed",
                                userId: user[0].ID_USER

                            });
                            return res.end();
                        }
                    }
                });
            // await conn.query("COMMIT");
            // res.status(200).json({
            //     success: true,
            //     message: "otp send succefully",
            //     userId: user[0].ID_USER

            // });
            // return res.end();
        } else {
            // await conn.query("COMMIT");
            res.status(200).json({
                success: true,
                message: "no such user",
            });
            return res.end();
        }

    } catch (err) {
        await conn.query("ROLLBACK");
        if (undefined != conn) {
            await conn.query("ROLLBACK");
        }
        logger.error("SMS OTP GENERATION FAIL DUE TO :- ", err);
    } finally {
        await conn.query("COMMIT");
        conn.release();
    }

})

//otp verifaction
router.post("/otpVerification", async function (req, res) {
    const API_NAME = "otpVerification ";
    logger.info(API_NAME + "called");

    var conn;

    try {

        if (!req.body.USER_MOBILE || !req.body.OTP_NO) {
            res.status(200).json({
                success: false,
                message: "OTP Verification failed.PARAMATERES EMPTY..",
            });
            return res.end();
        }
        conn = await pool.getConnection();
        // await conn.query("START TRANSACTION")

        const [result] = await conn.query(`SELECT * FROM auth_user_otp WHERE IS_ACTIVE=1 AND USER_MOBILE=?`, req.body.USER_MOBILE);
        if (result.length > 0) {
            if (result[0].OTP_NO === Number(req.body.OTP_NO)) {
                let nowTime = new Date();
                let addedTime = new Date(result[0].CREATED_TIME);
                let timeDifference = nowTime - addedTime;
                let minutesDifference = Math.floor(timeDifference / (1000 * 60));
                if (minutesDifference < 20) {
                    await conn.query(`DELETE FROM auth_user_otp WHERE ID_OTP='${result[0].ID_OTP}'`);
                    res.status(200).json({
                        success: true,
                        message: "OTP Verification success..",
                    });
                    return res.end();
                } else {
                    res.status(200).json({
                        success: false,
                        message: "OTP Verification timeout.please resend otp",
                    });
                    return res.end();
                }
            } else {
                res.status(200).json({
                    success: false,
                    message: "OTP Verification failed.OTP NOT MATCHED..",
                });
                return res.end();
            }

        } else {
            res.status(200).json({
                success: false,
                message: "OTP Verification failed.PLEASE RESEND OTP..",
            });
            return res.end();
        }
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

//forgot password change
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

//user notification
router.get('/notification', async function (req, res) {


    const API_NAME = "userNotification ";

    logger.info(API_NAME + " called");
    var conn;
    try {
        conn = await pool.getConnection();

        const [notication, feild] = await conn.query(`SELECT * FROM auth_user_notification WHERE ID_USER=?`, [req.query.id])


        var dateToday = new Date();
        var result = [{
            "todayNotification": [],
        },
        {
            "yesterdayNotifications": [],
        }, {

            "lastWeekNotifications": [],
        },

        ];

        var today = moment(dateToday).format("DD");
        for (let i = 0; i < notication.length; i++) {
            let date = moment(notication[i].TIME).format("DD");
            let yesterday = today - 1
            if (today == date) {
                console.log('today')
                // todayNotications.push(notication[i])
                result[0].todayNotification.push(notication[i])
            } else if (yesterday == date) {
                console.log('yestreday')
                // yesterdayNotifications.push(notication[i])
                result[1].yesterdayNotifications.push(notication[i])
            } else {
                console.log('last week')
                // lastWeekNotifications.push(notication[i])
                result[2].lastWeekNotifications.push(notication[i])
            }




        }

        res.status(200).json({ success: true, notifications: result });
        return res.end();
    }
    catch (err) {

        logger.error(API_NAME + 'error :' + err);
        if (conn !== undefined) {
            conn.release();
        }
        res.status(200).json({ success: false, message: ' Error' });
        return res.end();
    } finally { conn.release(); }
})

router.post('/forgotPassword', async function (req, res) {
    const API_NAME = "forgotPassword";
    logger.info(API_NAME + " called");
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
                `, [req.body.USER_ID]);



        const values = await Promise.all([promise1]);
        if (!values[0][0][0] || !values[0][0][0].PASSWORD) {
            conn.release();
            res.status(200).json({ success: false, message: 'password mismatch' });
        }

        logger.debug(values[0][0][0].PASSWORD);

        bcrypt.genSalt(10, (err, salt) => {
            if (err) {
                logger.error(API_NAME + ' Gen Salt Error');
                return res.sendStatus(500);
            }
            bcrypt.hash(req.body.NEWPASSWORD, salt, async (err, hash) => {
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
                `, [hash, req.body.USER_ID]);
                res.status(200).json({ success: true, message: 'password changed' });
                return res.end();
            });
        });

    }
    catch (err) {
        logger.error(API_NAME + 'error  :' + err);
        if (conn !== undefined) {
            conn.release();
        }
        res.status(200).json({ success: false, message: ' Error' });
        return res.end();
    } finally { conn.release(); }
})

module.exports = router;
