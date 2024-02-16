const express = require('express');
const cors = require('cors');

global.logger = require('./config/log');

global.crmServer = 'http://localhost:7080';

// const port = process.env.PORT || 7070;
const port = 7077;
const HOST = "localhost";
const service = 'Auth Service'

const userRouter = require('./routes/userRoutes');
const permissionRouter = require('./routes/permissionRoutes');
const specialPermissionRouter = require('./routes/specialPermissionRoutes');
const rolesRouter = require('./routes/roleRoutes'); 
const userSettingsRouter = require('./routes/userSettingsRoutes');
const tokenRouter = require('./routes/tokenRoutes');
const userLocationRouter = require('./routes/userLocationRoutes');
const sunShineUserRouter=require('./routes/sunShineLaundry/userRoutes');
const sunShineRoleRouter=require('./routes/sunShineLaundry/roleRoutes')

const app = express();
app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
    var requestedUrl = req.protocol + '://' + req.get('Host') + req.url;
    let log = service + ' recived request. ' + requestedUrl;
    if (req.query && req.query.user) {
        log = log + ', by user : ' + req.query.user
    }
    logger.info(log);
    next();
});

app.use('/user', userRouter);
app.use('/permission', permissionRouter);
app.use('/specialPermission', specialPermissionRouter);
app.use('/roles', rolesRouter);
app.use('/userSettings', userSettingsRouter);
app.use('/token', tokenRouter);
app.use('/location', userLocationRouter);
app.use('/sunShine/user', sunShineUserRouter);
app.use('/sunShine/role', sunShineRoleRouter);


app.use((req, res, next) => {
    var requestedUrl = req.protocol + '://' + req.get('Host') + req.url;
    logger.error('Inside \'resource not found\' handler , Req resource: ' + requestedUrl);
    return res.status(404).send({ success: false, message: 'Url Not found' });
});

// error handler
app.use((err, req, res, next) => {
    logger.error('Error handler:', err);
    return res.status(500).send({ success: false, message: 'Error' });
});

app.listen(port, HOST, () => {
    logger.info(`Running on http://${HOST}:${port}`);
    logger.info('Server started at ' + port);
})