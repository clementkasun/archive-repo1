var express = require('express');
var router = express.Router();
//const bcrypt = require('bcrypt');
var jwt = require('jsonwebtoken');

const jwtSecret = require('../config/constants')["jwt-secret"];
router.post('/verifyToken', function (req, res, next) {

    logger.info('Inside /verifyToken');
    var token;

    if (req.headers['authorization'] && typeof req.headers['authorization'] != 'undefined') {
        token = req.headers['authorization'].split(' ')[1];
    }
    else {
        logger.info('/verifyToken, Token not found!');
        res.status(200).json({ success: false, msg: 'Token not found' });
        return res.end();
    }

    jwt.verify(token, jwtSecret, (err, decoded) => {
        if (err) {
            logger.error('Error verifiying token. ' + err.message);
            res.status(200).json({ success: false, msg: 'Token not verified' });;
            return res.end();
        }

        logger.info('Token verified. User id:' + decoded.data.userid);
        res.status(200).json({ success: true, msg: 'Token is valid', decoded: decoded });;
        return res.end();
    });
});

module.exports = router;
